import { describe, expect, test } from 'bun:test'
import type { KeyEvent } from '@opentui/core'

import { type AppAction } from '../../app/state.ts'
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
	for (const { label, key, expected } of [
		{ label: 'g', key: makeKey('g'), expected: 'g' },
		{ label: 'G', key: makeKey('g', { shift: true, sequence: 'G' }), expected: 'g' },
		{ label: 'j', key: makeKey('j'), expected: 'j' },
		{ label: 'k', key: makeKey('k'), expected: 'k' },
	] as const) {
		test(`types ${label} in search input instead of triggering hotkeys`, () => {
			const searchState = { kind: 'input', query: '', cursor: 0 } as const
			const actions: AppAction[] = []
			const dispatch = (action: AppAction) => actions.push(action)

			handleSearchKey(key, searchState, dispatch, 0)

			expect(actions).toEqual([{ type: 'SearchUpdate', query: expected, cursor: 1 }])
		})
	}
})
