import { describe, expect, it } from 'bun:test'
import { replace } from 'unicodeit'

import type { CustomNode } from '../ir/types.ts'
import { isBlockNode } from '../ir/types.ts'
import { darkTheme } from '../theme/dark.ts'
import { processMarkdown } from './processor.ts'
import { assertOk, findNodes } from './test-utils.ts'

describe('math pipeline', () => {
	it('produces mathInline from $x^2$', async () => {
		const result = await processMarkdown('$x^2$', darkTheme)
		assertOk(result)
		const nodes = findNodes(result.value, 'mathInline')
		expect(nodes.length).toBe(1)
		const node = nodes[0] as CustomNode<'mathInline'>
		expect(node.data.latex).toBe('x^2')
		expect(node.data.unicode).toBe(replace('x^2'))
		expect(node.data.fg).toBe(darkTheme.math.textColor)
	})

	it('produces mathDisplay from $$...$$', async () => {
		const md = '$$\n\\sum_{i=0}^n\n$$'
		const result = await processMarkdown(md, darkTheme)
		assertOk(result)
		const nodes = findNodes(result.value, 'mathDisplay')
		expect(nodes.length).toBe(1)
		const node = nodes[0] as CustomNode<'mathDisplay'>
		expect(node.data.latex).toContain('sum')
		expect(node.data.fg).toBe(darkTheme.math.textColor)
	})

	it('regular inline code still produces inlineCode', async () => {
		const result = await processMarkdown('`code`', darkTheme)
		assertOk(result)
		const mathNodes = findNodes(result.value, 'mathInline')
		expect(mathNodes.length).toBe(0)
		const codeNodes = findNodes(result.value, 'inlineCode')
		expect(codeNodes.length).toBe(1)
	})

	it('regular code block still produces codeBlock', async () => {
		const md = '```js\nconst x = 1\n```'
		const result = await processMarkdown(md, darkTheme)
		assertOk(result)
		const mathNodes = findNodes(result.value, 'mathDisplay')
		expect(mathNodes.length).toBe(0)
		const codeNodes = findNodes(result.value, 'codeBlock')
		expect(codeNodes.length).toBe(1)
	})

	it('adjacent inline math produces two nodes', async () => {
		const result = await processMarkdown('$a$ and $b$', darkTheme)
		assertOk(result)
		const nodes = findNodes(result.value, 'mathInline')
		expect(nodes.length).toBe(2)
	})

	it('dollar sign without closing is not math', async () => {
		const result = await processMarkdown('the price is $5', darkTheme)
		assertOk(result)
		const nodes = findNodes(result.value, 'mathInline')
		expect(nodes.length).toBe(0)
	})

	it('math inside bold text', async () => {
		const result = await processMarkdown('**$\\alpha$**', darkTheme)
		assertOk(result)
		const nodes = findNodes(result.value, 'mathInline')
		expect(nodes.length).toBe(1)
	})

	it('full fixture processes without error', async () => {
		const { readFileSync } = await import('node:fs')
		const { resolve } = await import('node:path')
		const fixture = readFileSync(resolve('test/fixtures/math-mermaid.md'), 'utf-8')
		const result = await processMarkdown(fixture, darkTheme)
		assertOk(result)
		const mathInline = findNodes(result.value, 'mathInline')
		const mathDisplay = findNodes(result.value, 'mathDisplay')
		const mermaid = findNodes(result.value, 'mermaid')
		expect(mathInline.length).toBeGreaterThan(0)
		expect(mathDisplay.length).toBeGreaterThan(0)
		expect(mermaid.length).toBeGreaterThan(0)
	})

	it('mathDisplay is a block node, mathInline is not', async () => {
		const md = '$x^2$\n\n$$\ny\n$$'
		const result = await processMarkdown(md, darkTheme)
		assertOk(result)
		const inlineNodes = findNodes(result.value, 'mathInline')
		const displayNodes = findNodes(result.value, 'mathDisplay')
		expect(inlineNodes.length).toBe(1)
		expect(displayNodes.length).toBe(1)
		expect(isBlockNode(inlineNodes[0]!)).toBe(false)
		expect(isBlockNode(displayNodes[0]!)).toBe(true)
	})
})

describe('unicodeit', () => {
	it('converts x^2 to x²', () => {
		expect(replace('x^2')).toBe('x²')
	})

	it('converts greek letters', () => {
		expect(replace('\\alpha + \\beta')).toBe('α + β')
	})

	it('handles unsupported constructs without crash', () => {
		const result = replace('\\begin{pmatrix} a & b \\end{pmatrix}')
		expect(typeof result).toBe('string')
	})
})
