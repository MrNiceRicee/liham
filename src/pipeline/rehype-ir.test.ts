import { describe, expect, it } from 'bun:test'

import type { CoreIRNode, ImageNode, IRNode, RootNode } from '../ir/types.ts'
import type { PipelineSuccess } from '../types/pipeline.ts'

import { isBlockNode } from '../ir/types.ts'
import { darkTheme } from '../theme/dark.ts'
import { processMarkdown } from './processor.ts'

// cast to CoreIRNode for type-safe property access in tests
// (CustomNode<string> in the union prevents discriminated narrowing on IRNode)
type N = CoreIRNode

async function compileToIR(markdown: string): Promise<N> {
	const result = await processMarkdown(markdown, darkTheme)
	expect(result.ok).toBe(true)
	return (result as PipelineSuccess).value as N
}

function findNodes(ir: N, type: string): N[] {
	const results: N[] = []
	function walk(node: IRNode) {
		if (node.type === type) results.push(node as N)
		if ('children' in node && Array.isArray(node.children)) {
			for (const child of node.children) walk(child)
		}
	}
	walk(ir)
	return results
}

function collectIRText(node: N): string {
	switch (node.type) {
		case 'text':
			return node.value
		case 'inlineCode':
			return node.value
		case 'image':
			return `[image: ${node.alt}]`
		case 'checkbox':
			return node.checked ? '[x] ' : '[ ] '
		default:
			if ('children' in node && Array.isArray(node.children)) {
				return (node.children as N[]).map(collectIRText).join('')
			}
			return ''
	}
}

describe('IR compiler — block nodes', () => {
	it('produces root node', async () => {
		const ir = await compileToIR('hello')
		expect(ir.type).toBe('root')
	})

	it('produces heading with level and style', async () => {
		const ir = await compileToIR('# Title')
		const headings = findNodes(ir, 'heading')
		expect(headings.length).toBe(1)
		const h = headings[0]!
		if (h.type !== 'heading') throw new Error('expected heading')
		expect(h.level).toBe(1)
		expect(h.style.fg).toBe(darkTheme.heading.levels[1].color)
		expect(h.style.bold).toBe(true)
	})

	it('produces headings at all 6 levels', async () => {
		const ir = await compileToIR('# H1\n## H2\n### H3\n#### H4\n##### H5\n###### H6')
		const headings = findNodes(ir, 'heading')
		expect(headings.length).toBe(6)
		for (let i = 0; i < 6; i++) {
			const h = headings[i]!
			if (h.type !== 'heading') throw new Error('expected heading')
			expect(h.level).toBe((i + 1) as 1 | 2 | 3 | 4 | 5 | 6)
		}
	})

	it('produces paragraph with style', async () => {
		const ir = await compileToIR('Some text.')
		const paragraphs = findNodes(ir, 'paragraph')
		expect(paragraphs.length).toBe(1)
		const p = paragraphs[0]!
		if (p.type !== 'paragraph') throw new Error('expected paragraph')
		expect(p.style.fg).toBe(darkTheme.paragraph.textColor)
		expect(collectIRText(p)).toContain('Some text.')
	})

	it('produces codeBlock with code and language', async () => {
		const ir = await compileToIR('```js\nconst x = 1\n```')
		const blocks = findNodes(ir, 'codeBlock')
		expect(blocks.length).toBe(1)
		const cb = blocks[0]!
		if (cb.type !== 'codeBlock') throw new Error('expected codeBlock')
		expect(cb.code).toContain('const x = 1')
		expect(cb.language).toBe('js')
		expect(cb.style.bg).toBe(darkTheme.codeBlock.backgroundColor)
		expect(cb.style.borderColor).toBe(darkTheme.codeBlock.borderColor)
	})

	it('produces codeBlock children from syntax highlighting', async () => {
		const ir = await compileToIR('```js\nconst x = 1\n```')
		const blocks = findNodes(ir, 'codeBlock')
		const cb = blocks[0]!
		if (cb.type !== 'codeBlock') throw new Error('expected codeBlock')
		expect(cb.children.length).toBeGreaterThan(0)
	})

	it('produces blockquote with style', async () => {
		const ir = await compileToIR('> quoted')
		const quotes = findNodes(ir, 'blockquote')
		expect(quotes.length).toBe(1)
		const bq = quotes[0]!
		if (bq.type !== 'blockquote') throw new Error('expected blockquote')
		expect(bq.style.borderColor).toBe(darkTheme.blockquote.borderColor)
		expect(bq.style.bg).toBe(darkTheme.blockquote.backgroundColor)
		expect(collectIRText(bq)).toContain('quoted')
	})

	it('produces unordered list with items', async () => {
		const ir = await compileToIR('- a\n- b\n- c')
		const lists = findNodes(ir, 'list')
		expect(lists.length).toBe(1)
		const list = lists[0]!
		if (list.type !== 'list') throw new Error('expected list')
		expect(list.ordered).toBe(false)
		const items = findNodes(ir, 'listItem')
		expect(items.length).toBe(3)
	})

	it('produces ordered list with numbered bullets', async () => {
		const ir = await compileToIR('1. first\n2. second')
		const lists = findNodes(ir, 'list')
		expect(lists.length).toBe(1)
		const list = lists[0]!
		if (list.type !== 'list') throw new Error('expected list')
		expect(list.ordered).toBe(true)
		const items = findNodes(ir, 'listItem')
		expect(items.length).toBe(2)
		const first = items[0]!
		const second = items[1]!
		if (first.type !== 'listItem' || second.type !== 'listItem')
			throw new Error('expected listItem')
		expect(first.bullet).toBe('1. ')
		expect(second.bullet).toBe('2. ')
	})

	it('produces depth-based bullets for nested lists', async () => {
		const ir = await compileToIR('- outer\n  - inner\n    - deep')
		const items = findNodes(ir, 'listItem')
		expect(items.length).toBe(3)
		const bullets = items.map((i) => {
			if (i.type !== 'listItem') throw new Error('expected listItem')
			return i.bullet
		})
		expect(bullets).toEqual(['• ', '◦ ', '▪ '])
	})

	it('produces thematicBreak', async () => {
		const ir = await compileToIR('---')
		const breaks = findNodes(ir, 'thematicBreak')
		expect(breaks.length).toBe(1)
		const tb = breaks[0]!
		if (tb.type !== 'thematicBreak') throw new Error('expected thematicBreak')
		expect(tb.style.color).toBe(darkTheme.horizontalRule.color)
		expect(tb.style.char).toBe(darkTheme.horizontalRule.char)
	})
})

describe('IR compiler — inline nodes', () => {
	it('produces strong node', async () => {
		const ir = await compileToIR('**bold**')
		const strongs = findNodes(ir, 'strong')
		const bold = strongs.find((s) => s.type === 'strong' && s.style.bold === true)
		expect(bold).toBeDefined()
		expect(collectIRText(bold!)).toBe('bold')
	})

	it('produces emphasis node', async () => {
		const ir = await compileToIR('*italic*')
		const nodes = findNodes(ir, 'emphasis')
		expect(nodes.length).toBe(1)
		const em = nodes[0]!
		if (em.type !== 'emphasis') throw new Error('expected emphasis')
		expect(em.style.italic).toBe(true)
		expect(collectIRText(em)).toBe('italic')
	})

	it('produces strikethrough node', async () => {
		const ir = await compileToIR('~~deleted~~')
		const nodes = findNodes(ir, 'strikethrough')
		expect(nodes.length).toBe(1)
		const s = nodes[0]!
		if (s.type !== 'strikethrough') throw new Error('expected strikethrough')
		expect(s.style.strikethrough).toBe(true)
		expect(collectIRText(s)).toBe('deleted')
	})

	it('produces inlineCode node', async () => {
		const ir = await compileToIR('use `npm install`')
		const nodes = findNodes(ir, 'inlineCode')
		expect(nodes.length).toBe(1)
		const ic = nodes[0]!
		if (ic.type !== 'inlineCode') throw new Error('expected inlineCode')
		expect(ic.value).toBe('npm install')
		expect(ic.style.fg).toBe(darkTheme.inlineCode.textColor)
		expect(ic.style.bg).toBe(darkTheme.inlineCode.backgroundColor)
	})

	it('produces link node', async () => {
		const ir = await compileToIR('[click](https://example.com)')
		const nodes = findNodes(ir, 'link')
		expect(nodes.length).toBe(1)
		const link = nodes[0]!
		if (link.type !== 'link') throw new Error('expected link')
		expect(link.url).toBe('https://example.com')
		expect(link.style.fg).toBe(darkTheme.link.color)
		expect(link.style.underline).toBe(true)
		expect(collectIRText(link)).toBe('click')
	})

	it('produces image node', async () => {
		const ir = await compileToIR('![photo](img.png)')
		const nodes = findNodes(ir, 'image')
		expect(nodes.length).toBe(1)
		const img = nodes[0]!
		if (img.type !== 'image') throw new Error('expected image')
		expect(img.alt).toBe('photo')
		expect(img.style.fg).toBe(darkTheme.image.fallbackColor)
	})

	it('produces break node', async () => {
		const ir = await compileToIR('line1  \nline2')
		const nodes = findNodes(ir, 'break')
		expect(nodes.length).toBe(1)
	})

	it('produces checkbox nodes', async () => {
		const ir = await compileToIR('- [x] done\n- [ ] pending')
		const nodes = findNodes(ir, 'checkbox')
		expect(nodes.length).toBe(2)
		const done = nodes[0]!
		const pending = nodes[1]!
		if (done.type !== 'checkbox' || pending.type !== 'checkbox')
			throw new Error('expected checkbox')
		expect(done.checked).toBe(true)
		expect(pending.checked).toBe(false)
	})

	it('resolves HLJS colors on code spans', async () => {
		const ir = await compileToIR('```js\nconst x = 1\n```')
		const textNodes = findNodes(ir, 'text')
		const styled = textNodes.filter((n) => n.type === 'text' && n.style?.fg != null)
		expect(styled.length).toBeGreaterThan(0)
	})
})

describe('IR compiler — table nodes', () => {
	it('produces table with rows and cells', async () => {
		const md = '| A | B |\n| --- | --- |\n| 1 | 2 |'
		const ir = await compileToIR(md)
		const tables = findNodes(ir, 'table')
		expect(tables.length).toBe(1)
		const table = tables[0]!
		if (table.type !== 'table') throw new Error('expected table')
		expect(table.style.borderColor).toBe(darkTheme.table.borderColor)

		// should have 2 rows: header + data
		const rows = table.children.filter((c) => c.type === 'tableRow')
		expect(rows.length).toBe(2)
	})

	it('marks header row with isHeader=true', async () => {
		const md = '| H1 | H2 |\n| --- | --- |\n| d1 | d2 |'
		const ir = await compileToIR(md)
		const rows = findNodes(ir, 'tableRow')
		expect(rows.length).toBe(2)
		const header = rows[0]!
		const data = rows[1]!
		if (header.type !== 'tableRow' || data.type !== 'tableRow')
			throw new Error('expected tableRow')
		expect(header.isHeader).toBe(true)
		expect(data.isHeader).toBe(false)
	})

	it('extracts column alignments', async () => {
		const md = '| L | C | R |\n| :--- | :---: | ---: |\n| a | b | c |'
		const ir = await compileToIR(md)
		const tables = findNodes(ir, 'table')
		const table = tables[0]!
		if (table.type !== 'table') throw new Error('expected table')
		expect(table.alignments).toEqual(['left', 'center', 'right'])
	})

	it('produces cells with correct content', async () => {
		const md = '| hello | world |\n| --- | --- |\n| foo | bar |'
		const ir = await compileToIR(md)
		const cells = findNodes(ir, 'tableCell')
		expect(cells.length).toBe(4)
		const texts = cells.map(collectIRText)
		expect(texts).toEqual(['hello', 'world', 'foo', 'bar'])
	})

	it('handles inline formatting in cells', async () => {
		const md = '| **bold** | `code` |\n| --- | --- |\n| *em* | normal |'
		const ir = await compileToIR(md)
		const strongs = findNodes(ir, 'strong')
		const boldInTable = strongs.find((s) => collectIRText(s) === 'bold')
		expect(boldInTable).toBeDefined()

		const codes = findNodes(ir, 'inlineCode')
		const codeInTable = codes.find((c) => c.type === 'inlineCode' && c.value === 'code')
		expect(codeInTable).toBeDefined()
	})

	it('handles empty cells', async () => {
		const md = '| A | |\n| --- | --- |\n| | B |'
		const ir = await compileToIR(md)
		const cells = findNodes(ir, 'tableCell')
		expect(cells.length).toBe(4)
	})

	it('styles header cells with headerColor and bold', async () => {
		const md = '| H |\n| --- |\n| D |'
		const ir = await compileToIR(md)
		const cells = findNodes(ir, 'tableCell')
		const headerCell = cells[0]!
		const dataCell = cells[1]!
		if (headerCell.type !== 'tableCell' || dataCell.type !== 'tableCell')
			throw new Error('expected tableCell')
		expect(headerCell.style.fg).toBe(darkTheme.table.headerColor)
		expect(headerCell.style.bold).toBe(true)
		expect(dataCell.style.fg).toBe(darkTheme.table.cellColor)
	})
})

describe('IR compiler — sanitization', () => {
	it('sanitizes text values', async () => {
		const ir = await compileToIR('hello\x1bworld')
		const text = collectIRText(ir)
		expect(text).not.toContain('\x1b')
		expect(text).toContain('helloworld')
	})

	it('strips C1 control characters from text', async () => {
		const ir = await compileToIR('safe\x9bunsafe')
		const text = collectIRText(ir)
		expect(text).not.toContain('\x9b')
		expect(text).toContain('safeunsafe')
	})
})

describe('IR compiler — URL sanitization', () => {
	it('preserves valid https link URL', async () => {
		const ir = await compileToIR('[click](https://example.com)')
		const links = findNodes(ir, 'link')
		const link = links[0]!
		if (link.type !== 'link') throw new Error('expected link')
		expect(link.url).toBe('https://example.com')
	})

	it('strips javascript: URLs from links', async () => {
		const ir = await compileToIR('[xss](javascript:alert(1))')
		const links = findNodes(ir, 'link')
		const link = links[0]!
		if (link.type !== 'link') throw new Error('expected link')
		expect(link.url).toBe('')
	})

	it('strips data: URLs from links', async () => {
		const ir = await compileToIR('[xss](data:text/html,<script>alert(1)</script>)')
		const links = findNodes(ir, 'link')
		const link = links[0]!
		if (link.type !== 'link') throw new Error('expected link')
		expect(link.url).toBe('')
	})

	it('preserves sanitized URL on image nodes', async () => {
		const ir = await compileToIR('![photo](https://example.com/img.png)')
		const images = findNodes(ir, 'image')
		const img = images[0]!
		if (img.type !== 'image') throw new Error('expected image')
		expect(img.url).toBe('https://example.com/img.png')
		expect(img.alt).toBe('photo')
	})

	it('strips javascript: URLs from images', async () => {
		const ir = await compileToIR('![xss](javascript:alert(1))')
		const images = findNodes(ir, 'image')
		const img = images[0]!
		if (img.type !== 'image') throw new Error('expected image')
		expect(img.url).toBeUndefined()
	})

	it('strips control chars from link URLs', async () => {
		const ir = await compileToIR('[evil](https://evil.com/\x07inject)')
		const links = findNodes(ir, 'link')
		const link = links[0]!
		if (link.type !== 'link') throw new Error('expected link')
		expect(link.url).not.toContain('\x07')
	})

	it('compiles image link to ImageNode with href', async () => {
		const ir = await compileToIR('[![alt text](./img.png)](https://example.com)')
		const images = findNodes(ir, 'image')
		expect(images.length).toBe(1)
		const img = images[0] as N & ImageNode
		expect(img.alt).toBe('alt text')
		expect(img.url).toBe('./img.png')
		expect(img.href).toBe('https://example.com')
	})

	it('image link is promoted out of paragraph', async () => {
		const ir = await compileToIR('[![alt](./img.png)](https://example.com)')
		if (ir.type !== 'root') throw new Error('expected root')
		const root = ir as N & RootNode
		const imgChild = root.children.find(c => c.type === 'image')
		expect(imgChild).toBeDefined()
	})

	it('mixed-content link is not image link', async () => {
		const ir = await compileToIR('[text ![img](./img.png)](https://example.com)')
		const links = findNodes(ir, 'link')
		expect(links.length).toBe(1)
		const images = findNodes(ir, 'image')
		expect(images.length).toBe(1)
		const img = images[0] as N & ImageNode
		expect(img.href).toBeUndefined()
	})
})

describe('isBlockNode helper', () => {
	it('returns true for block types', () => {
		expect(isBlockNode({ type: 'root', children: [] })).toBe(true)
		expect(isBlockNode({ type: 'heading', level: 1, style: {}, children: [] })).toBe(true)
		expect(isBlockNode({ type: 'paragraph', style: {}, children: [] })).toBe(true)
		expect(isBlockNode({ type: 'codeBlock', code: '', style: {}, children: [] })).toBe(true)
		expect(isBlockNode({ type: 'blockquote', style: {}, children: [] })).toBe(true)
		expect(isBlockNode({ type: 'list', ordered: false, children: [] })).toBe(true)
		expect(isBlockNode({ type: 'listItem', bullet: '•', style: {}, children: [] })).toBe(true)
		expect(isBlockNode({ type: 'thematicBreak', style: { color: '', char: '' } })).toBe(true)
		expect(isBlockNode({ type: 'unknown', tagName: 'div', style: {}, children: [] })).toBe(true)
	})

	it('returns false for inline types', () => {
		expect(isBlockNode({ type: 'text', value: 'hi' })).toBe(false)
		expect(isBlockNode({ type: 'strong', style: {}, children: [] })).toBe(false)
		expect(isBlockNode({ type: 'emphasis', style: {}, children: [] })).toBe(false)
		expect(isBlockNode({ type: 'inlineCode', value: 'x', style: {} })).toBe(false)
		expect(isBlockNode({ type: 'link', url: '', style: {}, children: [] })).toBe(false)
		expect(isBlockNode({ type: 'break' })).toBe(false)
		expect(isBlockNode({ type: 'checkbox', checked: false })).toBe(false)
	})
})
