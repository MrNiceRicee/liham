// ffplay detection, path sanitization, and video/audio playback.

import { realpathSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

// -- detection --

export function isFfplayAvailable(): boolean {
	return Bun.which('ffplay') != null
}

export function isFfmpegAvailable(): boolean {
	return Bun.which('ffmpeg') != null
}

// -- path sanitization --

export interface SanitizeResult {
	ok: boolean
	path?: string
	error?: string
}

export function sanitizeMediaPath(rawPath: string, basePath: string): SanitizeResult {
	// reject empty
	if (rawPath.length === 0) return { ok: false, error: 'empty path' }

	// reject flag injection (paths starting with -)
	if (rawPath.startsWith('-')) return { ok: false, error: 'path starts with dash' }

	// local files only — reject URLs entirely (eliminates SSRF)
	if (/^[a-z]+:\/\//i.test(rawPath)) return { ok: false, error: 'remote URLs not allowed' }

	// resolve relative to basePath
	const resolved = resolve(basePath, rawPath)

	// verify file exists
	try {
		const s = statSync(resolved)
		if (!s.isFile()) return { ok: false, error: 'not a file' }
	} catch {
		return { ok: false, error: 'file not found' }
	}

	// resolve symlinks and verify real path
	let real: string
	try {
		real = realpathSync(resolved)
	} catch {
		return { ok: false, error: 'cannot resolve path' }
	}

	return { ok: true, path: real }
}

// -- types --

export type PlayResult = { ok: true } | { ok: false; error: string }

// -- audio playback --

let activeAudioProc: ReturnType<typeof Bun.spawn> | null = null
let audioStopped = false

export function pauseActiveAudio(): void {
	if (activeAudioProc != null && !audioStopped) {
		activeAudioProc.kill('SIGSTOP')
		audioStopped = true
	}
}

export function resumeActiveAudio(): void {
	if (activeAudioProc != null && audioStopped) {
		activeAudioProc.kill('SIGCONT')
		audioStopped = false
	}
}

export async function killActiveAudio(): Promise<void> {
	if (activeAudioProc == null) return
	const proc = activeAudioProc
	activeAudioProc = null
	// must resume stopped process before SIGTERM
	if (audioStopped) {
		proc.kill('SIGCONT')
		audioStopped = false
	}
	proc.kill('SIGTERM')
	await Promise.race([proc.exited, new Promise((r) => setTimeout(r, 500))])
	// escalate if still running
	try {
		proc.kill('SIGKILL')
	} catch {
		// already exited
	}
}

export async function playAudio(
	mediaPath: string,
	basePath: string,
	seekOffset = 0,
): Promise<PlayResult> {
	if (!isFfplayAvailable()) {
		return { ok: false, error: 'ffplay not found' }
	}

	const sanitized = sanitizeMediaPath(mediaPath, basePath)
	if (!sanitized.ok) {
		return { ok: false, error: sanitized.error ?? 'invalid path' }
	}

	// kill any existing audio before starting new
	await killActiveAudio()

	const filePath = sanitized.path!

	try {
		const args = ['ffplay', '-nodisp', '-vn', '-autoexit']
		if (seekOffset > 0) args.push('-ss', String(seekOffset))
		args.push(filePath)
		activeAudioProc = Bun.spawn(args, {
			stdin: 'ignore',
			stdout: 'ignore',
			stderr: 'ignore',
		})

		// clean up reference when process exits
		const proc = activeAudioProc
		void proc.exited.then(() => {
			if (activeAudioProc === proc) activeAudioProc = null
		})

		return { ok: true }
	} catch (err) {
		activeAudioProc = null
		const message = err instanceof Error ? err.message : 'ffplay spawn failed'
		return { ok: false, error: message }
	}
}

// kill audio on process exit — prevents orphaned ffplay
process.on('exit', () => {
	if (activeAudioProc != null) {
		try {
			activeAudioProc.kill('SIGKILL')
		} catch {
			// ignore
		}
	}
})
