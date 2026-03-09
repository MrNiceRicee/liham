// compile math hast nodes to IR CustomNode<'mathInline'> / CustomNode<'mathDisplay'>
// unicodeit.replace() runs here at compile-time, not in the renderer

import type { Element } from 'hast'
import { replace } from 'unicodeit'

import type { CustomNode } from '../ir/types.ts'
import type { ThemeTokens } from '../theme/types.ts'
import { extractText } from './hast-utils.ts'

function safeReplace(latex: string): string {
	try {
		return replace(latex)
	} catch {
		return latex
	}
}

export function compileMathInline(node: Element, theme: ThemeTokens): CustomNode<'mathInline'> {
	const latex = extractText(node)
	return {
		type: 'mathInline',
		data: { latex, unicode: safeReplace(latex), fg: theme.math.textColor },
	}
}

export function compileMathDisplay(node: Element, theme: ThemeTokens): CustomNode<'mathDisplay'> {
	const codeEl = node.children.find(
		(c): c is Element => c.type === 'element' && c.tagName === 'code',
	)
	const latex = codeEl != null ? extractText(codeEl) : extractText(node)
	return {
		type: 'mathDisplay',
		data: { latex, unicode: safeReplace(latex), fg: theme.math.textColor },
	}
}
