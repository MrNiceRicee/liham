import { TextAttributes } from '@opentui/core'

import type { HeadingNode } from '../../ir/types.ts'

import { renderInlineChildren } from './inline.tsx'

export function renderHeading(node: HeadingNode, key: string, tocIndex?: number) {
	let attrs = TextAttributes.NONE
	if (node.style.bold) attrs |= TextAttributes.BOLD
	if (node.style.dim) attrs |= TextAttributes.DIM

	const spanProps: Record<string, unknown> = {}
	if (attrs !== TextAttributes.NONE) spanProps['attributes'] = attrs
	if (node.style.fg != null) spanProps['fg'] = node.style.fg

	const idProps: Record<string, unknown> = {}
	if (tocIndex != null) idProps['id'] = `toc-h-${String(tocIndex)}`

	return (
		<box key={key} {...idProps} style={{ marginBottom: 1 }}>
			<text>
				<span {...spanProps}>{renderInlineChildren(node.children, key)}</span>
			</text>
		</box>
	)
}
