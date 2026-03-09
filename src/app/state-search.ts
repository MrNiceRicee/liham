// search sub-reducer — extracted from state.ts for file size and complexity.

import type { AppAction, AppState } from './state.ts'

// discriminated union — input phase has no match tracking fields
export type SearchState =
	| { phase: 'input'; query: string }
	| { phase: 'active'; query: string; matchCount: number; currentMatch: number }

export type SearchAction = Extract<
	AppAction,
	{
		type:
			| 'SearchOpen'
			| 'SearchUpdate'
			| 'SearchConfirm'
			| 'SearchNext'
			| 'SearchPrev'
			| 'SearchClose'
	}
>

function searchConfirm(state: AppState, matchCount: number): AppState {
	if (state.searchState?.phase !== 'input') return state
	if (matchCount === 0) return state
	return {
		...state,
		searchState: {
			phase: 'active',
			query: state.searchState.query,
			matchCount,
			currentMatch: 0,
		},
	}
}

function navigateMatch(state: AppState, delta: number): AppState {
	if (state.searchState?.phase !== 'active') return state
	const { matchCount, currentMatch } = state.searchState
	if (matchCount === 0) return state
	return {
		...state,
		searchState: {
			...state.searchState,
			currentMatch: (currentMatch + delta + matchCount) % matchCount,
		},
	}
}

export function searchReducer(state: AppState, action: SearchAction): AppState {
	switch (action.type) {
		case 'SearchOpen':
			if (state.mode === 'browser') return state
			return { ...state, searchState: { phase: 'input', query: '' }, mediaFocusIndex: null }

		case 'SearchUpdate': {
			if (state.searchState == null) return state
			const query = action.query.slice(0, 200)
			return { ...state, searchState: { phase: 'input', query } }
		}

		case 'SearchConfirm':
			return searchConfirm(state, action.matchCount)

		case 'SearchNext':
			return navigateMatch(state, 1)

		case 'SearchPrev':
			return navigateMatch(state, -1)

		case 'SearchClose':
			return { ...state, searchState: null }
	}
}
