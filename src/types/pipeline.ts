import type { ReactNode } from 'react'

export interface PipelineSuccess {
	ok: true
	value: ReactNode
}

export interface PipelineError {
	ok: false
	error: string
	cause?: unknown
}

export type PipelineResult = PipelineError | PipelineSuccess
