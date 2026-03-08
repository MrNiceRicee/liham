import { describe, expect, test } from 'bun:test'

import { createRingBuffer } from './ring-buffer.ts'

const FRAME_SIZE = 16 // small frames for testing

function makeFrame(value: number): Uint8Array {
	const frame = new Uint8Array(FRAME_SIZE)
	frame.fill(value)
	return frame
}

// helper — write synchronously, assert it returns true (not a Promise)
function writeSync(buf: ReturnType<typeof createRingBuffer>, frame: Uint8Array): void {
	const result = buf.write(frame)
	if (result !== true) throw new Error('expected synchronous write to return true')
}

describe('createRingBuffer', () => {
	test('write and read single frame', () => {
		const buf = createRingBuffer(4, FRAME_SIZE)
		const result = buf.write(makeFrame(42))
		expect(result).toBe(true)
		expect(buf.length).toBe(1)
		expect(buf.empty).toBe(false)

		const frame = buf.read()
		expect(frame).not.toBeNull()
		expect(frame![0]).toBe(42)
		expect(buf.length).toBe(0)
		expect(buf.empty).toBe(true)
	})

	test('empty buffer returns null on read', () => {
		const buf = createRingBuffer(4, FRAME_SIZE)
		expect(buf.read()).toBeNull()
		expect(buf.empty).toBe(true)
	})

	test('full buffer backpressure — deferred promise resolves after read', async () => {
		const buf = createRingBuffer(2, FRAME_SIZE)

		// fill buffer
		writeSync(buf, makeFrame(1))
		writeSync(buf, makeFrame(2))
		expect(buf.full).toBe(true)

		// third write returns a promise (parked)
		const writePromise = buf.write(makeFrame(3))
		expect(writePromise).toBeInstanceOf(Promise)

		// read one slot — unparks the writer via setTimeout
		const frame = buf.read()
		expect(frame![0]).toBe(1)

		// promise resolves to true after setTimeout fires
		const result = await writePromise
		expect(result).toBe(true)
		expect(buf.length).toBe(2) // frame 2 + frame 3
	})

	test('flush during parked write returns false', async () => {
		const buf = createRingBuffer(1, FRAME_SIZE)
		writeSync(buf, makeFrame(1))

		const writePromise = buf.write(makeFrame(2))
		expect(writePromise).toBeInstanceOf(Promise)

		buf.flush()

		const result = await writePromise
		expect(result).toBe(false)
		expect(buf.length).toBe(0)
	})

	test('flush resets all state', () => {
		const buf = createRingBuffer(4, FRAME_SIZE)
		writeSync(buf, makeFrame(1))
		writeSync(buf, makeFrame(2))
		buf.markEnded()
		expect(buf.ended).toBe(true)

		buf.flush()
		expect(buf.length).toBe(0)
		expect(buf.empty).toBe(true)
		expect(buf.ended).toBe(false)
	})

	test('markEnded sets ended flag', () => {
		const buf = createRingBuffer(4, FRAME_SIZE)
		expect(buf.ended).toBe(false)
		buf.markEnded()
		expect(buf.ended).toBe(true)
	})

	test('markError sets errored flag and reason', () => {
		const buf = createRingBuffer(4, FRAME_SIZE)
		expect(buf.errored).toBe(false)
		expect(buf.errorReason).toBeNull()

		buf.markError('pipe broke')
		expect(buf.errored).toBe(true)
		expect(buf.errorReason).toBe('pipe broke')
	})

	test('wrap-around — writes and reads past capacity boundary', () => {
		const buf = createRingBuffer(3, FRAME_SIZE)

		// fill and drain to advance indices
		writeSync(buf, makeFrame(10))
		writeSync(buf, makeFrame(20))
		writeSync(buf, makeFrame(30))
		buf.read()
		buf.read()
		buf.read()
		expect(buf.empty).toBe(true)

		// now indices are at 3 % 3 = 0, write wraps around
		writeSync(buf, makeFrame(40))
		writeSync(buf, makeFrame(50))

		const f1 = buf.read()
		expect(f1![0]).toBe(40)
		const f2 = buf.read()
		expect(f2![0]).toBe(50)
	})

	test('memory budget caps capacity', () => {
		// request 100 slots of 1MB each — budget is 30MB, so cap at 30
		const hugeFrameSize = 1024 * 1024
		const buf = createRingBuffer(100, hugeFrameSize)
		expect(buf.capacity).toBe(30)
	})

	test('memory budget with very large frames', () => {
		// 10MB frames — budget 30MB → capacity 3
		const buf = createRingBuffer(30, 10 * 1024 * 1024)
		expect(buf.capacity).toBe(3)
	})

	test('dispose prevents further writes', () => {
		const buf = createRingBuffer(4, FRAME_SIZE)
		buf.dispose()
		expect(buf.write(makeFrame(1))).toBe(false)
	})

	test('dispose flushes and rejects parked writer', async () => {
		const buf = createRingBuffer(1, FRAME_SIZE)
		writeSync(buf, makeFrame(1))

		const writePromise = buf.write(makeFrame(2))
		buf.dispose()

		const result = await writePromise
		expect(result).toBe(false)
	})

	test('read returns reference to internal slot (zero-copy)', () => {
		const buf = createRingBuffer(4, FRAME_SIZE)
		writeSync(buf, makeFrame(99))
		const frame = buf.read()
		expect(frame).not.toBeNull()
		expect(frame![0]).toBe(99)

		// write new data — consumer must use frame before next read
		writeSync(buf, makeFrame(77))
		const frame2 = buf.read()
		expect(frame2![0]).toBe(77)
	})

	test('capacity always at least 1', () => {
		const buf = createRingBuffer(0, FRAME_SIZE)
		expect(buf.capacity).toBe(1)
	})

	test('full and empty getters are correct throughout lifecycle', () => {
		const buf = createRingBuffer(2, FRAME_SIZE)
		expect(buf.empty).toBe(true)
		expect(buf.full).toBe(false)

		writeSync(buf, makeFrame(1))
		expect(buf.empty).toBe(false)
		expect(buf.full).toBe(false)

		writeSync(buf, makeFrame(2))
		expect(buf.empty).toBe(false)
		expect(buf.full).toBe(true)

		buf.read()
		expect(buf.full).toBe(false)

		buf.read()
		expect(buf.empty).toBe(true)
	})
})
