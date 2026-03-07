// frame timer — drift-correcting frame cycling for animated media.
// pure utility, no renderer dependencies. used by GIF animation and future video playback.

export type PlaybackState = 'idle' | 'playing' | 'paused' | 'ended'

export interface FrameTimerHandle {
	play(): void
	pause(): void
	seek(frameIndex: number): void
	dispose(): void
	readonly state: PlaybackState
	readonly currentFrame: number
}

export interface FrameTimerOptions {
	delays: number[]
	onFrame: (index: number) => void
	loop?: boolean
}

export function createFrameTimer({
	delays,
	onFrame,
	loop = true,
}: FrameTimerOptions): FrameTimerHandle {
	let state: PlaybackState = 'idle'
	let frameIndex = 0
	let timerId: ReturnType<typeof setTimeout> | null = null
	let epochMs = 0
	let accumulated = 0

	function scheduleNext() {
		if (state !== 'playing') return
		const delay = delays[frameIndex] ?? 100
		const now = performance.now()
		const expected = epochMs + accumulated + delay
		const adjusted = Math.max(0, expected - now)

		timerId = setTimeout(() => {
			accumulated += delay
			const nextIndex = frameIndex + 1

			if (!loop && nextIndex >= delays.length) {
				state = 'ended'
				return
			}

			frameIndex = loop ? nextIndex % delays.length : nextIndex
			onFrame(frameIndex)
			scheduleNext()
		}, adjusted)
	}

	return {
		play() {
			if (state === 'playing') return
			if (state === 'idle' || state === 'ended') {
				accumulated = 0
				frameIndex = 0
			}
			epochMs = performance.now() - accumulated
			state = 'playing'
			onFrame(frameIndex)
			scheduleNext()
		},
		pause() {
			if (state !== 'playing') return
			state = 'paused'
			if (timerId != null) {
				clearTimeout(timerId)
				timerId = null
			}
		},
		seek(index: number) {
			frameIndex = Math.max(0, Math.min(index, delays.length - 1))
			accumulated = delays.slice(0, frameIndex).reduce((a, b) => a + b, 0)
			epochMs = performance.now() - accumulated
			onFrame(frameIndex)
			if (state === 'playing') {
				if (timerId != null) {
					clearTimeout(timerId)
					timerId = null
				}
				scheduleNext()
			}
		},
		dispose() {
			state = 'idle'
			if (timerId != null) {
				clearTimeout(timerId)
				timerId = null
			}
		},
		get state() {
			return state
		},
		get currentFrame() {
			return frameIndex
		},
	}
}
