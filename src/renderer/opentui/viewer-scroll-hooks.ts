// viewer scroll hooks — search highlight scroll-to-match and TOC jump-to-heading.
// both search and TOC use findDescendantById for exact element positions via src-line-* ids.

import type { ScrollBoxRenderable } from '@opentui/core'
import { useEffect, useMemo } from 'react'

import type { AppAction, AppState } from '../../app/state.ts'
import { findMatches } from '../../search/find.ts'
import { scrollToLine } from './scroll-utils.ts'
import type { TocEntry } from './toc.ts'

// scroll a scrollbox so that a descendant element with the given id is centered vertically.
// uses the actual rendered position from OpenTUI's layout engine — no estimation.
function scrollToDescendant(scrollbox: ScrollBoxRenderable, id: string): boolean {
	const element = scrollbox.content.findDescendantById(id)
	if (element == null) return false
	// element.y is absolute screen position (includes scroll translateY offset).
	// content-relative position = element.y - viewport.y + scrollTop
	const position = element.y - scrollbox.viewport.y + scrollbox.scrollTop
	// center the element in the viewport
	const centered = position - Math.floor(scrollbox.viewport.height / 2)
	scrollbox.scrollTo(Math.max(0, centered))
	return true
}

// walk backward from the match line to find the nearest block with a src-line-* id.
// handles matches inside multi-line blocks (code blocks, lists, blockquotes).
const MAX_LINE_SEARCH = 100

function scrollToNearestBlock(scrollbox: ScrollBoxRenderable | null, line: number): void {
	if (scrollbox == null) return
	for (let l = line; l >= 0 && line - l < MAX_LINE_SEARCH; l--) {
		const id = `src-line-${String(l)}`
		const element = scrollbox.content.findDescendantById(id)
		if (element == null) continue
		// offset within the block: match on line 55 of a block starting at line 40 → 15 rows down
		const lineOffset = line - l
		const position = element.y - scrollbox.viewport.y + scrollbox.scrollTop + lineOffset
		const centered = position - Math.floor(scrollbox.viewport.height / 2)
		scrollbox.scrollTo(Math.max(0, centered))
		return
	}
}

export function useSearchHighlight(
	state: AppState,
	raw: string,
	sourceRef: React.RefObject<ScrollBoxRenderable | null>,
	previewRef: React.RefObject<ScrollBoxRenderable | null>,
) {
	const searchQuery = state.searchState != null ? state.searchState.query : ''
	const searchMatches = useMemo(() => findMatches(raw, searchQuery), [raw, searchQuery])

	const safeSearchIndex = useMemo(() => {
		if (state.searchState?.phase !== 'active') return 0
		if (searchMatches.length === 0) return 0
		return Math.min(state.searchState.currentMatch, searchMatches.length - 1)
	}, [state.searchState, searchMatches.length])

	useEffect(() => {
		if (state.searchState == null) return
		if (searchMatches.length === 0) return
		const match = searchMatches[safeSearchIndex]
		if (match == null) return
		// source: exact line-based scroll (1 line = 1 row)
		scrollToLine(sourceRef.current, match.line)
		// preview: find nearest block element by walking src-line-* ids backward
		scrollToNearestBlock(previewRef.current, match.line)
	}, [safeSearchIndex, searchMatches, state.searchState?.phase])

	return { searchQuery, searchMatches, safeSearchIndex }
}

export function useTocJump(
	state: AppState,
	tocEntries: readonly TocEntry[],
	previewRef: React.RefObject<ScrollBoxRenderable | null>,
	sourceRef: React.RefObject<ScrollBoxRenderable | null>,
	dispatch: React.Dispatch<AppAction>,
) {
	useEffect(() => {
		if (state.tocState?.kind !== 'jumping') return
		const cursorIndex = state.tocState.cursorIndex
		const entry = tocEntries[cursorIndex]
		if (entry == null) {
			dispatch({ type: 'TocJumpComplete' })
			return
		}
		// preview: use actual element position from the rendered layout tree
		if (previewRef.current != null && entry.sourceLine != null) {
			scrollToDescendant(previewRef.current, `src-line-${String(entry.sourceLine)}`)
		}
		// source: scroll to the heading's source line
		if (entry.sourceLine != null) {
			scrollToLine(sourceRef.current, entry.sourceLine)
		}
		dispatch({ type: 'TocJumpComplete' })
	}, [state.tocState?.kind])
}
