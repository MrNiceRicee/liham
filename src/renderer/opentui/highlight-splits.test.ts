import { describe, expect, test } from 'bun:test'

import { splitHighlightSegments } from './highlight-splits.ts'

describe('splitHighlightSegments', () => {
	test('empty text returns empty array', () => {
		expect(splitHighlightSegments('', new Set())).toEqual([])
	})

	test('empty positions returns single unhighlighted segment', () => {
		expect(splitHighlightSegments('hello', new Set())).toEqual([
			{ text: 'hello', highlighted: false },
		])
	})

	test('all positions highlighted returns single highlighted segment', () => {
		expect(splitHighlightSegments('abc', new Set([0, 1, 2]))).toEqual([
			{ text: 'abc', highlighted: true },
		])
	})

	test('contiguous positions merge into one highlighted segment', () => {
		const result = splitHighlightSegments('abcde', new Set([1, 2, 3]))
		expect(result).toEqual([
			{ text: 'a', highlighted: false },
			{ text: 'bcd', highlighted: true },
			{ text: 'e', highlighted: false },
		])
	})

	test('alternating positions produce correct segments', () => {
		const result = splitHighlightSegments('abcd', new Set([0, 2]))
		expect(result).toEqual([
			{ text: 'a', highlighted: true },
			{ text: 'b', highlighted: false },
			{ text: 'c', highlighted: true },
			{ text: 'd', highlighted: false },
		])
	})

	test('highlight at start only', () => {
		const result = splitHighlightSegments('hello', new Set([0, 1]))
		expect(result).toEqual([
			{ text: 'he', highlighted: true },
			{ text: 'llo', highlighted: false },
		])
	})

	test('highlight at end only', () => {
		const result = splitHighlightSegments('hello', new Set([3, 4]))
		expect(result).toEqual([
			{ text: 'hel', highlighted: false },
			{ text: 'lo', highlighted: true },
		])
	})

	test('positions out of range are ignored', () => {
		const result = splitHighlightSegments('abc', new Set([5, 10]))
		expect(result).toEqual([{ text: 'abc', highlighted: false }])
	})
})
