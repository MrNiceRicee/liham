import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdir, rm, writeFile, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createFileWatcher, isEditorTemp, type WatcherEvent } from './watcher.ts'

// -- isEditorTemp tests --

describe('isEditorTemp', () => {
	// vim patterns
	test('detects vim test file (4913)', () => {
		expect(isEditorTemp('4913')).toBe(true)
	})

	test('detects vim backup files (*~)', () => {
		expect(isEditorTemp('file.md~')).toBe(true)
		expect(isEditorTemp('README~')).toBe(true)
	})

	test('detects vim swap files (.swp, .swx)', () => {
		expect(isEditorTemp('.file.md.swp')).toBe(true)
		expect(isEditorTemp('.file.md.swx')).toBe(true)
	})

	// jetbrains patterns
	test('detects jetbrains tmp files', () => {
		expect(isEditorTemp('file.md___jb_tmp___')).toBe(true)
	})

	test('detects jetbrains old files', () => {
		expect(isEditorTemp('file.md___jb_old___')).toBe(true)
	})

	// emacs patterns
	test('detects emacs auto-save files (#file#)', () => {
		expect(isEditorTemp('#file.md#')).toBe(true)
	})

	test('detects emacs lock files (.#file)', () => {
		expect(isEditorTemp('.#file.md')).toBe(true)
	})

	// normal files pass through
	test('allows normal markdown files', () => {
		expect(isEditorTemp('file.md')).toBe(false)
		expect(isEditorTemp('README.md')).toBe(false)
		expect(isEditorTemp('notes.txt')).toBe(false)
		expect(isEditorTemp('index.ts')).toBe(false)
	})

	test('allows dotfiles that are not editor temp', () => {
		expect(isEditorTemp('.gitignore')).toBe(false)
		expect(isEditorTemp('.env')).toBe(false)
	})

	// handles paths with directories
	test('extracts basename from paths', () => {
		expect(isEditorTemp('/home/user/docs/4913')).toBe(true)
		expect(isEditorTemp('/home/user/docs/file.md')).toBe(false)
	})
})

// -- createFileWatcher integration tests --

describe('createFileWatcher', () => {
	const TEST_DIR = join(tmpdir(), `liham-watcher-test-${Date.now()}`)
	const TEST_FILE = join(TEST_DIR, 'test.md')

	beforeAll(async () => {
		await mkdir(TEST_DIR, { recursive: true })
		await writeFile(TEST_FILE, '# initial content')
	})

	afterAll(async () => {
		await rm(TEST_DIR, { recursive: true, force: true })
	})

	test('fires change event on file write', async () => {
		const events: WatcherEvent[] = []
		const watcher = createFileWatcher(TEST_FILE, {
			onEvent: (e) => events.push(e),
			debounceMs: 30,
		})

		try {
			// small delay for watcher to initialize
			await Bun.sleep(50)
			await writeFile(TEST_FILE, '# modified content')
			// wait for debounce + processing
			await Bun.sleep(150)

			expect(events.length).toBeGreaterThanOrEqual(1)
			expect(events.some((e) => e.type === 'change')).toBe(true)
		} finally {
			watcher.close()
		}
	})

	test('fires delete event on file removal', async () => {
		const deletable = join(TEST_DIR, 'deletable.md')
		await writeFile(deletable, '# will be deleted')

		const events: WatcherEvent[] = []
		const watcher = createFileWatcher(deletable, {
			onEvent: (e) => events.push(e),
			debounceMs: 30,
		})

		try {
			await Bun.sleep(50)
			await unlink(deletable)
			await Bun.sleep(150)

			expect(events.some((e) => e.type === 'delete')).toBe(true)
		} finally {
			watcher.close()
		}
	})

	test('ignores events for other files in same directory', async () => {
		const events: WatcherEvent[] = []
		const watcher = createFileWatcher(TEST_FILE, {
			onEvent: (e) => events.push(e),
			debounceMs: 30,
		})

		try {
			await Bun.sleep(50)
			// write to a DIFFERENT file in the same directory
			await writeFile(join(TEST_DIR, 'other.md'), '# other file')
			await Bun.sleep(150)

			// should have no events for our watched file
			const changeEvents = events.filter((e) => e.type === 'change')
			expect(changeEvents.length).toBe(0)
		} finally {
			watcher.close()
			await rm(join(TEST_DIR, 'other.md'), { force: true })
		}
	})

	test('debounce coalesces rapid writes into single event', async () => {
		const events: WatcherEvent[] = []
		const watcher = createFileWatcher(TEST_FILE, {
			onEvent: (e) => events.push(e),
			debounceMs: 80,
		})

		try {
			await Bun.sleep(50)
			// rapid writes within debounce window
			await writeFile(TEST_FILE, '# write 1')
			await Bun.sleep(10)
			await writeFile(TEST_FILE, '# write 2')
			await Bun.sleep(10)
			await writeFile(TEST_FILE, '# write 3')
			// wait for debounce
			await Bun.sleep(200)

			const changeEvents = events.filter((e) => e.type === 'change')
			expect(changeEvents.length).toBe(1)
		} finally {
			watcher.close()
		}
	})

	test('close() stops further events', async () => {
		const events: WatcherEvent[] = []
		const watcher = createFileWatcher(TEST_FILE, {
			onEvent: (e) => events.push(e),
			debounceMs: 30,
		})

		await Bun.sleep(50)
		watcher.close()

		// write after close — should not fire events
		await writeFile(TEST_FILE, '# after close')
		await Bun.sleep(150)

		expect(events.length).toBe(0)
	})

	test('close() is idempotent', () => {
		const watcher = createFileWatcher(TEST_FILE, {
			onEvent: () => {},
			debounceMs: 30,
		})

		// should not throw
		watcher.close()
		watcher.close()
		watcher.close()
	})

	test('filters editor temp files in same directory', async () => {
		const events: WatcherEvent[] = []
		const watcher = createFileWatcher(TEST_FILE, {
			onEvent: (e) => events.push(e),
			debounceMs: 30,
		})

		try {
			await Bun.sleep(50)
			// write vim temp files — should be filtered
			await writeFile(join(TEST_DIR, '4913'), '')
			await writeFile(join(TEST_DIR, 'test.md~'), '')
			await Bun.sleep(150)

			// none of these should trigger events for our watched file
			// (they have different filenames anyway, but the filter is an extra guard)
			const changeEvents = events.filter((e) => e.type === 'change')
			expect(changeEvents.length).toBe(0)
		} finally {
			watcher.close()
			await rm(join(TEST_DIR, '4913'), { force: true })
			await rm(join(TEST_DIR, 'test.md~'), { force: true })
		}
	})
})
