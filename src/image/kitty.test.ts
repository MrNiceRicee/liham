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
	test('returns number in range 1-255', () => {
		const id = generateImageId('test.png', 12345)
		expect(id).toBeGreaterThanOrEqual(1)
		expect(id).toBeLessThanOrEqual(255)
	})

	test('different sources produce different IDs', () => {
		const id1 = generateImageId('a.png', 1)
		const id2 = generateImageId('b.png', 1)
		expect(id1).not.toBe(id2)
	})

	test('different PIDs produce different IDs', () => {
		const id1 = generateImageId('test.png', 100)
		const id2 = generateImageId('test.png', 200)
		expect(id1).not.toBe(id2)
	})

	test('deterministic for same input', () => {
		const id1 = generateImageId('test.png', 42)
		const id2 = generateImageId('test.png', 42)
		expect(id1).toBe(id2)
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
