// mpv audio backend — wraps MpvIpc with time-pos caching/interpolation,
// volume clamping, and sanitizeMediaPath integration.

import { sanitizeMediaPath } from './ffplay.ts'
import type { AudioBackend, PlayResult } from './audio-backend.ts'
import { createMpvIpc, type MpvIpc } from './mpv-ipc.ts'

const debug =
	process.env['LIHAM_DEBUG'] === '1'
		? (msg: string) => process.stderr.write(`[mpv-backend] ${msg}\n`)
		: () => {}

const TIME_POS_OBSERVE_ID = 1
const EOF_OBSERVE_ID = 2

export function createMpvBackend(): AudioBackend {
	let ipc: MpvIpc | null = null
	let cachedTimePos: number | null = null
	let cachedTimePosAt = 0
	let isPaused = false
	const endHandlers: Array<() => void> = []
	const errorHandlers: Array<(err: Error) => void> = []

	return {
		kind: 'mpv' as const,

		async play(filePath: string, basePath: string, seekOffset = 0): Promise<PlayResult> {
			const sanitized = sanitizeMediaPath(filePath, basePath)
			if (!sanitized.ok) {
				return { ok: false, error: sanitized.error ?? 'invalid path' }
			}

			try {
				// dispose previous ipc if any
				if (ipc != null) {
					ipc.dispose()
					ipc = null
				}

				ipc = await createMpvIpc()

				// set up event handlers
				ipc.onEvent((event) => {
					if (event.event === 'property-change' && event.name === 'time-pos') {
						if (typeof event.data === 'number') {
							cachedTimePos = event.data
							cachedTimePosAt = performance.now()
						} else {
							cachedTimePos = null
						}
					}
					if (event.event === 'property-change' && event.name === 'eof-reached') {
						if (event.data === true) {
							for (const handler of endHandlers) handler()
						}
					}
					if (event.event === 'end-file') {
						for (const handler of endHandlers) handler()
					}
				})

				ipc.onClose(() => {
					debug('mpv socket closed unexpectedly')
					cachedTimePos = null
					for (const handler of errorHandlers) {
						handler(new Error('mpv process exited unexpectedly'))
					}
				})

				// observe time-pos for clock sync
				await ipc.observeProperty(TIME_POS_OBSERVE_ID, 'time-pos')
				await ipc.observeProperty(EOF_OBSERVE_ID, 'eof-reached')

				// load file
				const loadArgs: [string, ...unknown[]] = ['loadfile', sanitized.path!]
				await ipc.command(loadArgs)

				// seek if needed
				if (seekOffset > 0) {
					await ipc.command(['seek', seekOffset, 'absolute'])
				}

				isPaused = false
				debug(`playing: ${sanitized.path!} at offset ${String(seekOffset)}`)
				return { ok: true }
			} catch (err) {
				const message = err instanceof Error ? err.message : 'mpv play failed'
				debug(`play error: ${message}`)
				return { ok: false, error: message }
			}
		},

		pause(): void {
			if (ipc == null || isPaused) return
			isPaused = true
			ipc.setPropertyFireAndForget('pause', true)
			debug('paused')
		},

		async resume(): Promise<void> {
			if (ipc == null || !isPaused) return
			isPaused = false
			ipc.setPropertyFireAndForget('pause', false)
			debug('resumed')
		},

		seek(positionSec: number): void {
			if (ipc == null) return
			// null cached time-pos immediately — timer holds current frame until fresh value arrives
			cachedTimePos = null
			isPaused = false
			// fire-and-forget seek
			void ipc.command(['seek', positionSec, 'absolute']).catch(() => {
				// ignore seek errors (e.g., seeking past end)
			})
			debug(`seek to ${String(positionSec)}s`)
		},

		kill(): void {
			if (ipc != null) {
				debug('killing mpv')
				ipc.dispose()
				ipc = null
			}
			cachedTimePos = null
		},

		getTimePos(): number | null {
			if (cachedTimePos === null) return null
			// interpolate for sub-frame accuracy at 60fps
			const elapsed = (performance.now() - cachedTimePosAt) / 1000
			return cachedTimePos + elapsed
		},

		setVolume(percent: number): void {
			if (ipc == null) return
			const clamped = Math.max(0, Math.min(100, percent))
			ipc.setPropertyFireAndForget('volume', clamped)
		},

		setMuted(muted: boolean): void {
			if (ipc == null) return
			ipc.setPropertyFireAndForget('mute', muted)
		},

		onEnd(handler: () => void): void {
			endHandlers.push(handler)
		},

		onError(handler: (err: Error) => void): void {
			errorHandlers.push(handler)
		},
	}
}
