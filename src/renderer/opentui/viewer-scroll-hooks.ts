// viewer scroll hooks — search highlight scroll-to-match and TOC jump-to-heading.
// uses character-offset fraction for scroll position — accounts for line wrapping
// and avoids syncScroll timing issues (scrollTop may not update before microtask).

import type { ScrollBoxRenderable } from '@opentui/core'
import { useEffect, useMemo } from 'react'

import type { AppAction, AppState } from '../../app/state.ts'
import { findMatches } from '../../search/find.ts'
import type { TocEntry } from './toc.ts'

// scroll a scrollbox to a fraction (0..1) of its total content height
function scrollToFraction(ref: ScrollBoxRenderable | null, fraction: number): void {
	if (ref == null) return
	ref.scrollTo(Math.round(fraction * ref.scrollHeight))
}

// compute character offset of a 0-based line number in raw text
function lineToCharOffset(raw: string, targetLine: number): number {
	let line = 0
	for (let i = 0; i < raw.length; i++) {
		if (line === targetLine) return i
		if (raw[i] === '\n') line++
	}
	return raw.length
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
		// character fraction: naturally accounts for line wrapping in both panes
		const fraction = raw.length > 0 ? match.charOffset / raw.length : 0
		scrollToFraction(sourceRef.current, fraction)
		scrollToFraction(previewRef.current, fraction)
	}, [safeSearchIndex, state.searchState?.phase])

	return { searchQuery, searchMatches, safeSearchIndex }
}

export function useTocJump(
	state: AppState,
	tocEntries: readonly TocEntry[],
	estimatedTotalHeight: number,
	raw: string,
	previewRef: React.RefObject<ScrollBoxRenderable | null>,
	sourceRef: React.RefObject<ScrollBoxRenderable | null>,
	dispatch: React.Dispatch<AppAction>,
) {
	useEffect(() => {
		if (state.tocState?.kind !== 'jumping') return
		const entry = tocEntries[state.tocState.cursorIndex]
		if (entry == null) {
			dispatch({ type: 'TocJumpComplete' })
			return
		}
		if (entry.sourceLine != null && raw.length > 0) {
			// character fraction from source line position
			const charOffset = lineToCharOffset(raw, entry.sourceLine)
			const fraction = charOffset / raw.length
			scrollToFraction(sourceRef.current, fraction)
			scrollToFraction(previewRef.current, fraction)
		} else if (previewRef.current != null) {
			// fallback: ratio-based estimation for preview-only without source line
			const fraction = estimatedTotalHeight > 0 ? entry.estimatedOffset / estimatedTotalHeight : 0
			scrollToFraction(previewRef.current, fraction)
		}
		dispatch({ type: 'TocJumpComplete' })
	}, [state.tocState?.kind])
}
