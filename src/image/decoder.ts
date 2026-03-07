// image decoder — sharp: decode + resize to terminal dimensions.
// lazy import for zero startup cost when no images are present.

import type { ImageResult, LoadedImage } from './types.ts'

import { createSemaphore } from './semaphore.ts'

const MAX_DECODED_PIXELS = 25_000_000
const MAX_GIF_FRAMES = 20
const MAX_GIF_DECODED_BYTES = 10 * 1024 * 1024
const MIN_FRAME_DELAY_MS = 100 // browser convention for delay <= 10ms

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

export async function decodeImage(
	bytes: Uint8Array,
	targetCols: number,
	cellPixelWidth: number,
	cellPixelHeight: number,
	purpose: 'kitty' | 'halfblock',
	source: string,
): Promise<ImageResult<LoadedImage>> {
	if (!(await initSharp()) || sharpModule == null) {
		return { ok: false, error: 'sharp not available' }
	}

	await decodeSemaphore.acquire()
	try {
		return await decodeInternal(sharpModule, bytes, targetCols, cellPixelWidth, cellPixelHeight, purpose, source)
	} finally {
		decodeSemaphore.release()
	}
}

// pad RGBA buffer to even height for halfblock rendering
function padToEvenHeight(data: Uint8Array, width: number, height: number): { rgba: Uint8Array; height: number } {
	if (height % 2 === 0) {
		// copy — sharp's Buffer pool can recycle the underlying memory
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
		const pageCount = (meta.pages as number | undefined) ?? 1

		// animated GIF: decode multiple frames
		if (pageCount > 1) {
			return decodeAnimated(sharp, bytes, targetWidth, purpose, cellPixelWidth, cellPixelHeight, meta, source)
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
	const { data, info } = await sharp(bytes, {
		limitInputPixels: MAX_DECODED_PIXELS,
		pages: 1,
		failOn: 'error',
	})
		.ensureAlpha()
		.resize(targetWidth, null, { fit: 'inside', kernel: 'lanczos3', withoutEnlargement: true })
		.raw()
		.toBuffer({ resolveWithObject: true })

	const { width } = info
	const padded = purpose === 'halfblock' ? padToEvenHeight(data, width, info.height) : { rgba: Uint8Array.from(data), height: info.height as number }

	const terminalCols = purpose === 'halfblock' ? width : Math.ceil(width / cellPixelWidth)
	const terminalRows = purpose === 'halfblock' ? padded.height / 2 : Math.ceil(padded.height / cellPixelHeight)

	return {
		ok: true,
		value: { rgba: padded.rgba, width, height: padded.height, terminalRows, terminalCols, byteSize: padded.rgba.byteLength, source },
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
): Promise<ImageResult<LoadedImage>> {
	const frameCount = Math.min((meta.pages as number) ?? 1, MAX_GIF_FRAMES)
	const rawDelays: number[] = (meta.delay as number[] | undefined) ?? []

	const frames: Uint8Array[] = []
	let totalDecoded = 0
	let finalWidth = 0
	let finalHeight = 0

	for (let i = 0; i < frameCount; i++) {
		const { data, info } = await sharp(bytes, {
			page: i,
			limitInputPixels: MAX_DECODED_PIXELS,
		})
			.ensureAlpha()
			.resize(targetWidth, null, { fit: 'inside', kernel: 'lanczos3', withoutEnlargement: true })
			.raw()
			.toBuffer({ resolveWithObject: true })

		const padded = purpose === 'halfblock'
			? padToEvenHeight(data, info.width, info.height)
			: { rgba: Uint8Array.from(data), height: info.height as number }

		totalDecoded += padded.rgba.byteLength
		if (totalDecoded > MAX_GIF_DECODED_BYTES) break

		frames.push(padded.rgba)
		finalWidth = info.width
		finalHeight = padded.height
	}

	if (frames.length === 0) {
		return { ok: false, error: 'image decode failed' }
	}

	// clamp delays: <=10ms → 100ms (browser convention)
	const delays = rawDelays.slice(0, frames.length).map(d => (d <= 10 ? MIN_FRAME_DELAY_MS : d))
	// pad delays array if shorter than frames
	while (delays.length < frames.length) delays.push(MIN_FRAME_DELAY_MS)

	const terminalCols = purpose === 'halfblock' ? finalWidth : Math.ceil(finalWidth / cellPixelWidth)
	const terminalRows = purpose === 'halfblock' ? finalHeight / 2 : Math.ceil(finalHeight / cellPixelHeight)

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
