// opentui renderer: IR nodes -> OpenTUI React JSX.
// entry point for the OpenTUI rendering pipeline.

import type { ReactNode } from 'react'

import { TextAttributes } from '@opentui/core'
import { extractText } from '../../ir/text-utils.ts'
import { type CoreIRNode, type IRNode, isBlockNode, type MediaIRNode } from '../../ir/types.ts'
import { estimateHeadingOffset, estimateTotalHeight } from './scroll-utils.ts'
import type { TocEntry } from './toc.ts'
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

// media collection accumulated during IR-to-JSX traversal
export interface MediaEntry {
	node: MediaIRNode
	index: number
}

export interface RenderResult {
	jsx: ReactNode
	mediaNodes: MediaEntry[]
	tocEntries: TocEntry[]
	estimatedTotalHeight: number
}

// mutable accumulator threaded through render calls
interface RenderContext {
	maxWidth?: number | undefined
	media: MediaEntry[]
	toc: TocEntry[]
	blockIndex: number
	irNodes: IRNode[] // top-level nodes for estimateHeadingOffset
}

function isCoreNode(node: IRNode): node is CoreIRNode {
	return 'type' in node && typeof node.type === 'string'
}

// renders a single IR node to OpenTUI JSX
function renderNode(node: IRNode, key: string, ctx: RenderContext): ReactNode {
	if (!isCoreNode(node)) return renderCustom(node, key)

	switch (node.type) {
		case 'root': {
			// set irNodes for estimateHeadingOffset at the top level
			ctx.irNodes = node.children
			const rootChildren = renderChildrenInternalTracked(node.children, key, ctx)
			return (
				<box key={key} style={{ flexDirection: 'column', width: '100%' }}>
					{rootChildren}
				</box>
			)
		}

		case 'heading': {
			const tocEntry: TocEntry = {
				level: node.level,
				text: extractText(node.children),
				blockIndex: ctx.blockIndex,
				estimatedOffset: estimateHeadingOffset(ctx.irNodes, ctx.toc.length, ctx.maxWidth),
			}
			if (node.sourceLine != null) tocEntry.sourceLine = node.sourceLine
			ctx.toc.push(tocEntry)
			return renderHeading(node, key)
		}

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

		case 'image': {
			const mediaIndex = ctx.media.length
			ctx.media.push({ node, index: mediaIndex })
			return renderImageBlock(node, key, mediaIndex)
		}

		case 'video': {
			const mediaIndex = ctx.media.length
			ctx.media.push({ node, index: mediaIndex })
			const vidProps: Record<string, unknown> = { attributes: TextAttributes.DIM }
			if (node.style.fg != null) vidProps['fg'] = node.style.fg
			return (
				<text key={key}>
					<span {...vidProps}>[video: {node.alt}]</span>
				</text>
			)
		}

		case 'audio': {
			const mediaIndex = ctx.media.length
			ctx.media.push({ node, index: mediaIndex })
			const audProps: Record<string, unknown> = { attributes: TextAttributes.DIM }
			if (node.style.fg != null) audProps['fg'] = node.style.fg
			return (
				<text key={key}>
					<span {...audProps}>[audio: {node.alt}]</span>
				</text>
			)
		}

		case 'table':
			return renderTable(node, key, ctx.maxWidth)

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

// top-level render with blockIndex tracking (for TOC)
function renderChildrenInternalTracked(
	children: IRNode[],
	parentKey: string,
	ctx: RenderContext,
): ReactNode[] {
	const results: ReactNode[] = []
	for (let i = 0; i < children.length; i++) {
		const child = children[i]!
		if (isBlockNode(child)) {
			const result = renderNode(child, `${parentKey}-${String(i)}`, ctx)
			if (result != null) results.push(result)
			ctx.blockIndex++
		} else {
			// inline at root level — rare, wrap in text
			const result = renderInlineNode(child, `${parentKey}-${String(i)}`)
			if (result != null) results.push(<text key={`${parentKey}-tw-${String(i)}`}>{result}</text>)
		}
	}
	return results
}

// internal renderChildren that threads RenderContext
function renderChildrenInternal(
	children: IRNode[],
	parentKey: string,
	ctx: RenderContext,
): ReactNode[] {
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
			const result = renderNode(child, `${parentKey}-${String(i)}`, ctx)
			if (result != null) results.push(result)
		} else {
			inlineGroup.push({ node: child, index: i })
		}
	}
	flushInline()

	return results
}

// renders children with block-context awareness:
// groups consecutive inline nodes into <text> wrappers,
// renders block nodes directly.
export function renderChildren(
	children: IRNode[],
	parentKey: string,
	maxWidth?: number,
): ReactNode[] {
	return renderChildrenInternal(children, parentKey, {
		maxWidth,
		media: [],
		toc: [],
		blockIndex: 0,
		irNodes: [],
	})
}

// public API: renders an IR tree to a React node tree (legacy, no media collection)
export function renderToOpenTUI(ir: IRNode, maxWidth?: number): ReactNode {
	const ctx: RenderContext = { maxWidth, media: [], toc: [], blockIndex: 0, irNodes: [] }
	return renderNode(ir, 'root', ctx)
}

// public API: renders an IR tree and collects media + TOC nodes
export function renderToOpenTUIWithMedia(ir: IRNode, maxWidth?: number): RenderResult {
	const ctx: RenderContext = { maxWidth, media: [], toc: [], blockIndex: 0, irNodes: [] }
	const jsx = renderNode(ir, 'root', ctx)
	const totalHeight = estimateTotalHeight(ctx.irNodes, maxWidth)
	return { jsx, mediaNodes: ctx.media, tocEntries: ctx.toc, estimatedTotalHeight: totalHeight }
}
