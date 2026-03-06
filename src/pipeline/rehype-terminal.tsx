// rehype-terminal: custom unified compiler that converts hast to React component tree.
// modeled after hast-util-to-jsx-runtime / rehype-react.

import type { Element, ElementContent, Root, Text } from 'hast'
import type { Plugin } from 'unified'
import type { VFile } from 'vfile'

import { TextAttributes } from '@opentui/core'
import { createElement, type ReactNode } from 'react'

import type { ThemeTokens } from '../theme/types.ts'
import type { ComponentType } from '../types/components.ts'

import { getListItemBullet } from '../components/block/List.tsx'
import { sanitizeForTerminal } from './sanitize.ts'

declare module 'unified' {
	interface CompileResultMap {
		ReactNode: ReactNode
	}
}

export interface RehypeTerminalOptions {
	components: Record<string, ComponentType>
	fallback: ComponentType
	theme: ThemeTokens
}

interface CompilerState {
	ancestors: Element[]
	components: Record<string, ComponentType>
	fallback: ComponentType
	file: VFile
	theme: ThemeTokens
}

// hast block elements — their rendered output will be <box> containers
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

// components that render children inside <box> (not <text>) need inline wrapping
// components that render children inside <box> (not <text>) need inline wrapping
const COMPONENTS_WITH_BOX_CHILDREN = new Set(['li', 'blockquote', 'td', 'th'])

// block containers where whitespace-only text nodes should be stripped
const STRIP_WHITESPACE_CONTAINERS = new Set(['ul', 'ol', 'table', 'thead', 'tbody', 'tfoot', 'tr'])

function isHastBlockNode(node: ElementContent): boolean {
	return node.type === 'element' && HAST_BLOCK_TAGS.has(node.tagName)
}

// renders children without block-context wrapping — just maps each child through one()
function createChildrenFlat(
	state: CompilerState,
	node: { children: ElementContent[] },
	parentKey: string,
	stripWhitespace: boolean,
): ReactNode[] {
	const results: ReactNode[] = []
	for (let i = 0; i < node.children.length; i++) {
		const child = node.children[i]!
		if (stripWhitespace && child.type === 'text' && child.value.trim().length === 0) continue
		const result = one(state, child, `${parentKey}-${String(i)}`)
		if (result != null) results.push(result)
	}
	return results
}

// block-context mode: groups consecutive inline hast nodes into <text> wrappers
function createChildrenWrapped(
	state: CompilerState,
	node: { children: ElementContent[] },
	parentKey: string,
): ReactNode[] {
	const results: ReactNode[] = []
	let inlineGroup: { node: ElementContent; index: number }[] = []
	let wrapCount = 0

	const flushInline = () => {
		if (inlineGroup.length === 0) return
		const inlineResults: ReactNode[] = []
		for (const item of inlineGroup) {
			const result = one(state, item.node, `${parentKey}-${String(item.index)}`)
			if (result != null) inlineResults.push(result)
		}
		// skip <text> wrappers that would only contain whitespace
		const hasContent = inlineResults.some((r) => typeof r !== 'string' || r.trim().length > 0)
		if (inlineResults.length > 0 && hasContent) {
			results.push(<text key={`${parentKey}-tw-${String(wrapCount++)}`}>{inlineResults}</text>)
		}
		inlineGroup = []
	}

	for (let i = 0; i < node.children.length; i++) {
		const child = node.children[i]!
		if (isHastBlockNode(child)) {
			flushInline()
			const result = one(state, child, `${parentKey}-${String(i)}`)
			if (result != null) results.push(result)
		} else {
			inlineGroup.push({ node: child, index: i })
		}
	}
	flushInline()

	return results
}

// creates children with optional block-context wrapping
function createChildren(
	state: CompilerState,
	node: { children: ElementContent[] },
	parentKey: string,
	wrapInlines: boolean,
	stripWhitespace = false,
): ReactNode[] {
	if (wrapInlines) return createChildrenWrapped(state, node, parentKey)
	return createChildrenFlat(state, node, parentKey, stripWhitespace)
}

function one(state: CompilerState, node: ElementContent | Root, key: string): ReactNode {
	if (node.type === 'root') {
		return root(state, node, key)
	}
	if (node.type === 'element') {
		return element(state, node, key)
	}
	if (node.type === 'text') {
		return text(node)
	}
	// comment nodes and unknown types
	return null
}

function root(state: CompilerState, node: Root, key: string): ReactNode {
	const children = createChildren(
		state,
		node as unknown as { children: ElementContent[] },
		key,
		true, // root is a block context — wrap inline nodes
	)
	return (
		<box key={key} style={{ flexDirection: 'column', width: '100%' }}>
			{children}
		</box>
	)
}

function element(state: CompilerState, node: Element, key: string): ReactNode {
	const { tagName } = node
	const Component = state.components[tagName]
	const isInline = KNOWN_INLINE_TAGS.has(tagName)

	// inject bullet marker for list items so the ListItem component can render it
	if (tagName === 'li') {
		node.properties = node.properties ?? {}
		node.properties['data-bullet'] = getListItemBullet(node, state.ancestors)
	}

	// block elements that render children inside <box> need inline wrapping.
	// components like Heading/Paragraph wrap children in <text> themselves,
	// but ListItem/Fallback use <box> — their children need <text> wrappers.
	const componentUsesBox = COMPONENTS_WITH_BOX_CHILDREN.has(tagName)
	const needsInlineWrapping = (Component == null && !isInline) || componentUsesBox

	const stripWhitespace = STRIP_WHITESPACE_CONTAINERS.has(tagName)

	state.ancestors.push(node)
	const children = createChildren(state, node, key, needsInlineWrapping, stripWhitespace)
	state.ancestors.pop()

	if (Component != null) {
		return createElement(
			Component,
			{ key, node, theme: state.theme },
			...(children.length > 0 ? children : []),
		)
	}

	if (!isInline) {
		state.file.message(`unknown element: <${tagName}>`, {
			place: node.position,
		})
	}

	// handle inline elements using OpenTUI intrinsics where possible
	const rendered = renderInlineElement(state, node, children, key)
	if (rendered != null) return rendered

	// unknown inline elements should render as <span>, not <box> (Fallback),
	// because they may appear inside <text> where <box> is invalid
	if (isInline) {
		return <span key={key}>{children}</span>
	}

	// unknown block element — children already wrapped by createChildren
	return createElement(
		state.fallback,
		{ key, node, theme: state.theme },
		...(children.length > 0 ? children : []),
	)
}

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

type InlineHandler = (
	state: CompilerState,
	node: Element,
	children: ReactNode[],
	key: string,
) => ReactNode | undefined

function renderCode(
	state: CompilerState,
	_node: Element,
	children: ReactNode[],
	key: string,
): ReactNode {
	const isInsidePre = state.ancestors.some((a) => a.tagName === 'pre')
	if (!isInsidePre) {
		return (
			<span
				key={key}
				bg={state.theme.inlineCode.backgroundColor}
				fg={state.theme.inlineCode.textColor}
			>
				{children}
			</span>
		)
	}
	return <>{children}</>
}

function renderBold(
	_state: CompilerState,
	_node: Element,
	children: ReactNode[],
	key: string,
): ReactNode {
	return <strong key={key}>{children}</strong>
}

function renderItalic(
	_state: CompilerState,
	_node: Element,
	children: ReactNode[],
	key: string,
): ReactNode {
	return <em key={key}>{children}</em>
}

function renderStrikethrough(
	_state: CompilerState,
	_node: Element,
	children: ReactNode[],
	key: string,
): ReactNode {
	return (
		<span key={key} attributes={TextAttributes.STRIKETHROUGH}>
			{children}
		</span>
	)
}

function renderUnderline(
	_state: CompilerState,
	_node: Element,
	children: ReactNode[],
	key: string,
): ReactNode {
	return <u key={key}>{children}</u>
}

function renderAnchor(
	_state: CompilerState,
	node: Element,
	children: ReactNode[],
	key: string,
): ReactNode {
	const href = typeof node.properties?.['href'] === 'string' ? node.properties['href'] : ''
	return (
		<a key={key} href={href}>
			{children}
		</a>
	)
}

function renderImage(
	state: CompilerState,
	node: Element,
	_children: ReactNode[],
	key: string,
): ReactNode {
	const alt = typeof node.properties?.['alt'] === 'string' ? node.properties['alt'] : 'image'
	return (
		<span
			key={key}
			fg={state.theme.image.fallbackColor}
		>{`[image: ${sanitizeForTerminal(alt)}]`}</span>
	)
}

function renderBreak(): ReactNode {
	return '\n'
}

function renderInput(
	_state: CompilerState,
	node: Element,
	_children: ReactNode[],
	key: string,
): ReactNode {
	const checked = node.properties?.['checked'] === true
	return <span key={key}>{checked ? '[x] ' : '[ ] '}</span>
}

function renderSpan(
	_state: CompilerState,
	node: Element,
	children: ReactNode[],
	key: string,
): ReactNode {
	const fg = getHighlightColor(node)
	if (fg != null) {
		return (
			<span key={key} fg={fg}>
				{children}
			</span>
		)
	}
	return <>{children}</>
}

const INLINE_HANDLERS: Record<string, InlineHandler> = {
	a: renderAnchor,
	b: renderBold,
	br: renderBreak,
	code: renderCode,
	del: renderStrikethrough,
	em: renderItalic,
	i: renderItalic,
	img: renderImage,
	input: renderInput,
	s: renderStrikethrough,
	span: renderSpan,
	strong: renderBold,
	u: renderUnderline,
}

// handles inline hast elements by mapping to OpenTUI intrinsic elements
function renderInlineElement(
	state: CompilerState,
	node: Element,
	children: ReactNode[],
	key: string,
): ReactNode | undefined {
	const handler = INLINE_HANDLERS[node.tagName]
	if (handler != null) return handler(state, node, children, key)
	return undefined
}

// maps hljs class names to colors for syntax highlighting
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

function text(node: Text): ReactNode {
	const sanitized = sanitizeForTerminal(node.value)
	if (sanitized.length === 0) return null
	return sanitized
}

const rehypeTerminal: Plugin<[RehypeTerminalOptions], Root, ReactNode> = function (
	this: { compiler: unknown },
	options: RehypeTerminalOptions,
) {
	const { components, fallback, theme } = options

	this.compiler = (tree: Root, file: VFile): ReactNode => {
		const state: CompilerState = {
			ancestors: [],
			components,
			fallback,
			file,
			theme,
		}

		return one(state, tree, 'root')
	}
}

export default rehypeTerminal
