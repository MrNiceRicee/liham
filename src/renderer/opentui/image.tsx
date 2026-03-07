// image renderer component — Kitty virtual placements, half-block fallback, text fallback.
// thin rendering shell — loading logic lives in use-image-loader.ts.

import { resolveRenderLib } from '@opentui/core'
import { useRenderer } from '@opentui/react'
import { writeSync } from 'node:fs'
import { memo, useContext, useEffect, useRef, type ReactNode } from 'react'

import type { LoadedImage } from '../../image/types.ts'
import type { ImageNode } from '../../ir/types.ts'

import { renderHalfBlockMerged, type MergedSpan } from '../../image/halfblock.ts'
import { buildCleanupCommand, buildTransmitChunks, buildVirtualPlacement, generateImageId } from '../../image/kitty.ts'
import { ImageContext } from './image-context.tsx'
import { useImageLoader } from './use-image-loader.ts'

// re-export for consumers that import from here
export { clearImageCache } from './use-image-loader.ts'

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

// -- half-block memoized output --

interface HalfBlockRowsProps {
	readonly rows: MergedSpan[][]
	readonly width: number
}

const HalfBlockRows = memo(function HalfBlockRows({ rows, width }: HalfBlockRowsProps) {
	return (
		<box style={{ height: rows.length, width }}>
			{rows.map((spans, rowIdx) => (
				<text key={`hb-${String(rowIdx)}`}>
					{spans.map((s, sIdx) => {
						const props: Record<string, unknown> = {}
						if (s.bg.length > 0) props['bg'] = s.bg
						if (s.fg.length > 0) props['fg'] = s.fg
						return (
							<span key={`s-${String(rowIdx)}-${String(sIdx)}`} {...props}>
								{s.text}
							</span>
						)
					})}
				</text>
			))}
		</box>
	)
}, (prev, next) => prev.rows === next.rows)

// -- kitty text fallback for placeholder rendering --

function KittyPlaceholder({ rows, cols }: { readonly rows: number; readonly cols: number }): ReactNode {
	return <box style={{ height: rows, width: cols }} />
}

// -- main image block component --

function ImageBlock({ node, nodeKey }: { readonly node: ImageNode; readonly nodeKey: string }): ReactNode {
	const ctx = useContext(ImageContext)
	const renderer = useRenderer()
	const { state, image, errorMsg } = useImageLoader(node.url, ctx)
	const kittyIdRef = useRef<number | null>(null)

	// kitty transmit + cleanup lifecycle
	useEffect(() => {
		if (ctx == null || image == null) return
		if (ctx.capabilities.protocol !== 'kitty-virtual') return
		if (renderer == null) return

		transmitKittyImage(image, renderer)

		return () => { cleanupKittyImage(renderer) }
	}, [image, ctx?.capabilities.protocol])

	// conditional rendering AFTER all hooks
	if (ctx == null || node.url == null || ctx.capabilities.protocol === 'text') {
		return renderTextFallback(node, nodeKey)
	}

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
		if (ctx.capabilities.protocol === 'kitty-virtual') {
			return <KittyPlaceholder key={nodeKey} rows={image.terminalRows} cols={image.terminalCols} />
		}

		if (ctx.capabilities.protocol === 'halfblock') {
			const rows = renderHalfBlockMerged(image, ctx.bgColor)
			return <HalfBlockRows key={nodeKey} rows={rows} width={image.terminalCols} />
		}
	}

	return renderTextFallback(node, nodeKey)

	// -- helpers scoped to component for access to refs --

	function transmitKittyImage(img: LoadedImage, rend: NonNullable<typeof renderer>): void {
		const id = generateImageId()
		kittyIdRef.current = id
		activeImageIds.add(id)
		registerExitHandler()

		void (async () => {
			try {
				const sharp = (await import('sharp')).default
				const pngBuf = await sharp(img.rgba, {
					raw: { width: img.width, height: img.height, channels: 4 },
				})
					.png()
					.toBuffer()

				// stale: cleanup ran or a new transmit started while encoding
				if (kittyIdRef.current !== id) return

				const transmitCmd = buildTransmitChunks(id, new Uint8Array(pngBuf))
				const placeCmd = buildVirtualPlacement(id, img.terminalCols, img.terminalRows)

				const lib = resolveRenderLib()
				lib.writeOut(rend.rendererPtr, transmitCmd + placeCmd)
			} catch {
				// transmit failed — image just won't display
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
