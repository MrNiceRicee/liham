// media modal overlay — full-screen media viewer with info bar.
// absolute positioned sibling of scrollbox content (does not scroll with content).

import { type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

import type { MediaIRNode } from '../../ir/types.ts'
import type { AnimationLimits } from '../../media/decoder.ts'
import type { LoadedImage } from '../../media/types.ts'
import type { ThemeTokens } from '../../theme/types.ts'
import type { MediaEntry } from './index.tsx'

import { createFrameTimer, type FrameTimerHandle } from '../../media/frame-timer.ts'
import { type MergedSpan, renderHalfBlockMerged } from '../../media/halfblock.ts'
import { sanitizeForTerminal } from '../../pipeline/sanitize.ts'
import { ImageContext } from './image-context.tsx'
import { useImageLoader } from './use-image-loader.ts'

// modal: no frame cap, 30MB byte budget is the only guard
const MODAL_ANIMATION_LIMITS: AnimationLimits = { maxFrames: Infinity, maxDecodedBytes: 30 * 1024 * 1024 }

// -- helpers --

function truncate(text: string, maxLen: number): string {
	if (text.length <= maxLen) return text
	return maxLen > 3 ? `${text.slice(0, maxLen - 1)}…` : text.slice(0, maxLen)
}

function basename(urlOrPath: string): string {
	const parts = urlOrPath.split('/')
	return parts[parts.length - 1] ?? urlOrPath
}

function mediaUrl(node: MediaIRNode): string | undefined {
	if (node.type === 'image') return node.url
	return node.src
}

function mediaTypeLabel(node: MediaIRNode): string {
	switch (node.type) {
		case 'image':
			return 'image'
		case 'video':
			return 'video'
		case 'audio':
			return 'audio'
	}
}

// -- half-block rows for modal (reused from image.tsx pattern) --

function ModalHalfBlockRows({
	rows,
	width,
}: {
	readonly rows: MergedSpan[][]
	readonly width: number
}): ReactNode {
	return (
		<box style={{ height: rows.length, width, justifyContent: 'center' }}>
			{rows.map((spans, rowIdx) => (
				<text key={`mhb-${String(rowIdx)}`}>
					{spans.map((s, sIdx) => {
						const props: Record<string, unknown> = {}
						if (s.bg.length > 0) props['bg'] = s.bg
						if (s.fg.length > 0) props['fg'] = s.fg
						return (
							<span key={`ms-${String(rowIdx)}-${String(sIdx)}`} {...props}>
								{s.text}
							</span>
						)
					})}
				</text>
			))}
		</box>
	)
}

// -- lazy pre-computed halfblock grids for animation --

function computeGrid(image: LoadedImage, frameIndex: number, bgColor: string): MergedSpan[][] {
	const frame = image.frames?.[frameIndex]
	if (frame == null) return renderHalfBlockMerged(image, bgColor)
	// build a single-frame LoadedImage view for renderHalfBlockMerged
	const frameView: LoadedImage = { ...image, rgba: frame }
	return renderHalfBlockMerged(frameView, bgColor)
}

function useFrameGridCache(image: LoadedImage | null, bgColor: string) {
	const cacheRef = useRef(new Map<number, MergedSpan[][]>())

	// reset cache when image changes
	useEffect(() => {
		cacheRef.current = new Map()
	}, [image])

	const getGrid = useCallback(
		(frameIndex: number): MergedSpan[][] => {
			if (image == null) return []
			const cached = cacheRef.current.get(frameIndex)
			if (cached != null) return cached
			const grid = computeGrid(image, frameIndex, bgColor)
			cacheRef.current.set(frameIndex, grid)
			return grid
		},
		[image, bgColor],
	)

	// pre-compute the next frame in a microtask
	const precomputeNext = useCallback(
		(currentIndex: number) => {
			if (image?.frames == null) return
			const next = (currentIndex + 1) % image.frames.length
			if (!cacheRef.current.has(next)) {
				setTimeout(() => {
					if (image.frames == null) return
					const grid = computeGrid(image, next, bgColor)
					cacheRef.current.set(next, grid)
				}, 0)
			}
		},
		[image, bgColor],
	)

	return { getGrid, precomputeNext }
}

// -- modal image content --

export interface FrameInfo {
	frameCount: number
	capped: boolean
}

function ModalImageContent({
	url,
	alt,
	theme,
	maxCols,
	maxRows,
	onFrameInfo,
}: {
	readonly url: string | undefined
	readonly alt: string
	readonly theme: ThemeTokens
	readonly maxCols: number
	readonly maxRows: number
	readonly onFrameInfo: (info: FrameInfo | null) => void
}): ReactNode {
	const ctx = useContext(ImageContext)
	const modalCtx = useMemo(
		() =>
			ctx != null ? { ...ctx, maxCols, maxRows, animationLimits: MODAL_ANIMATION_LIMITS } : null,
		[ctx, maxCols, maxRows],
	)
	const { state, image } = useImageLoader(url, modalCtx, true)

	// animation state
	const [frameIndex, setFrameIndex] = useState(0)
	const timerRef = useRef<FrameTimerHandle | null>(null)
	const { getGrid, precomputeNext } = useFrameGridCache(image, ctx?.bgColor ?? '')

	const isAnimated = image?.frames != null && image.frames.length > 1

	// report frame info to parent for info bar
	useEffect(() => {
		if (isAnimated) {
			onFrameInfo({ frameCount: image.frames!.length, capped: false })
		} else {
			onFrameInfo(null)
		}
	}, [image, isAnimated])

	// start/stop frame timer
	useEffect(() => {
		if (!isAnimated || image?.delays == null) return
		setFrameIndex(0)

		const timer = createFrameTimer({
			delays: image.delays,
			onFrame: (idx) => {
				setFrameIndex(idx)
				precomputeNext(idx)
			},
			loop: true,
		})
		timerRef.current = timer
		// pre-compute first two frames eagerly
		getGrid(0)
		precomputeNext(0)
		timer.play()

		return () => {
			timer.dispose()
			timerRef.current = null
		}
	}, [image])

	if (ctx == null || url == null || ctx.capabilities.protocol === 'text') {
		return (
			<text>
				<span fg={theme.image.fallbackColor}>[image: {sanitizeForTerminal(alt)}]</span>
			</text>
		)
	}

	if (state === 'loading' || state === 'idle') {
		return (
			<text>
				<span fg={theme.image.fallbackColor}>[loading: {sanitizeForTerminal(alt)}]</span>
			</text>
		)
	}

	if (state === 'error' || image == null) {
		return (
			<text>
				<span fg={theme.image.fallbackColor}>[image: {sanitizeForTerminal(alt)}]</span>
			</text>
		)
	}

	const rows = isAnimated ? getGrid(frameIndex) : renderHalfBlockMerged(image, ctx.bgColor)
	return <ModalHalfBlockRows rows={rows} width={image.terminalCols} />
}

// -- main modal component --

export interface MediaModalProps {
	readonly mediaNodes: MediaEntry[]
	readonly mediaIndex: number
	readonly theme: ThemeTokens
	readonly termWidth: number
	readonly termHeight: number
}

function frameInfoLabel(info: FrameInfo | null): string {
	if (info == null) return ''
	const suffix = info.capped ? ' (capped)' : ''
	return ` | ${String(info.frameCount)} frames${suffix}`
}

export function MediaModal({
	mediaNodes,
	mediaIndex,
	theme,
	termWidth,
	termHeight,
}: MediaModalProps): ReactNode {
	const entry = mediaNodes[mediaIndex]
	const [frameInfo, setFrameInfo] = useState<FrameInfo | null>(null)

	if (entry == null) return null

	const node = entry.node
	const url = mediaUrl(node)
	const filename = url != null ? basename(url) : node.alt
	const typeLabel = mediaTypeLabel(node)
	const position = `[${String(mediaIndex + 1)}/${String(mediaNodes.length)}]`

	// content area = full height minus info bar (2 rows)
	const infoBarHeight = 2
	const contentRows = Math.max(1, termHeight - infoBarHeight)

	return (
		<box
			style={{
				position: 'absolute',
				top: 0,
				left: 0,
				width: termWidth,
				height: termHeight,
				zIndex: 100,
				flexDirection: 'column',
				backgroundColor: theme.bg,
			}}
		>
			<box
				style={{
					height: contentRows,
					justifyContent: 'center',
					alignItems: 'center',
				}}
			>
				{node.type === 'image' ? (
					<ModalImageContent
						url={url}
						alt={node.alt}
						theme={theme}
						maxCols={termWidth}
						maxRows={contentRows}
						onFrameInfo={setFrameInfo}
					/>
				) : node.type === 'video' ? (
					<text>
						<span fg={theme.image.fallbackColor}>[video: {sanitizeForTerminal(node.alt)}]</span>
					</text>
				) : (
					<text>
						<span fg={theme.image.fallbackColor}>[audio: {sanitizeForTerminal(node.alt)}]</span>
					</text>
				)}
			</box>
			<box border={['top']} style={{ height: 2, width: termWidth }}>
				<text>
					<span fg={theme.paragraph.textColor}>
						{truncate(`${sanitizeForTerminal(filename)} | ${typeLabel}${frameInfoLabel(frameInfo)} | ${position}`, termWidth - 2)}
					</span>
				</text>
			</box>
		</box>
	)
}
