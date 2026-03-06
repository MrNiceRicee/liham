import type { BlockquoteNode } from '../../ir/types.ts'

import { renderChildren } from './index.tsx'

export function renderBlockquote(node: BlockquoteNode, key: string) {
	const style: Record<string, unknown> = {
		border: ['left'],
		borderStyle: 'heavy',
		marginBottom: 1,
		paddingLeft: 1,
		flexDirection: 'column',
	}
	if (node.style.borderColor != null) style['borderColor'] = node.style.borderColor
	if (node.style.bg != null) style['backgroundColor'] = node.style.bg

	return (
		<box key={key} style={style}>
			{renderChildren(node.children, key)}
		</box>
	)
}
