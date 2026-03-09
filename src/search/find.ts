// search matching — case-insensitive, non-overlapping string search
// with pre-computed line offset table for O(n + k*log(L)) performance.

export interface SearchMatch {
	charOffset: number // character offset in raw string
	line: number // 0-based line number
	column: number // 0-based column
}

const MAX_MATCHES = 10_000

function binarySearchLineStarts(lineStarts: number[], charOffset: number): number {
	let lo = 0
	let hi = lineStarts.length - 1
	while (lo < hi) {
		const mid = (lo + hi + 1) >>> 1
		if (lineStarts[mid]! <= charOffset) lo = mid
		else hi = mid - 1
	}
	return lo
}

export function findMatches(raw: string, query: string): SearchMatch[] {
	if (query.length === 0) return []

	const matches: SearchMatch[] = []
	const lowerRaw = raw.toLowerCase()
	const lowerQuery = query.toLowerCase()

	// build line starts in single pass: O(n)
	const lineStarts = [0]
	for (let i = 0; i < raw.length; i++) {
		if (raw[i] === '\n') lineStarts.push(i + 1)
	}

	// find all non-overlapping matches
	let pos = 0
	while (pos <= lowerRaw.length - lowerQuery.length) {
		const idx = lowerRaw.indexOf(lowerQuery, pos)
		if (idx === -1) break

		const line = binarySearchLineStarts(lineStarts, idx)
		const column = idx - lineStarts[line]!

		matches.push({ charOffset: idx, line, column })

		if (matches.length >= MAX_MATCHES) break
		pos = idx + lowerQuery.length
	}

	return matches
}
