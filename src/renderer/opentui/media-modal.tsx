// media modal overlay — full-screen media viewer.
// absolute positioned sibling of scrollbox content (does not scroll with content).
// media info (filename, type, frame count) lives in the gallery panel, not here.

import { resolve } from 'node:path'
import { type ReactNode, useContext, useEffect, useRef, useState } from 'react'

import type { MediaIRNode } from '../../ir/types.ts'
import { type AudioBackend, detectAudioBackend } from '../../media/audio-backend.ts'
import { syncFrameToClockPos } from '../../media/clock-sync.ts'
import { createFfplayBackend } from '../../media/ffplay-backend.ts'
import { checkBufferEnd, fillRingBuffer } from '../../media/fill-ring-buffer.ts'
import { killActiveAudio, playAudio } from '../../media/ffplay.ts'
import { createFrameTimer, type FrameTimerHandle } from '../../media/frame-timer.ts'
import { type MergedSpan, renderHalfBlockMerged } from '../../media/halfblock.ts'
import { createMpvBackend } from '../../media/mpv-backend.ts'
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

function renderFrame(
	rgba: Uint8Array,
	dims: VideoDimensions,
	src: string,
	bgColor: string,
): MergedSpan[][] {
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

// -- helpers --

function resyncFfplayAudio(
	backendKind: 'mpv' | 'ffplay',
	ctx: {
		absPath: string
		basePath: string
		fps: number
		hasAudio: boolean
		seekOffset: number
	} | null,
	timer: FrameTimerHandle | null,
) {
	if (backendKind !== 'ffplay' || ctx == null || !ctx.hasAudio || timer == null) return
	const elapsed = ctx.seekOffset + timer.tickCount / ctx.fps
	debug(`ffplay audio resync: elapsed=${String(elapsed.toFixed(2))}s`)
	void playAudio(ctx.absPath, ctx.basePath, elapsed)
}

// consume a frame from the ring buffer using mpv's clock position.
// returns true if a grid was set (render pending), false otherwise.
function consumeMpvFrame(
	backend: AudioBackend,
	buffer: RingBuffer,
	seekOffset: number,
	fps: number,
	duration: number,
	consumedRef: { current: number },
	dims: VideoDimensions,
	src: string,
	bgColor: string,
	setGrid: (grid: MergedSpan[][]) => void,
	setState: (state: PlaybackState) => void,
	setInfo: (info: VideoPlaybackInfo) => void,
): boolean {
	const timePos = backend.getTimePos()
	if (timePos == null) {
		// clock unavailable (e.g. mpv reached EOF) — still check buffer end
		const status = checkBufferEnd(buffer)
		if (status !== 'playing') setState(status)
		return false
	}

	const result = syncFrameToClockPos(
		timePos - seekOffset,
		fps,
		duration > 0 ? duration - seekOffset : 0,
		consumedRef.current,
		buffer,
	)
	consumedRef.current = result.newIndex

	if (result.frameToRender != null) {
		setGrid(renderFrame(result.frameToRender, dims, src, bgColor))
	}

	const status = checkBufferEnd(buffer)
	if (status !== 'playing') setState(status)

	setInfo({ elapsed: timePos, duration, paused: false })
	return result.frameToRender != null
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
	volume,
	muted,
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
	readonly volume: number
	readonly muted: boolean
	readonly onVideoInfo: (info: VideoPlaybackInfo | null) => void
}): ReactNode {
	const loadIdRef = useRef(0)
	const renderPendingRef = useRef(false)
	const [currentGrid, setCurrentGrid] = useState<MergedSpan[][] | null>(null)
	const [gridWidth, setGridWidth] = useState(0)
	const [playbackState, setPlaybackState] = useState<PlaybackState>('loading')

	// cached probe result — survives across seek/resize, only re-probed on src change
	const [probeCache, setProbeCache] = useState<VideoMetadata | null>(null)

	// detected backend kind — cached once per component mount
	const [detectedBackendKind] = useState<'mpv' | 'ffplay'>(() => detectAudioBackend())

	// refs for timer, buffer, and audio backend
	const timerRef = useRef<FrameTimerHandle | null>(null)
	const bufferRef = useRef<RingBuffer | null>(null)
	const backendRef = useRef<AudioBackend | null>(null)
	const consumedFrameIndexRef = useRef(0)

	// audio resync context — ref avoids adding deps to pause effect (ffplay fallback only)
	const audioCtxRef = useRef<{
		absPath: string
		basePath: string
		fps: number
		hasAudio: boolean
		seekOffset: number
	} | null>(null)

	// clear renderPending after React commits (NOT queueMicrotask)
	useEffect(() => {
		renderPendingRef.current = false
	})

	// probe effect — runs once per video source, caches metadata
	useEffect(() => {
		setProbeCache(null)
		setPlaybackState('loading')
		const controller = new AbortController()

		void (async () => {
			const result = await probeVideo(src, basePath, controller.signal)
			if (controller.signal.aborted) return
			if (!result.ok) {
				setPlaybackState('error')
				return
			}
			setProbeCache(result.value)
		})()

		return () => {
			controller.abort()
		}
	}, [src, basePath])

	// audio effect — creates/destroys audio backend.
	// DECOUPLED from stream effect: mpv stays alive across seeks.
	// only re-fires when the video file changes.
	useEffect(() => {
		if (!probeCache?.hasAudio) return

		const { absPath } = probeCache
		let backend: AudioBackend | null = null

		const init = async () => {
			backend = detectedBackendKind === 'mpv' ? createMpvBackend() : createFfplayBackend()

			const result = await backend.play(absPath, basePath, seekOffset)
			if (result.ok) {
				backend.setVolume(volume)
				backend.setMuted(muted)
				backendRef.current = backend
				debug(`audio backend started: ${backend.kind}`)
			} else {
				debug(`audio backend failed: ${result.error}`)
				backend.kill()
				backend = null
			}
		}
		void init()

		return () => {
			backendRef.current = null // null FIRST — prevent stale reads
			if (backend != null) {
				debug('audio effect cleanup: killing backend')
				backend.kill()
			}
		}
	}, [probeCache, basePath, detectedBackendKind])

	// sync volume/mute to backend when they change
	useEffect(() => {
		const backend = backendRef.current
		if (backend?.kind === 'mpv') {
			backend.setVolume(volume)
			backend.setMuted(muted)
		}
	}, [volume, muted])

	// stream effect — ring buffer producer + timer-driven consumer
	// re-fires on seek/resize. backend is NOT managed here.
	useEffect(() => {
		if (probeCache == null) return

		const { absPath } = probeCache
		const dims = computeVideoDimensions(probeCache.width, probeCache.height, maxCols, maxRows)
		if (dims == null) return

		const thisLoadId = ++loadIdRef.current
		const isStale = () => loadIdRef.current !== thisLoadId
		const frameSize = dims.pixelWidth * dims.pixelHeight * 4

		// create ring buffer + timer
		const buffer = createRingBuffer(RING_BUFFER_CAPACITY, frameSize)
		bufferRef.current = buffer
		consumedFrameIndexRef.current = 0

		setGridWidth(dims.termCols)
		setPlaybackState('playing')
		const { fps, hasAudio, duration } = probeCache
		audioCtxRef.current = { absPath, basePath, fps, hasAudio, seekOffset }

		// tell mpv to seek (instant IPC ~1ms) — includes seek-to-0 for replay
		const backend = backendRef.current
		if (backend?.kind === 'mpv') {
			backend.seek(seekOffset)
		}

		const proc = createVideoStream({
			filePath: absPath,
			width: dims.pixelWidth,
			height: dims.pixelHeight,
			fps,
			seekOffset,
		})

		// consumer: timer-driven rendering from ring buffer
		const timer = createFrameTimer({
			delays: [1000 / fps],
			onFrame: () => {
				if (renderPendingRef.current) return // backpressure: skip if React hasn't committed

				const currentBackend = backendRef.current

				// mpv mode: clock-synced frame consumption
				if (currentBackend?.kind === 'mpv') {
					const rendered = consumeMpvFrame(
						currentBackend,
						buffer,
						seekOffset,
						fps,
						duration,
						consumedFrameIndexRef,
						dims,
						src,
						bgColor,
						(grid) => {
							renderPendingRef.current = true
							setCurrentGrid(grid)
						},
						setPlaybackState,
						onVideoInfo,
					)
					if (rendered) renderPendingRef.current = true
					return
				}

				// ffplay mode: sequential read (unchanged)
				const frame = buffer.read()
				if (frame == null) {
					const status = checkBufferEnd(buffer)
					if (status !== 'playing') setPlaybackState(status)
					return
				}

				const grid = renderFrame(frame, dims, src, bgColor)
				renderPendingRef.current = true
				setCurrentGrid(grid)

				const elapsed = seekOffset + timer.tickCount / fps
				onVideoInfo({ elapsed, duration, paused: false })
			},
			loop: true,
		})
		timerRef.current = timer

		// start producer — fills ring buffer from ffmpeg stdout
		void fillRingBuffer({
			stdout: proc.stdout as ReadableStream<Uint8Array>,
			buffer,
			frameSize,
			fps,
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
				consumedFrameIndexRef.current = 1
				const grid = renderFrame(firstFrame, dims, src, bgColor)
				setCurrentGrid(grid)
			}

			// ffplay fallback: start audio here (mpv audio managed by audio effect)
			if (hasAudio && detectedBackendKind === 'ffplay') {
				await playAudio(absPath, basePath, seekOffset)
				if (isStale()) return
			}
			timer.play()
		})()

		return () => {
			loadIdRef.current++ // mark stale
			timer.dispose()
			timerRef.current = null
			buffer.flush()
			bufferRef.current = null
			consumedFrameIndexRef.current = 0
			// force-close pipe reader to prevent stale producer from draining
			void (proc.stdout as ReadableStream<Uint8Array>).cancel().catch(() => {
				/* already closed */
			})
			try {
				proc.kill('SIGKILL')
			} catch {
				/* already dead */
			}
			// NOTE: audio backend is NOT killed here — managed by audio effect
			// only kill ffplay audio if using ffplay backend
			if (detectedBackendKind === 'ffplay') void killActiveAudio()
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

		const backend = backendRef.current
		if (paused) {
			backend?.pause()
			pauseActiveVideo()
			if (detectedBackendKind === 'ffplay') void killActiveAudio()
		} else {
			if (backend != null) void backend.resume()
			resumeActiveVideo()
			resyncFfplayAudio(detectedBackendKind, audioCtxRef.current, timer)
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
	readonly volume: number
	readonly muted: boolean
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
	volume,
	muted,
	mediaCapabilities,
	onFrameInfo,
	onVideoInfo,
}: MediaModalProps): ReactNode {
	const entry = mediaNodes[mediaIndex]
	const node = entry?.node
	const url = node != null ? mediaUrl(node) : undefined
	const ctx = useContext(ImageContext)

	const isVideo = node?.type === 'video' && mediaCapabilities.canPlayVideo
	const isAudio = node?.type === 'audio'

	// clear video playback info when not viewing video (prevents lingering timeline)
	useEffect(() => {
		if (!isVideo) onVideoInfo(null)
	}, [isVideo, mediaIndex])

	// audio-only playback — uses audio backend (mpv or ffplay) when an audio node is shown
	useEffect(() => {
		if (!isAudio || url == null) return
		const basePath = ctx?.basePath ?? process.cwd()
		const absPath = resolve(basePath, url)
		const backendKind = detectAudioBackend()
		const backend = backendKind === 'mpv' ? createMpvBackend() : createFfplayBackend()
		void backend.play(absPath, basePath)
		return () => {
			backend.kill()
		}
	}, [isAudio, url, mediaIndex])

	if (node == null) return null

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
		if (isVideo) {
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
					volume={volume}
					muted={muted}
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
