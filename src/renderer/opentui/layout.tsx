// layout renderers — compose pane components into browser or viewer layouts.

import type { ScrollBoxRenderable } from '@opentui/core'
import type { ReactNode } from 'react'

import type { AppState, paneDimensions } from '../../app/state.ts'
import type { FuzzyMatch } from '../../browser/fuzzy.ts'
import type { ThemeTokens } from '../../theme/types.ts'

import { BrowserPane } from './browser-pane.tsx'
import { PreviewPane } from './preview-pane.tsx'
import { SourcePane } from './source-pane.tsx'

export interface ViewerMouseHandlers {
	onSourceMouseDown: () => void
	onPreviewMouseDown: () => void
	onSourceMouseScroll: () => void
	onPreviewMouseScroll: () => void
}

export function renderBrowserLayout(
	state: AppState,
	panes: ReturnType<typeof paneDimensions>,
	matches: FuzzyMatch[],
	previewContent: ReactNode,
	theme: ThemeTokens,
	browserRef: React.RefObject<ScrollBoxRenderable | null>,
	previewRef: React.RefObject<ScrollBoxRenderable | null>,
): ReactNode {
	const hasBrowser = panes.browser != null
	const hasPreview = panes.preview != null

	const browserProps = {
		matches,
		filter: state.browser.filter,
		cursorIndex: state.browser.cursorIndex,
		totalFiles: state.browser.files.length,
		scanStatus: state.browser.scanStatus,
		...(state.browser.scanError != null ? { scanError: state.browser.scanError } : {}),
		focused: true as const,
		theme,
		scrollRef: browserRef,
	}

	const browserPane = hasBrowser ? <BrowserPane {...browserProps} /> : null

	if (!hasPreview) return browserPane

	const direction = state.layout === 'side' ? 'row' : 'column'

	return (
		<box style={{ flexDirection: direction, flexGrow: 1 }}>
			{browserPane}
			<PreviewPane
				content={
					previewContent ?? <text color={theme.fallback.textColor}>select a file to preview</text>
				}
				focused={false}
				theme={theme}
				scrollRef={previewRef}
			/>
		</box>
	)
}

export function renderViewerLayout(
	state: AppState,
	panes: ReturnType<typeof paneDimensions>,
	content: ReactNode,
	raw: string,
	theme: ThemeTokens,
	sourceRef: React.RefObject<ScrollBoxRenderable | null>,
	previewRef: React.RefObject<ScrollBoxRenderable | null>,
	mouse: ViewerMouseHandlers,
): ReactNode {
	const hasSource = panes.source != null
	const hasPreview = panes.preview != null

	if (hasPreview && !hasSource) {
		return <PreviewPane content={content} focused theme={theme} scrollRef={previewRef} />
	}
	if (hasSource && !hasPreview) {
		return <SourcePane content={raw} focused theme={theme} scrollRef={sourceRef} />
	}

	const direction = state.layout === 'side' ? 'row' : 'column'
	const sourceFocused = state.focus === 'source'

	return (
		<box style={{ flexDirection: direction, flexGrow: 1 }}>
			<SourcePane
				content={raw}
				focused={sourceFocused}
				theme={theme}
				scrollRef={sourceRef}
				width={panes.source?.width}
				height={panes.source?.height}
				onMouseDown={mouse.onSourceMouseDown}
				onMouseScroll={mouse.onSourceMouseScroll}
			/>
			<PreviewPane
				content={content}
				focused={!sourceFocused}
				theme={theme}
				scrollRef={previewRef}
				width={panes.preview?.width}
				height={panes.preview?.height}
				onMouseDown={mouse.onPreviewMouseDown}
				onMouseScroll={mouse.onPreviewMouseScroll}
			/>
		</box>
	)
}
