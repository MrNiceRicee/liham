import type { ThematicBreakNode } from '../../ir/types.ts'

export function renderThematicBreak(node: ThematicBreakNode, key: string) {
	const width = process.stdout.columns || 80
	return (
		<box key={key} style={{ flexDirection: 'column', marginBottom: 1 }}>
			<text style={{ fg: node.style.color }}>{node.style.char.repeat(width)}</text>
		</box>
	)
}
