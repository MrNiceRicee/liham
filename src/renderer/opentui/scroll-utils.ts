// scroll utilities — line-based scroll for source pane, IR height estimation for preview pane.

import type { ScrollBoxRenderable } from '@opentui/core'

import type { IRNode } from '../../ir/types.ts'
import { isCoreNode, isCustomNode } from '../../ir/types.ts'
import { extractText } from '../../ir/text-utils.ts'

// source pane: centered line-based scroll
// padding offset of 1 from source-pane.tsx <box style={{ padding: 1 }}>
export function scrollToLine(ref: ScrollBoxRenderable | null, line: number): void {
	if (ref == null) return
	const centered = line + 1 - Math.floor(ref.viewport.height / 2)
	ref.scrollTo(Math.max(0, centered))
}

// -- IR node height estimation --

const MAX_DEPTH = 100

function estimateHeightInternal(node: IRNode, paneWidth: number, depth: number): number {
	if (depth >= MAX_DEPTH) return 1
	if (!isCoreNode(node)) return estimateCustomHeight(node) ?? 1

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
				inner += estimateHeightInternal(child, paneWidth - 4, depth + 1)
			}
			return inner + 2 // border
		}

		case 'list': {
			let total = 0
			for (const child of node.children) {
				total += estimateHeightInternal(child, paneWidth, depth + 1)
			}
			return total + 1 // margin
		}

		case 'listItem': {
			let total = 0
			for (const child of node.children) {
				total += estimateHeightInternal(child, paneWidth - 2, depth + 1)
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
				total += estimateHeightInternal(child, paneWidth, depth + 1)
			}
			return total
		}

		case 'unknown':
			return 1

		default:
			return 1
	}
}

export function estimateHeight(node: IRNode, paneWidth = 80): number {
	return estimateHeightInternal(node, paneWidth, 0)
}

function estimateCustomHeight(node: IRNode): number | null {
	if (isCustomNode(node, 'mathDisplay')) {
		return node.data.unicode.split('\n').length + 1 // lines + margin
	}
	if (isCustomNode(node, 'mermaid')) {
		if (node.data.rendered != null) {
			return node.data.rendered.split('\n').length + 3 // lines + border + margin
		}
		return node.data.source.split('\n').length + 3 // fallback: source + border + margin
	}
	return null
}

// single O(n) pass: computes heading offsets and total height together
export function buildHeadingOffsets(
	nodes: IRNode[],
	paneWidth = 80,
): { offsets: number[]; totalHeight: number } {
	const offsets: number[] = []
	let total = 0
	for (const node of nodes) {
		if (!('type' in node)) continue
		if (node.type === 'heading') offsets.push(total)
		total += estimateHeight(node, paneWidth)
	}
	return { offsets, totalHeight: total }
}

// compute estimated total height of all top-level IR nodes
export function estimateTotalHeight(nodes: IRNode[], paneWidth = 80): number {
	return buildHeadingOffsets(nodes, paneWidth).totalHeight
}

/** @deprecated use buildHeadingOffsets for O(n) total instead of O(n) per call */
export function estimateHeadingOffset(
	nodes: IRNode[],
	headingIndex: number,
	paneWidth = 80,
): number {
	const { offsets } = buildHeadingOffsets(nodes, paneWidth)
	return offsets[headingIndex] ?? 0
}
