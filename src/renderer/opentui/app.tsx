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
	type MediaModalState,
	paneDimensions,
	type ScrollDirection,
} from '../../app/state.ts'
import { fuzzyFilter } from '../../browser/fuzzy.ts'
import { killActiveAudio, playAudio } from '../../media/ffplay.ts'
import type { MediaCapabilities } from '../../media/types.ts'
import type { ThemeTokens } from '../../theme/types.ts'
import { browserKeyHandler } from './browser-keys.ts'
import {
	openFileFromBrowser,
	type PreviewCacheEntry,
	reloadViewerFile,
	scanDirectoryEffect,
	startDirectoryWatcher,
	startFileWatcher,
	updateBrowserPreview,
} from './browser-preview.tsx'
import { clearImageCache } from './image.tsx'
import { ImageContext, type ImageContextValue } from './image-context.tsx'
import type { MediaEntry } from './index.tsx'
import { renderBrowserLayout, renderViewerLayout } from './layout.tsx'
import { MediaFocusContext, type MediaFocusContextValue } from './media-focus-context.tsx'
import { MediaGallery } from './media-gallery.tsx'
import { type FrameInfo, MediaModal } from './media-modal.tsx'
import { StatusBar } from './status-bar.tsx'
import {
	applyScroll,
	createMouseHandlers,
	handleModalKey,
	handleViewerKey,
	syncScroll,
} from './viewer-keys.ts'

function isModalPaused(modal: MediaModalState): boolean {
	return modal.kind === 'open' && modal.paused
}

// extracted to reduce App cognitive complexity

function deriveModalState(state: AppState, isViewer: boolean) {
	const showModal = isViewer && state.mediaModal.kind !== 'closed'
	const modal = state.mediaModal
	const mediaIndex = modal.kind === 'open' ? modal.mediaIndex : 0
	const galleryHidden = modal.kind === 'open' && modal.galleryHidden
	const galleryFocusIndex = showModal ? mediaIndex : state.mediaFocusIndex
	const showGallery = isViewer && galleryFocusIndex != null && !galleryHidden
	return {
		showModal,
		mediaIndex,
		galleryFocusIndex,
		showGallery,
		scrollLocked: state.mediaFocusIndex != null || modal.kind !== 'closed',
		paused: isModalPaused(modal),
		contentHeight: Math.max(1, state.dimensions.height - 2),
		restartCount: modal.kind === 'open' ? modal.restartCount : 0,
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
	dispatch(action)
	if (action.type === 'Scroll') handleScroll(action.direction)
}

function playMediaAudio(entry: MediaEntry, currentFile: string | undefined, canPlay: boolean) {
	if (entry.node.type !== 'audio' || !canPlay) return
	const basePath = currentFile != null ? dirname(currentFile) : process.cwd()
	const src = entry.node.src
	if (src == null) return
	void playAudio(src, basePath)
}

function dispatchViewerKey(
	key: KeyEvent,
	state: AppState,
	dispatch: (action: AppAction) => void,
	mediaCount: number,
	mediaNodes: MediaEntry[],
	onAudioPlay: (entry: MediaEntry) => void,
	onAction: (action: AppAction) => void,
) {
	// intercept return on audio — play directly instead of opening modal
	if (key.name === 'return' && state.mediaFocusIndex != null) {
		const entry = mediaNodes[state.mediaFocusIndex]
		if (entry?.node.type === 'audio') {
			onAudioPlay(entry)
			return
		}
	}

	const action =
		state.mediaModal.kind !== 'closed'
			? handleModalKey(key, state, dispatch, mediaCount)
			: handleViewerKey(key, state, dispatch, mediaCount)
	if (action == null) return
	if (action.type === 'ReturnToBrowser') clearImageCache()
	onAction(action)
}

type AppProps =
	| {
			mode: 'viewer'
			content: ReactNode
			raw: string
			mediaNodes: MediaEntry[]
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
	}, [state.mode, state.browser.cursorIndex, filteredMatches.length, state.browser.scanVersion])

	// -- directory watcher for browser live rescan --
	const noWatch = props.noWatch
	useEffect(() => {
		if (browserDir == null || noWatch || state.mode !== 'browser' || state.browser.scanStatus !== 'complete') return
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
	const focusedRef = state.focus === 'source' ? sourceRef : previewRef
	const otherRef = state.focus === 'source' ? previewRef : sourceRef

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

	// -- audio playback (audio-only nodes play directly via ffplay) --

	const handleAudioPlay = useCallback(
		(entry: MediaEntry) => {
			playMediaAudio(entry, currentFile, props.mediaCapabilities.canPlayAudio)
		},
		[currentFile, props.mediaCapabilities.canPlayAudio],
	)

	// -- keyboard handler --
	const mediaCount = viewerState.mediaNodes.length

	useKeyboard((key: KeyEvent) => {
		if (state.mode === 'browser') {
			browserKeyHandler(key, state, dispatch, filteredMatches.length, handleOpenFile, renderer)
			return
		}
		dispatchViewerKey(key, state, dispatch, mediaCount, viewerState.mediaNodes, handleAudioPlay, handleAction)
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
			focusedMediaIndex: state.mediaFocusIndex,
			mediaCount,
			onMediaClick,
			focusBorderColor: props.theme.pane.focusedBorderColor,
		}),
		[state.mediaFocusIndex, mediaCount, onMediaClick, props.theme.pane.focusedBorderColor],
	)

	const mouseHandlers = createMouseHandlers(state, dispatch, sourceRef, previewRef)

	const modalDerived = deriveModalState(state, isViewer)

	const viewerLayout = isViewer
		? renderViewerLayout(
				state,
				panes,
				viewerState.content,
				viewerState.raw,
				props.theme,
				sourceRef,
				previewRef,
				mouseHandlers,
				modalDerived.scrollLocked,
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
			mediaCapabilities={props.mediaCapabilities}
			onFrameInfo={setModalFrameInfo}
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
			<StatusBar
				entries={entries}
				layout={isViewer ? state.layout : 'browser'}
				theme={props.theme}
				renderTimeMs={renderTimeMs}
				fileDeleted={state.fileDeleted}
			/>
		</box>
	)
}
