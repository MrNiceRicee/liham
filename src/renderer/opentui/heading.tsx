import { TextAttributes } from '@opentui/core'

import type { HeadingNode } from '../../ir/types.ts'

import { renderInlineChildren } from './inline.tsx'

export function renderHeading(node: HeadingNode, key: string) {
	let attrs = TextAttributes.NONE
	if (node.style.bold) attrs |= TextAttributes.BOLD
	if (node.style.dim) attrs |= TextAttributes.DIM

	const style: Record<string, unknown> = { attributes: attrs }
	if (node.style.fg != null) style['fg'] = node.style.fg

	return (
		<box key={key} style={{ marginBottom: 1 }}>
			<text style={style}>{renderInlineChildren(node.children, key)}</text>
		</box>
	)
}
