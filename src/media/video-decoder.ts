// video decoder — ffprobe metadata, ffmpeg frame streaming, dimension calculation.

import { extractError, safeKill, safeSendSignal } from '../utils/error.ts'
import { sanitizeMediaPath } from './ffplay.ts'
import type { ImageResult } from './types.ts'

const debug =
	process.env['LIHAM_DEBUG'] === '1'
		? (msg: string) => process.stderr.write(`[video-decoder] ${msg}\n`)
		: () => {}

// -- types --

export interface VideoMetadata {
	width: number
	height: number
	fps: number
	duration: number // seconds, 0 if unknown
	hasAudio: boolean
	absPath: string // sanitized absolute path from sanitizeMediaPath
}

export interface VideoStreamOptions {
	filePath: string
	width: number // target pixel width (= terminal cols), max 2048
	height: number // target pixel height (= terminal rows * 2, must be even), max 2048
	fps: number // target fps (default 10)
	seekOffset?: number // -ss value in seconds (input-level seek)
}

export interface VideoDimensions {
	pixelWidth: number // for ffmpeg -vf scale
	pixelHeight: number // always even
	termCols: number // 1 col = 1 pixel
	termRows: number // 1 row = 2 pixels
}

// -- constants --

const PROBE_TIMEOUT_MS = 5_000
const PROBE_MAX_STDOUT = 65_536 // 64KB cap on ffprobe output
const MAX_FFPROBE_DIMENSION = 16_384 // sanity check on raw metadata
const MAX_FFMPEG_DIMENSION = 2_048 // effective cap for ffmpeg output
const DEFAULT_FPS = 10
const MAX_FPS = 60

// -- ffprobe metadata extraction --

function parseFraction(value: string): number {
	const parts = value.split('/')
	if (parts.length !== 2) return NaN
	const num = Number(parts[0])
	const den = Number(parts[1])
	if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return NaN
	return num / den
}

function parseFps(raw: unknown): number {
	if (typeof raw !== 'string' || raw.length === 0) return DEFAULT_FPS
	const value = raw.includes('/') ? parseFraction(raw) : Number(raw)
	if (!Number.isFinite(value) || value <= 0) return DEFAULT_FPS
	return Math.min(value, MAX_FPS)
}

function parseDuration(raw: unknown): number {
	if (typeof raw !== 'string' || raw === 'N/A' || raw.length === 0) return 0
	const value = Number(raw)
	if (!Number.isFinite(value) || value < 0) return 0
	return value
}

async function probeAudioStream(absPath: string, signal?: AbortSignal): Promise<boolean> {
	try {
		const audioProc = Bun.spawn(
			[
				'ffprobe',
				'-v',
				'quiet',
				'-print_format',
				'json',
				'-select_streams',
				'a:0',
				'-show_entries',
				'stream=codec_type',
				absPath,
			],
			{ stdin: 'ignore', stdout: 'pipe', stderr: 'ignore' },
		)

		if (signal != null) {
			signal.addEventListener('abort', () => safeKill(audioProc), { once: true })
		}

		const audioExited = audioProc.exited
		const audioTimeout = new Promise<'timeout'>((r) =>
			setTimeout(() => r('timeout'), PROBE_TIMEOUT_MS),
		)
		const audioRace = await Promise.race([audioExited, audioTimeout])

		if (audioRace === 'timeout') {
			safeKill(audioProc)
			return false
		}

		if (signal?.aborted) {
			return false
		}

		const audioStdout = await new Response(audioProc.stdout).text()
		const audioJson = JSON.parse(audioStdout) as Record<string, unknown>
		const audioStreams = audioJson['streams'] as Array<Record<string, unknown>> | undefined
		return audioStreams != null && audioStreams.length > 0
	} catch {
		return false
	}
}

export async function probeVideo(
	filePath: string,
	basePath: string,
	signal?: AbortSignal,
): Promise<ImageResult<VideoMetadata>> {
	const sanitized = sanitizeMediaPath(filePath, basePath)
	if (!sanitized.ok) {
		return { ok: false, error: sanitized.error }
	}

	const absPath = sanitized.value

	// probe video stream metadata
	let videoJson: Record<string, unknown>
	try {
		const proc = Bun.spawn(
			[
				'ffprobe',
				'-v',
				'quiet',
				'-print_format',
				'json',
				'-select_streams',
				'v:0',
				'-show_entries',
				'stream=width,height,r_frame_rate,avg_frame_rate,duration',
				'-show_entries',
				'format=duration',
				absPath,
			],
			{ stdin: 'ignore', stdout: 'pipe', stderr: 'ignore' },
		)

		if (signal != null) {
			signal.addEventListener('abort', () => safeKill(proc), { once: true })
		}

		const exited = proc.exited
		const timeout = new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), PROBE_TIMEOUT_MS))
		const race = await Promise.race([exited, timeout])

		if (race === 'timeout') {
			safeKill(proc)
			return { ok: false, error: 'ffprobe timed out' }
		}

		if (signal?.aborted) {
			return { ok: false, error: 'aborted' }
		}

		const stdout = await new Response(proc.stdout).text()
		if (stdout.length > PROBE_MAX_STDOUT) {
			return { ok: false, error: 'ffprobe output too large' }
		}

		videoJson = JSON.parse(stdout) as Record<string, unknown>
	} catch (err) {
		return { ok: false, error: extractError(err, 'ffprobe failed') }
	}

	// extract video stream info
	const streams = videoJson['streams'] as Array<Record<string, unknown>> | undefined
	const stream = streams?.[0]
	const format = videoJson['format'] as Record<string, unknown> | undefined

	if (stream == null) {
		return { ok: false, error: 'no video stream' }
	}

	const width = Number(stream['width'])
	const height = Number(stream['height'])

	if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
		return { ok: false, error: 'invalid video dimensions' }
	}

	if (width > MAX_FFPROBE_DIMENSION || height > MAX_FFPROBE_DIMENSION) {
		return { ok: false, error: 'video dimensions exceed limit' }
	}

	// prefer avg_frame_rate for display, fall back to r_frame_rate
	const fps =
		parseFps(stream['avg_frame_rate']) !== DEFAULT_FPS
			? parseFps(stream['avg_frame_rate'])
			: parseFps(stream['r_frame_rate'])

	// prefer stream duration, fall back to format duration
	const duration = parseDuration(stream['duration']) || parseDuration(format?.['duration'])

	// probe for audio stream
	const hasAudio = await probeAudioStream(absPath, signal)

	return {
		ok: true,
		value: { width, height, fps, duration, hasAudio, absPath },
	}
}

// -- dimension calculation --

export function computeVideoDimensions(
	videoWidth: number,
	videoHeight: number,
	termWidth: number,
	termHeight: number, // available height minus chrome
): VideoDimensions | null {
	// fit within terminal pixel box: termWidth × (termHeight * 2)
	const maxPixelW = termWidth
	const maxPixelH = termHeight * 2

	const scaleW = maxPixelW / videoWidth
	const scaleH = maxPixelH / videoHeight
	const scale = Math.min(scaleW, scaleH, 1) // don't upscale

	let pixelWidth = Math.round(videoWidth * scale)
	let pixelHeight = Math.round(videoHeight * scale)

	// enforce even height (round down)
	if (pixelHeight % 2 !== 0) pixelHeight--

	// enforce max ffmpeg dimensions
	pixelWidth = Math.min(pixelWidth, MAX_FFMPEG_DIMENSION)
	pixelHeight = Math.min(pixelHeight, MAX_FFMPEG_DIMENSION)
	if (pixelHeight % 2 !== 0) pixelHeight--

	const termCols = pixelWidth
	const termRows = pixelHeight / 2

	// minimum viable: 20 cols × 5 rows
	if (termCols < 20 || termRows < 5) return null

	return { pixelWidth, pixelHeight, termCols, termRows }
}

// -- frame streaming --

let activeVideoProc: ReturnType<typeof Bun.spawn> | null = null
let videoStopped = false

export function pauseActiveVideo(): void {
	debug(
		`pauseActiveVideo: proc=${String(activeVideoProc != null)}, stopped=${String(videoStopped)}, pid=${String(activeVideoProc?.pid)}`,
	)
	if (activeVideoProc != null && !videoStopped) {
		safeSendSignal(activeVideoProc.pid, 'SIGSTOP')
		videoStopped = true
	}
}

export function resumeActiveVideo(): void {
	debug(
		`resumeActiveVideo: proc=${String(activeVideoProc != null)}, stopped=${String(videoStopped)}, pid=${String(activeVideoProc?.pid)}`,
	)
	if (activeVideoProc != null && videoStopped) {
		safeSendSignal(activeVideoProc.pid, 'SIGCONT')
		videoStopped = false
	}
}

export async function killActiveVideo(): Promise<void> {
	if (activeVideoProc == null) return
	const proc = activeVideoProc
	activeVideoProc = null
	// must resume stopped process before SIGTERM (stopped processes can't handle signals)
	if (videoStopped) {
		proc.kill('SIGCONT')
		videoStopped = false
	}
	proc.kill('SIGTERM')
	await Promise.race([proc.exited, new Promise((r) => setTimeout(r, 500))])
	safeKill(proc)
}

export function createVideoStream(options: VideoStreamOptions): ReturnType<typeof Bun.spawn> {
	const { filePath, width, height, fps, seekOffset } = options

	// defense-in-depth: reject unsanitized paths
	if (filePath.length === 0 || filePath.startsWith('-')) {
		throw new Error('invalid path')
	}

	// validate seekOffset
	if (seekOffset != null && (!Number.isFinite(seekOffset) || seekOffset < 0)) {
		throw new Error('invalid seek offset')
	}

	// validate dimensions
	if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
		throw new Error('invalid video stream dimensions')
	}
	if (width > MAX_FFMPEG_DIMENSION || height > MAX_FFMPEG_DIMENSION) {
		throw new Error('video stream dimensions exceed limit')
	}
	if (height % 2 !== 0) {
		throw new Error('video stream height must be even')
	}

	const clampedFps = Math.min(Math.max(1, fps), MAX_FPS)
	const vf = `scale=${Math.round(width)}:${Math.round(height)},fps=${clampedFps}`

	// kill any existing video process before starting new
	if (activeVideoProc != null) {
		if (videoStopped) safeKill(activeVideoProc, 'SIGCONT')
		safeKill(activeVideoProc)
		activeVideoProc = null
		videoStopped = false
	}

	// build args — prepend -ss before -i for input-level seek (fast keyframe seeking)
	// no -re: pacing is application-controlled via frame-interval sleep in runFrameLoop.
	// -re uses wall clock, which breaks SIGSTOP pause (ffmpeg catches up on resume).
	const args = ['ffmpeg', '-v', 'quiet']
	if (seekOffset != null && seekOffset > 0) {
		args.push('-ss', String(seekOffset))
	}
	args.push('-i', filePath, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-vf', vf, 'pipe:1')

	const proc = Bun.spawn(args, { stdin: 'ignore', stdout: 'pipe', stderr: 'ignore' })

	activeVideoProc = proc

	// clean up reference when process exits + reset stopped flag
	void proc.exited.then(() => {
		if (activeVideoProc === proc) {
			activeVideoProc = null
			videoStopped = false
		}
	})

	return proc
}

// async generator for frame accumulation — pre-allocated buffer, no array concat
export async function* readFrames(
	stdout: ReadableStream<Uint8Array>,
	frameSize: number,
): AsyncGenerator<Uint8Array> {
	const buffer = new Uint8Array(frameSize)
	let offset = 0

	const reader = stdout.getReader()
	try {
		for (;;) {
			const { done, value: chunk } = await reader.read()
			if (done) break

			let chunkOffset = 0
			while (chunkOffset < chunk.length) {
				const remaining = frameSize - offset
				const toCopy = Math.min(remaining, chunk.length - chunkOffset)
				buffer.set(chunk.subarray(chunkOffset, chunkOffset + toCopy), offset)
				offset += toCopy
				chunkOffset += toCopy

				if (offset === frameSize) {
					yield new Uint8Array(buffer) // copy out so caller can hold reference
					offset = 0
				}
			}
		}
	} finally {
		reader.releaseLock()
	}
	// partial frame at end deliberately discarded
}

// -- thumbnail extraction --

const THUMBNAIL_TIMEOUT_MS = 5_000
const THUMBNAIL_MAX_BYTES = 5 * 1024 * 1024 // 5MB cap on thumbnail output

export async function extractVideoThumbnail(
	filePath: string,
	basePath: string,
	signal?: AbortSignal,
): Promise<ImageResult<Uint8Array>> {
	const sanitized = sanitizeMediaPath(filePath, basePath)
	if (!sanitized.ok) {
		return { ok: false, error: sanitized.error }
	}

	const absPath = sanitized.value

	try {
		const proc = Bun.spawn(
			[
				'ffmpeg',
				'-v',
				'quiet',
				'-ss',
				'0',
				'-i',
				absPath,
				'-vframes',
				'1',
				'-f',
				'image2pipe',
				'-vcodec',
				'png',
				'pipe:1',
			],
			{ stdin: 'ignore', stdout: 'pipe', stderr: 'ignore' },
		)

		if (signal != null) {
			signal.addEventListener('abort', () => safeKill(proc), { once: true })
		}

		const exited = proc.exited
		const timeout = new Promise<'timeout'>((r) =>
			setTimeout(() => r('timeout'), THUMBNAIL_TIMEOUT_MS),
		)
		const race = await Promise.race([exited, timeout])

		if (race === 'timeout') {
			safeKill(proc)
			return { ok: false, error: 'thumbnail extraction timed out' }
		}

		if (signal?.aborted) {
			return { ok: false, error: 'aborted' }
		}

		const chunks: Uint8Array[] = []
		let totalLen = 0
		const reader = proc.stdout.getReader()
		for (;;) {
			const { done, value } = await reader.read()
			if (done) break
			totalLen += value.byteLength
			if (totalLen > THUMBNAIL_MAX_BYTES) {
				reader.releaseLock()
				safeKill(proc)
				return { ok: false, error: 'thumbnail too large' }
			}
			chunks.push(value)
		}
		reader.releaseLock()

		if (totalLen === 0) {
			return { ok: false, error: 'no thumbnail data' }
		}

		const result = new Uint8Array(totalLen)
		let offset = 0
		for (const chunk of chunks) {
			result.set(chunk, offset)
			offset += chunk.byteLength
		}

		return { ok: true, value: result }
	} catch (err) {
		return { ok: false, error: extractError(err, 'thumbnail extraction failed') }
	}
}

// kill video on process exit — prevents orphaned ffmpeg
process.on('exit', () => {
	if (activeVideoProc != null) safeKill(activeVideoProc)
})
