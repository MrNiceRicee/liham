// sanitizes image src attributes for safe rendering.
// uses scheme allowlist: relative paths allowed, http/https allowed, all else rejected.

// C0 + C1 control characters (shared pattern with sanitize-url.ts)
// eslint-disable-next-line no-control-regex -- intentional: stripping terminal-unsafe control chars
const CONTROL_CHARS = /[\x00-\x1f\x7f-\x9f]/g

// percent-encoded control chars: %00-%1f, %7f-%9f (case-insensitive)
const PERCENT_ENCODED_CONTROLS = /%(?:0[0-9a-f]|1[0-9a-f]|7f|[89][0-9a-f])/gi

const MAX_SRC_LENGTH = 2048

// scheme detection: anything starting with letter followed by letters/digits/+/-./:
const SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+\-.]*:/

export function sanitizeImageSrc(src: string): string {
	if (src.length === 0) return ''
	if (src.length > MAX_SRC_LENGTH) return ''

	// strip raw control chars
	let cleaned = src.replace(CONTROL_CHARS, '')

	// strip percent-encoded control chars
	cleaned = cleaned.replace(PERCENT_ENCODED_CONTROLS, '')

	if (cleaned.length === 0) return ''

	// detect scheme
	const schemeMatch = SCHEME_RE.exec(cleaned)
	if (schemeMatch != null) {
		const scheme = schemeMatch[0].toLowerCase()
		if (scheme !== 'http:' && scheme !== 'https:') return ''
	}

	// no scheme = relative path — allow through for renderer to resolve
	return cleaned
}
