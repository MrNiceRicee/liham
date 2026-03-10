// active layer — single source of truth for the 7-level overlay priority.

import type { AppState } from './state.ts'

export type ActiveLayer =
	| 'browser'
	| 'searchInput'
	| 'searchActive'
	| 'toc'
	| 'modal'
	| 'mediaFocus'
	| 'viewer'

// key priority: browser > search-input > search-active > toc > modal > media-focus > viewer
export function activeLayer(state: AppState): ActiveLayer {
	if (state.mode === 'browser') return 'browser'
	if (state.searchState?.phase === 'input') return 'searchInput'
	if (state.searchState?.phase === 'active') return 'searchActive'
	if (state.tocState != null) return 'toc'
	if (state.mediaModal.kind !== 'closed') return 'modal'
	if (state.mediaFocusIndex != null) return 'mediaFocus'
	return 'viewer'
}
