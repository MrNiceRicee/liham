// video decoder — ffprobe metadata, ffmpeg frame streaming, dimension calculation.

import type { ImageResult } from './types.ts'

import { sanitizeMediaPath } from './ffplay.ts'

// -- types --

export interface VideoMetadata {
	width: number
	height: number
	fps: number
	duration: number // seconds, 0 if unknown
	hasAudio: boolean
}

export interface VideoStreamOptions {
	filePath: string
	width: number // target pixel width (= terminal cols), max 2048
	height: number // target pixel height (= terminal rows * 2, must be even), max 2048
	fps: number // target fps (default 10)
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

export async function probeVideo(
	filePath: string,
	basePath: string,
	signal?: AbortSignal,
): Promise<ImageResult<VideoMetadata>> {
	const sanitized = sanitizeMediaPath(filePath, basePath)
	if (!sanitized.ok) {
		return { ok: false, error: sanitized.error ?? 'invalid path' }
	}

	const absPath = sanitized.path!

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
			signal.addEventListener(
				'abort',
				() => {
					try {
						proc.kill('SIGKILL')
					} catch {
						/* already dead */
					}
				},
				{ once: true },
			)
		}

		const exited = proc.exited
		const timeout = new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), PROBE_TIMEOUT_MS))
		const race = await Promise.race([exited, timeout])

		if (race === 'timeout') {
			try {
				proc.kill('SIGKILL')
			} catch {
				/* already dead */
			}
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
		const message = err instanceof Error ? err.message : 'ffprobe failed'
		return { ok: false, error: message }
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
	let hasAudio = false
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
			signal.addEventListener(
				'abort',
				() => {
					try {
						audioProc.kill('SIGKILL')
					} catch {
						/* already dead */
					}
				},
				{ once: true },
			)
		}

		const audioExited = audioProc.exited
		const audioTimeout = new Promise<'timeout'>((r) =>
			setTimeout(() => r('timeout'), PROBE_TIMEOUT_MS),
		)
		const audioRace = await Promise.race([audioExited, audioTimeout])

		if (audioRace === 'timeout') {
			try {
				audioProc.kill('SIGKILL')
			} catch {
				/* already dead */
			}
			// audio detection failed, continue without audio
		} else if (!signal?.aborted) {
			const audioStdout = await new Response(audioProc.stdout).text()
			const audioJson = JSON.parse(audioStdout) as Record<string, unknown>
			const audioStreams = audioJson['streams'] as Array<Record<string, unknown>> | undefined
			hasAudio = audioStreams != null && audioStreams.length > 0
		}
	} catch {
		// audio detection failed — continue without audio
	}

	return {
		ok: true,
		value: { width, height, fps, duration, hasAudio },
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

export async function killActiveVideo(): Promise<void> {
	if (activeVideoProc == null) return
	const proc = activeVideoProc
	activeVideoProc = null
	proc.kill('SIGTERM')
	await Promise.race([proc.exited, new Promise((r) => setTimeout(r, 500))])
	try {
		proc.kill('SIGKILL')
	} catch {
		// already exited
	}
}

export function createVideoStream(options: VideoStreamOptions): ReturnType<typeof Bun.spawn> {
	const { filePath, width, height, fps } = options

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
		try {
			activeVideoProc.kill('SIGKILL')
		} catch {
			/* already dead */
		}
		activeVideoProc = null
	}

	const proc = Bun.spawn(
		[
			'ffmpeg',
			'-re',
			'-readrate_initial_burst',
			'0.5',
			'-v',
			'quiet',
			'-i',
			filePath,
			'-f',
			'rawvideo',
			'-pix_fmt',
			'rgba',
			'-vf',
			vf,
			'pipe:1',
		],
		{ stdin: 'ignore', stdout: 'pipe', stderr: 'ignore' },
	)

	activeVideoProc = proc

	// clean up reference when process exits
	void proc.exited.then(() => {
		if (activeVideoProc === proc) activeVideoProc = null
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

	for await (const chunk of stdout) {
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
	// partial frame at end deliberately discarded
}

// kill video on process exit — prevents orphaned ffmpeg
process.on('exit', () => {
	if (activeVideoProc != null) {
		try {
			activeVideoProc.kill('SIGKILL')
		} catch {
			// ignore
		}
	}
})
