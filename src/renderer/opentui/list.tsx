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
	const bulletProps: Record<string, unknown> = {}
	if (node.style.fg != null) bulletProps['fg'] = node.style.fg
	return (
		<box key={key} style={{ flexDirection: 'row' }}>
			<text>
				<span {...bulletProps}>{node.bullet}</span>
			</text>
			<box style={{ flexDirection: 'column', flexShrink: 1 }}>
				{renderChildren(node.children, key)}
			</box>
		</box>
	)
}
