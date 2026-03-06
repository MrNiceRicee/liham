import type { ReactNode } from 'react'

import type { CoreIRNode, IRNode, TableCellNode, TableNode, TableRowNode } from '../../ir/types.ts'

import { renderInlineChildren } from './inline.tsx'

// -- text measurement --

// walks IR nodes and sums display width.
// inline formatting (bold/italic/etc) adds zero width — terminal attributes are zero-width escapes.
function measureIRText(nodes: IRNode[]): number {
	let width = 0
	for (const node of nodes) {
		const core = node as CoreIRNode
		switch (core.type) {
			case 'text':
			case 'inlineCode':
				width += core.value.length
				break
			case 'strong':
			case 'emphasis':
			case 'link':
			case 'strikethrough':
				width += measureIRText(core.children)
				break
			case 'image':
				width += `[image: ${core.alt}]`.length
				break
			case 'checkbox':
				width += 4
				break
			case 'break':
				width += 1
				break
		}
	}
	return width
}

function measureColumnWidths(node: TableNode): number[] {
	const colWidths: number[] = []
	for (const row of node.children) {
		if (row.type !== 'tableRow') continue
		const cells = row.children.filter((c) => c.type === 'tableCell')
		for (let i = 0; i < cells.length; i++) {
			const cell = cells[i]!
			if (cell.type !== 'tableCell') continue
			const w = measureIRText(cell.children)
			colWidths[i] = Math.max(colWidths[i] ?? 0, w)
		}
	}
	return colWidths
}

function measureHeaderWidths(node: TableNode): number[] {
	for (const row of node.children) {
		if (row.type !== 'tableRow' || !row.isHeader) continue
		return row.children
			.filter((c) => c.type === 'tableCell')
			.map((cell) => (cell.type === 'tableCell' ? measureIRText(cell.children) : 0))
	}
	return []
}

// distributes available terminal width across columns when table overflows.
// proportional to content width, with header width as minimum per column.
function distributeColumnWidths(
	contentWidths: number[],
	headerWidths: number[],
	terminalWidth: number,
): number[] {
	const numCols = contentWidths.length
	const overhead = numCols + 1 + numCols * 2 + 2 // borders + cell padding + scrollbox padding
	const available = terminalWidth - overhead
	const totalContent = contentWidths.reduce((sum, w) => sum + w, 0)

	// fits? use content-fitted
	if (totalContent <= available) return contentWidths

	// minimum = header width per column (at least 1 char)
	const minWidths = contentWidths.map((_, i) => Math.max(headerWidths[i] ?? 1, 1))
	const totalMin = minWidths.reduce((sum, w) => sum + w, 0)

	// even minimums don't fit — use minimums, scrollbox handles overflow
	if (totalMin >= available) return minWidths

	// distribute excess space proportionally
	const distributable = available - totalMin
	const excessWidths = contentWidths.map((w, i) => Math.max(0, w - minWidths[i]!))
	const totalExcess = excessWidths.reduce((sum, w) => sum + w, 0)

	if (totalExcess === 0) return minWidths

	return minWidths.map((min, i) => min + Math.floor((excessWidths[i]! / totalExcess) * distributable))
}

// -- rendering --

export function renderTable(node: TableNode, key: string) {
	const borderStyle: Record<string, unknown> = {}
	if (node.style.borderColor != null) borderStyle['fg'] = node.style.borderColor

	const contentWidths = measureColumnWidths(node)
	const headerWidths = measureHeaderWidths(node)
	const termWidth = process.stdout.columns || 80
	const colWidths = distributeColumnWidths(contentWidths, headerWidths, termWidth)

	const rows: ReactNode[] = []
	for (let i = 0; i < node.children.length; i++) {
		const row = node.children[i]!
		if (row.type !== 'tableRow') continue
		const rowKey = `${key}-r${String(i)}`

		rows.push(renderTableRow(row, rowKey, colWidths, borderStyle))

		if (row.isHeader && i < node.children.length - 1) {
			rows.push(
				<text key={`${rowKey}-sep`} style={borderStyle}>
					{buildSeparator(colWidths, '├', '┼', '┤', '─')}
				</text>,
			)
		}
	}

	return (
		<box key={key} style={{ flexDirection: 'column', marginBottom: 1 }}>
			<text style={borderStyle}>{buildSeparator(colWidths, '┌', '┬', '┐', '─')}</text>
			{rows}
			<text style={borderStyle}>{buildSeparator(colWidths, '└', '┴', '┘', '─')}</text>
		</box>
	)
}

function buildSeparator(
	colWidths: number[],
	left: string,
	mid: string,
	right: string,
	fill: string,
): string {
	const segments = colWidths.map((w) => fill.repeat(w + 2)) // +2 for cell padding
	return left + segments.join(mid) + right
}

export function renderTableRow(
	node: TableRowNode,
	key: string,
	colWidths: number[],
	borderStyle: Record<string, unknown>,
) {
	const cells = node.children.filter((c) => c.type === 'tableCell') as TableCellNode[]
	const parts: ReactNode[] = []

	for (let i = 0; i < colWidths.length; i++) {
		if (i > 0) {
			parts.push(
				<text key={`${key}-sep${String(i)}`} style={borderStyle}>
					{'│'}
				</text>,
			)
		}

		const cell = cells[i]
		const cellKey = `${key}-c${String(i)}`
		const cellWidth = colWidths[i]! + 2 // +2 for padding

		if (cell != null) {
			parts.push(renderTableCell(cell, cellKey, node.isHeader, cellWidth))
		} else {
			parts.push(
				<box key={cellKey} style={{ width: cellWidth }}>
					<text>{' '.repeat(cellWidth)}</text>
				</box>,
			)
		}
	}

	return (
		<box key={key} style={{ flexDirection: 'row' }}>
			<text style={borderStyle}>{'│'}</text>
			{parts}
			<text style={borderStyle}>{'│'}</text>
		</box>
	)
}

export function renderTableCell(
	node: TableCellNode,
	key: string,
	isHeader: boolean,
	cellWidth: number,
) {
	const textStyle: Record<string, unknown> = {}
	if (node.style.fg != null) textStyle['fg'] = node.style.fg
	if (isHeader || node.style.bold === true) textStyle['attributes'] = 1

	return (
		<box key={key} style={{ width: cellWidth, paddingLeft: 1, paddingRight: 1 }}>
			<text style={textStyle}>{renderInlineChildren(node.children, key)}</text>
		</box>
	)
}
