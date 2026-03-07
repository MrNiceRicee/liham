// half-block renderer — converts RGBA pixels to styled character grid.
// uses U+2584 (lower half block): fg = bottom pixel, bg = top pixel.

import type { HalfBlockGrid, LoadedImage } from './types.ts'

// parse hex color string (#RRGGBB) to RGB components
function parseHex(hex: string): [number, number, number] {
	const r = parseInt(hex.slice(1, 3), 16)
	const g = parseInt(hex.slice(3, 5), 16)
	const b = parseInt(hex.slice(5, 7), 16)
	return [r, g, b]
}

// format RGB as #rrggbb
function toHex(r: number, g: number, b: number): string {
	return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

// alpha blend a single pixel against background (integer arithmetic)
function blend(
	sr: number,
	sg: number,
	sb: number,
	sa: number,
	bgR: number,
	bgG: number,
	bgB: number,
): string {
	if (sa === 255) return toHex(sr, sg, sb)
	if (sa === 0) return toHex(bgR, bgG, bgB)
	const r = ((sr * sa + bgR * (255 - sa)) / 255) | 0
	const g = ((sg * sa + bgG * (255 - sa)) / 255) | 0
	const b = ((sb * sa + bgB * (255 - sa)) / 255) | 0
	return toHex(r, g, b)
}

export function renderHalfBlock(image: LoadedImage, bgColor: string): HalfBlockGrid {
	const { rgba, width, height } = image
	const [bgR, bgG, bgB] = parseHex(bgColor)
	const grid: HalfBlockGrid = []

	for (let y = 0; y < height; y += 2) {
		const row: HalfBlockGrid[number] = []
		for (let x = 0; x < width; x++) {
			const topIdx = (y * width + x) * 4
			const botIdx = ((y + 1) * width + x) * 4

			const topColor = blend(
				rgba[topIdx]!, rgba[topIdx + 1]!, rgba[topIdx + 2]!, rgba[topIdx + 3]!,
				bgR, bgG, bgB,
			)
			const botColor = blend(
				rgba[botIdx]!, rgba[botIdx + 1]!, rgba[botIdx + 2]!, rgba[botIdx + 3]!,
				bgR, bgG, bgB,
			)

			// same-color optimization: space with bg only
			if (topColor === botColor) {
				row.push({ char: ' ', fg: '', bg: topColor })
			} else {
				row.push({ char: '▄', fg: botColor, bg: topColor })
			}
		}
		grid.push(row)
	}

	return grid
}

// merged span representation — consecutive same-colored cells combined into one
export interface MergedSpan {
	text: string
	fg: string
	bg: string
}

// merge consecutive same-colored cells in a row into single spans
function mergeRow(
	rgba: Uint8Array,
	y: number,
	width: number,
	bgR: number,
	bgG: number,
	bgB: number,
): MergedSpan[] {
	const spans: MergedSpan[] = []
	let curFg = ''
	let curBg = ''
	let curText = ''

	for (let x = 0; x < width; x++) {
		const topIdx = (y * width + x) * 4
		const botIdx = ((y + 1) * width + x) * 4

		const topColor = blend(rgba[topIdx]!, rgba[topIdx + 1]!, rgba[topIdx + 2]!, rgba[topIdx + 3]!, bgR, bgG, bgB)
		const botColor = blend(rgba[botIdx]!, rgba[botIdx + 1]!, rgba[botIdx + 2]!, rgba[botIdx + 3]!, bgR, bgG, bgB)

		const fg = topColor === botColor ? '' : botColor
		const bg = topColor
		const ch = topColor === botColor ? ' ' : '▄'

		if (fg === curFg && bg === curBg) {
			curText += ch
		} else {
			if (curText.length > 0) spans.push({ text: curText, fg: curFg, bg: curBg })
			curFg = fg
			curBg = bg
			curText = ch
		}
	}
	if (curText.length > 0) spans.push({ text: curText, fg: curFg, bg: curBg })
	return spans
}

// renders image as rows of merged spans — dramatically fewer elements for React
export function renderHalfBlockMerged(image: LoadedImage, bgColor: string): MergedSpan[][] {
	const { rgba, width, height } = image
	const [bgR, bgG, bgB] = parseHex(bgColor)
	const rows: MergedSpan[][] = []

	for (let y = 0; y < height; y += 2) {
		rows.push(mergeRow(rgba, y, width, bgR, bgG, bgB))
	}

	return rows
}
