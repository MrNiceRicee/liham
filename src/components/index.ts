import type { ComponentType } from '../types/components.ts'

import { CodeBlock } from './block/CodeBlock.tsx'
import { Heading } from './block/Heading.tsx'
import { Paragraph } from './block/Paragraph.tsx'
import { Fallback } from './util/Fallback.tsx'

// component registry: maps hast element tagNames to OpenTUI components.
// phase 2a covers core components only; remaining added in phase 2b.
export const componentMap: Record<string, ComponentType> = {
	h1: Heading,
	h2: Heading,
	h3: Heading,
	h4: Heading,
	h5: Heading,
	h6: Heading,
	p: Paragraph,
	pre: CodeBlock,
}

export const fallbackComponent: ComponentType = Fallback

export { CodeBlock } from './block/CodeBlock.tsx'
export { Heading } from './block/Heading.tsx'
export { Paragraph } from './block/Paragraph.tsx'
export { Fallback } from './util/Fallback.tsx'
