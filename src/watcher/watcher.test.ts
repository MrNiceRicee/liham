import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdir, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
	createDirectoryWatcher,
	createFileWatcher,
	isEditorTemp,
	type WatcherEvent,
} from './watcher.ts'

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

// -- createDirectoryWatcher integration tests --

describe('createDirectoryWatcher', () => {
	const DIR_TEST_DIR = join(tmpdir(), `liham-dirwatch-test-${Date.now()}`)

	beforeAll(async () => {
		await mkdir(DIR_TEST_DIR, { recursive: true })
	})

	afterAll(async () => {
		await rm(DIR_TEST_DIR, { recursive: true, force: true })
	})

	test('fires event on .md file creation', async () => {
		let eventCount = 0
		const watcher = createDirectoryWatcher(DIR_TEST_DIR, {
			onEvent: () => {
				eventCount++
			},
			debounceMs: 50,
		})

		try {
			await Bun.sleep(50)
			await writeFile(join(DIR_TEST_DIR, 'new.md'), '# new')
			await Bun.sleep(200)

			expect(eventCount).toBeGreaterThanOrEqual(1)
		} finally {
			watcher.close()
			await rm(join(DIR_TEST_DIR, 'new.md'), { force: true })
		}
	})

	test('fires event on file deletion', async () => {
		const deletable = join(DIR_TEST_DIR, 'deletable.md')
		await writeFile(deletable, '# will be deleted')

		let eventCount = 0
		const watcher = createDirectoryWatcher(DIR_TEST_DIR, {
			onEvent: () => {
				eventCount++
			},
			debounceMs: 50,
		})

		try {
			await Bun.sleep(50)
			await unlink(deletable)
			await Bun.sleep(200)

			expect(eventCount).toBeGreaterThanOrEqual(1)
		} finally {
			watcher.close()
		}
	})

	test('fires event on non-.md file creation (rescan filters by extension)', async () => {
		let eventCount = 0
		const watcher = createDirectoryWatcher(DIR_TEST_DIR, {
			onEvent: () => {
				eventCount++
			},
			debounceMs: 50,
		})

		try {
			await Bun.sleep(50)
			await writeFile(join(DIR_TEST_DIR, 'readme.txt'), 'hello')
			await Bun.sleep(200)

			expect(eventCount).toBeGreaterThanOrEqual(1)
		} finally {
			watcher.close()
			await rm(join(DIR_TEST_DIR, 'readme.txt'), { force: true })
		}
	})

	test('does not fire for editor temp files', async () => {
		// use a fresh subdirectory to isolate from prior test cleanup events
		const tempDir = join(DIR_TEST_DIR, 'temp-test')
		await mkdir(tempDir, { recursive: true })

		let eventCount = 0
		const watcher = createDirectoryWatcher(tempDir, {
			onEvent: () => {
				eventCount++
			},
			debounceMs: 50,
		})

		try {
			await Bun.sleep(100)
			await writeFile(join(tempDir, '4913'), '')
			await writeFile(join(tempDir, 'file.md~'), '')
			await Bun.sleep(200)

			expect(eventCount).toBe(0)
		} finally {
			watcher.close()
			await rm(tempDir, { recursive: true, force: true })
		}
	})

	test('debounce coalesces rapid events into single callback', async () => {
		let eventCount = 0
		const watcher = createDirectoryWatcher(DIR_TEST_DIR, {
			onEvent: () => {
				eventCount++
			},
			debounceMs: 100,
		})

		try {
			await Bun.sleep(50)
			await writeFile(join(DIR_TEST_DIR, 'a.md'), '# a')
			await Bun.sleep(10)
			await writeFile(join(DIR_TEST_DIR, 'b.md'), '# b')
			await Bun.sleep(10)
			await writeFile(join(DIR_TEST_DIR, 'c.md'), '# c')
			await Bun.sleep(250)

			expect(eventCount).toBe(1)
		} finally {
			watcher.close()
			await rm(join(DIR_TEST_DIR, 'a.md'), { force: true })
			await rm(join(DIR_TEST_DIR, 'b.md'), { force: true })
			await rm(join(DIR_TEST_DIR, 'c.md'), { force: true })
		}
	})

	test('close() stops further events', async () => {
		let eventCount = 0
		const watcher = createDirectoryWatcher(DIR_TEST_DIR, {
			onEvent: () => {
				eventCount++
			},
			debounceMs: 50,
		})

		await Bun.sleep(50)
		watcher.close()

		await writeFile(join(DIR_TEST_DIR, 'after-close.md'), '# nope')
		await Bun.sleep(200)

		expect(eventCount).toBe(0)
		await rm(join(DIR_TEST_DIR, 'after-close.md'), { force: true })
	})

	test('throws on non-existent directory', () => {
		const bogusDir = join(tmpdir(), 'liham-nonexistent-dir-xyz')
		expect(() => {
			createDirectoryWatcher(bogusDir, {
				onEvent: () => {},
			})
		}).toThrow()
	})
})
