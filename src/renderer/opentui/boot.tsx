// opentui boot — owns the full OpenTUI app lifecycle.
// creates the CLI renderer, mounts the React tree, handles cleanup.

import { createCliRenderer } from '@opentui/core'
import { createRoot } from '@opentui/react'

import type { IRNode } from '../../ir/types.ts'
import type { ThemeTokens } from '../../theme/types.ts'

import { type LayoutMode, paneDimensions } from '../../app/state.ts'
import { App } from './app.tsx'
import { renderToOpenTUI } from './index.tsx'

export interface BootContext {
	ir: IRNode
	theme: ThemeTokens
	layout: LayoutMode
	raw: string
}

export async function boot(ctx: BootContext): Promise<void> {
	// compute preview pane width for table layout at render time
	const termWidth = process.stdout.columns ?? 80
	const termHeight = process.stdout.rows ?? 24
	const panes = paneDimensions(ctx.layout, termWidth, termHeight)
	// subtract pane chrome: border (2) + inner padding (2) = 4 chars
	const paneChrome = 4
	const previewWidth = (panes.preview?.width ?? termWidth) - paneChrome
	const content = renderToOpenTUI(ctx.ir, previewWidth)
	const renderer = await createCliRenderer({
		exitOnCtrlC: true,
		useMouse: true,
		onDestroy: () => process.exit(0),
	})

	try {
		createRoot(renderer).render(
			<App content={content} raw={ctx.raw} layout={ctx.layout} theme={ctx.theme} />,
		)
	} catch (err: unknown) {
		renderer.destroy()
		const message = err instanceof Error ? err.message : 'unknown render error'
		console.error(`render error: ${message}`)
	}
}
