// viewer key dispatch — routes keys through search > toc > modal > viewer layers.

import type { CliRenderer, KeyEvent } from '@opentui/core'

import type { AppAction, AppState } from '../../app/state.ts'
import { handleFloatingPanelKey } from './floating-panel.tsx'
import { clearImageCache } from './image.tsx'
import type { MediaEntry } from './index.tsx'
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

function tryAudioIntercept(
	key: KeyEvent,
	state: AppState,
	mediaNodes: MediaEntry[],
	onAudioPlay: (entry: MediaEntry) => void,
): boolean {
	if (key.name !== 'return' || state.mediaFocusIndex == null) return false
	const entry = mediaNodes[state.mediaFocusIndex]
	if (entry?.node.type !== 'audio') return false
	onAudioPlay(entry)
	return true
}

export function dispatchViewerKey(
	key: KeyEvent,
	state: AppState,
	dispatch: (action: AppAction) => void,
	mediaCount: number,
	mediaNodes: MediaEntry[],
	onAudioPlay: (entry: MediaEntry) => void,
	onAction: (action: AppAction) => void,
	videoDuration: number,
	searchMatchCount: number,
	tocEntryCount: number,
	renderer?: CliRenderer | null,
): void {
	// search — input swallows all, active passes through scroll keys
	if (state.searchState != null) {
		if (handleSearchKey(key, state.searchState, dispatch, searchMatchCount)) return
	}

	// toc — owns j/k/Enter/Esc/g/G, passes / through to activate search
	if (dispatchTocKey(key, state, dispatch, tocEntryCount)) return

	// guard: ToggleToc no-op when no headings or modal open
	if (key.name === 't' && state.mediaModal.kind === 'closed' && tocEntryCount === 0) return

	// audio intercept — play directly instead of opening modal
	if (tryAudioIntercept(key, state, mediaNodes, onAudioPlay)) return

	const action =
		state.mediaModal.kind !== 'closed'
			? handleModalKey(key, state, dispatch, mediaCount, videoDuration)
			: handleViewerKey(key, state, dispatch, mediaCount, renderer)
	if (action == null) return
	if (action.type === 'ReturnToBrowser') clearImageCache()
	onAction(action)
}
