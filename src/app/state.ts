// app state machine — pure reducer for all app-level state transitions.

import type { FileEntry } from '../browser/scanner.ts'

export type LayoutMode = 'preview-only' | 'side' | 'top' | 'source-only'

export type FocusTarget = 'source' | 'preview'

export type AppMode = 'browser' | 'viewer'

export type LegendPage = 'off' | 'nav' | 'scroll'

export type ScanStatus = 'scanning' | 'complete' | 'error'

export interface BrowserState {
	files: FileEntry[]
	filter: string
	cursorIndex: number
	scrollPosition: number
	scanStatus: ScanStatus
	scanError?: string
}

export interface AppState {
	mode: AppMode
	layout: LayoutMode
	focus: FocusTarget
	dimensions: { width: number; height: number }
	scrollSync: boolean
	legendPage: LegendPage
	scrollPercent: { source: number; preview: number }
	browser: BrowserState
	currentFile?: string
	fromBrowser: boolean
}

// -- actions --

export type ScrollDirection =
	| 'up'
	| 'down'
	| 'top'
	| 'bottom'
	| 'pageUp'
	| 'pageDown'
	| 'halfUp'
	| 'halfDown'

export type CursorDirection = 'up' | 'down' | 'top' | 'bottom' | 'pageUp' | 'pageDown'

export type AppAction =
	| { type: 'Resize'; width: number; height: number }
	| { type: 'FocusPane'; target: FocusTarget }
	| { type: 'ToggleSync' }
	| { type: 'CycleLegend' }
	| { type: 'CycleLayout' }
	| { type: 'Scroll'; direction: ScrollDirection; target?: FocusTarget }
	| { type: 'Quit' }
	// browser actions
	| { type: 'ScanComplete'; files: FileEntry[] }
	| { type: 'ScanError'; error: string }
	| { type: 'FilterUpdate'; text: string }
	| { type: 'CursorMove'; direction: CursorDirection; filteredLength: number }
	| { type: 'OpenFile'; path: string }
	| { type: 'ReturnToBrowser' }

// -- layout helpers --

const LAYOUT_CYCLE: readonly LayoutMode[] = ['preview-only', 'side', 'top', 'source-only'] as const

function nextLayout(current: LayoutMode): LayoutMode {
	const idx = LAYOUT_CYCLE.indexOf(current)
	return LAYOUT_CYCLE[(idx + 1) % LAYOUT_CYCLE.length]!
}

export function isSplitLayout(layout: LayoutMode): boolean {
	return layout === 'side' || layout === 'top'
}

function autoFocus(layout: LayoutMode, currentFocus: FocusTarget): FocusTarget {
	if (layout === 'preview-only') return 'preview'
	if (layout === 'source-only') return 'source'
	return currentFocus
}

function oppositeFocus(focus: FocusTarget): FocusTarget {
	return focus === 'source' ? 'preview' : 'source'
}

const LEGEND_CYCLE: readonly LegendPage[] = ['nav', 'scroll', 'off'] as const

function nextLegendPage(current: LegendPage): LegendPage {
	const idx = LEGEND_CYCLE.indexOf(current)
	return LEGEND_CYCLE[(idx + 1) % LEGEND_CYCLE.length]!
}

// -- reducer --

const PAGE_SIZE = 10

function moveCursor(
	current: number,
	direction: CursorDirection,
	filteredLength: number,
): number {
	if (filteredLength === 0) return 0
	const max = filteredLength - 1

	switch (direction) {
		case 'up':
			return Math.max(0, current - 1)
		case 'down':
			return Math.min(max, current + 1)
		case 'top':
			return 0
		case 'bottom':
			return max
		case 'pageUp':
			return Math.max(0, current - PAGE_SIZE)
		case 'pageDown':
			return Math.min(max, current + PAGE_SIZE)
	}
}

function omitCurrentFile(state: AppState): Omit<AppState, 'currentFile'> {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructure to omit
	const { currentFile, ...rest } = state
	return rest
}

function returnToBrowser(state: AppState): AppState {
	if (!state.fromBrowser) return state
	return { ...omitCurrentFile(state), mode: 'browser', focus: 'preview' }
}

export function appReducer(state: AppState, action: AppAction): AppState {
	switch (action.type) {
		case 'Resize':
			if (state.dimensions.width === action.width && state.dimensions.height === action.height) {
				return state
			}
			return { ...state, dimensions: { width: action.width, height: action.height } }

		case 'FocusPane': {
			if (!isSplitLayout(state.layout)) return state
			if (state.focus === action.target) return state
			return { ...state, focus: action.target }
		}

		case 'ToggleSync':
			return { ...state, scrollSync: !state.scrollSync }

		case 'CycleLegend':
			return { ...state, legendPage: nextLegendPage(state.legendPage) }

		case 'CycleLayout': {
			// disabled in browser mode
			if (state.mode === 'browser') return state
			const next = nextLayout(state.layout)
			const focus = autoFocus(next, state.focus)
			return { ...state, layout: next, focus }
		}

		case 'Scroll':
			return state

		case 'Quit':
			return state

		// -- browser actions --

		case 'ScanComplete':
			return {
				...state,
				browser: { ...state.browser, files: action.files, scanStatus: 'complete', cursorIndex: 0 },
			}

		case 'ScanError':
			return {
				...state,
				browser: { ...state.browser, scanStatus: 'error', scanError: action.error },
			}

		case 'FilterUpdate':
			if (state.browser.filter === action.text) return state
			return {
				...state,
				browser: { ...state.browser, filter: action.text, cursorIndex: 0 },
			}

		case 'CursorMove': {
			const next = moveCursor(state.browser.cursorIndex, action.direction, action.filteredLength)
			if (next === state.browser.cursorIndex) return state
			return {
				...state,
				browser: { ...state.browser, cursorIndex: next },
			}
		}

		case 'OpenFile':
			return {
				...state,
				mode: 'viewer',
				currentFile: action.path,
				fromBrowser: true,
				focus: autoFocus(state.layout, 'preview'),
			}

		case 'ReturnToBrowser':
			return returnToBrowser(state)
	}
}

// -- initial state --

function initialBrowserState(): BrowserState {
	return {
		files: [],
		filter: '',
		cursorIndex: 0,
		scrollPosition: 0,
		scanStatus: 'scanning',
	}
}

export function initialState(
	layout: LayoutMode = 'preview-only',
	mode: AppMode = 'viewer',
): AppState {
	return {
		mode,
		layout,
		focus: autoFocus(layout, 'preview'),
		dimensions: { width: 0, height: 0 },
		scrollSync: true,
		legendPage: 'nav',
		scrollPercent: { source: 0, preview: 0 },
		browser: initialBrowserState(),
		fromBrowser: false,
	}
}

// -- pane dimensions --

const MIN_PANE_WIDTH = 10
const MIN_PANE_HEIGHT = 5
const STATUS_BAR_HEIGHT = 2

export interface PaneDimensions {
	browser?: { width: number; height: number }
	source?: { width: number; height: number }
	preview?: { width: number; height: number }
}

const MIN_BROWSER_WIDTH = 20

function browserPaneDimensions(
	layout: LayoutMode,
	width: number,
	contentHeight: number,
): PaneDimensions {
	if (layout === 'side') {
		const half = Math.floor(width / 2)
		const other = width - half
		if (half < MIN_BROWSER_WIDTH || contentHeight < MIN_PANE_HEIGHT) {
			return { browser: { width, height: contentHeight } }
		}
		return {
			browser: { width: half, height: contentHeight },
			preview: { width: other, height: contentHeight },
		}
	}
	if (layout === 'top') {
		const half = Math.floor(contentHeight / 2)
		const other = contentHeight - half
		if (width < MIN_BROWSER_WIDTH || half < MIN_PANE_HEIGHT) {
			return { browser: { width, height: contentHeight } }
		}
		return {
			browser: { width, height: half },
			preview: { width, height: other },
		}
	}
	return { browser: { width, height: contentHeight } }
}

function viewerPaneDimensions(
	layout: LayoutMode,
	width: number,
	contentHeight: number,
): PaneDimensions {
	switch (layout) {
		case 'preview-only':
			return { preview: { width, height: contentHeight } }

		case 'source-only':
			return { source: { width, height: contentHeight } }

		case 'side': {
			const half = Math.floor(width / 2)
			const other = width - half
			if (half < MIN_PANE_WIDTH || contentHeight < MIN_PANE_HEIGHT) {
				return { preview: { width, height: contentHeight } }
			}
			return {
				source: { width: half, height: contentHeight },
				preview: { width: other, height: contentHeight },
			}
		}

		case 'top': {
			const half = Math.floor(contentHeight / 2)
			const other = contentHeight - half
			if (width < MIN_PANE_WIDTH || half < MIN_PANE_HEIGHT) {
				return { preview: { width, height: contentHeight } }
			}
			return {
				source: { width, height: half },
				preview: { width, height: other },
			}
		}
	}
}

export function paneDimensions(
	layout: LayoutMode,
	width: number,
	height: number,
	mode: AppMode = 'viewer',
): PaneDimensions {
	const contentHeight = Math.max(0, height - STATUS_BAR_HEIGHT)
	if (mode === 'browser') return browserPaneDimensions(layout, width, contentHeight)
	return viewerPaneDimensions(layout, width, contentHeight)
}

// -- legend entries --

export interface LegendEntry {
	key: string
	label: string
}

export function legendEntries(state: AppState): LegendEntry[] {
	// browser mode has its own legend
	if (state.mode === 'browser') {
		if (state.legendPage === 'off') {
			return [{ key: '?', label: 'help' }]
		}
		return [
			{ key: '?', label: 'more' },
			{ key: '\u2191/\u2193', label: 'navigate' },
			{ key: 'enter', label: 'open' },
			{ key: 'esc', label: 'quit' },
			{ key: 'type', label: 'filter' },
		]
	}

	// viewer mode
	if (state.legendPage === 'off') {
		return [{ key: '?', label: 'help' }]
	}

	if (state.legendPage === 'scroll') {
		return [
			{ key: '?', label: 'more' },
			{ key: 'j/k', label: 'scroll' },
			{ key: 'g/G', label: 'top/bottom' },
			{ key: 'pgup/pgdn', label: 'page' },
			{ key: 'ctrl+d/u', label: 'half' },
		]
	}

	// nav page
	const entries: LegendEntry[] = [{ key: '?', label: 'more' }]
	entries.push({ key: 'l', label: 'layout' })

	if (isSplitLayout(state.layout)) {
		const other = oppositeFocus(state.focus)
		entries.push({ key: 'Tab', label: other })
		entries.push({ key: 's', label: state.scrollSync ? 'sync on' : 'sync off' })
	}

	if (state.fromBrowser) {
		entries.push({ key: 'esc', label: 'back' })
	}

	entries.push({ key: 'q', label: 'quit' })
	return entries
}
