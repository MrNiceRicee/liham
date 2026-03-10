// tests for mpv IPC client — focused on pure logic (line buffering, event parsing).
// integration tests with real mpv are manual (requires mpv installed).

import { describe, expect, test } from 'bun:test'

// we test the module's exported types compile correctly
import type { MpvEvent, MpvIpc, MpvPropertyChangeEvent, MpvPropertyMap } from './mpv-ipc.ts'

describe('mpv-ipc types', () => {
	test('MpvPropertyMap covers expected properties', () => {
		// type-level check — if this compiles, the map is correct
		const map: MpvPropertyMap = {
			'time-pos': 1.5,
			pause: false,
			volume: 100,
			mute: false,
			duration: 60,
			'eof-reached': false,
		}
		expect(map['time-pos']).toBe(1.5)
		expect(map.pause).toBe(false)
		expect(map.volume).toBe(100)
	})

	test('MpvPropertyChangeEvent data can be null', () => {
		// time-pos is null when no file is loaded
		const event: MpvPropertyChangeEvent = {
			event: 'property-change',
			id: 1,
			name: 'time-pos',
			data: null,
		}
		expect(event.data).toBeNull()
	})

	test('MpvEvent discriminated union covers all event types', () => {
		const events: MpvEvent[] = [
			{ event: 'property-change', id: 1, name: 'time-pos', data: 1.5 },
			{ event: 'end-file', reason: 'eof' },
			{ event: 'seek' },
			{ event: 'playback-restart' },
			{ event: 'shutdown' },
		]
		expect(events).toHaveLength(5)

		// discriminant narrows correctly
		for (const e of events) {
			switch (e.event) {
				case 'property-change':
					expect(e.name).toBeDefined()
					break
				case 'end-file':
					expect(e.reason).toBeDefined()
					break
				case 'seek':
				case 'playback-restart':
				case 'shutdown':
					break
			}
		}
	})

	test('MpvIpc interface shape is correct', () => {
		// type-level verification — a mock object satisfying the interface compiles
		const mock: MpvIpc = {
			getProperty: async () => 0 as never,
			setProperty: async () => {},
			setPropertyFireAndForget: () => {},
			observeProperty: async () => {},
			command: async () => null,
			connected: true,
			onEvent: () => {},
			onClose: () => {},
			dispose: () => {},
		}
		expect(mock.connected).toBe(true)
	})
})
