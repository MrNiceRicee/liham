// modal image content — animated GIF/image viewer for the media modal.

import {
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react'

import type { AnimationLimits } from '../../media/decoder.ts'
import { createFrameTimer, type FrameTimerHandle } from '../../media/frame-timer.ts'
import { type MergedSpan, renderHalfBlockMerged } from '../../media/halfblock.ts'
import type { LoadedImage } from '../../media/types.ts'
import { sanitizeForTerminal } from '../../pipeline/sanitize.ts'
import type { ThemeTokens } from '../../theme/types.ts'
import { ImageContext } from './image-context.tsx'
import { useImageLoader } from './use-image-loader.ts'

// modal: no frame cap, 30MB byte budget is the only guard
const MODAL_ANIMATION_LIMITS: AnimationLimits = {
	maxFrames: Infinity,
	maxDecodedBytes: 30 * 1024 * 1024,
}

// -- half-block rows for modal (reused from image.tsx pattern) --

export function ModalHalfBlockRows({
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
	const frameView: LoadedImage = { ...image, rgba: frame }
	return renderHalfBlockMerged(frameView, bgColor)
}

function useFrameGridCache(image: LoadedImage | null, bgColor: string) {
	const cacheRef = useRef(new Map<number, MergedSpan[][]>())

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

export function ModalImageContent({
	url,
	alt,
	theme,
	maxCols,
	maxRows,
	paused,
	onFrameInfo,
}: {
	readonly url: string | undefined
	readonly alt: string
	readonly theme: ThemeTokens
	readonly maxCols: number
	readonly maxRows: number
	readonly paused: boolean
	readonly onFrameInfo: (info: FrameInfo | null) => void
}): ReactNode {
	const ctx = useContext(ImageContext)
	const modalCtx = useMemo(
		() =>
			ctx != null ? { ...ctx, maxCols, maxRows, animationLimits: MODAL_ANIMATION_LIMITS } : null,
		[ctx, maxCols, maxRows],
	)
	const { state, image } = useImageLoader(url, modalCtx, true)

	const [frameIndex, setFrameIndex] = useState(0)
	const timerRef = useRef<FrameTimerHandle | null>(null)
	const renderPendingRef = useRef(false)
	const { getGrid, precomputeNext } = useFrameGridCache(image, ctx?.bgColor ?? '')

	const isAnimated = image?.frames != null && image.frames.length > 1

	useEffect(() => {
		renderPendingRef.current = false
	})

	useEffect(() => {
		if (isAnimated) {
			onFrameInfo({ frameCount: image.frames!.length, capped: false })
		} else {
			onFrameInfo(null)
		}
	}, [image, isAnimated])

	useEffect(() => {
		if (!isAnimated || image?.delays == null) return
		setFrameIndex(0)

		const timer = createFrameTimer({
			delays: image.delays,
			onFrame: (idx) => {
				if (renderPendingRef.current) return
				renderPendingRef.current = true
				setFrameIndex(idx)
				precomputeNext(idx)
			},
			loop: true,
		})
		timerRef.current = timer
		getGrid(0)
		precomputeNext(0)
		timer.play()

		return () => {
			timer.dispose()
			timerRef.current = null
		}
	}, [image])

	useEffect(() => {
		const timer = timerRef.current
		if (timer == null) return
		if (paused && timer.state === 'playing') timer.pause()
		if (!paused && timer.state === 'paused') timer.play()
	}, [paused])

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
