// file watcher — monitors parent directory for changes to a specific file.
// ports the Go v1 fsnotify pattern to node:fs watch().

import { existsSync, type FSWatcher, statSync, watch } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'

export type WatcherEvent =
	| { type: 'change'; path: string }
	| { type: 'delete'; path: string }
	| { type: 'error'; message: string }

export interface WatcherOptions {
	onEvent: (event: WatcherEvent) => void
	debounceMs?: number
}

export interface FileWatcher {
	close(): void
}

const DEFAULT_DEBOUNCE_MS = 80
const DEFAULT_DIR_DEBOUNCE_MS = 300

// directory prefixes to ignore in recursive directory watcher
const EXCLUDED_DIR_PREFIXES = new Set([
	'.git',
	'.hg',
	'.svn',
	'node_modules',
	'.next',
	'dist',
	'build',
	'vendor',
	'target',
	'__pycache__',
	'.venv',
	'coverage',
])

// shared debounce helper — avoids duplicate clearDebounce functions
export function createDebouncer(delayMs: number) {
	let timer: ReturnType<typeof setTimeout> | null = null

	return {
		schedule(fn: () => void) {
			this.cancel()
			timer = setTimeout(fn, delayMs)
		},
		cancel() {
			if (timer != null) {
				clearTimeout(timer)
				timer = null
			}
		},
	}
}

// editor temp file detection — filters spurious events from atomic saves
export function isEditorTemp(name: string): boolean {
	const base = basename(name)

	// vim: test file, backup, swap
	if (base === '4913') return true
	if (base.endsWith('~')) return true
	if (base.endsWith('.swp')) return true
	if (base.endsWith('.swx')) return true

	// jetbrains: temp + old markers
	if (base.includes('___jb_tmp___')) return true
	if (base.includes('___jb_old___')) return true

	// emacs: auto-save (#file#) and lock files (.#file)
	if (base.startsWith('#') && base.endsWith('#')) return true
	if (base.startsWith('.#')) return true

	return false
}

// watches a file by monitoring its parent directory.
// parent-dir watching is required for atomic save compatibility (vim, emacs, vscode).
export function createFileWatcher(filePath: string, options: WatcherOptions): FileWatcher {
	const absPath = resolve(filePath)
	const dir = dirname(absPath)
	const target = basename(absPath)
	const debounce = createDebouncer(options.debounceMs ?? DEFAULT_DEBOUNCE_MS)

	let closed = false

	const fsWatcher: FSWatcher = watch(dir, (event, filename) => {
		if (closed) return
		if (filename == null) return
		if (filename !== target) return
		if (isEditorTemp(filename)) return

		if (event === 'change') {
			// file contents modified — debounce then notify
			debounce.schedule(() => {
				if (!closed) options.onEvent({ type: 'change', path: absPath })
			})
		} else if (event === 'rename') {
			// rename fires on create, delete, or rename.
			// check if file still exists to distinguish create from delete.
			if (existsSync(absPath)) {
				// file was recreated (atomic save) — treat as change
				debounce.schedule(() => {
					if (!closed) options.onEvent({ type: 'change', path: absPath })
				})
			} else {
				// file was deleted or renamed away
				debounce.cancel()
				options.onEvent({ type: 'delete', path: absPath })
			}
		}
	})

	fsWatcher.on('error', (err: Error) => {
		if (closed) return
		options.onEvent({ type: 'error', message: err.message })
	})

	return {
		close() {
			if (closed) return
			closed = true
			debounce.cancel()
			fsWatcher.close()
		},
	}
}

// -- directory watcher --

export interface DirectoryWatcherOptions {
	onEvent: () => void
	debounceMs?: number
}

export interface DirectoryWatcher {
	close(): void
}

// checks if a filename starts with an excluded directory prefix
function isExcludedPath(filename: string): boolean {
	const first = filename.split('/')[0] ?? filename
	return EXCLUDED_DIR_PREFIXES.has(first)
}

// watches a directory recursively for any filesystem changes.
// fires a single onEvent callback (no event type) — the consumer rescans.
export function createDirectoryWatcher(
	dirPath: string,
	options: DirectoryWatcherOptions,
): DirectoryWatcher {
	const absDir = resolve(dirPath)

	// verify directory exists before starting watcher
	const s = statSync(absDir)
	if (!s.isDirectory()) {
		throw new Error(`not a directory: ${absDir}`)
	}

	const debounce = createDebouncer(options.debounceMs ?? DEFAULT_DIR_DEBOUNCE_MS)
	let closed = false

	const fsWatcher: FSWatcher = watch(absDir, { recursive: true }, (_event, filename) => {
		if (closed) return
		if (filename == null || filename === '') return
		if (isEditorTemp(filename)) return
		if (isExcludedPath(filename)) return

		debounce.schedule(() => {
			if (!closed) options.onEvent()
		})
	})

	fsWatcher.on('error', () => {
		// silently ignore — degrade to static mode
	})

	return {
		close() {
			if (closed) return
			closed = true
			debounce.cancel()
			fsWatcher.close()
		},
	}
}
