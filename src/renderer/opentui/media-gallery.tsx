// media gallery — floating picker panel showing all media nodes with focus highlight.
// appears when a media node is focused (n/N) and persists in modal mode.

import type { ReactNode } from 'react'

import type { MediaIRNode } from '../../ir/types.ts'
import type { ThemeTokens } from '../../theme/types.ts'
import type { MediaEntry } from './index.tsx'

// -- helpers --

function basename(urlOrPath: string): string {
	const parts = urlOrPath.split('/')
	return parts[parts.length - 1] ?? urlOrPath
}

function mediaUrl(node: MediaIRNode): string | undefined {
	if (node.type === 'image') return node.url
	return node.src
}

function typeIcon(node: MediaIRNode): string {
	switch (node.type) {
		case 'image':
			return 'img'
		case 'video':
			return 'vid'
		case 'audio':
			return 'aud'
	}
}

function truncate(text: string, maxLen: number): string {
	if (text.length <= maxLen) return text
	return `${text.slice(0, maxLen - 1)}…`
}

// compute gallery dimensions — used by modal to reserve space
export function galleryDimensions(
	mediaCount: number,
	termWidth: number,
): { width: number; height: number } {
	if (mediaCount === 0) return { width: 0, height: 0 }
	const maxVisible = Math.min(mediaCount, 8)
	return {
		width: Math.min(40, Math.floor(termWidth * 0.4)),
		height: maxVisible + 3,
	}
}

// -- gallery component --

export interface MediaGalleryProps {
	readonly mediaNodes: MediaEntry[]
	readonly focusedIndex: number
	readonly theme: ThemeTokens
	readonly termWidth: number
	readonly termHeight: number
}

export function MediaGallery({
	mediaNodes,
	focusedIndex,
	theme,
	termWidth,
	termHeight: _termHeight,
}: MediaGalleryProps): ReactNode {
	if (mediaNodes.length === 0) return null

	const maxVisible = Math.min(mediaNodes.length, 8)
	// +2 for top border + title row, +1 for bottom border
	const galleryHeight = maxVisible + 3
	const galleryWidth = Math.min(40, Math.floor(termWidth * 0.4))
	const labelWidth = galleryWidth - 4 // border + padding

	// keep focused item visible with a sliding window
	const half = Math.floor(maxVisible / 2)
	let scrollStart = Math.max(0, focusedIndex - half)
	const scrollEnd = Math.min(mediaNodes.length, scrollStart + maxVisible)
	if (scrollEnd === mediaNodes.length) {
		scrollStart = Math.max(0, scrollEnd - maxVisible)
	}

	const visibleNodes = mediaNodes.slice(scrollStart, scrollEnd)
	const bt = theme.browser

	return (
		<box
			style={{
				position: 'absolute',
				bottom: 2,
				left: 1,
				width: galleryWidth,
				height: galleryHeight,
				zIndex: 150,
				flexDirection: 'column',
				backgroundColor: theme.codeBlock.backgroundColor,
			}}
			border
			borderColor={theme.pane.focusedBorderColor}
		>
			<text>
				<span fg={theme.pane.focusedBorderColor} bold>
					{` Media [${String(focusedIndex + 1)}/${String(mediaNodes.length)}]`}
				</span>
			</text>
			{visibleNodes.map((entry, i) => {
				const globalIdx = scrollStart + i
				const isFocused = globalIdx === focusedIndex
				const url = mediaUrl(entry.node)
				const name = url != null ? basename(url) : entry.node.alt
				const icon = typeIcon(entry.node)
				const prefix = isFocused ? '>' : ' '
				const label = truncate(`${prefix} [${icon}] ${name}`, labelWidth)

				const rowProps: Record<string, unknown> = {}
				if (isFocused) {
					rowProps['bg'] = bt.selectedBg
					rowProps['fg'] = bt.selectedFg
				} else {
					rowProps['fg'] = theme.paragraph.textColor
				}

				return (
					<text key={`mg-${String(globalIdx)}`}>
						<span {...rowProps}>{label}</span>
					</text>
				)
			})}
		</box>
	)
}
