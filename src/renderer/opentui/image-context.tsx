// react context for image rendering — provides basePath, capabilities, and bgColor.
// first React context in the codebase — justified by deeply nested image components.

import { createContext } from 'react'

import type { ImageCapabilities } from '../../image/types.ts'

export interface ImageContextValue {
	basePath: string
	capabilities: ImageCapabilities
	bgColor: string
}

export const ImageContext = createContext<ImageContextValue | undefined>(undefined)
