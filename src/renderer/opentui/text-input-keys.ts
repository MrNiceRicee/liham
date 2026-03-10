// shared text input key handling — DRY between browser filter and search input.
// cursor-aware: handles movement, word jumps, insert/delete at cursor position.

import type { KeyEvent } from '@opentui/core'

import {
	graphemeDelete,
	graphemeInsert,
	graphemeLength,
	nextWordBoundary,
	prevWordBoundary,
} from '../../utils/grapheme.ts'

export interface TextInputResult {
	newText: string
	cursor: number
	consumed: boolean
}

function handleMovement(
	key: KeyEvent,
	text: string,
	c: number,
	len: number,
): TextInputResult | null {
	if (key.name === 'left' && !key.meta)
		return { newText: text, cursor: Math.max(0, c - 1), consumed: true }
	if (key.name === 'right' && !key.meta)
		return { newText: text, cursor: Math.min(len, c + 1), consumed: true }
	if (key.name === 'home') return { newText: text, cursor: 0, consumed: true }
	if (key.name === 'end') return { newText: text, cursor: len, consumed: true }
	if (key.meta && key.name === 'left')
		return { newText: text, cursor: prevWordBoundary(text, c), consumed: true }
	if (key.meta && key.name === 'right')
		return { newText: text, cursor: nextWordBoundary(text, c), consumed: true }
	return null
}

function handleDeletion(
	key: KeyEvent,
	text: string,
	c: number,
	len: number,
): TextInputResult | null {
	if (key.name === 'backspace' && !key.meta) {
		if (c === 0) return { newText: text, cursor: 0, consumed: true }
		return { newText: graphemeDelete(text, c - 1), cursor: c - 1, consumed: true }
	}
	if (key.name === 'delete') {
		if (c >= len) return { newText: text, cursor: c, consumed: true }
		return { newText: graphemeDelete(text, c), cursor: c, consumed: true }
	}
	if ((key.meta && key.name === 'backspace') || (key.ctrl && key.name === 'w')) {
		const boundary = prevWordBoundary(text, c)
		const count = c - boundary
		if (count === 0) return { newText: text, cursor: c, consumed: true }
		return { newText: graphemeDelete(text, boundary, count), cursor: boundary, consumed: true }
	}
	if (key.ctrl && key.name === 'u') return { newText: '', cursor: 0, consumed: true }
	return null
}

function handleInsert(
	key: KeyEvent,
	text: string,
	c: number,
	maxLength: number,
): TextInputResult | null {
	const ch = key.name === 'space' ? ' ' : key.name.length === 1 ? key.name : null
	if (ch == null || key.ctrl || key.meta) return null
	const newText = graphemeInsert(text, c, ch)
	if (graphemeLength(newText) > maxLength) return { newText: text, cursor: c, consumed: true }
	return { newText, cursor: c + 1, consumed: true }
}

export function handleTextInputKey(
	key: KeyEvent,
	currentText: string,
	cursor: number,
	maxLength = 200,
): TextInputResult {
	const len = graphemeLength(currentText)
	const c = Math.max(0, Math.min(cursor, len))

	return (
		handleMovement(key, currentText, c, len) ??
		handleDeletion(key, currentText, c, len) ??
		handleInsert(key, currentText, c, maxLength) ?? {
			newText: currentText,
			cursor: c,
			consumed: false,
		}
	)
}
