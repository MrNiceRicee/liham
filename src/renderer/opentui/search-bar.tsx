// search bar — bottom bar replacing status bar during search.
// shows query text with cursor in input phase, match count in both phases.

import type { SearchState } from '../../app/state-search.ts'
import type { ThemeTokens } from '../../theme/types.ts'

interface SearchBarProps {
	readonly searchState: SearchState
	readonly matchCount: number
	readonly theme: ThemeTokens
}

export function SearchBar({ searchState, matchCount, theme }: Readonly<SearchBarProps>) {
	const fg = theme.statusBar.fg
	const promptColor = theme.pane.focusedBorderColor
	const queryColor = theme.paragraph.textColor
	const countColor = theme.pane.focusedBorderColor
	const noMatchColor = theme.search.noMatchColor

	const isInput = searchState.phase === 'input'
	const query = searchState.query
	const cursor = isInput ? '_' : ''

	// match count display
	const hasNoMatches = matchCount === 0 && query.length > 0

	let countLabel: string
	if (isInput) {
		countLabel = query.length > 0 ? `${String(matchCount)} matches` : ''
	} else {
		const current = searchState.phase === 'active' ? searchState.currentMatch + 1 : 0
		countLabel = `${String(current)}/${String(matchCount)}`
	}

	const queryFg = hasNoMatches ? noMatchColor : queryColor
	const countFg = hasNoMatches ? noMatchColor : countColor

	const barStyle = {
		height: 2,
		width: '100%' as const,
		flexDirection: 'row' as const,
		rootOptions: { borderColor: fg },
	}

	return (
		<box border={['top']} style={barStyle}>
			<text>
				<span fg={promptColor}>{'/ '}</span>
				<span fg={queryFg}>
					{query}
					{cursor}
				</span>
			</text>
			<box style={{ flexGrow: 1 }} />
			{hasNoMatches && (
				<text fg={noMatchColor}>{'no matches '}</text>
			)}
			{countLabel.length > 0 && !hasNoMatches && (
				<text fg={countFg}>{countLabel}</text>
			)}
		</box>
	)
}
