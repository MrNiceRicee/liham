import { describe, expect, test } from 'bun:test'

import { parseDetectionResponse } from './detect.ts'

describe('parseDetectionResponse', () => {
	test('parses OSC 11 dark theme', () => {
		const response = '\x1b]11;rgb:1a1a/1b1b/2626\x1b\\'
		const result = parseDetectionResponse(response)
		expect(result.theme).toBe('dark')
	})

	test('parses OSC 11 light theme', () => {
		const response = '\x1b]11;rgb:d5d5/d6d6/dbdb\x1b\\'
		const result = parseDetectionResponse(response)
		expect(result.theme).toBe('light')
	})

	test('returns null theme when no OSC 11', () => {
		const result = parseDetectionResponse('')
		expect(result.theme).toBeNull()
	})

	test('detects kitty graphics support', () => {
		const response = '\x1b_Gi=31;OK\x1b\\'
		const result = parseDetectionResponse(response)
		expect(result.kittySupported).toBe(true)
	})

	test('detects kitty graphics not supported', () => {
		const response = '\x1b_Gi=31;ENOENT\x1b\\'
		const result = parseDetectionResponse(response)
		expect(result.kittySupported).toBe(false)
	})

	test('no kitty response means not supported', () => {
		const result = parseDetectionResponse('')
		expect(result.kittySupported).toBe(false)
	})

	test('parses cell pixel dimensions from CSI 16t', () => {
		const response = '\x1b[6;20;10t'
		const result = parseDetectionResponse(response)
		expect(result.cellHeight).toBe(20)
		expect(result.cellWidth).toBe(10)
	})

	test('uses defaults when no cell size response', () => {
		const result = parseDetectionResponse('')
		expect(result.cellWidth).toBe(8)
		expect(result.cellHeight).toBe(16)
	})

	test('parses combined response with all components', () => {
		const response =
			'\x1b]11;rgb:1a1a/1b1b/2626\x1b\\' + '\x1b_Gi=31;OK\x1b\\' + '\x1b[6;18;9t' + '\x1b[?62;4c'
		const result = parseDetectionResponse(response)
		expect(result.theme).toBe('dark')
		expect(result.kittySupported).toBe(true)
		expect(result.cellHeight).toBe(18)
		expect(result.cellWidth).toBe(9)
	})

	test('handles responses in any order', () => {
		const response = '\x1b[6;16;8t' + '\x1b_Gi=31;OK\x1b\\' + '\x1b]11;rgb:ffff/ffff/ffff\x1b\\'
		const result = parseDetectionResponse(response)
		expect(result.theme).toBe('light')
		expect(result.kittySupported).toBe(true)
		expect(result.cellWidth).toBe(8)
		expect(result.cellHeight).toBe(16)
	})
})
