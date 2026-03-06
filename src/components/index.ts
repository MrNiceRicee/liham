import type { ComponentType } from '../types/components.ts'

import { Blockquote } from './block/Blockquote.tsx'
import { CodeBlock } from './block/CodeBlock.tsx'
import { Heading } from './block/Heading.tsx'
import { List, ListItem } from './block/List.tsx'
import { Paragraph } from './block/Paragraph.tsx'
import { Fallback } from './util/Fallback.tsx'

// component registry: maps hast element tagNames to OpenTUI components.
export const componentMap: Record<string, ComponentType> = {
	blockquote: Blockquote,
	h1: Heading,
	h2: Heading,
	h3: Heading,
	h4: Heading,
	h5: Heading,
	h6: Heading,
	li: ListItem,
	ol: List,
	p: Paragraph,
	pre: CodeBlock,
	ul: List,
}

export const fallbackComponent: ComponentType = Fallback

export { Blockquote } from './block/Blockquote.tsx'
export { CodeBlock } from './block/CodeBlock.tsx'
export { Heading } from './block/Heading.tsx'
export { List, ListItem } from './block/List.tsx'
export { Paragraph } from './block/Paragraph.tsx'
export { Fallback } from './util/Fallback.tsx'
