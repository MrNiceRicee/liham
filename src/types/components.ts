import type { Element } from 'hast'
import type { ReactNode } from 'react'

import type { ThemeTokens } from '../theme/types.ts'

export interface BaseNodeProps {
	children?: ReactNode
	node: Element
	theme: ThemeTokens
}

export type ComponentType = (props: Readonly<BaseNodeProps>) => ReactNode
