import { describe, expect, test } from 'bun:test'

import type { FileEntry } from '../browser/scanner.ts'
import {
	type AppState,
	type LayoutMode,
	appReducer,
	initialState,
	isSplitLayout,
	legendEntries,
	paneDimensions,
} from './state.ts'

// -- helpers --

function stateWith(overrides: Partial<AppState>): AppState {
	return { ...initialState(), ...overrides }
}

function mockFile(name: string, dir = ''): FileEntry {
	const relativePath = dir ? `${dir}/${name}` : name
	return { name, relativePath, absolutePath: `/root/${relativePath}`, directory: dir }
}

// -- initialState --

describe('initialState', () => {
	test('defaults to preview-only layout and viewer mode', () => {
		const s = initialState()
		expect(s.layout).toBe('preview-only')
		expect(s.focus).toBe('preview')
		expect(s.mode).toBe('viewer')
		expect(s.legendPage).toBe('nav')
		expect(s.scrollSync).toBe(true)
		expect(s.scrollPercent).toEqual({ source: 0, preview: 0 })
		expect(s.fromBrowser).toBe(false)
	})

	test('accepts layout parameter', () => {
		const s = initialState('side')
		expect(s.layout).toBe('side')
		expect(s.focus).toBe('preview')
	})

	test('accepts mode parameter', () => {
		const s = initialState('preview-only', 'browser')
		expect(s.mode).toBe('browser')
		expect(s.browser.scanStatus).toBe('scanning')
		expect(s.browser.files).toEqual([])
		expect(s.browser.filter).toBe('')
	})

	test('auto-focuses source in source-only layout', () => {
		const s = initialState('source-only')
		expect(s.focus).toBe('source')
	})

	test('auto-focuses preview in preview-only layout', () => {
		const s = initialState('preview-only')
		expect(s.focus).toBe('preview')
	})
})

// -- isSplitLayout --

describe('isSplitLayout', () => {
	test('side is split', () => expect(isSplitLayout('side')).toBe(true))
	test('top is split', () => expect(isSplitLayout('top')).toBe(true))
	test('preview-only is not split', () => expect(isSplitLayout('preview-only')).toBe(false))
	test('source-only is not split', () => expect(isSplitLayout('source-only')).toBe(false))
})

// -- Resize --

describe('Resize action', () => {
	test('updates dimensions', () => {
		const s = stateWith({ dimensions: { width: 80, height: 24 } })
		const next = appReducer(s, { type: 'Resize', width: 120, height: 40 })
		expect(next.dimensions).toEqual({ width: 120, height: 40 })
	})

	test('returns same reference when dimensions unchanged', () => {
		const s = stateWith({ dimensions: { width: 80, height: 24 } })
		const next = appReducer(s, { type: 'Resize', width: 80, height: 24 })
		expect(next).toBe(s)
	})
})

// -- FocusPane --

describe('FocusPane action', () => {
	test('switches focus in split layout', () => {
		const s = stateWith({ layout: 'side', focus: 'preview' })
		const next = appReducer(s, { type: 'FocusPane', target: 'source' })
		expect(next.focus).toBe('source')
	})

	test('is no-op in preview-only mode', () => {
		const s = stateWith({ layout: 'preview-only', focus: 'preview' })
		const next = appReducer(s, { type: 'FocusPane', target: 'source' })
		expect(next).toBe(s)
	})

	test('is no-op in source-only mode', () => {
		const s = stateWith({ layout: 'source-only', focus: 'source' })
		const next = appReducer(s, { type: 'FocusPane', target: 'preview' })
		expect(next).toBe(s)
	})

	test('returns same reference when already focused', () => {
		const s = stateWith({ layout: 'side', focus: 'source' })
		const next = appReducer(s, { type: 'FocusPane', target: 'source' })
		expect(next).toBe(s)
	})
})

// -- ToggleSync --

describe('ToggleSync action', () => {
	test('toggles sync on → off', () => {
		const s = stateWith({ scrollSync: true })
		const next = appReducer(s, { type: 'ToggleSync' })
		expect(next.scrollSync).toBe(false)
	})

	test('toggles sync off → on', () => {
		const s = stateWith({ scrollSync: false })
		const next = appReducer(s, { type: 'ToggleSync' })
		expect(next.scrollSync).toBe(true)
	})
})

// -- CycleLegend --

describe('CycleLegend action', () => {
	test('cycles nav → scroll → off → nav', () => {
		let s = stateWith({ legendPage: 'nav' })
		s = appReducer(s, { type: 'CycleLegend' })
		expect(s.legendPage).toBe('scroll')
		s = appReducer(s, { type: 'CycleLegend' })
		expect(s.legendPage).toBe('off')
		s = appReducer(s, { type: 'CycleLegend' })
		expect(s.legendPage).toBe('nav')
	})
})

// -- CycleLayout --

describe('CycleLayout action', () => {
	test('cycles through all layouts in order', () => {
		const cycle: LayoutMode[] = ['preview-only', 'side', 'top', 'source-only']
		let s = initialState()

		for (let i = 0; i < cycle.length; i++) {
			expect(s.layout).toBe(cycle[i])
			s = appReducer(s, { type: 'CycleLayout' })
		}
		// wraps back to preview-only
		expect(s.layout).toBe('preview-only')
	})

	test('auto-focuses preview in preview-only', () => {
		const s = stateWith({ layout: 'source-only', focus: 'source' })
		const next = appReducer(s, { type: 'CycleLayout' }) // source-only → preview-only
		expect(next.layout).toBe('preview-only')
		expect(next.focus).toBe('preview')
	})

	test('auto-focuses source in source-only', () => {
		const s = stateWith({ layout: 'top', focus: 'preview' })
		const next = appReducer(s, { type: 'CycleLayout' }) // top → source-only
		expect(next.layout).toBe('source-only')
		expect(next.focus).toBe('source')
	})

	test('preserves focus in split layouts', () => {
		const s = stateWith({ layout: 'preview-only', focus: 'preview' })
		const next = appReducer(s, { type: 'CycleLayout' }) // preview-only → side
		expect(next.layout).toBe('side')
		expect(next.focus).toBe('preview')
	})
})

// -- Scroll --

describe('Scroll action', () => {
	test('returns same state reference (scroll handled imperatively)', () => {
		const s = initialState()
		const next = appReducer(s, { type: 'Scroll', direction: 'down' })
		expect(next).toBe(s)
	})
})

// -- Quit --

describe('Quit action', () => {
	test('returns same state reference (quit handled imperatively)', () => {
		const s = initialState()
		const next = appReducer(s, { type: 'Quit' })
		expect(next).toBe(s)
	})
})

// -- legendEntries --

describe('legendEntries', () => {
	test('preview-only shows basic entries', () => {
		const s = stateWith({ layout: 'preview-only' })
		const entries = legendEntries(s)
		const keys = entries.map((e) => e.key)
		expect(keys).toContain('?')
		expect(keys).toContain('l')
		expect(keys).toContain('q')
		expect(keys).not.toContain('Tab')
		expect(keys).not.toContain('s')
	})

	test('split layout shows tab and sync entries', () => {
		const s = stateWith({ layout: 'side', focus: 'preview', scrollSync: false })
		const entries = legendEntries(s)
		const keys = entries.map((e) => e.key)
		expect(keys).toContain('Tab')
		expect(keys).toContain('s')
	})

	test('tab label shows opposite pane name', () => {
		const s = stateWith({ layout: 'side', focus: 'preview' })
		const entries = legendEntries(s)
		const tab = entries.find((e) => e.key === 'Tab')
		expect(tab?.label).toBe('source')
	})

	test('sync label reflects sync state', () => {
		const on = stateWith({ layout: 'side', scrollSync: true })
		const off = stateWith({ layout: 'side', scrollSync: false })
		const onEntry = legendEntries(on).find((e) => e.key === 's')
		const offEntry = legendEntries(off).find((e) => e.key === 's')
		expect(onEntry?.label).toBe('sync on')
		expect(offEntry?.label).toBe('sync off')
	})

	test('off page shows only ? help', () => {
		const s = stateWith({ legendPage: 'off' })
		const entries = legendEntries(s)
		expect(entries).toEqual([{ key: '?', label: 'help' }])
	})

	test('scroll page shows vim scroll shortcuts', () => {
		const s = stateWith({ legendPage: 'scroll' })
		const entries = legendEntries(s)
		const keys = entries.map((e) => e.key)
		expect(keys).toContain('j/k')
		expect(keys).toContain('g/G')
		expect(keys).toContain('pgup/pgdn')
		expect(keys).toContain('ctrl+d/u')
		expect(keys).toContain('?')
	})

	test('nav page shows ? as more', () => {
		const s = stateWith({ legendPage: 'nav' })
		const entries = legendEntries(s)
		const q = entries.find((e) => e.key === '?')
		expect(q?.label).toBe('more')
	})
})

// -- paneDimensions --

describe('paneDimensions', () => {
	test('preview-only: preview gets full area, no source', () => {
		const p = paneDimensions('preview-only', 80, 24)
		expect(p.preview).toEqual({ width: 80, height: 22 })
		expect(p.source).toBeUndefined()
	})

	test('source-only: source gets full area, no preview', () => {
		const p = paneDimensions('source-only', 80, 24)
		expect(p.source).toEqual({ width: 80, height: 22 })
		expect(p.preview).toBeUndefined()
	})

	test('side: both panes get half width', () => {
		const p = paneDimensions('side', 80, 24)
		expect(p.source).toEqual({ width: 40, height: 22 })
		expect(p.preview).toEqual({ width: 40, height: 22 })
	})

	test('side: odd width gives extra pixel to preview', () => {
		const p = paneDimensions('side', 81, 24)
		expect(p.source!.width).toBe(40)
		expect(p.preview!.width).toBe(41)
	})

	test('top: both panes get half height', () => {
		const p = paneDimensions('top', 80, 24)
		expect(p.source).toEqual({ width: 80, height: 11 })
		expect(p.preview).toEqual({ width: 80, height: 11 })
	})

	test('top: odd content height gives extra pixel to preview', () => {
		const p = paneDimensions('top', 80, 25)
		// content = 25 - 2 = 23, half = 11, other = 12
		expect(p.source!.height).toBe(11)
		expect(p.preview!.height).toBe(12)
	})

	test('side: small terminal falls back to single-pane', () => {
		const p = paneDimensions('side', 18, 24)
		// 18/2 = 9 < MIN_PANE_WIDTH(10), falls back
		expect(p.preview).toBeDefined()
		expect(p.source).toBeUndefined()
	})

	test('top: small terminal falls back to single-pane', () => {
		const p = paneDimensions('top', 80, 10)
		// content = 10-2 = 8, half = 4 < MIN_PANE_HEIGHT(5), falls back
		expect(p.preview).toBeDefined()
		expect(p.source).toBeUndefined()
	})

	test('subtracts status bar height from content area', () => {
		const p = paneDimensions('preview-only', 80, 10)
		expect(p.preview!.height).toBe(8) // 10 - 2 status bar
	})
})

// -- mouse-driven focus (reducer behavior) --

describe('mouse-driven FocusPane', () => {
	test('mouse down in source pane area dispatches FocusPane source', () => {
		const s = stateWith({ layout: 'side', focus: 'preview' })
		const next = appReducer(s, { type: 'FocusPane', target: 'source' })
		expect(next.focus).toBe('source')
	})

	test('mouse down in preview pane area dispatches FocusPane preview', () => {
		const s = stateWith({ layout: 'side', focus: 'source' })
		const next = appReducer(s, { type: 'FocusPane', target: 'preview' })
		expect(next.focus).toBe('preview')
	})

	test('mouse down in single-pane mode is no-op', () => {
		const s = stateWith({ layout: 'preview-only', focus: 'preview' })
		const next = appReducer(s, { type: 'FocusPane', target: 'source' })
		expect(next).toBe(s)
	})

	test('mouse down on already-focused pane is no-op', () => {
		const s = stateWith({ layout: 'side', focus: 'source' })
		const next = appReducer(s, { type: 'FocusPane', target: 'source' })
		expect(next).toBe(s)
	})
})

// -- integration traces --

describe('state machine traces', () => {
	test('layout cycle with focus preservation', () => {
		let s = initialState('side')
		s = appReducer(s, { type: 'FocusPane', target: 'source' })
		expect(s.focus).toBe('source')

		s = appReducer(s, { type: 'CycleLayout' }) // side → top
		expect(s.layout).toBe('top')
		expect(s.focus).toBe('source') // preserved in split

		s = appReducer(s, { type: 'CycleLayout' }) // top → source-only
		expect(s.layout).toBe('source-only')
		expect(s.focus).toBe('source') // auto-focused

		s = appReducer(s, { type: 'CycleLayout' }) // source-only → preview-only
		expect(s.layout).toBe('preview-only')
		expect(s.focus).toBe('preview') // auto-focused

		s = appReducer(s, { type: 'CycleLayout' }) // preview-only → side
		expect(s.layout).toBe('side')
		expect(s.focus).toBe('preview') // preserved from last state
	})

	test('resize followed by scroll returns correct state', () => {
		let s = initialState()
		s = appReducer(s, { type: 'Resize', width: 120, height: 40 })
		expect(s.dimensions).toEqual({ width: 120, height: 40 })

		const scrolled = appReducer(s, { type: 'Scroll', direction: 'down' })
		expect(scrolled).toBe(s) // scroll is imperative, no state change
	})

	test('legend cycles through all three pages back to start', () => {
		let s = initialState()
		expect(s.legendPage).toBe('nav')
		s = appReducer(s, { type: 'CycleLegend' })
		expect(s.legendPage).toBe('scroll')
		s = appReducer(s, { type: 'CycleLegend' })
		expect(s.legendPage).toBe('off')
		s = appReducer(s, { type: 'CycleLegend' })
		expect(s.legendPage).toBe('nav')
	})
})

// -- ScanComplete --

describe('ScanComplete action', () => {
	test('populates files and resets cursor', () => {
		const files = [mockFile('a.md'), mockFile('b.md')]
		const s = stateWith({ mode: 'browser', browser: { ...initialState('preview-only', 'browser').browser, cursorIndex: 5 } })
		const next = appReducer(s, { type: 'ScanComplete', files })
		expect(next.browser.files).toEqual(files)
		expect(next.browser.scanStatus).toBe('complete')
		expect(next.browser.cursorIndex).toBe(0)
	})
})

// -- ScanError --

describe('ScanError action', () => {
	test('sets error state', () => {
		const s = stateWith({ mode: 'browser' })
		const next = appReducer(s, { type: 'ScanError', error: 'permission denied' })
		expect(next.browser.scanStatus).toBe('error')
		expect(next.browser.scanError).toBe('permission denied')
	})
})

// -- FilterUpdate --

describe('FilterUpdate action', () => {
	test('updates filter and resets cursor', () => {
		const s = stateWith({
			mode: 'browser',
			browser: { ...initialState('preview-only', 'browser').browser, cursorIndex: 3 },
		})
		const next = appReducer(s, { type: 'FilterUpdate', text: 'readme' })
		expect(next.browser.filter).toBe('readme')
		expect(next.browser.cursorIndex).toBe(0)
	})

	test('returns same reference when filter unchanged', () => {
		const s = stateWith({
			mode: 'browser',
			browser: { ...initialState('preview-only', 'browser').browser, filter: 'test' },
		})
		const next = appReducer(s, { type: 'FilterUpdate', text: 'test' })
		expect(next).toBe(s)
	})
})

// -- CursorMove --

describe('CursorMove action', () => {
	test('moves cursor down', () => {
		const s = stateWith({ mode: 'browser' })
		const next = appReducer(s, { type: 'CursorMove', direction: 'down', filteredLength: 5 })
		expect(next.browser.cursorIndex).toBe(1)
	})

	test('moves cursor up', () => {
		const s = stateWith({
			mode: 'browser',
			browser: { ...initialState('preview-only', 'browser').browser, cursorIndex: 3 },
		})
		const next = appReducer(s, { type: 'CursorMove', direction: 'up', filteredLength: 5 })
		expect(next.browser.cursorIndex).toBe(2)
	})

	test('clamps at bottom', () => {
		const s = stateWith({
			mode: 'browser',
			browser: { ...initialState('preview-only', 'browser').browser, cursorIndex: 4 },
		})
		const next = appReducer(s, { type: 'CursorMove', direction: 'down', filteredLength: 5 })
		expect(next).toBe(s) // already at last item
	})

	test('clamps at top', () => {
		const s = stateWith({ mode: 'browser' })
		const next = appReducer(s, { type: 'CursorMove', direction: 'up', filteredLength: 5 })
		expect(next).toBe(s) // already at 0
	})

	test('jumps to top', () => {
		const s = stateWith({
			mode: 'browser',
			browser: { ...initialState('preview-only', 'browser').browser, cursorIndex: 3 },
		})
		const next = appReducer(s, { type: 'CursorMove', direction: 'top', filteredLength: 5 })
		expect(next.browser.cursorIndex).toBe(0)
	})

	test('jumps to bottom', () => {
		const s = stateWith({ mode: 'browser' })
		const next = appReducer(s, { type: 'CursorMove', direction: 'bottom', filteredLength: 5 })
		expect(next.browser.cursorIndex).toBe(4)
	})

	test('pageDown moves by page size', () => {
		const s = stateWith({ mode: 'browser' })
		const next = appReducer(s, { type: 'CursorMove', direction: 'pageDown', filteredLength: 25 })
		expect(next.browser.cursorIndex).toBe(10) // PAGE_SIZE = 10
	})

	test('pageUp from middle', () => {
		const s = stateWith({
			mode: 'browser',
			browser: { ...initialState('preview-only', 'browser').browser, cursorIndex: 15 },
		})
		const next = appReducer(s, { type: 'CursorMove', direction: 'pageUp', filteredLength: 25 })
		expect(next.browser.cursorIndex).toBe(5)
	})

	test('empty list always returns 0', () => {
		const s = stateWith({ mode: 'browser' })
		const next = appReducer(s, { type: 'CursorMove', direction: 'down', filteredLength: 0 })
		expect(next).toBe(s)
	})
})

// -- OpenFile --

describe('OpenFile action', () => {
	test('transitions to viewer mode', () => {
		const s = stateWith({ mode: 'browser' })
		const next = appReducer(s, { type: 'OpenFile', path: '/test/file.md' })
		expect(next.mode).toBe('viewer')
		expect(next.currentFile).toBe('/test/file.md')
		expect(next.fromBrowser).toBe(true)
	})

	test('preserves browser state', () => {
		const files = [mockFile('a.md')]
		const s = stateWith({
			mode: 'browser',
			browser: { ...initialState('preview-only', 'browser').browser, files, filter: 'a', cursorIndex: 0, scanStatus: 'complete' },
		})
		const next = appReducer(s, { type: 'OpenFile', path: '/test/a.md' })
		expect(next.browser.files).toEqual(files)
		expect(next.browser.filter).toBe('a')
	})
})

// -- ReturnToBrowser --

describe('ReturnToBrowser action', () => {
	test('transitions back to browser mode', () => {
		const s = stateWith({ mode: 'viewer', fromBrowser: true, currentFile: '/test/file.md' })
		const next = appReducer(s, { type: 'ReturnToBrowser' })
		expect(next.mode).toBe('browser')
		expect(next.currentFile).toBeUndefined()
	})

	test('is no-op when not from browser', () => {
		const s = stateWith({ mode: 'viewer', fromBrowser: false })
		const next = appReducer(s, { type: 'ReturnToBrowser' })
		expect(next).toBe(s)
	})

	test('preserves browser filter and cursor', () => {
		const s = stateWith({
			mode: 'viewer',
			fromBrowser: true,
			browser: { ...initialState('preview-only', 'browser').browser, filter: 'docs', cursorIndex: 2, scanStatus: 'complete' },
		})
		const next = appReducer(s, { type: 'ReturnToBrowser' })
		expect(next.browser.filter).toBe('docs')
		expect(next.browser.cursorIndex).toBe(2)
	})
})

// -- CycleLayout in browser mode --

describe('CycleLayout in browser mode', () => {
	test('is no-op', () => {
		const s = stateWith({ mode: 'browser', layout: 'side' })
		const next = appReducer(s, { type: 'CycleLayout' })
		expect(next).toBe(s)
	})
})

// -- paneDimensions in browser mode --

describe('paneDimensions browser mode', () => {
	test('preview-only shows browser full width', () => {
		const p = paneDimensions('preview-only', 80, 24, 'browser')
		expect(p.browser).toEqual({ width: 80, height: 22 })
		expect(p.preview).toBeUndefined()
		expect(p.source).toBeUndefined()
	})

	test('source-only shows browser full width', () => {
		const p = paneDimensions('source-only', 80, 24, 'browser')
		expect(p.browser).toEqual({ width: 80, height: 22 })
	})

	test('side splits browser and preview', () => {
		const p = paneDimensions('side', 80, 24, 'browser')
		expect(p.browser).toEqual({ width: 40, height: 22 })
		expect(p.preview).toEqual({ width: 40, height: 22 })
	})

	test('top splits browser and preview', () => {
		const p = paneDimensions('top', 80, 24, 'browser')
		expect(p.browser).toEqual({ width: 80, height: 11 })
		expect(p.preview).toEqual({ width: 80, height: 11 })
	})

	test('narrow terminal falls back to browser only', () => {
		const p = paneDimensions('side', 30, 24, 'browser')
		// 30/2 = 15 < MIN_BROWSER_WIDTH(20)
		expect(p.browser).toBeDefined()
		expect(p.preview).toBeUndefined()
	})
})

// -- legendEntries browser mode --

describe('legendEntries browser mode', () => {
	test('browser nav shows navigate/open/quit/filter', () => {
		const s = stateWith({ mode: 'browser', legendPage: 'nav' })
		const entries = legendEntries(s)
		const keys = entries.map((e) => e.key)
		expect(keys).toContain('enter')
		expect(keys).toContain('esc')
		expect(keys).toContain('type')
	})

	test('browser off shows only ? help', () => {
		const s = stateWith({ mode: 'browser', legendPage: 'off' })
		const entries = legendEntries(s)
		expect(entries).toEqual([{ key: '?', label: 'help' }])
	})
})

// -- legendEntries viewer with fromBrowser --

describe('legendEntries viewer from browser', () => {
	test('shows esc back when fromBrowser', () => {
		const s = stateWith({ mode: 'viewer', fromBrowser: true })
		const entries = legendEntries(s)
		const keys = entries.map((e) => e.key)
		expect(keys).toContain('esc')
		const esc = entries.find((e) => e.key === 'esc')
		expect(esc?.label).toBe('back')
	})

	test('does not show esc back when not fromBrowser', () => {
		const s = stateWith({ mode: 'viewer', fromBrowser: false })
		const entries = legendEntries(s)
		const keys = entries.map((e) => e.key)
		expect(keys).not.toContain('esc')
	})
})

// -- browser integration traces --

describe('browser state machine traces', () => {
	test('scan → filter → cursor → open → return → filter preserved', () => {
		const files = [mockFile('README.md'), mockFile('api.md', 'docs'), mockFile('guide.md', 'docs')]

		let s = initialState('side', 'browser')
		expect(s.mode).toBe('browser')

		// scan completes
		s = appReducer(s, { type: 'ScanComplete', files })
		expect(s.browser.files.length).toBe(3)

		// filter
		s = appReducer(s, { type: 'FilterUpdate', text: 'guide' })
		expect(s.browser.filter).toBe('guide')

		// cursor down (1 match assumed)
		s = appReducer(s, { type: 'CursorMove', direction: 'down', filteredLength: 1 })
		// already at 0, max is 0, stays at 0
		expect(s.browser.cursorIndex).toBe(0)

		// open file
		s = appReducer(s, { type: 'OpenFile', path: '/root/docs/guide.md' })
		expect(s.mode).toBe('viewer')
		expect(s.fromBrowser).toBe(true)

		// return to browser
		s = appReducer(s, { type: 'ReturnToBrowser' })
		expect(s.mode).toBe('browser')
		expect(s.browser.filter).toBe('guide') // preserved
		expect(s.browser.files.length).toBe(3) // preserved
	})
})
