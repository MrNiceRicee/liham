// app state machine — pure reducer for all app-level state transitions.

export type LayoutMode = 'preview-only' | 'side' | 'top' | 'source-only'

export type FocusTarget = 'source' | 'preview'

export interface AppState {
	layout: LayoutMode
	focus: FocusTarget
	dimensions: { width: number; height: number }
	scrollSync: boolean
	legendVisible: boolean
	scrollPercent: { source: number; preview: number }
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

export type AppAction =
	| { type: 'Resize'; width: number; height: number }
	| { type: 'FocusPane'; target: FocusTarget }
	| { type: 'ToggleSync' }
	| { type: 'ToggleLegend' }
	| { type: 'CycleLayout' }
	| { type: 'Scroll'; direction: ScrollDirection; target?: FocusTarget }
	| { type: 'Quit' }

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

// -- reducer --

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

		case 'ToggleLegend':
			return { ...state, legendVisible: !state.legendVisible }

		case 'CycleLayout': {
			const next = nextLayout(state.layout)
			const focus = autoFocus(next, state.focus)
			return { ...state, layout: next, focus }
		}

		case 'Scroll':
			// scroll actions are handled imperatively via refs in the component.
			// the reducer just updates scrollPercent for position tracking.
			return state

		case 'Quit':
			// quit is handled imperatively in the component (renderer.destroy()).
			return state
	}
}

// -- initial state --

export function initialState(layout: LayoutMode = 'preview-only'): AppState {
	return {
		layout,
		focus: autoFocus(layout, 'preview'),
		dimensions: { width: 0, height: 0 },
		scrollSync: false,
		legendVisible: true,
		scrollPercent: { source: 0, preview: 0 },
	}
}

// -- pane dimensions --

const MIN_PANE_WIDTH = 10
const MIN_PANE_HEIGHT = 5
const STATUS_BAR_HEIGHT = 2

export interface PaneDimensions {
	source?: { width: number; height: number }
	preview?: { width: number; height: number }
}

export function paneDimensions(
	layout: LayoutMode,
	width: number,
	height: number,
): PaneDimensions {
	const contentHeight = Math.max(0, height - STATUS_BAR_HEIGHT)

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

// -- legend entries --

export interface LegendEntry {
	key: string
	label: string
}

export function legendEntries(state: AppState): LegendEntry[] {
	const entries: LegendEntry[] = []

	entries.push({ key: '?', label: 'legend' })
	entries.push({ key: 'l', label: 'layout' })

	if (isSplitLayout(state.layout)) {
		const other = oppositeFocus(state.focus)
		entries.push({ key: 'Tab', label: other })
		entries.push({ key: 's', label: state.scrollSync ? 'sync on' : 'sync off' })
	}

	entries.push({ key: 'q', label: 'quit' })

	return entries
}
