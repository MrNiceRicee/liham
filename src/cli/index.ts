// cli entry point — parses args, validates input, dispatches to renderer boot.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'

import type { ThemeTokens } from '../theme/types.ts'

import { processMarkdown } from '../pipeline/processor.ts'
import { boot } from '../renderer/opentui/boot.tsx'
import { darkTheme } from '../theme/dark.ts'

// -- renderer name union — add entries as renderers are implemented --

type RendererName = 'opentui'
const VALID_RENDERERS: readonly RendererName[] = ['opentui'] as const

function isRendererName(value: string): value is RendererName {
	return (VALID_RENDERERS as readonly string[]).includes(value)
}

// -- theme name union --

type ThemeName = 'auto' | 'dark' | 'light'
const VALID_THEMES: readonly ThemeName[] = ['auto', 'dark', 'light'] as const

function isThemeName(value: string): value is ThemeName {
	return (VALID_THEMES as readonly string[]).includes(value)
}

// -- arg parsing --

const USAGE = `usage: liham [options] <file.md>

options:
  --renderer <name>   TUI renderer (default: opentui)
  --theme <name>      Theme: auto, dark, light (default: auto)
  -h, --help          Show this help message`

const options = {
	help: { type: 'boolean' as const, short: 'h' },
	renderer: { type: 'string' as const, default: 'opentui' },
	theme: { type: 'string' as const, default: 'auto' },
} as const

function parseCliArgs() {
	const { values, positionals } = parseArgs({
		args: process.argv.slice(2),
		options,
		allowPositionals: true,
		strict: true,
	})

	if (values.help) {
		console.log(USAGE)
		process.exit(0)
	}

	const filePath = positionals[0]
	if (filePath == null) {
		console.error(USAGE)
		process.exit(1)
	}

	const renderer = values.renderer
	if (!isRendererName(renderer)) {
		console.error(`unknown renderer: ${renderer}`)
		console.error(`available: ${VALID_RENDERERS.join(', ')}`)
		process.exit(1)
	}

	const theme = values.theme
	if (!isThemeName(theme)) {
		console.error(`unknown theme: ${theme}`)
		console.error(`available: ${VALID_THEMES.join(', ')}`)
		process.exit(1)
	}

	return { filePath, renderer, theme }
}

// -- theme resolution --

function resolveTheme(themeName: ThemeName): ThemeTokens {
	// TODO: 'auto' will use OSC 11 detection in Phase D
	// TODO: 'light' will use lightTheme in Phase D
	if (themeName === 'light') {
		console.error('light theme not yet implemented, using dark')
	}
	return darkTheme
}

// -- main --

async function main() {
	const args = parseCliArgs()
	const resolved = resolve(args.filePath)

	let markdown: string
	try {
		markdown = readFileSync(resolved, 'utf-8')
	} catch {
		console.error(`cannot read file: ${resolved}`)
		process.exit(1)
	}

	const theme = resolveTheme(args.theme)

	const start = performance.now()
	const result = await processMarkdown(markdown, theme)
	const elapsed = performance.now() - start

	if (!result.ok) {
		console.error(`pipeline error: ${result.error}`)
		process.exit(1)
	}

	console.error(`pipeline: ${elapsed.toFixed(1)}ms`)

	// dispatch to renderer boot — static import for now.
	// when ink/rezi are added, switch on args.renderer here.
	await boot({ ir: result.value, theme })
}

await main()
