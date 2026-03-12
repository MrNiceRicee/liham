// media modal overlay — full-screen media viewer.
// absolute positioned sibling of scrollbox content (does not scroll with content).
// media info (filename, type, frame count) lives in the gallery panel, not here.

import { resolve } from 'node:path'
import { type ReactNode, useContext, useEffect } from 'react'

import type { MediaIRNode } from '../../ir/types.ts'
import { detectAudioBackend } from '../../media/audio-backend.ts'
import { createFfplayBackend } from '../../media/ffplay-backend.ts'
import { createMpvBackend } from '../../media/mpv-backend.ts'
import type { MediaCapabilities } from '../../media/types.ts'
import { sanitizeForTerminal } from '../../pipeline/sanitize.ts'
import type { ThemeTokens } from '../../theme/types.ts'
import { ImageContext } from './image-context.tsx'
import type { MediaEntry } from './index.tsx'
import { type FrameInfo, ModalImageContent } from './modal-image.tsx'
import { type VideoPlaybackInfo, ModalVideoContent } from './video-playback.tsx'

export type { FrameInfo, VideoPlaybackInfo }

// -- helpers --

function mediaUrl(node: MediaIRNode): string | undefined {
	if (node.type === 'image') return node.url
	return node.src
}

// -- fallback for unsupported media --

function ModalMediaFallback({
	node,
	theme,
	hint,
}: {
	readonly node: MediaIRNode
	readonly theme: ThemeTokens
	readonly hint?: string | undefined
}): ReactNode {
	const label = node.type === 'video' ? 'video' : 'audio'
	return (
		<box flexDirection="column" alignItems="center" gap={1}>
			<text>
				<span fg={theme.image.fallbackColor}>
					[{label}: {sanitizeForTerminal(node.alt)}]
				</span>
			</text>
			{hint != null && (
				<text>
					<span fg={theme.image.fallbackColor}>{hint}</span>
				</text>
			)}
		</box>
	)
}

// -- main modal component --

export interface MediaModalProps {
	readonly mediaNodes: MediaEntry[]
	readonly mediaIndex: number
	readonly theme: ThemeTokens
	readonly termWidth: number
	readonly termHeight: number
	readonly paused: boolean
	readonly restartCount: number
	readonly seekOffset: number
	readonly volume: number
	readonly muted: boolean
	readonly mediaCapabilities: MediaCapabilities
	readonly onFrameInfo: (info: FrameInfo | null) => void
	readonly onVideoInfo: (info: VideoPlaybackInfo | null) => void
}

export function MediaModal({
	mediaNodes,
	mediaIndex,
	theme,
	termWidth,
	termHeight,
	paused,
	restartCount,
	seekOffset,
	volume,
	muted,
	mediaCapabilities,
	onFrameInfo,
	onVideoInfo,
}: MediaModalProps): ReactNode {
	const entry = mediaNodes[mediaIndex]
	const node = entry?.node
	const url = node != null ? mediaUrl(node) : undefined
	const ctx = useContext(ImageContext)

	const isVideo = node?.type === 'video' && mediaCapabilities.canPlayVideo
	const isAudio = node?.type === 'audio'

	// clear video playback info when not viewing video (prevents lingering timeline)
	useEffect(() => {
		if (!isVideo) onVideoInfo(null)
	}, [isVideo, mediaIndex])

	// audio-only playback — uses audio backend (mpv or ffplay) when an audio node is shown
	useEffect(() => {
		if (!isAudio || url == null) return
		const basePath = ctx?.basePath ?? process.cwd()
		const absPath = resolve(basePath, url)
		const backendKind = detectAudioBackend()
		const backend = backendKind === 'mpv' ? createMpvBackend() : createFfplayBackend()
		void backend.play(absPath, basePath)
		return () => {
			backend.kill()
		}
	}, [isAudio, url, mediaIndex])

	if (node == null) return null

	const renderContent = () => {
		if (node.type === 'image') {
			return (
				<ModalImageContent
					url={url}
					alt={node.alt}
					theme={theme}
					maxCols={termWidth}
					maxRows={termHeight}
					paused={paused}
					onFrameInfo={onFrameInfo}
				/>
			)
		}
		if (isVideo) {
			return (
				<ModalVideoContent
					src={url ?? ''}
					alt={node.alt}
					theme={theme}
					maxCols={termWidth}
					maxRows={termHeight}
					basePath={ctx?.basePath ?? process.cwd()}
					bgColor={ctx?.bgColor ?? ''}
					restartCount={restartCount}
					seekOffset={seekOffset}
					paused={paused}
					volume={volume}
					muted={muted}
					onVideoInfo={onVideoInfo}
				/>
			)
		}
		const hint =
			node.type === 'video' && !mediaCapabilities.canPlayVideo
				? 'install ffmpeg to play video'
				: undefined
		return <ModalMediaFallback node={node} theme={theme} hint={hint} />
	}

	return (
		<box
			style={{
				position: 'absolute',
				top: 0,
				left: 0,
				width: termWidth,
				height: termHeight,
				zIndex: 100,
				justifyContent: 'center',
				alignItems: 'center',
				backgroundColor: theme.codeBlock.backgroundColor,
			}}
		>
			{renderContent()}
		</box>
	)
}
