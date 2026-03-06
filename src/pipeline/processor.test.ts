import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Children, isValidElement, type ReactElement, type ReactNode } from 'react'

import type { PipelineResult, PipelineSuccess } from '../types/pipeline.ts'

import { processMarkdown } from './processor.ts'

// -- tree walking helpers --

interface WalkMatch {
	element: ReactElement
	depth: number
}

// react types props as {} — this helper provides typed access for test introspection.
// single controlled boundary rather than scattering casts across every assertion.
function prop<T>(el: ReactElement, name: string): T | undefined {
	const props = el.props as Record<string, unknown>
	return props[name] as T | undefined
}

// finds all ReactElements in the tree matching a predicate
function findAll(node: ReactNode, pred: (el: ReactElement) => boolean): WalkMatch[] {
	const matches: WalkMatch[] = []
	function walk(n: ReactNode, depth: number) {
		if (isValidElement(n)) {
			if (pred(n)) matches.push({ element: n, depth })
			Children.forEach(prop<ReactNode>(n, 'children'), (child) => walk(child, depth + 1))
		} else if (Array.isArray(n)) {
			for (const item of n) walk(item, depth)
		}
	}
	walk(node, 0)
	return matches
}

// collects all text strings from the tree
function collectText(node: ReactNode): string {
	if (typeof node === 'string') return node
	if (typeof node === 'number') return String(node)
	if (isValidElement(node)) {
		let text = ''
		Children.forEach(prop<ReactNode>(node, 'children'), (child) => {
			text += collectText(child)
		})
		return text
	}
	if (Array.isArray(node)) return node.map(collectText).join('')
	return ''
}

function isIntrinsic(el: ReactElement, tag: string): boolean {
	return typeof el.type === 'string' && el.type === tag
}

function isComponent(el: ReactElement, name: string): boolean {
	return typeof el.type === 'function' && el.type.name === name
}

function assertOk(result: PipelineResult): asserts result is PipelineSuccess {
	expect(result.ok).toBe(true)
}

async function render(markdown: string): Promise<ReactNode> {
	const result = await processMarkdown(markdown)
	assertOk(result)
	return result.value
}

// -- tests --

describe('processMarkdown structure', () => {
	it('wraps output in a root <box>', async () => {
		const tree = await render('hello')
		expect(isValidElement(tree)).toBe(true)
		expect(isIntrinsic(tree as ReactElement, 'box')).toBe(true)
	})

	it('renders paragraph with Paragraph component', async () => {
		const tree = await render('A simple paragraph.')
		const paragraphs = findAll(tree, (el) => isComponent(el, 'Paragraph'))

		expect(paragraphs.length).toBe(1)
		expect(collectText(paragraphs[0]!.element)).toContain('A simple paragraph.')
	})

	it('renders heading with Heading component (no # prefix)', async () => {
		const tree = await render('# My Heading')
		const headings = findAll(tree, (el) => isComponent(el, 'Heading'))

		expect(headings.length).toBe(1)
		const text = collectText(headings[0]!.element)
		expect(text).toContain('My Heading')
		expect(text).not.toContain('#')
	})

	it('renders bold as <strong> intrinsic', async () => {
		const tree = await render('**bold text**')
		const bolds = findAll(tree, (el) => isIntrinsic(el, 'strong'))

		expect(bolds.length).toBe(1)
		expect(collectText(bolds[0]!.element)).toBe('bold text')
	})

	it('renders italic as <em> intrinsic', async () => {
		const tree = await render('*italic text*')
		const italics = findAll(tree, (el) => isIntrinsic(el, 'em'))

		expect(italics.length).toBe(1)
		expect(collectText(italics[0]!.element)).toBe('italic text')
	})

	it('renders inline code as <span> with theme colors', async () => {
		const tree = await render('use `npm install`')
		const codeSpans = findAll(
			tree,
			(el) => isIntrinsic(el, 'span') && prop<string>(el, 'bg') != null,
		)

		expect(codeSpans.length).toBeGreaterThanOrEqual(1)
		expect(collectText(codeSpans[0]!.element)).toBe('npm install')
	})

	it('renders strikethrough as <span> with STRIKETHROUGH attribute', async () => {
		const tree = await render('~~deleted~~')
		const spans = findAll(
			tree,
			(el) =>
				isIntrinsic(el, 'span') &&
				prop<number>(el, 'attributes') != null &&
				collectText(el) === 'deleted',
		)

		expect(spans.length).toBe(1)
	})

	it('renders links as <a> with href', async () => {
		const tree = await render('[click here](https://example.com)')
		const links = findAll(tree, (el) => isIntrinsic(el, 'a'))

		expect(links.length).toBe(1)
		expect(prop<string>(links[0]!.element, 'href')).toBe('https://example.com')
		expect(collectText(links[0]!.element)).toBe('click here')
	})

	it('renders images as [image: alt] text', async () => {
		const tree = await render('![my picture](img.png)')
		expect(collectText(tree)).toContain('[image: my picture]')
	})

	it('renders unordered list with List and ListItem components', async () => {
		const tree = await render('- alpha\n- beta\n- gamma')
		const lists = findAll(tree, (el) => isComponent(el, 'List'))
		const items = findAll(tree, (el) => isComponent(el, 'ListItem'))

		expect(lists.length).toBe(1)
		expect(items.length).toBe(3)

		for (const item of items) {
			const node = prop<{ properties?: Record<string, unknown> }>(item.element, 'node')
			expect(node?.properties?.['data-bullet']).toBeDefined()
		}
	})

	it('renders ordered list with numbered bullets', async () => {
		const tree = await render('1. first\n2. second\n3. third')
		const items = findAll(tree, (el) => isComponent(el, 'ListItem'))

		expect(items.length).toBe(3)
		const bullets = items.map((i) => {
			const node = prop<{ properties?: Record<string, unknown> }>(i.element, 'node')
			return node?.properties?.['data-bullet']
		})
		expect(bullets).toEqual(['1. ', '2. ', '3. '])
	})

	it('renders code block with CodeBlock component', async () => {
		const tree = await render('```js\nconst x = 1\n```')
		const codeBlocks = findAll(tree, (el) => isComponent(el, 'CodeBlock'))

		expect(codeBlocks.length).toBe(1)
		expect(collectText(codeBlocks[0]!.element)).toContain('const x = 1')
	})

	it('renders nested lists with depth-based bullets', async () => {
		const tree = await render('- outer\n  - inner\n    - deep')
		const items = findAll(tree, (el) => isComponent(el, 'ListItem'))

		expect(items.length).toBe(3)
		const bullets = items.map((i) => {
			const node = prop<{ properties?: Record<string, unknown> }>(i.element, 'node')
			return node?.properties?.['data-bullet']
		})
		// depth 1: •, depth 2: ◦, depth 3: ▪
		expect(bullets[0]).toBe('• ')
		expect(bullets[1]).toBe('◦ ')
		expect(bullets[2]).toBe('▪ ')
	})

	it('renders blockquote with Blockquote component', async () => {
		const tree = await render('> quoted text')
		const quotes = findAll(tree, (el) => isComponent(el, 'Blockquote'))

		expect(quotes.length).toBe(1)
		expect(collectText(quotes[0]!.element)).toContain('quoted text')
	})

	it('renders horizontal rule with Fallback component', async () => {
		const tree = await render('---')
		const hrs = findAll(tree, (el) => isComponent(el, 'Fallback'))

		expect(hrs.length).toBeGreaterThanOrEqual(1)
	})

	it('renders task list checkboxes', async () => {
		const tree = await render('- [x] done\n- [ ] pending')
		const text = collectText(tree)

		expect(text).toContain('[x]')
		expect(text).toContain('[ ]')
	})

	it('handles empty markdown gracefully', async () => {
		const result = await processMarkdown('')
		expect(result.ok).toBe(true)
	})
})

describe('processMarkdown benchmark fixtures', () => {
	const fixturesDir = resolve(import.meta.dir, '../../test/fixtures')

	it('processes small.md with correct structure', async () => {
		const md = readFileSync(resolve(fixturesDir, 'small.md'), 'utf-8')
		const start = performance.now()
		const result = await processMarkdown(md)
		const elapsed = performance.now() - start

		assertOk(result)
		expect(elapsed).toBeLessThan(200)

		const tree = result.value
		const headings = findAll(tree, (el) => isComponent(el, 'Heading'))
		const paragraphs = findAll(tree, (el) => isComponent(el, 'Paragraph'))
		const codeBlocks = findAll(tree, (el) => isComponent(el, 'CodeBlock'))
		const lists = findAll(tree, (el) => isComponent(el, 'List'))

		// small.md has: h1, h2 x4, h3, h4, h5, h6 = 10 headings
		expect(headings.length).toBe(10)
		for (const h of headings) {
			expect(collectText(h.element)).not.toMatch(/^#+/)
		}
		expect(paragraphs.length).toBeGreaterThanOrEqual(3)
		expect(codeBlocks.length).toBe(1)
		// top-level UL + nested ULs + OL = 4+
		expect(lists.length).toBeGreaterThanOrEqual(3)
	})

	it('processes large.md under 200ms', async () => {
		const md = readFileSync(resolve(fixturesDir, 'large.md'), 'utf-8')
		const start = performance.now()
		const result = await processMarkdown(md)
		const elapsed = performance.now() - start

		expect(result.ok).toBe(true)
		expect(elapsed).toBeLessThan(200)
	})
})
