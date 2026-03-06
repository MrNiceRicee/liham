import type { CodeBlockNode } from '../../ir/types.ts'

import { renderInlineChildren } from './inline.tsx'

export function renderCodeBlock(node: CodeBlockNode, key: string) {
	const hasHighlightedChildren = node.children.length > 0
	const boxStyle: Record<string, unknown> = {
		border: true,
		marginBottom: 1,
		padding: 1,
		flexDirection: 'column',
	}
	if (node.style.borderColor != null) boxStyle['borderColor'] = node.style.borderColor
	if (node.style.bg != null) boxStyle['backgroundColor'] = node.style.bg

	const textStyle: Record<string, unknown> = {}
	if (node.style.fg != null) textStyle['fg'] = node.style.fg

	return (
		<box key={key} style={boxStyle} title={node.language ?? ''}>
			{hasHighlightedChildren ? (
				<text style={textStyle}>{renderInlineChildren(node.children, key)}</text>
			) : (
				<text style={textStyle}>{node.code}</text>
			)}
		</box>
	)
}
