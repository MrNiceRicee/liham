// floating panel — reusable overlay component for gallery, TOC, and future panels.
// extracted from media-gallery.tsx. handles positioning, border, background,
// sliding window, and row rendering. key handling is a co-located utility function.

import type { KeyEvent } from '@opentui/core'
import type { ReactNode } from 'react'

import type { ThemeTokens } from '../../theme/types.ts'

// -- types --

export interface FloatingPanelItem {
	label: string
	prefix: string // e.g., media type icon, heading indent. '' for none.
}

export interface FloatingPanelProps {
	readonly position: 'bottom-left' | 'right'
	readonly width: number
	readonly height: number
	readonly zIndex: number
	readonly title: string | null
	readonly theme: ThemeTokens
	readonly items: readonly FloatingPanelItem[]
	readonly cursorIndex: number
	readonly maxVisible?: number | undefined
	readonly termWidth: number
	readonly footer?: ReactNode | undefined
}

// -- key handler utility --

export interface FloatingPanelKeyResult {
	consumed: boolean
	newCursor?: number | undefined
	action?: 'select' | 'close' | undefined
}

export function handleFloatingPanelKey(
	key: KeyEvent,
	itemCount: number,
	cursor: number,
): FloatingPanelKeyResult {
	if (itemCount === 0) {
		if (key.name === 'escape' || key.name === 'q') return { consumed: true, action: 'close' }
		return { consumed: false }
	}

	const max = itemCount - 1

	switch (key.name) {
		case 'j':
		case 'down':
			return { consumed: true, newCursor: Math.min(max, cursor + 1) }
		case 'k':
		case 'up':
			return { consumed: true, newCursor: Math.max(0, cursor - 1) }
		case 'g':
			if (key.shift) return { consumed: true, newCursor: max }
			return { consumed: true, newCursor: 0 }
		case 'home':
			return { consumed: true, newCursor: 0 }
		case 'end':
			return { consumed: true, newCursor: max }
		case 'return':
			return { consumed: true, action: 'select' }
		case 'escape':
		case 'q':
			return { consumed: true, action: 'close' }
		default:
			return { consumed: false }
	}
}

// -- component --

function truncate(text: string, maxLen: number): string {
	if (text.length <= maxLen) return text
	return `${text.slice(0, maxLen - 1)}…`
}

export function FloatingPanel({
	position,
	width,
	height,
	zIndex,
	title,
	theme,
	items,
	cursorIndex,
	maxVisible: maxVisibleProp,
	termWidth: _termWidth,
	footer,
}: FloatingPanelProps): ReactNode {
	const maxVisible = maxVisibleProp ?? 8
	const visibleCount = Math.min(items.length, maxVisible)
	const labelWidth = width - 4 // border + padding
	const bt = theme.browser

	// sliding window — keep cursor visible
	const half = Math.floor(visibleCount / 2)
	let scrollStart = Math.max(0, cursorIndex - half)
	const scrollEnd = Math.min(items.length, scrollStart + visibleCount)
	if (scrollEnd === items.length) {
		scrollStart = Math.max(0, scrollEnd - visibleCount)
	}

	const visibleItems = items.slice(scrollStart, scrollEnd)

	// position styles
	const positionStyle: Record<string, unknown> =
		position === 'bottom-left' ? { bottom: 2, left: 1 } : { top: 0, right: 0 }

	return (
		<box
			style={{
				position: 'absolute',
				...positionStyle,
				width,
				height,
				zIndex,
				flexDirection: 'column',
				backgroundColor: theme.codeBlock.backgroundColor,
			}}
			border
			borderColor={theme.pane.focusedBorderColor}
		>
			{title != null && (
				<text>
					<span fg={theme.pane.focusedBorderColor}>
						<b>{` ${title}`}</b>
					</span>
				</text>
			)}
			{visibleItems.map((item, i) => {
				const globalIdx = scrollStart + i
				const isFocused = globalIdx === cursorIndex
				const indicator = isFocused ? '>' : ' '
				const label = truncate(`${indicator} ${item.prefix}${item.label}`, labelWidth)

				const rowProps: Record<string, unknown> = {}
				if (isFocused) {
					rowProps['bg'] = bt.selectedBg
					rowProps['fg'] = bt.selectedFg
				} else {
					rowProps['fg'] = theme.paragraph.textColor
				}

				return (
					<text key={`fp-${String(globalIdx)}`}>
						<span {...rowProps}>{label}</span>
					</text>
				)
			})}
			{footer}
		</box>
	)
}
