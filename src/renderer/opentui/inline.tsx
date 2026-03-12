// inline IR node rendering + text wrapping for OpenTUI.
// handles grouping inline nodes and rendering semantic inline types.

import { TextAttributes } from '@opentui/core'
import { Fragment, type ReactNode } from 'react'

import type { ImageNode, InlineStyle, IRNode, LinkNode } from '../../ir/types.ts'
import { isCoreNode, isCustomNode } from '../../ir/types.ts'
import { renderMathInline } from './math.tsx'
import { renderSearchText } from './search-highlight-context.tsx'

function renderLink(node: LinkNode, key: string): ReactNode {
	const children = renderInlineChildren(node.children, key)
	if (node.url.length === 0 || node.url.startsWith('#')) {
		// empty or fragment-only URLs: render as styled underlined text.
		// fragment URLs (#heading) can't be navigated via OSC 8 — use TOC (t) instead.
		const props: Record<string, unknown> = {}
		if (node.style.fg != null) props['fg'] = node.style.fg
		return (
			<span key={key} {...props} attributes={TextAttributes.UNDERLINE}>
				{children}
			</span>
		)
	}
	const linkProps: Record<string, unknown> = {}
	if (node.style.fg != null) linkProps['fg'] = node.style.fg
	return (
		<a key={key} href={node.url} {...linkProps}>
			{children}
		</a>
	)
}

function renderImage(node: ImageNode, key: string): ReactNode {
	const props: Record<string, unknown> = {}
	if (node.style.fg != null) props['fg'] = node.style.fg
	return (
		<span key={key} {...props}>
			{`[image: ${node.alt}]`}
		</span>
	)
}

function renderInlineCode(style: InlineStyle, value: string, key: string): ReactNode {
	const props: Record<string, unknown> = {}
	if (style.bg != null) props['bg'] = style.bg
	if (style.fg != null) props['fg'] = style.fg
	return (
		<span key={key} {...props}>
			{renderSearchText(value, undefined, key)}
		</span>
	)
}

// renders a single inline IR node to OpenTUI JSX
export function renderInlineNode(node: IRNode, key: string): ReactNode {
	// custom nodes first — mathInline is the only inline custom node
	if (isCustomNode(node, 'mathInline')) return renderMathInline(node, key)
	if (!isCoreNode(node)) return null

	switch (node.type) {
		case 'text':
			return renderSearchText(node.value, node.style?.fg, key)

		case 'strong':
			return <strong key={key}>{renderInlineChildren(node.children, key)}</strong>

		case 'emphasis':
			return <em key={key}>{renderInlineChildren(node.children, key)}</em>

		case 'strikethrough':
			return (
				<span key={key} attributes={TextAttributes.STRIKETHROUGH}>
					{renderInlineChildren(node.children, key)}
				</span>
			)

		case 'inlineCode':
			return renderInlineCode(node.style, node.value, key)

		case 'link':
			return renderLink(node, key)

		case 'image':
			return renderImage(node, key)

		case 'break':
			return '\n'

		case 'checkbox':
			return <span key={key}>{node.checked ? '[x] ' : '[ ] '}</span>

		case 'root':
			return <Fragment key={key}>{renderInlineChildren(node.children, key)}</Fragment>

		default:
			return null
	}
}

// renders an array of IR nodes as inline content (for use inside <text> wrappers)
export function renderInlineChildren(children: IRNode[], parentKey: string): ReactNode[] {
	const results: ReactNode[] = []
	for (let i = 0; i < children.length; i++) {
		const result = renderInlineNode(children[i]!, `${parentKey}-${String(i)}`)
		if (result != null) results.push(result)
	}
	return results
}
