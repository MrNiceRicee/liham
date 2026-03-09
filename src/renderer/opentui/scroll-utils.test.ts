import { describe, expect, test } from 'bun:test'

import type { CoreIRNode, IRNode } from '../../ir/types.ts'
import { estimateHeadingOffset, estimateHeight, scrollToLine } from './scroll-utils.ts'

describe('scrollToLine', () => {
	test('applies +1 offset for padding', () => {
		let scrolledTo = -1
		const fakeRef = {
			scrollTo: (pos: number) => {
				scrolledTo = pos
			},
		}
		scrollToLine(fakeRef as never, 5)
		expect(scrolledTo).toBe(6)
	})

	test('null ref is no-op', () => {
		scrollToLine(null, 5) // should not throw
	})
})

describe('estimateHeight', () => {
	test('heading = 2 rows', () => {
		const node: CoreIRNode = {
			type: 'heading',
			level: 1,
			style: {},
			children: [{ type: 'text', value: 'Title' }],
		}
		expect(estimateHeight(node)).toBe(2)
	})

	test('paragraph wraps based on paneWidth', () => {
		const node: CoreIRNode = {
			type: 'paragraph',
			style: {},
			children: [{ type: 'text', value: 'a'.repeat(100) }],
		}
		// paneWidth=80, contentWidth=78, ceil(100/78)=2, +1 margin = 3
		expect(estimateHeight(node, 80)).toBe(3)
	})

	test('short paragraph = 2 rows', () => {
		const node: CoreIRNode = {
			type: 'paragraph',
			style: {},
			children: [{ type: 'text', value: 'short' }],
		}
		expect(estimateHeight(node, 80)).toBe(2) // ceil(5/78)=1 +1 margin
	})

	test('codeBlock counts lines + border + margin', () => {
		const node: CoreIRNode = {
			type: 'codeBlock',
			code: 'line1\nline2\nline3',
			language: 'ts',
			style: {},
			children: [],
		}
		// 3 lines + 2 border + 1 lang + 1 margin = 7
		expect(estimateHeight(node)).toBe(7)
	})

	test('codeBlock without language', () => {
		const node: CoreIRNode = {
			type: 'codeBlock',
			code: 'single line',
			style: {},
			children: [],
		}
		// 1 line + 2 border + 0 lang + 1 margin = 4
		expect(estimateHeight(node)).toBe(4)
	})

	test('thematicBreak = 1 row', () => {
		const node: CoreIRNode = { type: 'thematicBreak', style: { char: '─', color: '#ccc' } }
		expect(estimateHeight(node)).toBe(1)
	})

	test('image = 10 rows', () => {
		const node: CoreIRNode = { type: 'image', alt: 'photo', style: {} }
		expect(estimateHeight(node)).toBe(10)
	})

	test('depth guard returns 1 at max depth', () => {
		// create deeply nested blockquotes
		let inner: CoreIRNode = {
			type: 'paragraph',
			style: {},
			children: [{ type: 'text', value: 'deep' }],
		}
		for (let i = 0; i < 150; i++) {
			inner = { type: 'blockquote', style: {}, children: [inner] }
		}
		// should not stack overflow
		const height = estimateHeight(inner, 80)
		expect(height).toBeGreaterThan(0)
	})
})

describe('estimateHeadingOffset', () => {
	test('first heading has offset 0', () => {
		const nodes: IRNode[] = [
			{ type: 'heading', level: 1, style: {}, children: [{ type: 'text', value: 'Title' }] },
			{ type: 'paragraph', style: {}, children: [{ type: 'text', value: 'text' }] },
		]
		expect(estimateHeadingOffset(nodes, 0)).toBe(0)
	})

	test('second heading offset accounts for content between', () => {
		const nodes: IRNode[] = [
			{ type: 'heading', level: 1, style: {}, children: [{ type: 'text', value: 'Title' }] },
			{ type: 'paragraph', style: {}, children: [{ type: 'text', value: 'text' }] },
			{ type: 'heading', level: 2, style: {}, children: [{ type: 'text', value: 'Section' }] },
		]
		// heading1=2, paragraph=2 (ceil(4/78)+1=2) → offset for heading2 = 4
		expect(estimateHeadingOffset(nodes, 1, 80)).toBe(4)
	})

	test('returns total offset if heading index past end', () => {
		const nodes: IRNode[] = [
			{ type: 'heading', level: 1, style: {}, children: [{ type: 'text', value: 'Title' }] },
		]
		// heading=2, looking for index 5 → returns total = 2
		expect(estimateHeadingOffset(nodes, 5, 80)).toBe(2)
	})
})
