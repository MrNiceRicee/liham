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
		expect(next.mediaModal).toEqual({
			kind: 'open',
			mediaIndex: 1,
			galleryHidden: false,
			paused: false,
			restartCount: 0,
			seekOffset: 0,
		})
	})

	test('OpenMediaModal no-op when no focus', () => {
		const s = stateWith({ mediaFocusIndex: null })
		const next = appReducer(s, { type: 'OpenMediaModal' })
		expect(next).toBe(s)
	})

	test('CloseMediaModal closes open modal, preserves focus', () => {
		const s = stateWith({
			mediaFocusIndex: 1,
			mediaModal: {
				kind: 'open',
				mediaIndex: 1,
				galleryHidden: false,
				paused: false,
				restartCount: 0,
				seekOffset: 0,
			},
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
			mediaModal: {
				kind: 'open',
				mediaIndex: 0,
				galleryHidden: false,
				paused: false,
				restartCount: 0,
				seekOffset: 0,
			},
		})
		const next = appReducer(s, { type: 'TogglePlayPause' })
		expect(next.mediaModal).toEqual({
			kind: 'open',
			mediaIndex: 0,
			galleryHidden: false,
			paused: true,
			restartCount: 0,
			seekOffset: 0,
		})
	})

	test('TogglePlayPause resumes when paused', () => {
		const s = stateWith({
			mediaFocusIndex: 0,
			mediaModal: {
				kind: 'open',
				mediaIndex: 0,
				galleryHidden: false,
				paused: true,
				restartCount: 0,
				seekOffset: 0,
			},
		})
		const next = appReducer(s, { type: 'TogglePlayPause' })
		expect(next.mediaModal).toEqual({
			kind: 'open',
			mediaIndex: 0,
			galleryHidden: false,
			paused: false,
			restartCount: 0,
			seekOffset: 0,
		})
	})

	test('TogglePlayPause no-op when modal closed', () => {
		const s = stateWith({})
		const next = appReducer(s, { type: 'TogglePlayPause' })
		expect(next).toBe(s)
	})

	test('ReplayMedia increments restartCount', () => {
		const s = stateWith({
			mediaFocusIndex: 0,
			mediaModal: {
				kind: 'open',
				mediaIndex: 0,
				galleryHidden: false,
				paused: false,
				restartCount: 0,
				seekOffset: 0,
			},
		})
		const next = appReducer(s, { type: 'ReplayMedia' })
		expect(next.mediaModal).toEqual({
			kind: 'open',
			mediaIndex: 0,
			galleryHidden: false,
			paused: false,
			restartCount: 1,
			seekOffset: 0,
		})
	})

	test('ReplayMedia resets paused to false', () => {
		const s = stateWith({
			mediaFocusIndex: 0,
			mediaModal: {
				kind: 'open',
				mediaIndex: 0,
				galleryHidden: false,
				paused: true,
				restartCount: 2,
				seekOffset: 10,
			},
		})
		const next = appReducer(s, { type: 'ReplayMedia' })
		expect(next.mediaModal).toEqual({
			kind: 'open',
			mediaIndex: 0,
			galleryHidden: false,
			paused: false,
			restartCount: 3,
			seekOffset: 0,
		})
	})

	test('ReplayMedia no-op when modal closed', () => {
		const s = stateWith({})
		const next = appReducer(s, { type: 'ReplayMedia' })
		expect(next).toBe(s)
	})
})

describe('media legend entries', () => {
	test('modal open shows modal legend with pause', () => {
		const s = stateWith({
			mediaFocusIndex: 0,
			mediaModal: {
				kind: 'open',
				mediaIndex: 0,
				galleryHidden: false,
				paused: false,
				restartCount: 0,
				seekOffset: 0,
			},
		})
		const entries = legendEntries(s)
		expect(entries.some((e) => e.key === 'esc' && e.label === 'close')).toBe(true)
		expect(entries.some((e) => e.key === 'n/N')).toBe(true)
		expect(entries.some((e) => e.key === 'g' && e.label === 'gallery')).toBe(true)
		expect(entries.some((e) => e.key === 'space' && e.label === 'pause')).toBe(true)
		expect(entries.some((e) => e.key === 'r' && e.label === 'replay')).toBe(true)
	})

	test('modal paused shows play in legend', () => {
		const s = stateWith({
			mediaFocusIndex: 0,
			mediaModal: {
				kind: 'open',
				mediaIndex: 0,
				galleryHidden: false,
				paused: true,
				restartCount: 0,
				seekOffset: 0,
			},
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

describe('seekOffset state', () => {
	test('OpenMediaModal sets seekOffset to 0', () => {
		const s = stateWith({ mediaFocusIndex: 0 })
		const next = appReducer(s, { type: 'OpenMediaModal' })
		expect(next.mediaModal.kind).toBe('open')
		if (next.mediaModal.kind === 'open') {
			expect(next.mediaModal.seekOffset).toBe(0)
		}
	})

	test('ReplayMedia resets seekOffset to 0', () => {
		const s = stateWith({
			mediaFocusIndex: 0,
			mediaModal: {
				kind: 'open',
				mediaIndex: 0,
				galleryHidden: false,
				paused: false,
				restartCount: 1,
				seekOffset: 30,
			},
		})
		const next = appReducer(s, { type: 'ReplayMedia' })
		if (next.mediaModal.kind === 'open') {
			expect(next.mediaModal.seekOffset).toBe(0)
		}
	})
})

describe('SeekMedia action', () => {
	const openModal = (seekOffset = 0): AppState =>
		stateWith({
			mediaFocusIndex: 0,
			mediaModal: {
				kind: 'open',
				mediaIndex: 0,
				galleryHidden: false,
				paused: false,
				restartCount: 0,
				seekOffset,
			},
		})

	test('SeekMedia advances seekOffset by delta', () => {
		const s = openModal(10)
		const next = appReducer(s, { type: 'SeekMedia', delta: 5, duration: 60, elapsed: 10 })
		if (next.mediaModal.kind === 'open') {
			expect(next.mediaModal.seekOffset).toBe(15)
		}
	})

	test('SeekMedia retreats seekOffset by negative delta', () => {
		const s = openModal(10)
		const next = appReducer(s, { type: 'SeekMedia', delta: -5, duration: 60, elapsed: 10 })
		if (next.mediaModal.kind === 'open') {
			expect(next.mediaModal.seekOffset).toBe(5)
		}
	})

	test('SeekMedia clamps to 0 at lower bound', () => {
		const s = openModal(3)
		const next = appReducer(s, { type: 'SeekMedia', delta: -10, duration: 60, elapsed: 3 })
		if (next.mediaModal.kind === 'open') {
			expect(next.mediaModal.seekOffset).toBe(0)
		}
	})

	test('SeekMedia clamps to duration at upper bound', () => {
		const s = openModal(55)
		const next = appReducer(s, { type: 'SeekMedia', delta: 10, duration: 60, elapsed: 55 })
		if (next.mediaModal.kind === 'open') {
			expect(next.mediaModal.seekOffset).toBe(60)
		}
	})

	test('SeekMedia backward at zero replays from beginning', () => {
		const s = openModal(0)
		const next = appReducer(s, { type: 'SeekMedia', delta: -5, duration: 60, elapsed: 0 })
		expect(next).not.toBe(s)
		if (next.mediaModal.kind === 'open') {
			expect(next.mediaModal.seekOffset).toBe(0)
			expect(next.mediaModal.restartCount).toBe(
				s.mediaModal.kind === 'open' ? s.mediaModal.restartCount + 1 : 1,
			)
		}
	})

	test('SeekMedia at upper boundary is no-op', () => {
		const s = openModal(60)
		const next = appReducer(s, { type: 'SeekMedia', delta: 5, duration: 60, elapsed: 60 })
		expect(next).toBe(s)
	})

	test('SeekMedia increments restartCount', () => {
		const s = openModal(10)
		const next = appReducer(s, { type: 'SeekMedia', delta: 5, duration: 60, elapsed: 10 })
		if (next.mediaModal.kind === 'open') {
			expect(next.mediaModal.restartCount).toBe(1)
		}
	})

	test('SeekMedia preserves paused state', () => {
		const s = stateWith({
			mediaFocusIndex: 0,
			mediaModal: {
				kind: 'open',
				mediaIndex: 0,
				galleryHidden: false,
				paused: true,
				restartCount: 0,
				seekOffset: 10,
			},
		})
		const next = appReducer(s, { type: 'SeekMedia', delta: 5, duration: 60, elapsed: 10 })
		if (next.mediaModal.kind === 'open') {
			expect(next.mediaModal.paused).toBe(true)
		}
	})

	test('SeekMedia no-op when modal closed', () => {
		const s = stateWith({})
		const next = appReducer(s, { type: 'SeekMedia', delta: 5, duration: 60, elapsed: 10 })
		expect(next).toBe(s)
	})
})

describe('modal legend with seek', () => {
	test('legend shows seek entry for open modal', () => {
		const s = stateWith({
			mediaFocusIndex: 0,
			mediaModal: {
				kind: 'open',
				mediaIndex: 0,
				galleryHidden: false,
				paused: false,
				restartCount: 0,
				seekOffset: 0,
			},
		})
		const entries = legendEntries(s)
		expect(entries.some((e) => e.key === '</>' && e.label === 'seek')).toBe(true)
	})
})

describe('selection actions', () => {
	test('CopySelection is a passthrough in appReducer (state unchanged)', () => {
		const s = stateWith({})
		const next = appReducer(s, { type: 'CopySelection' })
		expect(next).toBe(s)
	})

	test('legend includes y: copy entry on nav page', () => {
		const s = stateWith({})
		const entries = legendEntries(s)
		expect(entries.some((e) => e.key === 'y' && e.label === 'copy')).toBe(true)
	})

	test('legend does not show y: copy in media focus mode', () => {
		const s = stateWith({ mediaFocusIndex: 0 })
		const entries = legendEntries(s)
		expect(entries.some((e) => e.key === 'y')).toBe(false)
	})

	test('legend does not show y: copy in modal mode', () => {
		const s = stateWith({
			mediaFocusIndex: 0,
			mediaModal: {
				kind: 'open',
				mediaIndex: 0,
				galleryHidden: false,
				paused: false,
				restartCount: 0,
				seekOffset: 0,
			},
		})
		const entries = legendEntries(s)
		expect(entries.some((e) => e.key === 'y')).toBe(false)
	})
})
