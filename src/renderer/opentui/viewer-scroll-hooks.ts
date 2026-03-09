// viewer scroll hooks — search highlight scroll-to-match and TOC jump-to-heading.
// TOC uses findDescendantById for exact element positions in the preview pane.
// search uses character-offset fraction for both panes.

import type { ScrollBoxRenderable } from '@opentui/core'
import { useEffect, useMemo } from 'react'

import type { AppAction, AppState } from '../../app/state.ts'
import { findMatches } from '../../search/find.ts'
import { scrollToLine } from './scroll-utils.ts'
import type { TocEntry } from './toc.ts'

// scroll a scrollbox to a fraction (0..1) of its total content height
function scrollToFraction(ref: ScrollBoxRenderable | null, fraction: number): void {
	if (ref == null) return
	ref.scrollTo(Math.round(fraction * ref.scrollHeight))
}

// scroll a scrollbox so that a descendant element with the given id is at the top.
// uses the actual rendered position from OpenTUI's layout engine — no estimation.
function scrollToDescendant(scrollbox: ScrollBoxRenderable, id: string): boolean {
	const element = scrollbox.content.findDescendantById(id)
	if (element == null) return false
	// element.y is absolute screen position (includes scroll translateY offset).
	// content-relative position = element.y - viewport.y + scrollTop
	const position = element.y - scrollbox.viewport.y + scrollbox.scrollTop
	scrollbox.scrollTo(Math.max(0, position))
	return true
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
		if (state.searchState?.phase !== 'active') return
		if (searchMatches.length === 0) return
		const match = searchMatches[safeSearchIndex]
		if (match == null) return
		// character fraction for both panes — best available for search
		const fraction = raw.length > 0 ? match.charOffset / raw.length : 0
		scrollToFraction(sourceRef.current, fraction)
		scrollToFraction(previewRef.current, fraction)
	}, [safeSearchIndex, state.searchState?.phase])

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
		if (previewRef.current != null) {
			scrollToDescendant(previewRef.current, `toc-h-${String(cursorIndex)}`)
		}
		// source: scroll to the heading's source line
		if (entry.sourceLine != null) {
			scrollToLine(sourceRef.current, entry.sourceLine)
		}
		dispatch({ type: 'TocJumpComplete' })
	}, [state.tocState?.kind])
}
