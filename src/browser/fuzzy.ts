// fzf-style fuzzy matcher — scores subsequence matches with bonuses for
// consecutive chars, word boundaries, and path separators.

import type { FileEntry } from './scanner.ts'

export interface FuzzyMatch {
	entry: FileEntry
	score: number
	positions: number[] // indices of matched chars in relativePath
}

// bonus weights
const CONSECUTIVE_BONUS = 3
const BOUNDARY_BONUS = 5
const START_BONUS = 7
const GAP_PENALTY = 1

function isBoundary(text: string, idx: number): boolean {
	if (idx === 0) return true
	const prev = text[idx - 1]!
	return prev === '/' || prev === '-' || prev === '_' || prev === '.'
}

// matches query as a subsequence of text, returns score + positions or null
export function fuzzyMatch(
	query: string,
	text: string,
): { score: number; positions: number[] } | null {
	if (query.length === 0) return { score: 0, positions: [] }

	const queryLower = query.toLowerCase()
	const textLower = text.toLowerCase()

	// quick check: is query a subsequence of text?
	let qi = 0
	for (let ti = 0; ti < textLower.length && qi < queryLower.length; ti++) {
		if (textLower[ti] === queryLower[qi]) qi++
	}
	if (qi < queryLower.length) return null

	// greedy forward match collecting positions
	const positions: number[] = []
	qi = 0
	for (let ti = 0; ti < textLower.length && qi < queryLower.length; ti++) {
		if (textLower[ti] === queryLower[qi]) {
			positions.push(ti)
			qi++
		}
	}

	// score based on match quality
	let score = 0

	for (let i = 0; i < positions.length; i++) {
		const pos = positions[i]!

		// start-of-string bonus
		if (pos === 0) score += START_BONUS

		// word boundary bonus
		if (isBoundary(text, pos)) score += BOUNDARY_BONUS

		// consecutive bonus
		if (i > 0 && pos === positions[i - 1]! + 1) {
			score += CONSECUTIVE_BONUS
		}

		// gap penalty (chars skipped since last match)
		if (i > 0) {
			const gap = pos - positions[i - 1]! - 1
			score -= gap * GAP_PENALTY
		}
	}

	return { score, positions }
}

export function fuzzyFilter(query: string, entries: FileEntry[]): FuzzyMatch[] {
	if (query.length === 0) {
		return entries.map((entry) => ({ entry, score: 0, positions: [] }))
	}

	const matches: FuzzyMatch[] = []

	for (const entry of entries) {
		const result = fuzzyMatch(query, entry.relativePath)
		if (result !== null) {
			matches.push({ entry, score: result.score, positions: result.positions })
		}
	}

	// sort: highest score first, then alphabetical by path
	matches.sort((a, b) => {
		if (a.score !== b.score) return b.score - a.score
		return a.entry.relativePath.localeCompare(b.entry.relativePath)
	})

	return matches
}
