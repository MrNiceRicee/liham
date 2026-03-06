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
