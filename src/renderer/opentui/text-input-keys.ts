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

// option key detection: macOS sends option as meta in raw mode, option in kitty protocol
function isOptionKey(key: KeyEvent): boolean {
	return key.meta || key.option
}

function handleMovement(
	key: KeyEvent,
	text: string,
	c: number,
	len: number,
): TextInputResult | null {
	if (key.name === 'left' && !isOptionKey(key))
		return { newText: text, cursor: Math.max(0, c - 1), consumed: true }
	if (key.name === 'right' && !isOptionKey(key))
		return { newText: text, cursor: Math.min(len, c + 1), consumed: true }
	if (key.name === 'home') return { newText: text, cursor: 0, consumed: true }
	if (key.name === 'end') return { newText: text, cursor: len, consumed: true }
	if (isOptionKey(key) && key.name === 'left')
		return { newText: text, cursor: prevWordBoundary(text, c), consumed: true }
	if (isOptionKey(key) && key.name === 'right')
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
	if ((isOptionKey(key) && key.name === 'backspace') || (key.ctrl && key.name === 'w')) {
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
	let ch: string | null = null
	if (key.name === 'space') ch = ' '
	else if (key.name.length === 1) ch = key.name
	if (ch == null || key.ctrl || key.meta || key.option) return null
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
