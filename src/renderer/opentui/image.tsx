// image renderer component — Kitty virtual placements, half-block fallback, text fallback.
// first stateful renderer component in the codebase (uses hooks).

import { resolveRenderLib } from '@opentui/core'
import { useRenderer, useTerminalDimensions } from '@opentui/react'
import { writeSync } from 'node:fs'
import { memo, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

import type { LoadedImage } from '../../image/types.ts'
import type { ImageNode } from '../../ir/types.ts'

import { decodeImage } from '../../image/decoder.ts'
import { renderHalfBlock } from '../../image/halfblock.ts'
import { buildCleanupCommand, buildTransmitChunks, buildVirtualPlacement, generateImageId } from '../../image/kitty.ts'
import { loadImageFile } from '../../image/loader.ts'
import { ImageContext } from './image-context.tsx'

type ImageState = 'idle' | 'loading' | 'loaded' | 'error'

// track active image IDs for process exit cleanup
const activeImageIds = new Set<number>()
let exitHandlerRegistered = false

function registerExitHandler(): void {
	if (exitHandlerRegistered) return
	exitHandlerRegistered = true
	process.on('exit', () => {
		if (activeImageIds.size === 0) return
		for (const id of activeImageIds) {
			writeSync(1, buildCleanupCommand(id))
		}
	})
}

// inflight promise map for request coalescing
const inflightDecodes = new Map<string, Promise<LoadedImage | null>>()

function getCacheKey(absolutePath: string, mtime: number, targetWidth: number): string {
	return `${absolutePath}:${String(mtime)}:${String(targetWidth)}`
}

// -- half-block memoized output --

interface HalfBlockRowsProps {
	readonly image: LoadedImage
	readonly bgColor: string
}

const HalfBlockRows = memo(function HalfBlockRows({ image, bgColor }: HalfBlockRowsProps) {
	const grid = renderHalfBlock(image, bgColor)
	return (
		<box style={{ flexDirection: 'column' }}>
			{grid.map((row, rowIdx) => (
				<text key={`hb-${String(rowIdx)}`}>
					{row.map((cell, colIdx) => {
						const props: Record<string, unknown> = {}
						if (cell.bg.length > 0) props['bg'] = cell.bg
						if (cell.fg.length > 0) props['fg'] = cell.fg
						return (
							<span key={`hb-${String(rowIdx)}-${String(colIdx)}`} {...props}>
								{cell.char}
							</span>
						)
					})}
				</text>
			))}
		</box>
	)
})

// -- kitty text fallback for placeholder rendering --

function KittyPlaceholder({ rows, cols }: { readonly rows: number; readonly cols: number }): ReactNode {
	// render invisible placeholder — the actual text is the U+10EEEE characters
	// but we use a box for layout sizing; Kitty replaces the cell content
	return <box style={{ height: rows, width: cols }} />
}

// -- main image block component --

function ImageBlock({ node, nodeKey }: { readonly node: ImageNode; readonly nodeKey: string }): ReactNode {
	const ctx = useContext(ImageContext)
	const renderer = useRenderer()
	const dims = useTerminalDimensions()
	const [state, setState] = useState<ImageState>('idle')
	const [image, setImage] = useState<LoadedImage | null>(null)
	const [errorMsg, setErrorMsg] = useState('')
	const loadIdRef = useRef(0)
	const kittyIdRef = useRef<number | null>(null)

	// no context = browser preview or missing provider -> text fallback
	if (ctx == null || node.url == null) {
		return renderTextFallback(node, nodeKey)
	}

	const { basePath, capabilities, bgColor } = ctx
	const protocol = capabilities.protocol
	const terminalWidth = dims.width

	useEffect(() => {
		const thisLoadId = ++loadIdRef.current
		const isStale = () => loadIdRef.current !== thisLoadId

		setState('loading')
		setImage(null)
		setErrorMsg('')

		void (async () => {
			// load from disk
			const loadResult = await loadImageFile(node.url!, basePath)
			if (isStale()) return
			if (!loadResult.ok) {
				setState('error')
				setErrorMsg(loadResult.error === 'file not found' ? 'not found' : loadResult.error)
				return
			}

			const { bytes, absolutePath, mtime } = loadResult.value
			const purpose = protocol === 'kitty-virtual' ? 'kitty' : 'halfblock'
			const targetCols = Math.max(1, terminalWidth - 2) // leave margin
			const cacheKey = getCacheKey(absolutePath, mtime, targetCols)

			// check inflight map
			let decodePromise = inflightDecodes.get(cacheKey)
			if (decodePromise == null) {
				decodePromise = decodeImage(
					bytes,
					targetCols,
					capabilities.cellPixelWidth,
					capabilities.cellPixelHeight,
					purpose,
					node.url!,
				).then((r) => {
					inflightDecodes.delete(cacheKey)
					return r.ok ? r.value : null
				})
				inflightDecodes.set(cacheKey, decodePromise)
			}

			const decoded = await decodePromise
			if (isStale()) return

			if (decoded == null) {
				setState('error')
				return
			}

			setImage(decoded)
			setState('loaded')

			// kitty: transmit + place
			if (protocol === 'kitty-virtual' && renderer != null) {
				transmitKittyImage(decoded, renderer)
			}
		})()

		return () => {
			// cleanup kitty image on unmount/URL change
			cleanupKittyImage(renderer)
		}
	}, [node.url, basePath, terminalWidth, protocol])

	const fgProps: Record<string, unknown> = {}
	if (node.style.fg != null) fgProps['fg'] = node.style.fg

	if (state === 'loading') {
		return (
			<text key={nodeKey}>
				<span {...fgProps}>{`[loading: ${node.alt}]`}</span>
			</text>
		)
	}

	if (state === 'error') {
		const suffix = errorMsg.length > 0 ? ` (${errorMsg})` : ''
		return (
			<text key={nodeKey}>
				<span {...fgProps}>{`[image: ${node.alt}${suffix}]`}</span>
			</text>
		)
	}

	if (state === 'loaded' && image != null) {
		if (protocol === 'kitty-virtual') {
			return <KittyPlaceholder key={nodeKey} rows={image.terminalRows} cols={image.terminalCols} />
		}

		if (protocol === 'halfblock') {
			return <HalfBlockRows key={nodeKey} image={image} bgColor={bgColor} />
		}
	}

	return renderTextFallback(node, nodeKey)

	// -- helpers scoped to component for access to refs --

	function transmitKittyImage(img: LoadedImage, rend: NonNullable<typeof renderer>): void {
		const id = generateImageId(img.source, process.pid)
		kittyIdRef.current = id
		activeImageIds.add(id)
		registerExitHandler()

		// encode image as PNG for transmission via sharp
		void (async () => {
			try {
				const sharp = (await import('sharp')).default
				const pngBuf = await sharp(img.rgba, {
					raw: { width: img.width, height: img.height, channels: 4 },
				})
					.png()
					.toBuffer()

				const transmitCmd = buildTransmitChunks(id, new Uint8Array(pngBuf))
				const placeCmd = buildVirtualPlacement(id, img.terminalCols, img.terminalRows)

				const lib = resolveRenderLib()
				lib.writeOut(rend.rendererPtr, transmitCmd + placeCmd)
			} catch {
				// transmission failed — image stays as layout box
			}
		})()
	}

	function cleanupKittyImage(rend: typeof renderer): void {
		const id = kittyIdRef.current
		if (id == null) return
		kittyIdRef.current = null
		activeImageIds.delete(id)

		if (rend != null) {
			try {
				const lib = resolveRenderLib()
				lib.writeOut(rend.rendererPtr, buildCleanupCommand(id))
			} catch {
				// ignore cleanup errors
			}
		}
	}
}

function renderTextFallback(node: ImageNode, key: string): ReactNode {
	const props: Record<string, unknown> = {}
	if (node.style.fg != null) props['fg'] = node.style.fg
	return (
		<text key={key}>
			<span {...props}>{`[image: ${node.alt}]`}</span>
		</text>
	)
}

// public dispatch wrapper for consistency with other renderers
export function renderImageBlock(node: ImageNode, key: string): ReactNode {
	return <ImageBlock node={node} nodeKey={key} key={key} />
}
