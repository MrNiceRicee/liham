import type { BaseNodeProps } from '../../types/components.ts'

export function Paragraph({ children, theme }: Readonly<BaseNodeProps>) {
	return (
		<box style={{ marginBottom: 1 }}>
			<text style={{ fg: theme.paragraph.textColor }}>{children}</text>
		</box>
	)
}
