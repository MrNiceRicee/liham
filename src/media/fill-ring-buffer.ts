// fill ring buffer — producer that reads ffmpeg stdout frames into a ring buffer.
// manages SIGSTOP/SIGCONT hysteresis to throttle ffmpeg when buffer is full.

import type { RingBuffer } from './ring-buffer.ts'
import { readFrames } from './video-decoder.ts'

const debug =
	process.env['LIHAM_DEBUG'] === '1'
		? (msg: string) => process.stderr.write(`[fill-ring-buffer] ${msg}\n`)
		: () => {}

// SIGSTOP at 90% full, SIGCONT at 50% capacity — prevents signal storms
const SIGSTOP_THRESHOLD = 0.9
const SIGCONT_THRESHOLD = 0.5


export type ProducerEvent =
	| { type: 'progress'; elapsed: number }
	| { type: 'ended' }
	| { type: 'error'; reason: string }

export interface FillOptions {
	stdout: ReadableStream<Uint8Array>
	buffer: RingBuffer
	frameSize: number
	fps: number
	pid: number
	isStale: () => boolean
	onEvent: (event: ProducerEvent) => void
}

// extracted: manages SIGSTOP/SIGCONT hysteresis for a process
function createSignalThrottle(pid: number, buffer: RingBuffer) {
	let stopped = false
	return {
		get stopped() {
			return stopped
		},
		maybePause() {
			if (stopped) return
			if (buffer.length / buffer.capacity >= SIGSTOP_THRESHOLD) {
				try {
					process.kill(pid, 'SIGSTOP')
					stopped = true
					debug(`SIGSTOP pid=${String(pid)} fill=${String(Math.round((buffer.length / buffer.capacity) * 100))}%`)
				} catch {
					/* process already dead */
				}
			}
		},
		maybeResume() {
			if (!stopped) return
			if (buffer.length / buffer.capacity <= SIGCONT_THRESHOLD) {
				try {
					process.kill(pid, 'SIGCONT')
					stopped = false
					debug(`SIGCONT pid=${String(pid)} fill=${String(Math.round((buffer.length / buffer.capacity) * 100))}%`)
				} catch {
					/* process already dead */
				}
			}
		},
		ensureResumed() {
			if (!stopped) return
			try {
				process.kill(pid, 'SIGCONT')
			} catch {
				/* already dead */
			}
		},
	}
}

export async function fillRingBuffer({
	stdout,
	buffer,
	frameSize,
	fps,
	pid,
	isStale,
	onEvent,
}: FillOptions): Promise<void> {
	let framesWritten = 0
	const throttle = createSignalThrottle(pid, buffer)

	try {
		for await (const rgba of readFrames(stdout, frameSize)) {
			if (isStale()) break

			throttle.maybePause()
			const ok = await buffer.write(rgba)
			if (!ok || isStale()) break
			throttle.maybeResume()

			framesWritten++
			if (framesWritten % 10 === 1) {
				onEvent({ type: 'progress', elapsed: framesWritten / fps })
			}
		}

		if (!isStale()) {
			buffer.markEnded()
			onEvent({ type: 'ended' })
			debug(`ended after ${String(framesWritten)} frames`)
		}
	} catch (err) {
		if (!isStale()) {
			const reason = err instanceof Error ? err.message : 'pipe error'
			buffer.markError(reason)
			onEvent({ type: 'error', reason })
			debug(`error: ${reason}`)
		}
	} finally {
		// ensure ffmpeg is resumed before we return (stopped processes can't handle signals)
		throttle.ensureResumed()
	}
}

// consumer helper — check if buffer has drained and video ended
export function checkBufferEnd(buffer: RingBuffer): 'playing' | 'ended' | 'error' {
	if (buffer.errored) return 'error'
	if (buffer.ended && buffer.empty) return 'ended'
	return 'playing'
}
