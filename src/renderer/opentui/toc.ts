// TOC types — heading entry and conversion to FloatingPanelItem.

import type { FloatingPanelItem } from './floating-panel.tsx'

export interface TocEntry {
	level: 1 | 2 | 3 | 4 | 5 | 6
	text: string
	blockIndex: number
	estimatedOffset: number
}

// convert TocEntry[] to FloatingPanelItem[] with normalized indentation.
// normalize: minimum heading level gets zero indent, each level above adds 2 spaces.
export function tocToItems(entries: readonly TocEntry[]): FloatingPanelItem[] {
	if (entries.length === 0) return []

	const minLevel = Math.min(...entries.map((e) => e.level))

	return entries.map((entry) => {
		const indent = '  '.repeat(entry.level - minLevel)
		return { label: entry.text, prefix: indent }
	})
}
