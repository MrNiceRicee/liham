import type { ReactNode } from 'react'

import type { TableCellNode, TableNode, TableRowNode } from '../../ir/types.ts'

import { renderInlineChildren } from './inline.tsx'

export function renderTable(node: TableNode, key: string) {
	const borderColor = node.style.borderColor
	const borderStyle: Record<string, unknown> = {}
	if (borderColor != null) borderStyle['fg'] = borderColor

	const colCount = node.children.reduce((max, row) => {
		if (row.type !== 'tableRow') return max
		return Math.max(max, row.children.filter((c) => c.type === 'tableCell').length)
	}, 0)

	const rows: ReactNode[] = []
	for (let i = 0; i < node.children.length; i++) {
		const row = node.children[i]!
		if (row.type !== 'tableRow') continue
		const rowKey = `${key}-r${String(i)}`

		rows.push(renderTableRow(row, rowKey, colCount, borderStyle))

		// header separator
		if (row.isHeader && i < node.children.length - 1) {
			rows.push(
				<box key={`${rowKey}-sep`} style={{ flexDirection: 'row' }}>
					{buildSeparator(colCount, '├', '┼', '┤', '─', borderStyle)}
				</box>,
			)
		}
	}

	return (
		<box key={key} style={{ flexDirection: 'column', marginBottom: 1 }}>
			<box style={{ flexDirection: 'row' }}>
				{buildSeparator(colCount, '┌', '┬', '┐', '─', borderStyle)}
			</box>
			{rows}
			<box style={{ flexDirection: 'row' }}>
				{buildSeparator(colCount, '└', '┴', '┘', '─', borderStyle)}
			</box>
		</box>
	)
}

function buildSeparator(
	colCount: number,
	left: string,
	mid: string,
	right: string,
	fill: string,
	style: Record<string, unknown>,
): ReactNode[] {
	const parts: ReactNode[] = [<text style={style}>{left}</text>]
	for (let i = 0; i < colCount; i++) {
		parts.push(<text style={{ ...style, flexGrow: 1 }}>{fill.repeat(80)}</text>)
		if (i < colCount - 1) parts.push(<text style={style}>{mid}</text>)
	}
	parts.push(<text style={style}>{right}</text>)
	return parts
}

export function renderTableRow(
	node: TableRowNode,
	key: string,
	colCount: number,
	borderStyle: Record<string, unknown>,
) {
	const cells = node.children.filter((c) => c.type === 'tableCell') as TableCellNode[]
	const parts: ReactNode[] = [
		<text key={`${key}-bl`} style={borderStyle}>
			{'│'}
		</text>,
	]

	for (let i = 0; i < colCount; i++) {
		const cell = cells[i]
		const cellKey = `${key}-c${String(i)}`
		if (cell != null) {
			parts.push(renderTableCell(cell, cellKey, node.isHeader))
		} else {
			parts.push(
				<box key={cellKey} style={{ flexGrow: 1, paddingLeft: 1, paddingRight: 1 }}>
					<text> </text>
				</box>,
			)
		}
		if (i < colCount - 1) {
			parts.push(
				<text key={`${key}-sep${String(i)}`} style={borderStyle}>
					{'│'}
				</text>,
			)
		}
	}

	parts.push(
		<text key={`${key}-br`} style={borderStyle}>
			{'│'}
		</text>,
	)

	return (
		<box key={key} style={{ flexDirection: 'row' }}>
			{parts}
		</box>
	)
}

export function renderTableCell(node: TableCellNode, key: string, isHeader: boolean) {
	const textStyle: Record<string, unknown> = {}
	if (node.style.fg != null) textStyle['fg'] = node.style.fg
	if (isHeader || node.style.bold === true) textStyle['attributes'] = 1 // bold

	return (
		<box key={key} style={{ flexGrow: 1, paddingLeft: 1, paddingRight: 1 }}>
			<text style={textStyle}>{renderInlineChildren(node.children, key)}</text>
		</box>
	)
}
