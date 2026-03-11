import { describe, expect, test } from 'bun:test'

import { activeLayer } from './active-layer.ts'
import { initialState } from './state.ts'

function base() {
	return initialState('preview-only', 'viewer')
}

const OPEN_MODAL = {
	kind: 'modal' as const,
	index: 0,
	mediaIndex: 0,
	galleryHidden: false,
	paused: false,
	restartCount: 0,
	seekOffset: 0,
}

describe('activeLayer', () => {
	test('browser mode returns browser', () => {
		expect(activeLayer({ ...base(), mode: 'browser' })).toBe('browser')
	})

	test('search input takes priority over toc and modal', () => {
		expect(
			activeLayer({
				...base(),
				searchState: { kind: 'input', query: '', cursor: 0 },
				tocState: { kind: 'open', cursorIndex: 0 },
				media: { ...OPEN_MODAL },
			}),
		).toBe('searchInput')
	})

	test('search active takes priority over toc', () => {
		expect(
			activeLayer({
				...base(),
				searchState: { kind: 'active', query: 'x', matchCount: 1, currentMatch: 0 },
				tocState: { kind: 'open', cursorIndex: 0 },
			}),
		).toBe('searchActive')
	})

	test('toc takes priority over modal', () => {
		expect(
			activeLayer({
				...base(),
				tocState: { kind: 'open', cursorIndex: 0 },
				media: { ...OPEN_MODAL },
			}),
		).toBe('toc')
	})

	test('toc jumping also returns toc', () => {
		expect(activeLayer({ ...base(), tocState: { kind: 'jumping', cursorIndex: 2 } })).toBe('toc')
	})

	test('modal takes priority over media focus', () => {
		expect(
			activeLayer({
				...base(),
				media: { ...OPEN_MODAL, index: 1 },
			}),
		).toBe('modal')
	})

	test('media focus takes priority over viewer', () => {
		expect(activeLayer({ ...base(), media: { kind: 'focused', index: 0 } })).toBe('mediaFocus')
	})

	test('default is viewer', () => {
		expect(activeLayer(base())).toBe('viewer')
	})
})
