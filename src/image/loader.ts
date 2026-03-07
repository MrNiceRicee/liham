// image loader — resolves paths, validates files, reads bytes.
// renderer-agnostic, no framework imports.

import { readFile, realpath, stat } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'

import type { ImageResult } from './types.ts'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

// magic byte signatures for supported formats
const MAGIC_PNG = [0x89, 0x50, 0x4e, 0x47] as const // 89504e47
const MAGIC_JPEG = [0xff, 0xd8, 0xff] as const // ffd8ff
const MAGIC_GIF = [0x47, 0x49, 0x46] as const // 474946 (GIF)
const MAGIC_WEBP_RIFF = [0x52, 0x49, 0x46, 0x46] as const // RIFF
const MAGIC_WEBP_WEBP = [0x57, 0x45, 0x42, 0x50] as const // WEBP at offset 8

function matchesBytes(bytes: Uint8Array, offset: number, signature: readonly number[]): boolean {
	for (let i = 0; i < signature.length; i++) {
		if (bytes[offset + i] !== signature[i]) return false
	}
	return true
}

function isValidMagicBytes(bytes: Uint8Array): boolean {
	if (bytes.length < 12) return false
	if (matchesBytes(bytes, 0, MAGIC_PNG)) return true
	if (matchesBytes(bytes, 0, MAGIC_JPEG)) return true
	if (matchesBytes(bytes, 0, MAGIC_GIF)) return true
	// WebP: RIFF at offset 0 AND WEBP at offset 8
	if (matchesBytes(bytes, 0, MAGIC_WEBP_RIFF) && matchesBytes(bytes, 8, MAGIC_WEBP_WEBP)) return true
	return false
}

export interface LoadedFile {
	bytes: Uint8Array
	absolutePath: string
	mtime: number
}

export async function resolveImagePath(src: string, basePath: string): Promise<ImageResult<string>> {
	try {
		const resolved = isAbsolute(src) ? resolve(src) : resolve(join(basePath, src))
		// realpath canonicalizes symlinks — prevents following malicious symlinks
		const realResolved = await realpath(resolved)
		return { ok: true, value: realResolved }
	} catch {
		return { ok: false, error: 'file not found' }
	}
}

export async function loadImageFile(src: string, basePath: string): Promise<ImageResult<LoadedFile>> {
	const pathResult = await resolveImagePath(src, basePath)
	if (!pathResult.ok) return pathResult

	const absolutePath = pathResult.value

	try {
		const s = await stat(absolutePath)
		if (s.size > MAX_FILE_SIZE) {
			return { ok: false, error: 'file too large' }
		}

		const bytes = new Uint8Array(await readFile(absolutePath))

		if (!isValidMagicBytes(bytes)) {
			return { ok: false, error: 'unsupported image format' }
		}

		return { ok: true, value: { bytes, absolutePath, mtime: s.mtimeMs } }
	} catch {
		return { ok: false, error: 'cannot read file' }
	}
}
