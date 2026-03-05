import { TextAttributes } from '@opentui/core'

import type { BaseNodeProps } from '../../types/components.ts'

const LEVEL_PREFIXES: Record<number, string> = {
	1: '# ',
	2: '## ',
	3: '### ',
	4: '#### ',
	5: '##### ',
	6: '###### ',
}

export function Heading({ children, node, theme }: Readonly<BaseNodeProps>) {
	const level = Number(node.tagName.charAt(1)) || 1
	const prefix = LEVEL_PREFIXES[level] ?? '# '
	const { color, bold } = theme.heading

	return (
		<box style={{ marginBottom: 1 }}>
			<text
				style={{
					fg: color,
					attributes: bold ? TextAttributes.BOLD : TextAttributes.NONE,
				}}
			>
				<span>{prefix}</span>
				{children}
			</text>
		</box>
	)
}
