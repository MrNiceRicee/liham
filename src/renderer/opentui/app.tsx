// opentui app shell — state machine + layout composition + status bar.

import type { KeyEvent, ScrollBoxRenderable } from '@opentui/core'

import { useKeyboard, useOnResize, useRenderer, useTerminalDimensions } from '@opentui/react'
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'

import type { ThemeTokens } from '../../theme/types.ts'

import {
	type AppAction,
	type AppState,
	type LayoutMode,
	type ScrollDirection,
	appReducer,
	initialState,
	isSplitLayout,
	legendEntries,
	paneDimensions,
} from '../../app/state.ts'
import { fuzzyFilter } from '../../browser/fuzzy.ts'
import { scanDirectory } from '../../browser/scanner.ts'
import { processMarkdown } from '../../pipeline/processor.ts'
import { renderToOpenTUI } from './index.tsx'
import { renderBrowserLayout, renderViewerLayout } from './layout.tsx'
import { StatusBar } from './status-bar.tsx'

// -- browser preview cache helper --

interface PreviewCacheEntry {
	content: ReactNode
	renderTimeMs: number
}

function renderBrowserPreview(
	filePath: string,
	cursorSnapshot: number,
	cursorRef: React.RefObject<number>,
	cache: Map<string, PreviewCacheEntry>,
	state: AppState,
	theme: ThemeTokens,
	setContent: (content: ReactNode) => void,
	setRenderTime: (ms: number) => void,
): void {
	void (async () => {
		try {
			const t0 = performance.now()
			const markdown = await Bun.file(filePath).text()
			if (cursorRef.current !== cursorSnapshot) return

			const result = await processMarkdown(markdown, theme)
			if (cursorRef.current !== cursorSnapshot) return

			if (!result.ok) {
				const errNode = <text color={theme.fallback.textColor}>preview error: {result.error}</text>
				setContent(errNode)
				return
			}

			const panes = paneDimensions(state.layout, state.dimensions.width, state.dimensions.height, 'browser')
			const width = (panes.preview?.width ?? state.dimensions.width) - 4
			const rendered = renderToOpenTUI(result.value, width)
			const elapsed = performance.now() - t0
			cache.set(filePath, { content: rendered, renderTimeMs: elapsed })
			if (cursorRef.current === cursorSnapshot) {
				setContent(rendered)
				setRenderTime(elapsed)
			}
		} catch {
			setContent(<text color={theme.fallback.textColor}>cannot read file</text>)
		}
	})()
}

type AppProps =
	| { mode: 'viewer'; content: ReactNode; raw: string; layout: LayoutMode; theme: ThemeTokens; renderTimeMs: number }
	| { mode: 'browser'; dir: string; layout: LayoutMode; theme: ThemeTokens }

// -- viewer mode key maps --

const VIEWER_KEY_MAP: Record<string, (key: Pick<KeyEvent, 'ctrl'>, state: AppState) => AppAction | null> =
	{
		q: () => ({ type: 'Quit' }),
		'?': () => ({ type: 'CycleLegend' }),
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

const VIEWER_SHIFT_KEY_MAP: Record<string, () => AppAction> = {
	g: () => ({ type: 'Scroll', direction: 'bottom' }),
}

// -- scroll helpers --

function applyScroll(ref: ScrollBoxRenderable | null, direction: ScrollDirection): void {
	if (ref == null) return
	switch (direction) {
		case 'top':
			ref.scrollTo(0)
			break
		case 'bottom':
			ref.scrollTo(ref.scrollHeight)
			break
		case 'pageUp':
			ref.scrollBy(-1, 'viewport')
			break
		case 'pageDown':
			ref.scrollBy(1, 'viewport')
			break
		case 'halfUp':
			ref.scrollBy(-0.5, 'viewport')
			break
		case 'halfDown':
			ref.scrollBy(0.5, 'viewport')
			break
		default:
			break
	}
}

function syncScroll(
	focusedRef: ScrollBoxRenderable | null,
	otherRef: ScrollBoxRenderable | null,
): void {
	if (focusedRef == null || otherRef == null) return
	const srcHeight = focusedRef.scrollHeight
	if (srcHeight <= 0) return
	const percent = focusedRef.scrollTop / srcHeight
	const targetPos = Math.round(percent * otherRef.scrollHeight)
	otherRef.scrollTo(targetPos)
}

export function App(props: Readonly<AppProps>) {
	const renderer = useRenderer()
	const dims = useTerminalDimensions()

	const [state, dispatch] = useReducer(appReducer, props, (p) => ({
		...initialState(p.layout, p.mode),
		dimensions: dims,
	}))

	const sourceRef = useRef<ScrollBoxRenderable | null>(null)
	const previewRef = useRef<ScrollBoxRenderable | null>(null)
	const browserRef = useRef<ScrollBoxRenderable | null>(null)

	// browser live preview state
	const [browserPreviewContent, setBrowserPreviewContent] = useState<ReactNode>(null)
	const previewCacheRef = useRef(new Map<string, PreviewCacheEntry>())
	const previewCursorRef = useRef<number>(-1)

	// render time tracking
	const [renderTimeMs, setRenderTimeMs] = useState<number | undefined>(
		props.mode === 'viewer' ? props.renderTimeMs : undefined,
	)

	// viewer mode content
	const viewerContent = props.mode === 'viewer' ? props.content : null
	const viewerRaw = props.mode === 'viewer' ? props.raw : ''

	// computed filtered list for browser
	const filteredMatches = useMemo(
		() => fuzzyFilter(state.browser.filter, state.browser.files),
		[state.browser.filter, state.browser.files],
	)

	// -- directory scan on mount (browser mode) --
	useEffect(() => {
		if (props.mode !== 'browser') return
		let cancelled = false

		scanDirectory(props.dir).then(
			(files) => {
				if (!cancelled) dispatch({ type: 'ScanComplete', files })
			},
			(err: unknown) => {
				if (!cancelled) {
					const message = err instanceof Error ? err.message : 'scan failed'
					dispatch({ type: 'ScanError', error: message })
				}
			},
		)

		return () => { cancelled = true }
	}, [props.mode === 'browser' ? props.dir : null])

	// -- browser live preview: cache-first, background load on miss --
	useEffect(() => {
		if (state.mode !== 'browser') return
		if (filteredMatches.length === 0) {
			setBrowserPreviewContent(null)
			return
		}

		const match = filteredMatches[state.browser.cursorIndex]
		if (match == null) return

		const filePath = match.entry.absolutePath
		const cached = previewCacheRef.current.get(filePath)
		if (cached != null) {
			setBrowserPreviewContent(cached.content)
			setRenderTimeMs(cached.renderTimeMs)
			return
		}

		const cursorSnapshot = state.browser.cursorIndex
		previewCursorRef.current = cursorSnapshot

		renderBrowserPreview(
			filePath,
			cursorSnapshot,
			previewCursorRef,
			previewCacheRef.current,
			state,
			props.theme,
			setBrowserPreviewContent,
			setRenderTimeMs,
		)
	}, [state.mode, state.browser.cursorIndex, filteredMatches.length])

	// -- debounced resize --
	const resizeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
	useOnResize((width, height) => {
		if (resizeTimer.current != null) clearTimeout(resizeTimer.current)
		resizeTimer.current = setTimeout(() => {
			dispatch({ type: 'Resize', width, height })
		}, 100)
	})

	// -- viewer scroll handling --
	const focusedRef = state.focus === 'source' ? sourceRef : previewRef
	const otherRef = state.focus === 'source' ? previewRef : sourceRef

	const handleScroll = useCallback((direction: ScrollDirection) => {
		applyScroll(focusedRef.current, direction)
		if (state.scrollSync && isSplitLayout(state.layout)) {
			queueMicrotask(() => syncScroll(focusedRef.current, otherRef.current))
		}
	}, [state.scrollSync, state.layout, state.focus])

	const handleAction = useCallback((action: AppAction) => {
		if (action.type === 'Quit') {
			renderer?.destroy()
			return
		}
		dispatch(action)
		if (action.type === 'Scroll') handleScroll(action.direction)
	}, [handleScroll, renderer])

	// -- handle opening a file from browser --
	const handleOpenFile = useCallback(async (path: string) => {
		try {
			const markdown = await Bun.file(path).text()
			const result = await processMarkdown(markdown, props.theme)

			if (!result.ok) {
				// stay in browser, show error in preview
				setBrowserPreviewContent(
					<text color={props.theme.fallback.textColor}>pipeline error: {result.error}</text>,
				)
				return
			}

			dispatch({ type: 'OpenFile', path })

			// set the viewer content after mode transition
			const termWidth = state.dimensions.width
			const panes = paneDimensions(state.layout, termWidth, state.dimensions.height, 'viewer')
			const paneChrome = 4
			const width = (panes.preview?.width ?? termWidth) - paneChrome
			const rendered = renderToOpenTUI(result.value, width)

			setViewerFileContent({ content: rendered, raw: markdown })
		} catch {
			setBrowserPreviewContent(
				<text color={props.theme.fallback.textColor}>cannot read file</text>,
			)
		}
	}, [props.theme, state.dimensions, state.layout])

	// dynamic viewer content when opening files from browser
	const [viewerFileContent, setViewerFileContent] = useState<{ content: ReactNode; raw: string } | null>(null)

	// resolve current content for viewer mode
	const currentViewerContent = viewerFileContent?.content ?? viewerContent
	const currentViewerRaw = viewerFileContent?.raw ?? viewerRaw

	// -- keyboard handler --
	useKeyboard((key: KeyEvent) => {
		if (state.mode === 'browser') {
			browserKeyHandler(key, state, dispatch, filteredMatches.length, handleOpenFile, renderer)
			return
		}

		// viewer mode — check escape for back-to-browser
		if (key.name === 'escape') {
			if (state.fromBrowser) {
				dispatch({ type: 'ReturnToBrowser' })
				return
			}
			renderer?.destroy()
			return
		}

		if (key.shift) {
			const shiftAction = VIEWER_SHIFT_KEY_MAP[key.name]
			if (shiftAction != null) {
				handleAction(shiftAction())
				return
			}
		}

		const mapper = VIEWER_KEY_MAP[key.name]
		if (mapper == null) return
		const action = mapper(key, state)
		if (action != null) handleAction(action)
	})

	// -- mouse handlers --
	const handleSourceMouseDown = () => {
		if (state.focus !== 'source' && isSplitLayout(state.layout)) {
			dispatch({ type: 'FocusPane', target: 'source' })
		}
	}
	const handlePreviewMouseDown = () => {
		if (state.focus !== 'preview' && isSplitLayout(state.layout)) {
			dispatch({ type: 'FocusPane', target: 'preview' })
		}
	}
	const handleSourceMouseScroll = () => {
		if (state.scrollSync && isSplitLayout(state.layout) && state.focus === 'source') {
			queueMicrotask(() => syncScroll(sourceRef.current, previewRef.current))
		}
	}
	const handlePreviewMouseScroll = () => {
		if (state.scrollSync && isSplitLayout(state.layout) && state.focus === 'preview') {
			queueMicrotask(() => syncScroll(previewRef.current, sourceRef.current))
		}
	}

	const panes = paneDimensions(state.layout, state.dimensions.width, state.dimensions.height, state.mode)
	const entries = legendEntries(state)

	return (
		<box style={{ flexDirection: 'column', width: '100%', height: '100%' }}>
			{state.mode === 'browser'
				? renderBrowserLayout(
					state,
					panes,
					filteredMatches,
					browserPreviewContent,
					props.theme,
					browserRef,
					previewRef,
				)
				: renderViewerLayout(
					state,
					panes,
					currentViewerContent,
					currentViewerRaw,
					props.theme,
					sourceRef,
					previewRef,
					{
						onSourceMouseDown: handleSourceMouseDown,
						onPreviewMouseDown: handlePreviewMouseDown,
						onSourceMouseScroll: handleSourceMouseScroll,
						onPreviewMouseScroll: handlePreviewMouseScroll,
					},
				)}
			<StatusBar
				entries={entries}
				layout={state.mode === 'browser' ? 'browser' : state.layout}
				theme={props.theme}
				renderTimeMs={renderTimeMs}
			/>
		</box>
	)
}

// -- browser key handler --

function browserCursorKey(
	key: KeyEvent,
	dispatch: React.Dispatch<AppAction>,
	filteredLength: number,
): boolean {
	switch (key.name) {
		case 'up':
		case 'k':
			dispatch({ type: 'CursorMove', direction: 'up', filteredLength })
			return true
		case 'down':
		case 'j':
			dispatch({ type: 'CursorMove', direction: 'down', filteredLength })
			return true
		case 'home':
		case 'g':
			dispatch({
				type: 'CursorMove',
				direction: key.shift ? 'bottom' : 'top',
				filteredLength,
			})
			return true
		case 'end':
			dispatch({ type: 'CursorMove', direction: 'bottom', filteredLength })
			return true
		case 'pageup':
			dispatch({ type: 'CursorMove', direction: 'pageUp', filteredLength })
			return true
		case 'pagedown':
			dispatch({ type: 'CursorMove', direction: 'pageDown', filteredLength })
			return true
		default:
			return false
	}
}

function browserFilterKey(
	key: KeyEvent,
	state: AppState,
	dispatch: React.Dispatch<AppAction>,
): boolean {
	if (key.name === 'backspace') {
		if (state.browser.filter.length > 0) {
			dispatch({ type: 'FilterUpdate', text: state.browser.filter.slice(0, -1) })
		}
		return true
	}
	if (key.ctrl && key.name === 'w') {
		const filter = state.browser.filter.trimEnd()
		const lastSpace = filter.lastIndexOf(' ')
		dispatch({ type: 'FilterUpdate', text: lastSpace >= 0 ? filter.slice(0, lastSpace) : '' })
		return true
	}
	if (key.ctrl && key.name === 'u') {
		dispatch({ type: 'FilterUpdate', text: '' })
		return true
	}
	if (key.name.length === 1 && !key.ctrl && !key.meta) {
		dispatch({ type: 'FilterUpdate', text: state.browser.filter + key.name })
		return true
	}
	return false
}

function browserOpenSelected(
	state: AppState,
	filteredLength: number,
	openFile: (path: string) => void,
): void {
	if (filteredLength === 0) return
	const matches = fuzzyFilter(state.browser.filter, state.browser.files)
	const selected = matches[state.browser.cursorIndex]
	if (selected != null) openFile(selected.entry.absolutePath)
}

function browserKeyHandler(
	key: KeyEvent,
	state: AppState,
	dispatch: React.Dispatch<AppAction>,
	filteredLength: number,
	openFile: (path: string) => void,
	renderer: ReturnType<typeof useRenderer>,
): void {
	if (key.ctrl && key.name === 'c') return

	switch (key.name) {
		case 'escape':
			if (state.browser.filter.length > 0) dispatch({ type: 'FilterUpdate', text: '' })
			else renderer?.destroy()
			return
		case 'return':
			browserOpenSelected(state, filteredLength, openFile)
			return
		case '?':
			dispatch({ type: 'CycleLegend' })
			return
		case 'tab':
			if (isSplitLayout(state.layout)) {
				dispatch({ type: 'FocusPane', target: state.focus === 'preview' ? 'source' : 'preview' })
			}
			return
	}

	if (browserCursorKey(key, dispatch, filteredLength)) return
	browserFilterKey(key, state, dispatch)
}

