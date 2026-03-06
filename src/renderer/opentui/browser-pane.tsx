// browser pane — file list with directory grouping, fuzzy match highlights, and filter input.

import type { ScrollBoxRenderable } from '@opentui/core'
import type { ReactNode, RefObject } from 'react'

import type { ScanStatus } from '../../app/state.ts'
import type { FuzzyMatch } from '../../browser/fuzzy.ts'
import type { ThemeTokens } from '../../theme/types.ts'

interface BrowserPaneProps {
	matches: FuzzyMatch[]
	filter: string
	cursorIndex: number
	totalFiles: number
	scanStatus: ScanStatus
	scanError?: string
	focused: boolean
	theme: ThemeTokens
	scrollRef: RefObject<ScrollBoxRenderable | null>
	onMouseDown?: () => void
	onMouseScroll?: () => void
}

// render a filename with fuzzy match positions highlighted
function HighlightedName({
	text,
	positions,
	normalColor,
	highlightColor,
}: Readonly<{
	text: string
	positions: number[]
	normalColor: string
	highlightColor: string
}>): ReactNode {
	if (positions.length === 0) {
		return <text color={normalColor}>{text}</text>
	}

	const posSet = new Set(positions)
	const segments: ReactNode[] = []
	let current = ''
	let isHighlight = false

	for (let i = 0; i < text.length; i++) {
		const charHighlighted = posSet.has(i)
		if (charHighlighted !== isHighlight && current.length > 0) {
			segments.push(
				isHighlight
					? <text key={`h-${String(i)}`} color={highlightColor} bold>{current}</text>
					: <text key={`n-${String(i)}`} color={normalColor}>{current}</text>,
			)
			current = ''
		}
		current += text[i]
		isHighlight = charHighlighted
	}

	if (current.length > 0) {
		segments.push(
			isHighlight
				? <text key="h-end" color={highlightColor} bold>{current}</text>
				: <text key="n-end" color={normalColor}>{current}</text>,
		)
	}

	return <>{segments}</>
}

// build file list items grouped by directory
function buildFileList(
	matches: FuzzyMatch[],
	cursorIndex: number,
	bt: ThemeTokens['browser'],
	textColor: string,
): ReactNode[] {
	const items: ReactNode[] = []
	let lastDir: string | undefined

	for (let i = 0; i < matches.length; i++) {
		const { entry, positions } = matches[i]!
		const isSelected = i === cursorIndex

		if (entry.directory !== lastDir) {
			lastDir = entry.directory
			const dirLabel = entry.directory || '.'
			items.push(
				<text key={`dir-${dirLabel}`} color={bt.directoryColor} bold>
					{dirLabel}/
				</text>,
			)
		}

		const prefix = isSelected ? '> ' : '  '
		const fgColor = isSelected ? bt.selectedFg : textColor
		const dirOffset = entry.directory ? entry.directory.length + 1 : 0
		const namePositions = positions
			.filter((p) => p >= dirOffset)
			.map((p) => p - dirOffset)

		items.push(
			<box
				key={`file-${entry.relativePath}`}
				style={{
					flexDirection: 'row',
					rootOptions: isSelected ? { backgroundColor: bt.selectedBg } : undefined,
				}}
			>
				<text color={fgColor}>{prefix}</text>
				<HighlightedName
					text={entry.name}
					positions={namePositions}
					normalColor={fgColor}
					highlightColor={bt.matchHighlightColor}
				/>
			</box>,
		)
	}

	return items
}

export function BrowserPane({
	matches,
	filter,
	cursorIndex,
	totalFiles,
	scanStatus,
	scanError,
	focused,
	theme,
	scrollRef,
	onMouseDown,
	onMouseScroll,
}: Readonly<BrowserPaneProps>) {
	const borderColor = focused
		? theme.pane.focusedBorderColor
		: theme.pane.unfocusedBorderColor

	const bt = theme.browser
	const matchCount = matches.length

	const countLabel = filter.length > 0
		? `${String(matchCount)}/${String(totalFiles)}`
		: String(totalFiles)

	// main content based on scan status
	let content: ReactNode
	if (scanStatus === 'scanning') {
		content = <text color={bt.fileCountColor}>scanning...</text>
	} else if (scanStatus === 'error') {
		content = <text color={bt.matchHighlightColor}>{scanError ?? 'scan failed'}</text>
	} else if (totalFiles === 0) {
		content = <text color={bt.fileCountColor}>no markdown files found</text>
	} else if (matchCount === 0) {
		content = <text color={bt.fileCountColor}>no matches</text>
	} else {
		content = buildFileList(matches, cursorIndex, bt, theme.paragraph.textColor)
	}

	return (
		<box style={{ flexDirection: 'column', width: '100%', flexGrow: 1 }}>
			{/* filter input */}
			<box
				border={['bottom']}
				style={{ height: 2, width: '100%', rootOptions: { borderColor } }}
			>
				<box style={{ flexDirection: 'row', width: '100%' }}>
					<text color={bt.filterColor}>{'> '}{filter}</text>
					<box style={{ flexGrow: 1 }} />
					<text color={bt.fileCountColor}>{countLabel}</text>
				</box>
			</box>

			{/* file list */}
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
				<box style={{ flexDirection: 'column', padding: 1 }}>
					{content}
				</box>
			</scrollbox>
		</box>
	)
}
