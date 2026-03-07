// extracted image loading hook — state machine, cache, inflight coalescing, decode orchestration.

import { useEffect, useRef, useState } from 'react'

import type { LoadedImage } from '../../image/types.ts'
import type { ImageContextValue } from './image-context.tsx'

import { createImageCache, imageCacheKey, type ImageCache } from '../../image/cache.ts'
import { decodeImage } from '../../image/decoder.ts'
import { loadImageFile } from '../../image/loader.ts'

export type ImageState = 'idle' | 'loading' | 'loaded' | 'error'

// inflight promise map for request coalescing
const inflightDecodes = new Map<string, Promise<LoadedImage | null>>()

// 50MB per-document LRU cache
const IMAGE_BUDGET = 50 * 1024 * 1024
let imageCache: ImageCache = createImageCache(IMAGE_BUDGET)

export function clearImageCache(): void {
	imageCache.clear()
	imageCache = createImageCache(IMAGE_BUDGET)
	inflightDecodes.clear()
}

export interface ImageLoaderResult {
	state: ImageState
	image: LoadedImage | null
	errorMsg: string
}

export function useImageLoader(
	url: string | undefined,
	ctx: ImageContextValue | null,
): ImageLoaderResult {
	const [state, setState] = useState<ImageState>('idle')
	const [image, setImage] = useState<LoadedImage | null>(null)
	const [errorMsg, setErrorMsg] = useState('')
	const loadIdRef = useRef(0)

	useEffect(() => {
		// skip loading when no context, no URL, or text-only protocol
		if (ctx == null || url == null) return
		if (ctx.capabilities.protocol === 'text') return

		const thisLoadId = ++loadIdRef.current
		const isStale = () => loadIdRef.current !== thisLoadId

		setState('loading')
		setImage(null)
		setErrorMsg('')

		void (async () => {
			const loadResult = await loadImageFile(url, ctx.basePath)
			if (isStale()) return
			if (!loadResult.ok) {
				setState('error')
				setErrorMsg(loadResult.error === 'file not found' ? 'not found' : loadResult.error)
				return
			}

			const { bytes, absolutePath, mtime } = loadResult.value
			const purpose = ctx.capabilities.protocol === 'kitty-virtual' ? 'kitty' : 'halfblock'
			const targetCols = ctx.maxCols
			const cacheKey = imageCacheKey(absolutePath, mtime, targetCols)

			// check LRU cache first
			const cached = imageCache.get(cacheKey)
			if (cached != null) {
				setImage(cached)
				setState('loaded')
				return
			}

			// check inflight map for request coalescing
			let decodePromise = inflightDecodes.get(cacheKey)
			if (decodePromise == null) {
				decodePromise = decodeImage(
					bytes,
					targetCols,
					ctx.capabilities.cellPixelWidth,
					ctx.capabilities.cellPixelHeight,
					purpose,
					url,
				).then((r) => {
					inflightDecodes.delete(cacheKey)
					if (r.ok) {
						imageCache.set(cacheKey, r.value)
						return r.value
					}
					return null
				})
				inflightDecodes.set(cacheKey, decodePromise)
			}

			const decoded = await decodePromise
			if (isStale()) return

			if (decoded == null) {
				setState('error')
				return
			}

			setImage(decoded)
			setState('loaded')
		})()
	}, [url, ctx?.basePath, ctx?.capabilities.protocol, ctx?.maxCols])

	return { state, image, errorMsg }
}
