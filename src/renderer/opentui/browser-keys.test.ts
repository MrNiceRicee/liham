import { describe, expect, test } from 'bun:test'
import type { KeyEvent } from '@opentui/core'

import { type AppAction, initialState } from '../../app/state.ts'
import { browserKeyHandler } from './browser-keys.ts'

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

describe('browserKeyHandler', () => {
	for (const { label, key, expected } of [
		{ label: 'g', key: makeKey('g'), expected: 'g' },
		{ label: 'G', key: makeKey('g', { shift: true, sequence: 'G' }), expected: 'g' },
		{ label: 'j', key: makeKey('j'), expected: 'j' },
		{ label: 'k', key: makeKey('k'), expected: 'k' },
	] as const) {
		test(`types ${label} into the filter instead of triggering navigation`, () => {
			const state = initialState('preview-only', 'browser')
			const actions: AppAction[] = []
			const dispatch = (action: AppAction) => actions.push(action)

			browserKeyHandler(
				key,
				state,
				dispatch,
				[],
				() => undefined,
				{ destroy() {} } as never,
				{ current: null } as never,
			)

			expect(actions).toEqual([{ type: 'FilterUpdate', text: expected, cursor: 1 }])
		})
	}
})
