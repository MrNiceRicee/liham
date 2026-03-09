// shared highlight splitting — generic function that splits text into
// highlighted/unhighlighted segments at character positions.
// reusable: browser filter highlights + source pane search highlights.

export interface TextSegment {
	text: string
	highlighted: boolean
}

// split text into segments at highlight boundaries — O(n) single pass
export function splitHighlightSegments(
	text: string,
	highlightedPositions: ReadonlySet<number>,
): TextSegment[] {
	if (text.length === 0) return []
	if (highlightedPositions.size === 0) return [{ text, highlighted: false }]

	const segments: TextSegment[] = []
	let current = ''
	let isHighlight = highlightedPositions.has(0)

	for (let i = 0; i < text.length; i++) {
		const charHighlighted = highlightedPositions.has(i)
		if (charHighlighted !== isHighlight && current.length > 0) {
			segments.push({ text: current, highlighted: isHighlight })
			current = ''
		}
		current += text[i]
		isHighlight = charHighlighted
	}

	if (current.length > 0) {
		segments.push({ text: current, highlighted: isHighlight })
	}

	return segments
}
