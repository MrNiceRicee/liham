// preview pane — rendered markdown in a scrollbox.

import type { ScrollBoxRenderable } from '@opentui/core'
import type { ReactNode, RefObject } from 'react'

import type { ThemeTokens } from '../../theme/types.ts'

interface PreviewPaneProps {
	content: ReactNode
	focused: boolean
	theme: ThemeTokens
	scrollRef: RefObject<ScrollBoxRenderable | null>
	onMouseDown?: () => void
	onMouseScroll?: () => void
}

export function PreviewPane({ content, focused, theme, scrollRef, onMouseDown, onMouseScroll }: Readonly<PreviewPaneProps>) {
	const borderColor = focused
		? theme.pane.focusedBorderColor
		: theme.pane.unfocusedBorderColor

	return (
		<scrollbox
			ref={scrollRef}
			focused={focused}
			viewportCulling
			border
			onMouseDown={onMouseDown}
			onMouseScroll={onMouseScroll}
			style={{
				rootOptions: { width: '100%', flexGrow: 1, borderColor, borderStyle: 'single' },
			}}
		>
			<box style={{ flexDirection: 'column', padding: 1 }}>{content}</box>
		</scrollbox>
	)
}
