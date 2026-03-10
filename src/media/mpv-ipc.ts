// mpv IPC client — low-level transport over Unix domain socket.
// spawns mpv in idle mode, connects via JSON IPC, correlates request/response
// via request_id, dispatches events, and provides synchronous cleanup.

import { mkdtempSync, readdirSync, rmSync, unlinkSync } from 'node:fs'
import { createConnection, type Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const debug =
	process.env['LIHAM_DEBUG'] === '1'
		? (msg: string) => process.stderr.write(`[mpv-ipc] ${msg}\n`)
		: () => {}

// -- types --

export interface MpvPropertyMap {
	'time-pos': number
	pause: boolean
	volume: number
	mute: boolean
	duration: number
	'eof-reached': boolean
}

export type MpvPropertyChangeEvent = {
	event: 'property-change'
	id: number
	name: keyof MpvPropertyMap
	data: MpvPropertyMap[keyof MpvPropertyMap] | null
}

export type MpvEvent =
	| MpvPropertyChangeEvent
	| { event: 'end-file'; reason: string }
	| { event: 'seek' }
	| { event: 'playback-restart' }
	| { event: 'shutdown' }

export interface MpvIpc {
	getProperty<K extends keyof MpvPropertyMap>(name: K): Promise<MpvPropertyMap[K]>
	setProperty<K extends keyof MpvPropertyMap>(
		name: K,
		value: MpvPropertyMap[K],
	): Promise<void>
	setPropertyFireAndForget<K extends keyof MpvPropertyMap>(
		name: K,
		value: MpvPropertyMap[K],
	): void
	observeProperty<K extends keyof MpvPropertyMap>(id: number, name: K): Promise<void>
	command(args: readonly [string, ...unknown[]]): Promise<unknown>
	readonly connected: boolean
	onEvent(handler: (event: MpvEvent) => void): void
	onClose(handler: () => void): void
	dispose(): void
}

export interface MpvIpcOptions {
	socketDir?: string
	timeoutMs?: number
}

// -- module-level cleanup --

let activeMpvProc: ReturnType<typeof Bun.spawn> | null = null
let activeSocketDir: string | null = null
let socketCounter = 0

process.on('exit', () => {
	if (activeMpvProc != null) {
		try {
			activeMpvProc.kill('SIGKILL')
		} catch {
			// already dead
		}
	}
	if (activeSocketDir != null) {
		try {
			rmSync(activeSocketDir, { recursive: true })
		} catch {
			// ignore
		}
	}
})

// -- stale socket cleanup --

export function cleanupStaleSockets(): void {
	try {
		const tmp = tmpdir()
		for (const entry of readdirSync(tmp)) {
			if (!entry.startsWith('liham-')) continue
			const dirPath = join(tmp, entry)
			// skip our own active socket dir
			if (dirPath === activeSocketDir) continue
			try {
				rmSync(dirPath, { recursive: true })
				debug(`cleaned stale socket dir: ${dirPath}`)
			} catch {
				// may be in use by another liham instance
			}
		}
	} catch {
		// tmpdir read failed, non-critical
	}
}

// -- helpers --

function isErrnoException(err: unknown): err is NodeJS.ErrnoException {
	return err instanceof Error && 'code' in err
}

function connectToSocket(path: string): Promise<Socket> {
	return new Promise((resolve, reject) => {
		const sock = createConnection({ path }, () => {
			resolve(sock)
		})
		sock.once('error', reject)
	})
}

async function waitForSocket(path: string, timeoutMs: number): Promise<Socket> {
	const start = performance.now()
	while (performance.now() - start < timeoutMs) {
		try {
			return await connectToSocket(path)
		} catch (err: unknown) {
			if (!isErrnoException(err)) throw err
			if (err.code !== 'ENOENT' && err.code !== 'ECONNREFUSED') throw err
			await new Promise((r) => setTimeout(r, 20))
		}
	}
	throw new Error(`mpv socket not ready after ${String(timeoutMs)}ms`)
}

function isResponseMsg(msg: unknown): msg is { error: string; request_id: number; data: unknown } {
	if (typeof msg !== 'object' || msg === null) return false
	return 'error' in msg && 'request_id' in msg
}

function isEventMsg(msg: unknown): msg is { event: string; [key: string]: unknown } {
	if (typeof msg !== 'object' || msg === null) return false
	return 'event' in msg && !('request_id' in msg)
}

function parseEvent(raw: Record<string, unknown>): MpvEvent | null {
	const eventName = raw['event']
	if (typeof eventName !== 'string') return null

	switch (eventName) {
		case 'property-change':
			return {
				event: 'property-change',
				id: typeof raw['id'] === 'number' ? raw['id'] : 0,
				name: raw['name'] as keyof MpvPropertyMap,
				data: raw['data'] as MpvPropertyMap[keyof MpvPropertyMap] | null,
			}
		case 'end-file':
			return {
				event: 'end-file',
				reason: typeof raw['reason'] === 'string' ? raw['reason'] : 'unknown',
			}
		case 'seek':
			return { event: 'seek' }
		case 'playback-restart':
			return { event: 'playback-restart' }
		case 'shutdown':
			return { event: 'shutdown' }
		default:
			return null
	}
}

// -- factory --

export async function createMpvIpc(options: MpvIpcOptions = {}): Promise<MpvIpc> {
	const timeoutMs = options.timeoutMs ?? 5000

	// create private temp dir for socket
	const sockDir = options.socketDir ?? mkdtempSync(join(tmpdir(), 'liham-'))
	const socketPath = join(sockDir, `mpv-${String(++socketCounter)}.sock`)

	// macOS sun_path limit is 104 bytes
	if (socketPath.length > 103) {
		throw new Error(`socket path too long (${String(socketPath.length)} > 103): ${socketPath}`)
	}

	debug(`spawning mpv, socket: ${socketPath}`)

	// spawn mpv in idle mode
	const proc = Bun.spawn(
		[
			'mpv',
			'--idle',
			'--no-video',
			'--no-terminal',
			'--no-ytdl',
			`--input-ipc-server=${socketPath}`,
			'--really-quiet',
		],
		{ stdin: 'ignore', stdout: 'ignore', stderr: 'ignore' },
	)

	// update module-level references for exit cleanup
	activeMpvProc = proc
	activeSocketDir = sockDir

	// connect to socket with retry
	let socket: Socket
	try {
		socket = await waitForSocket(socketPath, timeoutMs)
	} catch (err) {
		// cleanup on connection failure
		try {
			proc.kill('SIGKILL')
		} catch {
			// already dead
		}
		try {
			rmSync(sockDir, { recursive: true })
		} catch {
			// ignore
		}
		activeMpvProc = null
		activeSocketDir = null
		throw err
	}

	debug('connected to mpv socket')

	// state
	let requestId = 0
	let isConnected = true
	const pending = new Map<number, PromiseWithResolvers<unknown>>()
	const eventHandlers: Array<(event: MpvEvent) => void> = []
	const closeHandlers: Array<() => void> = []
	let lineBuffer = ''

	// handle a single parsed message from mpv
	function handleMessage(msg: unknown) {
		if (typeof msg !== 'object' || msg === null) return

		if (isResponseMsg(msg)) {
			const resolver = pending.get(msg.request_id)
			if (resolver != null) {
				pending.delete(msg.request_id)
				if (msg.error === 'success') {
					resolver.resolve(msg.data)
				} else {
					resolver.reject(new Error(`mpv error: ${msg.error}`))
				}
			}
			return
		}

		if (isEventMsg(msg)) {
			const event = parseEvent(msg as Record<string, unknown>)
			if (event != null) {
				for (const handler of eventHandlers) handler(event)
			}
		}
	}

	// line-buffered JSON parser
	function processData(chunk: string) {
		lineBuffer += chunk
		let newlineIdx: number
		while ((newlineIdx = lineBuffer.indexOf('\n')) !== -1) {
			const line = lineBuffer.slice(0, newlineIdx)
			lineBuffer = lineBuffer.slice(newlineIdx + 1)
			if (line.length === 0) continue

			try {
				handleMessage(JSON.parse(line))
			} catch {
				debug(`invalid JSON: ${line}`)
			}
		}
	}

	socket.setEncoding('utf-8')
	socket.on('data', (data: string) => processData(data))
	socket.on('close', () => {
		debug('socket closed')
		isConnected = false
		// reject all pending requests
		for (const [, resolver] of pending) {
			resolver.reject(new Error('mpv socket closed'))
		}
		pending.clear()
		for (const handler of closeHandlers) {
			handler()
		}
	})

	// send a command and track response by request_id
	function sendCommand(args: readonly unknown[]): Promise<unknown> {
		const id = ++requestId
		const resolver = Promise.withResolvers<unknown>()
		pending.set(id, resolver)
		const payload = JSON.stringify({ command: args, request_id: id }) + '\n'
		socket.write(payload)
		return resolver.promise
	}

	// send without tracking (fire-and-forget)
	function sendFireAndForget(args: readonly unknown[]): void {
		if (!isConnected) return
		const payload = JSON.stringify({ command: args }) + '\n'
		socket.write(payload)
	}

	return {
		async getProperty<K extends keyof MpvPropertyMap>(name: K): Promise<MpvPropertyMap[K]> {
			const result = await sendCommand(['get_property', name])
			return result as MpvPropertyMap[K]
		},

		async setProperty<K extends keyof MpvPropertyMap>(
			name: K,
			value: MpvPropertyMap[K],
		): Promise<void> {
			await sendCommand(['set_property', name, value])
		},

		setPropertyFireAndForget<K extends keyof MpvPropertyMap>(
			name: K,
			value: MpvPropertyMap[K],
		): void {
			sendFireAndForget(['set_property', name, value])
		},

		async observeProperty<K extends keyof MpvPropertyMap>(
			id: number,
			name: K,
		): Promise<void> {
			await sendCommand(['observe_property', id, name])
		},

		async command(args: readonly [string, ...unknown[]]): Promise<unknown> {
			return sendCommand(args)
		},

		get connected() {
			return isConnected
		},

		onEvent(handler: (event: MpvEvent) => void): void {
			eventHandlers.push(handler)
		},

		onClose(handler: () => void): void {
			closeHandlers.push(handler)
		},

		dispose(): void {
			debug('dispose: cleaning up')
			isConnected = false

			// reject pending promises
			for (const [, resolver] of pending) {
				resolver.reject(new Error('mpv disposed'))
			}
			pending.clear()

			// destroy socket synchronously
			socket.destroy()

			// SIGKILL mpv — synchronous, no async quit command
			try {
				proc.kill('SIGKILL')
			} catch {
				// already dead
			}

			// unlink socket + remove dir
			try {
				unlinkSync(socketPath)
			} catch {
				// may already be gone
			}
			try {
				rmSync(sockDir, { recursive: true })
			} catch {
				// ignore
			}

			// clear module-level refs if this is the active instance
			if (activeMpvProc === proc) activeMpvProc = null
			if (activeSocketDir === sockDir) activeSocketDir = null
		},
	}
}
