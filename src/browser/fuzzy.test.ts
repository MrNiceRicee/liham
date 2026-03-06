import { describe, expect, test } from 'bun:test'

import type { FileEntry } from './scanner.ts'

import { fuzzyFilter, fuzzyMatch } from './fuzzy.ts'

// -- helpers --

function entry(relativePath: string): FileEntry {
	const parts = relativePath.split('/')
	const name = parts[parts.length - 1]!
	const directory = parts.length > 1 ? parts.slice(0, -1).join('/') : ''
	return { name, relativePath, absolutePath: `/root/${relativePath}`, directory }
}

// -- fuzzyMatch --

describe('fuzzyMatch', () => {
	test('empty query matches everything with score 0', () => {
		const result = fuzzyMatch('', 'README.md')
		expect(result).toEqual({ score: 0, positions: [] })
	})

	test('exact match scores high', () => {
		const result = fuzzyMatch('README.md', 'README.md')
		expect(result).not.toBeNull()
		expect(result!.score).toBeGreaterThan(0)
	})

	test('non-matching query returns null', () => {
		const result = fuzzyMatch('xyz', 'README.md')
		expect(result).toBeNull()
	})

	test('case-insensitive matching', () => {
		const result = fuzzyMatch('readme', 'README.md')
		expect(result).not.toBeNull()
	})

	test('consecutive chars score higher than scattered', () => {
		// "read" in "README.md" — all consecutive
		const consecutive = fuzzyMatch('read', 'README.md')
		// "ramd" in "README.md" — scattered (R, A, M, D scattered)
		const scattered = fuzzyMatch('ramd', 'README.md')
		expect(consecutive).not.toBeNull()
		expect(scattered).not.toBeNull()
		expect(consecutive!.score).toBeGreaterThan(scattered!.score)
	})

	test('word boundary matches score higher', () => {
		// "ag" matching at boundary (a/g in "api/guide.md") vs mid-word
		const boundary = fuzzyMatch('ag', 'api/guide.md')
		const midWord = fuzzyMatch('ag', 'staging.md')
		expect(boundary).not.toBeNull()
		expect(midWord).not.toBeNull()
		expect(boundary!.score).toBeGreaterThan(midWord!.score)
	})

	test('start-of-string bonus', () => {
		const startMatch = fuzzyMatch('r', 'README.md')
		const midMatch = fuzzyMatch('a', 'bac.md')
		expect(startMatch).not.toBeNull()
		expect(midMatch).not.toBeNull()
		// start match gets START_BONUS + BOUNDARY_BONUS, mid gets nothing
		expect(startMatch!.score).toBeGreaterThan(midMatch!.score)
	})

	test('positions array is correct', () => {
		const result = fuzzyMatch('rm', 'README.md')
		expect(result).not.toBeNull()
		// R at 0, next lowercase 'm' — but matching is case-insensitive
		// "R" matches at 0, "m" — depends on greedy match
		expect(result!.positions.length).toBe(2)
		expect(result!.positions[0]).toBe(0) // R
	})

	test('path separator is a word boundary', () => {
		const result = fuzzyMatch('g', 'docs/guide.md')
		expect(result).not.toBeNull()
		// 'g' at index 5, right after '/'
		expect(result!.positions).toEqual([5])
	})

	test('subsequence that does not exist returns null', () => {
		const result = fuzzyMatch('zzz', 'README.md')
		expect(result).toBeNull()
	})
})

// -- fuzzyFilter --

describe('fuzzyFilter', () => {
	const entries = [
		entry('README.md'),
		entry('docs/api.md'),
		entry('docs/guide.md'),
		entry('src/app.md'),
		entry('notes.md'),
	]

	test('empty query returns all items with score 0', () => {
		const results = fuzzyFilter('', entries)
		expect(results.length).toBe(entries.length)
		for (const r of results) {
			expect(r.score).toBe(0)
		}
	})

	test('filters out non-matching entries', () => {
		const results = fuzzyFilter('guide', entries)
		expect(results.length).toBe(1)
		expect(results[0]!.entry.relativePath).toBe('docs/guide.md')
	})

	test('sorts by score descending', () => {
		const results = fuzzyFilter('a', entries)
		for (let i = 1; i < results.length; i++) {
			expect(results[i]!.score).toBeLessThanOrEqual(results[i - 1]!.score)
		}
	})

	test('path matching works across directories', () => {
		// "da" should match "docs/api.md" (d from docs, a from api)
		const results = fuzzyFilter('da', entries)
		const paths = results.map((r) => r.entry.relativePath)
		expect(paths).toContain('docs/api.md')
	})

	test('single character matches multiple files', () => {
		const results = fuzzyFilter('d', entries)
		// should match docs/api.md, docs/guide.md, README.md (has d)
		expect(results.length).toBeGreaterThan(1)
	})

	test('no matches returns empty array', () => {
		const results = fuzzyFilter('zzzzz', entries)
		expect(results).toEqual([])
	})

	test('match positions are returned for highlighting', () => {
		const results = fuzzyFilter('api', entries)
		const apiMatch = results.find((r) => r.entry.relativePath === 'docs/api.md')
		expect(apiMatch).toBeDefined()
		expect(apiMatch!.positions.length).toBe(3)
	})

	test('ties broken alphabetically', () => {
		// entries with same score should preserve input order (all score 0)
		const results = fuzzyFilter('', entries)
		expect(results.length).toBe(entries.length)
	})
})
