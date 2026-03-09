// viewer mode key handlers — extracted from app.tsx for file size.

import type { CliRenderer, KeyEvent, ScrollBoxRenderable } from '@opentui/core'

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
	y: () => ({ type: 'CopySelection' }),
	'/': () => ({ type: 'SearchOpen' }),
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
	_state: AppState,
	dispatch: React.Dispatch<AppAction>,
	mediaCount: number,
	videoDuration = 0,
): AppAction | null {
	switch (key.name) {
		case 'escape':
			dispatch({ type: 'CloseMediaModal' })
			return null
		case 'n': {
			const focusAction: AppAction = key.shift
				? { type: 'FocusPrevMedia', mediaCount }
				: { type: 'FocusNextMedia', mediaCount }
			dispatch(focusAction)
			queueMicrotask(() => dispatch({ type: 'OpenMediaModal' }))
			return null
		}
		case 'return':
			// video/audio playback — intercepted by app.tsx before reaching here
			return null
		case 'r':
			return { type: 'ReplayMedia' }
		case 'g':
			return { type: 'ToggleGallery' }
		case 'space':
			return { type: 'TogglePlayPause' }
		case 'left':
			if (videoDuration <= 0) return null
			return { type: 'SeekMedia', delta: key.shift ? -5 : -1, duration: videoDuration }
		case 'right':
			if (videoDuration <= 0) return null
			return { type: 'SeekMedia', delta: key.shift ? 5 : 1, duration: videoDuration }
		case 'q':
			return { type: 'Quit' }
		default:
			// swallow all other keys when modal is open
			return null
	}
}

// keys allowed when media is focused (n/N mode) — everything else is blocked
const MEDIA_FOCUS_ALLOWED = new Set(['escape', 'q', '?', 'n', 'return'])

// viewer key handler — processes escape chain, shift, and normal key maps
// dispatches directly for escape-chain actions, returns action for caller to handle
export function handleViewerKey(
	key: KeyEvent,
	state: AppState,
	dispatch: React.Dispatch<AppAction>,
	mediaCount: number,
	renderer?: CliRenderer | null,
): AppAction | null {
	// escape chain: (1) selection, (2) modal/focus, (3) browser, (4) quit
	if (key.name === 'escape') {
		if (renderer?.hasSelection) {
			renderer.clearSelection()
			return null
		}
		if (state.mediaModal.kind !== 'closed' || state.mediaFocusIndex != null) {
			dispatch({ type: 'CloseMediaModal' })
			return null
		}
		if (state.fromBrowser) return { type: 'ReturnToBrowser' }
		return { type: 'Quit' }
	}

	// media focus mode — lock keys to media navigation only
	if (state.mediaFocusIndex != null && !MEDIA_FOCUS_ALLOWED.has(key.name)) {
		return null
	}

	if (key.shift) {
		const shiftMapper = VIEWER_SHIFT_KEY_MAP[key.name]
		if (shiftMapper != null) return shiftMapper(state, mediaCount)
	}

	const mapper = VIEWER_KEY_MAP[key.name]
	if (mapper == null) return null
	return mapper(key, state, mediaCount)
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
