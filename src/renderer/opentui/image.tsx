// image renderer component — Kitty virtual placements, half-block fallback, text fallback.
// thin rendering shell — loading logic lives in use-image-loader.ts.

import { resolveRenderLib, RGBA, type BoxRenderable, type FrameBufferRenderable } from '@opentui/core'
import { useRenderer } from '@opentui/react'
import { writeSync } from 'node:fs'
import { memo, useContext, useEffect, useRef, type ReactNode } from 'react'

import type { LoadedImage } from '../../image/types.ts'
import type { ImageNode } from '../../ir/types.ts'

import { drawMergedSpansToBuffer, renderHalfBlockMerged, type MergedSpan } from '../../image/halfblock.ts'
import { buildCleanupCommand, buildTransmitChunks, buildVirtualPlacement, generateImageId } from '../../image/kitty.ts'
import { ImageContext } from './image-context.tsx'
import { useImageLoader, useViewportVisibility } from './use-image-loader.ts'

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
	readonly href?: string
}

function renderSpans(spans: MergedSpan[], rowIdx: number): ReactNode[] {
	return spans.map((s, sIdx) => {
		const props: Record<string, unknown> = {}
		if (s.bg.length > 0) props['bg'] = s.bg
		if (s.fg.length > 0) props['fg'] = s.fg
		return (
			<span key={`s-${String(rowIdx)}-${String(sIdx)}`} {...props}>
				{s.text}
			</span>
		)
	})
}

const HalfBlockRows = memo(function HalfBlockRows({ rows, width, href }: HalfBlockRowsProps) {
	return (
		<box style={{ height: rows.length, width }}>
			{rows.map((spans, rowIdx) => (
				<text key={`hb-${String(rowIdx)}`}>
					{href != null
						? <a href={href}>{renderSpans(spans, rowIdx)}</a>
						: renderSpans(spans, rowIdx)}
				</text>
			))}
		</box>
	)
}, (prev, next) => prev.rows === next.rows && prev.href === next.href)

// -- animated GIF via FrameBuffer (bypasses React reconciliation for frame updates) --

function AnimatedGifBlock({ image, bgColor }: {
	readonly image: LoadedImage
	readonly bgColor: string
}): ReactNode {
	const fbRef = useRef<FrameBufferRenderable | null>(null)

	useEffect(() => {
		const fb = fbRef.current
		if (!fb || !image.frames || !image.delays) return

		// pre-compute all frames as merged span rows
		const frames = image.frames.map(rgba =>
			renderHalfBlockMerged({ ...image, rgba }, bgColor),
		)
		const bgRGBA = RGBA.fromHex(bgColor)

		// draw first frame
		let frameIdx = 0
		drawMergedSpansToBuffer(fb.frameBuffer, frames[0]!, bgRGBA)
		fb.requestRender()

		// animation timer — writes directly to native buffer
		const advance = (): void => {
			frameIdx = (frameIdx + 1) % frames.length
			drawMergedSpansToBuffer(fb.frameBuffer, frames[frameIdx]!, bgRGBA)
			fb.requestRender()
			timer = setTimeout(advance, image.delays![frameIdx] ?? 100)
		}
		let timer = setTimeout(advance, image.delays[0] ?? 100)

		return () => { clearTimeout(timer) }
	}, [image, bgColor])

	const rows = Math.ceil(image.height / 2)
	return <frame-buffer ref={fbRef} width={image.terminalCols} height={rows} />
}

// -- kitty text fallback for placeholder rendering --

function KittyPlaceholder({ rows, cols }: { readonly rows: number; readonly cols: number }): ReactNode {
	return <box style={{ height: rows, width: cols }} />
}

// -- main image block component --

function ImageBlock({ node, nodeKey }: { readonly node: ImageNode; readonly nodeKey: string }): ReactNode {
	const ctx = useContext(ImageContext)
	const renderer = useRenderer()
	const boxRef = useRef<BoxRenderable | null>(null)
	const isVisible = useViewportVisibility(boxRef, ctx?.scrollRef)
	const { state, image, errorMsg } = useImageLoader(node.url, ctx, isVisible)
	const kittyIdRef = useRef<number | null>(null)

	// kitty transmit + cleanup lifecycle
	useEffect(() => {
		if (ctx == null || image == null) return
		if (ctx.capabilities.protocol !== 'kitty-virtual') return
		if (image.frames != null) return // animated → halfblock only
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

	// wrap all states in a ref'd box for viewport position tracking
	if (state === 'idle' || state === 'loading') {
		return (
			<box ref={boxRef} key={nodeKey}>
				<text>
					<span {...fgProps}>{`[loading: ${node.alt}]`}</span>
				</text>
			</box>
		)
	}

	if (state === 'error') {
		const suffix = errorMsg.length > 0 ? ` (${errorMsg})` : ''
		return (
			<box ref={boxRef} key={nodeKey}>
				<text>
					<span {...fgProps}>{`[image: ${node.alt}${suffix}]`}</span>
				</text>
			</box>
		)
	}

	if (state === 'loaded' && image != null) {
		return (
			<box ref={boxRef} key={nodeKey}>
				{renderLoadedImage(image, node, nodeKey, ctx)}
			</box>
		)
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

function renderLoadedImage(
	image: LoadedImage,
	node: ImageNode,
	key: string,
	ctx: NonNullable<ReturnType<typeof useContext<typeof ImageContext>>>,
): ReactNode {
	// degrade to halfblock for animated GIFs and linked images
	let protocol = ctx.capabilities.protocol
	if (image.frames != null) protocol = 'halfblock'
	if (node.href != null && protocol === 'kitty-virtual') protocol = 'halfblock'

	if (protocol === 'halfblock') {
		if (image.frames != null && image.delays != null) {
			return <AnimatedGifBlock key={key} image={image} bgColor={ctx.bgColor} />
		}
		const rows = renderHalfBlockMerged(image, ctx.bgColor)
		return <HalfBlockRows key={key} rows={rows} width={image.terminalCols} href={node.href} />
	}

	if (protocol === 'kitty-virtual') {
		return <KittyPlaceholder key={key} rows={image.terminalRows} cols={image.terminalCols} />
	}

	return renderTextFallback(node, key)
}

function renderTextFallback(node: ImageNode, key: string): ReactNode {
	const props: Record<string, unknown> = {}
	if (node.style.fg != null) props['fg'] = node.style.fg
	const label = `[image: ${node.alt}]`
	return (
		<text key={key}>
			{node.href != null
				? <a href={node.href}><span {...props}>{label}</span></a>
				: <span {...props}>{label}</span>}
		</text>
	)
}

// public dispatch wrapper for consistency with other renderers
export function renderImageBlock(node: ImageNode, key: string): ReactNode {
	return <ImageBlock node={node} nodeKey={key} key={key} />
}
