import type { ReactNode } from 'react'

import type { CoreIRNode, IRNode, TableCellNode, TableNode, TableRowNode } from '../../ir/types.ts'

import { renderInlineChildren } from './inline.tsx'

// -- text extraction + measurement --

// extracts plain text from IR nodes for width measurement and wrapping.
function extractPlainText(nodes: IRNode[]): string {
	let text = ''
	for (const node of nodes) {
		const core = node as CoreIRNode
		switch (core.type) {
			case 'text':
			case 'inlineCode':
				text += core.value
				break
			case 'strong':
			case 'emphasis':
			case 'link':
			case 'strikethrough':
				text += extractPlainText(core.children)
				break
			case 'image':
				text += `[image: ${core.alt}]`
				break
			case 'checkbox':
				text += core.checked ? '[x] ' : '[ ] '
				break
			case 'break':
				text += ' '
				break
		}
	}
	return text
}

function measureColumnWidths(node: TableNode): number[] {
	const colWidths: number[] = []
	for (const row of node.children) {
		if (row.type !== 'tableRow') continue
		const cells = row.children.filter((c) => c.type === 'tableCell')
		for (let i = 0; i < cells.length; i++) {
			const cell = cells[i]!
			if (cell.type !== 'tableCell') continue
			const w = extractPlainText(cell.children).length
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
			.map((cell) => (cell.type === 'tableCell' ? extractPlainText(cell.children).length : 0))
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
	// each column: 1 border + 1 pad left + content + 1 pad right, plus final border, plus scrollbox padding
	const overhead = numCols + 1 + numCols * 2 + 2
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

// -- word wrapping --

// wraps text to fit within maxWidth, breaking at word boundaries when possible.
function wrapText(text: string, maxWidth: number): string[] {
	if (maxWidth <= 0) return [text]
	if (text.length <= maxWidth) return [text]

	const lines: string[] = []
	const words = text.split(/\s+/)
	let current = ''

	for (const word of words) {
		if (current.length === 0) {
			current = word
		} else if (current.length + 1 + word.length <= maxWidth) {
			current += ` ${word}`
		} else {
			lines.push(current)
			current = word
		}
		// hard-break words longer than maxWidth
		while (current.length > maxWidth) {
			lines.push(current.slice(0, maxWidth))
			current = current.slice(maxWidth)
		}
	}
	if (current.length > 0) lines.push(current)
	if (lines.length === 0) lines.push('')
	return lines
}

// -- rendering --

const MAX_DATA_ROWS = 100

function countDataRows(node: TableNode): number {
	let count = 0
	for (const child of node.children) {
		if (child.type === 'tableRow' && !child.isHeader) count++
	}
	return count
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

// renders a single row as multiple <text> lines (one per physical terminal line).
// cells that wrap produce multiple lines; shorter cells get blank-padded lines.
function renderRowLines(
	row: TableRowNode,
	key: string,
	colWidths: number[],
	borderFg: Record<string, unknown>,
): ReactNode[] {
	const cells = row.children.filter((c) => c.type === 'tableCell') as TableCellNode[]

	// wrap each cell's text to its column width
	const cellLines: string[][] = []
	let maxLines = 1
	for (let i = 0; i < colWidths.length; i++) {
		const cell = cells[i]
		const text = cell != null ? extractPlainText(cell.children) : ''
		const lines = wrapText(text, colWidths[i]!)
		cellLines.push(lines)
		maxLines = Math.max(maxLines, lines.length)
	}

	// for single-line cells, use formatted inline content on line 0
	const useFormatted = cellLines.every((lines) => lines.length <= 1)

	const result: ReactNode[] = []
	for (let line = 0; line < maxLines; line++) {
		const lineKey = `${key}-l${String(line)}`

		if (useFormatted && line === 0) {
			result.push(renderFormattedLine(cells, lineKey, colWidths, borderFg, row.isHeader))
		} else {
			result.push(renderPlainLine(cells, cellLines, line, lineKey, colWidths, borderFg))
		}
	}
	return result
}

// renders a wrapped-row line with border chars in border color, cell text in cell color.
function renderPlainLine(
	cells: (TableCellNode | undefined)[],
	cellLines: string[][],
	line: number,
	lineKey: string,
	colWidths: number[],
	borderFg: Record<string, unknown>,
): ReactNode {
	const parts: ReactNode[] = []

	for (let i = 0; i < colWidths.length; i++) {
		const cellText = cellLines[i]![line] ?? ''
		const padded = ` ${cellText.padEnd(colWidths[i]!)} `
		const cell = cells[i]
		const cellFg = cell?.style.fg

		parts.push(<span key={`${lineKey}-b${String(i)}`} {...borderFg}>{'│'}</span>)
		if (cellFg != null) {
			parts.push(<span key={`${lineKey}-t${String(i)}`} fg={cellFg}>{padded}</span>)
		} else {
			parts.push(padded)
		}
	}
	parts.push(<span key={`${lineKey}-br`} {...borderFg}>{'│'}</span>)

	return <text key={lineKey}>{parts}</text>
}

// pushes formatted cell content + padding into parts array
function pushFormattedCell(
	parts: ReactNode[],
	cell: TableCellNode | undefined,
	cellKey: string,
	colWidth: number,
	isHeader: boolean,
): void {
	if (cell == null) {
		parts.push(' '.repeat(colWidth))
		return
	}

	const textLen = extractPlainText(cell.children).length
	const textStyle: Record<string, unknown> = {}
	if (cell.style.fg != null) textStyle['fg'] = cell.style.fg
	if (isHeader || cell.style.bold === true) textStyle['attributes'] = 1

	if (Object.keys(textStyle).length > 0) {
		parts.push(
			<span key={cellKey} {...textStyle}>
				{renderInlineChildren(cell.children, cellKey)}
			</span>,
		)
	} else {
		parts.push(...renderInlineChildren(cell.children, cellKey))
	}

	const pad = colWidth - textLen
	if (pad > 0) parts.push(' '.repeat(pad))
}

// renders a single-line row with inline formatting (bold, italic, code, etc).
function renderFormattedLine(
	cells: (TableCellNode | undefined)[],
	key: string,
	colWidths: number[],
	borderFg: Record<string, unknown>,
	isHeader: boolean,
): ReactNode {
	const parts: ReactNode[] = []

	for (let i = 0; i < colWidths.length; i++) {
		parts.push('│ ')
		pushFormattedCell(parts, cells[i], `${key}-c${String(i)}`, colWidths[i]!, isHeader)
		parts.push(' ')
	}
	parts.push('│')

	return (
		<text key={key} style={borderFg}>
			{parts}
		</text>
	)
}

function buildTableRows(
	node: TableNode,
	key: string,
	colWidths: number[],
	borderFg: Record<string, unknown>,
): ReactNode[] {
	const rows: ReactNode[] = []
	let dataRowIndex = 0

	for (let i = 0; i < node.children.length; i++) {
		const row = node.children[i]!
		if (row.type !== 'tableRow') continue
		if (!row.isHeader && dataRowIndex >= MAX_DATA_ROWS) break

		// light separator between data rows
		if (!row.isHeader && dataRowIndex > 0) {
			rows.push(
				<text key={`${key}-dsep${String(i)}`} style={borderFg}>
					{buildSeparator(colWidths, '├', '┼', '┤', '┄')}
				</text>,
			)
		}

		const rowKey = `${key}-r${String(i)}`
		rows.push(...renderRowLines(row, rowKey, colWidths, borderFg))
		if (!row.isHeader) dataRowIndex++

		if (row.isHeader) {
			rows.push(
				<text key={`${rowKey}-sep`} style={borderFg}>
					{buildSeparator(colWidths, '├', '┼', '┤', '─')}
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

	const borderFg: Record<string, unknown> = {}
	if (node.style.borderColor != null) borderFg['fg'] = node.style.borderColor

	const rows = buildTableRows(node, key, colWidths, borderFg)
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

// standalone renderers for orphan cases in index.tsx
export function renderTableRow(
	node: TableRowNode,
	key: string,
	ctx: { colWidths: number[] },
) {
	const borderFg: Record<string, unknown> = {}
	return (
		<box key={key} style={{ flexDirection: 'column' }}>
			{renderRowLines(node, key, ctx.colWidths, borderFg)}
		</box>
	)
}

export function renderTableCell(
	node: TableCellNode,
	key: string,
	isHeader: boolean,
	_cellWidth: number,
) {
	const textStyle: Record<string, unknown> = {}
	if (node.style.fg != null) textStyle['fg'] = node.style.fg
	if (isHeader || node.style.bold === true) textStyle['attributes'] = 1

	return (
		<text key={key} style={textStyle}>
			{renderInlineChildren(node.children, key)}
		</text>
	)
}
