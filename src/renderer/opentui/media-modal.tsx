// media modal overlay — full-screen media viewer.
// absolute positioned sibling of scrollbox content (does not scroll with content).
// media info (filename, type, frame count) lives in the gallery panel, not here.

import { resolve } from 'node:path'
import { type ReactNode, useContext, useEffect, useRef, useState } from 'react'

import type { MediaIRNode } from '../../ir/types.ts'
import {
	killActiveAudio,
	pauseActiveAudio,
	playAudio,
	resumeActiveAudio,
} from '../../media/ffplay.ts'
import { type MergedSpan, renderHalfBlockMerged } from '../../media/halfblock.ts'
import type { LoadedImage, MediaCapabilities } from '../../media/types.ts'
import {
	type VideoMetadata,
	computeVideoDimensions,
	createVideoStream,
	pauseActiveVideo,
	probeVideo,
	readFrames,
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

// -- video frame processing (extracted to reduce cognitive complexity) --

interface FrameLoopContext {
	proc: ReturnType<typeof Bun.spawn>
	dims: VideoDimensions
	fps: number
	duration: number
	seekOffset: number
	bgColor: string
	src: string
	isStale: () => boolean
	isPaused: () => boolean
	renderPendingRef: React.RefObject<boolean>
	setCurrentGrid: (grid: MergedSpan[][]) => void
	setGridWidth: (w: number) => void
	setPlaybackState: (s: PlaybackState) => void
	onVideoInfo: (info: VideoPlaybackInfo | null) => void
}

async function runFrameLoop(ctx: FrameLoopContext): Promise<void> {
	ctx.setPlaybackState('playing')
	ctx.setGridWidth(ctx.dims.termCols)
	const frameSize = ctx.dims.pixelWidth * ctx.dims.pixelHeight * 4
	let frameCount = 0
	const frameIntervalMs = 1000 / ctx.fps
	let nextFrameAt = Date.now()

	for await (const rgba of readFrames(ctx.proc.stdout as ReadableStream<Uint8Array>, frameSize)) {
		if (ctx.isStale()) break

		// spin-wait while paused — stops consumption → pipe fills → ffmpeg blocks on write.
		// SIGSTOP also sent for CPU savings, but backpressure is the primary mechanism.
		if (ctx.isPaused()) {
			while (ctx.isPaused() && !ctx.isStale()) {
				await new Promise((r) => setTimeout(r, 50))
			}
			if (ctx.isStale()) break
			nextFrameAt = Date.now() + frameIntervalMs // reset pacing after resume
			continue
		}

		// application-level frame pacing (replaces ffmpeg -re which breaks SIGSTOP)
		const now = Date.now()
		const delay = nextFrameAt - now
		if (delay > 0) await new Promise((r) => setTimeout(r, delay))
		nextFrameAt = Math.max(Date.now(), nextFrameAt) + frameIntervalMs

		frameCount++

		// report elapsed time every ~10 frames
		if (frameCount % 10 === 1) {
			const elapsed = ctx.seekOffset + frameCount / ctx.fps
			ctx.onVideoInfo({ elapsed, duration: ctx.duration, paused: false })
		}

		if (ctx.renderPendingRef.current) continue // frame skip

		const image: LoadedImage = {
			rgba,
			width: ctx.dims.pixelWidth,
			height: ctx.dims.pixelHeight,
			terminalCols: ctx.dims.termCols,
			terminalRows: ctx.dims.termRows,
			byteSize: rgba.byteLength,
			source: ctx.src,
		}
		const grid = renderHalfBlockMerged(image, ctx.bgColor)
		ctx.renderPendingRef.current = true
		ctx.setCurrentGrid(grid)
	}

	if (!ctx.isStale()) {
		const exitCode = await ctx.proc.exited
		ctx.setPlaybackState(exitCode === 0 ? 'ended' : 'error')
	}
}

// -- modal video content --

type PlaybackState = 'loading' | 'playing' | 'error' | 'ended'

type VideoDimensions = NonNullable<ReturnType<typeof computeVideoDimensions>>

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
	const pausedRef = useRef(paused)
	pausedRef.current = paused
	const renderPendingRef = useRef(false)
	const [currentGrid, setCurrentGrid] = useState<MergedSpan[][] | null>(null)
	const [gridWidth, setGridWidth] = useState(0)
	const [playbackState, setPlaybackState] = useState<PlaybackState>('loading')

	// cached probe result — survives across seek/resize, only re-probed on src change
	const [probeCache, setProbeCache] = useState<{ meta: VideoMetadata; absPath: string } | null>(null)

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

	// stream effect — starts ffmpeg + audio, runs frame loop.
	// depends on probe cache + dimensions + seek position.
	useEffect(() => {
		if (probeCache == null) return // probe not ready yet

		const { meta, absPath } = probeCache
		const dims = computeVideoDimensions(meta.width, meta.height, maxCols, maxRows)
		if (dims == null) return

		const thisLoadId = ++loadIdRef.current
		const isStale = () => loadIdRef.current !== thisLoadId
		let proc: ReturnType<typeof Bun.spawn> | null = null
		let audioStarted = false

		void (async () => {
			proc = createVideoStream({
				filePath: absPath,
				width: dims.pixelWidth,
				height: dims.pixelHeight,
				fps: meta.fps,
				seekOffset,
			})

			if (meta.hasAudio) {
				await playAudio(absPath, basePath, seekOffset)
				audioStarted = true
			}

			debug(`after createVideoStream: pausedRef=${String(pausedRef.current)}`)
			if (pausedRef.current) {
				pauseActiveVideo()
				pauseActiveAudio()
			}
			await runFrameLoop({
				proc, dims, fps: meta.fps, duration: meta.duration, seekOffset,
				bgColor, src, isStale, isPaused: () => pausedRef.current,
				renderPendingRef, setCurrentGrid,
				setGridWidth, setPlaybackState, onVideoInfo,
			})
		})()

		return () => {
			loadIdRef.current++ // mark stale
			if (proc != null) {
				try {
					proc.kill('SIGKILL')
				} catch {
					/* already dead */
				}
			}
			if (audioStarted) void killActiveAudio()
		}
	}, [probeCache, maxCols, maxRows, restartCount, seekOffset])

	// react to external pause/resume toggle
	useEffect(() => {
		debug(`pause effect: paused=${String(paused)}`)
		if (paused) {
			pauseActiveVideo()
			pauseActiveAudio()
		} else {
			resumeActiveVideo()
			resumeActiveAudio()
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
