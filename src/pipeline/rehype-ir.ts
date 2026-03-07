// rehype-ir: unified compiler that converts hast to renderer-agnostic IR nodes.
// replaces rehype-terminal.tsx — produces IR instead of React JSX.

import type { Element, ElementContent, Root, Text } from 'hast'
import type { Plugin } from 'unified'
import type { VFile } from 'vfile'

import type { IRNode, TableCellNode, TableRowNode } from '../ir/types.ts'
import type { ThemeTokens } from '../theme/types.ts'

import { getHighlightColor } from './hljs-colors.ts'
import { sanitizeImageSrc } from './sanitize-image-src.ts'
import { sanitizeUrl } from './sanitize-url.ts'
import { sanitizeForTerminal } from './sanitize.ts'

declare module 'unified' {
	interface CompileResultMap {
		IRNode: IRNode
	}
}

export type CustomHandler = (
	node: Element,
	theme: ThemeTokens,
	compileChildren: (node: Element) => IRNode[],
) => IRNode | undefined

export interface RehypeIROptions {
	customHandlers?: Record<string, CustomHandler>
	theme: ThemeTokens
}

interface CompilerState {
	ancestors: Element[]
	customHandlers: Record<string, CustomHandler>
	file: VFile
	theme: ThemeTokens
}

// hast block elements
const HAST_BLOCK_TAGS = new Set([
	'address',
	'article',
	'aside',
	'blockquote',
	'details',
	'dialog',
	'dd',
	'div',
	'dl',
	'dt',
	'fieldset',
	'figcaption',
	'figure',
	'footer',
	'form',
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'header',
	'hgroup',
	'hr',
	'li',
	'main',
	'nav',
	'ol',
	'p',
	'pre',
	'section',
	'summary',
	'table',
	'tbody',
	'td',
	'tfoot',
	'th',
	'thead',
	'tr',
	'ul',
])

const KNOWN_INLINE_TAGS = new Set([
	'a',
	'abbr',
	'b',
	'br',
	'code',
	'del',
	'em',
	'i',
	'img',
	'input',
	'kbd',
	'mark',
	's',
	'small',
	'span',
	'strong',
	'sub',
	'sup',
	'u',
])

// block containers where whitespace-only text nodes should be stripped
const STRIP_WHITESPACE_CONTAINERS = new Set(['ul', 'ol', 'table', 'thead', 'tbody', 'tfoot', 'tr'])

// -- hast text extraction helpers (ported from CodeBlock.tsx) --

function extractText(node: Element): string {
	let result = ''
	for (const child of node.children) {
		if (child.type === 'text') {
			result += child.value
		} else if (child.type === 'element') {
			result += extractText(child)
		}
	}
	return result
}

function extractCode(node: Element): string {
	const codeEl = node.children.find(
		(child): child is Element => child.type === 'element' && child.tagName === 'code',
	)
	if (!codeEl) return ''
	return extractText(codeEl)
}

function extractLanguage(node: Element): string | undefined {
	const codeEl = node.children.find(
		(child): child is Element => child.type === 'element' && child.tagName === 'code',
	)
	if (!codeEl) return undefined

	const className = codeEl.properties?.['className']
	if (!Array.isArray(className)) return undefined

	for (const cls of className) {
		if (typeof cls === 'string' && cls.startsWith('language-')) {
			return cls.slice(9)
		}
	}
	return undefined
}

// -- list bullet computation (ported from List.tsx) --

function getListItemBullet(node: Element, ancestors: Element[]): string {
	const parentList = ancestors.findLast((a) => a.tagName === 'ul' || a.tagName === 'ol')
	if (parentList == null) return '• '

	if (parentList.tagName === 'ol') {
		const start =
			typeof parentList.properties?.['start'] === 'number' ? parentList.properties['start'] : 1
		const index = parentList.children
			.filter((c) => c.type === 'element' && c.tagName === 'li')
			.indexOf(node)
		return `${String(start + Math.max(0, index))}. `
	}

	const depth = ancestors.filter((a) => a.tagName === 'ul').length
	const bullets = ['•', '◦', '▪']
	return `${bullets[(depth - 1) % bullets.length]} `
}

// -- heading level extraction --

function getHeadingLevel(tagName: string): 1 | 2 | 3 | 4 | 5 | 6 {
	const n = Number(tagName.charAt(1))
	if (n >= 1 && n <= 6) return n as 1 | 2 | 3 | 4 | 5 | 6
	return 1
}

// -- compiler core --

function compileChildren(state: CompilerState, node: { children: ElementContent[] }): IRNode[] {
	const results: IRNode[] = []
	const stripWhitespace =
		'tagName' in node && STRIP_WHITESPACE_CONTAINERS.has((node as Element).tagName)

	for (const child of node.children) {
		if (stripWhitespace && child.type === 'text' && child.value.trim().length === 0) continue
		const result = one(state, child)
		if (result != null) results.push(result)
	}
	return results
}

function one(state: CompilerState, node: ElementContent | Root): IRNode | undefined {
	if (node.type === 'root') return compileRoot(state, node)
	if (node.type === 'element') return compileElement(state, node)
	if (node.type === 'text') return compileText(node)
	return undefined
}

function compileRoot(state: CompilerState, node: Root): IRNode {
	return {
		type: 'root',
		children: compileChildren(state, node as unknown as { children: ElementContent[] }),
	}
}

function compileText(node: Text): IRNode | undefined {
	const sanitized = sanitizeForTerminal(node.value)
	if (sanitized.length === 0) return undefined
	return { type: 'text', value: sanitized }
}

// helper: compile children with ancestor tracking
function withAncestors(state: CompilerState, node: Element): IRNode[] {
	state.ancestors.push(node)
	const children = compileChildren(state, node)
	state.ancestors.pop()
	return children
}

function compileHeading(state: CompilerState, node: Element): IRNode {
	const level = getHeadingLevel(node.tagName)
	const tokens = state.theme.heading.levels[level]
	return {
		type: 'heading',
		level,
		style: { fg: tokens.color, bold: tokens.bold, dim: tokens.dim },
		children: withAncestors(state, node),
	}
}

function compileParagraph(state: CompilerState, node: Element): IRNode {
	const children = withAncestors(state, node)
	// standalone image: <p><img></p> → promote to block so ImageBlock component renders
	if (children.length === 1 && children[0]?.type === 'image') {
		return children[0]
	}
	return {
		type: 'paragraph',
		style: { fg: state.theme.paragraph.textColor },
		children,
	}
}

function compilePre(state: CompilerState, node: Element): IRNode {
	const { theme } = state
	return {
		type: 'codeBlock',
		code: sanitizeForTerminal(extractCode(node)),
		language: extractLanguage(node),
		style: {
			fg: theme.codeBlock.textColor,
			bg: theme.codeBlock.backgroundColor,
			borderColor: theme.codeBlock.borderColor,
			gutterColor: theme.codeBlock.gutterColor,
			labelColor: theme.codeBlock.languageColor,
		},
		children: withAncestors(state, node),
	}
}

function compileBlockquote(state: CompilerState, node: Element): IRNode {
	const { theme } = state
	return {
		type: 'blockquote',
		style: {
			fg: theme.blockquote.textColor,
			borderColor: theme.blockquote.borderColor,
			bg: theme.blockquote.backgroundColor,
		},
		children: withAncestors(state, node),
	}
}

function compileList(state: CompilerState, node: Element): IRNode {
	const ordered = node.tagName === 'ol'
	const start =
		ordered && typeof node.properties?.['start'] === 'number' ? node.properties['start'] : undefined
	return { type: 'list', ordered, start, children: withAncestors(state, node) }
}

function compileListItem(state: CompilerState, node: Element): IRNode {
	return {
		type: 'listItem',
		bullet: getListItemBullet(node, state.ancestors),
		style: { fg: state.theme.list.textColor },
		children: withAncestors(state, node),
	}
}

// -- table compilation --

// extract alignments from the first row's th/td cells (hast stores align per-cell)
function extractAlignments(node: Element): ('left' | 'center' | 'right' | null)[] {
	for (const child of node.children) {
		if (child.type !== 'element') continue
		// find first tr (may be inside thead)
		const section =
			child.tagName === 'thead' || child.tagName === 'tbody' ? child : null
		const container = section ?? node
		for (const row of container.children) {
			if (row.type !== 'element' || row.tagName !== 'tr') continue
			return row.children
				.filter((c): c is Element => c.type === 'element' && (c.tagName === 'th' || c.tagName === 'td'))
				.map((cell) => {
					const align = cell.properties?.['align']
					if (align === 'left' || align === 'center' || align === 'right') return align
					return null
				})
		}
	}
	return []
}

const TABLE_SECTIONS = new Set(['thead', 'tbody', 'tfoot'])

function collectTableRows(state: CompilerState, section: Element, isHeader: boolean): TableRowNode[] {
	const rows: TableRowNode[] = []
	state.ancestors.push(section)
	for (const child of section.children) {
		if (child.type === 'text' && child.value.trim().length === 0) continue
		if (child.type === 'element' && child.tagName === 'tr') {
			rows.push(compileTableRow(state, child, isHeader))
		}
	}
	state.ancestors.pop()
	return rows
}

function compileTable(state: CompilerState, node: Element): IRNode {
	const alignments = extractAlignments(node)
	const rows: TableRowNode[] = []

	state.ancestors.push(node)
	for (const child of node.children) {
		if (child.type === 'text' && child.value.trim().length === 0) continue
		if (child.type !== 'element') continue
		if (TABLE_SECTIONS.has(child.tagName)) {
			rows.push(...collectTableRows(state, child, child.tagName === 'thead'))
		} else if (child.tagName === 'tr') {
			rows.push(compileTableRow(state, child, false))
		}
	}
	state.ancestors.pop()

	return {
		type: 'table',
		alignments,
		style: { borderColor: state.theme.table.borderColor },
		children: rows,
	}
}

function compileTableRow(state: CompilerState, node: Element, isHeader: boolean): TableRowNode {
	const { theme } = state
	const fg = isHeader ? theme.table.headerColor : theme.table.cellColor
	const cells = withAncestors(state, node).filter((child): child is TableCellNode => child.type === 'tableCell')
	return {
		type: 'tableRow',
		isHeader,
		style: { fg },
		children: cells,
	}
}

function compileTableCell(state: CompilerState, node: Element): IRNode {
	const { theme } = state
	const isHeader = node.tagName === 'th'
	return {
		type: 'tableCell',
		style: {
			fg: isHeader ? theme.table.headerColor : theme.table.cellColor,
			bold: isHeader ? true : undefined,
		},
		children: withAncestors(state, node),
	}
}

type BlockCompiler = (state: CompilerState, node: Element) => IRNode

const BLOCK_COMPILERS: Record<string, BlockCompiler> = {
	blockquote: compileBlockquote,
	h1: compileHeading,
	h2: compileHeading,
	h3: compileHeading,
	h4: compileHeading,
	h5: compileHeading,
	h6: compileHeading,
	li: compileListItem,
	ol: compileList,
	p: compileParagraph,
	pre: compilePre,
	table: compileTable,
	td: compileTableCell,
	th: compileTableCell,
	tr: (state, node) => compileTableRow(state, node, false),
	ul: compileList,
}

function compileElement(state: CompilerState, node: Element): IRNode | undefined {
	const { tagName } = node
	const { theme } = state

	// check custom handlers first
	if (state.customHandlers[tagName] != null) {
		const result = state.customHandlers[tagName](node, theme, (n: Element) =>
			withAncestors(state, n),
		)
		if (result != null) return result
	}

	// known block elements
	const blockCompiler = BLOCK_COMPILERS[tagName]
	if (blockCompiler != null) return blockCompiler(state, node)

	if (tagName === 'hr') {
		return {
			type: 'thematicBreak',
			style: { color: theme.horizontalRule.color, char: theme.horizontalRule.char },
		}
	}

	// inline elements
	if (KNOWN_INLINE_TAGS.has(tagName)) return compileInline(state, node)

	// unknown block element
	if (HAST_BLOCK_TAGS.has(tagName)) {
		state.file.message(`unknown element: <${tagName}>`, { place: node.position })
		return {
			type: 'unknown',
			tagName,
			style: { fg: theme.fallback.textColor },
			children: withAncestors(state, node),
		}
	}

	// unknown non-block element — flatten children
	return flattenChildren(state, node)
}

// helper: flatten children of a wrapper element (for transparent pass-through)
function flattenChildren(state: CompilerState, node: Element): IRNode | undefined {
	const children = withAncestors(state, node)
	if (children.length === 1) return children[0]
	if (children.length === 0) return undefined
	return { type: 'strong', style: {}, children }
}

function compileCode(state: CompilerState, node: Element): IRNode | undefined {
	const isInsidePre = state.ancestors.some((a) => a.tagName === 'pre')
	if (isInsidePre) {
		const children = withAncestors(state, node)
		if (children.length === 1) return children[0]
		return { type: 'root', children }
	}
	return {
		type: 'inlineCode',
		value: sanitizeForTerminal(extractText(node)),
		style: { fg: state.theme.inlineCode.textColor, bg: state.theme.inlineCode.backgroundColor },
	}
}

function compileAnchor(state: CompilerState, node: Element): IRNode {
	const href = typeof node.properties?.['href'] === 'string' ? node.properties['href'] : ''
	return {
		type: 'link',
		url: sanitizeUrl(href),
		style: { fg: state.theme.link.color, underline: state.theme.link.underline },
		children: withAncestors(state, node),
	}
}

function compileSpan(state: CompilerState, node: Element): IRNode | undefined {
	const fg = getHighlightColor(node)
	if (fg != null) {
		const children = withAncestors(state, node)
		const first = children[0]
		if (children.length === 1 && first?.type === 'text' && 'value' in first) {
			return { type: 'text', value: (first as { value: string }).value, style: { fg } }
		}
		return { type: 'strong', style: { fg }, children }
	}
	return flattenChildren(state, node)
}

type InlineCompiler = (state: CompilerState, node: Element) => IRNode | undefined

const INLINE_COMPILERS: Record<string, InlineCompiler> = {
	a: compileAnchor,
	b: (state, node) => ({
		type: 'strong',
		style: { bold: true },
		children: withAncestors(state, node),
	}),
	br: () => ({ type: 'break' }),
	code: compileCode,
	del: (state, node) => ({
		type: 'strikethrough',
		style: { strikethrough: true },
		children: withAncestors(state, node),
	}),
	em: (state, node) => ({
		type: 'emphasis',
		style: { italic: true },
		children: withAncestors(state, node),
	}),
	i: (state, node) => ({
		type: 'emphasis',
		style: { italic: true },
		children: withAncestors(state, node),
	}),
	img: (state, node) => {
		const alt = typeof node.properties?.['alt'] === 'string' ? node.properties['alt'] : 'image'
		const src = typeof node.properties?.['src'] === 'string' ? node.properties['src'] : ''
		const url = sanitizeImageSrc(src)
		return {
			type: 'image',
			alt: sanitizeForTerminal(alt),
			...(url.length > 0 ? { url } : {}),
			style: { fg: state.theme.image.fallbackColor },
		}
	},
	input: (_state, node) => ({ type: 'checkbox', checked: node.properties?.['checked'] === true }),
	s: (state, node) => ({
		type: 'strikethrough',
		style: { strikethrough: true },
		children: withAncestors(state, node),
	}),
	span: compileSpan,
	strong: (state, node) => ({
		type: 'strong',
		style: { bold: true },
		children: withAncestors(state, node),
	}),
	u: (state, node) => ({
		type: 'strong',
		style: { underline: true },
		children: withAncestors(state, node),
	}),
}

function compileInline(state: CompilerState, node: Element): IRNode | undefined {
	const compiler = INLINE_COMPILERS[node.tagName]
	if (compiler != null) return compiler(state, node)
	return flattenChildren(state, node)
}

// -- plugin export --

const rehypeIR: Plugin<[RehypeIROptions], Root, IRNode> = function (
	this: { compiler: unknown },
	options: RehypeIROptions,
) {
	const { theme, customHandlers = {} } = options

	this.compiler = (tree: Root, file: VFile): IRNode => {
		const state: CompilerState = {
			ancestors: [],
			customHandlers,
			file,
			theme,
		}
		return one(state, tree) ?? { type: 'root', children: [] }
	}
}

export default rehypeIR
