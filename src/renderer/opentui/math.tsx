// math renderer — reads pre-computed unicode from compile-time IR data

import type { ReactNode } from 'react'

import type { CustomNode } from '../../ir/types.ts'

export function renderMathInline(node: CustomNode<'mathInline'>, key: string): ReactNode {
	return (
		<span key={key} fg={node.data.fg}>
			{node.data.unicode}
		</span>
	)
}

export function renderMathDisplay(node: CustomNode<'mathDisplay'>, key: string): ReactNode {
	return (
		<box key={key} style={{ marginBottom: 1 }}>
			<text>
				<span fg={node.data.fg}>{node.data.unicode}</span>
			</text>
		</box>
	)
}
