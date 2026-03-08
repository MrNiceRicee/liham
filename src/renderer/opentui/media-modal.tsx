// media modal overlay — full-screen media viewer.
// absolute positioned sibling of scrollbox content (does not scroll with content).
// media info (filename, type, frame count) lives in the gallery panel, not here.

import {
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react'

import type { MediaIRNode } from '../../ir/types.ts'
import type { AnimationLimits } from '../../media/decoder.ts'
import { killActiveAudio, playAudio } from '../../media/ffplay.ts'
import { createFrameTimer, type FrameTimerHandle } from '../../media/frame-timer.ts'
import { type MergedSpan, renderHalfBlockMerged } from '../../media/halfblock.ts'
import type { LoadedImage, MediaCapabilities } from '../../media/types.ts'
import {
	computeVideoDimensions,
	createVideoStream,
	probeVideo,
	readFrames,
} from '../../media/video-decoder.ts'
import { sanitizeForTerminal } from '../../pipeline/sanitize.ts'
import type { ThemeTokens } from '../../theme/types.ts'
import { ImageContext } from './image-context.tsx'
import type { MediaEntry } from './index.tsx'
import { useImageLoader } from './use-image-loader.ts'

// modal: no frame cap, 30MB byte budget is the only guard
const MODAL_ANIMATION_LIMITS: AnimationLimits = {
	maxFrames: Infinity,
	maxDecodedBytes: 30 * 1024 * 1024,
}

// -- helpers --

function mediaUrl(node: MediaIRNode): string | undefined {
	if (node.type === 'image') return node.url
	return node.src
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

	// react to external play/pause toggle
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

// -- modal video content --

type PlaybackState = 'loading' | 'playing' | 'error' | 'ended'

function ModalVideoContent({
	src,
	alt,
	theme,
	maxCols,
	maxRows,
	basePath,
	bgColor,
}: {
	readonly src: string
	readonly alt: string
	readonly theme: ThemeTokens
	readonly maxCols: number
	readonly maxRows: number
	readonly basePath: string
	readonly bgColor: string
}): ReactNode {
	const loadIdRef = useRef(0)
	const renderPendingRef = useRef(false)
	const [currentGrid, setCurrentGrid] = useState<MergedSpan[][] | null>(null)
	const [gridWidth, setGridWidth] = useState(0)
	const [playbackState, setPlaybackState] = useState<PlaybackState>('loading')

	// clear renderPending after React commits (NOT queueMicrotask)
	useEffect(() => {
		renderPendingRef.current = false
	})

	useEffect(() => {
		const thisLoadId = ++loadIdRef.current
		const isStale = () => loadIdRef.current !== thisLoadId
		const controller = new AbortController()
		let proc: ReturnType<typeof Bun.spawn> | null = null
		let audioStarted = false

		void (async () => {
			// 1. probe
			const result = await probeVideo(src, basePath, controller.signal)
			if (isStale() || !result.ok) {
				if (!isStale()) setPlaybackState('error')
				return
			}
			const meta = result.value

			// 2. compute dimensions
			const dims = computeVideoDimensions(meta.width, meta.height, maxCols, maxRows)
			if (dims == null || isStale()) return

			// 3. start video stream
			proc = createVideoStream({
				filePath: src,
				width: dims.pixelWidth,
				height: dims.pixelHeight,
				fps: 10,
			})

			// 4. start audio (through playAudio, not inline spawn)
			if (meta.hasAudio) {
				void playAudio(src, basePath)
				audioStarted = true
			}

			// 5. frame read loop
			setPlaybackState('playing')
			setGridWidth(dims.termCols)
			const frameSize = dims.pixelWidth * dims.pixelHeight * 4

			for await (const rgba of readFrames(proc.stdout as ReadableStream<Uint8Array>, frameSize)) {
				if (isStale()) break
				if (renderPendingRef.current) continue // frame skip

				const image: LoadedImage = {
					rgba,
					width: dims.pixelWidth,
					height: dims.pixelHeight,
					terminalCols: dims.termCols,
					terminalRows: dims.termRows,
					byteSize: rgba.byteLength,
					source: src,
				}
				const grid = renderHalfBlockMerged(image, bgColor)
				renderPendingRef.current = true
				setCurrentGrid(grid)
			}

			// 6. check exit code for error vs normal end
			if (!isStale() && proc != null) {
				const exitCode = await proc.exited
				setPlaybackState(exitCode === 0 ? 'ended' : 'error')
			}
		})()

		return () => {
			loadIdRef.current++ // mark stale
			controller.abort() // cancel in-flight probeVideo
			if (proc != null) {
				try {
					proc.kill('SIGKILL')
				} catch {
					/* already dead */
				}
			}
			if (audioStarted) void killActiveAudio()
		}
	}, [src, basePath, maxCols, maxRows])

	if (playbackState === 'loading') {
		return (
			<text>
				<span fg={theme.image.fallbackColor}>[loading video: {sanitizeForTerminal(alt)}]</span>
			</text>
		)
	}

	if (playbackState === 'error' && currentGrid == null) {
		return (
			<text>
				<span fg={theme.image.fallbackColor}>[video: {sanitizeForTerminal(alt)}]</span>
			</text>
		)
	}

	// playing, ended, or error-with-last-frame
	if (currentGrid != null) {
		return <ModalHalfBlockRows rows={currentGrid} width={gridWidth} />
	}

	return null
}

// -- main modal component --

function ModalMediaFallback({
	node,
	theme,
	hint,
}: {
	readonly node: MediaIRNode
	readonly theme: ThemeTokens
	readonly hint?: string
}): ReactNode {
	const label = node.type === 'video' ? 'video' : 'audio'
	return (
		<box flexDirection="column" alignItems="center" gap={1}>
			<text>
				<span fg={theme.image.fallbackColor}>
					[{label}: {sanitizeForTerminal(node.alt)}]
				</span>
			</text>
			{hint != null && (
				<text>
					<span fg={theme.image.fallbackColor}>{hint}</span>
				</text>
			)}
		</box>
	)
}

export interface MediaModalProps {
	readonly mediaNodes: MediaEntry[]
	readonly mediaIndex: number
	readonly theme: ThemeTokens
	readonly termWidth: number
	readonly termHeight: number
	readonly paused: boolean
	readonly mediaCapabilities: MediaCapabilities
	readonly onFrameInfo: (info: FrameInfo | null) => void
}

export function MediaModal({
	mediaNodes,
	mediaIndex,
	theme,
	termWidth,
	termHeight,
	paused,
	mediaCapabilities,
	onFrameInfo,
}: MediaModalProps): ReactNode {
	const entry = mediaNodes[mediaIndex]
	if (entry == null) return null

	const node = entry.node
	const url = mediaUrl(node)
	const ctx = useContext(ImageContext)

	const renderContent = () => {
		if (node.type === 'image') {
			return (
				<ModalImageContent
					url={url}
					alt={node.alt}
					theme={theme}
					maxCols={termWidth}
					maxRows={termHeight}
					paused={paused}
					onFrameInfo={onFrameInfo}
				/>
			)
		}
		if (node.type === 'video' && mediaCapabilities.canPlayVideo) {
			return (
				<ModalVideoContent
					src={url ?? ''}
					alt={node.alt}
					theme={theme}
					maxCols={termWidth}
					maxRows={termHeight}
					basePath={ctx?.basePath ?? process.cwd()}
					bgColor={ctx?.bgColor ?? ''}
				/>
			)
		}
		const hint =
			node.type === 'video' && !mediaCapabilities.canPlayVideo
				? 'install ffmpeg to play video'
				: undefined
		return <ModalMediaFallback node={node} theme={theme} hint={hint} />
	}

	return (
		<box
			style={{
				position: 'absolute',
				top: 0,
				left: 0,
				width: termWidth,
				height: termHeight,
				zIndex: 100,
				justifyContent: 'center',
				alignItems: 'center',
				backgroundColor: theme.codeBlock.backgroundColor,
			}}
		>
			{renderContent()}
		</box>
	)
}
