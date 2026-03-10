import { describe, expect, test } from 'bun:test'

import { type AppState, appReducer, initialState, legendEntries } from './state.ts'

function stateWith(overrides: Partial<AppState>): AppState {
	return { ...initialState(), ...overrides }
}

const OPEN_MODAL = {
	kind: 'modal' as const,
	index: 0,
	mediaIndex: 0,
	galleryHidden: false,
	paused: false,
	restartCount: 0,
	seekOffset: 0,
}

describe('media focus actions', () => {
	test('initialState has none media', () => {
		const s = initialState()
		expect(s.media).toEqual({ kind: 'none' })
	})

	test('FocusNextMedia from none starts at 0', () => {
		const s = stateWith({})
		const next = appReducer(s, { type: 'FocusNextMedia', mediaCount: 3 })
		expect(next.media).toEqual({ kind: 'focused', index: 0 })
	})

	test('FocusNextMedia wraps at boundary', () => {
		const s = stateWith({ media: { kind: 'focused', index: 2 } })
		const next = appReducer(s, { type: 'FocusNextMedia', mediaCount: 3 })
		expect(next.media).toEqual({ kind: 'focused', index: 0 })
	})

	test('FocusNextMedia advances by 1', () => {
		const s = stateWith({ media: { kind: 'focused', index: 0 } })
		const next = appReducer(s, { type: 'FocusNextMedia', mediaCount: 3 })
		expect(next.media).toEqual({ kind: 'focused', index: 1 })
	})

	test('FocusNextMedia no-op with 0 media', () => {
		const s = stateWith({ media: { kind: 'none' } })
		const next = appReducer(s, { type: 'FocusNextMedia', mediaCount: 0 })
		expect(next).toBe(s)
	})

	test('FocusPrevMedia from none starts at last', () => {
		const s = stateWith({})
		const next = appReducer(s, { type: 'FocusPrevMedia', mediaCount: 3 })
		expect(next.media).toEqual({ kind: 'focused', index: 2 })
	})

	test('FocusPrevMedia wraps from 0 to last', () => {
		const s = stateWith({ media: { kind: 'focused', index: 0 } })
		const next = appReducer(s, { type: 'FocusPrevMedia', mediaCount: 3 })
		expect(next.media).toEqual({ kind: 'focused', index: 2 })
	})

	test('FocusPrevMedia goes back by 1', () => {
		const s = stateWith({ media: { kind: 'focused', index: 2 } })
		const next = appReducer(s, { type: 'FocusPrevMedia', mediaCount: 3 })
		expect(next.media).toEqual({ kind: 'focused', index: 1 })
	})

	test('FocusPrevMedia no-op with 0 media', () => {
		const s = stateWith({})
		const next = appReducer(s, { type: 'FocusPrevMedia', mediaCount: 0 })
		expect(next).toBe(s)
	})

	test('single media node — FocusNextMedia stays on 0', () => {
		const s = stateWith({ media: { kind: 'focused', index: 0 } })
		const next = appReducer(s, { type: 'FocusNextMedia', mediaCount: 1 })
		expect(next.media).toEqual({ kind: 'focused', index: 0 })
	})

	test('single media node — FocusPrevMedia stays on 0', () => {
		const s = stateWith({ media: { kind: 'focused', index: 0 } })
		const next = appReducer(s, { type: 'FocusPrevMedia', mediaCount: 1 })
		expect(next.media).toEqual({ kind: 'focused', index: 0 })
	})

	test('FocusMedia sets specific index', () => {
		const s = stateWith({})
		const next = appReducer(s, { type: 'FocusMedia', index: 2 })
		expect(next.media).toEqual({ kind: 'focused', index: 2 })
	})
})

describe('media modal actions', () => {
	test('OpenMediaModal opens modal at focused index', () => {
		const s = stateWith({ media: { kind: 'focused', index: 1 } })
		const next = appReducer(s, { type: 'OpenMediaModal' })
		expect(next.media).toEqual({ ...OPEN_MODAL, index: 1, mediaIndex: 1 })
	})

	test('OpenMediaModal no-op when no focus', () => {
		const s = stateWith({ media: { kind: 'none' } })
		const next = appReducer(s, { type: 'OpenMediaModal' })
		expect(next).toBe(s)
	})

	test('CloseMediaModal from modal returns to focused', () => {
		const s = stateWith({ media: { ...OPEN_MODAL, index: 1, mediaIndex: 1 } })
		const next = appReducer(s, { type: 'CloseMediaModal' })
		expect(next.media).toEqual({ kind: 'focused', index: 1 })
	})

	test('CloseMediaModal from focused returns to none', () => {
		const s = stateWith({ media: { kind: 'focused', index: 2 } })
		const next = appReducer(s, { type: 'CloseMediaModal' })
		expect(next.media).toEqual({ kind: 'none' })
	})

	test('CloseMediaModal no-op when none', () => {
		const s = stateWith({})
		const next = appReducer(s, { type: 'CloseMediaModal' })
		expect(next).toBe(s)
	})

	test('TogglePlayPause pauses when playing', () => {
		const s = stateWith({ media: { ...OPEN_MODAL } })
		const next = appReducer(s, { type: 'TogglePlayPause' })
		expect(next.media).toEqual({ ...OPEN_MODAL, paused: true })
	})

	test('TogglePlayPause resumes when paused', () => {
		const s = stateWith({ media: { ...OPEN_MODAL, paused: true } })
		const next = appReducer(s, { type: 'TogglePlayPause' })
		expect(next.media).toEqual({ ...OPEN_MODAL, paused: false })
	})

	test('TogglePlayPause no-op when modal closed', () => {
		const s = stateWith({})
		const next = appReducer(s, { type: 'TogglePlayPause' })
		expect(next).toBe(s)
	})

	test('ReplayMedia increments restartCount', () => {
		const s = stateWith({ media: { ...OPEN_MODAL } })
		const next = appReducer(s, { type: 'ReplayMedia' })
		expect(next.media).toEqual({ ...OPEN_MODAL, restartCount: 1 })
	})

	test('ReplayMedia resets paused to false', () => {
		const s = stateWith({ media: { ...OPEN_MODAL, paused: true, restartCount: 2, seekOffset: 10 } })
		const next = appReducer(s, { type: 'ReplayMedia' })
		expect(next.media).toEqual({ ...OPEN_MODAL, restartCount: 3, seekOffset: 0 })
	})

	test('ReplayMedia no-op when modal closed', () => {
		const s = stateWith({})
		const next = appReducer(s, { type: 'ReplayMedia' })
		expect(next).toBe(s)
	})
})

describe('media legend entries', () => {
	test('modal open shows modal legend with pause for video', () => {
		const s = stateWith({ media: { ...OPEN_MODAL } })
		const entries = legendEntries(s, 'video')
		expect(entries.some((e) => e.key === 'esc' && e.label === 'close')).toBe(true)
		expect(entries.some((e) => e.key === 'n/N')).toBe(true)
		expect(entries.some((e) => e.key === 'g' && e.label === 'gallery')).toBe(true)
		expect(entries.some((e) => e.key === 'space' && e.label === 'pause')).toBe(true)
		expect(entries.some((e) => e.key === 'r' && e.label === 'replay')).toBe(true)
	})

	test('modal open shows no playback controls for image', () => {
		const s = stateWith({ media: { ...OPEN_MODAL } })
		const entries = legendEntries(s, 'image')
		expect(entries.some((e) => e.key === 'esc' && e.label === 'close')).toBe(true)
		expect(entries.some((e) => e.key === 'n/N')).toBe(true)
		expect(entries.some((e) => e.key === 'g' && e.label === 'gallery')).toBe(true)
		expect(entries.some((e) => e.key === 'space')).toBe(false)
		expect(entries.some((e) => e.key === '</>')).toBe(false)
		expect(entries.some((e) => e.key === 'r')).toBe(false)
	})

	test('modal paused shows play in legend', () => {
		const s = stateWith({ media: { ...OPEN_MODAL, paused: true } })
		const entries = legendEntries(s, 'video')
		expect(entries.some((e) => e.key === 'space' && e.label === 'play')).toBe(true)
	})

	test('media focused shows focus legend', () => {
		const s = stateWith({ media: { kind: 'focused', index: 0 } })
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
		const s = stateWith({ media: { kind: 'focused', index: 0 } })
		const next = appReducer(s, { type: 'OpenMediaModal' })
		expect(next.media.kind).toBe('modal')
		if (next.media.kind === 'modal') {
			expect(next.media.seekOffset).toBe(0)
		}
	})

	test('ReplayMedia resets seekOffset to 0', () => {
		const s = stateWith({ media: { ...OPEN_MODAL, restartCount: 1, seekOffset: 30 } })
		const next = appReducer(s, { type: 'ReplayMedia' })
		if (next.media.kind === 'modal') {
			expect(next.media.seekOffset).toBe(0)
		}
	})
})

describe('SeekMedia action', () => {
	const openModal = (seekOffset = 0): AppState =>
		stateWith({
			media: { ...OPEN_MODAL, seekOffset },
		})

	test('SeekMedia advances seekOffset by delta', () => {
		const s = openModal(10)
		const next = appReducer(s, { type: 'SeekMedia', delta: 5, duration: 60, elapsed: 10 })
		if (next.media.kind === 'modal') {
			expect(next.media.seekOffset).toBe(15)
		}
	})

	test('SeekMedia retreats seekOffset by negative delta', () => {
		const s = openModal(10)
		const next = appReducer(s, { type: 'SeekMedia', delta: -5, duration: 60, elapsed: 10 })
		if (next.media.kind === 'modal') {
			expect(next.media.seekOffset).toBe(5)
		}
	})

	test('SeekMedia clamps to 0 at lower bound', () => {
		const s = openModal(3)
		const next = appReducer(s, { type: 'SeekMedia', delta: -10, duration: 60, elapsed: 3 })
		if (next.media.kind === 'modal') {
			expect(next.media.seekOffset).toBe(0)
		}
	})

	test('SeekMedia clamps to duration at upper bound', () => {
		const s = openModal(55)
		const next = appReducer(s, { type: 'SeekMedia', delta: 10, duration: 60, elapsed: 55 })
		if (next.media.kind === 'modal') {
			expect(next.media.seekOffset).toBe(60)
		}
	})

	test('SeekMedia backward at zero replays from beginning', () => {
		const s = openModal(0)
		const next = appReducer(s, { type: 'SeekMedia', delta: -5, duration: 60, elapsed: 0 })
		expect(next).not.toBe(s)
		if (next.media.kind === 'modal') {
			expect(next.media.seekOffset).toBe(0)
			expect(next.media.restartCount).toBe(s.media.kind === 'modal' ? s.media.restartCount + 1 : 1)
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
		if (next.media.kind === 'modal') {
			expect(next.media.restartCount).toBe(1)
		}
	})

	test('SeekMedia preserves paused state', () => {
		const s = stateWith({
			media: { ...OPEN_MODAL, paused: true, seekOffset: 10 },
		})
		const next = appReducer(s, { type: 'SeekMedia', delta: 5, duration: 60, elapsed: 10 })
		if (next.media.kind === 'modal') {
			expect(next.media.paused).toBe(true)
		}
	})

	test('SeekMedia no-op when modal closed', () => {
		const s = stateWith({})
		const next = appReducer(s, { type: 'SeekMedia', delta: 5, duration: 60, elapsed: 10 })
		expect(next).toBe(s)
	})
})

describe('modal legend with seek', () => {
	test('legend shows seek entry for open modal with video', () => {
		const s = stateWith({ media: { ...OPEN_MODAL } })
		const entries = legendEntries(s, 'video')
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
		const s = stateWith({ media: { kind: 'focused', index: 0 } })
		const entries = legendEntries(s)
		expect(entries.some((e) => e.key === 'y')).toBe(false)
	})

	test('legend does not show y: copy in modal mode', () => {
		const s = stateWith({ media: { ...OPEN_MODAL } })
		const entries = legendEntries(s)
		expect(entries.some((e) => e.key === 'y')).toBe(false)
	})
})
