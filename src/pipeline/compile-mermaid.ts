// compile mermaid code blocks to IR CustomNode<'mermaid'>
// renderMermaidASCII runs here at compile-time, not in the renderer

import type { AsciiRenderOptions } from 'beautiful-mermaid'
import { renderMermaidASCII } from 'beautiful-mermaid'
import type { Element, Text } from 'hast'

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

export function compileMermaidBlock(node: Element, theme: ThemeTokens): CustomNode<'mermaid'> {
	const codeEl = node.children.find(
		(c): c is Element => c.type === 'element' && c.tagName === 'code',
	)
	const source = codeEl != null ? textContent(codeEl) : textContent(node)

	let rendered: string | null = null
	let error: string | null = null
	try {
		const options: AsciiRenderOptions = {
			colorMode: 'truecolor',
			theme: {
				fg: theme.mermaid.textColor,
				border: theme.mermaid.borderColor,
				line: theme.mermaid.borderColor,
				arrow: theme.mermaid.labelColor,
			},
		}
		rendered = renderMermaidASCII(source, options)
	} catch (e) {
		error = e instanceof Error ? e.message : 'unsupported diagram type'
	}

	return {
		type: 'mermaid',
		data: { source, rendered, error },
	}
}
