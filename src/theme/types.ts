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
}

export interface PaneTokens {
	focusedBorderColor: string
	unfocusedBorderColor: string
}

export interface FallbackTokens {
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
}
