// fill ring buffer — producer that reads ffmpeg stdout frames into a ring buffer.
// relies on ring buffer backpressure + OS pipe backpressure for flow control.

import type { RingBuffer } from './ring-buffer.ts'
import { readFrames } from './video-decoder.ts'

const debug =
	process.env['LIHAM_DEBUG'] === '1'
		? (msg: string) => process.stderr.write(`[fill-ring-buffer] ${msg}\n`)
		: () => {}

export type ProducerEvent =
	| { type: 'progress'; elapsed: number }
	| { type: 'ended' }
	| { type: 'error'; reason: string }

export interface FillOptions {
	stdout: ReadableStream<Uint8Array>
	buffer: RingBuffer
	frameSize: number
	fps: number
	isStale: () => boolean
	onEvent: (event: ProducerEvent) => void
}

export async function fillRingBuffer({
	stdout,
	buffer,
	frameSize,
	fps,
	isStale,
	onEvent,
}: FillOptions): Promise<void> {
	let framesWritten = 0

	try {
		for await (const rgba of readFrames(stdout, frameSize)) {
			if (isStale()) break

			const ok = await buffer.write(rgba)
			if (!ok || isStale()) break

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
	}
}

// consumer helper — check if buffer has drained and video ended
export function checkBufferEnd(buffer: RingBuffer): 'playing' | 'ended' | 'error' {
	if (buffer.errored) return 'error'
	if (buffer.ended && buffer.empty) return 'ended'
	return 'playing'
}
