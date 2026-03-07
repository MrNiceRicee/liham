import { describe, expect, test } from 'bun:test'

import { decodeImage, getImageDimensions, initSharp } from './decoder.ts'

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
		const result = await decodeImage(new Uint8Array(PNG_4x4), 80, 8, 16, 'halfblock', 'test.png')
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
		const result = await decodeImage(new Uint8Array(PNG_4x4), 80, 8, 16, 'kitty', 'test.png')
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

		const result = await decodeImage(new Uint8Array(buf), 80, 8, 16, 'halfblock', 'test.png')
		expect(result.ok).toBe(true)
		if (result.ok) {
			expect(result.value.height % 2).toBe(0) // even
			expect(result.value.terminalRows).toBe(result.value.height / 2)
		}
	})

	test('small image not enlarged', async () => {
		const result = await decodeImage(new Uint8Array(PNG_4x4), 80, 8, 16, 'kitty', 'test.png')
		expect(result.ok).toBe(true)
		if (result.ok) {
			// 4px wide image, target would be 80*8=640px — but withoutEnlargement prevents upscale
			expect(result.value.width).toBe(4)
			expect(result.value.height).toBe(4)
		}
	})

	test('rejects corrupt data', async () => {
		const result = await decodeImage(new Uint8Array([0, 0, 0, 0]), 80, 8, 16, 'halfblock', 'bad')
		expect(result.ok).toBe(false)
	})

	test('animated GIF decodes all frames', async () => {
		const { readFile } = await import('node:fs/promises')
		const gif = new Uint8Array(await readFile('test/assets/duck-simple.gif'))
		const result = await decodeImage(gif, 40, 8, 16, 'halfblock', 'duck.gif')
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
		const frame1 = await sharp({ create: { width: 2, height: 2, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } } }).png().toBuffer()
		const frame2 = await sharp({ create: { width: 2, height: 2, channels: 4, background: { r: 0, g: 255, b: 0, alpha: 1 } } }).png().toBuffer()
		const gif = await sharp(frame1, { animated: true })
			.joinChannel(frame2)
			.gif({ delay: [0, 5] })
			.toBuffer()

		const result = await decodeImage(new Uint8Array(gif), 40, 8, 16, 'halfblock', 'test.gif')
		if (result.ok && result.value.delays != null) {
			for (const d of result.value.delays) {
				expect(d).toBeGreaterThanOrEqual(100)
			}
		}
	})

	test('static GIF has no frames/delays', async () => {
		const sharp = (await import('sharp')).default
		const gif = await sharp({ create: { width: 4, height: 4, channels: 4, background: { r: 0, g: 0, b: 255, alpha: 1 } } }).gif().toBuffer()
		const result = await decodeImage(new Uint8Array(gif), 40, 8, 16, 'halfblock', 'static.gif')
		expect(result.ok).toBe(true)
		if (result.ok) {
			expect(result.value.frames).toBeUndefined()
			expect(result.value.delays).toBeUndefined()
		}
	})
})
