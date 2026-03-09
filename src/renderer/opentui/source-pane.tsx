// source pane — raw markdown text in a scrollbox with optional search highlighting.

import type { ScrollBoxRenderable } from '@opentui/core'
import type { ReactNode, RefObject } from 'react'
import { useMemo } from 'react'

import type { SearchMatch } from '../../search/find.ts'
import type { ThemeTokens } from '../../theme/types.ts'
import { splitHighlightSegments } from './highlight-splits.ts'

export interface SearchHighlight {
	matches: SearchMatch[]
	currentIndex: number
	queryLength: number
}

interface SourcePaneProps {
	content: string
	focused: boolean
	theme: ThemeTokens
	scrollRef: RefObject<ScrollBoxRenderable | null>
	width?: number | undefined
	height?: number | undefined
	onMouseDown?: () => void
	onMouseScroll?: () => void
	searchHighlight?: SearchHighlight | undefined
}

// chunk raw text into groups of lines to reduce React element count
function chunkLines(text: string, chunkSize: number): string[] {
	const lines = text.split('\n')
	const chunks: string[] = []
	for (let i = 0; i < lines.length; i += chunkSize) {
		chunks.push(lines.slice(i, i + chunkSize).join('\n'))
	}
	return chunks
}

// build a map of line number → matches on that line for O(1) lookup
function buildLineMatchMap(matches: SearchMatch[]): Map<number, SearchMatch[]> {
	const map = new Map<number, SearchMatch[]>()
	for (const match of matches) {
		const existing = map.get(match.line)
		if (existing != null) existing.push(match)
		else map.set(match.line, [match])
	}
	return map
}

// render a line with search highlights applied
function renderHighlightedLine(
	line: string,
	lineMatches: SearchMatch[],
	queryLength: number,
	currentCharOffset: number | undefined,
	theme: ThemeTokens,
	keyPrefix: string,
): ReactNode[] {
	// build highlight position sets
	const highlightPositions = new Set<number>()
	const currentPositions = new Set<number>()

	for (const m of lineMatches) {
		const isCurrent = currentCharOffset != null && m.charOffset === currentCharOffset
		for (let c = m.column; c < m.column + queryLength && c < line.length; c++) {
			highlightPositions.add(c)
			if (isCurrent) currentPositions.add(c)
		}
	}

	const segments = splitHighlightSegments(line, highlightPositions)
	const elements: ReactNode[] = []
	let charPos = 0

	for (let si = 0; si < segments.length; si++) {
		const seg = segments[si]!
		if (!seg.highlighted) {
			elements.push(
				<span key={`${keyPrefix}-s${String(si)}`} fg={theme.paragraph.textColor}>
					{seg.text}
				</span>,
			)
		} else {
			const isCurrentSeg = currentPositions.has(charPos)
			elements.push(
				<span
					key={`${keyPrefix}-s${String(si)}`}
					bg={isCurrentSeg ? theme.search.currentHighlightBg : theme.search.highlightBg}
					fg={isCurrentSeg ? theme.codeBlock.backgroundColor : theme.search.highlightFg}
				>
					{seg.text}
				</span>,
			)
		}
		charPos += seg.text.length
	}

	return elements
}

// render a chunk with search highlights
function renderHighlightedChunk(
	chunk: string,
	chunkStartLine: number,
	lineMatchMap: Map<number, SearchMatch[]>,
	queryLength: number,
	currentCharOffset: number | undefined,
	theme: ThemeTokens,
	chunkKey: string,
): ReactNode {
	const lines = chunk.split('\n')
	const elements: ReactNode[] = []

	for (let lineOffset = 0; lineOffset < lines.length; lineOffset++) {
		const globalLine = chunkStartLine + lineOffset
		const line = lines[lineOffset]!
		const lineMatches = lineMatchMap.get(globalLine)

		if (lineOffset > 0) elements.push('\n')

		if (lineMatches == null || lineMatches.length === 0) {
			elements.push(line)
			continue
		}

		const highlighted = renderHighlightedLine(
			line,
			lineMatches,
			queryLength,
			currentCharOffset,
			theme,
			`${chunkKey}-l${String(globalLine)}`,
		)
		elements.push(...highlighted)
	}

	return <text key={chunkKey}>{elements}</text>
}

export function SourcePane({
	content,
	focused,
	theme,
	scrollRef,
	width,
	height,
	onMouseDown,
	onMouseScroll,
	searchHighlight,
}: Readonly<SourcePaneProps>) {
	const chunks = useMemo(() => chunkLines(content, 100), [content])
	const borderColor = focused ? theme.pane.focusedBorderColor : theme.pane.unfocusedBorderColor

	const rootOptions: Record<string, unknown> = { flexGrow: 1, borderColor, borderStyle: 'single' }
	rootOptions['width'] = width ?? '100%'
	if (height != null) rootOptions['height'] = height

	const lineMatchMap = useMemo(
		() => (searchHighlight != null ? buildLineMatchMap(searchHighlight.matches) : null),
		[searchHighlight?.matches],
	)

	const currentCharOffset =
		searchHighlight != null && searchHighlight.matches.length > 0
			? searchHighlight.matches[searchHighlight.currentIndex]?.charOffset
			: undefined

	return (
		<scrollbox
			ref={scrollRef}
			focused={focused}
			viewportCulling
			border
			{...(onMouseDown != null ? { onMouseDown } : {})}
			{...(onMouseScroll != null ? { onMouseScroll } : {})}
			style={{ rootOptions }}
		>
			<box style={{ flexDirection: 'column', padding: 1 }}>
				{chunks.map((chunk, i) => {
					if (searchHighlight == null || lineMatchMap == null || searchHighlight.matches.length === 0) {
						return (
							<text key={`src-${String(i)}`} fg={theme.paragraph.textColor}>
								{chunk}
							</text>
						)
					}

					return renderHighlightedChunk(
						chunk,
						i * 100,
						lineMatchMap,
						searchHighlight.queryLength,
						currentCharOffset,
						theme,
						`src-${String(i)}`,
					)
				})}
			</box>
		</scrollbox>
	)
}
