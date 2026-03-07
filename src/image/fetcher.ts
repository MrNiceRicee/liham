// remote image fetcher — HTTP fetch with timeout, size limit, SSRF basics.

import type { ImageResult, RemoteFile } from './types.ts'

import { isValidMagicBytes } from './loader.ts'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const FETCH_TIMEOUT_MS = 10_000
const MAX_REDIRECTS = 5

function isBlockedHost(hostname: string): boolean {
	const bare = hostname.replace(/^\[|\]$/g, '') // strip IPv6 brackets
	if (bare === 'localhost' || bare === '::1' || bare === '0.0.0.0' || bare === '[::]') return true
	if (bare.startsWith('127.') || bare.startsWith('169.254.')) return true
	// IPv6-mapped IPv4 bypass prevention
	// URL parser may normalize ::ffff:127.0.0.1 to ::ffff:7f00:1 (hex form)
	if (/^::ffff:/i.test(bare)) {
		const mapped = bare.replace(/^::ffff:/i, '')
		if (mapped.startsWith('127.') || mapped.startsWith('169.254.')) return true
		// hex form: 7f00:0 through 7f00:ffff = 127.0.x.x
		if (/^7f[0-9a-f]{2}:/i.test(mapped)) return true
		// hex form: a9fe:0 through a9fe:ffff = 169.254.x.x
		if (/^a9fe:/i.test(mapped)) return true
	}
	return false
}

// follow redirects with per-hop SSRF validation
async function fetchWithRedirects(url: string, signal: AbortSignal): Promise<ImageResult<Response>> {
	let currentUrl = url
	for (let hops = 0; hops < MAX_REDIRECTS; hops++) {
		const response = await fetch(currentUrl, { redirect: 'manual', signal, decompress: false })
		if (response.status < 300 || response.status >= 400) {
			return response.ok ? { ok: true, value: response } : { ok: false, error: 'remote image failed' }
		}
		const location = response.headers.get('location')
		if (location == null) return { ok: false, error: 'remote image failed' }
		currentUrl = new URL(location, currentUrl).href
		if (isBlockedHost(new URL(currentUrl).hostname)) return { ok: false, error: 'remote image blocked' }
	}
	return { ok: false, error: 'remote image failed' }
}

// stream response body with size limit
async function readBodyWithLimit(response: Response): Promise<ImageResult<Uint8Array>> {
	if (response.body == null) return { ok: false, error: 'remote image failed' }

	const reader = response.body.getReader()
	const chunks: Uint8Array[] = []
	let totalBytes = 0

	try {
		for (;;) {
			const { done, value } = await reader.read()
			if (done) break
			totalBytes += value.byteLength
			if (totalBytes > MAX_FILE_SIZE) {
				await reader.cancel()
				return { ok: false, error: 'remote image too large' }
			}
			chunks.push(value)
		}
	} finally {
		reader.releaseLock()
	}

	const bytes = new Uint8Array(Buffer.concat(chunks))
	chunks.length = 0 // release chunk references for GC
	return { ok: true, value: bytes }
}

export async function fetchRemoteImage(
	url: string,
	signal?: AbortSignal,
): Promise<ImageResult<RemoteFile>> {
	try {
		if (isBlockedHost(new URL(url).hostname)) return { ok: false, error: 'remote image blocked' }

		const timeoutSignal = AbortSignal.timeout(FETCH_TIMEOUT_MS)
		const combined = signal != null
			? AbortSignal.any([timeoutSignal, signal])
			: timeoutSignal

		const fetchResult = await fetchWithRedirects(url, combined)
		if (!fetchResult.ok) return fetchResult

		const bodyResult = await readBodyWithLimit(fetchResult.value)
		if (!bodyResult.ok) return bodyResult

		if (!isValidMagicBytes(bodyResult.value)) return { ok: false, error: 'remote image failed' }

		return { ok: true, value: { kind: 'remote', bytes: bodyResult.value, url } }
	} catch {
		return { ok: false, error: 'remote image failed' }
	}
}
