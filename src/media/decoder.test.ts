import { describe, expect, test } from 'bun:test'

import { type DecodeOptions, decodeImage, getImageDimensions, initSharp } from './decoder.ts'

function decode(
	overrides: Partial<DecodeOptions> & Pick<DecodeOptions, 'bytes' | 'source'>,
): ReturnType<typeof decodeImage> {
	return decodeImage({
		targetCols: 80,
		cellPixelWidth: 8,
		cellPixelHeight: 16,
		purpose: 'halfblock',
		...overrides,
	})
}

// 4x4 red PNG generated via sharp
const PNG_4x4 = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEklEQVR4nGP4z8DwHxkzkC4AADxAH+HggXe0AAAAAElFTkSuQmCC',
	'base64',
)

describe('initSharp', () => {
	test('initializes successfully', async () => {
		const available = await initSharp()
		expect(available).toBe(true)
	})
})

describe('getImageDimensions', () => {
	test('reads PNG dimensions', async () => {
		const result = await getImageDimensions(new Uint8Array(PNG_4x4))
		expect(result.ok).toBe(true)
		if (result.ok) {
			expect(result.value.width).toBe(4)
			expect(result.value.height).toBe(4)
		}
	})

	test('rejects corrupt data', async () => {
		const result = await getImageDimensions(new Uint8Array([0, 0, 0, 0]))
		expect(result.ok).toBe(false)
	})
})

describe('decodeImage', () => {
	test('decodes PNG to RGBA for halfblock', async () => {
		const result = await decode({ bytes: new Uint8Array(PNG_4x4), source: 'test.png' })
		expect(result.ok).toBe(true)
		if (result.ok) {
			expect(result.value.width).toBe(4)
			// 4 is already even, no padding needed
			expect(result.value.height).toBe(4)
			expect(result.value.rgba.length).toBe(4 * 4 * 4)
			expect(result.value.terminalRows).toBe(2) // 4 pixels / 2
			expect(result.value.terminalCols).toBe(4) // halfblock: 1 pixel = 1 column
			expect(result.value.source).toBe('test.png')
		}
	})

	test('decodes for kitty purpose', async () => {
		const result = await decode({
			bytes: new Uint8Array(PNG_4x4),
			source: 'test.png',
			purpose: 'kitty',
		})
		expect(result.ok).toBe(true)
		if (result.ok) {
			expect(result.value.width).toBe(4)
			expect(result.value.height).toBe(4)
		}
	})

	test('halfblock pads odd height to even', async () => {
		// create a 3x3 PNG
		const sharp = (await import('sharp')).default
		const buf = await sharp({
			create: { width: 3, height: 3, channels: 4, background: { r: 0, g: 255, b: 0, alpha: 1 } },
		})
			.png()
			.toBuffer()

		const result = await decode({ bytes: new Uint8Array(buf), source: 'test.png' })
		expect(result.ok).toBe(true)
		if (result.ok) {
			expect(result.value.height % 2).toBe(0) // even
			expect(result.value.terminalRows).toBe(result.value.height / 2)
		}
	})

	test('small image not enlarged', async () => {
		const result = await decode({
			bytes: new Uint8Array(PNG_4x4),
			source: 'test.png',
			purpose: 'kitty',
		})
		expect(result.ok).toBe(true)
		if (result.ok) {
			// 4px wide image, target would be 80*8=640px — but withoutEnlargement prevents upscale
			expect(result.value.width).toBe(4)
			expect(result.value.height).toBe(4)
		}
	})

	test('rejects corrupt data', async () => {
		const result = await decode({ bytes: new Uint8Array([0, 0, 0, 0]), source: 'bad' })
		expect(result.ok).toBe(false)
	})

	test('animated GIF decodes all frames', async () => {
		const { readFile } = await import('node:fs/promises')
		const gif = new Uint8Array(await readFile('test/assets/duck-simple.gif'))
		const result = await decode({ bytes: gif, source: 'duck.gif', targetCols: 40 })
		expect(result.ok).toBe(true)
		if (result.ok) {
			expect(result.value.frames).toBeDefined()
			expect(result.value.delays).toBeDefined()
			expect(result.value.frames!.length).toBeLessThanOrEqual(20)
			expect(result.value.delays!.length).toBe(result.value.frames!.length)
			expect(result.value.rgba).toBe(result.value.frames![0])
		}
	})

	test('animated GIF clamps delays <= 10ms to 100ms', async () => {
		const sharp = (await import('sharp')).default
		const frame1 = await sharp({
			create: { width: 2, height: 2, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } },
		})
			.png()
			.toBuffer()
		const frame2 = await sharp({
			create: { width: 2, height: 2, channels: 4, background: { r: 0, g: 255, b: 0, alpha: 1 } },
		})
			.png()
			.toBuffer()
		const gif = await sharp(frame1, { animated: true })
			.joinChannel(frame2)
			.gif({ delay: [0, 5] })
			.toBuffer()

		const result = await decode({ bytes: new Uint8Array(gif), source: 'test.gif', targetCols: 40 })
		if (result.ok && result.value.delays != null) {
			for (const d of result.value.delays) {
				expect(d).toBeGreaterThanOrEqual(100)
			}
		}
	})

	test('shouldContinue callback stops decode early', async () => {
		const { readFile } = await import('node:fs/promises')
		const gif = new Uint8Array(await readFile('test/assets/duck-simple.gif'))
		let callCount = 0
		const result = await decode({
			bytes: gif,
			source: 'duck.gif',
			targetCols: 40,
			shouldContinue: () => {
				callCount++
				return callCount < 3
			},
		})
		expect(result.ok).toBe(true)
		if (result.ok && result.value.frames != null) {
			// shouldContinue returns false after 3 calls, so max 3 frames decoded
			expect(result.value.frames.length).toBeLessThanOrEqual(3)
		}
	})

	test('static GIF has no frames/delays', async () => {
		const sharp = (await import('sharp')).default
		const gif = await sharp({
			create: { width: 4, height: 4, channels: 4, background: { r: 0, g: 0, b: 255, alpha: 1 } },
		})
			.gif()
			.toBuffer()
		const result = await decode({
			bytes: new Uint8Array(gif),
			source: 'static.gif',
			targetCols: 40,
		})
		expect(result.ok).toBe(true)
		if (result.ok) {
			expect(result.value.frames).toBeUndefined()
			expect(result.value.delays).toBeUndefined()
		}
	})

	test('custom animation limits raise frame cap', async () => {
		const { readFile } = await import('node:fs/promises')
		const gif = new Uint8Array(await readFile('test/assets/duck-simple.gif'))

		// inline default: maxFrames 1 — should decode only 1 frame
		const inline = await decode({
			bytes: gif,
			source: 'duck.gif',
			targetCols: 40,
			animationLimits: { maxFrames: 1, maxDecodedBytes: 10 * 1024 * 1024 },
		})
		expect(inline.ok).toBe(true)
		if (inline.ok) {
			// animated GIF with maxFrames: 1 still goes through decodeAnimated, gets 1 frame
			expect(inline.value.frames).toBeDefined()
			expect(inline.value.frames!.length).toBe(1)
		}

		// modal: maxFrames 50 — should decode all available frames
		const modal = await decode({
			bytes: gif,
			source: 'duck.gif',
			targetCols: 40,
			animationLimits: { maxFrames: 50, maxDecodedBytes: 30 * 1024 * 1024 },
		})
		expect(modal.ok).toBe(true)
		if (modal.ok) {
			expect(modal.value.frames).toBeDefined()
			expect(modal.value.frames!.length).toBeGreaterThan(1)
			expect(modal.value.frames!.length).toBeLessThanOrEqual(50)
		}
	})

	test('frame cap at maxFrames is respected', async () => {
		const { readFile } = await import('node:fs/promises')
		const gif = new Uint8Array(await readFile('test/assets/duck-simple.gif'))

		const result = await decode({
			bytes: gif,
			source: 'duck.gif',
			targetCols: 40,
			animationLimits: { maxFrames: 3, maxDecodedBytes: 30 * 1024 * 1024 },
		})
		expect(result.ok).toBe(true)
		if (result.ok && result.value.frames != null) {
			expect(result.value.frames.length).toBeLessThanOrEqual(3)
		}
	})
})
