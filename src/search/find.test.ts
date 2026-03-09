import { describe, expect, test } from 'bun:test'

import { findMatches } from './find.ts'

describe('findMatches', () => {
	test('empty query returns empty array', () => {
		expect(findMatches('hello world', '')).toEqual([])
	})

	test('no matches returns empty array', () => {
		expect(findMatches('hello world', 'xyz')).toEqual([])
	})

	test('finds single match', () => {
		const matches = findMatches('hello world', 'world')
		expect(matches).toEqual([{ charOffset: 6, line: 0, column: 6 }])
	})

	test('finds multiple matches', () => {
		const matches = findMatches('ab ab ab', 'ab')
		expect(matches).toHaveLength(3)
		expect(matches[0]).toEqual({ charOffset: 0, line: 0, column: 0 })
		expect(matches[1]).toEqual({ charOffset: 3, line: 0, column: 3 })
		expect(matches[2]).toEqual({ charOffset: 6, line: 0, column: 6 })
	})

	test('case-insensitive', () => {
		const matches = findMatches('Hello HELLO hello', 'hello')
		expect(matches).toHaveLength(3)
	})

	test('non-overlapping matches', () => {
		// "aa" in "aaa" → only positions 0 (advance by query.length=2, skip position 1)
		const matches = findMatches('aaa', 'aa')
		expect(matches).toHaveLength(1)
		expect(matches[0]!.charOffset).toBe(0)
	})

	test('correct line and column for multi-line text', () => {
		const text = 'line one\nline two\nline three'
		const matches = findMatches(text, 'line')
		expect(matches).toHaveLength(3)
		expect(matches[0]).toEqual({ charOffset: 0, line: 0, column: 0 })
		expect(matches[1]).toEqual({ charOffset: 9, line: 1, column: 0 })
		expect(matches[2]).toEqual({ charOffset: 18, line: 2, column: 0 })
	})

	test('match in middle of line has correct column', () => {
		const text = 'first line\n  hello world'
		const matches = findMatches(text, 'hello')
		expect(matches).toEqual([{ charOffset: 13, line: 1, column: 2 }])
	})

	test('match count capped at 10000', () => {
		const text = 'a'.repeat(20000)
		const matches = findMatches(text, 'a')
		expect(matches).toHaveLength(10000)
	})

	test('query longer than text returns empty', () => {
		expect(findMatches('ab', 'abcdef')).toEqual([])
	})
})
