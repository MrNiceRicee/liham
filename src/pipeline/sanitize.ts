// strips terminal-unsafe control characters from text before rendering.
// this is the SOLE path for all text output to terminal — prevents escape injection.

// match C0 (0x00-0x08, 0x0b-0x0c, 0x0e-0x1f, 0x7f) + C1 (0x80-0x9f)
// preserves \t=0x09, \n=0x0a, \r=0x0d
// C1 includes CSI (0x9b), ST (0x9c), OSC (0x9d) — all exploitable for terminal injection
// eslint-disable-next-line no-control-regex -- intentional: stripping terminal-unsafe control chars
const CONTROL_CHARS = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g

export function sanitizeForTerminal(text: string): string {
	return text.replace(CONTROL_CHARS, '')
}
