import type { ParagraphNode } from '../../ir/types.ts'

import { renderInlineChildren } from './inline.tsx'

export function renderParagraph(node: ParagraphNode, key: string) {
	const style: Record<string, unknown> = {}
	if (node.style.fg != null) style['fg'] = node.style.fg

	return (
		<box key={key} style={{ marginBottom: 1 }}>
			<text style={style}>{renderInlineChildren(node.children, key)}</text>
		</box>
	)
}
