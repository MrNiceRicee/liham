// tests for audio backend abstraction and detection.

import { describe, expect, test } from 'bun:test'

import { detectAudioBackend, type AudioBackend } from './audio-backend.ts'
import { createFfplayBackend } from './ffplay-backend.ts'

describe('detectAudioBackend', () => {
	test('returns mpv or ffplay based on system availability', () => {
		const result = detectAudioBackend()
		expect(['mpv', 'ffplay']).toContain(result)
	})
})

describe('FfplayBackend', () => {
	test('satisfies AudioBackend interface', () => {
		const backend: AudioBackend = createFfplayBackend()
		expect(backend.kind).toBe('ffplay')
	})

	test('getTimePos always returns null', () => {
		const backend = createFfplayBackend()
		expect(backend.getTimePos()).toBeNull()
	})

	test('setVolume is no-op', () => {
		const backend = createFfplayBackend()
		// should not throw
		backend.setVolume(50)
		backend.setMuted(true)
	})

	test('seek is no-op', () => {
		const backend = createFfplayBackend()
		// should not throw
		backend.seek(10)
	})

	test('kill does not throw when no audio is playing', () => {
		const backend = createFfplayBackend()
		expect(() => backend.kill()).not.toThrow()
	})
})
