// media modal overlay — full-screen media viewer.
// absolute positioned sibling of scrollbox content (does not scroll with content).
// media info (filename, type, frame count) lives in the gallery panel, not here.

import { resolve } from 'node:path'
import { type ReactNode, useContext, useEffect, useRef, useState } from 'react'

import type { MediaIRNode } from '../../ir/types.ts'
import { checkBufferEnd, fillRingBuffer } from '../../media/fill-ring-buffer.ts'
import { killActiveAudio, playAudio } from '../../media/ffplay.ts'
import { createFrameTimer, type FrameTimerHandle } from '../../media/frame-timer.ts'
import { type MergedSpan, renderHalfBlockMerged } from '../../media/halfblock.ts'
import { createRingBuffer, type RingBuffer } from '../../media/ring-buffer.ts'
import type { LoadedImage, MediaCapabilities } from '../../media/types.ts'
import {
	type VideoMetadata,
	computeVideoDimensions,
	createVideoStream,
	pauseActiveVideo,
	probeVideo,
	resumeActiveVideo,
} from '../../media/video-decoder.ts'
import { sanitizeForTerminal } from '../../pipeline/sanitize.ts'
import type { ThemeTokens } from '../../theme/types.ts'
import { ImageContext } from './image-context.tsx'
import type { MediaEntry } from './index.tsx'
import { type FrameInfo, ModalHalfBlockRows, ModalImageContent } from './modal-image.tsx'

export type { FrameInfo }

const debug =
	process.env['LIHAM_DEBUG'] === '1'
		? (msg: string) => process.stderr.write(`[media-modal] ${msg}\n`)
		: () => {}

// -- helpers --

function mediaUrl(node: MediaIRNode): string | undefined {
	if (node.type === 'image') return node.url
	return node.src
}

export interface VideoPlaybackInfo {
	elapsed: number // seconds
	duration: number // seconds, 0 if unknown
	paused: boolean
}

// -- render a single RGBA frame to a half-block grid --

function renderFrame(rgba: Uint8Array, dims: VideoDimensions, src: string, bgColor: string): MergedSpan[][] {
	const image: LoadedImage = {
		rgba,
		width: dims.pixelWidth,
		height: dims.pixelHeight,
		terminalCols: dims.termCols,
		terminalRows: dims.termRows,
		byteSize: rgba.byteLength,
		source: src,
	}
	return renderHalfBlockMerged(image, bgColor)
}

// -- modal video content --

type PlaybackState = 'loading' | 'playing' | 'error' | 'ended'

type VideoDimensions = NonNullable<ReturnType<typeof computeVideoDimensions>>

// ring buffer capacity — capped by 30MB memory budget in createRingBuffer
const RING_BUFFER_CAPACITY = 30

function ModalVideoContent({
	src,
	alt,
	theme,
	maxCols,
	maxRows,
	basePath,
	bgColor,
	restartCount,
	seekOffset,
	paused,
	onVideoInfo,
}: {
	readonly src: string
	readonly alt: string
	readonly theme: ThemeTokens
	readonly maxCols: number
	readonly maxRows: number
	readonly basePath: string
	readonly bgColor: string
	readonly restartCount: number
	readonly seekOffset: number
	readonly paused: boolean
	readonly onVideoInfo: (info: VideoPlaybackInfo | null) => void
}): ReactNode {
	const loadIdRef = useRef(0)
	const renderPendingRef = useRef(false)
	const [currentGrid, setCurrentGrid] = useState<MergedSpan[][] | null>(null)
	const [gridWidth, setGridWidth] = useState(0)
	const [playbackState, setPlaybackState] = useState<PlaybackState>('loading')

	// cached probe result — survives across seek/resize, only re-probed on src change
	const [probeCache, setProbeCache] = useState<{ meta: VideoMetadata; absPath: string } | null>(null)

	// refs for timer and buffer — needed for pause/resume effect
	const timerRef = useRef<FrameTimerHandle | null>(null)
	const bufferRef = useRef<RingBuffer | null>(null)

	// audio resync context — ref avoids adding deps to pause effect
	const audioCtxRef = useRef<{ absPath: string; basePath: string; fps: number; hasAudio: boolean; seekOffset: number } | null>(null)

	// clear renderPending after React commits (NOT queueMicrotask)
	useEffect(() => {
		renderPendingRef.current = false
	})

	// probe effect — runs once per video source, caches metadata
	useEffect(() => {
		setProbeCache(null)
		setPlaybackState('loading')
		const controller = new AbortController()
		const absPath = resolve(basePath, src)

		void (async () => {
			const result = await probeVideo(absPath, basePath, controller.signal)
			if (controller.signal.aborted) return
			if (!result.ok) {
				setPlaybackState('error')
				return
			}
			setProbeCache({ meta: result.value, absPath })
		})()

		return () => {
			controller.abort()
		}
	}, [src, basePath])

	// stream effect — ring buffer producer + timer-driven consumer
	useEffect(() => {
		if (probeCache == null) return

		const { meta, absPath } = probeCache
		const dims = computeVideoDimensions(meta.width, meta.height, maxCols, maxRows)
		if (dims == null) return

		const thisLoadId = ++loadIdRef.current
		const isStale = () => loadIdRef.current !== thisLoadId
		const frameSize = dims.pixelWidth * dims.pixelHeight * 4
		let audioStarted = false

		// create ring buffer + timer
		const buffer = createRingBuffer(RING_BUFFER_CAPACITY, frameSize)
		bufferRef.current = buffer

		setGridWidth(dims.termCols)
		setPlaybackState('playing')
		audioCtxRef.current = { absPath, basePath, fps: meta.fps, hasAudio: meta.hasAudio, seekOffset }

		const proc = createVideoStream({
			filePath: absPath,
			width: dims.pixelWidth,
			height: dims.pixelHeight,
			fps: meta.fps,
			seekOffset,
		})

		// consumer: timer-driven rendering from ring buffer
		const timer = createFrameTimer({
			delays: [1000 / meta.fps],
			onFrame: () => {
				if (renderPendingRef.current) return // backpressure: skip if React hasn't committed

				const frame = buffer.read()
				if (frame == null) {
					// underrun — check if stream has ended
					const status = checkBufferEnd(buffer)
					if (status !== 'playing') setPlaybackState(status)
					return
				}

				const grid = renderFrame(frame, dims, src, bgColor)
				renderPendingRef.current = true
				setCurrentGrid(grid)

				// report elapsed time
				const elapsed = seekOffset + timer.tickCount / meta.fps
				onVideoInfo({ elapsed, duration: meta.duration, paused: false })
			},
			loop: true,
		})
		timerRef.current = timer

		// start producer — fills ring buffer from ffmpeg stdout
		void fillRingBuffer({
			stdout: proc.stdout as ReadableStream<Uint8Array>,
			buffer,
			frameSize,
			fps: meta.fps,
			isStale,
			onEvent: (event) => {
				if (isStale()) return
				if (event.type === 'ended' || event.type === 'error') {
					debug(`producer ${event.type}`)
				}
			},
		})

		// render first frame as soon as it arrives, then start timer
		void (async () => {
			// wait for first frame — poll briefly
			for (let i = 0; i < 100 && !isStale(); i++) {
				if (!buffer.empty) break
				await new Promise((r) => setTimeout(r, 10))
			}
			if (isStale()) return

			const firstFrame = buffer.read()
			if (firstFrame != null) {
				const grid = renderFrame(firstFrame, dims, src, bgColor)
				setCurrentGrid(grid)
			}

			// start audio then timer — await spawn so they begin together
			if (meta.hasAudio) {
				const result = await playAudio(absPath, basePath, seekOffset)
				if (isStale()) return
				if (result.ok) audioStarted = true
			}
			timer.play()
		})()

		return () => {
			loadIdRef.current++ // mark stale
			timer.dispose()
			timerRef.current = null
			buffer.flush()
			bufferRef.current = null
			// force-close pipe reader to prevent stale producer from draining
			void (proc.stdout as ReadableStream<Uint8Array>).cancel().catch(() => {
				/* already closed */
			})
			try {
				proc.kill('SIGKILL')
			} catch {
				/* already dead */
			}
			if (audioStarted) void killActiveAudio()
		}
	}, [probeCache, maxCols, maxRows, restartCount, seekOffset])

	// react to external pause/resume toggle
	useEffect(() => {
		debug(`pause effect: paused=${String(paused)}`)
		const timer = timerRef.current
		if (timer != null) {
			if (paused && timer.state === 'playing') timer.pause()
			if (!paused && timer.state === 'paused') timer.play()
		}
		if (paused) {
			pauseActiveVideo()
			// kill audio immediately — SIGSTOP leaves OS audio buffers playing
			void killActiveAudio()
		} else {
			resumeActiveVideo()
			// start fresh audio at current video position (playAudio handles kill internally)
			const ctx = audioCtxRef.current
			if (ctx?.hasAudio && timer != null) {
				const elapsed = ctx.seekOffset + timer.tickCount / ctx.fps
				debug(`audio resync: elapsed=${String(elapsed.toFixed(2))}s`)
				void playAudio(ctx.absPath, ctx.basePath, elapsed)
			}
		}
	}, [paused])

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
	readonly hint?: string | undefined
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
	readonly restartCount: number
	readonly seekOffset: number
	readonly mediaCapabilities: MediaCapabilities
	readonly onFrameInfo: (info: FrameInfo | null) => void
	readonly onVideoInfo: (info: VideoPlaybackInfo | null) => void
}

export function MediaModal({
	mediaNodes,
	mediaIndex,
	theme,
	termWidth,
	termHeight,
	paused,
	restartCount,
	seekOffset,
	mediaCapabilities,
	onFrameInfo,
	onVideoInfo,
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
					restartCount={restartCount}
					seekOffset={seekOffset}
					paused={paused}
					onVideoInfo={onVideoInfo}
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
