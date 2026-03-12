// theme tokens use interfaces (not Map) by design: all keys are statically known,
// interfaces provide compile-time exhaustiveness checking, and with
// noUncheckedIndexedAccess, Record<string, T> already requires T | undefined.
// Map is for truly dynamic key sets — theme tokens are fixed at compile time.

export interface HeadingLevelTokens {
	color: string
	bold: boolean
	dim: boolean
}

export interface HeadingTokens {
	levels: Record<1 | 2 | 3 | 4 | 5 | 6, HeadingLevelTokens>
}

export interface CodeBlockTokens {
	borderColor: string
	backgroundColor: string
	gutterColor: string
	textColor: string
	languageColor: string
}

export interface BlockquoteTokens {
	borderColor: string
	backgroundColor: string
	textColor: string
}

export interface LinkTokens {
	color: string
	underline: boolean
}

export interface ImageTokens {
	fallbackColor: string
	loadingColor: string
	placeholderBg: string
}

export interface InlineCodeTokens {
	backgroundColor: string
	textColor: string
}

export interface ParagraphTokens {
	textColor: string
}

export interface ListTokens {
	bulletColor: string
	textColor: string
}

export interface HorizontalRuleTokens {
	color: string
	char: string
}

export interface TableTokens {
	borderColor: string
	headerColor: string
	cellColor: string
}

export interface StatusBarTokens {
	fg: string
	dimFg: string
}

export interface PaneTokens {
	focusedBorderColor: string
	unfocusedBorderColor: string
}

export interface FallbackTokens {
	textColor: string
}

export interface SearchTokens {
	noMatchColor: string
	highlightBg: string
	highlightFg: string
	currentHighlightBg: string
}

export interface BrowserTokens {
	directoryColor: string
	selectedBg: string
	selectedFg: string
	matchHighlightColor: string
	filterColor: string
	fileCountColor: string
}

export interface MathTokens {
	textColor: string
}

export interface MermaidTokens {
	arrowColor: string
	borderColor: string
	errorColor: string
	lineColor: string
	textColor: string
}

export interface ThemeTokens {
	heading: HeadingTokens
	codeBlock: CodeBlockTokens
	blockquote: BlockquoteTokens
	link: LinkTokens
	image: ImageTokens
	inlineCode: InlineCodeTokens
	paragraph: ParagraphTokens
	list: ListTokens
	horizontalRule: HorizontalRuleTokens
	table: TableTokens
	fallback: FallbackTokens
	statusBar: StatusBarTokens
	pane: PaneTokens
	browser: BrowserTokens
	search: SearchTokens
	math: MathTokens
	mermaid: MermaidTokens
}
