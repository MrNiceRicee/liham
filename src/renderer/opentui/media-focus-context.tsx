// react context for media focus — separate from ImageContext to avoid excessive re-renders.
// ImageContext is stable (changes on file open/resize). MediaFocusContext changes on every n/N press.

import { createContext } from 'react'

export interface MediaFocusContextValue {
	focusedMediaIndex: number | null
	mediaCount: number
	onMediaClick: (index: number) => void
	focusBorderColor: string
}

export const MediaFocusContext = createContext<MediaFocusContextValue | undefined>(undefined)
