import type { Element } from 'hast'

import type { BaseNodeProps } from '../../types/components.ts'

export function List({ children }: Readonly<BaseNodeProps>) {
	return <box style={{ flexDirection: 'column', marginBottom: 1 }}>{children}</box>
}

// determines bullet marker for a list item based on parent list type and position
export function getListItemBullet(node: Element, ancestors: Element[]): string {
	const parentList = ancestors.findLast((a) => a.tagName === 'ul' || a.tagName === 'ol')
	if (parentList == null) return '• '

	if (parentList.tagName === 'ol') {
		const start =
			typeof parentList.properties?.['start'] === 'number' ? parentList.properties['start'] : 1
		const index = parentList.children
			.filter((c) => c.type === 'element' && c.tagName === 'li')
			.indexOf(node)
		return `${String(start + Math.max(0, index))}. `
	}

	// nesting depth determines bullet style
	const depth = ancestors.filter((a) => a.tagName === 'ul').length
	const bullets = ['•', '◦', '▪']
	return `${bullets[(depth - 1) % bullets.length]} `
}

export function ListItem({ children, node, theme }: Readonly<BaseNodeProps>) {
	// bullet is injected as data attribute by rehype-terminal
	const bullet =
		typeof node.properties?.['data-bullet'] === 'string' ? node.properties['data-bullet'] : '• '

	return (
		<box style={{ flexDirection: 'row' }}>
			<text style={{ fg: theme.list.bulletColor }}>
				<span>{bullet}</span>
			</text>
			<box style={{ flexDirection: 'column', flexShrink: 1 }}>{children}</box>
		</box>
	)
}
