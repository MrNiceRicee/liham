import type { RootNode } from '../ir/types.ts'

export interface PipelineSuccess {
	ok: true
	value: RootNode
}

export interface PipelineError {
	ok: false
	error: string
	cause?: unknown
}

export type PipelineResult = PipelineError | PipelineSuccess
