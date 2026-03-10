// viewer key dispatch — routes keys through search > toc > modal > viewer layers.

import type { CliRenderer, KeyEvent } from '@opentui/core'

import { activeLayer } from '../../app/active-layer.ts'
import type { AppAction, AppState } from '../../app/state.ts'
import { handleFloatingPanelKey } from './floating-panel.tsx'
import { clearImageCache } from './image.tsx'
import { handleSearchKey } from './search-keys.ts'
import { handleModalKey, handleViewerKey } from './viewer-keys.ts'

function dispatchTocKey(
	key: KeyEvent,
	state: AppState,
	dispatch: (action: AppAction) => void,
	tocEntryCount: number,
): boolean {
	if (state.tocState?.kind !== 'open') return false
	if (key.name === '/' && state.searchState == null) {
		dispatch({ type: 'SearchOpen' })
		return true
	}
	const result = handleFloatingPanelKey(key, tocEntryCount, state.tocState.cursorIndex)
	if (!result.consumed) return false
	if (result.newCursor != null) dispatch({ type: 'SetTocCursor', index: result.newCursor })
	if (result.action === 'select') dispatch({ type: 'TocJump' })
	if (result.action === 'close') dispatch({ type: 'CloseToc' })
	return true
}

export function dispatchViewerKey(
	key: KeyEvent,
	state: AppState,
	dispatch: (action: AppAction) => void,
	mediaCount: number,
	onAction: (action: AppAction) => void,
	videoDuration: number,
	videoElapsed: number,
	searchMatchCount: number,
	tocEntryCount: number,
	renderer?: CliRenderer | null,
): void {
	const layer = activeLayer(state)

	// search — input swallows all, active passes through scroll keys
	if (layer === 'searchInput' || layer === 'searchActive') {
		if (handleSearchKey(key, state.searchState!, dispatch, searchMatchCount)) return
	}

	// toc — owns j/k/Enter/Esc/g/G, passes / through to activate search
	if (layer === 'toc' && dispatchTocKey(key, state, dispatch, tocEntryCount)) return

	// guard: ToggleToc no-op when no headings or modal open
	if (key.name === 't' && layer === 'viewer' && tocEntryCount === 0) return

	const action =
		layer === 'modal'
			? handleModalKey(key, state, dispatch, mediaCount, videoDuration, videoElapsed)
			: handleViewerKey(key, state, dispatch, mediaCount, renderer)
	if (action == null) return
	if (action.type === 'ReturnToBrowser') clearImageCache()
	onAction(action)
}
