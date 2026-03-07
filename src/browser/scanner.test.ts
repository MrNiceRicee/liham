import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { chmod, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { type FileEntry, scanDirectory } from './scanner.ts'

// -- test fixtures --

const TEST_DIR = join(tmpdir(), `liham-scanner-test-${Date.now()}`)

beforeAll(async () => {
	// create test directory tree:
	// root/
	//   README.md
	//   notes.md
	//   other.txt
	//   docs/
	//     api.md
	//     guide.md
	//   deep/
	//     level1/
	//       level2/
	//         level3/
	//           deep.md
	//         mid.md
	//   node_modules/
	//     pkg/
	//       index.md
	//   .git/
	//     HEAD.md
	//   empty/

	const dirs = ['', 'docs', 'deep/level1/level2/level3', 'node_modules/pkg', '.git', 'empty']
	for (const d of dirs) {
		await mkdir(join(TEST_DIR, d), { recursive: true })
	}

	const files: Record<string, string> = {
		'README.md': '# readme',
		'notes.md': '# notes',
		'other.txt': 'not markdown',
		'docs/api.md': '# api',
		'docs/guide.md': '# guide',
		'deep/level1/level2/level3/deep.md': '# deep',
		'deep/level1/level2/mid.md': '# mid',
		'node_modules/pkg/index.md': '# should be excluded',
		'.git/HEAD.md': '# should be excluded',
	}
	for (const [path, content] of Object.entries(files)) {
		await writeFile(join(TEST_DIR, path), content)
	}
})

afterAll(async () => {
	await rm(TEST_DIR, { recursive: true, force: true })
})

// -- helpers --

function names(entries: FileEntry[]): string[] {
	return entries.map((e) => e.relativePath)
}

// -- tests --

describe('scanDirectory', () => {
	test('finds .md files in root and subdirectories', async () => {
		const entries = await scanDirectory(TEST_DIR)
		const paths = names(entries)
		expect(paths).toContain('README.md')
		expect(paths).toContain('notes.md')
		expect(paths).toContain('docs/api.md')
		expect(paths).toContain('docs/guide.md')
	})

	test('skips non-.md files', async () => {
		const entries = await scanDirectory(TEST_DIR)
		const paths = names(entries)
		expect(paths).not.toContain('other.txt')
	})

	test('excludes junk directories by default', async () => {
		const entries = await scanDirectory(TEST_DIR)
		const paths = names(entries)
		expect(paths).not.toContain('node_modules/pkg/index.md')
		expect(paths).not.toContain('.git/HEAD.md')
	})

	test('respects maxDepth limit', async () => {
		// depth 0 = root only
		const entries = await scanDirectory(TEST_DIR, { maxDepth: 0 })
		const paths = names(entries)
		expect(paths).toContain('README.md')
		expect(paths).toContain('notes.md')
		expect(paths).not.toContain('docs/api.md')
	})

	test('depth 3 includes deep nested files', async () => {
		const entries = await scanDirectory(TEST_DIR, { maxDepth: 4 })
		const paths = names(entries)
		expect(paths).toContain('deep/level1/level2/mid.md')
		expect(paths).toContain('deep/level1/level2/level3/deep.md')
	})

	test('default depth 3 limits deep nesting', async () => {
		const entries = await scanDirectory(TEST_DIR)
		const paths = names(entries)
		// depth 3 = root(0) → deep(1) → level1(2) → level2(3)
		expect(paths).toContain('deep/level1/level2/mid.md')
		// level3 is depth 4 — excluded at default depth 3
		expect(paths).not.toContain('deep/level1/level2/level3/deep.md')
	})

	test('respects maxFiles cap', async () => {
		const entries = await scanDirectory(TEST_DIR, { maxFiles: 2 })
		expect(entries.length).toBe(2)
	})

	test('allows custom excludeDirs', async () => {
		// only exclude .git, not node_modules
		const entries = await scanDirectory(TEST_DIR, { excludeDirs: ['.git'] })
		const paths = names(entries)
		expect(paths).toContain('node_modules/pkg/index.md')
		expect(paths).not.toContain('.git/HEAD.md')
	})

	test('handles empty directories', async () => {
		const entries = await scanDirectory(join(TEST_DIR, 'empty'))
		expect(entries).toEqual([])
	})

	test('handles non-existent root directory', async () => {
		const entries = await scanDirectory(join(TEST_DIR, 'nonexistent'))
		expect(entries).toEqual([])
	})

	test('sorts by directory then alphabetically', async () => {
		const entries = await scanDirectory(TEST_DIR)
		const paths = names(entries)

		// root files come first (empty directory string sorts first)
		const rootFiles = entries.filter((e) => e.directory === '')
		expect(rootFiles.map((e) => e.name)).toEqual(['notes.md', 'README.md'])

		// docs/ files sorted alphabetically
		const docsFiles = entries.filter((e) => e.directory === 'docs')
		expect(docsFiles.map((e) => e.name)).toEqual(['api.md', 'guide.md'])

		// root group comes before docs group
		const rootIdx = paths.indexOf('README.md')
		const docsIdx = paths.indexOf('docs/api.md')
		expect(rootIdx).toBeLessThan(docsIdx)
	})

	test('sets directory to empty string for root-level files', async () => {
		const entries = await scanDirectory(TEST_DIR)
		const readme = entries.find((e) => e.name === 'README.md')
		expect(readme?.directory).toBe('')
	})

	test('sets correct directory for nested files', async () => {
		const entries = await scanDirectory(TEST_DIR)
		const api = entries.find((e) => e.name === 'api.md')
		expect(api?.directory).toBe('docs')
	})

	test('handles permission errors gracefully', async () => {
		const restrictedDir = join(TEST_DIR, 'restricted')
		await mkdir(restrictedDir, { recursive: true })
		await writeFile(join(restrictedDir, 'secret.md'), '# secret')
		await chmod(restrictedDir, 0o000)

		try {
			// should not throw — just skip the unreadable dir
			const entries = await scanDirectory(TEST_DIR)
			const paths = names(entries)
			expect(paths).not.toContain('restricted/secret.md')
		} finally {
			await chmod(restrictedDir, 0o755)
			await rm(restrictedDir, { recursive: true })
		}
	})
})
