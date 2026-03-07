// file processing helpers — browser preview rendering, file open, and live reload.

import type { ScrollBoxRenderable } from '@opentui/core'
import type { ReactNode, RefObject } from 'react'

import type { AppAction, AppState } from '../../app/state.ts'
import type { ThemeTokens } from '../../theme/types.ts'

import { paneDimensions } from '../../app/state.ts'
import { processMarkdown } from '../../pipeline/processor.ts'
import { type MediaEntry, renderToOpenTUI, renderToOpenTUIWithMedia } from './index.tsx'

export interface PreviewCacheEntry {
	content: ReactNode
	renderTimeMs: number
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
					<text color={theme.fallback.textColor}>pipeline error: {result.error}</text>,
				)
				return
			}

			dispatch({ type: 'OpenFile', path })

			const termWidth = state.dimensions.width
			const panes = paneDimensions(state.layout, termWidth, state.dimensions.height, 'viewer')
			const width = (panes.preview?.width ?? termWidth) - 4
			const { jsx: rendered, mediaNodes } = renderToOpenTUIWithMedia(result.value, width)

			setViewerState({ content: rendered, raw: markdown, mediaNodes })
		} catch {
			setBrowserPreviewContent(<text color={theme.fallback.textColor}>cannot read file</text>)
		}
	})()
}

type ViewerState = { content: ReactNode; raw: string; mediaNodes: MediaEntry[] }

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
			const { jsx: rendered, mediaNodes } = renderToOpenTUIWithMedia(result.value, width)
			const elapsed = performance.now() - t0

			if (ctx.changeIdRef.current !== changeId) return

			const scrollBefore = ctx.previewRef.current?.scrollTop ?? 0
			ctx.setViewerState({ content: rendered, raw: markdown, mediaNodes })
			ctx.setRenderTimeMs(elapsed)
			queueMicrotask(() => {
				ctx.previewRef.current?.scrollTo(scrollBefore)
			})
		} catch {
			// read failed — silently ignore
		}
	})()
}
