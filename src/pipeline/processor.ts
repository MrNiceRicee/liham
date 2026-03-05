import type { Root } from 'hast'
import type { ReactNode } from 'react'
import type { Plugin } from 'unified'

import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'

import type { ThemeTokens } from '../theme/types.ts'
import type { PipelineResult } from '../types/pipeline.ts'

import { componentMap, fallbackComponent } from '../components/index.ts'
import { darkTheme } from '../theme/dark.ts'
import rehypeTerminal from './rehype-terminal.tsx'

const PIPELINE_TIMEOUT_MS = 5_000

export function createProcessor(theme: ThemeTokens = darkTheme) {
	return unified()
		.use(remarkParse)
		.use(remarkGfm)
		.use(remarkRehype, { allowDangerousHtml: false })
		.use(
			rehypeHighlight as unknown as Plugin<[{ detect: boolean; ignoreMissing: boolean }], Root>,
			{ detect: true, ignoreMissing: true },
		)
		.use(rehypeTerminal, {
			components: componentMap,
			fallback: fallbackComponent,
			theme,
		})
}

export async function processMarkdown(
	markdown: string,
	theme: ThemeTokens = darkTheme,
): Promise<PipelineResult> {
	const processor = createProcessor(theme)

	try {
		const result = await Promise.race([
			processor.process(markdown),
			new Promise<never>((_, reject) => {
				setTimeout(() => reject(new Error('pipeline timeout exceeded')), PIPELINE_TIMEOUT_MS)
			}),
		])

		return {
			ok: true,
			value: result.result as ReactNode,
		}
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : 'unknown pipeline error'
		return {
			ok: false,
			error: message,
			cause: err,
		}
	}
}
