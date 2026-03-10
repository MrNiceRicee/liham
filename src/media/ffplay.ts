// ffplay detection, path sanitization, and video/audio playback.

import { realpathSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

import { extractError, safeKill } from '../utils/error.ts'

const debug =
	process.env['LIHAM_DEBUG'] === '1'
		? (msg: string) => process.stderr.write(`[ffplay] ${msg}\n`)
		: () => {}

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
let pendingKill: Promise<void> | null = null

export async function killActiveAudio(): Promise<void> {
	// wait for any in-flight kill to finish first (prevents overlapping processes)
	if (pendingKill != null) await pendingKill

	if (activeAudioProc == null) return
	const proc = activeAudioProc
	activeAudioProc = null
	debug(`killActiveAudio: SIGKILL pid=${String(proc.pid)}`)
	safeKill(proc)
	pendingKill = proc.exited.then(() => {
		pendingKill = null
	})
	await pendingKill
}

export async function playAudio(
	mediaPath: string,
	basePath: string,
	seekOffset = 0,
): Promise<PlayResult> {
	if (!isFfplayAvailable()) {
		return { ok: false, error: 'ffplay not found' }
	}

	// validate seekOffset
	if (!Number.isFinite(seekOffset) || seekOffset < 0) {
		return { ok: false, error: 'invalid seek offset' }
	}

	const sanitized = sanitizeMediaPath(mediaPath, basePath)
	if (!sanitized.ok) {
		return { ok: false, error: sanitized.error ?? 'invalid path' }
	}

	// kill any existing audio before starting new
	await killActiveAudio()

	const filePath = sanitized.path!

	try {
		const args = [
			'ffplay',
			'-nodisp',
			'-vn',
			'-autoexit',
			'-fflags',
			'+nobuffer',
			'-analyzeduration',
			'0',
		]
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
			if (activeAudioProc === proc) {
				activeAudioProc = null
			}
		})

		return { ok: true }
	} catch (err) {
		activeAudioProc = null
		return { ok: false, error: extractError(err, 'ffplay spawn failed') }
	}
}

// kill audio on process exit — prevents orphaned ffplay
process.on('exit', () => {
	if (activeAudioProc != null) safeKill(activeAudioProc)
})
