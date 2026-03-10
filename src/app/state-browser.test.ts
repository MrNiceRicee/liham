import { describe, expect, test } from 'bun:test'

import type { FileEntry } from '../browser/scanner.ts'

import { type AppState, appReducer, initialState, legendEntries, paneDimensions } from './state.ts'

// -- helpers --

function stateWith(overrides: Partial<AppState>): AppState {
	return { ...initialState(), ...overrides }
}

function mockFile(name: string, dir = ''): FileEntry {
	const relativePath = dir ? `${dir}/${name}` : name
	return { name, relativePath, absolutePath: `/root/${relativePath}`, directory: dir }
}

// -- ScanComplete --

describe('ScanComplete action', () => {
	test('populates files and resets cursor', () => {
		const files = [mockFile('a.md'), mockFile('b.md')]
		const s = stateWith({
			mode: 'browser',
			browser: { ...initialState('preview-only', 'browser').browser, cursorIndex: 5 },
		})
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
		const next = appReducer(s, { type: 'FilterUpdate', text: 'readme', cursor: 6 })
		expect(next.browser.filter).toBe('readme')
		expect(next.browser.inputCursor).toBe(6)
		expect(next.browser.cursorIndex).toBe(0)
	})

	test('returns same reference when filter and cursor unchanged', () => {
		const s = stateWith({
			mode: 'browser',
			browser: {
				...initialState('preview-only', 'browser').browser,
				filter: 'test',
				inputCursor: 4,
			},
		})
		const next = appReducer(s, { type: 'FilterUpdate', text: 'test', cursor: 4 })
		expect(next).toBe(s)
	})

	test('cursor-only change does not reset cursorIndex', () => {
		const s = stateWith({
			mode: 'browser',
			browser: {
				...initialState('preview-only', 'browser').browser,
				filter: 'test',
				inputCursor: 4,
				cursorIndex: 2,
			},
		})
		const next = appReducer(s, { type: 'FilterUpdate', text: 'test', cursor: 2 })
		expect(next.browser.inputCursor).toBe(2)
		expect(next.browser.cursorIndex).toBe(2) // preserved — text didn't change
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
			browser: {
				...initialState('preview-only', 'browser').browser,
				files,
				filter: 'a',
				cursorIndex: 0,
				scanStatus: 'complete',
			},
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
			browser: {
				...initialState('preview-only', 'browser').browser,
				filter: 'docs',
				cursorIndex: 2,
				scanStatus: 'complete',
			},
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
		s = appReducer(s, { type: 'FilterUpdate', text: 'guide', cursor: 5 })
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
