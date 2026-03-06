import type { ThemeTokens } from './types.ts'

export const darkTheme: ThemeTokens = {
	heading: {
		levels: {
			1: { color: '#ff9e64', bold: true, dim: false }, // legendary — orange
			2: { color: '#bb9af7', bold: true, dim: false }, // epic — purple
			3: { color: '#7aa2f7', bold: true, dim: false }, // rare — blue
			4: { color: '#2ac3de', bold: false, dim: false }, // uncommon — cyan
			5: { color: '#9ece6a', bold: false, dim: false }, // common — green
			6: { color: '#c0caf5', bold: false, dim: true }, // mundane — regular text, dimmed
		},
	},
	codeBlock: {
		borderColor: '#414868',
		backgroundColor: '#1a1b26',
		gutterColor: '#565f89',
		textColor: '#c0caf5',
	},
	blockquote: {
		borderColor: '#565f89',
		backgroundColor: '#1e2030',
		textColor: '#9aa5ce',
	},
	link: {
		color: '#2ac3de',
		underline: true,
	},
	image: {
		fallbackColor: '#565f89',
	},
	inlineCode: {
		backgroundColor: '#343b58',
		textColor: '#c0caf5',
	},
	paragraph: {
		textColor: '#c0caf5',
	},
	list: {
		bulletColor: '#7aa2f7',
		textColor: '#c0caf5',
	},
	horizontalRule: {
		color: '#414868',
		char: '─',
	},
	table: {
		borderColor: '#414868',
		headerColor: '#7aa2f7',
		cellColor: '#c0caf5',
	},
	fallback: {
		textColor: '#565f89',
	},
	statusBar: {
		fg: '#565f89',
	},
}
