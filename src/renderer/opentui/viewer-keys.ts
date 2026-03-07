// viewer mode key handlers — extracted from app.tsx for file size.

import type { KeyEvent, ScrollBoxRenderable } from '@opentui/core'

import type { AppAction, AppState, ScrollDirection } from '../../app/state.ts'

// -- viewer mode key maps --

export const VIEWER_KEY_MAP: Record<
	string,
	(key: Pick<KeyEvent, 'ctrl'>, state: AppState) => AppAction | null
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
}

export const VIEWER_SHIFT_KEY_MAP: Record<string, () => AppAction> = {
	g: () => ({ type: 'Scroll', direction: 'bottom' }),
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
