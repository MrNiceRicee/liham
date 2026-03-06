// file watcher — monitors parent directory for changes to a specific file.
// ports the Go v1 fsnotify pattern to node:fs watch().

import { existsSync } from 'node:fs'
import { watch, type FSWatcher } from 'node:fs'
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
	const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS

	let debounceTimer: ReturnType<typeof setTimeout> | null = null
	let closed = false

	const fsWatcher: FSWatcher = watch(dir, (event, filename) => {
		if (closed) return
		if (filename == null) return
		if (filename !== target) return
		if (isEditorTemp(filename)) return

		if (event === 'change') {
			// file contents modified — debounce then notify
			resetDebounce(absPath)
		} else if (event === 'rename') {
			// rename fires on create, delete, or rename.
			// check if file still exists to distinguish create from delete.
			if (existsSync(absPath)) {
				// file was recreated (atomic save) — treat as change
				resetDebounce(absPath)
			} else {
				// file was deleted or renamed away
				clearDebounce()
				options.onEvent({ type: 'delete', path: absPath })
			}
		}
	})

	fsWatcher.on('error', (err: Error) => {
		if (closed) return
		options.onEvent({ type: 'error', message: err.message })
	})

	function resetDebounce(path: string): void {
		clearDebounce()
		debounceTimer = setTimeout(() => {
			if (!closed) options.onEvent({ type: 'change', path })
		}, debounceMs)
	}

	function clearDebounce(): void {
		if (debounceTimer != null) {
			clearTimeout(debounceTimer)
			debounceTimer = null
		}
	}

	return {
		close() {
			if (closed) return
			closed = true
			clearDebounce()
			fsWatcher.close()
		},
	}
}
