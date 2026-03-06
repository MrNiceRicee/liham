// status bar — flex child at bottom of app, shows contextual key legend.

import type { LegendEntry, LegendPage } from '../../app/state.ts'
import type { ThemeTokens } from '../../theme/types.ts'

interface StatusBarProps {
	legendPage: LegendPage
	entries: LegendEntry[]
	layout: string
	theme: ThemeTokens
}

export function StatusBar({ legendPage, entries, layout, theme }: Readonly<StatusBarProps>) {
	const fg = theme.statusBar.fg
	const layoutLabel = `[${layout}]`

	const borderColor = fg

	// height: 2 = 1 row border-top + 1 row text (Yoga border-box sizing)
	const barStyle = { height: 2, width: '100%', flexDirection: 'row' as const, rootOptions: { borderColor } }

	const legend = entries.map((e) => `${e.key} ${e.label}`).join(' · ')

	if (legendPage === 'off') {
		return (
			<box border={['top']} style={barStyle}>
				<text color={fg}>{layoutLabel} · {legend}</text>
			</box>
		)
	}

	return (
		<box border={['top']} style={barStyle}>
			<text color={fg}>
				{layoutLabel} · {legend}
			</text>
		</box>
	)
}
