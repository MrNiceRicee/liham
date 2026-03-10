// mermaid renderer — displays pre-computed ASCII from compile-time

import type { ReactNode } from 'react'

import type { CustomNode } from '../../ir/types.ts'
import type { ThemeTokens } from '../../theme/types.ts'
import { parseAnsiSegments } from './ansi-spans.ts'

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
				<text fg={theme.mermaid.errorColor}>[{node.data.error ?? 'unsupported diagram type'}]</text>
			</box>
		)
	}

	// parse truecolor ANSI into colored spans
	const segments = parseAnsiSegments(node.data.rendered)
	const spans = segments.map((seg, i) =>
		seg.fg != null ? (
			<span key={String(i)} fg={seg.fg}>
				{seg.text}
			</span>
		) : (
			seg.text
		),
	)

	return (
		<box key={key} style={boxStyle} border title="mermaid">
			<text>{spans}</text>
		</box>
	)
}
