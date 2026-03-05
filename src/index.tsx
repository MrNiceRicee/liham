import { createCliRenderer } from '@opentui/core'
import { createRoot } from '@opentui/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { App } from './app/App.tsx'
import { processMarkdown } from './pipeline/processor.ts'
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

	const renderer = await createCliRenderer({ exitOnCtrlC: false })

	const cleanup = () => {
		renderer.destroy()
		process.exit(0)
	}
	process.on('SIGINT', cleanup)
	process.on('SIGTERM', cleanup)

	createRoot(renderer).render(<App content={result.value} />)
}

await main()
