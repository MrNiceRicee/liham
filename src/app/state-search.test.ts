import { describe, expect, test } from 'bun:test'

import { type AppState, appReducer, initialState, legendEntries } from './state.ts'

function stateWith(overrides: Partial<AppState>): AppState {
	return { ...initialState(), ...overrides }
}

describe('search state machine', () => {
	test('SearchOpen creates initial search state', () => {
		const s = stateWith({})
		const next = appReducer(s, { type: 'SearchOpen' })
		expect(next.searchState).toEqual({ kind: 'input', query: '', cursor: 0 })
	})

	test('SearchOpen clears media focus', () => {
		const s = stateWith({ media: { kind: 'focused', index: 2 } })
		const next = appReducer(s, { type: 'SearchOpen' })
		expect(next.media).toEqual({ kind: 'none' })
		expect(next.searchState).toEqual({ kind: 'input', query: '', cursor: 0 })
	})

	test('SearchOpen no-op in browser mode', () => {
		const s = stateWith({ mode: 'browser' })
		const next = appReducer(s, { type: 'SearchOpen' })
		expect(next).toBe(s)
	})

	test('SearchUpdate updates query', () => {
		const s = stateWith({ searchState: { kind: 'input', query: 'hel', cursor: 3 } })
		const next = appReducer(s, { type: 'SearchUpdate', query: 'hello', cursor: 5 })
		expect(next.searchState).toEqual({ kind: 'input', query: 'hello', cursor: 5 })
	})

	test('SearchUpdate truncates to 200 chars', () => {
		const s = stateWith({ searchState: { kind: 'input', query: '', cursor: 0 } })
		const next = appReducer(s, { type: 'SearchUpdate', query: 'a'.repeat(250), cursor: 250 })
		if (next.searchState?.kind === 'input') {
			expect(next.searchState.query.length).toBe(200)
		}
	})

	test('SearchConfirm with matches transitions to active', () => {
		const s = stateWith({ searchState: { kind: 'input', query: 'test', cursor: 4 } })
		const next = appReducer(s, { type: 'SearchConfirm', matchCount: 5 })
		expect(next.searchState).toEqual({
			kind: 'active',
			query: 'test',
			matchCount: 5,
			currentMatch: 0,
		})
	})

	test('SearchConfirm with 0 matches stays in input kind', () => {
		const s = stateWith({ searchState: { kind: 'input', query: 'nope', cursor: 4 } })
		const next = appReducer(s, { type: 'SearchConfirm', matchCount: 0 })
		expect(next).toBe(s)
	})

	test('SearchNext wraps at boundary', () => {
		const s = stateWith({
			searchState: { kind: 'active', query: 'test', matchCount: 3, currentMatch: 2 },
		})
		const next = appReducer(s, { type: 'SearchNext' })
		if (next.searchState?.kind === 'active') {
			expect(next.searchState.currentMatch).toBe(0)
		}
	})

	test('SearchNext advances by 1', () => {
		const s = stateWith({
			searchState: { kind: 'active', query: 'test', matchCount: 3, currentMatch: 0 },
		})
		const next = appReducer(s, { type: 'SearchNext' })
		if (next.searchState?.kind === 'active') {
			expect(next.searchState.currentMatch).toBe(1)
		}
	})

	test('SearchPrev wraps from 0 to last', () => {
		const s = stateWith({
			searchState: { kind: 'active', query: 'test', matchCount: 3, currentMatch: 0 },
		})
		const next = appReducer(s, { type: 'SearchPrev' })
		if (next.searchState?.kind === 'active') {
			expect(next.searchState.currentMatch).toBe(2)
		}
	})

	test('SearchClose clears searchState to null', () => {
		const s = stateWith({ searchState: { kind: 'input', query: 'test', cursor: 4 } })
		const next = appReducer(s, { type: 'SearchClose' })
		expect(next.searchState).toBeNull()
	})

	test('ReturnToBrowser clears searchState', () => {
		const s = stateWith({
			fromBrowser: true,
			searchState: { kind: 'active', query: 'test', matchCount: 5, currentMatch: 2 },
		})
		const next = appReducer(s, { type: 'ReturnToBrowser' })
		expect(next.searchState).toBeNull()
	})

	test('OpenFile clears searchState', () => {
		const s = stateWith({
			searchState: { kind: 'active', query: 'test', matchCount: 5, currentMatch: 2 },
		})
		const next = appReducer(s, { type: 'OpenFile', path: '/home/user/test.md' })
		expect(next.searchState).toBeNull()
	})
})

describe('search legend entries', () => {
	test('search input kind shows input legend', () => {
		const s = stateWith({ searchState: { kind: 'input', query: '', cursor: 0 } })
		const entries = legendEntries(s)
		expect(entries.some((e) => e.key === 'Esc' && e.label === 'cancel')).toBe(true)
		expect(entries.some((e) => e.key === 'Enter' && e.label === 'confirm')).toBe(true)
		expect(entries.some((e) => e.key === 'type' && e.label === 'search')).toBe(true)
	})

	test('search active kind shows active legend', () => {
		const s = stateWith({
			searchState: { kind: 'active', query: 'test', matchCount: 5, currentMatch: 0 },
		})
		const entries = legendEntries(s)
		expect(entries.some((e) => e.key === 'n/N' && e.label === 'next/prev')).toBe(true)
		expect(entries.some((e) => e.key === 'Esc' && e.label === 'close')).toBe(true)
	})

	test('normal viewer shows / search in nav legend', () => {
		const s = stateWith({})
		const entries = legendEntries(s)
		expect(entries.some((e) => e.key === '/' && e.label === 'search')).toBe(true)
	})
})
