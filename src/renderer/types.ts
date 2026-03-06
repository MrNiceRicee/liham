import type { ReactNode } from 'react'

import type { IRNode } from '../ir/types.ts'

export interface Renderer {
	render(node: IRNode): ReactNode
}
