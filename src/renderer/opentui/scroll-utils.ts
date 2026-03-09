// scroll utilities — line-based scroll for source pane, IR height estimation for preview pane.

import type { ScrollBoxRenderable } from '@opentui/core'

import type { CoreIRNode, IRNode } from '../../ir/types.ts'
import { extractText } from '../../ir/text-utils.ts'

// source pane: exact line-based scroll
// padding offset of 1 from source-pane.tsx <box style={{ padding: 1 }}>
export function scrollToLine(ref: ScrollBoxRenderable | null, line: number): void {
	if (ref == null) return
	ref.scrollTo(line + 1)
}

// -- IR node height estimation --

const MAX_DEPTH = 100

function estimateHeightInternal(node: CoreIRNode, paneWidth: number, depth: number): number {
	if (depth >= MAX_DEPTH) return 1

	switch (node.type) {
		case 'heading':
			return 2 // 1 text + 1 margin

		case 'paragraph': {
			const text = extractText(node.children)
			const contentWidth = Math.max(1, paneWidth - 2)
			return Math.ceil(text.length / contentWidth) + 1 // wrapping + margin
		}

		case 'codeBlock': {
			const lineCount = node.code.split('\n').length
			return lineCount + 2 + (node.language != null ? 1 : 0) + 1 // lines + border + lang + margin
		}

		case 'blockquote': {
			let inner = 0
			for (const child of node.children) {
				inner += estimateHeightInternal(child as CoreIRNode, paneWidth - 4, depth + 1)
			}
			return inner + 2 // border
		}

		case 'list': {
			let total = 0
			for (const child of node.children) {
				total += estimateHeightInternal(child as CoreIRNode, paneWidth, depth + 1)
			}
			return total + 1 // margin
		}

		case 'listItem': {
			let total = 0
			for (const child of node.children) {
				total += estimateHeightInternal(child as CoreIRNode, paneWidth - 2, depth + 1)
			}
			return Math.max(1, total)
		}

		case 'table': {
			const rowCount = node.children.length
			return rowCount + 1 + 2 + 1 // rows + separator + border + margin
		}

		case 'thematicBreak':
			return 1

		case 'image':
			return 10 // placeholder, actual varies

		case 'video':
		case 'audio':
			return 1

		case 'root': {
			let total = 0
			for (const child of node.children) {
				total += estimateHeightInternal(child as CoreIRNode, paneWidth, depth + 1)
			}
			return total
		}

		case 'unknown':
			return 1

		default:
			return 1
	}
}

export function estimateHeight(node: CoreIRNode, paneWidth = 80): number {
	return estimateHeightInternal(node, paneWidth, 0)
}

// compute estimated row offset of the Nth heading in a list of top-level IR nodes
export function estimateHeadingOffset(
	nodes: IRNode[],
	headingIndex: number,
	paneWidth = 80,
): number {
	let offset = 0
	let headingCount = 0

	for (const node of nodes) {
		if (!('type' in node)) continue
		const coreNode = node as CoreIRNode
		if (coreNode.type === 'heading') {
			if (headingCount === headingIndex) return offset
			headingCount++
		}
		offset += estimateHeight(coreNode, paneWidth)
	}

	return offset
}
