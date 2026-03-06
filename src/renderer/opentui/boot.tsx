// opentui boot — owns the full OpenTUI app lifecycle.
// creates the CLI renderer, mounts the React tree, handles cleanup.

import { createCliRenderer } from '@opentui/core'
import { createRoot } from '@opentui/react'

import type { LayoutMode } from '../../app/state.ts'
import type { IRNode } from '../../ir/types.ts'
import type { ThemeTokens } from '../../theme/types.ts'

import { App } from './app.tsx'
import { renderToOpenTUI } from './index.tsx'

interface BootContext {
	ir: IRNode
	theme: ThemeTokens
	layout: LayoutMode
}

export async function boot(ctx: BootContext): Promise<void> {
	const content = renderToOpenTUI(ctx.ir)
	const renderer = await createCliRenderer({
		exitOnCtrlC: true,
		useMouse: false,
		onDestroy: () => process.exit(0),
	})

	try {
		createRoot(renderer).render(
			<App content={content} layout={ctx.layout} theme={ctx.theme} />,
		)
	} catch (err: unknown) {
		renderer.destroy()
		const message = err instanceof Error ? err.message : 'unknown render error'
		console.error(`render error: ${message}`)
	}
}
