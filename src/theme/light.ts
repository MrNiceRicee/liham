import type { ThemeTokens } from './types.ts'

// tokyo night light palette — counterpart to dark theme's tokyo night storm
export const lightTheme: ThemeTokens = {
	heading: {
		levels: {
			1: { color: '#965027', bold: true, dim: false }, // legendary — warm brown
			2: { color: '#7847bd', bold: true, dim: false }, // epic — deep purple
			3: { color: '#34548a', bold: true, dim: false }, // rare — navy
			4: { color: '#166775', bold: false, dim: false }, // uncommon — teal
			5: { color: '#485e30', bold: false, dim: false }, // common — olive
			6: { color: '#343b59', bold: false, dim: true }, // mundane — dark slate, dimmed
		},
	},
	codeBlock: {
		borderColor: '#9699a3',
		backgroundColor: '#d5d6db',
		gutterColor: '#8c8fa1',
		textColor: '#343b59',
	},
	blockquote: {
		borderColor: '#9699a3',
		backgroundColor: '#dfe0e5',
		textColor: '#6172b0',
	},
	link: {
		color: '#166775',
		underline: true,
	},
	image: {
		fallbackColor: '#8c8fa1',
	},
	inlineCode: {
		backgroundColor: '#c4c5cc',
		textColor: '#343b59',
	},
	paragraph: {
		textColor: '#343b59',
	},
	list: {
		bulletColor: '#34548a',
		textColor: '#343b59',
	},
	horizontalRule: {
		color: '#9699a3',
		char: '─',
	},
	table: {
		borderColor: '#9699a3',
		headerColor: '#34548a',
		cellColor: '#343b59',
	},
	fallback: {
		textColor: '#8c8fa1',
	},
	statusBar: {
		fg: '#8990b3',
	},
	pane: {
		focusedBorderColor: '#34548a',
		unfocusedBorderColor: '#9699a3',
	},
}
