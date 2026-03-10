import { describe, expect, test } from 'bun:test'

import {
	graphemeDelete,
	graphemeInsert,
	graphemeLength,
	graphemeSlice,
	nextWordBoundary,
	prevWordBoundary,
} from './grapheme.ts'

describe('graphemeLength', () => {
	test('ASCII string', () => {
		expect(graphemeLength('hello')).toBe(5)
	})

	test('empty string', () => {
		expect(graphemeLength('')).toBe(0)
	})

	test('emoji', () => {
		expect(graphemeLength('👋🌍')).toBe(2)
	})

	test('ZWJ sequence counts as 1', () => {
		expect(graphemeLength('👨‍👩‍👧‍👦')).toBe(1)
	})

	test('combining characters', () => {
		// é as e + combining acute accent
		expect(graphemeLength('e\u0301')).toBe(1)
	})

	test('flag emoji', () => {
		expect(graphemeLength('🇺🇸')).toBe(1)
	})
})

describe('graphemeSlice', () => {
	test('slices ASCII', () => {
		expect(graphemeSlice('hello', 1, 3)).toBe('el')
	})

	test('slices emoji', () => {
		expect(graphemeSlice('a👋b🌍c', 1, 4)).toBe('👋b🌍')
	})

	test('slices from start', () => {
		expect(graphemeSlice('hello', 0, 2)).toBe('he')
	})

	test('slices to end', () => {
		expect(graphemeSlice('hello', 3)).toBe('lo')
	})

	test('empty slice', () => {
		expect(graphemeSlice('hello', 2, 2)).toBe('')
	})
})

describe('graphemeInsert', () => {
	test('inserts at beginning', () => {
		expect(graphemeInsert('hello', 0, 'X')).toBe('Xhello')
	})

	test('inserts at end', () => {
		expect(graphemeInsert('hello', 5, 'X')).toBe('helloX')
	})

	test('inserts in middle', () => {
		expect(graphemeInsert('hello', 2, 'X')).toBe('heXllo')
	})

	test('inserts emoji', () => {
		expect(graphemeInsert('ab', 1, '👋')).toBe('a👋b')
	})
})

describe('graphemeDelete', () => {
	test('deletes at beginning', () => {
		expect(graphemeDelete('hello', 0)).toBe('ello')
	})

	test('deletes at end', () => {
		expect(graphemeDelete('hello', 4)).toBe('hell')
	})

	test('deletes in middle', () => {
		expect(graphemeDelete('hello', 2)).toBe('helo')
	})

	test('deletes emoji', () => {
		expect(graphemeDelete('a👋b', 1)).toBe('ab')
	})

	test('deletes multiple', () => {
		expect(graphemeDelete('hello', 1, 3)).toBe('ho')
	})
})

describe('prevWordBoundary', () => {
	test('from end of word', () => {
		expect(prevWordBoundary('hello world', 5)).toBe(0)
	})

	test('from middle of second word', () => {
		expect(prevWordBoundary('hello world', 8)).toBe(6)
	})

	test('from start', () => {
		expect(prevWordBoundary('hello', 0)).toBe(0)
	})

	test('skips non-word chars', () => {
		expect(prevWordBoundary('foo  bar', 5)).toBe(0)
	})

	test('handles punctuation', () => {
		expect(prevWordBoundary('foo.bar', 7)).toBe(4)
	})
})

describe('nextWordBoundary', () => {
	test('from start of word', () => {
		expect(nextWordBoundary('hello world', 0)).toBe(5)
	})

	test('from space', () => {
		expect(nextWordBoundary('hello world', 5)).toBe(11)
	})

	test('from end', () => {
		expect(nextWordBoundary('hello', 5)).toBe(5)
	})

	test('skips non-word chars', () => {
		expect(nextWordBoundary('foo  bar', 3)).toBe(8)
	})
})
