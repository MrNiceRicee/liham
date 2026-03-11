// halfblock rendering — shared half-block grid components, kitty exit cleanup,
// scroll-into-view hook, and media basename utility.
// extracted from image.tsx, video-thumbnail.tsx, and modal-image.tsx.

import { writeSync } from 'node:fs'
import type { BoxRenderable, ScrollBoxRenderable } from '@opentui/core'
import { memo, type ReactNode, useEffect } from 'react'

import type { MergedSpan } from '../../media/halfblock.ts'
import { buildCleanupCommand } from '../../media/kitty.ts'

// -- kitty exit cleanup (shared between image + video thumbnail) --

export const activeImageIds = new Set<number>()
let exitHandlerRegistered = false

export function registerKittyExitHandler(): void {
	if (exitHandlerRegistered) return
	exitHandlerRegistered = true
	process.on('exit', () => {
		if (activeImageIds.size === 0) return
		for (const id of activeImageIds) {
			writeSync(1, buildCleanupCommand(id))
		}
	})
}

// -- renderSpans utility --

export function renderSpans(spans: MergedSpan[], rowIdx: number, keyPrefix: string): ReactNode[] {
	return spans.map((s, sIdx) => {
		const props: Record<string, unknown> = {}
		if (s.bg.length > 0) props['bg'] = s.bg
		if (s.fg.length > 0) props['fg'] = s.fg
		return (
			<span key={`${keyPrefix}-${String(rowIdx)}-${String(sIdx)}`} {...props}>
				{s.text}
			</span>
		)
	})
}

// -- HalfBlockRows component --

interface HalfBlockRowsProps {
	readonly rows: MergedSpan[][]
	readonly width: number
	readonly keyPrefix?: string | undefined
	readonly spanPrefix?: string | undefined
	readonly href?: string | undefined
	readonly centered?: boolean | undefined
}

export const HalfBlockRows = memo(
	function HalfBlockRows({
		rows,
		width,
		keyPrefix = 'hb',
		spanPrefix = 's',
		href,
		centered,
	}: HalfBlockRowsProps) {
		const style = centered
			? { height: rows.length, width, justifyContent: 'center' as const }
			: { height: rows.length, width }
		return (
			<box style={style}>
				{rows.map((spans, rowIdx) => (
					<text key={`${keyPrefix}-${String(rowIdx)}`}>
						{href != null ? (
							<a href={href}>{renderSpans(spans, rowIdx, spanPrefix)}</a>
						) : (
							renderSpans(spans, rowIdx, spanPrefix)
						)}
					</text>
				))}
			</box>
		)
	},
	(prev, next) => prev.rows === next.rows && prev.href === next.href,
)

// -- scroll-into-view hook --

export function useScrollIntoView(
	boxRef: React.RefObject<BoxRenderable | null>,
	scrollRef: React.RefObject<ScrollBoxRenderable | null> | undefined,
	isFocused: boolean,
): void {
	useEffect(() => {
		if (!isFocused || boxRef.current == null || scrollRef?.current == null) return
		const scrollbox = scrollRef.current
		const box = boxRef.current
		const boxTop = box.y - scrollbox.viewport.y + scrollbox.scrollTop
		const boxBottom = boxTop + box.height
		const scrollTop = scrollbox.scrollTop
		const viewHeight = scrollbox.height
		if (boxTop < scrollTop || boxBottom > scrollTop + viewHeight) {
			scrollbox.scrollTo(Math.max(0, boxTop - 2))
		}
	}, [isFocused])
}

// -- media basename utility --

export function mediaBasename(urlOrPath: string): string {
	const parts = urlOrPath.split('/')
	return parts[parts.length - 1] ?? urlOrPath
}
