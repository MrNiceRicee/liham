// integration tests — ring buffer + frame timer working together.
// verifies the consumer-driven rendering pipeline behaves correctly.

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { checkBufferEnd } from './fill-ring-buffer.ts'
import { createFrameTimer } from './frame-timer.ts'
import { createRingBuffer } from './ring-buffer.ts'

const FRAME_SIZE = 16

function makeFrame(value: number): Uint8Array {
	const f = new Uint8Array(FRAME_SIZE)
	f.fill(value)
	return f
}

// fake timers
let pendingTimers: { callback: () => void; delay: number; id: number }[] = []
let nextTimerId = 1
let mockNow = 0

function flushNextTimer() {
	if (pendingTimers.length === 0) return
	const next = pendingTimers.reduce((a, b) => (a.delay < b.delay ? a : b), pendingTimers[0]!)
	const advance = Math.max(0, next.delay - mockNow)
	mockNow += advance
	let processed = true
	while (processed) {
		processed = false
		const ready = pendingTimers.filter((t) => t.delay <= mockNow)
		if (ready.length > 0) {
			const timer = ready[0]!
			pendingTimers = pendingTimers.filter((t) => t !== timer)
			timer.callback()
			processed = true
		}
	}
}

beforeEach(() => {
	pendingTimers = []
	nextTimerId = 1
	mockNow = 0
	// @ts-expect-error -- replacing global setTimeout for test control
	globalThis.setTimeout = (cb: () => void, delay: number) => {
		const id = nextTimerId++
		pendingTimers.push({ callback: cb, delay: mockNow + delay, id })
		return id
	}
	// @ts-expect-error -- replacing global clearTimeout for test control
	globalThis.clearTimeout = (id: number) => {
		pendingTimers = pendingTimers.filter((t) => t.id !== id)
	}
	performance.now = () => mockNow
})

afterEach(() => {})

describe('ring buffer + timer integration', () => {
	test('timer reads frames from buffer and fires callbacks', () => {
		const buffer = createRingBuffer(4, FRAME_SIZE)
		const frames: number[] = []

		// pre-fill buffer with 3 frames
		const r1 = buffer.write(makeFrame(10))
		const r2 = buffer.write(makeFrame(20))
		const r3 = buffer.write(makeFrame(30))
		expect(r1).toBe(true)
		expect(r2).toBe(true)
		expect(r3).toBe(true)

		const timer = createFrameTimer({
			delays: [33], // ~30fps
			onFrame: () => {
				const frame = buffer.read()
				if (frame != null) frames.push(frame[0]!)
			},
			loop: true,
		})

		timer.play() // reads frame immediately
		expect(frames).toEqual([10])

		flushNextTimer() // tick 1
		expect(frames).toEqual([10, 20])

		flushNextTimer() // tick 2
		expect(frames).toEqual([10, 20, 30])

		// buffer empty — underrun
		flushNextTimer()
		expect(frames).toEqual([10, 20, 30]) // no new frame

		timer.dispose()
	})

	test('pause stops consuming, resume continues', () => {
		const buffer = createRingBuffer(4, FRAME_SIZE)
		const r1 = buffer.write(makeFrame(1))
		const r2 = buffer.write(makeFrame(2))
		const r3 = buffer.write(makeFrame(3))
		expect(r1).toBe(true)
		expect(r2).toBe(true)
		expect(r3).toBe(true)

		const frames: number[] = []
		const timer = createFrameTimer({
			delays: [33],
			onFrame: () => {
				const frame = buffer.read()
				if (frame != null) frames.push(frame[0]!)
			},
			loop: true,
		})

		timer.play() // reads frame 1
		expect(frames).toEqual([1])

		timer.pause()
		flushNextTimer() // should not fire
		expect(frames).toEqual([1])

		timer.play() // resumes, reads frame 2 immediately
		expect(frames).toEqual([1, 2])

		flushNextTimer() // tick, reads frame 3
		expect(frames).toEqual([1, 2, 3])

		timer.dispose()
	})

	test('checkBufferEnd detects end-of-stream', () => {
		const buffer = createRingBuffer(4, FRAME_SIZE)
		const r = buffer.write(makeFrame(1))
		expect(r).toBe(true)

		expect(checkBufferEnd(buffer)).toBe('playing')

		buffer.markEnded()
		expect(checkBufferEnd(buffer)).toBe('playing') // not empty yet

		buffer.read() // drain
		expect(checkBufferEnd(buffer)).toBe('ended') // ended + empty

		buffer.flush()
		buffer.markError('test error')
		expect(checkBufferEnd(buffer)).toBe('error')
	})

	test('flush during playback resets buffer for seek', () => {
		const buffer = createRingBuffer(4, FRAME_SIZE)
		const r1 = buffer.write(makeFrame(10))
		const r2 = buffer.write(makeFrame(20))
		expect(r1).toBe(true)
		expect(r2).toBe(true)

		// simulate seek: flush buffer
		buffer.flush()
		expect(buffer.empty).toBe(true)
		expect(buffer.ended).toBe(false)

		// new frames from seeked position
		const r3 = buffer.write(makeFrame(50))
		expect(r3).toBe(true)

		const frame = buffer.read()
		expect(frame).not.toBeNull()
		expect(frame![0]).toBe(50) // new frame, not stale
	})

	test('tickCount tracks consumer progress for elapsed time', () => {
		const buffer = createRingBuffer(4, FRAME_SIZE)
		const r1 = buffer.write(makeFrame(1))
		const r2 = buffer.write(makeFrame(2))
		const r3 = buffer.write(makeFrame(3))
		expect(r1).toBe(true)
		expect(r2).toBe(true)
		expect(r3).toBe(true)

		const timer = createFrameTimer({
			delays: [100],
			onFrame: () => {
				buffer.read()
			},
			loop: true,
		})

		timer.play()
		expect(timer.tickCount).toBe(0) // play fires onFrame but doesn't increment tickCount

		flushNextTimer()
		expect(timer.tickCount).toBe(1)

		flushNextTimer()
		expect(timer.tickCount).toBe(2)

		// elapsed = seekOffset + tickCount / fps
		const fps = 10
		const seekOffset = 5
		const elapsed = seekOffset + timer.tickCount / fps
		expect(elapsed).toBe(5.2) // 5s seek + 0.2s of 2 ticks at 10fps

		timer.dispose()
	})
})
