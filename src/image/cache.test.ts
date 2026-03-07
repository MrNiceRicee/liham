import { describe, expect, test } from 'bun:test'

import type { LoadedImage } from './types.ts'

import { createImageCache, imageCacheKey } from './cache.ts'

function makeImage(source: string, byteSize: number): LoadedImage {
	return {
		rgba: new Uint8Array(byteSize),
		width: 10,
		height: 10,
		terminalRows: 5,
		terminalCols: 10,
		byteSize,
		source,
	}
}

describe('createImageCache', () => {
	test('get returns undefined for missing key', () => {
		const cache = createImageCache(1024)
		expect(cache.get('missing')).toBeUndefined()
	})

	test('set and get round-trips', () => {
		const cache = createImageCache(1024)
		const img = makeImage('test.png', 100)
		cache.set('k1', img)
		expect(cache.get('k1')).toBe(img)
	})

	test('tracks total bytes', () => {
		const cache = createImageCache(1024)
		cache.set('k1', makeImage('a.png', 100))
		cache.set('k2', makeImage('b.png', 200))
		expect(cache.totalBytes()).toBe(300)
	})

	test('evicts oldest when budget exceeded', () => {
		const evicted: string[] = []
		const cache = createImageCache(250, (key) => evicted.push(key))

		cache.set('k1', makeImage('a.png', 100))
		cache.set('k2', makeImage('b.png', 100))
		// adding k3 (100) would make total 300 > 250, evicts k1
		cache.set('k3', makeImage('c.png', 100))

		expect(cache.get('k1')).toBeUndefined()
		expect(cache.get('k2')).toBeDefined()
		expect(cache.get('k3')).toBeDefined()
		expect(evicted).toContain('k1')
		expect(cache.totalBytes()).toBe(200)
	})

	test('LRU order: access moves to end', () => {
		const evicted: string[] = []
		const cache = createImageCache(250, (key) => evicted.push(key))

		cache.set('k1', makeImage('a.png', 100))
		cache.set('k2', makeImage('b.png', 100))

		// access k1 — moves it to most-recently-used
		cache.get('k1')

		// adding k3 should evict k2 (now oldest) instead of k1
		cache.set('k3', makeImage('c.png', 100))
		expect(cache.get('k2')).toBeUndefined()
		expect(cache.get('k1')).toBeDefined()
		expect(evicted).toContain('k2')
	})

	test('clear resets everything', () => {
		const cache = createImageCache(1024)
		cache.set('k1', makeImage('a.png', 100))
		cache.set('k2', makeImage('b.png', 200))
		cache.clear()
		expect(cache.get('k1')).toBeUndefined()
		expect(cache.get('k2')).toBeUndefined()
		expect(cache.totalBytes()).toBe(0)
	})

	test('same key does not double-count bytes', () => {
		const cache = createImageCache(1024)
		const img = makeImage('test.png', 100)
		cache.set('k1', img)
		// eslint-disable-next-line sonarjs/no-element-overwrite -- intentional: testing update behavior
		cache.set('k1', img)
		expect(cache.totalBytes()).toBe(100)
	})

	test('different widths produce different keys', () => {
		const key1 = imageCacheKey('/img.png', 1000, 80)
		const key2 = imageCacheKey('/img.png', 1000, 120)
		expect(key1).not.toBe(key2)
	})

	test('clear calls onEvict for each entry', () => {
		const evicted: string[] = []
		const cache = createImageCache(1024, (key) => evicted.push(key))
		cache.set('k1', makeImage('a.png', 100))
		cache.set('k2', makeImage('b.png', 100))
		cache.clear()
		expect(evicted).toEqual(['k1', 'k2'])
	})
})
