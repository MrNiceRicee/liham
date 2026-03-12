// opentui renderer: IR nodes -> OpenTUI React JSX.
// entry point for the OpenTUI rendering pipeline.

import type { ReactNode } from 'react'

import { TextAttributes } from '@opentui/core'
import { extractText } from '../../ir/text-utils.ts'
import {
	type IRNode,
	isBlockNode,
	isCoreNode,
	isCustomNode,
	type MediaIRNode,
} from '../../ir/types.ts'
import type { ThemeTokens } from '../../theme/types.ts'
import { buildHeadingOffsets } from './scroll-utils.ts'
import type { TocEntry } from './toc.ts'
import { renderBlockquote } from './blockquote.tsx'
import { renderCodeBlock } from './code-block.tsx'
import { renderCustom, renderUnknown } from './fallback.tsx'
import { renderHeading } from './heading.tsx'
import { renderImageBlock } from './image.tsx'
import { renderInlineNode } from './inline.tsx'
import { renderMathDisplay, renderMathInline } from './math.tsx'
import { renderMermaidBlock } from './mermaid.tsx'
import { renderList, renderListItem } from './list.tsx'
import { renderParagraph } from './paragraph.tsx'
import { renderTable, renderTableCell, renderTableRow } from './table.tsx'
import { renderThematicBreak } from './thematic-break.tsx'
import { renderVideoThumbnail } from './video-thumbnail.tsx'

// media collection accumulated during IR-to-JSX traversal
export interface MediaEntry {
	node: MediaIRNode
	index: number
}

export interface RenderResult {
	jsx: ReactNode
	mediaNodes: MediaEntry[]
	tocEntries: TocEntry[]
	headingOffsets: number[]
	estimatedTotalHeight: number
}

// mutable accumulator threaded through render calls
interface RenderContext {
	maxWidth?: number | undefined
	media: MediaEntry[]
	theme: ThemeTokens
	toc: TocEntry[]
	blockIndex: number
	irNodes: IRNode[] // top-level nodes for estimateHeadingOffset
}

// renders a single IR node to OpenTUI JSX
function renderNode(node: IRNode, key: string, ctx: RenderContext): ReactNode {
	if (isCustomNode(node, 'mathInline')) return renderMathInline(node, key)
	if (isCustomNode(node, 'mathDisplay')) return renderMathDisplay(node, key)
	if (isCustomNode(node, 'mermaid')) return renderMermaidBlock(node, key, ctx.theme)
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
				estimatedOffset: 0, // patched after render by buildHeadingOffsets
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
			return renderVideoThumbnail(node, key, mediaIndex)
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
		theme: currentTheme!,
		toc: [],
		blockIndex: 0,
		irNodes: [],
	})
}

// module-level theme set at the start of each render pass.
// avoids threading theme through every sub-component signature.
let currentTheme: ThemeTokens | undefined

// module-level search state set before each render pass.
// SearchText reads these during IR-to-JSX traversal (not via React context,
// because the preview JSX tree is cached and context changes don't propagate).
let currentSearchQuery: string | undefined
let currentSearchHighlightBg: string | undefined
let currentSearchHighlightFg: string | undefined

export function setSearchState(
	query: string | undefined,
	highlightBg?: string | undefined,
	highlightFg?: string | undefined,
): void {
	currentSearchQuery = query
	currentSearchHighlightBg = highlightBg
	currentSearchHighlightFg = highlightFg
}

export function getSearchState() {
	return {
		query: currentSearchQuery,
		highlightBg: currentSearchHighlightBg,
		highlightFg: currentSearchHighlightFg,
	}
}

// public API: renders an IR tree to a React node tree (legacy, no media collection)
export function renderToOpenTUI(ir: IRNode, theme: ThemeTokens, maxWidth?: number): ReactNode {
	currentTheme = theme
	const ctx: RenderContext = { maxWidth, media: [], theme, toc: [], blockIndex: 0, irNodes: [] }
	return renderNode(ir, 'root', ctx)
}

// public API: renders an IR tree and collects media + TOC nodes
export function renderToOpenTUIWithMedia(
	ir: IRNode,
	theme: ThemeTokens,
	maxWidth?: number,
): RenderResult {
	currentTheme = theme
	const ctx: RenderContext = { maxWidth, media: [], theme, toc: [], blockIndex: 0, irNodes: [] }
	const jsx = renderNode(ir, 'root', ctx)
	const { offsets, totalHeight } = buildHeadingOffsets(ctx.irNodes, maxWidth)
	// patch pre-computed offsets into TOC entries
	for (let i = 0; i < ctx.toc.length; i++) {
		ctx.toc[i]!.estimatedOffset = offsets[i] ?? 0
	}
	return {
		jsx,
		mediaNodes: ctx.media,
		tocEntries: ctx.toc,
		headingOffsets: offsets,
		estimatedTotalHeight: totalHeight,
	}
}
