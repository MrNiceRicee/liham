// image decoder — sharp: decode + resize to terminal dimensions.
// lazy import for zero startup cost when no images are present.

import type { ImageResult, LoadedImage } from './types.ts'

import { createSemaphore } from './semaphore.ts'

const MAX_DECODED_PIXELS = 25_000_000

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
		return await decodeInternal(
			sharpModule,
			bytes,
			targetCols,
			cellPixelWidth,
			cellPixelHeight,
			purpose,
			source,
		)
	} finally {
		decodeSemaphore.release()
	}
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
		// pre-check dimensions via metadata
		const meta = await sharp(bytes).metadata()
		const { width: origW, height: origH } = meta
		if (origW == null || origH == null || origW <= 0 || origH <= 0) {
			return { ok: false, error: 'invalid image dimensions' }
		}
		if (origW * origH > MAX_DECODED_PIXELS) {
			return { ok: false, error: 'image too large to decode' }
		}

		// halfblock: 1 pixel = 1 terminal column, 2 pixels = 1 terminal row
		// kitty: actual pixel dimensions mapped to cell grid
		const targetWidth = purpose === 'halfblock'
			? targetCols
			: targetCols * cellPixelWidth

		const { data, info } = await sharp(bytes, {
			limitInputPixels: MAX_DECODED_PIXELS,
			pages: 1,
			failOn: 'error',
		})
			.ensureAlpha()
			.resize(targetWidth, null, {
				fit: 'inside',
				kernel: 'lanczos3',
				withoutEnlargement: true,
			})
			.raw()
			.toBuffer({ resolveWithObject: true })

		const { width } = info
		let { height } = info

		// for halfblock, pad height to even
		let rgba: Uint8Array
		if (purpose === 'halfblock' && height % 2 !== 0) {
			const paddedHeight = height + 1
			const paddedData = new Uint8Array(width * paddedHeight * 4)
			paddedData.set(data)
			// extra row is already zeroed (transparent)
			rgba = paddedData
			height = paddedHeight
		} else {
			rgba = new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
		}

		// halfblock: width IS terminal cols (1:1), height/2 IS terminal rows
		// kitty: map pixel dimensions back to cell grid
		const terminalCols = purpose === 'halfblock' ? width : Math.ceil(width / cellPixelWidth)
		const terminalRows = purpose === 'halfblock' ? height / 2 : Math.ceil(height / cellPixelHeight)

		return {
			ok: true,
			value: {
				rgba,
				width,
				height,
				terminalRows,
				terminalCols,
				byteSize: rgba.byteLength,
				source,
			},
		}
	} catch (cause) {
		return { ok: false, error: 'image decode failed', cause }
	}
}
