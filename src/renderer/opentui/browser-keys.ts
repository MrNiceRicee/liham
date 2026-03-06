// browser mode key handlers — extracted from app.tsx for file size.

import type { KeyEvent } from '@opentui/core'
import type { useRenderer } from '@opentui/react'

import { type AppAction, type AppState, isSplitLayout } from '../../app/state.ts'
import { fuzzyFilter } from '../../browser/fuzzy.ts'

function browserCursorKey(
	key: KeyEvent,
	dispatch: React.Dispatch<AppAction>,
	filteredLength: number,
): boolean {
	switch (key.name) {
		case 'up':
		case 'k':
			dispatch({ type: 'CursorMove', direction: 'up', filteredLength })
			return true
		case 'down':
		case 'j':
			dispatch({ type: 'CursorMove', direction: 'down', filteredLength })
			return true
		case 'home':
		case 'g':
			dispatch({
				type: 'CursorMove',
				direction: key.shift ? 'bottom' : 'top',
				filteredLength,
			})
			return true
		case 'end':
			dispatch({ type: 'CursorMove', direction: 'bottom', filteredLength })
			return true
		case 'pageup':
			dispatch({ type: 'CursorMove', direction: 'pageUp', filteredLength })
			return true
		case 'pagedown':
			dispatch({ type: 'CursorMove', direction: 'pageDown', filteredLength })
			return true
		default:
			return false
	}
}

function browserFilterKey(
	key: KeyEvent,
	state: AppState,
	dispatch: React.Dispatch<AppAction>,
): boolean {
	if (key.name === 'backspace') {
		if (state.browser.filter.length > 0) {
			dispatch({ type: 'FilterUpdate', text: state.browser.filter.slice(0, -1) })
		}
		return true
	}
	if (key.ctrl && key.name === 'w') {
		const filter = state.browser.filter.trimEnd()
		const lastSpace = filter.lastIndexOf(' ')
		dispatch({ type: 'FilterUpdate', text: lastSpace >= 0 ? filter.slice(0, lastSpace) : '' })
		return true
	}
	if (key.ctrl && key.name === 'u') {
		dispatch({ type: 'FilterUpdate', text: '' })
		return true
	}
	if (key.name.length === 1 && !key.ctrl && !key.meta) {
		dispatch({ type: 'FilterUpdate', text: state.browser.filter + key.name })
		return true
	}
	return false
}

function browserOpenSelected(
	state: AppState,
	filteredLength: number,
	openFile: (path: string) => void,
): void {
	if (filteredLength === 0) return
	const matches = fuzzyFilter(state.browser.filter, state.browser.files)
	const selected = matches[state.browser.cursorIndex]
	if (selected != null) openFile(selected.entry.absolutePath)
}

export function browserKeyHandler(
	key: KeyEvent,
	state: AppState,
	dispatch: React.Dispatch<AppAction>,
	filteredLength: number,
	openFile: (path: string) => void,
	renderer: ReturnType<typeof useRenderer>,
): void {
	if (key.ctrl && key.name === 'c') return

	switch (key.name) {
		case 'escape':
			if (state.browser.filter.length > 0) dispatch({ type: 'FilterUpdate', text: '' })
			else renderer?.destroy()
			return
		case 'return':
			browserOpenSelected(state, filteredLength, openFile)
			return
		case '?':
			dispatch({ type: 'CycleLegend' })
			return
		case 'tab':
			if (isSplitLayout(state.layout)) {
				dispatch({ type: 'FocusPane', target: state.focus === 'preview' ? 'source' : 'preview' })
			}
			return
	}

	if (browserCursorKey(key, dispatch, filteredLength)) return
	browserFilterKey(key, state, dispatch)
}
