import type { IRNode } from '../ir/types.ts'

export interface PipelineSuccess {
	ok: true
	value: IRNode
}

export interface PipelineError {
	ok: false
	error: string
	cause?: unknown
}

export type PipelineResult = PipelineError | PipelineSuccess
