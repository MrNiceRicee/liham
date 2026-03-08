// status bar — flex child at bottom of app, shows contextual key legend.

import type { LegendEntry } from '../../app/state.ts'
import type { ThemeTokens } from '../../theme/types.ts'

interface StatusBarProps {
	entries: LegendEntry[]
	layout: string
	theme: ThemeTokens
	renderTimeMs?: number | undefined
	fileDeleted?: boolean | undefined
}

function formatRenderTime(ms: number): string {
	if (ms < 1) return '<1ms'
	if (ms < 1000) return `${String(Math.round(ms))}ms`
	return `${(ms / 1000).toFixed(1)}s`
}

export function StatusBar({
	entries,
	layout,
	theme,
	renderTimeMs,
	fileDeleted,
}: Readonly<StatusBarProps>) {
	const fg = theme.statusBar.fg
	const dimFg = theme.statusBar.dimFg
	const layoutLabel = `[${layout}]`

	const borderColor = fg

	// height: 2 = 1 row border-top + 1 row text (Yoga border-box sizing)
	const barStyle = {
		height: 2,
		width: '100%' as const,
		flexDirection: 'row' as const,
		rootOptions: { borderColor },
	}

	const legend = entries.map((e) => `${e.key} ${e.label}`).join(' · ')
	const timeLabel = renderTimeMs != null ? formatRenderTime(renderTimeMs) : null

	return (
		<box border={['top']} style={barStyle}>
			<text fg={fg}>
				{layoutLabel} · {legend}
			</text>
			<box style={{ flexGrow: 1 }} />
			{fileDeleted === true && <text fg={theme.heading.levels[1].color}> file deleted </text>}
			{timeLabel != null && <text fg={dimFg}>{timeLabel}</text>}
		</box>
	)
}
