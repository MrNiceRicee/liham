// terminal image capability detection.
// combined with theme detection — single stdin raw-mode session for both.

import type { ImageCapabilities, ImageProtocol } from './types.ts'

const QUERY_TIMEOUT_MS = 80
const MAX_RESPONSE_BYTES = 512

// default cell dimensions when not detectable
const DEFAULT_CELL_WIDTH = 8
const DEFAULT_CELL_HEIGHT = 16

type ThemeMode = 'dark' | 'light' | null

export interface DetectionResult {
	theme: ThemeMode
	image: ImageCapabilities
}

// -- env var override --

function envOverrideProtocol(): ImageProtocol | null {
	const override = process.env['LIHAM_IMAGE_PROTOCOL']
	if (override === 'kitty-virtual') return 'kitty-virtual'
	if (override === 'halfblock') return 'halfblock'
	if (override === 'text') return 'text'
	return null
}

// -- tier 1: environment variable sniffing (sync) --

function envDetectProtocol(): ImageProtocol | null {
	// multiplexers that break escape sequence passthrough
	if (process.env['ZELLIJ_SESSION_NAME'] != null) return 'text'
	const term = process.env['TERM']
	if (term != null && term.startsWith('screen') && process.env['TMUX'] == null) return 'text'

	// kitty/ghostty → virtual placements
	if (term === 'xterm-kitty' || process.env['KITTY_WINDOW_ID'] != null) return 'kitty-virtual'
	if (process.env['GHOSTTY_RESOURCES_DIR'] != null) return 'kitty-virtual'

	// wezterm → halfblock only (no virtual placement support)
	if (process.env['TERM_PROGRAM'] === 'WezTerm') return 'halfblock'

	return null
}

// -- response parsing (exported for testing) --

// OSC 11 response: ESC]11;rgb:RRRR/GGGG/BBBB ESC\
// eslint-disable-next-line no-control-regex -- intentional: matching terminal escape sequences
const OSC11_RE = /\x1b\]11;rgb:([0-9a-f]{2,4})\/([0-9a-f]{2,4})\/([0-9a-f]{2,4})/i

// Kitty graphics response: ESC_Gi=31;OK ESC\ or ESC_Gi=31;ENOENT ESC\
// eslint-disable-next-line no-control-regex, sonarjs/no-control-regex -- intentional: matching terminal escape sequences
const KITTY_RESPONSE_RE = /\x1b_Gi=31;(\w+)/

// CSI 16t cell size response: ESC[6;height;widtht
// eslint-disable-next-line no-control-regex -- intentional: matching terminal escape sequences
const CELL_SIZE_RE = /\x1b\[6;(\d+);(\d+)t/

// DA1 sentinel: ESC[?...c
// eslint-disable-next-line no-control-regex -- intentional: matching terminal escape sequences
const DA1_RE = /\x1b\[\?[\d;]*c/

function hexMax(length: number): number {
	return length === 4 ? 0xffff : 0xff
}

function normalizeComponent(hex: string): number {
	return parseInt(hex, 16) / hexMax(hex.length)
}

function luminance(r: number, g: number, b: number): number {
	return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function parseDetectionResponse(data: string): {
	theme: 'dark' | 'light' | null
	kittySupported: boolean
	cellWidth: number
	cellHeight: number
} {
	// theme from OSC 11
	let theme: 'dark' | 'light' | null = null
	const osc11 = OSC11_RE.exec(data)
	if (osc11 != null) {
		const r = normalizeComponent(osc11[1]!)
		const g = normalizeComponent(osc11[2]!)
		const b = normalizeComponent(osc11[3]!)
		theme = luminance(r, g, b) < 0.5 ? 'dark' : 'light'
	}

	// kitty graphics support
	const kittyMatch = KITTY_RESPONSE_RE.exec(data)
	const kittySupported = kittyMatch?.[1] === 'OK'

	// cell pixel dimensions
	let cellWidth = DEFAULT_CELL_WIDTH
	let cellHeight = DEFAULT_CELL_HEIGHT
	const cellMatch = CELL_SIZE_RE.exec(data)
	if (cellMatch != null) {
		const h = Number(cellMatch[1])
		const w = Number(cellMatch[2])
		if (h > 0) cellHeight = h
		if (w > 0) cellWidth = w
	}

	return { theme, kittySupported, cellWidth, cellHeight }
}

function shouldSkipQuery(): boolean {
	const term = process.env['TERM']
	if (term === 'dumb' || term === 'linux') return true
	if (!process.stdout.isTTY) return true
	return false
}

// -- tier 2: combined escape sequence query --

async function queryTerminal(): Promise<DetectionResult> {
	if (shouldSkipQuery()) {
		return { theme: null, image: { protocol: 'text', cellPixelWidth: DEFAULT_CELL_WIDTH, cellPixelHeight: DEFAULT_CELL_HEIGHT } }
	}

	const stdin = process.stdin
	const wasRaw = stdin.isRaw

	try {
		stdin.setRawMode(true)
		stdin.resume()

		// combined query: OSC 11 + Kitty graphics + CSI 16t + DA1 sentinel
		const query =
			'\x1b]11;?\x1b\\' +
			'\x1b_Gi=31,s=1,v=1,a=q,t=d,f=24;AAAA\x1b\\' +
			'\x1b[16t' +
			'\x1b[c'

		process.stdout.write(query)

		const response = await new Promise<string>((resolve) => {
			let buffer = ''
			const timer = setTimeout(() => {
				cleanup()
				resolve(buffer)
			}, QUERY_TIMEOUT_MS)

			const onData = (chunk: Buffer) => {
				buffer += chunk.toString('utf-8')
				if (buffer.length >= MAX_RESPONSE_BYTES || DA1_RE.test(buffer)) {
					cleanup()
					resolve(buffer)
				}
			}

			const cleanup = () => {
				clearTimeout(timer)
				stdin.removeListener('data', onData)
			}

			stdin.on('data', onData)
		})

		const parsed = parseDetectionResponse(response)

		// determine protocol from env tier 1 or query result
		const envProtocol = envDetectProtocol()
		let protocol: ImageProtocol
		if (envProtocol != null) {
			protocol = envProtocol
		} else if (parsed.kittySupported) {
			// query confirmed kitty graphics — but env tells us nothing about
			// virtual placement support, so default to halfblock (conservative).
			// only env detection with KITTY_WINDOW_ID/GHOSTTY gives kitty-virtual.
			protocol = 'halfblock'
		} else {
			protocol = 'text'
		}

		return {
			theme: parsed.theme,
			image: {
				protocol,
				cellPixelWidth: parsed.cellWidth,
				cellPixelHeight: parsed.cellHeight,
			},
		}
	} catch {
		return {
			theme: null,
			image: { protocol: 'text', cellPixelWidth: DEFAULT_CELL_WIDTH, cellPixelHeight: DEFAULT_CELL_HEIGHT },
		}
	} finally {
		stdin.setRawMode(wasRaw ?? false)
		stdin.pause()
	}
}

// -- public API --

export async function detectCapabilities(): Promise<DetectionResult> {
	// check env override first
	const override = envOverrideProtocol()

	if (override != null && shouldSkipQuery()) {
		return {
			theme: null,
			image: { protocol: override, cellPixelWidth: DEFAULT_CELL_WIDTH, cellPixelHeight: DEFAULT_CELL_HEIGHT },
		}
	}

	const result = await queryTerminal()

	// apply override after query (so we still get theme + cell dimensions)
	if (override != null) {
		result.image.protocol = override
	}

	return result
}
