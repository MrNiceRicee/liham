// print mode — static render-to-stdout, no interactive TUI.
// renders markdown through the full pipeline (processMarkdown → IR → renderToOpenTUI → JSX)
// then captures the styled frame via OpenTUI's test renderer.

import { resolve } from 'node:path'

import type { CapturedFrame, CapturedSpan } from '@opentui/core'
import { testRender } from '@opentui/react/test-utils'

import type { IRNode, RootNode } from '../ir/types.ts'
import { detectCapabilities } from '../media/detect.ts'
import { processMarkdown } from '../pipeline/processor.ts'
import { ImageContext } from '../renderer/opentui/image-context.tsx'
import { renderToOpenTUI } from '../renderer/opentui/index.tsx'
import { estimateHeight } from '../renderer/opentui/scroll-utils.ts'
import { darkTheme } from '../theme/dark.ts'
import { lightTheme } from '../theme/light.ts'
import type { ThemeTokens } from '../theme/types.ts'
import type { CliMode } from './index.ts'

type PrintMode = Extract<CliMode, { mode: 'print' }>

const MAX_STDIN_BYTES = 50 * 1024 * 1024 // 50MB
const CHUNK_TARGET_LINES = 500

export async function printMarkdown(args: PrintMode): Promise<void> {
	suppressReactWarnings()
	process.on('SIGPIPE', () => process.exit(0))

	const markdown = await readSource(args)
	const tokens = await resolveTheme(args)

	const result = await processMarkdown(markdown, tokens)
	if (!result.ok) {
		console.error(`pipeline error: ${result.error}`)
		process.exit(1)
	}

	const ir = result.value
	const width = process.stdout.columns ?? 80
	const basePath = args.source === 'file' ? resolve(args.filePath, '..') : process.cwd()

	for (const chunk of chunkIRChildren(ir.children, width)) {
		const ok = await renderChunk(chunk, tokens, width, basePath, args.plain)
		if (!ok) process.exit(0)
	}

	process.exit(0)
}

// -- source reading --

async function readSource(args: PrintMode): Promise<string> {
	if (args.source === 'file') return readFileSource(args.filePath)
	return readStdinSource()
}

async function readFileSource(filePath: string): Promise<string> {
	const resolved = resolve(filePath)
	const { stat } = await import('node:fs/promises')
	try {
		const s = await stat(resolved)
		if (s.isDirectory()) {
			console.error('print mode requires a file, not a directory')
			process.exit(1)
		}
	} catch {
		console.error(`cannot read file: ${resolved}`)
		process.exit(1)
	}
	return Bun.file(resolved).text()
}

async function readStdinSource(): Promise<string> {
	const markdown = await Bun.stdin.text()
	if (markdown.length > MAX_STDIN_BYTES) {
		console.error(
			`stdin too large (${String(Math.round(markdown.length / 1024 / 1024))}MB, max 50MB)`,
		)
		process.exit(1)
	}
	return markdown
}

// -- chunk rendering --

async function renderChunk(
	chunk: Chunk,
	tokens: ThemeTokens,
	width: number,
	basePath: string,
	plain: boolean,
): Promise<boolean> {
	const chunkRoot: RootNode = { type: 'root', children: chunk.nodes }
	const jsx = renderToOpenTUI(chunkRoot, tokens, width)
	// generous buffer — spansToAnsi/trimTrailing strip empty rows, so oversizing is free
	const height = Math.max(200, chunk.estimatedHeight * 3)

	const wrappedJsx = (
		<ImageContext.Provider
			value={{
				basePath,
				capabilities: { protocol: 'text', cellPixelWidth: 0, cellPixelHeight: 0 },
				bgColor: tokens.image.placeholderBg,
				maxCols: width,
				scrollRef: { current: null },
			}}
		>
			<box width={width}>{jsx}</box>
		</ImageContext.Provider>
	)

	const setup = await testRender(wrappedJsx, { width, height })
	await setup.renderOnce()

	const output = plain ? trimTrailing(setup.captureCharFrame()) : spansToAnsi(setup.captureSpans())

	try {
		process.stdout.write(output)
		process.stdout.write('\n')
	} catch (err: unknown) {
		if (err != null && typeof err === 'object' && 'code' in err && err.code === 'EPIPE') {
			setup.renderer.destroy()
			return false
		}
		throw err
	}

	setup.renderer.destroy()
	return true
}

// -- theme resolution --

async function resolveTheme(args: PrintMode): Promise<ThemeTokens> {
	if (args.theme === 'dark') return darkTheme
	if (args.theme === 'light') return lightTheme

	// auto: detect only when both stdout and stdin are TTY (explicit --print with file arg)
	if (process.stdout.isTTY && process.stdin.isTTY) {
		const result = await detectCapabilities()
		if (result.theme === 'light') return lightTheme
		return darkTheme
	}

	return darkTheme
}

// -- IR chunking --

interface Chunk {
	nodes: IRNode[]
	estimatedHeight: number
}

function chunkIRChildren(children: IRNode[], paneWidth: number): Chunk[] {
	const chunks: Chunk[] = []
	let currentNodes: IRNode[] = []
	let currentHeight = 0

	for (const node of children) {
		const h = estimateNodeHeight(node, paneWidth)

		if (currentNodes.length > 0 && currentHeight + h > CHUNK_TARGET_LINES) {
			chunks.push({ nodes: currentNodes, estimatedHeight: currentHeight })
			currentNodes = []
			currentHeight = 0
		}

		currentNodes.push(node)
		currentHeight += h
	}

	if (currentNodes.length > 0) {
		chunks.push({ nodes: currentNodes, estimatedHeight: currentHeight })
	}

	return chunks
}

function estimateNodeHeight(node: IRNode, paneWidth: number): number {
	if ('type' in node && typeof node.type === 'string') {
		return estimateHeight(node, paneWidth)
	}
	return 1
}

// -- span-to-ANSI conversion --

const ATTR_BOLD = 1
const ATTR_DIM = 2
const ATTR_ITALIC = 4
const ATTR_UNDERLINE = 8
const ATTR_STRIKETHROUGH = 128

function spansToAnsi(frame: CapturedFrame): string {
	// find last non-empty row
	let lastRow = frame.lines.length - 1
	while (lastRow >= 0) {
		const line = frame.lines[lastRow]!
		const isEmpty = line.spans.every((s) => s.text.trim() === '')
		if (!isEmpty) break
		lastRow--
	}

	const parts: string[] = []

	for (let row = 0; row <= lastRow; row++) {
		const line = frame.lines[row]!
		const lineParts: string[] = []

		for (const span of line.spans) {
			lineParts.push(spanToAnsi(span))
		}

		const lineStr = lineParts.join('').trimEnd()
		parts.push(lineStr)
		parts.push('\x1b[0m')

		if (row < lastRow) parts.push('\n')
	}

	return parts.join('')
}

function spanToAnsi(span: CapturedSpan): string {
	const codes: string[] = ['\x1b[0m']

	const [fr, fg, fb] = span.fg.toInts()
	codes.push(`\x1b[38;2;${String(fr)};${String(fg)};${String(fb)}m`)

	const [br, bg, bb, ba] = span.bg.toInts()
	if (ba > 0) {
		codes.push(`\x1b[48;2;${String(br)};${String(bg)};${String(bb)}m`)
	}

	const attr = span.attributes
	if (attr & ATTR_BOLD) codes.push('\x1b[1m')
	if (attr & ATTR_DIM) codes.push('\x1b[2m')
	if (attr & ATTR_ITALIC) codes.push('\x1b[3m')
	if (attr & ATTR_UNDERLINE) codes.push('\x1b[4m')
	if (attr & ATTR_STRIKETHROUGH) codes.push('\x1b[9m')

	return codes.join('') + span.text
}

// -- utilities --

function trimTrailing(text: string): string {
	const lines = text.split('\n').map((line) => line.trimEnd())
	// drop trailing empty lines
	while (lines.length > 0 && lines[lines.length - 1] === '') {
		lines.pop()
	}
	return lines.join('\n')
}

function suppressReactWarnings(): void {
	const originalError = console.error
	console.error = (...args: unknown[]) => {
		const msg = String(args[0])
		if (msg.includes('unique "key" prop') || msg.includes('not wrapped in act')) return
		originalError(...args)
	}
}
