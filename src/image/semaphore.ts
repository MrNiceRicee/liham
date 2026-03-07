// abort-aware semaphore — limits concurrent operations, prevents slot leak on unmount.

export interface Semaphore {
	acquire(signal?: AbortSignal): Promise<void>
	release(): void
}

export function createSemaphore(max: number): Semaphore {
	let active = 0
	const queue: { resolve: () => void; rejected: boolean }[] = []

	return {
		async acquire(signal?: AbortSignal) {
			if (active < max) { active++; return }
			return new Promise<void>((resolve, reject) => {
				const entry = { resolve, rejected: false }
				queue.push(entry)
				signal?.addEventListener('abort', () => {
					const idx = queue.indexOf(entry)
					if (idx !== -1) {
						queue.splice(idx, 1)
						entry.rejected = true
						reject(signal.reason)
					}
				}, { once: true })
			})
		},
		release() {
			while (queue.length > 0) {
				const entry = queue.shift()!
				if (!entry.rejected) { entry.resolve(); return }
			}
			active--
		},
	}
}
