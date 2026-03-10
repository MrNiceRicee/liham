import type { ThematicBreakNode } from '../../ir/types.ts'

import { sourceLineId } from './source-line-id.ts'

export function renderThematicBreak(node: ThematicBreakNode, key: string) {
	return (
		<box
			key={key}
			{...sourceLineId(node.sourceLine)}
			border={['top']}
			borderColor={node.style.color}
			style={{ width: '100%', marginBottom: 1 }}
		/>
	)
}
