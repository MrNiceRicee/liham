import type { BaseNodeProps } from '../../types/components.ts'

export function Blockquote({ children, theme }: Readonly<BaseNodeProps>) {
	const { borderColor, backgroundColor } = theme.blockquote

	return (
		<box
			style={{
				border: ['left'],
				borderStyle: 'heavy',
				borderColor,
				backgroundColor,
				marginBottom: 1,
				paddingLeft: 1,
				flexDirection: 'column',
			}}
		>
			{children}
		</box>
	)
}
