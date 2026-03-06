// opentui boot — owns the full OpenTUI app lifecycle.
// creates the CLI renderer, mounts the React tree, handles cleanup.

import { createCliRenderer } from '@opentui/core'
import { createRoot } from '@opentui/react'

import type { IRNode } from '../../ir/types.ts'
import type { ThemeTokens } from '../../theme/types.ts'

import { App } from './app.tsx'
import { renderToOpenTUI } from './index.tsx'

export async function boot(ctx: { ir: IRNode; theme: ThemeTokens }): Promise<void> {
	const content = renderToOpenTUI(ctx.ir)
	const renderer = await createCliRenderer({
		exitOnCtrlC: true,
		onDestroy: () => process.exit(0),
	})

	try {
		createRoot(renderer).render(<App content={content} />)
	} catch (err: unknown) {
		renderer.destroy()
		const message = err instanceof Error ? err.message : 'unknown render error'
		console.error(`render error: ${message}`)
	}
}
