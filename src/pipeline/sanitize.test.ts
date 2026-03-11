import { describe, expect, it } from 'bun:test'

import { sanitizeForTerminal } from './sanitize.ts'

describe('sanitizeForTerminal', () => {
	it('passes through normal text', () => {
		expect(sanitizeForTerminal('hello world')).toBe('hello world')
	})

	it('preserves newlines and tabs', () => {
		expect(sanitizeForTerminal('line1\nline2\ttab')).toBe('line1\nline2\ttab')
	})

	it('strips null bytes', () => {
		expect(sanitizeForTerminal('a\x00b')).toBe('ab')
	})

	it('strips bell and other low control chars', () => {
		expect(sanitizeForTerminal('a\x07b\x08c\x0ed')).toBe('abcd')
	})

	it('strips DEL character', () => {
		expect(sanitizeForTerminal('a\x7fb')).toBe('ab')
	})

	it('strips carriage return (prevents visual overwrite)', () => {
		expect(sanitizeForTerminal('a\rb')).toBe('ab')
	})

	it('strips \\r from CRLF line endings', () => {
		expect(sanitizeForTerminal('line1\r\nline2')).toBe('line1\nline2')
	})

	it('returns empty string for empty input', () => {
		expect(sanitizeForTerminal('')).toBe('')
	})

	it('strips C1 control characters (0x80-0x9f)', () => {
		expect(sanitizeForTerminal('a\x80b\x8fc')).toBe('abc')
	})

	it('strips CSI (0x9b) — cursor movement injection', () => {
		expect(sanitizeForTerminal('safe\x9b2Jtext')).toBe('safe2Jtext')
	})

	it('strips ST (0x9c) — OSC sequence terminator', () => {
		expect(sanitizeForTerminal('data\x9cinjected')).toBe('datainjected')
	})

	it('strips OSC (0x9d) — operating system command', () => {
		expect(sanitizeForTerminal('before\x9d0;pwned\x07after')).toBe('before0;pwnedafter')
	})

	it('strips mixed C0 and C1 controls', () => {
		expect(sanitizeForTerminal('\x1b[31m\x9bredtext')).toBe('[31mredtext')
	})
})
