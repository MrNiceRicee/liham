// search key handler — routes keys based on search kind.
// input kind: text editing + confirm/cancel. active kind: n/N navigation.

import type { KeyEvent } from '@opentui/core'

import type { AppAction } from '../../app/state.ts'
import type { SearchState } from '../../app/state-search.ts'
import { handleTextInputKey } from './text-input-keys.ts'

// returns true if key was consumed
export function handleSearchKey(
	key: KeyEvent,
	searchState: SearchState,
	dispatch: (action: AppAction) => void,
	matchCount: number,
): boolean {
	if (searchState.kind === 'input') {
		handleSearchInputKey(key, searchState, dispatch, matchCount)
		// input kind swallows all keys — never pass through
		return true
	}
	return handleSearchActiveKey(key, dispatch)
}

function handleSearchInputKey(
	key: KeyEvent,
	searchState: SearchState & { kind: 'input' },
	dispatch: (action: AppAction) => void,
	matchCount: number,
): void {
	if (key.name === 'escape') {
		dispatch({ type: 'SearchClose' })
		return
	}
	if (key.name === 'return') {
		dispatch({ type: 'SearchConfirm', matchCount })
		return
	}

	const result = handleTextInputKey(key, searchState.query, searchState.cursor)
	if (
		result.consumed &&
		(result.newText !== searchState.query || result.cursor !== searchState.cursor)
	) {
		dispatch({ type: 'SearchUpdate', query: result.newText, cursor: result.cursor })
	}
}

function handleSearchActiveKey(key: KeyEvent, dispatch: (action: AppAction) => void): boolean {
	switch (key.name) {
		case 'n':
			if (key.shift) dispatch({ type: 'SearchPrev' })
			else dispatch({ type: 'SearchNext' })
			return true
		case '/':
			dispatch({ type: 'SearchClose' })
			dispatch({ type: 'SearchOpen' })
			return true
		case 'escape':
			dispatch({ type: 'SearchClose' })
			return true
		default:
			// active kind: pass through for scroll keys, q, etc.
			return false
	}
}
