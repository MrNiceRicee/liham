import { describe, expect, test } from 'bun:test'

import { type AppState, appReducer, initialState, legendEntries } from './state.ts'

function stateWith(overrides: Partial<AppState>): AppState {
	return { ...initialState(), ...overrides }
}

describe('media focus actions', () => {
	test('initialState has null focus and closed modal', () => {
		const s = initialState()
		expect(s.mediaFocusIndex).toBeNull()
		expect(s.mediaModal).toEqual({ kind: 'closed' })
	})

	test('FocusNextMedia from null starts at 0', () => {
		const s = stateWith({})
		const next = appReducer(s, { type: 'FocusNextMedia', mediaCount: 3 })
		expect(next.mediaFocusIndex).toBe(0)
	})

	test('FocusNextMedia wraps at boundary', () => {
		const s = stateWith({ mediaFocusIndex: 2 })
		const next = appReducer(s, { type: 'FocusNextMedia', mediaCount: 3 })
		expect(next.mediaFocusIndex).toBe(0)
	})

	test('FocusNextMedia advances by 1', () => {
		const s = stateWith({ mediaFocusIndex: 0 })
		const next = appReducer(s, { type: 'FocusNextMedia', mediaCount: 3 })
		expect(next.mediaFocusIndex).toBe(1)
	})

	test('FocusNextMedia no-op with 0 media', () => {
		const s = stateWith({ mediaFocusIndex: null })
		const next = appReducer(s, { type: 'FocusNextMedia', mediaCount: 0 })
		expect(next).toBe(s)
	})

	test('FocusPrevMedia from null starts at last', () => {
		const s = stateWith({})
		const next = appReducer(s, { type: 'FocusPrevMedia', mediaCount: 3 })
		expect(next.mediaFocusIndex).toBe(2)
	})

	test('FocusPrevMedia wraps from 0 to last', () => {
		const s = stateWith({ mediaFocusIndex: 0 })
		const next = appReducer(s, { type: 'FocusPrevMedia', mediaCount: 3 })
		expect(next.mediaFocusIndex).toBe(2)
	})

	test('FocusPrevMedia goes back by 1', () => {
		const s = stateWith({ mediaFocusIndex: 2 })
		const next = appReducer(s, { type: 'FocusPrevMedia', mediaCount: 3 })
		expect(next.mediaFocusIndex).toBe(1)
	})

	test('FocusPrevMedia no-op with 0 media', () => {
		const s = stateWith({})
		const next = appReducer(s, { type: 'FocusPrevMedia', mediaCount: 0 })
		expect(next).toBe(s)
	})

	test('single media node — FocusNextMedia stays on 0', () => {
		const s = stateWith({ mediaFocusIndex: 0 })
		const next = appReducer(s, { type: 'FocusNextMedia', mediaCount: 1 })
		expect(next.mediaFocusIndex).toBe(0)
	})

	test('single media node — FocusPrevMedia stays on 0', () => {
		const s = stateWith({ mediaFocusIndex: 0 })
		const next = appReducer(s, { type: 'FocusPrevMedia', mediaCount: 1 })
		expect(next.mediaFocusIndex).toBe(0)
	})

	test('FocusMedia sets specific index', () => {
		const s = stateWith({})
		const next = appReducer(s, { type: 'FocusMedia', index: 2 })
		expect(next.mediaFocusIndex).toBe(2)
	})
})

describe('media modal actions', () => {
	test('OpenMediaModal opens modal at focused index', () => {
		const s = stateWith({ mediaFocusIndex: 1 })
		const next = appReducer(s, { type: 'OpenMediaModal' })
		expect(next.mediaModal).toEqual({ kind: 'open', mediaIndex: 1, galleryHidden: false, paused: false })
	})

	test('OpenMediaModal no-op when no focus', () => {
		const s = stateWith({ mediaFocusIndex: null })
		const next = appReducer(s, { type: 'OpenMediaModal' })
		expect(next).toBe(s)
	})

	test('CloseMediaModal closes open modal, preserves focus', () => {
		const s = stateWith({
			mediaFocusIndex: 1,
			mediaModal: { kind: 'open', mediaIndex: 1, galleryHidden: false, paused: false },
		})
		const next = appReducer(s, { type: 'CloseMediaModal' })
		expect(next.mediaModal).toEqual({ kind: 'closed' })
		expect(next.mediaFocusIndex).toBe(1)
	})

	test('CloseMediaModal clears focus when modal already closed', () => {
		const s = stateWith({ mediaFocusIndex: 2 })
		const next = appReducer(s, { type: 'CloseMediaModal' })
		expect(next.mediaFocusIndex).toBeNull()
		expect(next.mediaModal).toEqual({ kind: 'closed' })
	})

	test('CloseMediaModal no-op when closed and no focus', () => {
		const s = stateWith({})
		const next = appReducer(s, { type: 'CloseMediaModal' })
		expect(next).toBe(s)
	})

	test('TogglePlayPause pauses when playing', () => {
		const s = stateWith({
			mediaFocusIndex: 0,
			mediaModal: { kind: 'open', mediaIndex: 0, galleryHidden: false, paused: false },
		})
		const next = appReducer(s, { type: 'TogglePlayPause' })
		expect(next.mediaModal).toEqual({ kind: 'open', mediaIndex: 0, galleryHidden: false, paused: true })
	})

	test('TogglePlayPause resumes when paused', () => {
		const s = stateWith({
			mediaFocusIndex: 0,
			mediaModal: { kind: 'open', mediaIndex: 0, galleryHidden: false, paused: true },
		})
		const next = appReducer(s, { type: 'TogglePlayPause' })
		expect(next.mediaModal).toEqual({ kind: 'open', mediaIndex: 0, galleryHidden: false, paused: false })
	})

	test('TogglePlayPause no-op when modal closed', () => {
		const s = stateWith({})
		const next = appReducer(s, { type: 'TogglePlayPause' })
		expect(next).toBe(s)
	})
})

describe('media legend entries', () => {
	test('modal open shows modal legend with pause', () => {
		const s = stateWith({
			mediaFocusIndex: 0,
			mediaModal: { kind: 'open', mediaIndex: 0, galleryHidden: false, paused: false },
		})
		const entries = legendEntries(s)
		expect(entries.some((e) => e.key === 'esc' && e.label === 'close')).toBe(true)
		expect(entries.some((e) => e.key === 'n/N')).toBe(true)
		expect(entries.some((e) => e.key === 'g' && e.label === 'gallery')).toBe(true)
		expect(entries.some((e) => e.key === 'space' && e.label === 'pause')).toBe(true)
	})

	test('modal paused shows play in legend', () => {
		const s = stateWith({
			mediaFocusIndex: 0,
			mediaModal: { kind: 'open', mediaIndex: 0, galleryHidden: false, paused: true },
		})
		const entries = legendEntries(s)
		expect(entries.some((e) => e.key === 'space' && e.label === 'play')).toBe(true)
	})

	test('media focused shows focus legend', () => {
		const s = stateWith({ mediaFocusIndex: 0 })
		const entries = legendEntries(s)
		expect(entries.some((e) => e.key === 'enter' && e.label === 'view')).toBe(true)
		expect(entries.some((e) => e.key === 'esc' && e.label === 'unfocus')).toBe(true)
		expect(entries.some((e) => e.key === 'n/N')).toBe(true)
	})

	test('no media focus shows normal legend', () => {
		const s = stateWith({})
		const entries = legendEntries(s)
		expect(entries.some((e) => e.key === 'q' && e.label === 'quit')).toBe(true)
		expect(entries.some((e) => e.key === 'n/N')).toBe(false)
	})
})
