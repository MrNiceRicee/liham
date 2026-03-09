import { describe, expect, test } from 'bun:test'

import { type AppState, appReducer, initialState, legendEntries } from './state.ts'

function stateWith(overrides: Partial<AppState>): AppState {
	return { ...initialState(), ...overrides }
}

describe('TOC state machine', () => {
	test('ToggleToc opens with cursor at 0', () => {
		const s = stateWith({})
		const next = appReducer(s, { type: 'ToggleToc' })
		expect(next.tocState).toEqual({ kind: 'open', cursorIndex: 0 })
	})

	test('ToggleToc closes when open', () => {
		const s = stateWith({ tocState: { kind: 'open', cursorIndex: 3 } })
		const next = appReducer(s, { type: 'ToggleToc' })
		expect(next.tocState).toBeNull()
	})

	test('ToggleToc resets cursor to 0 on open', () => {
		const s = stateWith({})
		const next = appReducer(s, { type: 'ToggleToc' })
		expect(next.tocState).toEqual({ kind: 'open', cursorIndex: 0 })
	})

	test('SetTocCursor updates cursor index', () => {
		const s = stateWith({ tocState: { kind: 'open', cursorIndex: 0 } })
		const next = appReducer(s, { type: 'SetTocCursor', index: 5 })
		expect(next.tocState).toEqual({ kind: 'open', cursorIndex: 5 })
	})

	test('SetTocCursor no-op when closed', () => {
		const s = stateWith({})
		const next = appReducer(s, { type: 'SetTocCursor', index: 5 })
		expect(next).toBe(s)
	})

	test('TocJump transitions to jumping kind', () => {
		const s = stateWith({ tocState: { kind: 'open', cursorIndex: 2 } })
		const next = appReducer(s, { type: 'TocJump' })
		expect(next.tocState).toEqual({ kind: 'jumping', cursorIndex: 2 })
	})

	test('TocJump no-op when closed', () => {
		const s = stateWith({})
		const next = appReducer(s, { type: 'TocJump' })
		expect(next).toBe(s)
	})

	test('TocJumpComplete clears tocState to null', () => {
		const s = stateWith({ tocState: { kind: 'jumping', cursorIndex: 2 } })
		const next = appReducer(s, { type: 'TocJumpComplete' })
		expect(next.tocState).toBeNull()
	})

	test('CloseToc clears tocState to null', () => {
		const s = stateWith({ tocState: { kind: 'open', cursorIndex: 3 } })
		const next = appReducer(s, { type: 'CloseToc' })
		expect(next.tocState).toBeNull()
	})

	test('ReturnToBrowser clears tocState', () => {
		const s = stateWith({
			fromBrowser: true,
			tocState: { kind: 'open', cursorIndex: 1 },
		})
		const next = appReducer(s, { type: 'ReturnToBrowser' })
		expect(next.tocState).toBeNull()
	})

	test('OpenFile clears tocState', () => {
		const s = stateWith({ tocState: { kind: 'open', cursorIndex: 1 } })
		const next = appReducer(s, { type: 'OpenFile', path: '/home/user/test.md' })
		expect(next.tocState).toBeNull()
	})
})

describe('TOC legend entries', () => {
	test('TOC open shows TOC legend', () => {
		const s = stateWith({ tocState: { kind: 'open', cursorIndex: 0 } })
		const entries = legendEntries(s)
		expect(entries.some((e) => e.key === 'j/k' && e.label === 'navigate')).toBe(true)
		expect(entries.some((e) => e.key === 'Enter' && e.label === 'jump')).toBe(true)
		expect(entries.some((e) => e.key === 'Esc' && e.label === 'close')).toBe(true)
	})

	test('normal viewer shows t TOC in nav legend', () => {
		const s = stateWith({})
		const entries = legendEntries(s)
		expect(entries.some((e) => e.key === 't' && e.label === 'TOC')).toBe(true)
	})
})
