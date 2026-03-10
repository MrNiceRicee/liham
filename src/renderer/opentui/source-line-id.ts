// shared helper — generates id props for block elements addressable by sourceLine.

export function sourceLineId(sourceLine?: number): Record<string, string> {
	if (sourceLine == null) return {}
	return { id: `src-line-${String(sourceLine)}` }
}
