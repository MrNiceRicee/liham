// ffplay audio backend — wraps existing ffplay.ts functions as AudioBackend.
// no clock sync (getTimePos returns null), no volume control.

import { killActiveAudio, playAudio, type PlayResult } from './ffplay.ts'
import type { AudioBackend } from './audio-backend.ts'

export function createFfplayBackend(): AudioBackend {
	let currentAbsPath: string | null = null
	let currentBasePath: string | null = null
	let currentSeekOffset = 0
	const endHandlers: Array<() => void> = []

	return {
		kind: 'ffplay' as const,

		async play(filePath: string, basePath: string, seekOffset = 0): Promise<PlayResult> {
			currentAbsPath = filePath
			currentBasePath = basePath
			currentSeekOffset = seekOffset
			return playAudio(filePath, basePath, seekOffset)
		},

		pause(): void {
			// kill audio — SIGSTOP leaves OS audio buffers playing
			void killActiveAudio()
		},

		async resume(): Promise<void> {
			// restart audio at last known position
			if (currentAbsPath != null && currentBasePath != null) {
				await playAudio(currentAbsPath, currentBasePath, currentSeekOffset)
			}
		},

		seek(_positionSec: number): void {
			// ffplay can't seek — handled by stream effect restart
		},

		kill(): void {
			void killActiveAudio()
		},

		getTimePos(): number | null {
			// ffplay has no clock — return null
			return null
		},

		setVolume(_percent: number): void {
			// no-op — ffplay has no volume control
		},

		setMuted(_muted: boolean): void {
			// no-op — ffplay has no mute control
		},

		onEnd(handler: () => void): void {
			endHandlers.push(handler)
		},

		onError(_handler: (err: Error) => void): void {
			// ffplay errors are non-recoverable, no event system
		},
	}
}
