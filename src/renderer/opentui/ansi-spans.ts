// parse truecolor ANSI escapes into colored segments for OpenTUI rendering.
// handles \x1b[38;2;R;G;Bm (set fg) and \x1b[0m (reset).

export interface AnsiSegment {
	text: string
	fg?: string | undefined // hex color
}

// rgb values to #rrggbb
function rgbToHex(r: number, g: number, b: number): string {
	return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`
}

// matches ESC[ followed by params and a final letter
// eslint-disable-next-line no-control-regex -- intentional: parsing ANSI escape sequences
const ANSI_RE = /\x1b\[([0-9;]*)m/g

export function parseAnsiSegments(input: string): AnsiSegment[] {
	const segments: AnsiSegment[] = []
	let currentFg: string | undefined
	let lastIndex = 0

	for (const match of input.matchAll(ANSI_RE)) {
		// flush text before this escape
		if (match.index > lastIndex) {
			segments.push({ text: input.slice(lastIndex, match.index), fg: currentFg })
		}
		lastIndex = match.index + match[0].length

		const params = match[1]!
		if (params === '0' || params === '') {
			currentFg = undefined
		} else {
			// parse 38;2;R;G;B
			const parts = params.split(';')
			if (parts[0] === '38' && parts[1] === '2' && parts.length >= 5) {
				currentFg = rgbToHex(
					Number.parseInt(parts[2]!, 10),
					Number.parseInt(parts[3]!, 10),
					Number.parseInt(parts[4]!, 10),
				)
			}
		}
	}

	// flush remaining text
	if (lastIndex < input.length) {
		segments.push({ text: input.slice(lastIndex), fg: currentFg })
	}

	return segments
}
