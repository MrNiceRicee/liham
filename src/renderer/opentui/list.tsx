import type { ListItemNode, ListNode } from '../../ir/types.ts'

import { renderChildren } from './index.tsx'

export function renderList(node: ListNode, key: string) {
	return (
		<box key={key} style={{ flexDirection: 'column', marginBottom: 1 }}>
			{renderChildren(node.children, key)}
		</box>
	)
}

export function renderListItem(node: ListItemNode, key: string) {
	const textStyle: Record<string, unknown> = {}
	if (node.style.fg != null) textStyle['fg'] = node.style.fg

	return (
		<box key={key} style={{ flexDirection: 'row' }}>
			<text style={textStyle}>
				<span>{node.bullet}</span>
			</text>
			<box style={{ flexDirection: 'column', flexShrink: 1 }}>
				{renderChildren(node.children, key)}
			</box>
		</box>
	)
}
