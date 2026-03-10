import { describe, expect, test } from 'bun:test'

import { extractError, safeKill, safeSendSignal } from './error.ts'

describe('safeKill', () => {
	test('calls kill with default SIGKILL', () => {
		let called = ''
		const proc = { kill: (s?: number | string) => { called = String(s) } }
		safeKill(proc)
		expect(called).toBe('SIGKILL')
	})

	test('calls kill with custom signal', () => {
		let called = ''
		const proc = { kill: (s?: number | string) => { called = String(s) } }
		safeKill(proc, 'SIGTERM')
		expect(called).toBe('SIGTERM')
	})

	test('does not throw when kill throws', () => {
		const proc = {
			kill: () => {
				throw new Error('already exited')
			},
		}
		expect(() => safeKill(proc)).not.toThrow()
	})
})

describe('safeSendSignal', () => {
	test('does not throw for invalid PID', () => {
		expect(() => safeSendSignal(-999999, 'SIGKILL')).not.toThrow()
	})
})

describe('extractError', () => {
	test('extracts message from Error', () => {
		expect(extractError(new Error('boom'), 'fallback')).toBe('boom')
	})

	test('returns fallback for string', () => {
		expect(extractError('not an error', 'fallback')).toBe('fallback')
	})

	test('returns fallback for null', () => {
		expect(extractError(null, 'fallback')).toBe('fallback')
	})

	test('returns fallback for undefined', () => {
		expect(extractError(undefined, 'fallback')).toBe('fallback')
	})

	test('returns fallback for number', () => {
		expect(extractError(42, 'fallback')).toBe('fallback')
	})
})
