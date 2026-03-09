import { describe, expect, test } from 'bun:test'

import type { IRNode } from './types.ts'
import { extractText } from './text-utils.ts'

describe('extractText', () => {
	test('empty children returns empty string', () => {
		expect(extractText([])).toBe('')
	})

	test('plain text nodes', () => {
		const nodes: IRNode[] = [
			{ type: 'text', value: 'hello ' },
			{ type: 'text', value: 'world' },
		]
		expect(extractText(nodes)).toBe('hello world')
	})

	test('inline code node', () => {
		const nodes: IRNode[] = [
			{ type: 'text', value: 'use ' },
			{ type: 'inlineCode', value: 'foo()', style: {} },
			{ type: 'text', value: ' here' },
		]
		expect(extractText(nodes)).toBe('use foo() here')
	})

	test('nested strong/emphasis strips formatting', () => {
		const nodes: IRNode[] = [
			{
				type: 'strong',
				style: {},
				children: [
					{ type: 'text', value: 'bold ' },
					{
						type: 'emphasis',
						style: {},
						children: [{ type: 'text', value: 'italic' }],
					},
				],
			},
		]
		expect(extractText(nodes)).toBe('bold italic')
	})

	test('link text extracted without URL', () => {
		const nodes: IRNode[] = [
			{
				type: 'link',
				url: 'https://example.com',
				style: {},
				children: [{ type: 'text', value: 'click here' }],
			},
		]
		expect(extractText(nodes)).toBe('click here')
	})

	test('break node becomes space', () => {
		const nodes: IRNode[] = [
			{ type: 'text', value: 'line1' },
			{ type: 'break' },
			{ type: 'text', value: 'line2' },
		]
		expect(extractText(nodes)).toBe('line1 line2')
	})

	test('strikethrough text extracted', () => {
		const nodes: IRNode[] = [
			{
				type: 'strikethrough',
				style: {},
				children: [{ type: 'text', value: 'deleted' }],
			},
		]
		expect(extractText(nodes)).toBe('deleted')
	})
})
