// inline IR node rendering + text wrapping for OpenTUI.
// handles grouping inline nodes and rendering semantic inline types.

import { TextAttributes } from '@opentui/core'
import { Fragment, type ReactNode } from 'react'

import type { CoreIRNode, ImageNode, InlineStyle, IRNode, LinkNode } from '../../ir/types.ts'

function renderLink(node: LinkNode, key: string): ReactNode {
	const children = renderInlineChildren(node.children, key)
	if (node.url.length === 0) {
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
			{value}
		</span>
	)
}

// renders a single inline IR node to OpenTUI JSX
export function renderInlineNode(node: IRNode, key: string): ReactNode {
	const core = node as CoreIRNode

	switch (core.type) {
		case 'text':
			if (core.style?.fg != null) {
				return (
					<span key={key} fg={core.style.fg}>
						{core.value}
					</span>
				)
			}
			return core.value

		case 'strong':
			return <strong key={key}>{renderInlineChildren(core.children, key)}</strong>

		case 'emphasis':
			return <em key={key}>{renderInlineChildren(core.children, key)}</em>

		case 'strikethrough':
			return (
				<span key={key} attributes={TextAttributes.STRIKETHROUGH}>
					{renderInlineChildren(core.children, key)}
				</span>
			)

		case 'inlineCode':
			return renderInlineCode(core.style, core.value, key)

		case 'link':
			return renderLink(core, key)

		case 'image':
			return renderImage(core, key)

		case 'break':
			return '\n'

		case 'checkbox':
			return <span key={key}>{core.checked ? '[x] ' : '[ ] '}</span>

		case 'root':
			return <Fragment key={key}>{renderInlineChildren(core.children, key)}</Fragment>

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
