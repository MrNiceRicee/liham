import { describe, expect, test } from 'bun:test'
import type { KeyEvent } from '@opentui/core'

import { type AppAction, initialState } from '../../app/state.ts'
import { handleSearchKey } from './search-keys.ts'

function makeKey(name: string, overrides?: Partial<KeyEvent>): KeyEvent {
	return {
		name,
		sequence: name,
		shift: false,
		ctrl: false,
		meta: false,
		option: false,
		preventDefault() {},
		...overrides,
	} as KeyEvent
}

describe('handleSearchKey', () => {
	for (const [key, expected] of [
		['g', 'g'],
		['G', 'G'],
		['j', 'j'],
		['k', 'k'],
	] as const) {
		test(`types ${key} in search input instead of triggering hotkeys`, () => {
			const state = initialState('side', 'viewer')
			const searchState = { kind: 'input', query: '', cursor: 0 } as const
			const actions: AppAction[] = []
			const dispatch = (action: AppAction) => actions.push(action)

			handleSearchKey(makeKey(key, { shift: key === 'G' }), searchState, dispatch, 0)

			expect(actions).toEqual([{ type: 'SearchUpdate', query: expected, cursor: 1 }])
			expect(state.mode).toBe('viewer')
		})
	}
})
