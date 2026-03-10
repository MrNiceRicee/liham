// search highlight — renders text with inline highlight spans for search matches.
// reads search state from module-level variables (set before each render pass)
// rather than React context, because the preview JSX tree is cached as a static
// ReactNode and context changes don't propagate to cached subtrees.
//
// renderSearchText is a plain function (NOT a React component) — it is called
// during IR-to-JSX tree construction so highlights are baked into the static tree.

import type { ReactNode } from 'react'

import { getSearchState } from './index.tsx'

interface MatchSegment {
	start: number
	end: number
}

// finds all case-insensitive non-overlapping match positions
function findMatchPositions(text: string, query: string): MatchSegment[] {
	const segments: MatchSegment[] = []
	const lower = text.toLowerCase()
	const queryLower = query.toLowerCase()
	const qLen = queryLower.length
	let pos = 0
	while (pos <= lower.length - qLen) {
		const idx = lower.indexOf(queryLower, pos)
		if (idx === -1) break
		segments.push({ start: idx, end: idx + qLen })
		pos = idx + qLen
	}
	return segments
}

// renders text with highlight spans for search matches
function renderHighlightedParts(
	text: string,
	matches: MatchSegment[],
	fg: string | undefined,
	nodeKey: string,
	highlightBg: string,
	highlightFg: string,
): ReactNode {
	const parts: ReactNode[] = []
	let last = 0

	for (const m of matches) {
		if (m.start > last) {
			const plain = text.slice(last, m.start)
			if (fg != null) {
				parts.push(
					<span key={`${nodeKey}-p${String(last)}`} fg={fg}>
						{plain}
					</span>,
				)
			} else {
				parts.push(plain)
			}
		}
		parts.push(
			<span key={`${nodeKey}-h${String(m.start)}`} bg={highlightBg} fg={highlightFg}>
				{text.slice(m.start, m.end)}
			</span>,
		)
		last = m.end
	}

	if (last < text.length) {
		const tail = text.slice(last)
		if (fg != null) {
			parts.push(
				<span key={`${nodeKey}-p${String(last)}`} fg={fg}>
					{tail}
				</span>,
			)
		} else {
			parts.push(tail)
		}
	}

	return <>{parts}</>
}

// renders text with search highlights baked in. called as a plain function during
// IR-to-JSX traversal — NOT as a React component. this ensures highlights are part
// of the static JSX tree rather than deferred to React reconciliation.
export function renderSearchText(text: string, fg: string | undefined, nodeKey: string): ReactNode {
	const { query, highlightBg, highlightFg } = getSearchState()
	if (query == null || query.length === 0 || highlightBg == null || highlightFg == null) {
		if (fg != null) return <span fg={fg}>{text}</span>
		return text as unknown as ReactNode
	}

	const matches = findMatchPositions(text, query)
	if (matches.length === 0) {
		if (fg != null) return <span fg={fg}>{text}</span>
		return text as unknown as ReactNode
	}

	return renderHighlightedParts(text, matches, fg, nodeKey, highlightBg, highlightFg)
}
