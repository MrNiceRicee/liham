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
	return (
		<box key={key} style={{ flexDirection: 'row' }}>
			<text>
				<span fg={node.style.fg}>{node.bullet}</span>
			</text>
			<box style={{ flexDirection: 'column', flexShrink: 1 }}>
				{renderChildren(node.children, key)}
			</box>
		</box>
	)
}
