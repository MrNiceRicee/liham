// opentui app shell — state machine + layout composition + status bar.

import type { KeyEvent } from '@opentui/core'
import type { ScrollBoxRenderable } from '@opentui/core'

import { useKeyboard, useOnResize, useRenderer, useTerminalDimensions } from '@opentui/react'
import { useReducer, useRef, type ReactNode } from 'react'

import type { ThemeTokens } from '../../theme/types.ts'

import {
	type AppAction,
	type AppState,
	type LayoutMode,
	appReducer,
	initialState,
	legendEntries,
	paneDimensions,
} from '../../app/state.ts'
import { PreviewPane } from './preview-pane.tsx'
import { SourcePane } from './source-pane.tsx'
import { StatusBar } from './status-bar.tsx'

interface AppProps {
	content: ReactNode
	raw: string
	layout: LayoutMode
	theme: ThemeTokens
}

// key-to-action dispatch map — matches BLOCK_COMPILERS pattern for cognitive complexity.
const KEY_MAP: Record<string, (key: Pick<KeyEvent, 'ctrl'>, state: AppState) => AppAction | null> =
	{
		q: () => ({ type: 'Quit' }),
		escape: () => ({ type: 'Quit' }),
		'?': () => ({ type: 'ToggleLegend' }),
		l: () => ({ type: 'CycleLayout' }),
		s: () => ({ type: 'ToggleSync' }),
		tab: (_, state) => ({ type: 'FocusPane', target: state.focus === 'source' ? 'preview' : 'source' }),
		j: () => ({ type: 'Scroll', direction: 'down' }),
		k: () => ({ type: 'Scroll', direction: 'up' }),
		down: () => ({ type: 'Scroll', direction: 'down' }),
		up: () => ({ type: 'Scroll', direction: 'up' }),
		pagedown: () => ({ type: 'Scroll', direction: 'pageDown' }),
		pageup: () => ({ type: 'Scroll', direction: 'pageUp' }),
		g: () => ({ type: 'Scroll', direction: 'top' }),
		home: () => ({ type: 'Scroll', direction: 'top' }),
		end: () => ({ type: 'Scroll', direction: 'bottom' }),
		d: (key) => (key.ctrl ? { type: 'Scroll', direction: 'halfDown' } : null),
		u: (key) => (key.ctrl ? { type: 'Scroll', direction: 'halfUp' } : null),
	}

// shift+g → bottom (G in Go version)
const SHIFT_KEY_MAP: Record<string, () => AppAction> = {
	g: () => ({ type: 'Scroll', direction: 'bottom' }),
}

export function App({ content, raw, layout, theme }: Readonly<AppProps>) {
	const renderer = useRenderer()
	const dims = useTerminalDimensions()
	const [state, dispatch] = useReducer(appReducer, layout, (l) => ({
		...initialState(l),
		dimensions: dims,
	}))

	const sourceRef = useRef<ScrollBoxRenderable | null>(null)
	const previewRef = useRef<ScrollBoxRenderable | null>(null)

	// debounced resize
	const resizeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
	useOnResize((width, height) => {
		if (resizeTimer.current != null) clearTimeout(resizeTimer.current)
		resizeTimer.current = setTimeout(() => {
			dispatch({ type: 'Resize', width, height })
		}, 100)
	})

	useKeyboard((key: KeyEvent) => {
		// shift keys (e.g., G for bottom)
		if (key.shift) {
			const shiftAction = SHIFT_KEY_MAP[key.name]
			if (shiftAction != null) {
				const action = shiftAction()
				if (action.type === 'Quit') {
					renderer?.destroy()
					return
				}
				dispatch(action)
				return
			}
		}

		const mapper = KEY_MAP[key.name]
		if (mapper == null) return

		const action = mapper(key, state)
		if (action == null) return

		if (action.type === 'Quit') {
			renderer?.destroy()
			return
		}

		dispatch(action)
	})

	const panes = paneDimensions(state.layout, state.dimensions.width, state.dimensions.height)
	const entries = legendEntries(state)

	return (
		<box style={{ flexDirection: 'column', width: '100%', height: '100%' }}>
			{renderLayout(state, panes, content, raw, theme, sourceRef, previewRef)}
			<StatusBar
				legendVisible={state.legendVisible}
				entries={entries}
				layout={state.layout}
				theme={theme}
			/>
		</box>
	)
}

function renderLayout(
	state: AppState,
	panes: ReturnType<typeof paneDimensions>,
	content: ReactNode,
	raw: string,
	theme: ThemeTokens,
	sourceRef: React.RefObject<ScrollBoxRenderable | null>,
	previewRef: React.RefObject<ScrollBoxRenderable | null>,
): ReactNode {
	const hasSource = panes.source != null
	const hasPreview = panes.preview != null

	// single-pane modes
	if (hasPreview && !hasSource) {
		return <PreviewPane content={content} focused theme={theme} scrollRef={previewRef} />
	}
	if (hasSource && !hasPreview) {
		return <SourcePane content={raw} focused theme={theme} scrollRef={sourceRef} />
	}

	// split modes
	const direction = state.layout === 'side' ? 'row' : 'column'
	const sourceFocused = state.focus === 'source'

	return (
		<box style={{ flexDirection: direction, flexGrow: 1 }}>
			<SourcePane
				content={raw}
				focused={sourceFocused}
				theme={theme}
				scrollRef={sourceRef}
			/>
			<PreviewPane content={content} focused={!sourceFocused} theme={theme} scrollRef={previewRef} />
		</box>
	)
}
