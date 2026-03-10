#!/usr/bin/env bun

// cli entry point — parses args, validates input, dispatches to renderer boot.

if (typeof Bun === 'undefined') {
	console.error('liham requires Bun. Install it: https://bun.sh')
	process.exit(1)
}

import { resolve } from 'node:path'
import { parseArgs } from 'node:util'

import type { LayoutMode } from '../app/state.ts'
import { extractError } from '../utils/error.ts'
import { isSharpAvailable } from '../media/decoder.ts'
import { detectCapabilities } from '../media/detect.ts'
import { isFfmpegAvailable, isFfplayAvailable } from '../media/ffplay.ts'
import type { MediaCapabilities } from '../media/types.ts'
import { processMarkdown } from '../pipeline/processor.ts'
import { boot } from '../renderer/opentui/boot.tsx'
import { darkTheme } from '../theme/dark.ts'
import { lightTheme } from '../theme/light.ts'
import type { ThemeTokens } from '../theme/types.ts'
import { generateBashCompletion, generateZshCompletion } from './completions.ts'

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

const VALID_LAYOUTS: readonly LayoutMode[] = ['preview-only', 'side', 'top', 'source-only'] as const

function isLayoutName(value: string): value is LayoutMode {
	return (VALID_LAYOUTS as readonly string[]).includes(value)
}

// -- help text --

const USAGE = `liham — terminal markdown previewer

usage:
  liham                    browse current directory for .md files
  liham <directory>        browse directory for .md files
  liham <file.md>          preview a markdown file
  liham [options] [path]

options:
  -r, --renderer <name>   TUI renderer to use (default: opentui)
                           available: ${VALID_RENDERERS.join(', ')}

  -t, --theme <name>      Color theme (default: auto)
                           available: ${VALID_THEMES.join(', ')}
                             auto   detect from terminal background
                             dark   dark theme (Tokyo Night)
                             light  light theme (Tokyo Night Light)

  -l, --layout <mode>     Pane layout (default: side)
                           available: ${VALID_LAYOUTS.join(', ')}

  -i, --info               Show detected theme and terminal info, then exit

  --no-images              Disable image rendering (text fallback only)

  --no-watch               Disable file watching (no live reload)

  --completions <shell>    Output shell completion script (zsh, bash)

  -h, --help               Show this help message

examples:
  liham                    browse cwd for markdown files
  liham ./docs             browse docs/ for markdown files
  liham README.md          preview README.md
  liham -t dark README.md`

// -- arg parsing --

const options = {
	completions: { type: 'string' as const },
	help: { type: 'boolean' as const, short: 'h' },
	info: { type: 'boolean' as const, short: 'i' },
	layout: { type: 'string' as const, short: 'l', default: 'side' },
	'no-images': { type: 'boolean' as const, default: false },
	'no-watch': { type: 'boolean' as const, default: false },
	renderer: { type: 'string' as const, short: 'r', default: 'opentui' },
	theme: { type: 'string' as const, short: 't', default: 'auto' },
} as const

type CliMode =
	| {
			mode: 'info'
			layout: LayoutMode
			renderer: RendererName
			theme: ThemeName
			noImages: boolean
	  }
	| {
			mode: 'browser'
			dir: string
			layout: LayoutMode
			renderer: RendererName
			theme: ThemeName
			noWatch: boolean
			noImages: boolean
	  }
	| {
			mode: 'viewer'
			filePath: string
			layout: LayoutMode
			renderer: RendererName
			theme: ThemeName
			noWatch: boolean
			noImages: boolean
	  }

function parseCliArgs(): CliMode {
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
		console.error(`error: ${extractError(err, 'invalid arguments')}`)
		console.error(`\nrun 'liham --help' for usage`)
		process.exit(1)
	}

	if (values.help) {
		console.log(USAGE)
		process.exit(0)
	}

	if (values.completions != null) {
		if (values.completions === 'zsh') {
			console.log(generateZshCompletion())
		} else if (values.completions === 'bash') {
			console.log(generateBashCompletion())
		} else {
			console.error(`unknown shell: '${values.completions}'`)
			console.error('available: zsh, bash')
			process.exit(1)
		}
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

	const noImages = values['no-images'] ?? false

	if (values.info) {
		return { mode: 'info', layout, renderer, theme, noImages }
	}

	const positional = positionals[0]

	const noWatch = values['no-watch'] ?? false

	// no positional → browser mode (cwd)
	if (positional == null) {
		return { mode: 'browser', dir: process.cwd(), layout, renderer, theme, noWatch, noImages }
	}

	// positional present — will be resolved to file or directory in main()
	return { mode: 'viewer', filePath: positional, layout, renderer, theme, noWatch, noImages }
}

// resolve positional arg: file → viewer, directory → browser, missing → error
async function resolvePositional(
	positional: string,
	layout: LayoutMode,
	renderer: RendererName,
	theme: ThemeName,
	noWatch: boolean,
	noImages: boolean,
): Promise<CliMode> {
	const resolved = resolve(positional)

	try {
		const { stat } = await import('node:fs/promises')
		const s = await stat(resolved)
		if (s.isDirectory()) {
			return { mode: 'browser', dir: resolved, layout, renderer, theme, noWatch, noImages }
		}
		if (s.isFile()) {
			return { mode: 'viewer', filePath: resolved, layout, renderer, theme, noWatch, noImages }
		}
	} catch {
		// fall through
	}

	console.error(`cannot find file or directory: ${resolved}`)
	process.exit(1)
}

// -- theme + image detection resolution --

interface ResolvedDetection {
	themeName: string
	tokens: ThemeTokens
	mediaCapabilities: MediaCapabilities
}

function buildMediaCapabilities(
	result: Awaited<ReturnType<typeof detectCapabilities>>,
): MediaCapabilities {
	return {
		...result.image,
		canAnimate: false, // OpenTUI React reconciler causes tearing
		canPlayVideo: isFfmpegAvailable(), // video rendering needs ffmpeg for frame extraction
		canPlayAudio: isFfplayAvailable(), // audio-only still uses ffplay
	}
}

async function resolveDetection(themeName: ThemeName): Promise<ResolvedDetection> {
	// explicit theme skips detection for theme but still detects image
	if (themeName === 'dark') {
		const result = await detectCapabilities()
		return {
			themeName: 'dark',
			tokens: darkTheme,
			mediaCapabilities: buildMediaCapabilities(result),
		}
	}
	if (themeName === 'light') {
		const result = await detectCapabilities()
		return {
			themeName: 'light',
			tokens: lightTheme,
			mediaCapabilities: buildMediaCapabilities(result),
		}
	}

	// auto: flag → env var → combined detection → dark default
	const envTheme = process.env['LIHAM_THEME']
	if (envTheme === 'light') {
		const result = await detectCapabilities()
		return {
			themeName: 'light (env)',
			tokens: lightTheme,
			mediaCapabilities: buildMediaCapabilities(result),
		}
	}
	if (envTheme === 'dark') {
		const result = await detectCapabilities()
		return {
			themeName: 'dark (env)',
			tokens: darkTheme,
			mediaCapabilities: buildMediaCapabilities(result),
		}
	}

	const result = await detectCapabilities()
	const mode = result.theme ?? 'dark'
	const source = result.theme != null ? 'detected' : 'default'
	return {
		themeName: `${mode} (${source})`,
		tokens: mode === 'light' ? lightTheme : darkTheme,
		mediaCapabilities: buildMediaCapabilities(result),
	}
}

// -- main --

async function main() {
	let args = parseCliArgs()

	// resolve positional: detect file vs directory
	if (args.mode === 'viewer') {
		args = await resolvePositional(
			args.filePath,
			args.layout,
			args.renderer,
			args.theme,
			args.noWatch,
			args.noImages,
		)
	}

	if (args.mode === 'info') {
		const detection = await resolveDetection(args.theme)
		if (args.noImages) {
			detection.mediaCapabilities = {
				...detection.mediaCapabilities,
				protocol: 'text',
				cellPixelWidth: 0,
				cellPixelHeight: 0,
			}
		}
		const { initSharp } = await import('../media/decoder.ts')
		await initSharp()
		console.log(`theme: ${detection.themeName}`)
		console.log(`renderer: ${args.renderer}`)
		const protocolLabel = args.noImages
			? `${detection.mediaCapabilities.protocol} (--no-images)`
			: detection.mediaCapabilities.protocol
		console.log(`image protocol: ${protocolLabel}`)
		console.log(
			`cell pixels: ${String(detection.mediaCapabilities.cellPixelWidth)}x${String(detection.mediaCapabilities.cellPixelHeight)}`,
		)
		console.log(`sharp: ${String(isSharpAvailable())}`)
		console.log(`ffmpeg: ${String(detection.mediaCapabilities.canPlayVideo)}`)
		console.log(`ffplay: ${String(detection.mediaCapabilities.canPlayAudio)}`)
		console.log(`TERM: ${process.env['TERM'] ?? '(unset)'}`)
		console.log(`TERM_PROGRAM: ${process.env['TERM_PROGRAM'] ?? '(unset)'}`)
		console.log(`LIHAM_THEME: ${process.env['LIHAM_THEME'] ?? '(unset)'}`)
		console.log(`LIHAM_IMAGE_PROTOCOL: ${process.env['LIHAM_IMAGE_PROTOCOL'] ?? '(unset)'}`)
		console.log(`tty: ${String(process.stdout.isTTY ?? false)}`)
		process.exit(0)
	}

	const detection = await resolveDetection(args.theme)
	if (args.noImages) {
		detection.mediaCapabilities = {
			...detection.mediaCapabilities,
			protocol: 'text',
			cellPixelWidth: 0,
			cellPixelHeight: 0,
		}
	}

	if (args.mode === 'browser') {
		await boot({
			mode: 'browser',
			dir: args.dir,
			theme: detection.tokens,
			mediaCapabilities: detection.mediaCapabilities,
			layout: args.layout,
			noWatch: args.noWatch,
		})
		return
	}

	// viewer mode — read file and run pipeline
	const filePath = args.filePath

	const t0 = performance.now()
	const markdown = await Bun.file(filePath)
		.text()
		.catch(() => {
			console.error(`cannot read file: ${filePath}`)
			process.exit(1)
		})

	const result = await processMarkdown(markdown, detection.tokens)

	if (!result.ok) {
		console.error(`pipeline error: ${result.error}`)
		process.exit(1)
	}

	const renderTimeMs = performance.now() - t0
	await boot({
		mode: 'viewer',
		ir: result.value,
		theme: detection.tokens,
		mediaCapabilities: detection.mediaCapabilities,
		layout: args.layout,
		raw: markdown,
		renderTimeMs,
		filePath,
		noWatch: args.noWatch,
	})
}

await main()
