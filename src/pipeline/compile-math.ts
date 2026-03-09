// compile math hast nodes to IR CustomNode<'mathInline'> / CustomNode<'mathDisplay'>
// unicodeit.replace() runs here at compile-time, not in the renderer

import type { Element, Text } from 'hast'
import { replace } from 'unicodeit'

import type { CustomNode } from '../ir/types.ts'
import type { ThemeTokens } from '../theme/types.ts'

function textContent(node: Element): string {
	let text = ''
	for (const child of node.children) {
		if (child.type === 'text') text += (child as Text).value
		else if (child.type === 'element') text += textContent(child as Element)
	}
	return text
}

function safeReplace(latex: string): string {
	try {
		return replace(latex)
	} catch {
		return latex
	}
}

export function compileMathInline(node: Element, theme: ThemeTokens): CustomNode<'mathInline'> {
	const latex = textContent(node)
	return {
		type: 'mathInline',
		data: { latex, unicode: safeReplace(latex), fg: theme.math.textColor },
	}
}

export function compileMathDisplay(node: Element, theme: ThemeTokens): CustomNode<'mathDisplay'> {
	const codeEl = node.children.find(
		(c): c is Element => c.type === 'element' && c.tagName === 'code',
	)
	const latex = codeEl != null ? textContent(codeEl) : textContent(node)
	return {
		type: 'mathDisplay',
		data: { latex, unicode: safeReplace(latex), fg: theme.math.textColor },
	}
}
