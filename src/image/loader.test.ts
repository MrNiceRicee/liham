import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { loadImageFile, resolveImagePath } from './loader.ts'

// minimal valid image files (smallest possible)
const PNG_1x1 = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNjN9GQAAAABJRElEQkSuQmCC',
	'base64',
)
const JPEG_1x1 = Buffer.from(
	'/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRof' +
		'Hh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwh' +
		'MjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAAR' +
		'CAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAA' +
		'AAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMR' +
		'AD8AKwA//9k=',
	'base64',
)
const GIF_1x1 = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')

const testDir = join(tmpdir(), `liham-loader-test-${Date.now()}`)
const imagesDir = join(testDir, 'images')

beforeAll(() => {
	mkdirSync(imagesDir, { recursive: true })
	writeFileSync(join(imagesDir, 'test.png'), PNG_1x1)
	writeFileSync(join(imagesDir, 'test.jpg'), JPEG_1x1)
	writeFileSync(join(imagesDir, 'test.gif'), GIF_1x1)
	writeFileSync(join(imagesDir, 'fake.png'), 'not a real image')
	writeFileSync(join(imagesDir, '画像.png'), PNG_1x1)

	// symlink inside base dir (valid)
	symlinkSync(join(imagesDir, 'test.png'), join(imagesDir, 'link.png'))

	// file outside base dir for traversal test
	writeFileSync(join(testDir, 'outside.png'), PNG_1x1)
})

afterAll(() => {
	rmSync(testDir, { recursive: true, force: true })
})

describe('resolveImagePath', () => {
	test('resolves relative path inside base dir', async () => {
		const result = await resolveImagePath('test.png', imagesDir)
		expect(result.ok).toBe(true)
		if (result.ok) expect(result.value).toContain('test.png')
	})

	test('rejects path traversal outside base dir', async () => {
		const result = await resolveImagePath('../outside.png', imagesDir)
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.error).toBe('path outside base directory')
	})

	test('rejects deep traversal', async () => {
		const result = await resolveImagePath('../../../etc/passwd', imagesDir)
		expect(result.ok).toBe(false)
	})

	test('resolves valid symlink inside base dir', async () => {
		const result = await resolveImagePath('link.png', imagesDir)
		expect(result.ok).toBe(true)
	})

	test('returns error for missing file', async () => {
		const result = await resolveImagePath('nonexistent.png', imagesDir)
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.error).toBe('file not found')
	})
})

describe('loadImageFile', () => {
	test('loads PNG file', async () => {
		const result = await loadImageFile('test.png', imagesDir)
		expect(result.ok).toBe(true)
		if (result.ok) {
			expect(result.value.bytes.length).toBeGreaterThan(0)
			expect(result.value.absolutePath).toContain('test.png')
			expect(result.value.mtime).toBeGreaterThan(0)
		}
	})

	test('loads JPEG file', async () => {
		const result = await loadImageFile('test.jpg', imagesDir)
		expect(result.ok).toBe(true)
	})

	test('loads GIF file', async () => {
		const result = await loadImageFile('test.gif', imagesDir)
		expect(result.ok).toBe(true)
	})

	test('rejects bad magic bytes', async () => {
		const result = await loadImageFile('fake.png', imagesDir)
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.error).toBe('unsupported image format')
	})

	test('rejects path traversal', async () => {
		const result = await loadImageFile('../outside.png', imagesDir)
		expect(result.ok).toBe(false)
	})

	test('rejects missing file', async () => {
		const result = await loadImageFile('nope.png', imagesDir)
		expect(result.ok).toBe(false)
	})

	test('loads unicode filename', async () => {
		const result = await loadImageFile('画像.png', imagesDir)
		expect(result.ok).toBe(true)
	})

	test('rejects oversized file', async () => {
		const bigPath = join(imagesDir, 'big.png')
		// write PNG header + padding to exceed 10MB
		const buf = Buffer.alloc(10 * 1024 * 1024 + 1)
		buf[0] = 0x89
		buf[1] = 0x50
		buf[2] = 0x4e
		buf[3] = 0x47
		writeFileSync(bigPath, buf)

		const result = await loadImageFile('big.png', imagesDir)
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.error).toBe('file too large')
	})
})
