import { describe, expect, test } from 'bun:test'

import { sanitizeImageSrc } from './sanitize-image-src.ts'

describe('sanitizeImageSrc', () => {
	test('allows relative paths', () => {
		expect(sanitizeImageSrc('./photo.png')).toBe('./photo.png')
		expect(sanitizeImageSrc('../images/cat.jpg')).toBe('../images/cat.jpg')
		expect(sanitizeImageSrc('images/dog.gif')).toBe('images/dog.gif')
		expect(sanitizeImageSrc('photo.png')).toBe('photo.png')
	})

	test('allows http and https URLs', () => {
		expect(sanitizeImageSrc('https://example.com/img.png')).toBe('https://example.com/img.png')
		expect(sanitizeImageSrc('http://example.com/img.png')).toBe('http://example.com/img.png')
		expect(sanitizeImageSrc('HTTP://EXAMPLE.COM/img.png')).toBe('HTTP://EXAMPLE.COM/img.png')
		expect(sanitizeImageSrc('HTTPS://EXAMPLE.COM/img.png')).toBe('HTTPS://EXAMPLE.COM/img.png')
	})

	test('rejects javascript: scheme', () => {
		expect(sanitizeImageSrc('javascript:alert(1)')).toBe('')
		expect(sanitizeImageSrc('JAVASCRIPT:alert(1)')).toBe('')
	})

	test('rejects file: scheme', () => {
		expect(sanitizeImageSrc('file:///etc/passwd')).toBe('')
	})

	test('rejects data: scheme', () => {
		expect(sanitizeImageSrc('data:image/png;base64,iVBOR')).toBe('')
	})

	test('rejects blob: scheme', () => {
		expect(sanitizeImageSrc('blob:http://example.com/uuid')).toBe('')
	})

	test('rejects ftp: scheme', () => {
		expect(sanitizeImageSrc('ftp://example.com/image.png')).toBe('')
	})

	test('rejects empty string', () => {
		expect(sanitizeImageSrc('')).toBe('')
	})

	test('rejects strings exceeding max length', () => {
		const long = 'a'.repeat(2049)
		expect(sanitizeImageSrc(long)).toBe('')
	})

	test('strips control characters', () => {
		expect(sanitizeImageSrc('./pho\x00to.png')).toBe('./photo.png')
		expect(sanitizeImageSrc('./pho\x1bto.png')).toBe('./photo.png')
		expect(sanitizeImageSrc('./pho\x7fto.png')).toBe('./photo.png')
	})

	test('strips percent-encoded control chars', () => {
		expect(sanitizeImageSrc('./pho%00to.png')).toBe('./photo.png')
		expect(sanitizeImageSrc('./pho%1bto.png')).toBe('./photo.png')
		expect(sanitizeImageSrc('./pho%7Fto.png')).toBe('./photo.png')
	})

	test('allows paths with spaces and unicode', () => {
		expect(sanitizeImageSrc('./my photo.png')).toBe('./my photo.png')
		expect(sanitizeImageSrc('./画像.png')).toBe('./画像.png')
	})

	test('returns empty string when control char stripping empties it', () => {
		expect(sanitizeImageSrc('\x00\x01\x02')).toBe('')
	})
})
