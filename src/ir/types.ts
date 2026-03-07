// intermediate representation — renderer-agnostic node types with pre-resolved styles.
// produced by rehype-ir compiler, consumed by renderer implementations.

// -- style types --

export interface BlockStyle {
	bg?: string
	bold?: boolean
	borderColor?: string
	dim?: boolean
	fg?: string
	gutterColor?: string
	labelColor?: string
}

export interface InlineStyle {
	bg?: string
	bold?: boolean
	dim?: boolean
	fg?: string
	italic?: boolean
	strikethrough?: boolean
	underline?: boolean
}

// -- block nodes --

export interface RootNode {
	type: 'root'
	children: IRNode[]
}

export interface HeadingNode {
	type: 'heading'
	level: 1 | 2 | 3 | 4 | 5 | 6
	style: BlockStyle
	children: IRNode[]
}

export interface ParagraphNode {
	type: 'paragraph'
	style: BlockStyle
	children: IRNode[]
}

export interface CodeBlockNode {
	type: 'codeBlock'
	code: string
	language?: string
	style: BlockStyle
	children: IRNode[]
}

export interface BlockquoteNode {
	type: 'blockquote'
	style: BlockStyle
	children: IRNode[]
}

export interface ListNode {
	type: 'list'
	ordered: boolean
	start?: number
	children: IRNode[]
}

export interface ListItemNode {
	type: 'listItem'
	bullet: string
	style: BlockStyle
	children: IRNode[]
}

export interface TableNode {
	type: 'table'
	alignments: ('left' | 'center' | 'right' | null)[]
	style: BlockStyle
	children: TableRowNode[]
}

export interface TableRowNode {
	type: 'tableRow'
	isHeader: boolean
	style: BlockStyle
	children: TableCellNode[]
}

export interface TableCellNode {
	type: 'tableCell'
	style: BlockStyle
	children: IRNode[]
}

export interface ThematicBreakNode {
	type: 'thematicBreak'
	style: { char: string; color: string }
}

export interface UnknownBlockNode {
	type: 'unknown'
	tagName: string
	style: BlockStyle
	children: IRNode[]
}

// -- inline nodes --

export interface TextNode {
	type: 'text'
	value: string
	style?: InlineStyle
}

export interface StrongNode {
	type: 'strong'
	style: InlineStyle
	children: IRNode[]
}

export interface EmphasisNode {
	type: 'emphasis'
	style: InlineStyle
	children: IRNode[]
}

export interface StrikethroughNode {
	type: 'strikethrough'
	style: InlineStyle
	children: IRNode[]
}

export interface InlineCodeNode {
	type: 'inlineCode'
	value: string
	style: InlineStyle
}

export interface LinkNode {
	type: 'link'
	url: string
	style: InlineStyle
	children: IRNode[]
}

export interface ImageNode {
	type: 'image'
	alt: string
	url?: string
	style: InlineStyle
}

export interface BreakNode {
	type: 'break'
}

export interface CheckboxNode {
	type: 'checkbox'
	checked: boolean
}

// -- custom extension --

export interface CustomNode<T extends string = string> {
	type: T
	children?: IRNode[]
	data?: Record<string, unknown>
	style?: Record<string, unknown>
}

// -- union + helpers --

// core node types — strictly discriminated union for type narrowing
export type CoreIRNode =
	| BlockquoteNode
	| BreakNode
	| CheckboxNode
	| CodeBlockNode
	| EmphasisNode
	| HeadingNode
	| ImageNode
	| InlineCodeNode
	| LinkNode
	| ListItemNode
	| ListNode
	| ParagraphNode
	| RootNode
	| StrikethroughNode
	| StrongNode
	| TableCellNode
	| TableNode
	| TableRowNode
	| TextNode
	| ThematicBreakNode
	| UnknownBlockNode

// full union including custom extension nodes
export type IRNode = CoreIRNode | CustomNode<string>

// image uses InlineStyle but renders as a block — the component ignores most
// style props and uses theme tokens + ImageContext directly.
const BLOCK_TYPES = new Set([
	'root',
	'heading',
	'paragraph',
	'codeBlock',
	'blockquote',
	'list',
	'listItem',
	'image',
	'table',
	'tableRow',
	'tableCell',
	'thematicBreak',
	'unknown',
])

export function isBlockNode(node: IRNode): boolean {
	return BLOCK_TYPES.has(node.type)
}
