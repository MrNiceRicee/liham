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
	frames?: Uint8Array[] // all decoded frames (animated GIFs) — renderers may ignore
	delays?: number[] // ms per frame, clamped (animated GIFs) — renderers may ignore
}

export interface HalfBlockCell {
	char: string // '▄' | ' '
	fg: string // 24-bit hex color for bottom pixel
	bg: string // 24-bit hex color for top pixel
}

export type HalfBlockGrid = HalfBlockCell[][]

// loaded file — discriminated union for local vs remote sources
export interface LocalFile {
	kind: 'local'
	bytes: Uint8Array
	absolutePath: string
	mtime: number
}

export interface RemoteFile {
	kind: 'remote'
	bytes: Uint8Array
	url: string
}

export type LoadedFile = LocalFile | RemoteFile

// kitty-virtual = Kitty/Ghostty with U+10EEEE support
// halfblock = 24-bit color terminals without virtual placements (WezTerm, etc.)
// text = minimal terminals, fallback
export type ImageProtocol = 'kitty-virtual' | 'halfblock' | 'text'

export interface ImageCapabilities {
	protocol: ImageProtocol
	cellPixelWidth: number
	cellPixelHeight: number
}
