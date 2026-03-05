export interface HeadingTokens {
	color: string
	bold: boolean
	prefix: string
}

export interface CodeBlockTokens {
	borderColor: string
	backgroundColor: string
	gutterColor: string
	textColor: string
}

export interface BlockquoteTokens {
	borderChar: string
	borderColor: string
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
}
