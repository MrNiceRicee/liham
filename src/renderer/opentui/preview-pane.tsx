// preview pane — rendered markdown in a scrollbox.

import type { ScrollBoxRenderable } from '@opentui/core'
import type { ReactNode, RefObject } from 'react'

import type { ThemeTokens } from '../../theme/types.ts'

interface PreviewPaneProps {
	content: ReactNode
	focused: boolean
	theme: ThemeTokens
	scrollRef: RefObject<ScrollBoxRenderable | null>
	width?: number | undefined
	height?: number | undefined
	onMouseDown?: () => void
	onMouseScroll?: () => void
}

export function PreviewPane({
	content,
	focused,
	theme,
	scrollRef,
	width,
	height,
	onMouseDown,
	onMouseScroll,
}: Readonly<PreviewPaneProps>) {
	const borderColor = focused ? theme.pane.focusedBorderColor : theme.pane.unfocusedBorderColor

	const rootOptions: Record<string, unknown> = { flexGrow: 1, borderColor, borderStyle: 'single' }
	rootOptions['width'] = width ?? '100%'
	if (height != null) rootOptions['height'] = height

	return (
		<scrollbox
			ref={scrollRef}
			focused={focused}
			viewportCulling
			border
			{...(onMouseDown != null ? { onMouseDown } : {})}
			{...(onMouseScroll != null ? { onMouseScroll } : {})}
			style={{ rootOptions }}
		>
			<box style={{ flexDirection: 'column', padding: 1 }}>{content}</box>
		</scrollbox>
	)
}
