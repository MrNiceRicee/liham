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

	if (totalContent <= available) return contentWidths

	const minWidths = contentWidths.map((_, i) => Math.max(headerWidths[i] ?? 1, 1))
	const totalMin = minWidths.reduce((sum, w) => sum + w, 0)

	if (totalMin >= available) return minWidths

	const distributable = available - totalMin
	const excessWidths = contentWidths.map((w, i) => Math.max(0, w - minWidths[i]!))
	const totalExcess = excessWidths.reduce((sum, w) => sum + w, 0)

	if (totalExcess === 0) return minWidths

	return minWidths.map((min, i) => min + Math.floor((excessWidths[i]! / totalExcess) * distributable))
}

// -- rendering --

interface TableContext {
	borderColor?: string
	stripeColor?: string
	colWidths: number[]
}

const MAX_DATA_ROWS = 100

function countDataRows(node: TableNode): number {
	let count = 0
	for (const child of node.children) {
		if (child.type === 'tableRow' && !child.isHeader) count++
	}
	return count
}

function buildTableRows(
	node: TableNode,
	key: string,
	ctx: TableContext,
	borderFg: Record<string, unknown>,
): ReactNode[] {
	const rows: ReactNode[] = []
	let dataRowIndex = 0

	for (let i = 0; i < node.children.length; i++) {
		const row = node.children[i]!
		if (row.type !== 'tableRow') continue
		if (!row.isHeader && dataRowIndex >= MAX_DATA_ROWS) break

		const rowKey = `${key}-r${String(i)}`
		const stripe = !row.isHeader && dataRowIndex % 2 === 1
		rows.push(renderTableRow(row, rowKey, ctx, stripe))
		if (!row.isHeader) dataRowIndex++

		if (row.isHeader && i < node.children.length - 1) {
			rows.push(
				<text key={`${rowKey}-sep`} style={borderFg}>
					{buildSeparator(ctx.colWidths, '├', '┼', '┤', '─')}
				</text>,
			)
		}
	}
	return rows
}

export function renderTable(node: TableNode, key: string) {
	const contentWidths = measureColumnWidths(node)
	const headerWidths = measureHeaderWidths(node)
	const termWidth = process.stdout.columns || 80
	const colWidths = distributeColumnWidths(contentWidths, headerWidths, termWidth)

	const ctx: TableContext = {
		borderColor: node.style.borderColor,
		stripeColor: node.style.bg,
		colWidths,
	}

	const borderFg: Record<string, unknown> = {}
	if (ctx.borderColor != null) borderFg['fg'] = ctx.borderColor

	const rows = buildTableRows(node, key, ctx, borderFg)
	const overflowCount = countDataRows(node) - MAX_DATA_ROWS

	return (
		<box key={key} style={{ flexDirection: 'column', marginBottom: 1 }}>
			<text style={borderFg}>{buildSeparator(colWidths, '┌', '┬', '┐', '─')}</text>
			{rows}
			<text style={borderFg}>{buildSeparator(colWidths, '└', '┴', '┘', '─')}</text>
			{overflowCount > 0 && (
				<text style={{ fg: '#565f89' }}>{`… ${String(overflowCount)} more rows`}</text>
			)}
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
	const segments = colWidths.map((w) => fill.repeat(w + 2))
	return left + segments.join(mid) + right
}

function buildCellStyle(colIndex: number, cellWidth: number, borderColor?: string) {
	const style: Record<string, unknown> = {
		width: cellWidth,
		paddingLeft: 1,
		paddingRight: 1,
	}
	if (colIndex > 0) {
		style['border'] = ['left']
		style['borderStyle'] = 'single'
		if (borderColor != null) style['borderColor'] = borderColor
	}
	return style
}

function renderCellContent(
	cell: TableCellNode | undefined,
	cellKey: string,
	cellStyle: Record<string, unknown>,
	isHeader: boolean,
) {
	if (cell == null) {
		return (
			<box key={cellKey} style={cellStyle}>
				<text> </text>
			</box>
		)
	}

	const textStyle: Record<string, unknown> = {}
	if (cell.style.fg != null) textStyle['fg'] = cell.style.fg
	if (isHeader || cell.style.bold === true) textStyle['attributes'] = 1

	return (
		<box key={cellKey} style={cellStyle}>
			<text style={textStyle}>{renderInlineChildren(cell.children, cellKey)}</text>
		</box>
	)
}

export function renderTableRow(
	node: TableRowNode,
	key: string,
	ctx: TableContext,
	stripe: boolean,
) {
	const cells = node.children.filter((c) => c.type === 'tableCell') as TableCellNode[]

	const rowStyle: Record<string, unknown> = {
		flexDirection: 'row',
		border: ['left', 'right'],
		borderStyle: 'single',
	}
	if (ctx.borderColor != null) rowStyle['borderColor'] = ctx.borderColor
	if (stripe && ctx.stripeColor != null) rowStyle['backgroundColor'] = ctx.stripeColor

	const parts: ReactNode[] = []
	for (let i = 0; i < ctx.colWidths.length; i++) {
		const cellKey = `${key}-c${String(i)}`
		const cellWidth = ctx.colWidths[i]! + 2
		const cellStyle = buildCellStyle(i, cellWidth, ctx.borderColor)
		parts.push(renderCellContent(cells[i], cellKey, cellStyle, node.isHeader))
	}

	return (
		<box key={key} style={rowStyle}>
			{parts}
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
