// grapheme-aware string operations using Intl.Segmenter.
// handles emoji, combining chars, ZWJ sequences correctly.

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

function segments(text: string): string[] {
	return [...segmenter.segment(text)].map((s) => s.segment)
}

export function graphemeLength(text: string): number {
	return segments(text).length
}

export function graphemeSlice(text: string, start: number, end?: number): string {
	const segs = segments(text)
	return end != null ? segs.slice(start, end).join('') : segs.slice(start).join('')
}

export function graphemeInsert(text: string, pos: number, char: string): string {
	const segs = segments(text)
	segs.splice(pos, 0, char)
	return segs.join('')
}

export function graphemeDelete(text: string, pos: number, count = 1): string {
	const segs = segments(text)
	segs.splice(pos, count)
	return segs.join('')
}

// character classification for word boundaries
function isWordChar(ch: string): boolean {
	return /[\p{L}\p{N}_]/u.test(ch)
}

export function prevWordBoundary(text: string, pos: number): number {
	const segs = segments(text)
	let p = pos - 1
	// skip non-word chars
	while (p >= 0 && !isWordChar(segs[p]!)) p--
	// skip word chars
	while (p >= 0 && isWordChar(segs[p]!)) p--
	return p + 1
}

export function nextWordBoundary(text: string, pos: number): number {
	const segs = segments(text)
	const len = segs.length
	let p = pos
	// skip non-word chars
	while (p < len && !isWordChar(segs[p]!)) p++
	// skip word chars
	while (p < len && isWordChar(segs[p]!)) p++
	return p
}
