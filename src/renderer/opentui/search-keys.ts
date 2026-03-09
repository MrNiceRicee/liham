// search key handler — routes keys based on search phase.
// input phase: text editing + confirm/cancel. active phase: n/N navigation.

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
	if (searchState.phase === 'input') {
		return handleSearchInputKey(key, searchState, dispatch, matchCount)
	}
	return handleSearchActiveKey(key, dispatch)
}

function handleSearchInputKey(
	key: KeyEvent,
	searchState: SearchState & { phase: 'input' },
	dispatch: (action: AppAction) => void,
	matchCount: number,
): boolean {
	if (key.name === 'escape') {
		dispatch({ type: 'SearchClose' })
		return true
	}
	if (key.name === 'return') {
		dispatch({ type: 'SearchConfirm', matchCount })
		return true
	}

	const result = handleTextInputKey(key, searchState.query)
	if (result.consumed) {
		if (result.newText !== searchState.query) {
			dispatch({ type: 'SearchUpdate', query: result.newText })
		}
		return true
	}

	// input phase swallows ALL other keys
	return true
}

function handleSearchActiveKey(
	key: KeyEvent,
	dispatch: (action: AppAction) => void,
): boolean {
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
			// active phase: pass through for scroll keys, q, etc.
			return false
	}
}
