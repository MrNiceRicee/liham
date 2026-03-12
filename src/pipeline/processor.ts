import type { Root } from 'hast'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import type { Plugin } from 'unified'
import { unified } from 'unified'

import type { IRNode, RootNode } from '../ir/types.ts'
import type { ThemeTokens } from '../theme/types.ts'
import type { PipelineResult } from '../types/pipeline.ts'
import { extractError } from '../utils/error.ts'

import rehypeIR from './rehype-ir.ts'

const PIPELINE_TIMEOUT_MS = 5_000

export function createProcessor(theme: ThemeTokens) {
	return unified()
		.use(remarkParse)
		.use(remarkMath)
		.use(remarkGfm)
		.use(remarkRehype, { allowDangerousHtml: false })
		.use(
			rehypeHighlight as unknown as Plugin<[{ detect: boolean; ignoreMissing: boolean }], Root>,
			{ detect: true, ignoreMissing: true },
		)
		.use(rehypeIR, { theme })
}

export async function processMarkdown(
	markdown: string,
	theme: ThemeTokens,
): Promise<PipelineResult> {
	const processor = createProcessor(theme)

	try {
		const result = await Promise.race([
			processor.process(markdown),
			new Promise<never>((_, reject) => {
				setTimeout(() => reject(new Error('pipeline timeout exceeded')), PIPELINE_TIMEOUT_MS)
			}),
		])

		const ir = result.result as IRNode
		if (ir.type !== 'root') {
			return { ok: false, error: 'pipeline produced non-root node' }
		}
		return { ok: true, value: ir as RootNode }
	} catch (err: unknown) {
		return {
			ok: false,
			error: extractError(err, 'unknown pipeline error'),
			cause: err,
		}
	}
}
