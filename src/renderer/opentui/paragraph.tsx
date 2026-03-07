import type { ParagraphNode } from '../../ir/types.ts'

import { renderInlineChildren } from './inline.tsx'

export function renderParagraph(node: ParagraphNode, key: string) {
	const children = renderInlineChildren(node.children, key)

	return (
		<box key={key} style={{ marginBottom: 1 }}>
			<text>{node.style.fg != null ? <span fg={node.style.fg}>{children}</span> : children}</text>
		</box>
	)
}
