import { describe, expect, test } from 'bun:test'

import type { KeyEvent } from '@opentui/core'

import { type AppState, initialState } from '../../app/state.ts'

import { handleViewerKey, VIEWER_KEY_MAP } from './viewer-keys.ts'

const OPEN_MODAL = {
	kind: 'modal' as const,
	index: 0,
	mediaIndex: 0,
	galleryHidden: false,
	paused: false,
	restartCount: 0,
	seekOffset: 0,
}

function stateWith(overrides: Partial<AppState>): AppState {
	return { ...initialState(), ...overrides }
}

function makeKey(name: string, overrides?: Partial<KeyEvent>): KeyEvent {
	return { name, sequence: name, shift: false, ctrl: false, meta: false, ...overrides } as KeyEvent
}

describe('y key (CopySelection)', () => {
	test('y returns CopySelection action from VIEWER_KEY_MAP', () => {
		const mapper = VIEWER_KEY_MAP['y']
		expect(mapper).toBeDefined()
		const action = mapper!(makeKey('y'), initialState(), 0)
		expect(action).toEqual({ type: 'CopySelection' })
	})

	test('y returns null when in media focus mode (blocked by MEDIA_FOCUS_ALLOWED)', () => {
		const s = stateWith({ media: { kind: 'focused', index: 0 } })
		const dispatch = () => {}
		const action = handleViewerKey(makeKey('y'), s, dispatch, 1)
		expect(action).toBeNull()
	})
})

describe('ctrl+y / ctrl+e (line scroll)', () => {
	test('ctrl+y returns lineUp scroll action', () => {
		const mapper = VIEWER_KEY_MAP['y']
		expect(mapper).toBeDefined()
		const action = mapper!(makeKey('y', { ctrl: true }), initialState(), 0)
		expect(action).toEqual({ type: 'Scroll', direction: 'lineUp' })
	})

	test('plain y returns CopySelection (not lineUp)', () => {
		const mapper = VIEWER_KEY_MAP['y']
		const action = mapper!(makeKey('y'), initialState(), 0)
		expect(action).toEqual({ type: 'CopySelection' })
	})

	test('ctrl+e returns lineDown scroll action', () => {
		const mapper = VIEWER_KEY_MAP['e']
		expect(mapper).toBeDefined()
		const action = mapper!(makeKey('e', { ctrl: true }), initialState(), 0)
		expect(action).toEqual({ type: 'Scroll', direction: 'lineDown' })
	})

	test('plain e returns null', () => {
		const mapper = VIEWER_KEY_MAP['e']
		const action = mapper!(makeKey('e'), initialState(), 0)
		expect(action).toBeNull()
	})
})

describe('escape selection priority', () => {
	test('esc clears selection before checking modal/focus/browser/quit', () => {
		const s = stateWith({ fromBrowser: true })
		const dispatch = () => {}

		let cleared = false
		const mockRenderer = {
			get hasSelection() {
				return true
			},
			clearSelection() {
				cleared = true
			},
		} as unknown as Parameters<typeof handleViewerKey>[4]

		const action = handleViewerKey(makeKey('escape'), s, dispatch, 0, mockRenderer)
		expect(action).toBeNull()
		expect(cleared).toBe(true)
	})

	test('esc falls through to modal when no selection', () => {
		const s = stateWith({ media: { ...OPEN_MODAL } })
		const dispatched: string[] = []
		const dispatch = (a: { type: string }) => dispatched.push(a.type)

		const mockRenderer = {
			get hasSelection() {
				return false
			},
			clearSelection() {},
		} as unknown as Parameters<typeof handleViewerKey>[4]

		const action = handleViewerKey(makeKey('escape'), s, dispatch as never, 0, mockRenderer)
		expect(action).toBeNull()
		expect(dispatched).toContain('CloseMediaModal')
	})

	test('esc returns ReturnToBrowser when no selection and no modal', () => {
		const s = stateWith({ fromBrowser: true })
		const dispatch = () => {}

		const mockRenderer = {
			get hasSelection() {
				return false
			},
			clearSelection() {},
		} as unknown as Parameters<typeof handleViewerKey>[4]

		const action = handleViewerKey(makeKey('escape'), s, dispatch, 0, mockRenderer)
		expect(action).toEqual({ type: 'ReturnToBrowser' })
	})

	test('esc without renderer falls through normally', () => {
		const s = stateWith({ fromBrowser: true })
		const dispatch = () => {}
		const action = handleViewerKey(makeKey('escape'), s, dispatch, 0)
		expect(action).toEqual({ type: 'ReturnToBrowser' })
	})
})
