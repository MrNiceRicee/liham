// react context for media focus — separate from ImageContext to avoid excessive re-renders.
// ImageContext is stable (changes on file open/resize). MediaFocusContext changes on every n/N press.

import { createContext } from 'react'

export interface MediaFocusContextValue {
	focusedMediaIndex: number | null
	onMediaClick: (index: number) => void
}

export const MediaFocusContext = createContext<MediaFocusContextValue | undefined>(undefined)
