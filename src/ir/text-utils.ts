// text extraction from IR nodes — recursive plain text concatenation.
// reusable: TOC headings, alt text fallback, search previews, reading time.

import type { CoreIRNode, IRNode } from './types.ts'
import { isCustomNode } from './types.ts'

function isCoreNode(node: IRNode): node is CoreIRNode {
	return 'type' in node && typeof node.type === 'string'
}

export function extractText(children: IRNode[]): string {
	let result = ''
	for (const child of children) {
		// handle custom inline nodes before the core guard
		if (isCustomNode(child, 'mathInline')) {
			result += child.data.unicode
			continue
		}
		if (!isCoreNode(child)) continue
		if (child.type === 'text') {
			result += child.value
		} else if (child.type === 'inlineCode') {
			result += child.value
		} else if (child.type === 'break') {
			result += ' '
		} else if ('children' in child && Array.isArray(child.children)) {
			result += extractText(child.children as IRNode[])
		}
	}
	return result
}
