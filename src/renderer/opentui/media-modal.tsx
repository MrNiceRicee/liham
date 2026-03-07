// media modal overlay — full-screen media viewer with info bar.
// absolute positioned sibling of scrollbox content (does not scroll with content).

import { type ReactNode, useContext, useMemo } from 'react'

import type { MediaIRNode } from '../../ir/types.ts'
import type { ThemeTokens } from '../../theme/types.ts'
import type { MediaEntry } from './index.tsx'

import { type MergedSpan, renderHalfBlockMerged } from '../../media/halfblock.ts'
import { sanitizeForTerminal } from '../../pipeline/sanitize.ts'
import { ImageContext } from './image-context.tsx'
import { useImageLoader } from './use-image-loader.ts'

// -- helpers --

function basename(urlOrPath: string): string {
	const parts = urlOrPath.split('/')
	return parts[parts.length - 1] ?? urlOrPath
}

function mediaUrl(node: MediaIRNode): string | undefined {
	if (node.type === 'image') return node.url
	return node.src
}

function mediaTypeLabel(node: MediaIRNode): string {
	switch (node.type) {
		case 'image':
			return 'image'
		case 'video':
			return 'video'
		case 'audio':
			return 'audio'
	}
}

// -- half-block rows for modal (reused from image.tsx pattern) --

function ModalHalfBlockRows({
	rows,
	width,
}: {
	readonly rows: MergedSpan[][]
	readonly width: number
}): ReactNode {
	return (
		<box style={{ height: rows.length, width, justifyContent: 'center' }}>
			{rows.map((spans, rowIdx) => (
				<text key={`mhb-${String(rowIdx)}`}>
					{spans.map((s, sIdx) => {
						const props: Record<string, unknown> = {}
						if (s.bg.length > 0) props['bg'] = s.bg
						if (s.fg.length > 0) props['fg'] = s.fg
						return (
							<span key={`ms-${String(rowIdx)}-${String(sIdx)}`} {...props}>
								{s.text}
							</span>
						)
					})}
				</text>
			))}
		</box>
	)
}

// -- modal image content --

function ModalImageContent({
	url,
	alt,
	theme,
	maxCols,
	maxRows,
}: {
	readonly url: string | undefined
	readonly alt: string
	readonly theme: ThemeTokens
	readonly maxCols: number
	readonly maxRows: number
}): ReactNode {
	const ctx = useContext(ImageContext)
	// override context with full-viewport dimensions for lightbox rendering
	const modalCtx = useMemo(
		() => (ctx != null ? { ...ctx, maxCols, maxRows } : null),
		[ctx, maxCols, maxRows],
	)
	const { state, image } = useImageLoader(url, modalCtx, true)

	if (ctx == null || url == null || ctx.capabilities.protocol === 'text') {
		return (
			<text>
				<span fg={theme.image.fallbackColor}>[image: {sanitizeForTerminal(alt)}]</span>
			</text>
		)
	}

	if (state === 'loading' || state === 'idle') {
		return (
			<text>
				<span fg={theme.image.fallbackColor}>[loading: {sanitizeForTerminal(alt)}]</span>
			</text>
		)
	}

	if (state === 'error' || image == null) {
		return (
			<text>
				<span fg={theme.image.fallbackColor}>[image: {sanitizeForTerminal(alt)}]</span>
			</text>
		)
	}

	// always use halfblock in modal for simplicity (same as inline animated GIF)
	const rows = renderHalfBlockMerged(image, ctx.bgColor)
	return <ModalHalfBlockRows rows={rows} width={image.terminalCols} />
}

// -- main modal component --

export interface MediaModalProps {
	readonly mediaNodes: MediaEntry[]
	readonly mediaIndex: number
	readonly theme: ThemeTokens
	readonly termWidth: number
	readonly termHeight: number
}

export function MediaModal({
	mediaNodes,
	mediaIndex,
	theme,
	termWidth,
	termHeight,
}: MediaModalProps): ReactNode {
	const entry = mediaNodes[mediaIndex]
	if (entry == null) return null

	const node = entry.node
	const url = mediaUrl(node)
	const filename = url != null ? basename(url) : node.alt
	const typeLabel = mediaTypeLabel(node)
	const position = `[${String(mediaIndex + 1)}/${String(mediaNodes.length)}]`

	// content area = full height minus info bar (2 rows)
	const infoBarHeight = 2
	const contentRows = Math.max(1, termHeight - infoBarHeight)

	return (
		<box
			style={{
				position: 'absolute',
				top: 0,
				left: 0,
				width: termWidth,
				height: termHeight,
				zIndex: 100,
				flexDirection: 'column',
				backgroundColor: theme.bg,
			}}
		>
			<box
				style={{
					height: contentRows,
					justifyContent: 'center',
					alignItems: 'center',
				}}
			>
				{node.type === 'image' ? (
					<ModalImageContent
						url={url}
						alt={node.alt}
						theme={theme}
						maxCols={termWidth}
						maxRows={contentRows}
					/>
				) : node.type === 'video' ? (
					<text>
						<span fg={theme.image.fallbackColor}>[video: {sanitizeForTerminal(node.alt)}]</span>
					</text>
				) : (
					<text>
						<span fg={theme.image.fallbackColor}>[audio: {sanitizeForTerminal(node.alt)}]</span>
					</text>
				)}
			</box>
			<box border={['top']} style={{ height: 2 }}>
				<text>
					<span fg={theme.paragraph.textColor}>
						{sanitizeForTerminal(filename)} | {typeLabel} | {position}
					</span>
				</text>
			</box>
		</box>
	)
}
