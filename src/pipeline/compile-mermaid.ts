// compile mermaid code blocks to IR CustomNode<'mermaid'>
// renderMermaidASCII runs here at compile-time, not in the renderer

import type { AsciiRenderOptions } from 'beautiful-mermaid'
import { renderMermaidASCII } from 'beautiful-mermaid'
import type { Element } from 'hast'

import type { CustomNode } from '../ir/types.ts'
import type { ThemeTokens } from '../theme/types.ts'
import { extractText } from './hast-utils.ts'

export function compileMermaidBlock(node: Element, theme: ThemeTokens): CustomNode<'mermaid'> {
	const codeEl = node.children.find(
		(c): c is Element => c.type === 'element' && c.tagName === 'code',
	)
	const source = codeEl != null ? extractText(codeEl) : extractText(node)

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
