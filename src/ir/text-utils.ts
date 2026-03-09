// text extraction from IR nodes — recursive plain text concatenation.
// reusable: TOC headings, alt text fallback, search previews, reading time.

import type { CoreIRNode, IRNode } from './types.ts'

function isCoreNode(node: IRNode): node is CoreIRNode {
	return 'type' in node && typeof node.type === 'string'
}

export function extractText(children: IRNode[]): string {
	let result = ''
	for (const child of children) {
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
