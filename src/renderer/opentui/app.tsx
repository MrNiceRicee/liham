// opentui app shell — state machine + layout composition + status bar.

import type { KeyEvent, ScrollBoxRenderable } from '@opentui/core'

import { useKeyboard, useOnResize, useRenderer, useTerminalDimensions } from '@opentui/react'
import { dirname } from 'node:path'
import {
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useReducer,
	useRef,
	useState,
} from 'react'

import type { ImageCapabilities } from '../../media/types.ts'
import type { ThemeTokens } from '../../theme/types.ts'
import type { MediaEntry } from './index.tsx'

import {
	type AppAction,
	appReducer,
	initialState,
	isSplitLayout,
	type LayoutMode,
	legendEntries,
	paneDimensions,
	type ScrollDirection,
} from '../../app/state.ts'
import { fuzzyFilter } from '../../browser/fuzzy.ts'
import { scanDirectory } from '../../browser/scanner.ts'
import { createDirectoryWatcher, createFileWatcher } from '../../watcher/watcher.ts'
import { browserKeyHandler } from './browser-keys.ts'
import {
	openFileFromBrowser,
	type PreviewCacheEntry,
	reloadViewerFile,
	renderBrowserPreview,
} from './browser-preview.tsx'
import { ImageContext, type ImageContextValue } from './image-context.tsx'
import { clearImageCache } from './image.tsx'
import { renderBrowserLayout, renderViewerLayout } from './layout.tsx'
import { MediaFocusContext, type MediaFocusContextValue } from './media-focus-context.tsx'
import { MediaGallery } from './media-gallery.tsx'
import { MediaModal } from './media-modal.tsx'
import { StatusBar } from './status-bar.tsx'
import {
	applyScroll,
	createMouseHandlers,
	handleModalKey,
	syncScroll,
	VIEWER_KEY_MAP,
	VIEWER_SHIFT_KEY_MAP,
} from './viewer-keys.ts'

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
	| {
			mode: 'browser'
			dir: string
			layout: LayoutMode
			theme: ThemeTokens
			imageCapabilities: ImageCapabilities
			noWatch: boolean
	  }

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
	const [viewerState, setViewerState] = useState<{
		content: ReactNode
		raw: string
		mediaNodes: MediaEntry[]
	}>(() => {
		if (props.mode === 'viewer')
			return { content: props.content, raw: props.raw, mediaNodes: props.mediaNodes }
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
	const reloadCtx = useMemo(
		() => ({
			changeIdRef: fileChangeIdRef,
			previewRef,
			setViewerState,
			setRenderTimeMs,
		}),
		[],
	)

	const reloadFile = useCallback(
		(watchedPath: string) => {
			reloadViewerFile(watchedPath, state, props.theme, reloadCtx)
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
		(path: string) => {
			openFileFromBrowser(
				path,
				state,
				props.theme,
				dispatch,
				setViewerState,
				setBrowserPreviewContent,
			)
		},
		[props.theme, state.dimensions, state.layout],
	)

	// -- keyboard handler --
	const mediaCount = viewerState.mediaNodes.length

	useKeyboard((key: KeyEvent) => {
		if (state.mode === 'browser') {
			browserKeyHandler(key, state, dispatch, filteredMatches.length, handleOpenFile, renderer)
			return
		}

		// modal open — intercept keys before viewer dispatch
		if (state.mediaModal.kind !== 'closed') {
			if (key.name === 'q') {
				renderer?.destroy()
				return
			}
			handleModalKey(key, state, dispatch, mediaCount)
			return
		}

		// viewer mode — 3-level Esc chain: (1) modal/focus, (2) browser, (3) quit
		if (key.name === 'escape') {
			if (state.mediaModal.kind !== 'closed' || state.mediaFocusIndex != null) {
				dispatch({ type: 'CloseMediaModal' })
				return
			}
			if (state.fromBrowser) {
				clearImageCache()
				dispatch({ type: 'ReturnToBrowser' })
				return
			}
			renderer?.destroy()
			return
		}

		if (key.shift) {
			const shiftMapper = VIEWER_SHIFT_KEY_MAP[key.name]
			if (shiftMapper != null) {
				handleAction(shiftMapper(state, mediaCount))
				return
			}
		}

		const mapper = VIEWER_KEY_MAP[key.name]
		if (mapper == null) return
		const action = mapper(key, state, mediaCount)
		if (action != null) handleAction(action)
	})

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
	}, [
		state.mode,
		state.currentFile,
		props.imageCapabilities,
		props.theme.image.placeholderBg,
		panes.preview?.width,
		state.dimensions.width,
	])

	// media focus context — separate from ImageContext for update frequency isolation
	const onMediaClick = useCallback((index: number) => {
		dispatch({ type: 'FocusMedia', index })
		dispatch({ type: 'OpenMediaModal' })
	}, [])

	const mediaFocusCtx: MediaFocusContextValue = useMemo(
		() => ({
			focusedMediaIndex: state.mediaFocusIndex,
			mediaCount,
			onMediaClick,
			focusBorderColor: props.theme.pane.focusedBorderColor,
		}),
		[state.mediaFocusIndex, mediaCount, onMediaClick, props.theme.pane.focusedBorderColor],
	)

	const mouseHandlers = createMouseHandlers(state, dispatch, sourceRef, previewRef)

	const viewerLayout =
		state.mode !== 'browser'
			? renderViewerLayout(
					state,
					panes,
					viewerState.content,
					viewerState.raw,
					props.theme,
					sourceRef,
					previewRef,
					mouseHandlers,
				)
			: null

	const showModal = state.mode === 'viewer' && state.mediaModal.kind !== 'closed'
	const showGallery =
		state.mode === 'viewer' && state.mediaFocusIndex != null && !showModal && mediaCount > 0

	const modalElement = showModal ? (
		<MediaModal
			mediaNodes={viewerState.mediaNodes}
			mediaIndex={state.mediaModal.kind === 'image' ? state.mediaModal.mediaIndex : 0}
			theme={props.theme}
			termWidth={state.dimensions.width}
			termHeight={state.dimensions.height}
		/>
	) : null

	const galleryElement = showGallery ? (
		<MediaGallery
			mediaNodes={viewerState.mediaNodes}
			focusedIndex={state.mediaFocusIndex!}
			theme={props.theme}
			termWidth={state.dimensions.width}
			termHeight={state.dimensions.height}
		/>
	) : null

	// wrap viewer layout + modal + gallery inside both context providers so modal has ImageContext
	const viewerContent = (
		<>
			{viewerLayout}
			{modalElement}
			{galleryElement}
		</>
	)

	const withImageCtx =
		imageCtx != null ? (
			<ImageContext.Provider value={imageCtx}>{viewerContent}</ImageContext.Provider>
		) : (
			viewerContent
		)

	const wrappedViewerLayout = (
		<MediaFocusContext.Provider value={mediaFocusCtx}>{withImageCtx}</MediaFocusContext.Provider>
	)

	return (
		<box style={{ position: 'relative', flexDirection: 'column', width: '100%', height: '100%' }}>
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
