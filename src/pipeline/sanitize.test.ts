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

	it('preserves carriage return', () => {
		expect(sanitizeForTerminal('a\rb')).toBe('a\rb')
	})

	it('returns empty string for empty input', () => {
		expect(sanitizeForTerminal('')).toBe('')
	})
})
