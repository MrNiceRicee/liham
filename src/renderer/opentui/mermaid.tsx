// mermaid renderer — displays pre-computed ASCII from compile-time

import type { ReactNode } from 'react'

import type { CustomNode } from '../../ir/types.ts'
import type { ThemeTokens } from '../../theme/types.ts'

export function renderMermaidBlock(
	node: CustomNode<'mermaid'>,
	key: string,
	theme: ThemeTokens,
): ReactNode {
	const boxStyle: Record<string, unknown> = {
		flexDirection: 'column',
		marginBottom: 1,
		borderColor: theme.mermaid.borderColor,
		borderStyle: 'single',
	}

	// error case: fallback to source with hint
	if (node.data.rendered == null) {
		return (
			<box key={key} style={boxStyle} border title="mermaid">
				<text fg={theme.mermaid.errorColor}>{node.data.source}</text>
				<text fg={theme.mermaid.errorColor}>
					[{node.data.error ?? 'unsupported diagram type'}]
				</text>
			</box>
		)
	}

	return (
		<box key={key} style={boxStyle} border title="mermaid">
			<text>{node.data.rendered}</text>
		</box>
	)
}
