// ring buffer — pre-allocated circular buffer for raw RGBA video frames.
// decouples ffmpeg producer from timer-driven consumer.
// write() returns sync boolean (fast path) or deferred Promise<boolean> (backpressure).

const MEMORY_BUDGET = 30 * 1024 * 1024 // 30MB cap

const debug =
	process.env['LIHAM_DEBUG'] === '1'
		? (msg: string) => process.stderr.write(`[ring-buffer] ${msg}\n`)
		: () => {}

// -- types --

export interface RingBuffer {
	write(frame: Uint8Array): Promise<boolean> | boolean
	read(): Uint8Array | null
	flush(): void
	markEnded(): void
	markError(reason: string): void
	dispose(): void
	readonly ended: boolean
	readonly errored: boolean
	readonly errorReason: string | null
	readonly empty: boolean
	readonly full: boolean
	readonly length: number
	readonly capacity: number
}

// -- factory --

export function createRingBuffer(requestedCapacity: number, frameSize: number): RingBuffer {
	const capacity = Math.max(1, Math.min(requestedCapacity, Math.floor(MEMORY_BUDGET / frameSize)))
	const slots: Uint8Array[] = Array.from({ length: capacity }, () => new Uint8Array(frameSize))

	let readIndex = 0
	let writeIndex = 0
	let count = 0
	let ended = false
	let errored = false
	let errorReason: string | null = null
	let disposed = false
	let parkedWriter: ((value: boolean) => void) | null = null

	debug(`created capacity=${String(capacity)} frameSize=${String(frameSize)}`)

	function reset() {
		readIndex = 0
		writeIndex = 0
		count = 0
		ended = false
		errored = false
		errorReason = null
	}

	return {
		// eslint-disable-next-line sonarjs/function-return-type -- intentional: sync fast path (boolean) + async backpressure (Promise<boolean>)
		write(frame: Uint8Array): Promise<boolean> | boolean {
			if (disposed) return false

			if (count < capacity) {
				// fast path — synchronous copy, zero allocation
				slots[writeIndex]!.set(frame)
				writeIndex = (writeIndex + 1) % capacity
				count++
				debug(`write fast count=${String(count)}/${String(capacity)}`)
				return true
			}

			// buffer full — park producer with deferred promise
			const { promise, resolve } = Promise.withResolvers<boolean>()
			parkedWriter = resolve
			debug('write parked (buffer full)')

			// when unparked, copy the frame into the now-available slot
			return promise.then((ok) => {
				if (!ok || disposed) return false
				slots[writeIndex]!.set(frame)
				writeIndex = (writeIndex + 1) % capacity
				count++
				debug(`write deferred count=${String(count)}/${String(capacity)}`)
				return true
			})
		},

		read(): Uint8Array | null {
			if (count === 0) return null

			const frame = slots[readIndex]!
			readIndex = (readIndex + 1) % capacity
			count--

			// unpark writer if waiting — MUST use setTimeout, not queueMicrotask
			if (parkedWriter != null) {
				const resolve = parkedWriter
				parkedWriter = null
				setTimeout(() => resolve(true), 0)
			}

			debug(`read count=${String(count)}/${String(capacity)}`)
			return frame
		},

		flush(): void {
			// reject parked writer synchronously
			if (parkedWriter != null) {
				const resolve = parkedWriter
				parkedWriter = null
				resolve(false)
			}
			reset()
			debug('flushed')
		},

		markEnded(): void {
			ended = true
			debug('ended')
		},

		markError(reason: string): void {
			errored = true
			errorReason = reason
			debug(`error: ${reason}`)
		},

		dispose(): void {
			// flush rejects parked writer + resets state
			this.flush()
			disposed = true
			debug('disposed')
		},

		get ended() {
			return ended
		},
		get errored() {
			return errored
		},
		get errorReason() {
			return errorReason
		},
		get empty() {
			return count === 0
		},
		get full() {
			return count >= capacity
		},
		get length() {
			return count
		},
		get capacity() {
			return capacity
		},
	}
}
