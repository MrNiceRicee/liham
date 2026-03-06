// rehype-ir: unified compiler that converts hast to renderer-agnostic IR nodes.
// replaces rehype-terminal.tsx — produces IR instead of React JSX.

import type { Element, ElementContent, Root, Text } from 'hast'
import type { Plugin } from 'unified'
import type { VFile } from 'vfile'

import type { IRNode } from '../ir/types.ts'
import type { ThemeTokens } from '../theme/types.ts'

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

// -- hljs color map --

const HLJS_COLORS: Record<string, string> = {
	'hljs-addition': '#9ece6a',
	'hljs-attr': '#7aa2f7',
	'hljs-attribute': '#bb9af7',
	'hljs-built_in': '#e0af68',
	'hljs-bullet': '#89ddff',
	'hljs-class': '#e0af68',
	'hljs-code': '#9ece6a',
	'hljs-comment': '#565f89',
	'hljs-deletion': '#f7768e',
	'hljs-doctag': '#7aa2f7',
	'hljs-emphasis': '#c0caf5',
	'hljs-formula': '#bb9af7',
	'hljs-function': '#7aa2f7',
	'hljs-keyword': '#bb9af7',
	'hljs-link': '#2ac3de',
	'hljs-literal': '#ff9e64',
	'hljs-meta': '#e0af68',
	'hljs-name': '#f7768e',
	'hljs-number': '#ff9e64',
	'hljs-operator': '#89ddff',
	'hljs-params': '#c0caf5',
	'hljs-property': '#7aa2f7',
	'hljs-punctuation': '#89ddff',
	'hljs-quote': '#565f89',
	'hljs-regexp': '#2ac3de',
	'hljs-section': '#7aa2f7',
	'hljs-selector-attr': '#bb9af7',
	'hljs-selector-class': '#9ece6a',
	'hljs-selector-id': '#7aa2f7',
	'hljs-selector-pseudo': '#9ece6a',
	'hljs-selector-tag': '#f7768e',
	'hljs-string': '#9ece6a',
	'hljs-strong': '#c0caf5',
	'hljs-subst': '#c0caf5',
	'hljs-symbol': '#ff9e64',
	'hljs-tag': '#f7768e',
	'hljs-template-tag': '#bb9af7',
	'hljs-template-variable': '#2ac3de',
	'hljs-title': '#7aa2f7',
	'hljs-type': '#2ac3de',
	'hljs-variable': '#c0caf5',
}

function getHighlightColor(node: Element): string | undefined {
	const className = node.properties?.['className']
	if (!Array.isArray(className)) return undefined

	for (const cls of className) {
		if (typeof cls === 'string') {
			const color = HLJS_COLORS[cls]
			if (color != null) return color
		}
	}
	return undefined
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
	return {
		type: 'paragraph',
		style: { fg: state.theme.paragraph.textColor },
		children: withAncestors(state, node),
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
		url: href,
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
		return {
			type: 'image',
			alt: sanitizeForTerminal(alt),
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
