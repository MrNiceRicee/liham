// inline IR node rendering + text wrapping for OpenTUI.
// handles grouping inline nodes and rendering semantic inline types.

import type { ReactNode } from 'react'

import { TextAttributes } from '@opentui/core'

import type { CoreIRNode, IRNode } from '../../ir/types.ts'

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

		case 'inlineCode': {
			const props: Record<string, unknown> = {}
			if (core.style.bg != null) props['bg'] = core.style.bg
			if (core.style.fg != null) props['fg'] = core.style.fg
			return (
				<span key={key} {...props}>
					{core.value}
				</span>
			)
		}

		case 'link':
			return (
				<a key={key} href={core.url}>
					{renderInlineChildren(core.children, key)}
				</a>
			)

		case 'image': {
			const imgProps: Record<string, unknown> = {}
			if (core.style.fg != null) imgProps['fg'] = core.style.fg
			return (
				<span key={key} {...imgProps}>
					{`[image: ${core.alt}]`}
				</span>
			)
		}

		case 'break':
			return '\n'

		case 'checkbox':
			return <span key={key}>{core.checked ? '[x] ' : '[ ] '}</span>

		// root nodes from code > children flattening
		case 'root':
			return <>{renderInlineChildren(core.children, key)}</>

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
