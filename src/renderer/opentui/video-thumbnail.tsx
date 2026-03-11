// video thumbnail — extracts first frame via ffmpeg, renders through image decode pipeline.
// reuses ImageContext, decode, and halfblock/kitty rendering from image.tsx.

import { type BoxRenderable, resolveRenderLib } from '@opentui/core'
import { useRenderer } from '@opentui/react'
import { type ReactNode, useContext, useEffect, useRef, useState } from 'react'

import type { VideoNode } from '../../ir/types.ts'
import { type DecodeOptions, decodeImage } from '../../media/decoder.ts'
import { renderHalfBlockMerged } from '../../media/halfblock.ts'
import {
	buildCleanupCommand,
	buildTransmitChunks,
	buildVirtualPlacement,
	generateImageId,
} from '../../media/kitty.ts'
import type { LoadedImage } from '../../media/types.ts'
import { extractVideoThumbnail } from '../../media/video-decoder.ts'
import {
	HalfBlockRows,
	activeImageIds,
	mediaBasename,
	registerKittyExitHandler,
	useScrollIntoView,
} from './halfblock-rendering.tsx'
import { ImageContext, type ImageContextValue } from './image-context.tsx'
import { MediaFocusContext, type MediaFocusContextValue } from './media-focus-context.tsx'
import { useViewportVisibility } from './use-image-loader.ts'

// thumbnail cache — keyed by video path + target cols
const thumbnailCache = new Map<string, LoadedImage>()
const inflightThumbnails = new Map<string, Promise<LoadedImage | null>>()

type ThumbnailState = 'idle' | 'loading' | 'loaded' | 'error'

function useThumbnailLoader(
	src: string | undefined,
	ctx: ImageContextValue | null,
	isVisible: boolean,
): { state: ThumbnailState; image: LoadedImage | null } {
	const [state, setState] = useState<ThumbnailState>('idle')
	const [image, setImage] = useState<LoadedImage | null>(null)
	const loadIdRef = useRef(0)

	useEffect(() => {
		if (ctx == null || src == null) return
		if (ctx.capabilities.protocol === 'text') return
		if (!isVisible) return

		const thisLoadId = ++loadIdRef.current
		const isStale = () => loadIdRef.current !== thisLoadId
		const controller = new AbortController()

		const cacheKey = `${src}@${String(ctx.maxCols)}`
		const cached = thumbnailCache.get(cacheKey)
		if (cached != null) {
			setImage(cached)
			setState('loaded')
			return
		}

		setState('loading')
		setImage(null)

		let promise = inflightThumbnails.get(cacheKey)
		if (promise == null) {
			promise = (async (): Promise<LoadedImage | null> => {
				const thumbResult = await extractVideoThumbnail(src, ctx.basePath, controller.signal)
				if (!thumbResult.ok) return null

				const purpose = ctx.capabilities.protocol === 'kitty-virtual' ? 'kitty' : 'halfblock'
				const targetCols =
					purpose === 'halfblock' ? ctx.maxCols : ctx.maxCols * ctx.capabilities.cellPixelWidth
				const decodeOpts: DecodeOptions = {
					bytes: thumbResult.value,
					targetCols,
					cellPixelWidth: ctx.capabilities.cellPixelWidth,
					cellPixelHeight: ctx.capabilities.cellPixelHeight,
					purpose,
					source: src,
					animationLimits: { maxFrames: 1, maxDecodedBytes: 10 * 1024 * 1024 },
					signal: controller.signal,
				}
				if (ctx.maxRows != null) decodeOpts.maxRows = ctx.maxRows

				const decoded = await decodeImage(decodeOpts)
				inflightThumbnails.delete(cacheKey)
				if (!decoded.ok) return null
				thumbnailCache.set(cacheKey, decoded.value)
				return decoded.value
			})()
			inflightThumbnails.set(cacheKey, promise)
		}

		void promise.then((result) => {
			if (isStale()) return
			if (result == null) {
				setState('error')
			} else {
				setImage(result)
				setState('loaded')
			}
		})

		return () => {
			controller.abort()
		}
	}, [src, ctx?.basePath, ctx?.capabilities.protocol, ctx?.maxCols, ctx?.maxRows, isVisible])

	return { state, image }
}

// -- main component --

function VideoThumbnailInner({
	node,
	nodeKey,
	mediaIndex,
}: {
	readonly node: VideoNode
	readonly nodeKey: string
	readonly mediaIndex: number
}): ReactNode {
	const ctx = useContext(ImageContext)
	const focusCtx = useContext(MediaFocusContext)
	const renderer = useRenderer()
	const boxRef = useRef<BoxRenderable | null>(null)
	const isVisible = useViewportVisibility(boxRef, ctx?.scrollRef)
	const { state, image } = useThumbnailLoader(node.src, ctx ?? null, isVisible)
	const kittyIdRef = useRef<number | null>(null)
	const isFocused = focusCtx?.focusedMediaIndex === mediaIndex
	useScrollIntoView(boxRef, ctx?.scrollRef, isFocused)

	const handleMouseDown = () => {
		if (focusCtx != null) focusCtx.onMediaClick(mediaIndex)
	}

	// kitty transmit + cleanup
	useEffect(() => {
		if (ctx == null || image == null) return
		if (ctx.capabilities.protocol !== 'kitty-virtual') return
		if (renderer == null) return

		const id = generateImageId()
		kittyIdRef.current = id
		activeImageIds.add(id)
		registerKittyExitHandler()

		void (async () => {
			try {
				const sharp = (await import('sharp')).default
				const pngBuf = await sharp(image.rgba, {
					raw: { width: image.width, height: image.height, channels: 4 },
				})
					.png()
					.toBuffer()

				if (kittyIdRef.current !== id) return

				const transmitCmd = buildTransmitChunks(id, new Uint8Array(pngBuf))
				const placeCmd = buildVirtualPlacement(id, image.terminalCols, image.terminalRows)
				const lib = resolveRenderLib()
				lib.writeOut(renderer.rendererPtr, transmitCmd + placeCmd)
			} catch {
				// transmit failed
			}
		})()

		return () => {
			const cleanId = kittyIdRef.current
			if (cleanId == null) return
			kittyIdRef.current = null
			activeImageIds.delete(cleanId)
			if (renderer != null) {
				try {
					const lib = resolveRenderLib()
					lib.writeOut(renderer.rendererPtr, buildCleanupCommand(cleanId))
				} catch {
					// ignore
				}
			}
		}
	}, [image, ctx?.capabilities.protocol])

	const fgProps: Record<string, unknown> = {}
	if (node.style.fg != null) fgProps['fg'] = node.style.fg

	const focusProps =
		isFocused && focusCtx != null
			? { border: true as const, borderColor: focusCtx.focusBorderColor }
			: {}

	const focusLabel =
		isFocused && focusCtx != null ? buildFocusLabel(node, mediaIndex, focusCtx) : null

	// text fallback for text-only terminals or no src
	if (ctx == null || node.src == null || ctx.capabilities.protocol === 'text') {
		return renderTextFallback(node, nodeKey, fgProps)
	}

	if (state === 'idle' || state === 'loading') {
		return (
			<box ref={boxRef} key={nodeKey} {...focusProps} onMouseDown={handleMouseDown}>
				<text>
					<span {...fgProps}>{`[video: ${node.alt}]`}</span>
				</text>
				{focusLabel}
			</box>
		)
	}

	if (state === 'error') {
		return (
			<box ref={boxRef} key={nodeKey} {...focusProps} onMouseDown={handleMouseDown}>
				<text>
					<span {...fgProps}>{`[video: ${node.alt}]`}</span>
				</text>
				{focusLabel}
			</box>
		)
	}

	if (state === 'loaded' && image != null) {
		return (
			<box ref={boxRef} key={nodeKey} {...focusProps} onMouseDown={handleMouseDown}>
				{renderThumbnail(image, ctx)}
				{focusLabel}
			</box>
		)
	}

	return renderTextFallback(node, nodeKey, fgProps)
}

function renderThumbnail(image: LoadedImage, ctx: ImageContextValue): ReactNode {
	const protocol = ctx.capabilities.protocol
	if (protocol === 'halfblock') {
		const rows = renderHalfBlockMerged(image, ctx.bgColor)
		return <HalfBlockRows rows={rows} width={image.terminalCols} keyPrefix="vhb" spanPrefix="vs" />
	}
	if (protocol === 'kitty-virtual') {
		return <box style={{ height: image.terminalRows, width: image.terminalCols }} />
	}
	return null
}

function buildFocusLabel(node: VideoNode, index: number, ctx: MediaFocusContextValue): ReactNode {
	const name = node.src != null ? mediaBasename(node.src) : node.alt
	return (
		<text>
			<span
				fg={ctx.focusBorderColor}
			>{`▸ ${name} [${String(index + 1)}/${String(ctx.mediaCount)}]`}</span>
		</text>
	)
}

function renderTextFallback(
	node: VideoNode,
	key: string,
	fgProps: Record<string, unknown>,
): ReactNode {
	return (
		<text key={key}>
			<span {...fgProps}>{`[video: ${node.alt}]`}</span>
		</text>
	)
}

export function renderVideoThumbnail(node: VideoNode, key: string, mediaIndex: number): ReactNode {
	return <VideoThumbnailInner node={node} nodeKey={key} key={key} mediaIndex={mediaIndex} />
}
