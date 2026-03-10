// media gallery — floating picker panel showing all media nodes with focus highlight.
// appears when a media node is focused (n/N) and persists in modal mode.
// when in modal mode, shows media info (type, frame count, playback state) for the focused item.

import type { ReactNode } from 'react'

import type { MediaIRNode } from '../../ir/types.ts'
import type { ThemeTokens } from '../../theme/types.ts'
import { FloatingPanel, type FloatingPanelItem } from './floating-panel.tsx'
import type { MediaEntry } from './index.tsx'
import type { FrameInfo, VideoPlaybackInfo } from './media-modal.tsx'

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

export function formatTimestamp(seconds: number): string {
	const total = Math.floor(Math.max(0, seconds))
	const h = Math.floor(total / 3600)
	const m = Math.floor((total % 3600) / 60)
	const s = total % 60
	if (h > 0) return `${String(h)}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
	return `${String(m)}:${String(s).padStart(2, '0')}`
}

export function formatProgressBar(elapsed: number, duration: number, barWidth: number): string {
	const elapsedStr = formatTimestamp(elapsed)
	if (duration <= 0) return elapsedStr
	const durationStr = formatTimestamp(duration)
	const timeText = ` ${elapsedStr} / ${durationStr}`
	const availableBar = barWidth - timeText.length
	if (availableBar < 3) return `${elapsedStr} / ${durationStr}`
	const ratio = Math.min(1, Math.max(0, elapsed / duration))
	const filled = Math.round(ratio * availableBar)
	const empty = availableBar - filled
	return `${'~'.repeat(filled)}${'o'.repeat(empty)}${timeText}`
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
	hasProgress = false,
): { width: number; height: number } {
	if (mediaCount === 0) return { width: 0, height: 0 }
	const maxVisible = Math.min(mediaCount, 8)
	return {
		width: Math.min(40, Math.floor(termWidth * 0.4)),
		height: maxVisible + 3 + (hasInfo ? 1 : 0) + (hasProgress ? 1 : 0),
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
	readonly videoInfo?: VideoPlaybackInfo | null
	readonly volume?: number
	readonly muted?: boolean
}

export function MediaGallery({
	mediaNodes,
	focusedIndex,
	theme,
	termWidth,
	termHeight: _termHeight,
	frameInfo,
	paused = false,
	videoInfo,
	volume = 100,
	muted = false,
}: MediaGalleryProps): ReactNode {
	if (mediaNodes.length === 0) return null

	const hasInfo = frameInfo != null
	const hasProgress = videoInfo != null
	const maxVisible = Math.min(mediaNodes.length, 8)
	const galleryHeight = maxVisible + 3 + (hasInfo ? 1 : 0) + (hasProgress ? 1 : 0)
	const galleryWidth = Math.min(40, Math.floor(termWidth * 0.4))
	const labelWidth = galleryWidth - 4

	// convert media entries to FloatingPanelItems
	const items: FloatingPanelItem[] = mediaNodes.map((entry) => {
		const url = mediaUrl(entry.node)
		const name = url != null ? basename(url) : entry.node.alt
		const icon = typeIcon(entry.node)
		return { label: name, prefix: `[${icon}] ` }
	})

	// footer rows for info and progress
	const footerElements: ReactNode[] = []
	if (hasInfo) {
		footerElements.push(
			<text key="info">
				<span fg={theme.pane.focusedBorderColor}>
					{` ${truncate(formatMediaInfo(mediaNodes[focusedIndex]!.node, frameInfo, paused), labelWidth)}`}
				</span>
			</text>,
		)
	}
	if (hasProgress) {
		let volLabel = ''
		if (muted) volLabel = ' [M]'
		else if (volume < 100) volLabel = ` [${String(volume)}%]`
		const barWidth = labelWidth - volLabel.length
		footerElements.push(
			<text key="progress">
				<span fg={theme.pane.focusedBorderColor}>
					{` ${formatProgressBar(videoInfo.elapsed, videoInfo.duration, barWidth)}${volLabel}`}
				</span>
			</text>,
		)
	}

	return (
		<FloatingPanel
			position="bottom-left"
			width={galleryWidth}
			height={galleryHeight}
			zIndex={150}
			title={`Media [${String(focusedIndex + 1)}/${String(mediaNodes.length)}]`}
			theme={theme}
			items={items}
			cursorIndex={focusedIndex}
			maxVisible={maxVisible}
			termWidth={termWidth}
			footer={footerElements.length > 0 ? <>{footerElements}</> : undefined}
		/>
	)
}
