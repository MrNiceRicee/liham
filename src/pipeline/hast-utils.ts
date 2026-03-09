// shared hast utility functions and constants for the pipeline

import type { Element } from 'hast'

// hast block elements
export const HAST_BLOCK_TAGS = new Set([
	'address',
	'article',
	'aside',
	'blockquote',
	'details',
	'dialog',
	'dd',
	'div',
	'dl',
	'dt',
	'fieldset',
	'figcaption',
	'figure',
	'footer',
	'form',
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'header',
	'hgroup',
	'hr',
	'li',
	'main',
	'nav',
	'ol',
	'p',
	'pre',
	'section',
	'summary',
	'table',
	'tbody',
	'td',
	'tfoot',
	'th',
	'thead',
	'tr',
	'ul',
	'video',
	'audio',
])

export const KNOWN_INLINE_TAGS = new Set([
	'a',
	'abbr',
	'b',
	'br',
	'code',
	'del',
	'em',
	'i',
	'img',
	'input',
	'kbd',
	'mark',
	's',
	'small',
	'span',
	'strong',
	'sub',
	'sup',
	'u',
])

// block containers where whitespace-only text nodes should be stripped
export const STRIP_WHITESPACE_CONTAINERS = new Set([
	'ul',
	'ol',
	'table',
	'thead',
	'tbody',
	'tfoot',
	'tr',
])

// -- hast text extraction helpers --

export function extractText(node: Element): string {
	let result = ''
	for (const child of node.children) {
		if (child.type === 'text') {
			result += child.value
		} else if (child.type === 'element') {
			result += extractText(child)
		}
	}
	return result
}

export function extractCode(node: Element): string {
	const codeEl = node.children.find(
		(child): child is Element => child.type === 'element' && child.tagName === 'code',
	)
	if (!codeEl) return ''
	return extractText(codeEl)
}

export function extractLanguage(node: Element): string | undefined {
	const codeEl = node.children.find(
		(child): child is Element => child.type === 'element' && child.tagName === 'code',
	)
	if (!codeEl) return undefined

	const className = codeEl.properties?.['className']
	if (!Array.isArray(className)) return undefined

	for (const cls of className) {
		if (typeof cls === 'string' && cls.startsWith('language-')) {
			return cls.slice(9)
		}
	}
	return undefined
}

export function hasClass(node: Element, className: string): boolean {
	const classes = node.properties?.['className']
	return Array.isArray(classes) && classes.includes(className)
}
