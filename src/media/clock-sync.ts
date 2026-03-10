// clock sync — pure function for syncing frame display to an external clock.
// used by mpv backend to skip/hold frames in the ring buffer based on time-pos.

import type { RingBuffer } from './ring-buffer.ts'

export interface FrameSyncResult {
	newIndex: number
	frameToRender: Uint8Array | null
}

// maximum frames to skip in a single tick — prevents blocking the event loop
// on large jumps. realistic skip is 2-3 frames from setTimeout jitter.
const DEFAULT_MAX_SKIPS = 5

/**
 * sync frame consumption to an external clock position.
 *
 * - behind target: skip (read and discard) until caught up or max skips reached
 * - at target: read and render
 * - ahead of buffer: hold current displayed frame (return null)
 * - backward clock jump: reset index, return null (caller should hold last frame)
 */
export function syncFrameToClockPos(
	timePos: number,
	fps: number,
	duration: number,
	currentIndex: number,
	buffer: RingBuffer,
	maxSkipsPerTick = DEFAULT_MAX_SKIPS,
): FrameSyncResult {
	const totalFrames = duration > 0 ? Math.floor(duration * fps) : Number.MAX_SAFE_INTEGER
	const targetFrame = Math.min(Math.floor(timePos * fps), totalFrames - 1)

	// backward clock jump (timestamp discontinuity) — reset
	if (targetFrame < currentIndex) {
		return { newIndex: targetFrame, frameToRender: null }
	}

	// skip: discard frames behind target
	let index = currentIndex
	let skipped = 0
	while (index < targetFrame && skipped < maxSkipsPerTick) {
		const frame = buffer.read()
		if (frame == null) break // buffer underrun
		index++
		skipped++
	}

	// render: at target, read and display
	if (index === targetFrame) {
		const frame = buffer.read()
		if (frame != null) {
			return { newIndex: index + 1, frameToRender: frame }
		}
	}

	// hold: buffer hasn't caught up
	return { newIndex: index, frameToRender: null }
}
