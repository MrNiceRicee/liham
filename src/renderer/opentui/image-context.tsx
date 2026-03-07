// react context for image rendering — provides basePath, capabilities, and bgColor.
// first React context in the codebase — justified by deeply nested image components.

import type { ScrollBoxRenderable } from '@opentui/core'

import { createContext, type RefObject } from 'react'

import type { ImageCapabilities } from '../../image/types.ts'

export interface ImageContextValue {
	basePath: string
	capabilities: ImageCapabilities
	bgColor: string
	maxCols: number
	scrollRef: RefObject<ScrollBoxRenderable | null>
}

export const ImageContext = createContext<ImageContextValue | undefined>(undefined)
