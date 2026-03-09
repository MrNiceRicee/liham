import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Children, isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToOpenTUI } from '../renderer/opentui/index.tsx'
import { darkTheme } from '../theme/dark.ts'
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

function assertOk(result: PipelineResult): asserts result is PipelineSuccess {
	expect(result.ok).toBe(true)
}

async function render(markdown: string): Promise<ReactNode> {
	const result = await processMarkdown(markdown, darkTheme)
	assertOk(result)
	return renderToOpenTUI(result.value, darkTheme)
}

// -- tests --

describe('processMarkdown structure', () => {
	it('wraps output in a root <box>', async () => {
		const tree = await render('hello')
		expect(isValidElement(tree)).toBe(true)
		expect(isIntrinsic(tree as ReactElement, 'box')).toBe(true)
	})

	it('renders paragraph inside <box> with <text>', async () => {
		const tree = await render('A simple paragraph.')
		// IR renderer wraps paragraph in <box><text>...</text></box>
		const boxes = findAll(tree, (el) => isIntrinsic(el, 'box'))
		expect(boxes.length).toBeGreaterThanOrEqual(2) // root box + paragraph box
		expect(collectText(tree)).toContain('A simple paragraph.')
	})

	it('renders heading with color and no # prefix', async () => {
		const tree = await render('# My Heading')
		const texts = findAll(tree, (el) => isIntrinsic(el, 'text'))
		const headingText = texts.find((t) => collectText(t.element).includes('My Heading'))

		expect(headingText).toBeDefined()
		const text = collectText(headingText!.element)
		expect(text).toContain('My Heading')
		expect(text).not.toContain('#')
		// heading color should be on a span child inside text
		const spans = findAll(headingText!.element, (el) => isIntrinsic(el, 'span'))
		const coloredSpan = spans.find((s) => prop(s.element, 'fg') != null)
		expect(coloredSpan).toBeDefined()
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

	it('promotes standalone image to block-level ImageBlock component', async () => {
		const tree = await render('![my picture](img.png)')
		// standalone image is promoted out of paragraph — rendered as ImageBlock component
		const imageComponents = findAll(tree, (el) => {
			const node = prop<{ type: string }>(el, 'node')
			return node?.type === 'image'
		})
		expect(imageComponents.length).toBe(1)
		expect(prop<{ alt: string }>(imageComponents[0]!.element, 'node')?.alt).toBe('my picture')
	})

	it('renders unordered list with bullet markers', async () => {
		const tree = await render('- alpha\n- beta\n- gamma')
		const text = collectText(tree)
		expect(text).toContain('alpha')
		expect(text).toContain('beta')
		expect(text).toContain('gamma')

		// bullets should be present
		const spans = findAll(tree, (el) => isIntrinsic(el, 'span'))
		const bulletSpans = spans.filter((s) => {
			const t = collectText(s.element)
			return t === '• '
		})
		expect(bulletSpans.length).toBe(3)
	})

	it('renders ordered list with numbered bullets', async () => {
		const tree = await render('1. first\n2. second\n3. third')
		const spans = findAll(tree, (el) => isIntrinsic(el, 'span'))
		const bullets = spans.map((s) => collectText(s.element)).filter((t) => /^\d+\.\s/.test(t))
		expect(bullets).toEqual(['1. ', '2. ', '3. '])
	})

	it('renders code block with border and content', async () => {
		const tree = await render('```js\nconst x = 1\n```')
		// code block renders as a bordered box
		const borderedBoxes = findAll(tree, (el) => {
			const style = prop<Record<string, unknown>>(el, 'style')
			return isIntrinsic(el, 'box') && style?.['border'] === true
		})
		expect(borderedBoxes.length).toBe(1)
		expect(collectText(borderedBoxes[0]!.element)).toContain('const x = 1')
	})

	it('renders nested lists with depth-based bullets', async () => {
		const tree = await render('- outer\n  - inner\n    - deep')
		const spans = findAll(tree, (el) => isIntrinsic(el, 'span'))
		const bullets = spans
			.map((s) => collectText(s.element))
			.filter((t) => ['• ', '◦ ', '▪ '].includes(t))
		expect(bullets[0]).toBe('• ')
		expect(bullets[1]).toBe('◦ ')
		expect(bullets[2]).toBe('▪ ')
	})

	it('renders blockquote with heavy left border', async () => {
		const tree = await render('> quoted text')
		const borderedBoxes = findAll(tree, (el) => {
			const style = prop<Record<string, unknown>>(el, 'style')
			return isIntrinsic(el, 'box') && style?.['borderStyle'] === 'heavy'
		})
		expect(borderedBoxes.length).toBe(1)
		expect(collectText(borderedBoxes[0]!.element)).toContain('quoted text')
	})

	it('renders horizontal rule', async () => {
		const tree = await render('---')
		// thematic break renders as a box with top border
		const hrBoxes = findAll(tree, (el) => {
			const border = prop<string[]>(el, 'border')
			return Array.isArray(border) && border.includes('top')
		})
		expect(hrBoxes.length).toBeGreaterThan(0)
	})

	it('renders task list checkboxes', async () => {
		const tree = await render('- [x] done\n- [ ] pending')
		const text = collectText(tree)

		expect(text).toContain('[x]')
		expect(text).toContain('[ ]')
	})

	it('handles empty markdown gracefully', async () => {
		const result = await processMarkdown('', darkTheme)
		expect(result.ok).toBe(true)
	})
})

describe('GFM table rendering', () => {
	it('renders table with box-drawing border characters', async () => {
		const tree = await render('| A | B |\n| --- | --- |\n| 1 | 2 |')
		const text = collectText(tree)
		// horizontal separators are text content
		expect(text).toContain('┌')
		expect(text).toContain('┐')
		expect(text).toContain('└')
		expect(text).toContain('┘')
		// vertical borders are now text characters (fully text-based rendering)
		expect(text).toContain('│')
	})

	it('renders header and data rows', async () => {
		const tree = await render('| H1 | H2 |\n| --- | --- |\n| d1 | d2 |')
		const text = collectText(tree)
		expect(text).toContain('H1')
		expect(text).toContain('H2')
		expect(text).toContain('d1')
		expect(text).toContain('d2')
	})

	it('renders inline formatting inside table cells', async () => {
		const tree = await render('| **bold** | `code` |\n| --- | --- |\n| text | text |')
		const bolds = findAll(tree, (el) => isIntrinsic(el, 'strong'))
		expect(bolds.length).toBeGreaterThanOrEqual(1)
		expect(collectText(bolds[0]!.element)).toBe('bold')
	})

	it('renders header separator with cross junction', async () => {
		const tree = await render('| A | B |\n| --- | --- |\n| 1 | 2 |')
		const text = collectText(tree)
		expect(text).toContain('├')
		expect(text).toContain('┼')
		expect(text).toContain('┤')
	})
})

describe('processMarkdown benchmark fixtures', () => {
	const fixturesDir = resolve(import.meta.dir, '../../test/fixtures')

	it('processes small.md with correct structure', async () => {
		const md = readFileSync(resolve(fixturesDir, 'small.md'), 'utf-8')
		const start = performance.now()
		const result = await processMarkdown(md, darkTheme)
		const elapsed = performance.now() - start

		assertOk(result)
		expect(elapsed).toBeLessThan(200)

		const tree = renderToOpenTUI(result.value, darkTheme)

		// heading color should be on span children inside text elements
		const headingSpans = findAll(tree, (el) => {
			return isIntrinsic(el, 'span') && prop(el, 'fg') != null && prop(el, 'attributes') != null
		})
		expect(headingSpans.length).toBeGreaterThanOrEqual(1)

		// paragraphs (boxes with text children)
		const boxes = findAll(tree, (el) => isIntrinsic(el, 'box'))
		expect(boxes.length).toBeGreaterThanOrEqual(10)

		// code blocks (bordered boxes)
		const codeBlocks = findAll(tree, (el) => {
			const style = prop<Record<string, unknown>>(el, 'style')
			return isIntrinsic(el, 'box') && style?.['border'] === true
		})
		expect(codeBlocks.length).toBeGreaterThanOrEqual(1)
	})

	it('processes large.md under 200ms', async () => {
		const md = readFileSync(resolve(fixturesDir, 'large.md'), 'utf-8')
		const start = performance.now()
		const result = await processMarkdown(md, darkTheme)
		const elapsed = performance.now() - start

		expect(result.ok).toBe(true)
		expect(elapsed).toBeLessThan(200)
	})
})
