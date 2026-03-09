import { describe, expect, test } from 'bun:test'

import { type TocEntry, tocToItems } from './toc.ts'

describe('tocToItems', () => {
	test('empty entries returns empty array', () => {
		expect(tocToItems([])).toEqual([])
	})

	test('single heading gets no indent', () => {
		const entries: TocEntry[] = [{ level: 2, text: 'Section', blockIndex: 0, estimatedOffset: 0 }]
		const items = tocToItems(entries)
		expect(items).toEqual([{ label: 'Section', prefix: '' }])
	})

	test('normalizes indentation to minimum level', () => {
		const entries: TocEntry[] = [
			{ level: 2, text: 'Chapter', blockIndex: 0, estimatedOffset: 0 },
			{ level: 3, text: 'Section', blockIndex: 2, estimatedOffset: 4 },
			{ level: 4, text: 'Subsection', blockIndex: 4, estimatedOffset: 8 },
		]
		const items = tocToItems(entries)
		expect(items[0]!.prefix).toBe('') // h2 = min level, no indent
		expect(items[1]!.prefix).toBe('  ') // h3 = +1 level = 2 spaces
		expect(items[2]!.prefix).toBe('    ') // h4 = +2 levels = 4 spaces
	})

	test('all same level gets no indent', () => {
		const entries: TocEntry[] = [
			{ level: 3, text: 'A', blockIndex: 0, estimatedOffset: 0 },
			{ level: 3, text: 'B', blockIndex: 2, estimatedOffset: 4 },
		]
		const items = tocToItems(entries)
		expect(items[0]!.prefix).toBe('')
		expect(items[1]!.prefix).toBe('')
	})
})
