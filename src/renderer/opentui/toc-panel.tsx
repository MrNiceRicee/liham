// TOC panel — heading list in a FloatingPanel, right-aligned.

import type { ReactNode } from 'react'

import type { ThemeTokens } from '../../theme/types.ts'
import { FloatingPanel, type FloatingPanelItem } from './floating-panel.tsx'
import { type TocEntry, tocToItems } from './toc.ts'

interface TocPanelProps {
	readonly entries: readonly TocEntry[]
	readonly cursorIndex: number
	readonly theme: ThemeTokens
	readonly termWidth: number
	readonly termHeight: number
}

export function TocPanel({
	entries,
	cursorIndex,
	theme,
	termWidth,
	termHeight,
}: Readonly<TocPanelProps>): ReactNode {
	if (entries.length === 0) return null

	const items: FloatingPanelItem[] = tocToItems(entries)
	const panelWidth = Math.min(30, Math.floor(termWidth * 0.35))
	const maxVisible = Math.min(entries.length, termHeight - 4) // leave room for status bar + chrome
	const panelHeight = Math.min(entries.length, maxVisible) + 3 // items + title + border

	return (
		<FloatingPanel
			position="right"
			width={panelWidth}
			height={panelHeight}
			zIndex={120}
			title={`TOC [${String(cursorIndex + 1)}/${String(entries.length)}]`}
			theme={theme}
			items={items}
			cursorIndex={cursorIndex}
			maxVisible={maxVisible}
			termWidth={termWidth}
		/>
	)
}
