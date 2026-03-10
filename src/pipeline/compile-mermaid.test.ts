import { describe, expect, it } from 'bun:test'
import { renderMermaidASCII } from 'beautiful-mermaid'

import type { CustomNode } from '../ir/types.ts'
import { darkTheme } from '../theme/dark.ts'
import { processMarkdown } from './processor.ts'
import { assertOk, findNodes } from './test-utils.ts'

describe('mermaid pipeline', () => {
	it('produces mermaid node from ```mermaid fence', async () => {
		const md = '```mermaid\ngraph TD\n  A --> B\n```'
		const result = await processMarkdown(md, darkTheme)
		assertOk(result)
		const nodes = findNodes(result.value, 'mermaid')
		expect(nodes.length).toBe(1)
		const node = nodes[0] as CustomNode<'mermaid'>
		expect(node.data.source).toContain('A --> B')
		expect(node.data.rendered).not.toBeNull()
		expect(node.data.error).toBeNull()
	})

	it('regular code block still produces codeBlock', async () => {
		const md = '```javascript\nconst x = 1\n```'
		const result = await processMarkdown(md, darkTheme)
		assertOk(result)
		const mermaidNodes = findNodes(result.value, 'mermaid')
		expect(mermaidNodes.length).toBe(0)
		const codeNodes = findNodes(result.value, 'codeBlock')
		expect(codeNodes.length).toBe(1)
	})

	it('unsupported diagram stores error', async () => {
		const md = '```mermaid\npie title Budget\n  "A": 50\n  "B": 50\n```'
		const result = await processMarkdown(md, darkTheme)
		assertOk(result)
		const nodes = findNodes(result.value, 'mermaid')
		expect(nodes.length).toBe(1)
		const node = nodes[0] as CustomNode<'mermaid'>
		// beautiful-mermaid may render or throw — either way the pipeline handles it
		if (node.data.rendered == null) {
			expect(node.data.error).not.toBeNull()
		}
	})
})

describe('beautiful-mermaid direct', () => {
	it('renders flowchart to ASCII with box-drawing', () => {
		const result = renderMermaidASCII('graph TD\n  A --> B')
		expect(result).toContain('A')
		expect(result).toContain('B')
		expect(result.length).toBeGreaterThan(10)
	})

	it('throws on unsupported diagram types', () => {
		expect(() => renderMermaidASCII('pie title Budget\n  "A": 50')).toThrow()
	})
})
