// viewer mode key handlers — extracted from app.tsx for file size.

import type { KeyEvent, ScrollBoxRenderable } from '@opentui/core'

import type { AppAction, AppState, ScrollDirection } from '../../app/state.ts'

import { isSplitLayout } from '../../app/state.ts'

// -- viewer mode key maps --

export const VIEWER_KEY_MAP: Record<
	string,
	(key: Pick<KeyEvent, 'ctrl'>, state: AppState, mediaCount: number) => AppAction | null
> = {
	q: () => ({ type: 'Quit' }),
	'?': () => ({ type: 'CycleLegend' }),
	l: () => ({ type: 'CycleLayout' }),
	s: () => ({ type: 'ToggleSync' }),
	tab: (_, state) => ({
		type: 'FocusPane',
		target: state.focus === 'source' ? 'preview' : 'source',
	}),
	j: () => ({ type: 'Scroll', direction: 'down' }),
	k: () => ({ type: 'Scroll', direction: 'up' }),
	down: () => ({ type: 'Scroll', direction: 'down' }),
	up: () => ({ type: 'Scroll', direction: 'up' }),
	pagedown: () => ({ type: 'Scroll', direction: 'pageDown' }),
	pageup: () => ({ type: 'Scroll', direction: 'pageUp' }),
	g: () => ({ type: 'Scroll', direction: 'top' }),
	home: () => ({ type: 'Scroll', direction: 'top' }),
	end: () => ({ type: 'Scroll', direction: 'bottom' }),
	d: (key) => (key.ctrl ? { type: 'Scroll', direction: 'halfDown' } : null),
	u: (key) => (key.ctrl ? { type: 'Scroll', direction: 'halfUp' } : null),
	// media navigation — no-op in source-only (no preview pane)
	n: (_, state, mediaCount) => {
		if (state.layout === 'source-only' || mediaCount === 0) return null
		return { type: 'FocusNextMedia', mediaCount }
	},
	return: (_, state) => {
		if (state.layout === 'source-only') return null
		if (state.mediaFocusIndex == null) return null
		return { type: 'OpenMediaModal' }
	},
}

export const VIEWER_SHIFT_KEY_MAP: Record<
	string,
	(state: AppState, mediaCount: number) => AppAction
> = {
	g: () => ({ type: 'Scroll', direction: 'bottom' }),
	n: (state, mediaCount) => {
		if (state.layout === 'source-only' || mediaCount === 0)
			return { type: 'Scroll', direction: 'down' } // no-op fallback
		return { type: 'FocusPrevMedia', mediaCount }
	},
}

// modal key handler — called when modal is open, swallows all non-modal keys
export function handleModalKey(
	key: KeyEvent,
	state: AppState,
	dispatch: React.Dispatch<AppAction>,
	mediaCount: number,
): void {
	switch (key.name) {
		case 'escape':
			dispatch({ type: 'CloseMediaModal' })
			return
		case 'n':
			if (key.shift) {
				dispatch({ type: 'FocusPrevMedia', mediaCount })
				if (state.mediaModal.kind !== 'closed') {
					// update modal to show new focused media
					queueMicrotask(() => dispatch({ type: 'OpenMediaModal' }))
				}
			} else {
				dispatch({ type: 'FocusNextMedia', mediaCount })
				if (state.mediaModal.kind !== 'closed') {
					queueMicrotask(() => dispatch({ type: 'OpenMediaModal' }))
				}
			}
			return
		case ' ':
			// play/pause — Phase 3 will wire this
			return
		case 'q':
			dispatch({ type: 'Quit' })
			return
	}
	// swallow all other keys when modal is open
}

// -- scroll helpers --

export function applyScroll(ref: ScrollBoxRenderable | null, direction: ScrollDirection): void {
	if (ref == null) return
	switch (direction) {
		case 'top':
			ref.scrollTo(0)
			break
		case 'bottom':
			ref.scrollTo(ref.scrollHeight)
			break
		case 'pageUp':
			ref.scrollBy(-1, 'viewport')
			break
		case 'pageDown':
			ref.scrollBy(1, 'viewport')
			break
		case 'halfUp':
			ref.scrollBy(-0.5, 'viewport')
			break
		case 'halfDown':
			ref.scrollBy(0.5, 'viewport')
			break
		default:
			break
	}
}

export function syncScroll(
	focusedRef: ScrollBoxRenderable | null,
	otherRef: ScrollBoxRenderable | null,
): void {
	if (focusedRef == null || otherRef == null) return
	const srcHeight = focusedRef.scrollHeight
	if (srcHeight <= 0) return
	const percent = focusedRef.scrollTop / srcHeight
	const targetPos = Math.round(percent * otherRef.scrollHeight)
	otherRef.scrollTo(targetPos)
}

// mouse handler factory — produces the 4 mouse callbacks for viewer layout
export function createMouseHandlers(
	state: AppState,
	dispatch: React.Dispatch<AppAction>,
	sourceRef: React.RefObject<ScrollBoxRenderable | null>,
	previewRef: React.RefObject<ScrollBoxRenderable | null>,
) {
	return {
		onSourceMouseDown() {
			if (state.focus !== 'source' && isSplitLayout(state.layout))
				dispatch({ type: 'FocusPane', target: 'source' })
		},
		onPreviewMouseDown() {
			if (state.focus !== 'preview' && isSplitLayout(state.layout))
				dispatch({ type: 'FocusPane', target: 'preview' })
		},
		onSourceMouseScroll() {
			if (state.scrollSync && isSplitLayout(state.layout) && state.focus === 'source')
				queueMicrotask(() => syncScroll(sourceRef.current, previewRef.current))
		},
		onPreviewMouseScroll() {
			if (state.scrollSync && isSplitLayout(state.layout) && state.focus === 'preview')
				queueMicrotask(() => syncScroll(previewRef.current, sourceRef.current))
		},
	}
}
