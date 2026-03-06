// highlight.js class → Tokyo Night color mapping for syntax-highlighted code blocks.

import type { Element } from 'hast'

const HLJS_COLORS: Record<string, string> = {
	'hljs-addition': '#9ece6a',
	'hljs-attr': '#7aa2f7',
	'hljs-attribute': '#bb9af7',
	'hljs-built_in': '#e0af68',
	'hljs-bullet': '#89ddff',
	'hljs-class': '#e0af68',
	'hljs-code': '#9ece6a',
	'hljs-comment': '#565f89',
	'hljs-deletion': '#f7768e',
	'hljs-doctag': '#7aa2f7',
	'hljs-emphasis': '#c0caf5',
	'hljs-formula': '#bb9af7',
	'hljs-function': '#7aa2f7',
	'hljs-keyword': '#bb9af7',
	'hljs-link': '#2ac3de',
	'hljs-literal': '#ff9e64',
	'hljs-meta': '#e0af68',
	'hljs-name': '#f7768e',
	'hljs-number': '#ff9e64',
	'hljs-operator': '#89ddff',
	'hljs-params': '#c0caf5',
	'hljs-property': '#7aa2f7',
	'hljs-punctuation': '#89ddff',
	'hljs-quote': '#565f89',
	'hljs-regexp': '#2ac3de',
	'hljs-section': '#7aa2f7',
	'hljs-selector-attr': '#bb9af7',
	'hljs-selector-class': '#9ece6a',
	'hljs-selector-id': '#7aa2f7',
	'hljs-selector-pseudo': '#9ece6a',
	'hljs-selector-tag': '#f7768e',
	'hljs-string': '#9ece6a',
	'hljs-strong': '#c0caf5',
	'hljs-subst': '#c0caf5',
	'hljs-symbol': '#ff9e64',
	'hljs-tag': '#f7768e',
	'hljs-template-tag': '#bb9af7',
	'hljs-template-variable': '#2ac3de',
	'hljs-title': '#7aa2f7',
	'hljs-type': '#2ac3de',
	'hljs-variable': '#c0caf5',
}

export function getHighlightColor(node: Element): string | undefined {
	const className = node.properties?.['className']
	if (!Array.isArray(className)) return undefined

	for (const cls of className) {
		if (typeof cls === 'string') {
			const color = HLJS_COLORS[cls]
			if (color != null) return color
		}
	}
	return undefined
}
