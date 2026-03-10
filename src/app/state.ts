// app state machine — pure reducer for all app-level state transitions.

import type { FileEntry } from '../browser/scanner.ts'
import { mediaModalReducer } from './state-media-modal.ts'
import { type SearchState, searchReducer } from './state-search.ts'
import { type TocState, tocReducer } from './state-toc.ts'

export type LayoutMode = 'preview-only' | 'side' | 'top' | 'source-only'

export type FocusTarget = 'source' | 'preview'

export type AppMode = 'browser' | 'viewer'

export type LegendPage = 'off' | 'nav' | 'scroll'

export type ScanStatus = 'scanning' | 'complete' | 'error'

export interface BrowserState {
	files: FileEntry[]
	filter: string
	inputCursor: number
	cursorIndex: number
	scrollPosition: number
	scanStatus: ScanStatus
	scanError?: string
	scanVersion: number
}

export type MediaOverlay =
	| { kind: 'none' }
	| { kind: 'focused'; index: number }
	| {
			kind: 'modal'
			index: number
			mediaIndex: number
			galleryHidden: boolean
			paused: boolean
			restartCount: number
			seekOffset: number
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
	fileDeleted: boolean
	media: MediaOverlay
	searchState: SearchState | null
	preSearchLayout?: LayoutMode // saved layout to restore when search closes
	tocState: TocState | null
	volume: number
	muted: boolean
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
	| 'lineUp'
	| 'lineDown'

export type CursorDirection =
	| 'up'
	| 'down'
	| 'top'
	| 'bottom'
	| 'pageUp'
	| 'pageDown'
	| 'halfUp'
	| 'halfDown'

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
	| { type: 'RescanComplete'; files: FileEntry[] }
	| { type: 'ScanError'; error: string }
	| { type: 'FilterUpdate'; text: string; cursor: number }
	| { type: 'CursorMove'; direction: CursorDirection; filteredLength: number }
	| { type: 'OpenFile'; path: string }
	| { type: 'ReturnToBrowser' }
	// watcher actions
	| { type: 'FileDeleted' }
	// media actions
	| { type: 'FocusNextMedia'; mediaCount: number }
	| { type: 'FocusPrevMedia'; mediaCount: number }
	| { type: 'FocusMedia'; index: number }
	| { type: 'OpenMediaModal' }
	| { type: 'CloseMediaModal' }
	| { type: 'ToggleGallery' }
	| { type: 'TogglePlayPause' }
	| { type: 'ReplayMedia' }
	| { type: 'SeekMedia'; delta: number; duration: number; elapsed: number }
	| { type: 'CopySelection' }
	// search actions
	| { type: 'SearchOpen' }
	| { type: 'SearchUpdate'; query: string; cursor: number }
	| { type: 'SearchConfirm'; matchCount: number }
	| { type: 'SearchNext' }
	| { type: 'SearchPrev' }
	| { type: 'SearchClose' }
	// TOC actions
	| { type: 'ToggleToc' }
	| { type: 'SetTocCursor'; index: number }
	| { type: 'TocJump' }
	| { type: 'TocJumpComplete' }
	| { type: 'CloseToc' }
	// volume actions
	| { type: 'SetVolume'; volume: number }
	| { type: 'ToggleMute' }

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

const LEGEND_CYCLE: readonly LegendPage[] = ['nav', 'scroll', 'off'] as const

function nextLegendPage(current: LegendPage): LegendPage {
	const idx = LEGEND_CYCLE.indexOf(current)
	return LEGEND_CYCLE[(idx + 1) % LEGEND_CYCLE.length]!
}

// -- reducer --

const PAGE_SIZE = 10

export function moveCursor(
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
		case 'halfUp':
			return Math.max(0, current - Math.floor(PAGE_SIZE / 2))
		case 'halfDown':
			return Math.min(max, current + Math.floor(PAGE_SIZE / 2))
	}
}

function omitCurrentFile(state: AppState): Omit<AppState, 'currentFile'> {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructure to omit
	const { currentFile, ...rest } = state
	return rest
}

function rescanCursor(browser: BrowserState, newFiles: FileEntry[]): number {
	const selectedPath = browser.files[browser.cursorIndex]?.absolutePath
	if (selectedPath == null) return 0
	const idx = newFiles.findIndex((f) => f.absolutePath === selectedPath)
	if (idx >= 0) return idx
	return Math.min(browser.cursorIndex, Math.max(0, newFiles.length - 1))
}

function returnToBrowser(state: AppState): AppState {
	if (!state.fromBrowser) return state
	return {
		...omitCurrentFile(state),
		mode: 'browser',
		focus: 'preview',
		fileDeleted: false,
		media: { kind: 'none' },
		searchState: null,
		tocState: null,
	}
}

// -- sub-reducers --

type BrowserAction = Extract<
	AppAction,
	{
		type:
			| 'ScanComplete'
			| 'RescanComplete'
			| 'ScanError'
			| 'FilterUpdate'
			| 'CursorMove'
			| 'OpenFile'
			| 'ReturnToBrowser'
	}
>

function browserReducer(state: AppState, action: BrowserAction): AppState {
	switch (action.type) {
		case 'ScanComplete':
			return {
				...state,
				browser: { ...state.browser, files: action.files, scanStatus: 'complete', cursorIndex: 0 },
			}
		case 'RescanComplete':
			return {
				...state,
				browser: {
					...state.browser,
					files: action.files,
					scanStatus: 'complete',
					cursorIndex: rescanCursor(state.browser, action.files),
					scanVersion: state.browser.scanVersion + 1,
				},
			}
		case 'ScanError':
			return {
				...state,
				browser: { ...state.browser, scanStatus: 'error', scanError: action.error },
			}
		case 'FilterUpdate': {
			const textChanged = state.browser.filter !== action.text
			if (!textChanged && state.browser.inputCursor === action.cursor) return state
			return {
				...state,
				browser: {
					...state.browser,
					filter: action.text,
					inputCursor: action.cursor,
					...(textChanged ? { cursorIndex: 0 } : {}),
				},
			}
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
				fileDeleted: false,
				focus: autoFocus(state.layout, 'preview'),
				searchState: null,
				tocState: null,
			}
		case 'ReturnToBrowser':
			return returnToBrowser(state)
	}
}

type MediaFocusAction = Extract<
	AppAction,
	{ type: 'FocusNextMedia' | 'FocusPrevMedia' | 'FocusMedia' }
>

function focusIndex(media: MediaOverlay): number | null {
	return media.kind === 'none' ? null : media.index
}

function mediaFocusReducer(state: AppState, action: MediaFocusAction): AppState {
	switch (action.type) {
		case 'FocusNextMedia': {
			if (action.mediaCount === 0) return state
			const cur = focusIndex(state.media) ?? -1
			const next = (cur + 1) % action.mediaCount
			if (state.media.kind === 'modal')
				return {
					...state,
					media: {
						...state.media,
						index: next,
						mediaIndex: next,
						paused: false,
						seekOffset: 0,
						restartCount: state.media.restartCount + 1,
					},
				}
			return { ...state, media: { kind: 'focused', index: next } }
		}
		case 'FocusPrevMedia': {
			if (action.mediaCount === 0) return state
			const cur = focusIndex(state.media) ?? 0
			const prev = (cur - 1 + action.mediaCount) % action.mediaCount
			if (state.media.kind === 'modal')
				return {
					...state,
					media: {
						...state.media,
						index: prev,
						mediaIndex: prev,
						paused: false,
						seekOffset: 0,
						restartCount: state.media.restartCount + 1,
					},
				}
			return { ...state, media: { kind: 'focused', index: prev } }
		}
		case 'FocusMedia':
			if (state.media.kind === 'modal')
				return {
					...state,
					media: { ...state.media, index: action.index, mediaIndex: action.index },
				}
			return { ...state, media: { kind: 'focused', index: action.index } }
	}
}

// -- main reducer --

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
			if (state.mode === 'browser') return state
			const next = nextLayout(state.layout)
			const focus = autoFocus(next, state.focus)
			return { ...state, layout: next, focus }
		}
		case 'Scroll':
		case 'Quit':
		case 'CopySelection':
			return state
		case 'FileDeleted':
			return { ...state, fileDeleted: true }
		case 'ScanComplete':
		case 'RescanComplete':
		case 'ScanError':
		case 'FilterUpdate':
		case 'CursorMove':
		case 'OpenFile':
		case 'ReturnToBrowser':
			return browserReducer(state, action)
		case 'FocusNextMedia':
		case 'FocusPrevMedia':
		case 'FocusMedia':
			return mediaFocusReducer(state, action)
		case 'OpenMediaModal':
		case 'CloseMediaModal':
		case 'ToggleGallery':
		case 'TogglePlayPause':
		case 'ReplayMedia':
		case 'SeekMedia':
			return mediaModalReducer(state, action)
		case 'SearchOpen':
		case 'SearchUpdate':
		case 'SearchConfirm':
		case 'SearchNext':
		case 'SearchPrev':
		case 'SearchClose':
			return searchReducer(state, action)
		case 'ToggleToc':
		case 'SetTocCursor':
		case 'TocJump':
		case 'TocJumpComplete':
		case 'CloseToc':
			return tocReducer(state, action)
		case 'SetVolume':
			return { ...state, volume: action.volume }
		case 'ToggleMute':
			return { ...state, muted: !state.muted }
	}
}

// -- initial state --

function initialBrowserState(): BrowserState {
	return {
		files: [],
		filter: '',
		inputCursor: 0,
		cursorIndex: 0,
		scrollPosition: 0,
		scanStatus: 'scanning',
		scanVersion: 0,
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
		fileDeleted: false,
		media: { kind: 'none' },
		searchState: null,
		tocState: null,
		volume: 100,
		muted: false,
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

// -- legend entries (extracted to state-legend.ts) --

export { legendEntries, type LegendEntry } from './state-legend.ts'
