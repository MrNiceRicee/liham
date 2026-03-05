import type { ThemeTokens } from './types.ts'

export const darkTheme: ThemeTokens = {
	heading: {
		color: '#7aa2f7',
		bold: true,
		prefix: '#',
	},
	codeBlock: {
		borderColor: '#414868',
		backgroundColor: '#1a1b26',
		gutterColor: '#565f89',
		textColor: '#c0caf5',
	},
	blockquote: {
		borderChar: '│',
		borderColor: '#565f89',
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
		backgroundColor: '#292e42',
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
}
