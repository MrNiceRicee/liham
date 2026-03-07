// extracted image loading hook — state machine, cache, inflight coalescing, decode orchestration.
// viewport-aware lazy loading: images only load when near the visible scroll region.

import type { BoxRenderable, ScrollBoxRenderable } from '@opentui/core'

import { type RefObject, useEffect, useRef, useState } from 'react'

import type { ImageResult, LoadedFile, LoadedImage, RemoteFile } from '../../media/types.ts'
import type { ImageContextValue } from './image-context.tsx'

import {
	createImageCache,
	type ImageCache,
	localCacheKey,
	remoteCacheKey,
} from '../../media/cache.ts'
import { type AnimationLimits, decodeImage } from '../../media/decoder.ts'
import { fetchRemoteImage } from '../../media/fetcher.ts'
import { loadImageFile } from '../../media/loader.ts'
import { createSemaphore, type Semaphore } from '../../media/semaphore.ts'

export type ImageState = 'idle' | 'loading' | 'loaded' | 'error'

// inflight promise maps for request coalescing
const inflightDecodes = new Map<string, Promise<LoadedImage | null>>()
const inflightFetches = new Map<string, Promise<ImageResult<RemoteFile>>>()

// 50MB per-document LRU cache
const IMAGE_BUDGET = 50 * 1024 * 1024
let imageCache: ImageCache = createImageCache(IMAGE_BUDGET)

// max 3 concurrent remote fetches to prevent thundering herd
const fetchSemaphore: Semaphore = createSemaphore(3)

export function clearImageCache(): void {
	imageCache.clear()
	imageCache = createImageCache(IMAGE_BUDGET)
	inflightDecodes.clear()
	inflightFetches.clear()
}

export interface ImageLoaderResult {
	state: ImageState
	image: LoadedImage | null
	errorMsg: string
}

function isRemoteUrl(url: string): boolean {
	return url.startsWith('http://') || url.startsWith('https://')
}

function cacheKeyForFile(file: LoadedFile, targetCols: number): string {
	if (file.kind === 'local') return localCacheKey(file.absolutePath, file.mtime, targetCols)
	return remoteCacheKey(file.url, targetCols)
}

// check if an element is near the scrollbox viewport (within 1 viewport height buffer)
function isNearViewport(box: BoxRenderable | null, scrollbox: ScrollBoxRenderable | null): boolean {
	if (box == null || scrollbox == null) return false

	const vp = scrollbox.viewport
	if (vp.height <= 0) return false

	const vpTop = vp.y
	const vpBottom = vpTop + vp.height
	const buffer = vp.height // 1 viewport height lookahead

	const imgY = box.y
	const imgH = box.height || 1

	return imgY + imgH >= vpTop - buffer && imgY <= vpBottom + buffer
}

// polls element position vs viewport until the element enters the visible zone
export function useViewportVisibility(
	boxRef: RefObject<BoxRenderable | null>,
	scrollRef: RefObject<ScrollBoxRenderable | null> | undefined,
): boolean {
	const [visible, setVisible] = useState(false)

	useEffect(() => {
		if (visible) return
		if (scrollRef == null) {
			// no scrollbox → always visible (browser preview, standalone)
			setVisible(true)
			return
		}

		const check = () => isNearViewport(boxRef.current, scrollRef.current)

		const cleanupRef = { current: () => {} }

		// check after a short delay to let yoga layout settle
		const initialTimer = setTimeout(() => {
			if (check()) {
				setVisible(true)
				return
			}
			// poll every 150ms while not yet visible
			const interval = setInterval(() => {
				if (check()) {
					setVisible(true)
					clearInterval(interval)
				}
			}, 150)
			cleanupRef.current = () => {
				clearInterval(interval)
			}
		}, 50)

		return () => {
			clearTimeout(initialTimer)
			cleanupRef.current()
		}
	}, [visible, scrollRef])

	return visible
}

// route: remote fetch (coalesced + semaphore) vs local file load
async function loadFile(
	url: string,
	basePath: string,
	signal: AbortSignal,
): Promise<ImageResult<LoadedFile>> {
	if (isRemoteUrl(url)) return throttledFetch(url, signal)
	return loadImageFile(url, basePath)
}

// inline images: 1 frame only (animation in modal only)
const INLINE_ANIMATION_LIMITS: AnimationLimits = { maxFrames: 1, maxDecodedBytes: 10 * 1024 * 1024 }

// decode with cache lookup and inflight coalescing
function coalescedDecode(
	file: LoadedFile,
	targetCols: number,
	maxRows: number | undefined,
	ctx: ImageContextValue,
	url: string,
	signal: AbortSignal,
): Promise<LoadedImage | null> {
	const limits = ctx.animationLimits ?? INLINE_ANIMATION_LIMITS
	const rowsSuffix = maxRows != null ? `@r${String(maxRows)}` : ''
	const limitsSuffix = limits.maxFrames > 1 ? `@f${String(limits.maxFrames)}` : ''
	const cacheKey = cacheKeyForFile(file, targetCols) + rowsSuffix + limitsSuffix

	const cached = imageCache.get(cacheKey)
	if (cached != null) return Promise.resolve(cached)

	let decodePromise = inflightDecodes.get(cacheKey)
	if (decodePromise == null) {
		const purpose = ctx.capabilities.protocol === 'kitty-virtual' ? 'kitty' : 'halfblock'
		decodePromise = decodeImage({
			bytes: file.bytes,
			targetCols,
			maxRows,
			cellPixelWidth: ctx.capabilities.cellPixelWidth,
			cellPixelHeight: ctx.capabilities.cellPixelHeight,
			purpose,
			source: url,
			animationLimits: limits,
			signal,
		}).then((r) => {
			inflightDecodes.delete(cacheKey)
			if (r.ok) {
				imageCache.set(cacheKey, r.value)
				return r.value
			}
			return null
		})
		inflightDecodes.set(cacheKey, decodePromise)
	}

	return decodePromise
}

export function useImageLoader(
	url: string | undefined,
	ctx: ImageContextValue | null,
	isVisible: boolean,
): ImageLoaderResult {
	const [state, setState] = useState<ImageState>('idle')
	const [image, setImage] = useState<LoadedImage | null>(null)
	const [errorMsg, setErrorMsg] = useState('')
	const loadIdRef = useRef(0)

	useEffect(() => {
		if (ctx == null || url == null) return
		if (ctx.capabilities.protocol === 'text') return
		if (!isVisible) return

		const thisLoadId = ++loadIdRef.current
		const isStale = () => loadIdRef.current !== thisLoadId
		const controller = new AbortController()

		setState('loading')
		setImage(null)
		setErrorMsg('')

		void (async () => {
			const fileResult = await loadFile(url, ctx.basePath, controller.signal)
			if (isStale()) return
			if (!fileResult.ok) {
				setState('error')
				setErrorMsg(fileResult.error === 'file not found' ? 'not found' : fileResult.error)
				return
			}

			const decoded = await coalescedDecode(
				fileResult.value,
				ctx.maxCols,
				ctx.maxRows,
				ctx,
				url,
				controller.signal,
			)
			if (isStale()) return

			if (decoded == null) {
				setState('error')
				return
			}

			setImage(decoded)
			setState('loaded')
		})()

		return () => {
			controller.abort()
		}
	}, [url, ctx?.basePath, ctx?.capabilities.protocol, ctx?.maxCols, ctx?.maxRows, isVisible])

	return { state, image, errorMsg }
}

// acquire semaphore slot, then coalesce the actual fetch
async function throttledFetch(url: string, signal: AbortSignal): Promise<ImageResult<RemoteFile>> {
	// skip semaphore if this URL is already being fetched (coalesced)
	if (inflightFetches.has(url)) return coalescedFetch(url, signal)

	await fetchSemaphore.acquire(signal)
	try {
		return await coalescedFetch(url, signal)
	} finally {
		fetchSemaphore.release()
	}
}

// coalesce duplicate remote URLs into a single fetch
function coalescedFetch(url: string, signal: AbortSignal): Promise<ImageResult<RemoteFile>> {
	let inflight = inflightFetches.get(url)
	if (inflight != null) return inflight

	inflight = fetchRemoteImage(url, signal).finally(() => {
		inflightFetches.delete(url)
	})
	inflightFetches.set(url, inflight)
	return inflight
}
