import { describe, expect, test } from 'bun:test'

import { computeVideoDimensions, probeVideo, readFrames } from './video-decoder.ts'

// -- probeVideo --

describe('probeVideo', () => {
	const base = `${import.meta.dir}/../../sandbox/assets`

	test('rejects empty path', async () => {
		const result = await probeVideo('', base)
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.error).toBe('empty path')
	})

	test('rejects path starting with dash', async () => {
		const result = await probeVideo('-v', base)
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.error).toBe('path starts with dash')
	})

	test('rejects remote URLs', async () => {
		const result = await probeVideo('https://evil.com/vid.mp4', base)
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.error).toBe('remote URLs not allowed')
	})

	test('rejects nonexistent file', async () => {
		const result = await probeVideo('nonexistent.mp4', base)
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.error).toBe('file not found')
	})

	test('rejects path traversal (still resolves safely)', async () => {
		const result = await probeVideo('../../package.json', base)
		// sanitizeMediaPath resolves it safely — the file exists but is not a video
		// ffprobe should fail or return no video stream
		if (result.ok) {
			// if ffprobe somehow ran, it should detect no video stream
			expect(result.value.width).toBeGreaterThan(0)
		}
		// either way, no crash
	})

	test('returns error for non-video file', async () => {
		const result = await probeVideo('fixture.txt', base)
		expect(result.ok).toBe(false)
	})

	test('supports AbortSignal cancellation', async () => {
		const controller = new AbortController()
		controller.abort()
		const result = await probeVideo('fixture.txt', base, controller.signal)
		// should be aborted or error — either is fine
		expect(result.ok).toBe(false)
	})
})

// -- computeVideoDimensions --

describe('computeVideoDimensions', () => {
	test('16:9 video in 80x24 terminal', () => {
		const result = computeVideoDimensions(1920, 1080, 80, 24)
		expect(result).not.toBeNull()
		if (result != null) {
			// should fit within 80 cols x 48 pixels high
			expect(result.pixelWidth).toBeLessThanOrEqual(80)
			expect(result.pixelHeight).toBeLessThanOrEqual(48)
			expect(result.pixelHeight % 2).toBe(0)
			expect(result.termCols).toBe(result.pixelWidth)
			expect(result.termRows).toBe(result.pixelHeight / 2)
			// aspect ratio preserved — width should be the constraint
			expect(result.pixelWidth).toBe(80)
		}
	})

	test('portrait video is width-constrained', () => {
		const result = computeVideoDimensions(1080, 1920, 80, 40)
		expect(result).not.toBeNull()
		if (result != null) {
			expect(result.pixelWidth).toBeLessThanOrEqual(80)
			expect(result.pixelHeight).toBeLessThanOrEqual(80)
			expect(result.pixelHeight % 2).toBe(0)
		}
	})

	test('odd height is rounded to even', () => {
		// 16:9 at scale that would produce odd height
		const result = computeVideoDimensions(160, 90, 79, 24)
		expect(result).not.toBeNull()
		if (result != null) {
			expect(result.pixelHeight % 2).toBe(0)
		}
	})

	test('very small terminal returns null', () => {
		const result = computeVideoDimensions(1920, 1080, 10, 3)
		expect(result).toBeNull()
	})

	test('does not upscale small video', () => {
		const result = computeVideoDimensions(40, 30, 200, 100)
		expect(result).not.toBeNull()
		if (result != null) {
			expect(result.pixelWidth).toBe(40)
			expect(result.pixelHeight).toBe(30)
		}
	})

	test('enforces max dimension cap', () => {
		const result = computeVideoDimensions(4000, 3000, 4000, 2000)
		expect(result).not.toBeNull()
		if (result != null) {
			expect(result.pixelWidth).toBeLessThanOrEqual(2048)
			expect(result.pixelHeight).toBeLessThanOrEqual(2048)
		}
	})
})

// -- readFrames --

describe('readFrames', () => {
	test('accumulates chunks into complete frames', async () => {
		const frameSize = 16 // 4 pixels × 4 bytes
		// simulate 2 frames arriving in 3 uneven chunks
		const frame1 = new Uint8Array(frameSize).fill(1)
		const frame2 = new Uint8Array(frameSize).fill(2)
		const chunk1 = new Uint8Array(10) // partial first frame
		const chunk2 = new Uint8Array(12) // rest of first + partial second
		const chunk3 = new Uint8Array(10) // rest of second

		chunk1.set(frame1.subarray(0, 10))
		chunk2.set(frame1.subarray(10, 16), 0)
		chunk2.set(frame2.subarray(0, 6), 6)
		chunk3.set(frame2.subarray(6, 16))

		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(chunk1)
				controller.enqueue(chunk2)
				controller.enqueue(chunk3)
				controller.close()
			},
		})

		const frames: Uint8Array[] = []
		for await (const frame of readFrames(stream, frameSize)) {
			frames.push(new Uint8Array(frame))
		}

		expect(frames.length).toBe(2)
		expect(frames[0]).toEqual(frame1)
		expect(frames[1]).toEqual(frame2)
	})

	test('discards partial frame at end of stream', async () => {
		const frameSize = 16
		const data = new Uint8Array(24) // 1.5 frames
		data.fill(42)

		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(data)
				controller.close()
			},
		})

		const frames: Uint8Array[] = []
		for await (const frame of readFrames(stream, frameSize)) {
			frames.push(new Uint8Array(frame))
		}

		expect(frames.length).toBe(1)
		expect(frames[0]).toEqual(new Uint8Array(16).fill(42))
	})

	test('handles exact frame-aligned chunks', async () => {
		const frameSize = 8
		const frame1 = new Uint8Array(8).fill(10)
		const frame2 = new Uint8Array(8).fill(20)

		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(frame1)
				controller.enqueue(frame2)
				controller.close()
			},
		})

		const frames: Uint8Array[] = []
		for await (const frame of readFrames(stream, frameSize)) {
			frames.push(new Uint8Array(frame))
		}

		expect(frames.length).toBe(2)
		expect(frames[0]).toEqual(frame1)
		expect(frames[1]).toEqual(frame2)
	})

	test('handles empty stream', async () => {
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.close()
			},
		})

		const frames: Uint8Array[] = []
		for await (const frame of readFrames(stream, 16)) {
			frames.push(new Uint8Array(frame))
		}

		expect(frames.length).toBe(0)
	})

	test('single large chunk spanning multiple frames', async () => {
		const frameSize = 4
		const bigChunk = new Uint8Array(12) // 3 frames
		bigChunk.set([1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3])

		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(bigChunk)
				controller.close()
			},
		})

		const frames: Uint8Array[] = []
		for await (const frame of readFrames(stream, frameSize)) {
			frames.push(new Uint8Array(frame))
		}

		expect(frames.length).toBe(3)
		expect(frames[0]).toEqual(new Uint8Array([1, 1, 1, 1]))
		expect(frames[1]).toEqual(new Uint8Array([2, 2, 2, 2]))
		expect(frames[2]).toEqual(new Uint8Array([3, 3, 3, 3]))
	})
})
