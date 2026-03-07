// LRU image cache — factory function, per-document memory budget.
// keys include target dimensions to prevent serving wrong-resolution images.

import type { LoadedImage } from './types.ts'

export interface ImageCache {
	get(key: string): LoadedImage | undefined
	set(key: string, image: LoadedImage): void
	clear(): void
	totalBytes(): number
}

export function createImageCache(
	budgetBytes: number,
	onEvict?: (key: string) => void,
): ImageCache {
	const entries = new Map<string, LoadedImage>()
	let currentBytes = 0

	function evictUntilFits(needed: number): void {
		// evict oldest entries (first inserted/accessed) until under budget
		for (const [key, img] of entries) {
			if (currentBytes + needed <= budgetBytes) break
			entries.delete(key)
			currentBytes -= img.byteSize
			onEvict?.(key)
		}
	}

	return {
		get(key: string): LoadedImage | undefined {
			const img = entries.get(key)
			if (img == null) return undefined
			// move to end (most recently used) by re-inserting
			entries.delete(key)
			entries.set(key, img)
			return img
		},

		set(key: string, image: LoadedImage): void {
			// if updating an existing entry, subtract old size
			const existing = entries.get(key)
			if (existing != null) {
				currentBytes -= existing.byteSize
				entries.delete(key)
			}

			evictUntilFits(image.byteSize)
			entries.set(key, image)
			currentBytes += image.byteSize
		},

		clear(): void {
			if (onEvict != null) {
				for (const key of entries.keys()) {
					onEvict(key)
				}
			}
			entries.clear()
			currentBytes = 0
		},

		totalBytes(): number {
			return currentBytes
		},
	}
}

// cache key includes source identity and target width
export function localCacheKey(absolutePath: string, mtime: number, targetWidth: number): string {
	return `local:${absolutePath}:${String(mtime)}:${String(targetWidth)}`
}

export function remoteCacheKey(url: string, targetWidth: number): string {
	return `remote:${url}:${String(targetWidth)}`
}
