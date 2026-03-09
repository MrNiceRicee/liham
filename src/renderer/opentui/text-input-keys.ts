// shared text input key handling — DRY between browser filter and search input.
// handles printable chars, backspace, ctrl+w (delete word), ctrl+u (clear).

import type { KeyEvent } from '@opentui/core'

export interface TextInputResult {
	newText: string
	consumed: boolean
}

export function handleTextInputKey(
	key: KeyEvent,
	currentText: string,
	maxLength = 200,
): TextInputResult {
	if (key.name === 'backspace') {
		return { newText: currentText.slice(0, -1), consumed: true }
	}
	if (key.ctrl && key.name === 'w') {
		const trimmed = currentText.trimEnd()
		const lastSpace = trimmed.lastIndexOf(' ')
		return { newText: lastSpace >= 0 ? trimmed.slice(0, lastSpace) : '', consumed: true }
	}
	if (key.ctrl && key.name === 'u') {
		return { newText: '', consumed: true }
	}
	// space key: OpenTUI sends key.name='space' (not ' ')
	if (key.name === 'space' && !key.ctrl && !key.meta) {
		const next = (currentText + ' ').slice(0, maxLength)
		return { newText: next, consumed: true }
	}
	if (key.name.length === 1 && !key.ctrl && !key.meta) {
		const next = (currentText + key.name).slice(0, maxLength)
		return { newText: next, consumed: true }
	}
	return { newText: currentText, consumed: false }
}
