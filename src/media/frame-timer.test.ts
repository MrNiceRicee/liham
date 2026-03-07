import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { createFrameTimer } from './frame-timer.ts'

// fake timers — bun:test mock for setTimeout/clearTimeout
let pendingTimers: { callback: () => void; delay: number; id: number }[] = []
let nextTimerId = 1
let mockNow = 0

function flushTimers(advanceMs: number) {
	mockNow += advanceMs
	// process timers that should have fired by now, oldest first
	let processed = true
	while (processed) {
		processed = false
		const ready = pendingTimers.filter(t => t.delay <= mockNow)
		if (ready.length > 0) {
			const timer = ready[0]!
			pendingTimers = pendingTimers.filter(t => t !== timer)
			timer.callback()
			processed = true
		}
	}
}

function flushNextTimer() {
	if (pendingTimers.length === 0) return
	const next = pendingTimers.reduce((a, b) => a.delay < b.delay ? a : b, pendingTimers[0]!)
	const advance = Math.max(0, next.delay - mockNow)
	flushTimers(advance)
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
		pendingTimers = pendingTimers.filter(t => t.id !== id)
	}
	// @ts-expect-error -- replacing performance.now for deterministic timing
	performance.now = () => mockNow
})

afterEach(() => {
	// timers restored automatically by bun:test between files
})

describe('createFrameTimer', () => {
	test('starts in idle state', () => {
		const timer = createFrameTimer({ delays: [100, 200], onFrame: () => {} })
		expect(timer.state).toBe('idle')
		expect(timer.currentFrame).toBe(0)
		timer.dispose()
	})

	test('play transitions to playing and fires onFrame(0)', () => {
		const frames: number[] = []
		const timer = createFrameTimer({ delays: [100, 200], onFrame: i => frames.push(i) })
		timer.play()
		expect(timer.state).toBe('playing')
		expect(frames).toEqual([0])
		timer.dispose()
	})

	test('cycles through frames with correct delays', () => {
		const frames: number[] = []
		const timer = createFrameTimer({ delays: [100, 200, 150], onFrame: i => frames.push(i) })
		timer.play()
		expect(frames).toEqual([0])

		flushNextTimer() // +100ms → frame 1
		expect(frames).toEqual([0, 1])

		flushNextTimer() // +200ms → frame 2
		expect(frames).toEqual([0, 1, 2])

		flushNextTimer() // +150ms → frame 0 (loop)
		expect(frames).toEqual([0, 1, 2, 0])

		timer.dispose()
	})

	test('pause stops frame cycling', () => {
		const frames: number[] = []
		const timer = createFrameTimer({ delays: [100, 100], onFrame: i => frames.push(i) })
		timer.play()
		flushNextTimer()
		expect(frames).toEqual([0, 1])

		timer.pause()
		expect(timer.state).toBe('paused')

		// advance time — no new frames should fire
		flushTimers(500)
		expect(frames).toEqual([0, 1])

		timer.dispose()
	})

	test('play after pause resumes from current frame', () => {
		const frames: number[] = []
		const timer = createFrameTimer({ delays: [100, 200, 300], onFrame: i => frames.push(i) })
		timer.play()
		flushNextTimer() // frame 1
		timer.pause()
		expect(timer.currentFrame).toBe(1)

		timer.play()
		// should fire onFrame with current frame (1) and continue
		expect(frames).toEqual([0, 1, 1])
		expect(timer.currentFrame).toBe(1)

		flushNextTimer() // frame 2
		expect(frames).toEqual([0, 1, 1, 2])

		timer.dispose()
	})

	test('non-loop stops at last frame with ended state', () => {
		const frames: number[] = []
		const timer = createFrameTimer({ delays: [100, 100, 100], onFrame: i => frames.push(i), loop: false })
		timer.play()          // fires onFrame(0)
		flushNextTimer()      // fires onFrame(1)
		flushNextTimer()      // fires onFrame(2)
		flushNextTimer()      // timer after last frame → ended, no onFrame
		expect(timer.state).toBe('ended')
		expect(timer.currentFrame).toBe(2)

		// no more timers should fire
		flushTimers(500)
		expect(frames).toEqual([0, 1, 2])

		timer.dispose()
	})

	test('play after ended restarts from frame 0', () => {
		const frames: number[] = []
		const timer = createFrameTimer({ delays: [100, 100], onFrame: i => frames.push(i), loop: false })
		timer.play()
		flushNextTimer() // frame 1
		flushNextTimer() // timer after last → ended
		expect(timer.state).toBe('ended')

		timer.play()
		expect(timer.state).toBe('playing')
		expect(timer.currentFrame).toBe(0)
		expect(frames).toEqual([0, 1, 0])

		timer.dispose()
	})

	test('seek jumps to target frame', () => {
		const frames: number[] = []
		const timer = createFrameTimer({ delays: [100, 200, 300], onFrame: i => frames.push(i) })
		timer.play()
		timer.seek(2)
		expect(timer.currentFrame).toBe(2)
		expect(frames).toEqual([0, 2])

		timer.dispose()
	})

	test('seek clamps to valid range', () => {
		const frames: number[] = []
		const timer = createFrameTimer({ delays: [100, 200], onFrame: i => frames.push(i) })

		timer.seek(-5)
		expect(timer.currentFrame).toBe(0)

		timer.seek(999)
		expect(timer.currentFrame).toBe(1) // last valid index

		timer.dispose()
	})

	test('dispose clears all timers', () => {
		const timer = createFrameTimer({ delays: [100, 200], onFrame: () => {} })
		timer.play()
		expect(pendingTimers.length).toBe(1)

		timer.dispose()
		expect(pendingTimers.length).toBe(0)
		expect(timer.state).toBe('idle')
	})

	test('calling play while already playing is a no-op', () => {
		const frames: number[] = []
		const timer = createFrameTimer({ delays: [100], onFrame: i => frames.push(i) })
		timer.play()
		timer.play()
		timer.play()
		expect(frames).toEqual([0]) // only one onFrame call
		timer.dispose()
	})

	test('single-frame delays array works', () => {
		const frames: number[] = []
		const timer = createFrameTimer({ delays: [50], onFrame: i => frames.push(i) })
		timer.play()
		flushNextTimer()
		flushNextTimer()
		expect(frames).toEqual([0, 0, 0]) // loops back to 0 each time
		timer.dispose()
	})
})
