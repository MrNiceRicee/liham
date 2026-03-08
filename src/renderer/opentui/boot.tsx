// opentui boot — owns the full OpenTUI app lifecycle.
// creates the CLI renderer, mounts the React tree, handles cleanup.

import { createCliRenderer } from '@opentui/core'
import { createRoot } from '@opentui/react'
import { type LayoutMode, paneDimensions } from '../../app/state.ts'
import type { IRNode } from '../../ir/types.ts'
import type { MediaCapabilities } from '../../media/types.ts'
import type { ThemeTokens } from '../../theme/types.ts'
import { App } from './app.tsx'
import { renderToOpenTUIWithMedia } from './index.tsx'

export type BootContext =
	| {
			mode: 'viewer'
			ir: IRNode
			theme: ThemeTokens
			mediaCapabilities: MediaCapabilities
			layout: LayoutMode
			raw: string
			renderTimeMs: number
			filePath: string
			noWatch: boolean
	  }
	| {
			mode: 'browser'
			dir: string
			theme: ThemeTokens
			mediaCapabilities: MediaCapabilities
			layout: LayoutMode
			noWatch: boolean
	  }

export async function boot(ctx: BootContext): Promise<void> {
	const renderer = await createCliRenderer({
		exitOnCtrlC: true,
		useMouse: true,
		onDestroy: () => process.exit(0),
	})

	try {
		if (ctx.mode === 'browser') {
			createRoot(renderer).render(
				<App
					mode="browser"
					dir={ctx.dir}
					layout={ctx.layout}
					theme={ctx.theme}
					mediaCapabilities={ctx.mediaCapabilities}
					noWatch={ctx.noWatch}
				/>,
			)
		} else {
			// compute preview pane width for table layout at render time
			const termWidth = process.stdout.columns ?? 80
			const termHeight = process.stdout.rows ?? 24
			const panes = paneDimensions(ctx.layout, termWidth, termHeight)
			const paneChrome = 4
			const previewWidth = (panes.preview?.width ?? termWidth) - paneChrome
			const { jsx: content, mediaNodes } = renderToOpenTUIWithMedia(ctx.ir, previewWidth)

			createRoot(renderer).render(
				<App
					mode="viewer"
					content={content}
					raw={ctx.raw}
					mediaNodes={mediaNodes}
					layout={ctx.layout}
					theme={ctx.theme}
					mediaCapabilities={ctx.mediaCapabilities}
					renderTimeMs={ctx.renderTimeMs}
					filePath={ctx.filePath}
					noWatch={ctx.noWatch}
				/>,
			)
		}
	} catch (err: unknown) {
		renderer.destroy()
		const message = err instanceof Error ? err.message : 'unknown render error'
		console.error(`render error: ${message}`)
	}
}
