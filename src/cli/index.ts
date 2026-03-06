// cli entry point — parses args, validates input, dispatches to renderer boot.

import { resolve } from 'node:path'
import { parseArgs } from 'node:util'

import type { LayoutMode } from '../app/state.ts'
import type { ThemeTokens } from '../theme/types.ts'

import { processMarkdown } from '../pipeline/processor.ts'
import { boot } from '../renderer/opentui/boot.tsx'
import { darkTheme } from '../theme/dark.ts'
import { detectTheme } from '../theme/detect.ts'
import { lightTheme } from '../theme/light.ts'

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

// -- layout name union --

const VALID_LAYOUTS: readonly LayoutMode[] = [
	'preview-only',
	'side',
	'top',
	'source-only',
] as const

function isLayoutName(value: string): value is LayoutMode {
	return (VALID_LAYOUTS as readonly string[]).includes(value)
}

// -- help text --

const USAGE = `liham — terminal markdown previewer

usage:
  liham <file.md>
  liham [options] <file.md>

options:
  -r, --renderer <name>   TUI renderer to use (default: opentui)
                           available: ${VALID_RENDERERS.join(', ')}

  -t, --theme <name>      Color theme (default: auto)
                           available: ${VALID_THEMES.join(', ')}
                             auto   detect from terminal background
                             dark   dark theme (Tokyo Night)
                             light  light theme (Tokyo Night Light)

  -l, --layout <mode>     Pane layout (default: preview-only)
                           available: ${VALID_LAYOUTS.join(', ')}

  -i, --info               Show detected theme and terminal info, then exit

  -h, --help               Show this help message

examples:
  liham README.md
  liham -t dark README.md
  liham -r opentui README.md`

// -- arg parsing --

const options = {
	help: { type: 'boolean' as const, short: 'h' },
	info: { type: 'boolean' as const, short: 'i' },
	layout: { type: 'string' as const, short: 'l', default: 'preview-only' },
	renderer: { type: 'string' as const, short: 'r', default: 'opentui' },
	theme: { type: 'string' as const, short: 't', default: 'auto' },
} as const

function parseCliArgs() {
	let values: ReturnType<typeof parseArgs<{ options: typeof options }>>['values']
	let positionals: string[]

	try {
		const parsed = parseArgs({
			args: process.argv.slice(2),
			options,
			allowPositionals: true,
			strict: true,
		})
		values = parsed.values
		positionals = parsed.positionals
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : 'invalid arguments'
		console.error(`error: ${message}`)
		console.error(`\nrun 'liham --help' for usage`)
		process.exit(1)
	}

	if (values.help) {
		console.log(USAGE)
		process.exit(0)
	}

	const theme = values.theme
	if (!isThemeName(theme)) {
		console.error(`unknown theme: '${theme}'`)
		console.error(`available themes: ${VALID_THEMES.join(', ')}`)
		console.error(`\nrun 'liham --help' for usage`)
		process.exit(1)
	}

	const renderer = values.renderer
	if (!isRendererName(renderer)) {
		console.error(`unknown renderer: '${renderer}'`)
		console.error(`available renderers: ${VALID_RENDERERS.join(', ')}`)
		console.error(`\nrun 'liham --help' for usage`)
		process.exit(1)
	}

	const layout = values.layout
	if (!isLayoutName(layout)) {
		console.error(`unknown layout: '${layout}'`)
		console.error(`available layouts: ${VALID_LAYOUTS.join(', ')}`)
		console.error(`\nrun 'liham --help' for usage`)
		process.exit(1)
	}

	if (values.info) {
		return { filePath: undefined, info: true, layout, renderer, theme }
	}

	const filePath = positionals[0]
	if (filePath == null) {
		console.error(USAGE)
		process.exit(1)
	}

	return { filePath, info: false, layout, renderer, theme }
}

// -- theme resolution --

interface ResolvedTheme {
	name: string
	tokens: ThemeTokens
}

async function resolveTheme(themeName: ThemeName): Promise<ResolvedTheme> {
	if (themeName === 'dark') return { name: 'dark', tokens: darkTheme }
	if (themeName === 'light') return { name: 'light', tokens: lightTheme }

	// auto: flag → env var → OSC 11 detection → dark default
	const envTheme = process.env['LIHAM_THEME']
	if (envTheme === 'light') return { name: 'light (env)', tokens: lightTheme }
	if (envTheme === 'dark') return { name: 'dark (env)', tokens: darkTheme }

	const detected = await detectTheme()
	const mode = detected ?? 'dark'
	const source = detected != null ? 'detected' : 'default'
	return { name: `${mode} (${source})`, tokens: mode === 'light' ? lightTheme : darkTheme }
}

// -- main --

async function main() {
	const args = parseCliArgs()

	if (args.info) {
		const theme = await resolveTheme(args.theme)
		console.log(`theme: ${theme.name}`)
		console.log(`renderer: ${args.renderer}`)
		console.log(`TERM: ${process.env['TERM'] ?? '(unset)'}`)
		console.log(`TERM_PROGRAM: ${process.env['TERM_PROGRAM'] ?? '(unset)'}`)
		console.log(`LIHAM_THEME: ${process.env['LIHAM_THEME'] ?? '(unset)'}`)
		console.log(`tty: ${String(process.stdout.isTTY ?? false)}`)
		process.exit(0)
	}

	const filePath = resolve(args.filePath!)

	// read file first — if it fails, exit before starting OSC 11 detection
	// (OSC 11 response leaks to terminal if process.exit races with stdin listener)
	const markdown = await Bun.file(filePath)
		.text()
		.catch(() => {
			console.error(`cannot read file: ${filePath}`)
			process.exit(1)
		})

	const theme = await resolveTheme(args.theme)

	const result = await processMarkdown(markdown, theme.tokens)

	if (!result.ok) {
		console.error(`pipeline error: ${result.error}`)
		process.exit(1)
	}

	// dispatch to renderer boot — static import for now.
	// when ink/rezi are added, switch on args.renderer here.
	await boot({ ir: result.value, theme: theme.tokens, layout: args.layout, raw: markdown })
}

await main()
