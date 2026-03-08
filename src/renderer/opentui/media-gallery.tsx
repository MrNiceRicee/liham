// media gallery — floating picker panel showing all media nodes with focus highlight.
// appears when a media node is focused (n/N) and persists in modal mode.
// when in modal mode, shows media info (type, frame count, playback state) for the focused item.

import type { ReactNode } from 'react'

import type { MediaIRNode } from '../../ir/types.ts'
import type { ThemeTokens } from '../../theme/types.ts'
import type { MediaEntry } from './index.tsx'
import type { FrameInfo } from './media-modal.tsx'

// -- helpers --

function basename(urlOrPath: string): string {
	const parts = urlOrPath.split('/')
	return parts[parts.length - 1] ?? urlOrPath
}

function mediaUrl(node: MediaIRNode): string | undefined {
	if (node.type === 'image') return node.url
	return node.src
}

function imageFormat(node: MediaIRNode): string | null {
	const url = node.type === 'image' ? node.url : node.src
	if (url == null) return null
	const ext = url.split('.').pop()?.toLowerCase()
	if (ext === 'gif') return 'gif'
	if (ext === 'png') return 'png'
	if (ext === 'jpg' || ext === 'jpeg') return 'jpeg'
	if (ext === 'webp') return 'webp'
	if (ext === 'svg') return 'svg'
	return null
}

function typeIcon(node: MediaIRNode): string {
	if (node.type === 'image') {
		const fmt = imageFormat(node)
		return fmt ?? 'img'
	}
	return node.type === 'video' ? 'vid' : 'aud'
}

function truncate(text: string, maxLen: number): string {
	if (text.length <= maxLen) return text
	return `${text.slice(0, maxLen - 1)}…`
}

function mediaTypeLabel(node: MediaIRNode): string {
	if (node.type === 'image') return imageFormat(node) ?? 'image'
	return node.type === 'video' ? 'video' : 'audio'
}

function formatMediaInfo(node: MediaIRNode, frameInfo: FrameInfo | null, paused: boolean): string {
	const parts = [mediaTypeLabel(node)]
	if (frameInfo != null) {
		parts.push(`${String(frameInfo.frameCount)} frames`)
		parts.push(paused ? 'paused' : 'playing')
	}
	return parts.join(' | ')
}

// compute gallery dimensions — used by modal to reserve space
export function galleryDimensions(
	mediaCount: number,
	termWidth: number,
	hasInfo = false,
): { width: number; height: number } {
	if (mediaCount === 0) return { width: 0, height: 0 }
	const maxVisible = Math.min(mediaCount, 8)
	return {
		width: Math.min(40, Math.floor(termWidth * 0.4)),
		height: maxVisible + 3 + (hasInfo ? 1 : 0),
	}
}

// -- gallery component --

export interface MediaGalleryProps {
	readonly mediaNodes: MediaEntry[]
	readonly focusedIndex: number
	readonly theme: ThemeTokens
	readonly termWidth: number
	readonly termHeight: number
	readonly frameInfo?: FrameInfo | null
	readonly paused?: boolean
}

export function MediaGallery({
	mediaNodes,
	focusedIndex,
	theme,
	termWidth,
	termHeight: _termHeight,
	frameInfo,
	paused = false,
}: MediaGalleryProps): ReactNode {
	if (mediaNodes.length === 0) return null

	const hasInfo = frameInfo != null
	const maxVisible = Math.min(mediaNodes.length, 8)
	// +2 for top border + title row, +1 for bottom border, +1 if showing info
	const galleryHeight = maxVisible + 3 + (hasInfo ? 1 : 0)
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
				<span fg={theme.pane.focusedBorderColor}>
					<b>{` Media [${String(focusedIndex + 1)}/${String(mediaNodes.length)}]`}</b>
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
			{hasInfo && (
				<text>
					<span fg={theme.pane.focusedBorderColor}>
						{` ${truncate(formatMediaInfo(mediaNodes[focusedIndex]!.node, frameInfo, paused), labelWidth)}`}
					</span>
				</text>
			)}
		</box>
	)
}
