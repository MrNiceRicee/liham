// frame timer — drift-correcting frame cycling for animated media.
// pure utility, no renderer dependencies. used by GIF animation and video playback.
//
// two drift correction modes:
// - Pattern A (epoch-anchored): for variable delays (GIF). anchors to start time,
//   catches up on delays. used when delays array has multiple distinct values.
// - Pattern B (rolling expected): for constant interval (video). resets baseline to
//   "now" when overloaded, gracefully dropping missed frames instead of cascading
//   catch-up ticks. used when delays array has a single value.

export type PlaybackState = 'idle' | 'playing' | 'paused' | 'ended'

export interface FrameTimerHandle {
	play(): void
	pause(): void
	seek(frameIndex: number): void
	dispose(): void
	readonly state: PlaybackState
	readonly currentFrame: number
	readonly tickCount: number
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
	let disposed = false
	let tickCount = 0

	// detect constant-interval mode (single unique delay = Pattern B)
	const isConstantInterval = delays.length === 1 || new Set(delays).size === 1

	// Pattern A state (epoch-anchored, for variable delays)
	let epochMs = 0
	let accumulated = 0

	// Pattern B state (rolling expected, for constant interval)
	let nextTickAt = 0

	function scheduleNextA() {
		if (state !== 'playing' || disposed) return
		const delay = delays[frameIndex] ?? 100
		const now = performance.now()
		const expected = epochMs + accumulated + delay
		const adjusted = Math.max(0, expected - now)

		timerId = setTimeout(() => {
			if (disposed) return
			accumulated += delay
			const nextIndex = frameIndex + 1

			if (!loop && nextIndex >= delays.length) {
				state = 'ended'
				return
			}

			frameIndex = loop ? nextIndex % delays.length : nextIndex
			tickCount++
			onFrame(frameIndex)
			scheduleNextA()
		}, adjusted)
	}

	function scheduleNextB() {
		if (state !== 'playing' || disposed) return
		const intervalMs = delays[0] ?? 100
		const now = performance.now()
		// Pattern B: next tick relative to expected, but never in the past
		const adjusted = Math.max(0, nextTickAt - now)

		timerId = setTimeout(() => {
			if (disposed) return
			const nextIndex = frameIndex + 1

			if (!loop && nextIndex >= delays.length) {
				state = 'ended'
				return
			}

			frameIndex = loop ? nextIndex % delays.length : nextIndex
			tickCount++
			// epoch-anchored: advance by one interval to maintain correct average rate
			nextTickAt += intervalMs
			// if more than 3 frames behind (e.g. process suspended), skip forward
			const now = performance.now()
			if (nextTickAt < now - 3 * intervalMs) {
				nextTickAt = now
			}
			onFrame(frameIndex)
			scheduleNextB()
		}, adjusted)
	}

	const scheduleNext = isConstantInterval ? scheduleNextB : scheduleNextA

	return {
		play() {
			if (state === 'playing') return
			if (state === 'idle' || state === 'ended') {
				accumulated = 0
				frameIndex = 0
				tickCount = 0
			}
			const now = performance.now()
			epochMs = now - accumulated
			nextTickAt = now + (delays[0] ?? 100)
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
			const now = performance.now()
			epochMs = now - accumulated
			nextTickAt = now + (delays[frameIndex] ?? 100)
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
			disposed = true
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
		get tickCount() {
			return tickCount
		},
	}
}
