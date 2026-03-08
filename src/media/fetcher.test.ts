// tests for remote image fetcher — SSRF blocking, size limits, timeouts, magic bytes.
/* eslint-disable sonarjs/no-clear-text-protocols -- intentional: SSRF tests require http:// URLs */

import { afterEach, describe, expect, test } from 'bun:test'

import { fetchRemoteImage } from './fetcher.ts'

// minimal valid PNG: 8-byte magic + IHDR chunk start
const PNG_MAGIC = new Uint8Array([
	0x89,
	0x50,
	0x4e,
	0x47,
	0x0d,
	0x0a,
	0x1a,
	0x0a, // PNG signature
	0x00,
	0x00,
	0x00,
	0x0d, // IHDR length
	0x49,
])

// 13 bytes, invalid magic
const BAD_MAGIC = new Uint8Array([
	0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c,
])

const originalFetch = globalThis.fetch

afterEach(() => {
	globalThis.fetch = originalFetch
})

function stubFetch(body: Uint8Array | null, status = 200, headers?: Record<string, string>): void {
	const opts: ResponseInit = { status }
	if (headers != null) opts.headers = headers
	globalThis.fetch = (() => Promise.resolve(new Response(body as unknown as BodyInit | null, opts))) as unknown as typeof fetch
}

function stubFetchRedirect(location: string, then: Uint8Array): void {
	let call = 0
	globalThis.fetch = (() => {
		call++
		if (call === 1) {
			return Promise.resolve(new Response(null, { status: 302, headers: { location } }))
		}
		return Promise.resolve(new Response(then as unknown as BodyInit, { status: 200 }))
	}) as unknown as typeof fetch
}

describe('fetchRemoteImage', () => {
	test('fetches valid PNG', async () => {
		stubFetch(PNG_MAGIC)
		const result = await fetchRemoteImage('https://example.com/img.png')
		expect(result.ok).toBe(true)
		if (result.ok) {
			expect(result.value.kind).toBe('remote')
			expect(result.value.url).toBe('https://example.com/img.png')
		}
	})

	test('rejects bad magic bytes', async () => {
		stubFetch(BAD_MAGIC)
		const result = await fetchRemoteImage('https://example.com/img.bin')
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.error).toBe('remote image failed')
	})

	test('blocks localhost', async () => {
		const result = await fetchRemoteImage('http://localhost:8080/secret')
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.error).toBe('remote image blocked')
	})

	test('blocks 127.x.x.x', async () => {
		const result = await fetchRemoteImage('http://127.0.0.1/secret')
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.error).toBe('remote image blocked')
	})

	test('blocks 169.254.x.x (link-local)', async () => {
		const result = await fetchRemoteImage('http://169.254.169.254/metadata')
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.error).toBe('remote image blocked')
	})

	test('blocks ::1 (IPv6 loopback)', async () => {
		const result = await fetchRemoteImage('http://[::1]:8080/secret')
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.error).toBe('remote image blocked')
	})

	test('blocks IPv6-mapped IPv4 loopback', async () => {
		const result = await fetchRemoteImage('http://[::ffff:127.0.0.1]/secret')
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.error).toBe('remote image blocked')
	})

	test('blocks 0.0.0.0', async () => {
		const result = await fetchRemoteImage('http://0.0.0.0/secret')
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.error).toBe('remote image blocked')
	})

	test('follows redirects', async () => {
		stubFetchRedirect('https://cdn.example.com/img.png', PNG_MAGIC)
		const result = await fetchRemoteImage('https://example.com/redirect')
		expect(result.ok).toBe(true)
	})

	test('blocks redirect to localhost', async () => {
		stubFetchRedirect('http://127.0.0.1/secret', PNG_MAGIC)
		const result = await fetchRemoteImage('https://example.com/redirect')
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.error).toBe('remote image blocked')
	})

	test('rejects responses larger than 10MB', async () => {
		const bigBody = new Uint8Array(11 * 1024 * 1024)
		stubFetch(bigBody)
		const result = await fetchRemoteImage('https://example.com/huge.png')
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.error).toBe('remote image too large')
	})

	test('handles network error', async () => {
		globalThis.fetch = (() => Promise.reject(new Error('network error'))) as unknown as typeof fetch
		const result = await fetchRemoteImage('https://example.com/img.png')
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.error).toBe('remote image failed')
	})

	test('handles HTTP error status', async () => {
		stubFetch(PNG_MAGIC, 404)
		const result = await fetchRemoteImage('https://example.com/missing.png')
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.error).toBe('remote image failed')
	})

	test('aborts on signal', async () => {
		const controller = new AbortController()
		controller.abort()
		const result = await fetchRemoteImage('https://example.com/img.png', controller.signal)
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.error).toBe('remote image failed')
	})

	test('blocks 10.x.x.x (RFC 1918)', async () => {
		const result = await fetchRemoteImage('http://10.0.0.1/secret')
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.error).toBe('remote image blocked')
	})

	test('blocks 192.168.x.x (RFC 1918)', async () => {
		const result = await fetchRemoteImage('http://192.168.1.1/secret')
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.error).toBe('remote image blocked')
	})

	test('blocks 172.16-31.x.x (RFC 1918)', async () => {
		const result = await fetchRemoteImage('http://172.16.0.1/secret')
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.error).toBe('remote image blocked')

		const result2 = await fetchRemoteImage('http://172.31.255.1/secret')
		expect(result2.ok).toBe(false)
	})

	test('allows 172.32.x.x (outside RFC 1918 range)', async () => {
		stubFetch(PNG_MAGIC)
		const result = await fetchRemoteImage('http://172.32.0.1/img.png')
		expect(result.ok).toBe(true)
	})

	test('blocks 100.64-127.x.x (CGNAT)', async () => {
		const result = await fetchRemoteImage('http://100.64.0.1/secret')
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.error).toBe('remote image blocked')

		const result2 = await fetchRemoteImage('http://100.127.255.1/secret')
		expect(result2.ok).toBe(false)
	})

	test('blocks IPv6 ULA (fc00::/7)', async () => {
		const result = await fetchRemoteImage('http://[fd12:3456::1]/secret')
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.error).toBe('remote image blocked')
	})

	test('blocks redirect to private IP', async () => {
		stubFetchRedirect('http://10.0.0.1/secret', PNG_MAGIC)
		const result = await fetchRemoteImage('https://example.com/redirect')
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.error).toBe('remote image blocked')
	})
})
