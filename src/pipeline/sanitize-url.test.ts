import { describe, expect, it } from 'bun:test'

import { sanitizeUrl } from './sanitize-url.ts'

describe('sanitizeUrl', () => {
	it('passes through valid https URL', () => {
		expect(sanitizeUrl('https://example.com')).toBe('https://example.com')
	})

	it('passes through valid http URL', () => {
		expect(sanitizeUrl('http://example.com/path?q=1')).toBe('http://example.com/path?q=1')
	})

	it('passes through mailto URL', () => {
		expect(sanitizeUrl('mailto:user@example.com')).toBe('mailto:user@example.com')
	})

	it('rejects javascript: URLs', () => {
		expect(sanitizeUrl('javascript:alert(1)')).toBe('')
	})

	it('rejects data: URLs', () => {
		expect(sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBe('')
	})

	it('rejects file: URLs', () => {
		expect(sanitizeUrl('file:///etc/passwd')).toBe('')
	})

	it('rejects vbscript: URLs', () => {
		expect(sanitizeUrl('vbscript:msgbox')).toBe('')
	})

	it('rejects relative URLs', () => {
		expect(sanitizeUrl('/path/to/file')).toBe('')
	})

	it('rejects empty string', () => {
		expect(sanitizeUrl('')).toBe('')
	})

	it('rejects URLs over 2048 characters', () => {
		expect(sanitizeUrl(`https://example.com/${'a'.repeat(2048)}`)).toBe('')
	})

	it('strips raw ESC character from URL', () => {
		expect(sanitizeUrl('https://example.com/\x1bpath')).toBe('https://example.com/path')
	})

	it('strips raw C1 controls from URL', () => {
		expect(sanitizeUrl('https://example.com/\x9bpath')).toBe('https://example.com/path')
	})

	it('strips BEL character (OSC 8 escape)', () => {
		expect(sanitizeUrl('https://evil.com/\x07injected')).toBe('https://evil.com/injected')
	})

	it('strips percent-encoded ESC (%1b)', () => {
		expect(sanitizeUrl('https://evil.com/%1b%5d52;c;data%07')).toBe('https://evil.com/%5d52;c;data')
	})

	it('strips percent-encoded null (%00)', () => {
		expect(sanitizeUrl('https://example.com/%00path')).toBe('https://example.com/path')
	})

	it('strips percent-encoded C1 controls (%9b, %9c, %9d)', () => {
		expect(sanitizeUrl('https://example.com/%9b%9c%9d')).toBe('https://example.com/')
	})

	it('handles case-insensitive percent-encoding (%1B vs %1b)', () => {
		expect(sanitizeUrl('https://evil.com/%1B%5D')).toBe('https://evil.com/%5D')
	})

	it('rejects malformed URL after control char stripping', () => {
		expect(sanitizeUrl('\x1b\x1b\x1b')).toBe('')
	})

	it('passes URL with fragment', () => {
		expect(sanitizeUrl('https://example.com/page#section')).toBe('https://example.com/page#section')
	})

	it('passes URL with query params', () => {
		expect(sanitizeUrl('https://example.com/search?q=test&page=1')).toBe(
			'https://example.com/search?q=test&page=1',
		)
	})

	it('OSC 8 injection: BEL terminates sequence + clipboard write', () => {
		// attack: close OSC 8 with BEL, inject clipboard write via OSC 52
		const malicious = 'https://evil.com\x07\x1b]52;c;SGVsbG8=\x07'
		const result = sanitizeUrl(malicious)
		expect(result).not.toContain('\x07')
		expect(result).not.toContain('\x1b')
	})

	it('OSC 8 injection: ST (0x9c) terminates sequence', () => {
		const malicious = 'https://evil.com\x9c\x1b]0;pwned\x07'
		const result = sanitizeUrl(malicious)
		expect(result).not.toContain('\x9c')
		expect(result).not.toContain('\x1b')
	})
})
