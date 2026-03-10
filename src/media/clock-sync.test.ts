// tests for clock-synced frame consumption logic.

import { describe, expect, test } from 'bun:test'

import { syncFrameToClockPos, type FrameSyncResult } from './clock-sync.ts'
import { createRingBuffer } from './ring-buffer.ts'

// helper: fill buffer with numbered frames
function fillBuffer(buffer: ReturnType<typeof createRingBuffer>, count: number, frameSize: number) {
	for (let i = 0; i < count; i++) {
		const frame = new Uint8Array(frameSize)
		frame[0] = i // tag frame with index for identification
		buffer.write(frame)
	}
}

describe('syncFrameToClockPos', () => {
	const fps = 10 // 100ms per frame
	const duration = 10 // 10 seconds = 100 frames
	const frameSize = 4

	test('renders frame at target when buffer has it', () => {
		const buffer = createRingBuffer(10, frameSize)
		fillBuffer(buffer, 5, frameSize)

		// time-pos=0.0 → targetFrame=0, currentIndex=0 → read frame 0
		const result = syncFrameToClockPos(0.0, fps, duration, 0, buffer)
		expect(result.newIndex).toBe(1)
		expect(result.frameToRender).not.toBeNull()
		expect(result.frameToRender![0]).toBe(0)
	})

	test('skips frames when behind target', () => {
		const buffer = createRingBuffer(10, frameSize)
		fillBuffer(buffer, 5, frameSize)

		// time-pos=0.3 → targetFrame=3, currentIndex=0 → skip 0,1,2, render 3
		const result = syncFrameToClockPos(0.3, fps, duration, 0, buffer)
		expect(result.newIndex).toBe(4) // consumed through frame 3, next is 4
		expect(result.frameToRender).not.toBeNull()
		expect(result.frameToRender![0]).toBe(3) // rendered frame 3
	})

	test('holds frame when buffer is empty (underrun)', () => {
		const buffer = createRingBuffer(10, frameSize)
		// buffer is empty

		const result = syncFrameToClockPos(0.5, fps, duration, 0, buffer)
		expect(result.newIndex).toBe(0) // didn't advance
		expect(result.frameToRender).toBeNull() // hold
	})

	test('caps skip count at maxSkipsPerTick', () => {
		const buffer = createRingBuffer(20, frameSize)
		fillBuffer(buffer, 15, frameSize)

		// time-pos=1.0 → targetFrame=10, currentIndex=0, maxSkips=3
		const result = syncFrameToClockPos(1.0, fps, duration, 0, buffer, 3)
		// skipped 3 frames, didn't reach target
		expect(result.newIndex).toBe(3)
		expect(result.frameToRender).toBeNull() // still catching up
	})

	test('detects backward clock jump and resets index', () => {
		const buffer = createRingBuffer(10, frameSize)
		fillBuffer(buffer, 5, frameSize)

		// currentIndex=50 but time-pos=0.1 → targetFrame=1 < 50 → backward jump
		const result = syncFrameToClockPos(0.1, fps, duration, 50, buffer)
		expect(result.newIndex).toBe(1) // reset to target
		expect(result.frameToRender).toBeNull() // hold during reset
	})

	test('clamps target to last valid frame', () => {
		const buffer = createRingBuffer(10, frameSize)
		fillBuffer(buffer, 5, frameSize)

		// time-pos far past duration → clamp to last frame
		const result = syncFrameToClockPos(999, fps, duration, 95, buffer)
		// duration=10, fps=10 → totalFrames=100, last valid=99
		// targetFrame = min(9990, 99) = 99
		// 99 >= 95, so skip up to 4 frames (max 5)
		expect(result.newIndex).toBeGreaterThanOrEqual(95)
	})

	test('holds when at target but buffer empty', () => {
		const buffer = createRingBuffer(10, frameSize)
		// put exactly 2 frames
		fillBuffer(buffer, 2, frameSize)

		// time-pos=0.2 → targetFrame=2, currentIndex=0
		// skip frame 0, skip frame 1, try to read frame 2 → null
		const result = syncFrameToClockPos(0.2, fps, duration, 0, buffer)
		expect(result.newIndex).toBe(2) // advanced to target but couldn't read
		expect(result.frameToRender).toBeNull() // hold
	})

	test('handles zero duration gracefully', () => {
		const buffer = createRingBuffer(10, frameSize)
		fillBuffer(buffer, 5, frameSize)

		// duration=0 → totalFrames=MAX_SAFE_INTEGER, no clamping
		const result = syncFrameToClockPos(0.1, fps, 0, 0, buffer)
		expect(result.newIndex).toBe(2) // frame 1 rendered
		expect(result.frameToRender).not.toBeNull()
	})

	test('already at target, renders next frame', () => {
		const buffer = createRingBuffer(10, frameSize)
		fillBuffer(buffer, 5, frameSize)

		// time-pos=0.3 → targetFrame=3, currentIndex=3 → no skip, just read
		const result = syncFrameToClockPos(0.3, fps, duration, 3, buffer)
		expect(result.newIndex).toBe(4)
		expect(result.frameToRender).not.toBeNull()
	})
})
