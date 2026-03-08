import { describe, expect, test } from 'bun:test'

import { formatProgressBar, formatTimestamp } from './media-gallery.tsx'

describe('formatTimestamp', () => {
	test('0 seconds', () => {
		expect(formatTimestamp(0)).toBe('0:00')
	})

	test('59 seconds', () => {
		expect(formatTimestamp(59)).toBe('0:59')
	})

	test('60 seconds', () => {
		expect(formatTimestamp(60)).toBe('1:00')
	})

	test('83 seconds', () => {
		expect(formatTimestamp(83)).toBe('1:23')
	})

	test('3599 seconds', () => {
		expect(formatTimestamp(3599)).toBe('59:59')
	})

	test('3600 seconds shows hours', () => {
		expect(formatTimestamp(3600)).toBe('1:00:00')
	})

	test('3661 seconds', () => {
		expect(formatTimestamp(3661)).toBe('1:01:01')
	})

	test('fractional seconds floors', () => {
		expect(formatTimestamp(1.7)).toBe('0:01')
	})

	test('negative clamps to 0', () => {
		expect(formatTimestamp(-5)).toBe('0:00')
	})
})

describe('formatProgressBar', () => {
	test('zero duration shows elapsed only', () => {
		expect(formatProgressBar(83, 0, 30)).toBe('1:23')
	})

	test('full bar at duration', () => {
		const bar = formatProgressBar(60, 60, 30)
		expect(bar).toContain('1:00 / 1:00')
		expect(bar).not.toContain('o')
		expect(bar).toContain('~')
	})

	test('empty bar at start', () => {
		const bar = formatProgressBar(0, 60, 30)
		expect(bar).toContain('0:00 / 1:00')
		expect(bar).not.toContain('~')
		expect(bar).toContain('o')
	})

	test('half-filled bar at midpoint', () => {
		const bar = formatProgressBar(30, 60, 30)
		expect(bar).toContain('0:30 / 1:00')
		const tildes = (bar.match(/~/g) ?? []).length
		const dots = (bar.match(/o/g) ?? []).length
		expect(tildes).toBeGreaterThan(0)
		expect(dots).toBeGreaterThan(0)
	})

	test('narrow width falls back to timestamps only', () => {
		const bar = formatProgressBar(30, 60, 10)
		expect(bar).toBe('0:30 / 1:00')
	})

	test('elapsed beyond duration clamps bar to full', () => {
		const bar = formatProgressBar(70, 60, 30)
		expect(bar).toContain('1:10 / 1:00')
		expect(bar).not.toContain('o')
	})
})
