import type { Element } from 'hast'

import type { BaseNodeProps } from '../../types/components.ts'

import { sanitizeForTerminal } from '../../pipeline/sanitize.ts'

// extracts text content from a hast code element (pre > code)
function extractCode(node: Element): string {
	const codeEl = node.children.find(
		(child): child is Element => child.type === 'element' && child.tagName === 'code',
	)

	if (!codeEl) return ''

	return extractText(codeEl)
}

function extractText(node: Element): string {
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

function extractLanguage(node: Element): string | undefined {
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

export function CodeBlock({ children, node, theme }: Readonly<BaseNodeProps>) {
	const lang = extractLanguage(node)
	const { borderColor, backgroundColor } = theme.codeBlock

	// if we have children from rehype-highlight (syntax-highlighted spans), use them
	// otherwise fall back to plain text extraction
	const hasHighlightedChildren = children != null

	return (
		<box
			style={{
				border: true,
				borderColor,
				backgroundColor,
				marginBottom: 1,
				padding: 1,
				flexDirection: 'column',
			}}
			title={lang ?? ''}
		>
			{hasHighlightedChildren ? (
				<text style={{ fg: theme.codeBlock.textColor }}>{children}</text>
			) : (
				<text style={{ fg: theme.codeBlock.textColor }}>
					{sanitizeForTerminal(extractCode(node))}
				</text>
			)}
		</box>
	)
}
