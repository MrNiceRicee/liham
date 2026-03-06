import { createCliRenderer } from '@opentui/core'
import { createRoot } from '@opentui/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { App } from './app/App.tsx'
import { processMarkdown } from './pipeline/processor.ts'
import { renderToOpenTUI } from './renderer/opentui/index.tsx'
import { darkTheme } from './theme/dark.ts'

async function main() {
	const filePath = process.argv[2]
	if (filePath == null) {
		console.error('usage: liham <file.md>')
		process.exit(1)
	}

	const resolved = resolve(filePath)
	const markdown = readFileSync(resolved, 'utf-8')

	const start = performance.now()
	const result = await processMarkdown(markdown, darkTheme)
	const elapsed = performance.now() - start

	if (!result.ok) {
		console.error(`pipeline error: ${result.error}`)
		process.exit(1)
	}

	console.error(`pipeline: ${elapsed.toFixed(1)}ms`)

	const content = renderToOpenTUI(result.value)

	const renderer = await createCliRenderer({ exitOnCtrlC: false })

	const cleanup = (code = 0) => {
		renderer.destroy()
		process.exit(code)
	}

	// ensure terminal is restored on any crash
	process.on('uncaughtException', (err) => {
		renderer.destroy()
		console.error(`fatal: ${err.message}`)
		process.exit(1)
	})

	process.on('SIGINT', () => cleanup())
	process.on('SIGTERM', () => cleanup())

	try {
		createRoot(renderer).render(<App content={content} />)
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : 'unknown render error'
		renderer.destroy()
		console.error(`render error: ${message}`)
		process.exit(1)
	}
}

await main()
