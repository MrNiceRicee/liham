// compile mermaid code blocks to IR CustomNode<'mermaid'>
// renderMermaidASCII runs here at compile-time, not in the renderer

import type { AsciiRenderOptions } from 'beautiful-mermaid'
import { renderMermaidASCII } from 'beautiful-mermaid'
import type { Element } from 'hast'

import type { CustomNode } from '../ir/types.ts'
import type { ThemeTokens } from '../theme/types.ts'
import { extractCodeOrText } from './hast-utils.ts'
import { sanitizeForTerminal } from './sanitize.ts'

export function compileMermaidBlock(node: Element, theme: ThemeTokens): CustomNode<'mermaid'> {
	const source = sanitizeForTerminal(extractCodeOrText(node))

	let rendered: string | null = null
	let error: string | null = null
	try {
		const { mermaid } = theme
		const options: AsciiRenderOptions = {
			colorMode: 'truecolor',
			theme: {
				fg: mermaid.textColor,
				border: mermaid.borderColor,
				line: mermaid.lineColor,
				arrow: mermaid.arrowColor,
			},
		}
		// rendered output contains ANSI escapes from truecolor mode —
		// safe because source was already sanitized and ANSI is library-generated
		rendered = renderMermaidASCII(source, options)
	} catch (e) {
		error = e instanceof Error ? e.message : 'unsupported diagram type'
	}

	return {
		type: 'mermaid',
		data: { source, rendered, error },
	}
}
