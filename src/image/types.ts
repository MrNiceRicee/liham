// image types — shared across all renderers, no framework imports.

// result type following PipelineResult pattern in src/types/pipeline.ts
export type ImageResult<T> = { ok: true; value: T } | { ok: false; error: string; cause?: unknown }

export interface LoadedImage {
	rgba: Uint8Array
	width: number
	height: number
	terminalRows: number
	terminalCols: number
	byteSize: number
	source: string
}

export interface HalfBlockCell {
	char: string // '▄' | ' '
	fg: string // 24-bit hex color for bottom pixel
	bg: string // 24-bit hex color for top pixel
}

export type HalfBlockGrid = HalfBlockCell[][]

// kitty-virtual = Kitty/Ghostty with U+10EEEE support
// halfblock = 24-bit color terminals without virtual placements (WezTerm, etc.)
// text = minimal terminals, fallback
export type ImageProtocol = 'kitty-virtual' | 'halfblock' | 'text'

export interface ImageCapabilities {
	protocol: ImageProtocol
	cellPixelWidth: number
	cellPixelHeight: number
}
