// file processing helpers — browser preview rendering, file open, and live reload.

import type { ScrollBoxRenderable } from '@opentui/core'
import type { ReactNode, RefObject } from 'react'

import type { AppAction, AppState } from '../../app/state.ts'
import { paneDimensions } from '../../app/state.ts'
import type { FuzzyMatch } from '../../browser/fuzzy.ts'
import { scanDirectory } from '../../browser/scanner.ts'
import { processMarkdown } from '../../pipeline/processor.ts'
import type { ThemeTokens } from '../../theme/types.ts'
import { createDirectoryWatcher, createFileWatcher } from '../../watcher/watcher.ts'
import { type MediaEntry, renderToOpenTUI, renderToOpenTUIWithMedia } from './index.tsx'
import type { TocEntry } from './toc.ts'

export interface PreviewCacheEntry {
	content: ReactNode
	renderTimeMs: number
}

// directory scan effect — returns cleanup function for useEffect
export function scanDirectoryEffect(dir: string, dispatch: React.Dispatch<AppAction>): () => void {
	let cancelled = false

	scanDirectory(dir).then(
		(files) => {
			if (!cancelled) dispatch({ type: 'ScanComplete', files })
		},
		(err: unknown) => {
			if (cancelled) return
			const message = err instanceof Error ? err.message : 'scan failed'
			dispatch({ type: 'ScanError', error: message })
		},
	)

	return () => {
		cancelled = true
	}
}

export function renderBrowserPreview(
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
				const errNode = <text fg={theme.fallback.textColor}>preview error: {result.error}</text>
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
			setContent(<text fg={theme.fallback.textColor}>cannot read file</text>)
		}
	})()
}

// cache-first browser preview — resolves match, checks cache, triggers background render on miss
export function updateBrowserPreview(
	filteredMatches: FuzzyMatch[],
	state: AppState,
	theme: ThemeTokens,
	cursorRef: React.RefObject<number>,
	cache: Map<string, PreviewCacheEntry>,
	setContent: (content: ReactNode) => void,
	setRenderTime: (ms: number) => void,
): void {
	if (filteredMatches.length === 0) {
		setContent(null)
		return
	}

	const match = filteredMatches[state.browser.cursorIndex]
	if (match == null) return

	const filePath = match.entry.absolutePath
	const cached = cache.get(filePath)
	if (cached != null) {
		setContent(cached.content)
		setRenderTime(cached.renderTimeMs)
		return
	}

	const cursorSnapshot = state.browser.cursorIndex
	cursorRef.current = cursorSnapshot
	renderBrowserPreview(
		filePath,
		cursorSnapshot,
		cursorRef,
		cache,
		state,
		theme,
		setContent,
		setRenderTime,
	)
}

// start directory watcher, returns cleanup function for useEffect
export function startDirectoryWatcher(
	browserDir: string,
	previewCacheRef: React.RefObject<Map<string, PreviewCacheEntry>>,
	setContent: (content: ReactNode) => void,
	dispatch: React.Dispatch<AppAction>,
): (() => void) | undefined {
	const scanId = { current: 0 }

	try {
		const watcher = createDirectoryWatcher(browserDir, {
			onEvent: () => {
				const id = ++scanId.current
				scanDirectory(browserDir)
					.then((files) => {
						if (scanId.current !== id) return
						previewCacheRef.current.clear()
						setContent(null)
						dispatch({ type: 'RescanComplete', files })
					})
					.catch(() => {})
			},
		})

		return () => {
			watcher.close()
		}
	} catch {
		return undefined
	}
}

// start file watcher for live reload, returns cleanup function for useEffect
export function startFileWatcher(
	watchedFile: string,
	reloadFile: (path: string) => void,
	dispatch: React.Dispatch<AppAction>,
): (() => void) | undefined {
	try {
		const watcher = createFileWatcher(watchedFile, {
			onEvent: (event) => {
				if (event.type === 'change') reloadFile(watchedFile)
				else if (event.type === 'delete') dispatch({ type: 'FileDeleted' })
			},
		})
		return () => watcher.close()
	} catch {
		return undefined
	}
}

export function openFileFromBrowser(
	path: string,
	state: AppState,
	theme: ThemeTokens,
	dispatch: React.Dispatch<AppAction>,
	setViewerState: React.Dispatch<React.SetStateAction<ViewerState>>,
	setBrowserPreviewContent: (c: ReactNode) => void,
): void {
	void (async () => {
		try {
			const markdown = await Bun.file(path).text()
			const result = await processMarkdown(markdown, theme)

			if (!result.ok) {
				setBrowserPreviewContent(
					<text fg={theme.fallback.textColor}>pipeline error: {result.error}</text>,
				)
				return
			}

			dispatch({ type: 'OpenFile', path })

			const termWidth = state.dimensions.width
			const panes = paneDimensions(state.layout, termWidth, state.dimensions.height, 'viewer')
			const width = (panes.preview?.width ?? termWidth) - 4
			const {
				jsx: rendered,
				mediaNodes,
				tocEntries,
				estimatedTotalHeight,
			} = renderToOpenTUIWithMedia(result.value, width)

			setViewerState({
				content: rendered,
				raw: markdown,
				mediaNodes,
				tocEntries,
				estimatedTotalHeight,
			})
		} catch {
			setBrowserPreviewContent(<text fg={theme.fallback.textColor}>cannot read file</text>)
		}
	})()
}

type ViewerState = {
	content: ReactNode
	raw: string
	mediaNodes: MediaEntry[]
	tocEntries: TocEntry[]
	estimatedTotalHeight: number
}

export interface ReloadContext {
	changeIdRef: RefObject<number>
	previewRef: RefObject<ScrollBoxRenderable | null>
	setViewerState: React.Dispatch<React.SetStateAction<ViewerState>>
	setRenderTimeMs: (ms: number) => void
}

export function reloadViewerFile(
	watchedPath: string,
	state: AppState,
	theme: ThemeTokens,
	ctx: ReloadContext,
): void {
	const changeId = ++ctx.changeIdRef.current
	void (async () => {
		try {
			const t0 = performance.now()
			const markdown = await Bun.file(watchedPath).text()
			if (ctx.changeIdRef.current !== changeId) return

			const result = await processMarkdown(markdown, theme)
			if (ctx.changeIdRef.current !== changeId) return

			if (!result.ok) {
				ctx.setViewerState((prev) => ({ ...prev, raw: markdown }))
				return
			}

			const panes = paneDimensions(
				state.layout,
				state.dimensions.width,
				state.dimensions.height,
				'viewer',
			)
			const width = (panes.preview?.width ?? state.dimensions.width) - 4
			const {
				jsx: rendered,
				mediaNodes,
				tocEntries,
				estimatedTotalHeight,
			} = renderToOpenTUIWithMedia(result.value, width)
			const elapsed = performance.now() - t0

			if (ctx.changeIdRef.current !== changeId) return

			const scrollBefore = ctx.previewRef.current?.scrollTop ?? 0
			ctx.setViewerState({
				content: rendered,
				raw: markdown,
				mediaNodes,
				tocEntries,
				estimatedTotalHeight,
			})
			ctx.setRenderTimeMs(elapsed)
			queueMicrotask(() => {
				ctx.previewRef.current?.scrollTo(scrollBefore)
			})
		} catch {
			// read failed — silently ignore
		}
	})()
}
