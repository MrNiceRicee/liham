import type { ThematicBreakNode } from '../../ir/types.ts'

export function renderThematicBreak(node: ThematicBreakNode, key: string) {
	return (
		<box
			key={key}
			border={['top']}
			borderColor={node.style.color}
			style={{ width: '100%', marginBottom: 1 }}
		/>
	)
}
