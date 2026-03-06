import { describe, expect, it } from 'bun:test'

import { parseOsc11Response } from './detect.ts'

describe('parseOsc11Response', () => {
	it('detects dark theme from low-luminance response', () => {
		// rgb:1a1a/1b1b/2626 — tokyo night storm background
		expect(parseOsc11Response('\x1b]11;rgb:1a1a/1b1b/2626\x1b\\')).toBe('dark')
	})

	it('detects light theme from high-luminance response', () => {
		// rgb:d5d5/d6d6/dbdb — light background
		expect(parseOsc11Response('\x1b]11;rgb:d5d5/d6d6/dbdb\x1b\\')).toBe('light')
	})

	it('handles 2-char hex components', () => {
		// rgb:1a/1b/26
		expect(parseOsc11Response('\x1b]11;rgb:1a/1b/26\x1b\\')).toBe('dark')
	})

	it('handles BEL terminator', () => {
		expect(parseOsc11Response('\x1b]11;rgb:ff/ff/ff\x07')).toBe('light')
	})

	it('detects pure black as dark', () => {
		expect(parseOsc11Response('\x1b]11;rgb:0000/0000/0000\x1b\\')).toBe('dark')
	})

	it('detects pure white as light', () => {
		expect(parseOsc11Response('\x1b]11;rgb:ffff/ffff/ffff\x1b\\')).toBe('light')
	})

	it('returns null for empty string', () => {
		expect(parseOsc11Response('')).toBeNull()
	})

	it('returns null for garbage data', () => {
		expect(parseOsc11Response('not a valid response')).toBeNull()
	})

	it('returns null for partial response', () => {
		expect(parseOsc11Response('\x1b]11;rgb:1a1a/')).toBeNull()
	})

	it('handles response with extra data after', () => {
		expect(parseOsc11Response('\x1b]11;rgb:1a1a/1b1b/2626\x1b\\extra')).toBe('dark')
	})

	it('handles mid-gray as dark (luminance ~0.5 boundary)', () => {
		// rgb:7f/7f/7f — luminance ≈ 0.498 — just under 0.5
		expect(parseOsc11Response('\x1b]11;rgb:7f/7f/7f\x1b\\')).toBe('dark')
	})

	it('handles bright gray as light', () => {
		// rgb:80/80/80 — luminance ≈ 0.502
		expect(parseOsc11Response('\x1b]11;rgb:80/80/80\x1b\\')).toBe('light')
	})
})
