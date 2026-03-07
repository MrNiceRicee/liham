// opentui app shell — state machine + layout composition + status bar.

import type { KeyEvent, ScrollBoxRenderable } from '@opentui/core'

import { useKeyboard, useOnResize, useRenderer, useTerminalDimensions } from '@opentui/react'
import { dirname } from 'node:path'
import {
	useCallback,
	useEffect,
	useMemo,
	useReducer,
	useRef,
	useState,
	type ReactNode,
} from 'react'

import type { ImageCapabilities } from '../../media/types.ts'
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
import { createDirectoryWatcher, createFileWatcher } from '../../watcher/watcher.ts'
import { browserKeyHandler } from './browser-keys.ts'
import { ImageContext, type ImageContextValue } from './image-context.tsx'
import { clearImageCache } from './image.tsx'
import { type MediaEntry, renderToOpenTUI, renderToOpenTUIWithMedia } from './index.tsx'
import { renderBrowserLayout, renderViewerLayout } from './layout.tsx'
import { MediaFocusContext, type MediaFocusContextValue } from './media-focus-context.tsx'
import { StatusBar } from './status-bar.tsx'
import { VIEWER_KEY_MAP, VIEWER_SHIFT_KEY_MAP, applyScroll, syncScroll } from './viewer-keys.ts'

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

			const panes = paneDimensions(
				state.layout,
				state.dimensions.width,
				state.dimensions.height,
				'browser',
			)
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
	| {
			mode: 'viewer'
			content: ReactNode
			raw: string
			mediaNodes: MediaEntry[]
			layout: LayoutMode
			theme: ThemeTokens
			imageCapabilities: ImageCapabilities
			renderTimeMs: number
			filePath: string
			noWatch: boolean
	  }
	| { mode: 'browser'; dir: string; layout: LayoutMode; theme: ThemeTokens; imageCapabilities: ImageCapabilities; noWatch: boolean }

export function App(props: Readonly<AppProps>) {
	const renderer = useRenderer()
	const dims = useTerminalDimensions()

	const [state, dispatch] = useReducer(appReducer, props, (p) => ({
		...initialState(p.layout, p.mode),
		dimensions: dims,
		...(p.mode === 'viewer' ? { currentFile: p.filePath } : {}),
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

	// unified viewer content — mutable state for live reload
	const [viewerState, setViewerState] = useState<{ content: ReactNode; raw: string; mediaNodes: MediaEntry[] }>(() => {
		if (props.mode === 'viewer') return { content: props.content, raw: props.raw, mediaNodes: props.mediaNodes }
		return { content: null, raw: '', mediaNodes: [] }
	})

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

		return () => {
			cancelled = true
		}
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
	}, [state.mode, state.browser.cursorIndex, filteredMatches.length, state.browser.scanVersion])

	// -- directory watcher for browser live rescan --
	useEffect(() => {
		if (state.mode !== 'browser') return
		if (props.mode === 'browser' && props.noWatch) return
		if (state.browser.scanStatus !== 'complete') return

		const browserDir = props.mode === 'browser' ? props.dir : undefined
		if (browserDir == null) return

		const scanId = { current: 0 }

		try {
			const watcher = createDirectoryWatcher(browserDir, {
				onEvent: () => {
					const id = ++scanId.current
					scanDirectory(browserDir)
						.then((files) => {
							if (scanId.current !== id) return
							previewCacheRef.current.clear()
							setBrowserPreviewContent(null)
							dispatch({ type: 'RescanComplete', files })
						})
						.catch(() => {})
				},
			})

			return () => {
				watcher.close()
			}
		} catch {
			return
		}
	}, [state.mode, state.browser.scanStatus])

	// -- debounced resize --
	const resizeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
	useOnResize((width, height) => {
		if (resizeTimer.current != null) clearTimeout(resizeTimer.current)
		resizeTimer.current = setTimeout(() => {
			dispatch({ type: 'Resize', width, height })
		}, 100)
	})

	// -- file watcher for live reload --
	const fileChangeIdRef = useRef<number>(0)

	const reloadFile = useCallback(
		(watchedPath: string) => {
			const changeId = ++fileChangeIdRef.current
			void (async () => {
				try {
					const t0 = performance.now()
					const markdown = await Bun.file(watchedPath).text()
					if (fileChangeIdRef.current !== changeId) return

					const result = await processMarkdown(markdown, props.theme)
					if (fileChangeIdRef.current !== changeId) return

					if (!result.ok) {
						// keep last good preview, update raw source only
						setViewerState((prev) => ({ ...prev, raw: markdown }))
						return
					}

					const panes = paneDimensions(
						state.layout,
						state.dimensions.width,
						state.dimensions.height,
						'viewer',
					)
					const width = (panes.preview?.width ?? state.dimensions.width) - 4
					const { jsx: rendered, mediaNodes } = renderToOpenTUIWithMedia(result.value, width)
					const elapsed = performance.now() - t0

					if (fileChangeIdRef.current !== changeId) return

					// preserve scroll position
					const scrollBefore = previewRef.current?.scrollTop ?? 0
					setViewerState({ content: rendered, raw: markdown, mediaNodes })
					setRenderTimeMs(elapsed)
					queueMicrotask(() => {
						previewRef.current?.scrollTo(scrollBefore)
					})
				} catch {
					// read failed — silently ignore (matches Go v1)
				}
			})()
		},
		[props.theme, state.layout, state.dimensions],
	)

	useEffect(() => {
		const watchedFile = state.currentFile
		if (watchedFile == null) return
		if (state.mode !== 'viewer') return
		if (props.noWatch) return

		try {
			const watcher = createFileWatcher(watchedFile, {
				onEvent: (event) => {
					if (event.type === 'change') {
						reloadFile(watchedFile)
					} else if (event.type === 'delete') {
						dispatch({ type: 'FileDeleted' })
					}
				},
			})

			return () => {
				watcher.close()
			}
		} catch {
			// watcher init failed (e.g. inotify limit) — degrade to static mode
			return
		}
	}, [state.currentFile, state.mode])

	// -- viewer scroll handling --
	const focusedRef = state.focus === 'source' ? sourceRef : previewRef
	const otherRef = state.focus === 'source' ? previewRef : sourceRef

	const handleScroll = useCallback(
		(direction: ScrollDirection) => {
			applyScroll(focusedRef.current, direction)
			if (state.scrollSync && isSplitLayout(state.layout)) {
				queueMicrotask(() => syncScroll(focusedRef.current, otherRef.current))
			}
		},
		[state.scrollSync, state.layout, state.focus],
	)

	const handleAction = useCallback(
		(action: AppAction) => {
			if (action.type === 'Quit') {
				renderer?.destroy()
				return
			}
			dispatch(action)
			if (action.type === 'Scroll') handleScroll(action.direction)
		},
		[handleScroll, renderer],
	)

	// -- handle opening a file from browser --
	const handleOpenFile = useCallback(
		async (path: string) => {
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
				const { jsx: rendered, mediaNodes } = renderToOpenTUIWithMedia(result.value, width)

				setViewerState({ content: rendered, raw: markdown, mediaNodes })
			} catch {
				setBrowserPreviewContent(
					<text color={props.theme.fallback.textColor}>cannot read file</text>,
				)
			}
		},
		[props.theme, state.dimensions, state.layout],
	)

	// -- keyboard handler --
	useKeyboard((key: KeyEvent) => {
		if (state.mode === 'browser') {
			browserKeyHandler(key, state, dispatch, filteredMatches.length, handleOpenFile, renderer)
			return
		}

		// viewer mode — check escape for back-to-browser
		if (key.name === 'escape') {
			if (state.fromBrowser) {
				clearImageCache()
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

	const panes = paneDimensions(
		state.layout,
		state.dimensions.width,
		state.dimensions.height,
		state.mode,
	)
	const entries = legendEntries(state)

	// image context for viewer mode — provides basePath for relative image resolution
	const imageCtx: ImageContextValue | undefined = useMemo(() => {
		if (state.mode !== 'viewer' || state.currentFile == null) return undefined
		const previewWidth = panes.preview?.width ?? state.dimensions.width
		// subtract padding/borders (scrollbox border + internal padding)
		const maxCols = Math.max(1, previewWidth - 4)
		return {
			basePath: dirname(state.currentFile),
			capabilities: props.imageCapabilities,
			bgColor: props.theme.image.placeholderBg,
			maxCols,
			scrollRef: previewRef,
		}
	}, [state.mode, state.currentFile, props.imageCapabilities, props.theme.image.placeholderBg, panes.preview?.width, state.dimensions.width])

	// media focus context — separate from ImageContext for update frequency isolation
	const onMediaClick = useCallback((index: number) => {
		dispatch({ type: 'FocusMedia', index })
		dispatch({ type: 'OpenMediaModal' })
	}, [])

	const mediaFocusCtx: MediaFocusContextValue = useMemo(() => ({
		focusedMediaIndex: state.mediaFocusIndex,
		onMediaClick,
	}), [state.mediaFocusIndex, onMediaClick])

	const viewerLayout = state.mode !== 'browser'
		? renderViewerLayout(
				state,
				panes,
				viewerState.content,
				viewerState.raw,
				props.theme,
				sourceRef,
				previewRef,
				{
					onSourceMouseDown: handleSourceMouseDown,
					onPreviewMouseDown: handlePreviewMouseDown,
					onSourceMouseScroll: handleSourceMouseScroll,
					onPreviewMouseScroll: handlePreviewMouseScroll,
				},
			)
		: null

	const withImageCtx = imageCtx != null
		? <ImageContext.Provider value={imageCtx}>{viewerLayout}</ImageContext.Provider>
		: viewerLayout

	const wrappedViewerLayout = withImageCtx != null
		? <MediaFocusContext.Provider value={mediaFocusCtx}>{withImageCtx}</MediaFocusContext.Provider>
		: null

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
				: wrappedViewerLayout}
			<StatusBar
				entries={entries}
				layout={state.mode === 'browser' ? 'browser' : state.layout}
				theme={props.theme}
				renderTimeMs={renderTimeMs}
				fileDeleted={state.fileDeleted}
			/>
		</box>
	)
}
