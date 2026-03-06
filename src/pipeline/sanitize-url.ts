// sanitizes URLs for safe terminal rendering (OSC 8 hyperlinks, future image protocols).
// applied at IR compilation time so all renderers benefit.

const ALLOWED_SCHEMES = new Set(['http:', 'https:', 'mailto:'])
const MAX_URL_LENGTH = 2048

// C0 + C1 control characters (same range as sanitize.ts)
// eslint-disable-next-line no-control-regex -- intentional: stripping terminal-unsafe control chars
const CONTROL_CHARS = /[\x00-\x1f\x7f-\x9f]/g

// percent-encoded control chars: %00-%1f, %7f-%9f (case-insensitive)
const PERCENT_ENCODED_CONTROLS = /%(?:0[0-9a-f]|1[0-9a-f]|7f|[89][0-9a-f])/gi

export function sanitizeUrl(url: string): string {
	if (url.length === 0) return ''
	if (url.length > MAX_URL_LENGTH) return ''

	// strip raw control chars
	let cleaned = url.replace(CONTROL_CHARS, '')

	// strip percent-encoded control chars (prevents %1b%5d bypass)
	cleaned = cleaned.replace(PERCENT_ENCODED_CONTROLS, '')

	// validate with URL constructor
	let parsed: URL
	try {
		parsed = new URL(cleaned)
	} catch {
		// try as relative — reject (we only allow absolute URLs)
		return ''
	}

	// scheme allowlist
	if (!ALLOWED_SCHEMES.has(parsed.protocol)) return ''

	return cleaned
}
