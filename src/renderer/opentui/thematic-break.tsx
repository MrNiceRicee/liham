import type { ThematicBreakNode } from '../../ir/types.ts'

export function renderThematicBreak(node: ThematicBreakNode, key: string) {
	return (
		<box key={key} style={{ flexDirection: 'column', marginBottom: 1 }}>
			<text style={{ fg: node.style.color }}>{node.style.char.repeat(40)}</text>
		</box>
	)
}
