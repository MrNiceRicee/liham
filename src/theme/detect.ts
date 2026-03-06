// terminal theme detection via OSC 11 background color query.
// returns 'dark' | 'light' | null — caller decides the fallback.

const QUERY_TIMEOUT_MS = 50
const MAX_RESPONSE_BYTES = 256

// OSC 11 response: ESC]11;rgb:RRRR/GGGG/BBBB ESC\ (or ST=BEL)
// eslint-disable-next-line no-control-regex -- intentional: matching terminal escape sequence
const OSC_11_REGEX = /\x1b\]11;rgb:([0-9a-f]{2,4})\/([0-9a-f]{2,4})\/([0-9a-f]{2,4})/i

// terminals that don't handle unknown OSC sequences gracefully
function shouldSkipDetection(): boolean {
	const term = process.env['TERM']
	if (term === 'dumb' || term === 'linux') return true
	if (!process.stdout.isTTY) return true
	return false
}

// normalize 2-char or 4-char hex component to 0-1 range
function hexMax(length: number): number {
	if (length === 4) return 0xffff
	return 0xff
}

function normalizeComponent(hex: string): number {
	return parseInt(hex, 16) / hexMax(hex.length)
}

// relative luminance per WCAG
function luminance(r: number, g: number, b: number): number {
	return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function parseOsc11Response(data: string): 'dark' | 'light' | null {
	const match = OSC_11_REGEX.exec(data)
	if (match == null) return null

	const r = normalizeComponent(match[1]!)
	const g = normalizeComponent(match[2]!)
	const b = normalizeComponent(match[3]!)
	const l = luminance(r, g, b)

	return l < 0.5 ? 'dark' : 'light'
}

export async function detectTheme(): Promise<'dark' | 'light' | null> {
	if (shouldSkipDetection()) return null

	const stdin = process.stdin
	const wasRaw = stdin.isRaw

	try {
		stdin.setRawMode(true)
		stdin.resume()

		// send OSC 11 query
		process.stdout.write('\x1b]11;?\x1b\\')

		const response = await new Promise<string>((resolve) => {
			let buffer = ''
			const timer = setTimeout(() => {
				cleanup()
				resolve(buffer)
			}, QUERY_TIMEOUT_MS)

			const onData = (chunk: Buffer) => {
				buffer += chunk.toString('utf-8')
				if (buffer.length >= MAX_RESPONSE_BYTES || OSC_11_REGEX.test(buffer)) {
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

		return parseOsc11Response(response)
	} catch {
		return null
	} finally {
		stdin.setRawMode(wasRaw ?? false)
		stdin.pause()
	}
}
