import { describe, expect, test } from 'bun:test'
import type { CliRenderer, KeyEvent, ScrollBoxRenderable } from '@opentui/core'

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
	for (const [key, expected] of [
		['g', 'g'],
		['G', 'G'],
		['j', 'j'],
		['k', 'k'],
	] as const) {
		test(`types ${key} into the filter instead of triggering navigation`, () => {
			const state = initialState('preview-only', 'browser')
			const actions: AppAction[] = []
			const dispatch = (action: AppAction) => actions.push(action)

			browserKeyHandler(
				makeKey(key, { shift: key === 'G' }),
				state,
				dispatch,
				[],
				() => undefined,
				undefined as unknown as CliRenderer,
				{ current: null } as unknown as React.RefObject<ScrollBoxRenderable | null>,
			)

			expect(actions).toEqual([{ type: 'FilterUpdate', text: expected, cursor: 1 }])
		})
	}
})
