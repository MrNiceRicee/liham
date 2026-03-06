import type { IRNode, UnknownBlockNode } from '../../ir/types.ts'

import { renderChildren } from './index.tsx'

export function renderUnknown(node: UnknownBlockNode, key: string) {
	if (node.children.length === 0) return null
	return (
		<box key={key} style={{ flexDirection: 'column' }}>
			{renderChildren(node.children, key)}
		</box>
	)
}

export function renderCustom(node: IRNode, key: string) {
	const children = 'children' in node && Array.isArray(node.children) ? node.children : []
	if (children.length === 0) return null
	return (
		<box key={key} style={{ flexDirection: 'column' }}>
			{renderChildren(children, key)}
		</box>
	)
}
