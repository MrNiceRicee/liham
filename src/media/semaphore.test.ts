import { describe, expect, test } from 'bun:test'

import { createSemaphore } from './semaphore.ts'

describe('createSemaphore', () => {
	test('allows up to max concurrent acquisitions', async () => {
		const sem = createSemaphore(2)
		await sem.acquire()
		await sem.acquire()
		// both acquired without blocking
	})

	test('blocks beyond max and resumes on release', async () => {
		const sem = createSemaphore(1)
		await sem.acquire()

		let resolved = false
		const waiting = sem.acquire().then(() => { resolved = true })

		// yield — should still be blocked
		await new Promise((r) => setTimeout(r, 10))
		expect(resolved).toBe(false)

		sem.release()
		await waiting
		expect(resolved).toBe(true)
	})

	test('abort removes waiter from queue (no slot leak)', async () => {
		const sem = createSemaphore(1)
		await sem.acquire()

		const controller = new AbortController()
		let rejected = false
		const waiting = sem.acquire(controller.signal).catch(() => { rejected = true })

		controller.abort(new Error('unmounted'))
		await waiting
		expect(rejected).toBe(true)

		// slot should not be consumed — another acquire should work after release
		sem.release()
		await sem.acquire()
	})

	test('release drains queue in order', async () => {
		const sem = createSemaphore(1)
		await sem.acquire()

		const order: number[] = []
		const p1 = sem.acquire().then(() => order.push(1))
		const p2 = sem.acquire().then(() => order.push(2))

		sem.release()
		await p1
		sem.release()
		await p2

		expect(order).toEqual([1, 2])
	})
})
