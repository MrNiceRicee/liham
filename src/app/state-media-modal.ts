// media modal sub-reducer — extracted from state.ts for file size and complexity.

import type { AppAction, AppState, MediaOverlay } from './state.ts'

type MediaModalAction = Extract<
	AppAction,
	{
		type:
			| 'OpenMediaModal'
			| 'CloseMediaModal'
			| 'ToggleGallery'
			| 'TogglePlayPause'
			| 'ReplayMedia'
			| 'SeekMedia'
	}
>

function openMediaModal(state: AppState): AppState {
	if (state.media.kind === 'none') return state
	const prevHidden = state.media.kind === 'modal' ? state.media.galleryHidden : false
	return {
		...state,
		media: {
			kind: 'modal',
			index: state.media.index,
			mediaIndex: state.media.index,
			galleryHidden: prevHidden,
			paused: false,
			restartCount: 0,
			seekOffset: 0,
		},
	}
}

function seekMedia(state: AppState, delta: number, duration: number, elapsed: number): AppState {
	if (state.media.kind !== 'modal') return state
	const newOffset = Math.max(0, Math.min(elapsed + delta, duration))
	// seeking backward to/past start — replay from beginning even if seekOffset is already 0
	if (newOffset === 0 && delta < 0) {
		return {
			...state,
			media: {
				...state.media,
				seekOffset: 0,
				restartCount: state.media.restartCount + 1,
			},
		}
	}
	if (newOffset === state.media.seekOffset) return state
	return {
		...state,
		media: {
			...state.media,
			seekOffset: newOffset,
			restartCount: state.media.restartCount + 1,
		},
	}
}

function closeMediaModal(state: AppState): AppState {
	if (state.media.kind === 'modal') {
		return { ...state, media: { kind: 'focused', index: state.media.index } }
	}
	if (state.media.kind === 'focused') {
		return { ...state, media: { kind: 'none' } }
	}
	return state
}

function withOpenModal(
	state: AppState,
	update: (modal: MediaOverlay & { kind: 'modal' }) => MediaOverlay,
): AppState {
	if (state.media.kind !== 'modal') return state
	return { ...state, media: update(state.media) }
}

export function mediaModalReducer(state: AppState, action: MediaModalAction): AppState {
	switch (action.type) {
		case 'OpenMediaModal':
			return openMediaModal(state)
		case 'ToggleGallery':
			return withOpenModal(state, (m) => ({ ...m, galleryHidden: !m.galleryHidden }))
		case 'TogglePlayPause':
			return withOpenModal(state, (m) => ({ ...m, paused: !m.paused }))
		case 'ReplayMedia':
			return withOpenModal(state, (m) => ({
				...m,
				paused: false,
				restartCount: m.restartCount + 1,
				seekOffset: 0,
			}))
		case 'SeekMedia':
			return seekMedia(state, action.delta, action.duration, action.elapsed)
		case 'CloseMediaModal':
			return closeMediaModal(state)
	}
}
