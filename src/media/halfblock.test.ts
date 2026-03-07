import { describe, expect, test } from 'bun:test'

import type { LoadedImage } from './types.ts'

import { renderHalfBlock } from './halfblock.ts'

function makeImage(width: number, height: number, rgba: number[]): LoadedImage {
	return {
		rgba: new Uint8Array(rgba),
		width,
		height,
		terminalRows: height / 2,
		terminalCols: width,
		byteSize: rgba.length,
		source: 'test',
	}
}

describe('renderHalfBlock', () => {
	test('2x2 image produces 1 row, 2 cells', () => {
		// top-left: red, top-right: green, bottom-left: blue, bottom-right: white
		const img = makeImage(2, 2, [
			255, 0, 0, 255, 0, 255, 0, 255, // top row
			0, 0, 255, 255, 255, 255, 255, 255, // bottom row
		])
		const grid = renderHalfBlock(img, '#000000')
		expect(grid.length).toBe(1)
		expect(grid[0]!.length).toBe(2)

		// cell 0: top=red(bg), bottom=blue(fg)
		expect(grid[0]![0]!.char).toBe('▄')
		expect(grid[0]![0]!.bg).toBe('#ff0000')
		expect(grid[0]![0]!.fg).toBe('#0000ff')

		// cell 1: top=green(bg), bottom=white(fg)
		expect(grid[0]![1]!.char).toBe('▄')
		expect(grid[0]![1]!.bg).toBe('#00ff00')
		expect(grid[0]![1]!.fg).toBe('#ffffff')
	})

	test('same color top/bottom produces space', () => {
		const img = makeImage(1, 2, [
			128, 128, 128, 255, // top
			128, 128, 128, 255, // bottom
		])
		const grid = renderHalfBlock(img, '#000000')
		expect(grid[0]![0]!.char).toBe(' ')
		expect(grid[0]![0]!.fg).toBe('')
		expect(grid[0]![0]!.bg).toBe('#808080')
	})

	test('transparent pixels blend against bgColor', () => {
		// fully transparent pixel should become bg color
		const img = makeImage(1, 2, [
			0, 0, 0, 0, // top: fully transparent
			0, 0, 0, 0, // bottom: fully transparent
		])
		const grid = renderHalfBlock(img, '#1a1b26')
		expect(grid[0]![0]!.char).toBe(' ')
		expect(grid[0]![0]!.bg).toBe('#1a1b26')
	})

	test('semi-transparent pixel blends correctly', () => {
		// 50% alpha red on black bg -> ~#800000
		const img = makeImage(1, 2, [
			255, 0, 0, 128, // top: 50% red
			255, 0, 0, 128, // bottom: 50% red
		])
		const grid = renderHalfBlock(img, '#000000')
		expect(grid[0]![0]!.char).toBe(' ')
		// alpha blend: (255*128 + 0*(255-128))/255 ≈ 128 -> #800000
		expect(grid[0]![0]!.bg).toBe('#800000')
	})

	test('1x2 image produces 1 row, 1 cell', () => {
		const img = makeImage(1, 2, [
			255, 0, 0, 255, // top
			0, 0, 255, 255, // bottom
		])
		const grid = renderHalfBlock(img, '#000000')
		expect(grid.length).toBe(1)
		expect(grid[0]!.length).toBe(1)
	})
})
