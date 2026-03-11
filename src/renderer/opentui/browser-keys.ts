// browser mode key handlers — extracted from app.tsx for file size.

import type { KeyEvent, ScrollBoxRenderable } from '@opentui/core'
import type { useRenderer } from '@opentui/react'
import type { RefObject } from 'react'

import {
	type AppAction,
	type AppState,
	type CursorDirection,
	isSplitLayout,
	moveCursor,
} from '../../app/state.ts'
import type { FuzzyMatch } from '../../browser/fuzzy.ts'
import { handleTextInputKey } from './text-input-keys.ts'

// content row for cursor position, accounting for directory group headers
function cursorItemRow(matches: FuzzyMatch[], cursorIndex: number): number {
	let nextRow = 0
	let lastDir: string | undefined
	for (let i = 0; i <= cursorIndex && i < matches.length; i++) {
		const dir = matches[i]!.entry.directory
		if (dir !== lastDir) {
			nextRow++ // directory header row
			lastDir = dir
		}
		if (i === cursorIndex) return nextRow
		nextRow++ // file entry row
	}
	return nextRow
}

// scroll the browser scrollbox to keep cursor visible
function scrollToCursor(
	scrollRef: RefObject<ScrollBoxRenderable | null>,
	matches: FuzzyMatch[],
	cursorIndex: number,
): void {
	const sb = scrollRef.current
	if (sb == null || matches.length === 0) return

	const viewportHeight = sb.viewport.height
	if (viewportHeight <= 0) return

	// item row + 1 for content box padding-top
	const contentRow = 1 + cursorItemRow(matches, cursorIndex)
	const { scrollTop } = sb

	if (contentRow < scrollTop + 1) {
		sb.scrollTo(Math.max(0, contentRow - 1))
	} else if (contentRow >= scrollTop + viewportHeight - 1) {
		sb.scrollTo(contentRow - viewportHeight + 2)
	}
}

function browserCursorKey(
	key: KeyEvent,
	dispatch: React.Dispatch<AppAction>,
	filteredLength: number,
): CursorDirection | null {
	switch (key.name) {
		case 'up':
		case 'k':
			dispatch({ type: 'CursorMove', direction: 'up', filteredLength })
			return 'up'
		case 'down':
		case 'j':
			dispatch({ type: 'CursorMove', direction: 'down', filteredLength })
			return 'down'
		case 'home':
		case 'g': {
			const dir: CursorDirection = key.shift ? 'bottom' : 'top'
			dispatch({ type: 'CursorMove', direction: dir, filteredLength })
			return dir
		}
		case 'end':
			dispatch({ type: 'CursorMove', direction: 'bottom', filteredLength })
			return 'bottom'
		case 'pageup':
			dispatch({ type: 'CursorMove', direction: 'pageUp', filteredLength })
			return 'pageUp'
		case 'pagedown':
			dispatch({ type: 'CursorMove', direction: 'pageDown', filteredLength })
			return 'pageDown'
		case 'd':
			if (key.ctrl) {
				dispatch({ type: 'CursorMove', direction: 'halfDown', filteredLength })
				return 'halfDown'
			}
			return null
		case 'u':
			if (key.ctrl) {
				dispatch({ type: 'CursorMove', direction: 'halfUp', filteredLength })
				return 'halfUp'
			}
			return null
		default:
			return null
	}
}

function browserFilterKey(
	key: KeyEvent,
	state: AppState,
	dispatch: React.Dispatch<AppAction>,
): boolean {
	const result = handleTextInputKey(key, state.browser.filter, state.browser.inputCursor)
	if (
		result.consumed &&
		(result.newText !== state.browser.filter || result.cursor !== state.browser.inputCursor)
	) {
		dispatch({ type: 'FilterUpdate', text: result.newText, cursor: result.cursor })
	}
	return result.consumed
}

function browserOpenSelected(
	state: AppState,
	matches: FuzzyMatch[],
	openFile: (path: string) => void,
): void {
	if (matches.length === 0) return
	const selected = matches[state.browser.cursorIndex]
	if (selected != null) openFile(selected.entry.absolutePath)
}

export function browserKeyHandler(
	key: KeyEvent,
	state: AppState,
	dispatch: React.Dispatch<AppAction>,
	matches: FuzzyMatch[],
	openFile: (path: string) => void,
	renderer: ReturnType<typeof useRenderer>,
	scrollRef: RefObject<ScrollBoxRenderable | null>,
): void {
	if (key.ctrl && key.name === 'c') return
	// prevent focused scrollbox from also handling arrow/page keys
	key.preventDefault()

	switch (key.name) {
		case 'escape':
			if (state.browser.filter.length > 0) dispatch({ type: 'FilterUpdate', text: '', cursor: 0 })
			else renderer?.destroy()
			return
		case 'return':
			browserOpenSelected(state, matches, openFile)
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

	// when filter has text, prioritize text editing for ctrl+u (clear) and ctrl+w (word delete)
	if (state.browser.filter.length > 0 && key.ctrl && (key.name === 'u' || key.name === 'w')) {
		browserFilterKey(key, state, dispatch)
		return
	}

	const cursorDir = browserCursorKey(key, dispatch, matches.length)
	if (cursorDir != null) {
		const newIndex = moveCursor(state.browser.cursorIndex, cursorDir, matches.length)
		scrollToCursor(scrollRef, matches, newIndex)
		return
	}
	browserFilterKey(key, state, dispatch)
}
