// search sub-reducer — extracted from state.ts for file size and complexity.

import type { AppAction, AppState } from './state.ts'

// discriminated union — input kind has no match tracking fields
export type SearchState =
	| { kind: 'input'; query: string; cursor: number }
	| { kind: 'active'; query: string; matchCount: number; currentMatch: number }

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
	if (state.searchState?.kind !== 'input') return state
	if (matchCount === 0) return state
	return {
		...state,
		searchState: {
			kind: 'active',
			query: state.searchState.query,
			matchCount,
			currentMatch: 0,
		},
	}
}

function navigateMatch(state: AppState, delta: number): AppState {
	if (state.searchState?.kind !== 'active') return state
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
		case 'SearchOpen': {
			if (state.mode === 'browser') return state
			// auto-show source pane during search so highlights are visible
			const needsLayoutSwitch = state.layout === 'preview-only' || state.layout === 'source-only'
			return {
				...state,
				searchState: { kind: 'input', query: '', cursor: 0 },
				media: { kind: 'none' },
				...(needsLayoutSwitch
					? { preSearchLayout: state.layout, layout: 'side', focus: 'source' as const }
					: { focus: 'source' as const }),
			}
		}

		case 'SearchUpdate': {
			if (state.searchState == null) return state
			const query = action.query.slice(0, 200)
			return { ...state, searchState: { kind: 'input', query, cursor: action.cursor } }
		}

		case 'SearchConfirm':
			return searchConfirm(state, action.matchCount)

		case 'SearchNext':
			return navigateMatch(state, 1)

		case 'SearchPrev':
			return navigateMatch(state, -1)

		case 'SearchClose': {
			// restore pre-search layout if we switched
			const restored = state.preSearchLayout
			const result: AppState = { ...state, searchState: null }
			if (restored != null) {
				result.layout = restored
				delete result.preSearchLayout
				if (restored === 'preview-only') result.focus = 'preview'
			}
			return result
		}
	}
}
