// source pane — raw markdown text in a scrollbox.

import type { ScrollBoxRenderable } from '@opentui/core'
import type { RefObject } from 'react'

import type { ThemeTokens } from '../../theme/types.ts'

interface SourcePaneProps {
	content: string
	focused: boolean
	theme: ThemeTokens
	scrollRef: RefObject<ScrollBoxRenderable | null>
	width?: number
	height?: number
	onMouseDown?: () => void
	onMouseScroll?: () => void
}

// chunk raw text into groups of lines to reduce React element count
function chunkLines(text: string, chunkSize: number): string[] {
	const lines = text.split('\n')
	const chunks: string[] = []
	for (let i = 0; i < lines.length; i += chunkSize) {
		chunks.push(lines.slice(i, i + chunkSize).join('\n'))
	}
	return chunks
}

export function SourcePane({ content, focused, theme, scrollRef, width, height, onMouseDown, onMouseScroll }: Readonly<SourcePaneProps>) {
	const chunks = chunkLines(content, 100)
	const borderColor = focused
		? theme.pane.focusedBorderColor
		: theme.pane.unfocusedBorderColor

	const rootOptions: Record<string, unknown> = { flexGrow: 1, borderColor, borderStyle: 'single' }
	rootOptions['width'] = width ?? '100%'
	if (height != null) rootOptions['height'] = height

	return (
		<scrollbox
			ref={scrollRef}
			focused={focused}
			viewportCulling
			border
			onMouseDown={onMouseDown}
			onMouseScroll={onMouseScroll}
			style={{ rootOptions }}
		>
			<box style={{ flexDirection: 'column', padding: 1 }}>
				{chunks.map((chunk, i) => (
					<text key={`src-${String(i)}`} color={theme.paragraph.textColor}>
						{chunk}
					</text>
				))}
			</box>
		</scrollbox>
	)
}
