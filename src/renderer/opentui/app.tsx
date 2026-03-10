// opentui app shell — state machine + layout composition + status bar.

import { dirname } from 'node:path'
import type { KeyEvent, ScrollBoxRenderable } from '@opentui/core'
import { useKeyboard, useOnResize, useRenderer, useTerminalDimensions } from '@opentui/react'
import {
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useReducer,
	useRef,
	useState,
} from 'react'
import {
	type AppAction,
	appReducer,
	type AppState,
	initialState,
	isSplitLayout,
	type LayoutMode,
	legendEntries,
	paneDimensions,
	type ScrollDirection,
} from '../../app/state.ts'
import { fuzzyFilter } from '../../browser/fuzzy.ts'
import type { IRNode } from '../../ir/types.ts'
import { killActiveAudio } from '../../media/ffplay.ts'
import type { MediaCapabilities } from '../../media/types.ts'
import type { ThemeTokens } from '../../theme/types.ts'
import { browserKeyHandler } from './browser-keys.ts'
import { dispatchViewerKey } from './viewer-dispatch.ts'
import {
	openFileFromBrowser,
	type PreviewCacheEntry,
	reloadViewerFile,
	scanDirectoryEffect,
	startDirectoryWatcher,
	startFileWatcher,
	updateBrowserPreview,
} from './browser-preview.tsx'
import { ImageContext, type ImageContextValue } from './image-context.tsx'
import { type MediaEntry, renderToOpenTUIWithMedia, setSearchState } from './index.tsx'
import type { TocEntry } from './toc.ts'
import { renderBrowserLayout, renderViewerLayout } from './layout.tsx'
import { MediaFocusContext, type MediaFocusContextValue } from './media-focus-context.tsx'
import { MediaGallery } from './media-gallery.tsx'
import { type FrameInfo, MediaModal, type VideoPlaybackInfo } from './media-modal.tsx'
import { SearchBar } from './search-bar.tsx'
import { TocPanel } from './toc-panel.tsx'
import { useSearchHighlight, useTocJump } from './viewer-scroll-hooks.ts'
import { StatusBar } from './status-bar.tsx'
import { applyScroll, createMouseHandlers, syncScroll } from './viewer-keys.ts'

// extracted to reduce App cognitive complexity

function currentMediaType(state: AppState, mediaNodes: MediaEntry[]): string | undefined {
	if (state.media.kind !== 'modal') return undefined
	return mediaNodes[state.media.mediaIndex]?.node.type
}

function deriveModalState(state: AppState, isViewer: boolean) {
	const media = state.media
	const showModal = isViewer && media.kind === 'modal'
	const mediaIndex = media.kind === 'modal' ? media.mediaIndex : 0
	const galleryHidden = media.kind === 'modal' && media.galleryHidden
	let galleryFocusIndex: number | null = null
	if (media.kind !== 'none') galleryFocusIndex = showModal ? mediaIndex : media.index
	const showGallery = isViewer && galleryFocusIndex != null && !galleryHidden
	return {
		showModal,
		mediaIndex,
		galleryFocusIndex,
		showGallery,
		scrollLocked: media.kind !== 'none',
		paused: media.kind === 'modal' && media.paused,
		contentHeight: Math.max(1, state.dimensions.height - 2),
		restartCount: media.kind === 'modal' ? media.restartCount : 0,
		seekOffset: media.kind === 'modal' ? media.seekOffset : 0,
	}
}

function scrollWithSync(
	direction: ScrollDirection,
	focusedRef: React.RefObject<ScrollBoxRenderable | null>,
	otherRef: React.RefObject<ScrollBoxRenderable | null>,
	scrollSync: boolean,
	layout: LayoutMode,
) {
	applyScroll(focusedRef.current, direction)
	if (scrollSync && isSplitLayout(layout)) {
		queueMicrotask(() => syncScroll(focusedRef.current, otherRef.current))
	}
}

function dispatchAction(
	action: AppAction,
	dispatch: (a: AppAction) => void,
	handleScroll: (dir: ScrollDirection) => void,
	renderer: ReturnType<typeof useRenderer> | null,
) {
	if (action.type === 'Quit') {
		void killActiveAudio()
		renderer?.destroy()
		return
	}
	if (action.type === 'CopySelection') {
		const sel = renderer?.getSelection()
		if (sel == null) return
		const text = sel.getSelectedText()
		if (text.trim().length === 0) return
		renderer?.copyToClipboardOSC52(text)
		renderer?.clearSelection()
		return
	}
	dispatch(action)
	if (action.type === 'Scroll') handleScroll(action.direction)
}

// -- extracted hooks to reduce App cognitive complexity --

function useClearOnMediaChange(
	state: AppState,
	setVideoInfo: (v: VideoPlaybackInfo | null) => void,
	setModalFrameInfo: (v: FrameInfo | null) => void,
) {
	const index = state.media.kind === 'modal' ? state.media.mediaIndex : -1
	const prevRef = useRef(index)
	if (index !== prevRef.current) {
		prevRef.current = index
		setVideoInfo(null)
		setModalFrameInfo(null)
	}
}

function useClearSearchOnClose(searchQuery: string) {
	const prevRef = useRef(searchQuery)
	if (searchQuery.length === 0 && prevRef.current.length > 0) {
		setSearchState(undefined)
	}
	prevRef.current = searchQuery
}

type AppProps =
	| {
			mode: 'viewer'
			content: ReactNode
			raw: string
			ir: IRNode
			mediaNodes: MediaEntry[]
			tocEntries: TocEntry[]
			estimatedTotalHeight: number
			layout: LayoutMode
			theme: ThemeTokens
			mediaCapabilities: MediaCapabilities
			renderTimeMs: number
			filePath: string
			noWatch: boolean
	  }
	| {
			mode: 'browser'
			dir: string
			layout: LayoutMode
			theme: ThemeTokens
			mediaCapabilities: MediaCapabilities
			noWatch: boolean
	  }

function initialViewerState(props: Readonly<AppProps>) {
	if (props.mode === 'viewer')
		return {
			content: props.content,
			raw: props.raw,
			ir: props.ir as IRNode | null,
			mediaNodes: props.mediaNodes,
			tocEntries: props.tocEntries,
			estimatedTotalHeight: props.estimatedTotalHeight,
		}
	return {
		content: null as ReactNode,
		raw: '',
		ir: null as IRNode | null,
		mediaNodes: [] as MediaEntry[],
		tocEntries: [] as TocEntry[],
		estimatedTotalHeight: 0,
	}
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

	// modal animation frame info — shared between modal and gallery
	const [modalFrameInfo, setModalFrameInfo] = useState<FrameInfo | null>(null)

	// video playback info — elapsed time, duration for progress bar
	const [videoInfo, setVideoInfo] = useState<VideoPlaybackInfo | null>(null)

	// clear stale playback info when media index changes (synchronous during render)
	useClearOnMediaChange(state, setVideoInfo, setModalFrameInfo)

	// unified viewer content — mutable state for live reload
	const [viewerState, setViewerState] = useState(() => initialViewerState(props))

	// derived state
	const isViewer = state.mode === 'viewer'
	const currentFile = isViewer ? state.currentFile : undefined

	// computed filtered list for browser
	const filteredMatches = useMemo(
		() => fuzzyFilter(state.browser.filter, state.browser.files),
		[state.browser.filter, state.browser.files],
	)

	// -- directory scan on mount (browser mode) --
	const browserDir = props.mode === 'browser' ? props.dir : null
	useEffect(() => {
		if (browserDir == null) return
		return scanDirectoryEffect(browserDir, dispatch)
	}, [browserDir])

	// -- browser live preview: cache-first, background load on miss --
	useEffect(() => {
		if (state.mode !== 'browser') return
		updateBrowserPreview(
			filteredMatches,
			state,
			props.theme,
			previewCursorRef,
			previewCacheRef.current,
			setBrowserPreviewContent,
			setRenderTimeMs,
		)
		previewRef.current?.scrollTo(0)
	}, [state.mode, state.browser.cursorIndex, filteredMatches.length, state.browser.scanVersion])

	// -- directory watcher for browser live rescan --
	const noWatch = props.noWatch
	useEffect(() => {
		if (
			browserDir == null ||
			noWatch ||
			state.mode !== 'browser' ||
			state.browser.scanStatus !== 'complete'
		)
			return
		return startDirectoryWatcher(browserDir, previewCacheRef, setBrowserPreviewContent, dispatch)
	}, [state.mode, state.browser.scanStatus])

	// -- debounced resize --
	const resizeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
	useOnResize((width, height) => {
		clearTimeout(resizeTimer.current ?? undefined)
		resizeTimer.current = setTimeout(() => dispatch({ type: 'Resize', width, height }), 100)
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
		if (currentFile == null || !isViewer || noWatch) return
		return startFileWatcher(currentFile, reloadFile, dispatch)
	}, [currentFile, state.mode])

	// -- viewer scroll handling --
	const [focusedRef, otherRef] =
		state.focus === 'source' ? [sourceRef, previewRef] : [previewRef, sourceRef]

	const handleScroll = useCallback(
		(direction: ScrollDirection) =>
			scrollWithSync(direction, focusedRef, otherRef, state.scrollSync, state.layout),
		[state.scrollSync, state.layout, state.focus],
	)

	const handleAction = useCallback(
		(action: AppAction) => dispatchAction(action, dispatch, handleScroll, renderer),
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

	// search highlight + scroll-to-match + TOC jump
	const { searchQuery, searchMatches, safeSearchIndex } = useSearchHighlight(
		state,
		viewerState.raw,
		sourceRef,
		previewRef,
	)
	useTocJump(state, viewerState.tocEntries, previewRef, sourceRef, dispatch)

	// compute preview content with search highlights baked in.
	// runs synchronously during render — the IR-to-JSX step is fast (~10-50ms).
	// when no search is active, uses the cached viewerState.content directly.
	const searchPreviewWidth =
		paneDimensions(state.layout, state.dimensions.width, state.dimensions.height, state.mode)
			.preview?.width ?? state.dimensions.width

	const highlightedPreview = useMemo(() => {
		if (viewerState.ir == null || searchQuery.length === 0) return null
		setSearchState(
			searchQuery,
			props.theme.search.currentHighlightBg,
			props.theme.codeBlock.backgroundColor,
		)
		const width = Math.max(1, searchPreviewWidth - 4)
		return renderToOpenTUIWithMedia(viewerState.ir, props.theme, width)
	}, [searchQuery, viewerState.ir, searchPreviewWidth, props.theme])

	// clear search state when search closes so future non-search renders are clean
	useClearSearchOnClose(searchQuery)

	const previewContent = highlightedPreview?.jsx ?? viewerState.content

	// -- keyboard handler --
	const mediaCount = viewerState.mediaNodes.length

	useKeyboard((key: KeyEvent) => {
		if (process.env['LIHAM_DEBUG'] === '1') {
			process.stderr.write(
				`[app] key=${key.name} mode=${state.mode} media=${state.media.kind} paused=${String(state.media.kind === 'modal' && state.media.paused)} vidDur=${String(videoInfo?.duration ?? 0)}\n`,
			)
		}
		if (state.mode === 'browser') {
			browserKeyHandler(key, state, dispatch, filteredMatches, handleOpenFile, renderer, browserRef)
			return
		}
		dispatchViewerKey(
			key,
			state,
			dispatch,
			mediaCount,
			handleAction,
			videoInfo?.duration ?? 0,
			videoInfo?.elapsed ?? 0,
			searchMatches.length,
			viewerState.tocEntries.length,
			renderer,
		)
	})

	const panes = paneDimensions(
		state.layout,
		state.dimensions.width,
		state.dimensions.height,
		state.mode,
	)
	const entries = legendEntries(state, currentMediaType(state, viewerState.mediaNodes))

	// image context for viewer mode — provides basePath for relative image resolution
	const imageCtx: ImageContextValue | undefined = useMemo(() => {
		if (currentFile == null) return undefined
		const previewWidth = panes.preview?.width ?? state.dimensions.width
		// subtract padding/borders (scrollbox border + internal padding)
		const maxCols = Math.max(1, previewWidth - 4)
		return {
			basePath: dirname(currentFile),
			capabilities: props.mediaCapabilities,
			bgColor: props.theme.image.placeholderBg,
			maxCols,
			scrollRef: previewRef,
		}
	}, [
		currentFile,
		props.mediaCapabilities,
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
			focusedMediaIndex: state.media.kind !== 'none' ? state.media.index : null,
			mediaCount,
			onMediaClick,
			focusBorderColor: props.theme.pane.focusedBorderColor,
		}),
		[state.media, mediaCount, onMediaClick, props.theme.pane.focusedBorderColor],
	)

	const mouseHandlers = createMouseHandlers(state, dispatch, sourceRef, previewRef)

	const modalDerived = deriveModalState(state, isViewer)

	const searchHighlightProp =
		searchMatches.length > 0 && state.searchState != null
			? { matches: searchMatches, currentIndex: safeSearchIndex, queryLength: searchQuery.length }
			: undefined

	const viewerLayout = isViewer
		? renderViewerLayout(
				state,
				panes,
				previewContent,
				viewerState.raw,
				props.theme,
				sourceRef,
				previewRef,
				mouseHandlers,
				modalDerived.scrollLocked,
				searchHighlightProp,
			)
		: null
	const modalElement = modalDerived.showModal ? (
		<MediaModal
			mediaNodes={viewerState.mediaNodes}
			mediaIndex={modalDerived.mediaIndex}
			theme={props.theme}
			termWidth={state.dimensions.width}
			termHeight={modalDerived.contentHeight}
			paused={modalDerived.paused}
			restartCount={modalDerived.restartCount}
			seekOffset={modalDerived.seekOffset}
			volume={state.volume}
			muted={state.muted}
			mediaCapabilities={props.mediaCapabilities}
			onFrameInfo={setModalFrameInfo}
			onVideoInfo={setVideoInfo}
		/>
	) : null

	const galleryElement = modalDerived.showGallery ? (
		<MediaGallery
			mediaNodes={viewerState.mediaNodes}
			focusedIndex={modalDerived.galleryFocusIndex!}
			theme={props.theme}
			termWidth={state.dimensions.width}
			termHeight={modalDerived.contentHeight}
			frameInfo={modalFrameInfo}
			paused={modalDerived.paused}
			videoInfo={videoInfo}
			volume={state.volume}
			muted={state.muted}
		/>
	) : null

	// TOC panel — hidden in source-only layout and when modal is open
	const showToc =
		isViewer &&
		state.tocState?.kind === 'open' &&
		viewerState.tocEntries.length > 0 &&
		state.layout !== 'source-only' &&
		state.media.kind !== 'modal'

	const tocElement = showToc ? (
		<TocPanel
			entries={viewerState.tocEntries}
			cursorIndex={state.tocState?.cursorIndex ?? 0}
			theme={props.theme}
			termWidth={state.dimensions.width}
			termHeight={modalDerived.contentHeight}
		/>
	) : null

	// wrap viewer layout + modal + gallery + TOC inside both context providers
	const viewerContent = (
		<>
			{viewerLayout}
			{modalElement}
			{galleryElement}
			{tocElement}
		</>
	)

	const wrappedViewerLayout = (
		<MediaFocusContext.Provider value={mediaFocusCtx}>
			<ImageContext.Provider value={imageCtx}>{viewerContent}</ImageContext.Provider>
		</MediaFocusContext.Provider>
	)

	return (
		<box style={{ position: 'relative', flexDirection: 'column', width: '100%', height: '100%' }}>
			{isViewer
				? wrappedViewerLayout
				: renderBrowserLayout(
						state,
						panes,
						filteredMatches,
						browserPreviewContent,
						props.theme,
						browserRef,
						previewRef,
					)}
			{state.searchState != null ? (
				<SearchBar
					searchState={state.searchState}
					matchCount={searchMatches.length}
					theme={props.theme}
				/>
			) : (
				<StatusBar
					entries={entries}
					layout={isViewer ? state.layout : 'browser'}
					theme={props.theme}
					renderTimeMs={renderTimeMs}
					fileDeleted={state.fileDeleted}
				/>
			)}
		</box>
	)
}
