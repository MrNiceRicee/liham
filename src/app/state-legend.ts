// legend entries — key hint labels for status bar.

import type { AppState, FocusTarget, LegendPage, MediaModalState } from './state.ts'
import { isSplitLayout } from './state.ts'

export interface LegendEntry {
	key: string
	label: string
}

function oppositeFocus(focus: FocusTarget): FocusTarget {
	return focus === 'source' ? 'preview' : 'source'
}

function modalLegend(modal: MediaModalState, legendPage: LegendPage): LegendEntry[] {
	if (legendPage === 'off') return [{ key: '?', label: 'help' }]
	return [
		{ key: '?', label: 'more' },
		{ key: 'n/N', label: 'next/prev' },
		{ key: 'space', label: modal.kind === 'open' && modal.paused ? 'play' : 'pause' },
		{ key: '</', label: 'seek' },
		{ key: 'r', label: 'replay' },
		{ key: 'g', label: 'gallery' },
		{ key: 'esc', label: 'close' },
	]
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

// key priority: search-input > search-active > toc > modal > media-focus > normal
export function legendEntries(state: AppState): LegendEntry[] {
	if (state.mode === 'browser') return browserLegend(state.legendPage)
	if (state.searchState?.phase === 'input') return searchInputLegend()
	if (state.searchState?.phase === 'active') return searchActiveLegend(state.legendPage)
	if (state.tocState != null) return tocLegend(state.legendPage)
	if (state.mediaModal.kind !== 'closed') return modalLegend(state.mediaModal, state.legendPage)
	if (state.mediaFocusIndex != null) return mediaFocusLegend(state.legendPage)
	return viewerLegend(state)
}
