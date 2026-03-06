import { TextAttributes } from '@opentui/core'

import type { HeadingLevelTokens } from '../../theme/types.ts'
import type { BaseNodeProps } from '../../types/components.ts'

function getLevel(tagName: string): 1 | 2 | 3 | 4 | 5 | 6 {
	const n = Number(tagName.charAt(1))
	if (n >= 1 && n <= 6) return n as 1 | 2 | 3 | 4 | 5 | 6
	return 1
}

function getAttributes(tokens: HeadingLevelTokens): number {
	let attrs = TextAttributes.NONE
	if (tokens.bold) attrs |= TextAttributes.BOLD
	if (tokens.dim) attrs |= TextAttributes.DIM
	return attrs
}

export function Heading({ children, node, theme }: Readonly<BaseNodeProps>) {
	const level = getLevel(node.tagName)
	const tokens = theme.heading.levels[level]

	return (
		<box style={{ marginBottom: 1 }}>
			<text style={{ fg: tokens.color, attributes: getAttributes(tokens) }}>{children}</text>
		</box>
	)
}
