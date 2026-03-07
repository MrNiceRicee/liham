// image decoder — sharp: decode + resize to terminal dimensions.
// lazy import for zero startup cost when no images are present.
// renderer-agnostic: decodes all frames for animated GIFs.
// renderers choose whether to animate or show static first frame.

import type { ImageResult, LoadedImage } from './types.ts'

import { createSemaphore } from './semaphore.ts'

const MAX_DECODED_PIXELS = 25_000_000
const MIN_FRAME_DELAY_MS = 100 // browser convention for delay <= 10ms

export interface AnimationLimits {
	maxFrames: number
	maxDecodedBytes: number
}

const DEFAULT_ANIMATION_LIMITS: AnimationLimits = {
	maxFrames: 20,
	maxDecodedBytes: 10 * 1024 * 1024,
}

export interface DecodeOptions {
	bytes: Uint8Array
	targetCols: number
	cellPixelWidth: number
	cellPixelHeight: number
	purpose: 'kitty' | 'halfblock'
	source: string
	animationLimits?: AnimationLimits
	shouldContinue?: () => boolean
	signal?: AbortSignal
}

// lazy sharp reference — initialized on first decode
// using `any` for the module type since sharp's TS exports vary across versions
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- sharp module type varies
let sharpModule: any
let sharpAvailable: boolean | undefined

export async function initSharp(): Promise<boolean> {
	if (sharpAvailable != null) return sharpAvailable
	try {
		sharpModule = (await import('sharp')).default
		sharpModule.cache(false)
		sharpModule.concurrency(1)
		sharpAvailable = true
		return true
	} catch {
		sharpAvailable = false
		return false
	}
}

export function isSharpAvailable(): boolean {
	return sharpAvailable === true
}

const decodeSemaphore = createSemaphore(2)

export async function getImageDimensions(
	bytes: Uint8Array,
): Promise<ImageResult<{ width: number; height: number }>> {
	if (!(await initSharp()) || sharpModule == null) {
		return { ok: false, error: 'sharp not available' }
	}

	try {
		const meta = await sharpModule(bytes).metadata()
		const { width, height } = meta
		if (width == null || height == null || width <= 0 || height <= 0) {
			return { ok: false, error: 'invalid image dimensions' }
		}
		return { ok: true, value: { width, height } }
	} catch (cause) {
		return { ok: false, error: 'failed to read image metadata', cause }
	}
}

export async function decodeImage(options: DecodeOptions): Promise<ImageResult<LoadedImage>> {
	if (!(await initSharp()) || sharpModule == null) {
		return { ok: false, error: 'sharp not available' }
	}

	await decodeSemaphore.acquire(options.signal)
	try {
		return await decodeInternal(
			sharpModule,
			options.bytes,
			options.targetCols,
			options.cellPixelWidth,
			options.cellPixelHeight,
			options.purpose,
			options.source,
			options.animationLimits ?? DEFAULT_ANIMATION_LIMITS,
			options.shouldContinue,
		)
	} finally {
		decodeSemaphore.release()
	}
}

// -- internals --

// decode + resize a single page to RGBA, copying the buffer to avoid sharp pool reuse
async function decodePage(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- sharp module type varies
	sharp: any,
	bytes: Uint8Array,
	page: number,
	targetWidth: number,
	purpose: 'kitty' | 'halfblock',
): Promise<{ rgba: Uint8Array; width: number; height: number }> {
	const { data, info } = await sharp(bytes, {
		page,
		limitInputPixels: MAX_DECODED_PIXELS,
		pages: 1,
		failOn: 'error',
	})
		.ensureAlpha()
		.resize(targetWidth, null, { fit: 'inside', kernel: 'lanczos3', withoutEnlargement: true })
		.raw()
		.toBuffer({ resolveWithObject: true })

	// copy buffer — sharp's pool can recycle the underlying memory
	const padded = purpose === 'halfblock'
		? padToEvenHeight(data, info.width, info.height)
		: { rgba: Uint8Array.from(data), height: info.height }

	return { rgba: padded.rgba, width: info.width, height: padded.height }
}

function terminalDimensions(
	width: number,
	height: number,
	purpose: 'kitty' | 'halfblock',
	cellPixelWidth: number,
	cellPixelHeight: number,
): { terminalCols: number; terminalRows: number } {
	const terminalCols = purpose === 'halfblock' ? width : Math.ceil(width / cellPixelWidth)
	const terminalRows = purpose === 'halfblock' ? height / 2 : Math.ceil(height / cellPixelHeight)
	return { terminalCols, terminalRows }
}

// pad RGBA buffer to even height for halfblock rendering
function padToEvenHeight(data: Uint8Array, width: number, height: number): { rgba: Uint8Array; height: number } {
	if (height % 2 === 0) {
		const copy = new Uint8Array(data.byteLength)
		copy.set(data)
		return { rgba: copy, height }
	}
	const paddedHeight = height + 1
	const padded = new Uint8Array(width * paddedHeight * 4)
	padded.set(data)
	return { rgba: padded, height: paddedHeight }
}

async function decodeInternal(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- sharp module type varies
	sharp: any,
	bytes: Uint8Array,
	targetCols: number,
	cellPixelWidth: number,
	cellPixelHeight: number,
	purpose: 'kitty' | 'halfblock',
	source: string,
	limits: AnimationLimits,
	shouldContinue?: () => boolean,
): Promise<ImageResult<LoadedImage>> {
	try {
		const meta = await sharp(bytes).metadata()
		const { width: origW, height: origH } = meta
		if (origW == null || origH == null || origW <= 0 || origH <= 0) {
			return { ok: false, error: 'invalid image dimensions' }
		}
		if (origW * origH > MAX_DECODED_PIXELS) {
			return { ok: false, error: 'image too large to decode' }
		}

		const targetWidth = purpose === 'halfblock' ? targetCols : targetCols * cellPixelWidth
		const pageCount = typeof meta.pages === 'number' ? meta.pages : 1

		if (pageCount > 1) {
			return decodeAnimated(sharp, bytes, targetWidth, purpose, cellPixelWidth, cellPixelHeight, meta, source, limits, shouldContinue)
		}

		return decodeSingleFrame(sharp, bytes, targetWidth, purpose, cellPixelWidth, cellPixelHeight, source)
	} catch (cause) {
		return { ok: false, error: 'image decode failed', cause }
	}
}

async function decodeSingleFrame(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- sharp module type varies
	sharp: any,
	bytes: Uint8Array,
	targetWidth: number,
	purpose: 'kitty' | 'halfblock',
	cellPixelWidth: number,
	cellPixelHeight: number,
	source: string,
): Promise<ImageResult<LoadedImage>> {
	const { rgba, width, height } = await decodePage(sharp, bytes, 0, targetWidth, purpose)
	const { terminalCols, terminalRows } = terminalDimensions(width, height, purpose, cellPixelWidth, cellPixelHeight)

	return {
		ok: true,
		value: { rgba, width, height, terminalRows, terminalCols, byteSize: rgba.byteLength, source },
	}
}

async function decodeAnimated(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- sharp module type varies
	sharp: any,
	bytes: Uint8Array,
	targetWidth: number,
	purpose: 'kitty' | 'halfblock',
	cellPixelWidth: number,
	cellPixelHeight: number,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- sharp metadata type
	meta: any,
	source: string,
	limits: AnimationLimits,
	shouldContinue?: () => boolean,
): Promise<ImageResult<LoadedImage>> {
	const frameCount = Math.min(typeof meta.pages === 'number' ? meta.pages : 1, limits.maxFrames)
	const rawDelays: number[] = Array.isArray(meta.delay) ? meta.delay : []

	const frames: Uint8Array[] = []
	let totalDecoded = 0
	let finalWidth = 0
	let finalHeight = 0

	for (let i = 0; i < frameCount; i++) {
		const { rgba, width, height } = await decodePage(sharp, bytes, i, targetWidth, purpose)

		totalDecoded += rgba.byteLength
		if (totalDecoded > limits.maxDecodedBytes) break
		if (shouldContinue != null && !shouldContinue()) break

		frames.push(rgba)
		finalWidth = width
		finalHeight = height
	}

	if (frames.length === 0) {
		return { ok: false, error: 'image decode failed' }
	}

	const delays = clampDelays(rawDelays, frames.length)
	const { terminalCols, terminalRows } = terminalDimensions(finalWidth, finalHeight, purpose, cellPixelWidth, cellPixelHeight)

	return {
		ok: true,
		value: {
			rgba: frames[0]!,
			width: finalWidth,
			height: finalHeight,
			terminalRows,
			terminalCols,
			byteSize: totalDecoded,
			source,
			frames,
			delays,
		},
	}
}

// clamp delays: <=10ms → 100ms (browser convention), pad if shorter than frame count
function clampDelays(rawDelays: number[], frameCount: number): number[] {
	const delays = rawDelays.slice(0, frameCount).map(d => (d <= 10 ? MIN_FRAME_DELAY_MS : d))
	while (delays.length < frameCount) delays.push(MIN_FRAME_DELAY_MS)
	return delays
}
