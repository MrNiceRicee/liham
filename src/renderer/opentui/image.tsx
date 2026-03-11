// image renderer component — Kitty virtual placements, half-block fallback, text fallback.
// thin rendering shell — loading logic lives in use-image-loader.ts.

import { type BoxRenderable, resolveRenderLib } from '@opentui/core'
import { useRenderer } from '@opentui/react'
import { type ReactNode, useContext, useEffect, useRef } from 'react'

import type { ImageNode } from '../../ir/types.ts'
import { renderHalfBlockMerged } from '../../media/halfblock.ts'
import {
	buildCleanupCommand,
	buildTransmitChunks,
	buildVirtualPlacement,
	generateImageId,
} from '../../media/kitty.ts'
import type { LoadedImage } from '../../media/types.ts'
import {
	HalfBlockRows,
	activeImageIds,
	mediaBasename,
	registerKittyExitHandler,
	useScrollIntoView,
} from './halfblock-rendering.tsx'
import { ImageContext, type ImageContextValue } from './image-context.tsx'
import { MediaFocusContext } from './media-focus-context.tsx'
import { useImageLoader, useViewportVisibility } from './use-image-loader.ts'

// re-export for consumers that import from here
export { clearImageCache } from './use-image-loader.ts'

// -- kitty text fallback for placeholder rendering --

function KittyPlaceholder({
	rows,
	cols,
}: {
	readonly rows: number
	readonly cols: number
}): ReactNode {
	return <box style={{ height: rows, width: cols }} />
}

// -- main image block component --

function ImageBlock({
	node,
	nodeKey,
	mediaIndex,
}: {
	readonly node: ImageNode
	readonly nodeKey: string
	readonly mediaIndex?: number | undefined
}): ReactNode {
	const ctx = useContext(ImageContext)
	const focusCtx = useContext(MediaFocusContext)
	const renderer = useRenderer()
	const boxRef = useRef<BoxRenderable | null>(null)
	const isVisible = useViewportVisibility(boxRef, ctx?.scrollRef)
	const { state, image, errorMsg } = useImageLoader(node.url, ctx ?? null, isVisible)
	const kittyIdRef = useRef<number | null>(null)

	const isFocused = mediaIndex != null && focusCtx?.focusedMediaIndex === mediaIndex
	useScrollIntoView(boxRef, ctx?.scrollRef, isFocused)

	// click handler for opening modal
	const handleMouseDown = () => {
		if (mediaIndex != null && focusCtx != null) {
			focusCtx.onMediaClick(mediaIndex)
		}
	}

	// kitty transmit + cleanup lifecycle
	useEffect(() => {
		if (ctx == null || image == null) return
		if (ctx.capabilities.protocol !== 'kitty-virtual') return
		if (renderer == null) return

		transmitKittyImage(image, renderer)

		return () => {
			cleanupKittyImage(renderer)
		}
	}, [image, ctx?.capabilities.protocol])

	// conditional rendering AFTER all hooks
	if (ctx == null || node.url == null || ctx.capabilities.protocol === 'text') {
		return renderTextFallback(node, nodeKey)
	}

	const fgProps: Record<string, unknown> = {}
	if (node.style.fg != null) fgProps['fg'] = node.style.fg

	const focusLabel =
		isFocused && focusCtx != null
			? buildFocusLabel(node, mediaIndex, focusCtx.mediaCount, focusCtx.focusBorderColor)
			: null

	const focusProps =
		isFocused && focusCtx != null
			? { border: true as const, borderColor: focusCtx.focusBorderColor }
			: {}

	// wrap all states in a ref'd box for viewport position tracking
	if (state === 'idle' || state === 'loading') {
		return (
			<box ref={boxRef} key={nodeKey} {...focusProps} onMouseDown={handleMouseDown}>
				<text>
					<span {...fgProps}>{`[loading: ${node.alt}]`}</span>
				</text>
				{focusLabel}
			</box>
		)
	}

	if (state === 'error') {
		const suffix = errorMsg.length > 0 ? ` (${errorMsg})` : ''
		return (
			<box ref={boxRef} key={nodeKey} {...focusProps} onMouseDown={handleMouseDown}>
				<text>
					<span {...fgProps}>{`[image: ${node.alt}${suffix}]`}</span>
				</text>
				{focusLabel}
			</box>
		)
	}

	if (state === 'loaded' && image != null) {
		return (
			<box ref={boxRef} key={nodeKey} {...focusProps} onMouseDown={handleMouseDown}>
				{renderLoadedImage(image, node, nodeKey, ctx)}
				{focusLabel}
			</box>
		)
	}

	return renderTextFallback(node, nodeKey)

	// -- helpers scoped to component for access to refs --

	function transmitKittyImage(img: LoadedImage, rend: NonNullable<typeof renderer>): void {
		const id = generateImageId()
		kittyIdRef.current = id
		activeImageIds.add(id)
		registerKittyExitHandler()

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

function renderLoadedImage(
	image: LoadedImage,
	node: ImageNode,
	key: string,
	ctx: ImageContextValue,
): ReactNode {
	// degrade to halfblock for linked images (OSC 8 per-row wrapping needs text elements)
	let protocol = ctx.capabilities.protocol
	if (node.href != null && protocol === 'kitty-virtual') protocol = 'halfblock'

	if (protocol === 'halfblock') {
		const rows = renderHalfBlockMerged(image, ctx.bgColor)
		return <HalfBlockRows key={key} rows={rows} width={image.terminalCols} href={node.href} />
	}

	if (protocol === 'kitty-virtual') {
		return <KittyPlaceholder key={key} rows={image.terminalRows} cols={image.terminalCols} />
	}

	return renderTextFallback(node, key)
}

function buildFocusLabel(node: ImageNode, index: number, total: number, color: string): ReactNode {
	const name = node.url != null ? mediaBasename(node.url) : node.alt
	return (
		<text>
			<span fg={color}>{`▸ ${name} [${String(index + 1)}/${String(total)}]`}</span>
		</text>
	)
}

function renderTextFallback(node: ImageNode, key: string): ReactNode {
	const props: Record<string, unknown> = {}
	if (node.style.fg != null) props['fg'] = node.style.fg
	const label = `[image: ${node.alt}]`
	return (
		<text key={key}>
			{node.href != null ? (
				<a href={node.href}>
					<span {...props}>{label}</span>
				</a>
			) : (
				<span {...props}>{label}</span>
			)}
		</text>
	)
}

// public dispatch wrapper for consistency with other renderers
export function renderImageBlock(node: ImageNode, key: string, mediaIndex?: number): ReactNode {
	return <ImageBlock node={node} nodeKey={key} key={key} mediaIndex={mediaIndex} />
}
