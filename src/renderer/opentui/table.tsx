import type { TableCellNode, TableNode, TableRowNode } from '../../ir/types.ts'

import { renderInlineChildren } from './inline.tsx'

export function renderTable(node: TableNode, key: string) {
	const style: Record<string, unknown> = {
		flexDirection: 'column',
		border: true,
		borderStyle: 'single',
		marginBottom: 1,
	}
	if (node.style.borderColor != null) style['borderColor'] = node.style.borderColor

	return (
		<box key={key} style={style}>
			{node.children.map((row, i) => {
				const rowKey = `${key}-r${String(i)}`
				if (row.type !== 'tableRow') return null
				return (
					<>
						{renderTableRow(row, rowKey, node.alignments)}
						{row.isHeader && i < node.children.length - 1 ? (
							<text key={`${rowKey}-sep`} style={{ fg: node.style.borderColor }}>
								{'─'.repeat(40)}
							</text>
						) : null}
					</>
				)
			})}
		</box>
	)
}

export function renderTableRow(
	node: TableRowNode,
	key: string,
	alignments: ('left' | 'center' | 'right' | null)[],
) {
	return (
		<box key={key} style={{ flexDirection: 'row' }}>
			{node.children.map((cell, i) => {
				if (cell.type !== 'tableCell') return null
				const cellKey = `${key}-c${String(i)}`
				const alignment = alignments[i] ?? 'left'
				return renderTableCell(cell, cellKey, node.isHeader, alignment)
			})}
		</box>
	)
}

export function renderTableCell(
	node: TableCellNode,
	key: string,
	isHeader: boolean,
	_alignment: 'left' | 'center' | 'right' | null,
) {
	const textStyle: Record<string, unknown> = { flexShrink: 1 }
	if (node.style.fg != null) textStyle['fg'] = node.style.fg
	if (isHeader || node.style.bold === true) textStyle['attributes'] = 1 // bold

	return (
		<box key={key} style={{ flexGrow: 1, paddingLeft: 1, paddingRight: 1 }}>
			<text style={textStyle}>{renderInlineChildren(node.children, key)}</text>
		</box>
	)
}
