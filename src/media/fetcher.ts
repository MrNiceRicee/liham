// remote image fetcher — HTTP fetch with timeout, size limit, SSRF basics.

import { isValidMagicBytes } from './loader.ts'
import type { ImageResult, RemoteFile } from './types.ts'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const FETCH_TIMEOUT_MS = 10_000
const MAX_REDIRECTS = 5

function isPrivateIPv4(ip: string): boolean {
	if (ip.startsWith('127.') || ip.startsWith('169.254.')) return true
	if (ip.startsWith('10.')) return true
	if (ip.startsWith('192.168.')) return true
	// 172.16.0.0 - 172.31.255.255
	if (ip.startsWith('172.')) {
		const second = Number.parseInt(ip.split('.')[1]!, 10)
		if (second >= 16 && second <= 31) return true
	}
	// CGNAT: 100.64.0.0 - 100.127.255.255
	if (ip.startsWith('100.')) {
		const second = Number.parseInt(ip.split('.')[1]!, 10)
		if (second >= 64 && second <= 127) return true
	}
	return false
}

function isBlockedIPv6Mapped(mapped: string): boolean {
	if (isPrivateIPv4(mapped)) return true
	// hex form: 7f00:0 through 7f00:ffff = 127.0.x.x
	if (/^7f[0-9a-f]{2}:/i.test(mapped)) return true
	// hex form: a9fe:0 through a9fe:ffff = 169.254.x.x
	if (/^a9fe:/i.test(mapped)) return true
	// hex form: 0a = 10.x.x.x
	if (/^0a[0-9a-f]{2}:/i.test(mapped)) return true
	// hex form: c0a8 = 192.168.x.x
	if (/^c0a8:/i.test(mapped)) return true
	// hex form: ac1x = 172.16-31.x.x
	if (/^ac1[0-9a-f]:/i.test(mapped)) return true
	// hex form: 6440-647f = 100.64-127.x.x
	if (/^64[4-7][0-9a-f]:/i.test(mapped)) return true
	return false
}

function isBlockedHost(hostname: string): boolean {
	const bare = hostname.replace(/^\[|\]$/g, '') // strip IPv6 brackets
	if (bare === 'localhost' || bare === '::1' || bare === '0.0.0.0' || bare === '[::]') return true
	if (isPrivateIPv4(bare)) return true
	// IPv6 ULA: fc00::/7 (fc00:: - fdff::)
	if (/^f[cd][0-9a-f]{2}:/i.test(bare)) return true
	// IPv6-mapped IPv4 bypass prevention
	// URL parser may normalize ::ffff:127.0.0.1 to ::ffff:7f00:1 (hex form)
	if (/^::ffff:/i.test(bare)) {
		const mapped = bare.replace(/^::ffff:/i, '')
		return isBlockedIPv6Mapped(mapped)
	}
	return false
}

// follow redirects with per-hop SSRF validation
async function fetchWithRedirects(
	url: string,
	signal: AbortSignal,
): Promise<ImageResult<Response>> {
	let currentUrl = url
	for (let hops = 0; hops < MAX_REDIRECTS; hops++) {
		const response = await fetch(currentUrl, { redirect: 'manual', signal, decompress: false })
		if (response.status < 300 || response.status >= 400) {
			return response.ok
				? { ok: true, value: response }
				: { ok: false, error: 'remote image failed' }
		}
		const location = response.headers.get('location')
		if (location == null) return { ok: false, error: 'remote image failed' }
		currentUrl = new URL(location, currentUrl).href
		if (isBlockedHost(new URL(currentUrl).hostname))
			return { ok: false, error: 'remote image blocked' }
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
		const combined = signal != null ? AbortSignal.any([timeoutSignal, signal]) : timeoutSignal

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
