// legend entries — key hint labels for status bar.

import { detectAudioBackend } from '../media/audio-backend.ts'
import { activeLayer } from './active-layer.ts'
import type { AppState, FocusTarget, LegendPage, MediaOverlay } from './state.ts'
import { isSplitLayout } from './state.ts'

// cached once per process — Bun.which is cheap but no need to call it per render
const detectedBackend = detectAudioBackend()

export interface LegendEntry {
	key: string
	label: string
}

function oppositeFocus(focus: FocusTarget): FocusTarget {
	return focus === 'source' ? 'preview' : 'source'
}

function modalLegend(
	modal: MediaOverlay & { kind: 'modal' },
	legendPage: LegendPage,
	mediaType?: string,
): LegendEntry[] {
	if (legendPage === 'off') return [{ key: '?', label: 'help' }]
	const isPlayable = mediaType === 'video' || mediaType === 'audio'
	const entries: LegendEntry[] = [
		{ key: '?', label: 'more' },
		{ key: 'n/N', label: 'next/prev' },
	]
	if (isPlayable) {
		entries.push({ key: 'space', label: modal.paused ? 'play' : 'pause' })
		entries.push({ key: '</>', label: 'seek' })
		entries.push({ key: 'r', label: 'replay' })
	}
	entries.push({ key: 'g', label: 'gallery' })
	if (isPlayable && detectedBackend === 'mpv') {
		entries.push({ key: '+/-', label: 'volume' })
		entries.push({ key: 'm', label: 'mute' })
	}
	entries.push({ key: 'esc', label: 'close' })
	return entries
}

function mediaFocusLegend(legendPage: LegendPage): LegendEntry[] {
	if (legendPage === 'off') return [{ key: '?', label: 'help' }]
	return [
		{ key: '?', label: 'more' },
		{ key: 'n/N', label: 'next/prev media' },
		{ key: 'enter', label: 'view' },
		{ key: 'esc', label: 'unfocus' },
	]
}

function browserLegend(legendPage: LegendPage): LegendEntry[] {
	if (legendPage === 'off') return [{ key: '?', label: 'help' }]
	return [
		{ key: '?', label: 'more' },
		{ key: '\u2191/\u2193', label: 'navigate' },
		{ key: 'enter', label: 'open' },
		{ key: 'ctrl+d/u', label: 'half page' },
		{ key: 'esc', label: 'quit' },
		{ key: 'type', label: 'filter' },
	]
}

function viewerLegend(state: AppState): LegendEntry[] {
	if (state.legendPage === 'off') return [{ key: '?', label: 'help' }]

	if (state.legendPage === 'scroll') {
		return [
			{ key: '?', label: 'more' },
			{ key: 'j/k', label: 'scroll' },
			{ key: 'g/G', label: 'top/bottom' },
			{ key: 'pgup/pgdn', label: 'page' },
			{ key: 'ctrl+d/u', label: 'half' },
			{ key: 'ctrl+e/y', label: 'line' },
		]
	}

	// nav page
	const entries: LegendEntry[] = [{ key: '?', label: 'more' }]
	entries.push({ key: 'l', label: 'layout' })

	if (isSplitLayout(state.layout)) {
		const other = oppositeFocus(state.focus)
		entries.push({ key: 'Tab', label: other })
		entries.push({ key: 's', label: state.scrollSync ? 'sync on' : 'sync off' })
	}

	entries.push({ key: '/', label: 'search' })
	entries.push({ key: 't', label: 'TOC' })
	entries.push({ key: 'y', label: 'copy' })

	if (state.fromBrowser) {
		entries.push({ key: 'esc', label: 'back' })
	}

	entries.push({ key: 'q', label: 'quit' })
	return entries
}

function searchInputLegend(): LegendEntry[] {
	return [
		{ key: 'Esc', label: 'cancel' },
		{ key: 'Enter', label: 'confirm' },
		{ key: 'type', label: 'search' },
	]
}

function tocLegend(legendPage: LegendPage): LegendEntry[] {
	if (legendPage === 'off') return [{ key: '?', label: 'help' }]
	return [
		{ key: '?', label: 'more' },
		{ key: 'j/k', label: 'navigate' },
		{ key: 'Enter', label: 'jump' },
		{ key: 'Esc', label: 'close' },
		{ key: 'g/G', label: 'top/bottom' },
	]
}

function searchActiveLegend(legendPage: LegendPage): LegendEntry[] {
	if (legendPage === 'off') return [{ key: '?', label: 'help' }]
	return [
		{ key: '?', label: 'more' },
		{ key: 'n/N', label: 'next/prev' },
		{ key: 'Esc', label: 'close' },
		{ key: '/', label: 'new search' },
	]
}

export function legendEntries(state: AppState, mediaType?: string): LegendEntry[] {
	switch (activeLayer(state)) {
		case 'browser':
			return browserLegend(state.legendPage)
		case 'searchInput':
			return searchInputLegend()
		case 'searchActive':
			return searchActiveLegend(state.legendPage)
		case 'toc':
			return tocLegend(state.legendPage)
		case 'modal':
			return modalLegend(
				state.media as MediaOverlay & { kind: 'modal' },
				state.legendPage,
				mediaType,
			)
		case 'mediaFocus':
			return mediaFocusLegend(state.legendPage)
		case 'viewer':
			return viewerLegend(state)
	}
}
