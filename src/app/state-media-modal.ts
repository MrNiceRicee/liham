// media modal sub-reducer — extracted from state.ts for file size and complexity.

import type { AppAction, AppState, MediaModalState } from './state.ts'

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
	if (state.mediaFocusIndex == null) return state
	const prevHidden = state.mediaModal.kind === 'open' ? state.mediaModal.galleryHidden : false
	return {
		...state,
		mediaModal: {
			kind: 'open',
			mediaIndex: state.mediaFocusIndex,
			galleryHidden: prevHidden,
			paused: false,
			restartCount: 0,
			seekOffset: 0,
		},
	}
}

function seekMedia(state: AppState, delta: number, duration: number): AppState {
	if (state.mediaModal.kind !== 'open') return state
	const newOffset = Math.max(0, Math.min(state.mediaModal.seekOffset + delta, duration))
	// seeking backward to/past start — replay from beginning even if seekOffset is already 0
	if (newOffset === 0 && delta < 0) {
		return {
			...state,
			mediaModal: {
				...state.mediaModal,
				seekOffset: 0,
				restartCount: state.mediaModal.restartCount + 1,
			},
		}
	}
	if (newOffset === state.mediaModal.seekOffset) return state
	return {
		...state,
		mediaModal: {
			...state.mediaModal,
			seekOffset: newOffset,
			restartCount: state.mediaModal.restartCount + 1,
		},
	}
}

function closeMediaModal(state: AppState): AppState {
	if (state.mediaModal.kind !== 'closed') {
		return { ...state, mediaModal: { kind: 'closed' } }
	}
	if (state.mediaFocusIndex != null) {
		return { ...state, mediaFocusIndex: null }
	}
	return state
}

function withOpenModal(state: AppState, update: (modal: MediaModalState & { kind: 'open' }) => MediaModalState): AppState {
	if (state.mediaModal.kind !== 'open') return state
	return { ...state, mediaModal: update(state.mediaModal) }
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
			return seekMedia(state, action.delta, action.duration)
		case 'CloseMediaModal':
			return closeMediaModal(state)
	}
}
