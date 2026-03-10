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
		languageColor: '#7aa2f7',
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
		loadingColor: '#7aa2f7',
		placeholderBg: '#1a1b26',
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
		dimFg: '#3b4261',
	},
	pane: {
		focusedBorderColor: '#7aa2f7',
		unfocusedBorderColor: '#3b4261',
	},
	browser: {
		directoryColor: '#565f89',
		selectedBg: '#283457',
		selectedFg: '#c0caf5',
		matchHighlightColor: '#ff9e64',
		filterColor: '#7aa2f7',
		fileCountColor: '#565f89',
	},
	search: {
		noMatchColor: '#f7768e',
		highlightBg: '#3d59a1',
		highlightFg: '#c0caf5',
		currentHighlightBg: '#ff9e64',
	},
	math: {
		textColor: '#c0caf5',
	},
	mermaid: {
		arrowColor: '#7aa2f7',
		borderColor: '#7aa2f7',
		errorColor: '#565f89',
		lineColor: '#565f89',
		textColor: '#c0caf5',
	},
}
