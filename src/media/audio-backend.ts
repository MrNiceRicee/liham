// audio backend — abstraction over mpv and ffplay for video audio playback.
// synchronous methods (pause, seek, kill) for safe use in React effect cleanup.

export type PlayResult = { ok: true } | { ok: false; error: string }

export interface AudioBackend {
	// playback
	play(filePath: string, basePath: string, seekOffset?: number): Promise<PlayResult>
	pause(): void
	resume(): Promise<void>
	seek(positionSec: number): void
	kill(): void

	// clock — returns cached time-pos (mpv) or null (ffplay). never performs I/O.
	getTimePos(): number | null

	// volume — fire-and-forget for mpv, no-op for ffplay
	setVolume(percent: number): void
	setMuted(muted: boolean): void

	// events
	onEnd(handler: () => void): void
	onError(handler: (err: Error) => void): void

	// discriminant
	readonly kind: 'mpv' | 'ffplay'
}

export function detectAudioBackend(): 'mpv' | 'ffplay' {
	if (Bun.which('mpv') != null) return 'mpv'
	return 'ffplay'
}
