// TOC sub-reducer — extracted from state.ts for file size and complexity.

import type { AppAction, AppState } from './state.ts'

// null = closed. discriminated union eliminates invalid {tocOpen: false, tocCursorIndex: 3}
export type TocState =
	| { kind: 'open'; cursorIndex: number }
	| { kind: 'jumping'; cursorIndex: number }

export type TocAction = Extract<
	AppAction,
	{
		type: 'ToggleToc' | 'SetTocCursor' | 'TocJump' | 'TocJumpComplete' | 'CloseToc'
	}
>

export function tocReducer(state: AppState, action: TocAction): AppState {
	switch (action.type) {
		case 'ToggleToc':
			if (state.tocState == null) {
				return { ...state, tocState: { kind: 'open', cursorIndex: 0 } }
			}
			return { ...state, tocState: null }

		case 'SetTocCursor':
			if (state.tocState == null) return state
			return { ...state, tocState: { kind: 'open', cursorIndex: action.index } }

		case 'TocJump':
			if (state.tocState == null) return state
			return {
				...state,
				tocState: { kind: 'jumping', cursorIndex: state.tocState.cursorIndex },
			}

		case 'TocJumpComplete':
			return { ...state, tocState: null }

		case 'CloseToc':
			return { ...state, tocState: null }
	}
}
