import { describe, expect, test } from 'bun:test'

import {
	buildCleanupAllCommand,
	buildCleanupCommand,
	buildFileTransmit,
	buildPlaceholderText,
	buildTransmitChunks,
	buildVirtualPlacement,
	generateImageId,
} from './kitty.ts'

describe('generateImageId', () => {
	test('returns numbers in range 1-255', () => {
		for (let i = 0; i < 300; i++) {
			const id = generateImageId()
			expect(id).toBeGreaterThanOrEqual(1)
			expect(id).toBeLessThanOrEqual(255)
		}
	})

	test('monotonically increases', () => {
		const a = generateImageId()
		const b = generateImageId()
		// b should be a+1, unless a was 255 (then b wraps to 1)
		if (a < 255) {
			expect(b).toBe(a + 1)
		} else {
			expect(b).toBe(1)
		}
	})

	test('wraps from 255 back to 1', () => {
		// generate enough to guarantee a wrap
		let sawWrap = false
		let prev = generateImageId()
		for (let i = 0; i < 256; i++) {
			const cur = generateImageId()
			if (prev === 255 && cur === 1) sawWrap = true
			prev = cur
		}
		expect(sawWrap).toBe(true)
	})

	test('never returns 0', () => {
		for (let i = 0; i < 512; i++) {
			expect(generateImageId()).not.toBe(0)
		}
	})
})

describe('buildTransmitChunks', () => {
	test('single chunk for small data', () => {
		const data = new Uint8Array(100)
		const result = buildTransmitChunks(1, data)
		expect(result).toContain('i=1')
		expect(result).toContain('f=100')
		expect(result).toContain('U=1')
		expect(result).toContain('q=2')
		expect(result).toContain('m=0') // last chunk
	})

	test('multiple chunks for large data', () => {
		// 4096 bytes of base64 = ~3072 raw bytes
		const data = new Uint8Array(4000)
		const result = buildTransmitChunks(1, data)
		// should have m=1 (more) in first chunk
		expect(result).toContain('m=1')
		// and m=0 in last chunk
		expect(result.lastIndexOf('m=0')).toBeGreaterThan(result.indexOf('m=1'))
	})
})

describe('buildFileTransmit', () => {
	test('encodes path as base64', () => {
		const testPath = '/home/user/images/test.png'
		const result = buildFileTransmit(5, testPath)
		expect(result).toContain('i=5')
		expect(result).toContain('t=f')
		expect(result).toContain(Buffer.from(testPath).toString('base64'))
	})
})

describe('buildVirtualPlacement', () => {
	test('includes id, cols, rows', () => {
		const result = buildVirtualPlacement(10, 40, 20)
		expect(result).toContain('i=10')
		expect(result).toContain('c=40')
		expect(result).toContain('r=20')
		expect(result).toContain('U=1')
	})
})

describe('buildPlaceholderText', () => {
	test('1x1 produces single placeholder with diacritics', () => {
		const result = buildPlaceholderText(42, 1, 1)
		expect(result).toContain('\x1b[38;5;42m')
		expect(result).toContain(String.fromCodePoint(0x10eeee))
		expect(result).toContain('\x1b[39m')
	})

	test('2x3 produces correct grid', () => {
		const result = buildPlaceholderText(1, 2, 3)
		// should have a newline between rows
		const lines = result.split('\n')
		expect(lines.length).toBe(2)
	})
})

describe('buildCleanupCommand', () => {
	test('uses uppercase I for full cleanup', () => {
		const result = buildCleanupCommand(7)
		expect(result).toContain('d=I')
		expect(result).toContain('i=7')
		expect(result).toContain('q=2')
	})
})

describe('buildCleanupAllCommand', () => {
	test('uses d=A for all images', () => {
		const result = buildCleanupAllCommand()
		expect(result).toContain('d=A')
		expect(result).toContain('q=2')
	})
})
