// opentui renderer: IR nodes -> OpenTUI React JSX.
// entry point for the OpenTUI rendering pipeline.

import type { ReactNode } from 'react'

import { isBlockNode, type CoreIRNode, type IRNode } from '../../ir/types.ts'
import { renderBlockquote } from './blockquote.tsx'
import { renderCodeBlock } from './code-block.tsx'
import { renderCustom, renderUnknown } from './fallback.tsx'
import { renderHeading } from './heading.tsx'
import { renderImageBlock } from './image.tsx'
import { renderInlineNode } from './inline.tsx'
import { renderList, renderListItem } from './list.tsx'
import { renderParagraph } from './paragraph.tsx'
import { renderTable, renderTableCell, renderTableRow } from './table.tsx'
import { renderThematicBreak } from './thematic-break.tsx'

function isCoreNode(node: IRNode): node is CoreIRNode {
	return 'type' in node && typeof node.type === 'string'
}

// renders a single IR node to OpenTUI JSX
function renderNode(node: IRNode, key: string, maxWidth?: number): ReactNode {
	if (!isCoreNode(node)) return renderCustom(node, key)

	switch (node.type) {
		case 'root':
			return (
				<box key={key} style={{ flexDirection: 'column', width: '100%' }}>
					{renderChildren(node.children, key, maxWidth)}
				</box>
			)

		case 'heading':
			return renderHeading(node, key)

		case 'paragraph':
			return renderParagraph(node, key)

		case 'codeBlock':
			return renderCodeBlock(node, key)

		case 'blockquote':
			return renderBlockquote(node, key)

		case 'list':
			return renderList(node, key)

		case 'listItem':
			return renderListItem(node, key)

		case 'image':
			return renderImageBlock(node, key)

		case 'table':
			return renderTable(node, key, maxWidth)

		case 'tableRow':
			return renderTableRow(node, key, { colWidths: [] })

		case 'tableCell':
			return renderTableCell(node, key, false, 20)

		case 'thematicBreak':
			return renderThematicBreak(node, key)

		case 'unknown':
			return renderUnknown(node, key)

		default:
			// inline node rendered at block level — wrap in text
			return <text key={key}>{renderInlineNode(node, key)}</text>
	}
}

// renders children with block-context awareness:
// groups consecutive inline nodes into <text> wrappers,
// renders block nodes directly.
export function renderChildren(children: IRNode[], parentKey: string, maxWidth?: number): ReactNode[] {
	const results: ReactNode[] = []
	let inlineGroup: { node: IRNode; index: number }[] = []
	let wrapCount = 0

	const flushInline = () => {
		if (inlineGroup.length === 0) return
		const inlineResults: ReactNode[] = []
		for (const item of inlineGroup) {
			const result = renderInlineNode(item.node, `${parentKey}-${String(item.index)}`)
			if (result != null) inlineResults.push(result)
		}
		const hasContent = inlineResults.some((r) => typeof r !== 'string' || r.trim().length > 0)
		if (inlineResults.length > 0 && hasContent) {
			results.push(<text key={`${parentKey}-tw-${String(wrapCount++)}`}>{inlineResults}</text>)
		}
		inlineGroup = []
	}

	for (let i = 0; i < children.length; i++) {
		const child = children[i]!
		if (isBlockNode(child)) {
			flushInline()
			const result = renderNode(child, `${parentKey}-${String(i)}`, maxWidth)
			if (result != null) results.push(result)
		} else {
			inlineGroup.push({ node: child, index: i })
		}
	}
	flushInline()

	return results
}

// public API: renders an IR tree to a React node tree
export function renderToOpenTUI(ir: IRNode, maxWidth?: number): ReactNode {
	return renderNode(ir, 'root', maxWidth)
}
