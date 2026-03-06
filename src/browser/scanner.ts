// directory scanner — recursively finds .md files with depth/count limits.

import { readdir, lstat } from 'node:fs/promises'
import { join, relative, dirname, extname } from 'node:path'

export interface FileEntry {
	name: string
	relativePath: string
	absolutePath: string
	directory: string // relative dir from scan root ('' for root)
}

export interface ScanOptions {
	maxDepth?: number
	maxFiles?: number
	excludeDirs?: string[]
}

const DEFAULT_MAX_DEPTH = 3
const DEFAULT_MAX_FILES = 1000
const DEFAULT_EXCLUDE_DIRS = new Set([
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

// C0 control chars (excluding tab, newline, carriage return) + C1 range
// eslint-disable-next-line no-control-regex -- intentional: detecting unsafe filenames
const CONTROL_CHARS = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/

function hasControlChars(name: string): boolean {
	return CONTROL_CHARS.test(name)
}

export async function scanDirectory(
	root: string,
	options?: ScanOptions,
): Promise<FileEntry[]> {
	const maxDepth = options?.maxDepth ?? DEFAULT_MAX_DEPTH
	const maxFiles = options?.maxFiles ?? DEFAULT_MAX_FILES
	const excludeDirs = options?.excludeDirs
		? new Set(options.excludeDirs)
		: DEFAULT_EXCLUDE_DIRS

	const entries: FileEntry[] = []

	async function walk(dir: string, depth: number): Promise<void> {
		if (depth > maxDepth || entries.length >= maxFiles) return

		let dirEntries: import('node:fs').Dirent[]
		try {
			dirEntries = await readdir(dir, { withFileTypes: true }) as import('node:fs').Dirent[]
		} catch {
			// skip unreadable directories (EACCES, EPERM, ENOENT)
			return
		}

		for (const entry of dirEntries) {
			if (entries.length >= maxFiles) return

			const name = String(entry.name)
			if (hasControlChars(name)) continue

			const fullPath = join(dir, name)

			if (entry.isDirectory()) {
				if (excludeDirs.has(name)) continue
				await walk(fullPath, depth + 1)
			} else if (entry.isFile() || entry.isSymbolicLink()) {
				// check symlinks point to files, not dirs (don't follow symlink dirs)
				if (entry.isSymbolicLink()) {
					try {
						const stat = await lstat(fullPath)
						if (stat.isDirectory()) continue
					} catch {
						continue
					}
				}

				if (extname(name).toLowerCase() !== '.md') continue

				const relPath = relative(root, fullPath)
				const relDir = relative(root, dirname(fullPath))

				entries.push({
					name,
					relativePath: relPath,
					absolutePath: fullPath,
					directory: relDir === '.' ? '' : relDir,
				})
			}
		}
	}

	await walk(root, 0)

	// sort: group by directory, then alphabetical within each group
	entries.sort((a, b) => {
		if (a.directory !== b.directory) return a.directory.localeCompare(b.directory)
		return a.name.localeCompare(b.name)
	})

	return entries
}
