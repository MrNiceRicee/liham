// viewer scroll hooks — search highlight scroll-to-match and TOC jump-to-heading.

import type { ScrollBoxRenderable } from '@opentui/core'
import { useEffect, useMemo } from 'react'

import type { AppAction, AppState } from '../../app/state.ts'
import { findMatches } from '../../search/find.ts'
import { scrollToLine } from './scroll-utils.ts'
import type { TocEntry } from './toc.ts'
import { syncScroll } from './viewer-keys.ts'

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
		// scroll source precisely (1 line = 1 row), then sync preview proportionally
		scrollToLine(sourceRef.current, match.line)
		if (previewRef.current != null && sourceRef.current != null) {
			queueMicrotask(() => syncScroll(sourceRef.current, previewRef.current))
		} else if (previewRef.current != null) {
			// preview-only: fraction-based fallback
			const totalLines = raw.split('\n').length
			const fraction = totalLines > 0 ? match.line / totalLines : 0
			previewRef.current.scrollTo(Math.round(fraction * previewRef.current.scrollHeight))
		}
	}, [safeSearchIndex, state.searchState?.phase])

	return { searchQuery, searchMatches, safeSearchIndex }
}

export function useTocJump(
	state: AppState,
	tocEntries: readonly TocEntry[],
	estimatedTotalHeight: number,
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
		// scroll source precisely if we have a source line, then sync preview from source
		if (entry.sourceLine != null && sourceRef.current != null) {
			scrollToLine(sourceRef.current, entry.sourceLine)
			if (previewRef.current != null) {
				queueMicrotask(() => syncScroll(sourceRef.current, previewRef.current))
			}
		} else if (previewRef.current != null) {
			// preview-only fallback: ratio-based estimation
			const fraction = estimatedTotalHeight > 0 ? entry.estimatedOffset / estimatedTotalHeight : 0
			previewRef.current.scrollTo(Math.round(fraction * previewRef.current.scrollHeight))
		}
		dispatch({ type: 'TocJumpComplete' })
	}, [state.tocState?.kind])
}
