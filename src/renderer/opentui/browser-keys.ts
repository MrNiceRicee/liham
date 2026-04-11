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

function browserOpenSelected(
	state: AppState,
	matches: FuzzyMatch[],
	openFile: (path: string) => void,
): void {
	if (matches.length === 0) return
	const selected = matches[state.browser.cursorIndex]
	if (selected != null) openFile(selected.entry.absolutePath)
}

function handleBrowserSpecialKey(
	key: KeyEvent,
	state: AppState,
	dispatch: React.Dispatch<AppAction>,
	matches: FuzzyMatch[],
	openFile: (path: string) => void,
	renderer: ReturnType<typeof useRenderer>,
): boolean {
	if (key.name === 'escape') {
		if (state.browser.filter.length > 0) dispatch({ type: 'FilterUpdate', text: '', cursor: 0 })
		else renderer?.destroy()
		return true
	}

	if (key.name === 'return') {
		browserOpenSelected(state, matches, openFile)
		return true
	}

	if (key.name === '?') {
		dispatch({ type: 'CycleLegend' })
		return true
	}

	if (key.name === 'tab') {
		if (isSplitLayout(state.layout)) {
			dispatch({ type: 'FocusPane', target: state.focus === 'preview' ? 'source' : 'preview' })
		}
		return true
	}

	return false
}

function applyBrowserCursorMove(
	key: KeyEvent,
	dispatch: React.Dispatch<AppAction>,
	matches: FuzzyMatch[],
	scrollRef: RefObject<ScrollBoxRenderable | null>,
	cursorIndex: number,
): boolean {
	const cursorDir = browserCursorKey(key, dispatch, matches.length)
	if (cursorDir == null) return false
	const newIndex = moveCursor(cursorIndex, cursorDir, matches.length)
	scrollToCursor(scrollRef, matches, newIndex)
	return true
}

function handleBrowserTextInput(
	key: KeyEvent,
	state: AppState,
	dispatch: React.Dispatch<AppAction>,
): boolean {
	const textResult = handleTextInputKey(key, state.browser.filter, state.browser.inputCursor)
	if (
		textResult.consumed &&
		(textResult.newText !== state.browser.filter || textResult.cursor !== state.browser.inputCursor)
	) {
		dispatch({ type: 'FilterUpdate', text: textResult.newText, cursor: textResult.cursor })
		return true
	}
	return textResult.consumed
}

function routeBrowserKey(
	key: KeyEvent,
	state: AppState,
	dispatch: React.Dispatch<AppAction>,
	matches: FuzzyMatch[],
	openFile: (path: string) => void,
	renderer: ReturnType<typeof useRenderer>,
	scrollRef: RefObject<ScrollBoxRenderable | null>,
): boolean {
	if (handleBrowserSpecialKey(key, state, dispatch, matches, openFile, renderer)) return true
	if (handleBrowserTextInput(key, state, dispatch)) return true

	// let browser navigation keep working for ctrl+u when the filter is empty
	if (key.ctrl && key.name === 'u' && state.browser.filter.length === 0) {
		return applyBrowserCursorMove(key, dispatch, matches, scrollRef, state.browser.cursorIndex)
	}

	return applyBrowserCursorMove(key, dispatch, matches, scrollRef, state.browser.cursorIndex)
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

	routeBrowserKey(key, state, dispatch, matches, openFile, renderer, scrollRef)
}
