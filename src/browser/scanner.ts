// directory scanner — recursively finds .md files with depth/count limits.

import type { Dirent } from 'node:fs'

import { lstat, readdir } from 'node:fs/promises'
import { dirname, extname, join, relative } from 'node:path'

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

function isMarkdownFile(name: string): boolean {
	return extname(name).toLowerCase() === '.md'
}

// check if a symlink points to a file (not a directory) — skip broken links
async function isSymlinkToFile(path: string): Promise<boolean> {
	try {
		const stat = await lstat(path)
		return !stat.isDirectory()
	} catch {
		return false
	}
}

function toFileEntry(root: string, fullPath: string, name: string): FileEntry {
	const relPath = relative(root, fullPath)
	const relDir = relative(root, dirname(fullPath))
	return {
		name,
		relativePath: relPath,
		absolutePath: fullPath,
		directory: relDir === '.' ? '' : relDir,
	}
}

async function processEntry(
	entry: Dirent,
	dir: string,
	root: string,
	depth: number,
	ctx: {
		entries: FileEntry[]
		maxFiles: number
		maxDepth: number
		excludeDirs: Set<string>
		walk: (d: string, depth: number) => Promise<void>
	},
): Promise<void> {
	const name = String(entry.name)
	if (hasControlChars(name)) return

	const fullPath = join(dir, name)

	if (entry.isDirectory()) {
		if (!ctx.excludeDirs.has(name)) await ctx.walk(fullPath, depth + 1)
		return
	}

	if (!entry.isFile() && !entry.isSymbolicLink()) return
	if (entry.isSymbolicLink() && !(await isSymlinkToFile(fullPath))) return
	if (!isMarkdownFile(name)) return

	ctx.entries.push(toFileEntry(root, fullPath, name))
}

export async function scanDirectory(root: string, options?: ScanOptions): Promise<FileEntry[]> {
	const maxDepth = options?.maxDepth ?? DEFAULT_MAX_DEPTH
	const maxFiles = options?.maxFiles ?? DEFAULT_MAX_FILES
	const excludeDirs = options?.excludeDirs ? new Set(options.excludeDirs) : DEFAULT_EXCLUDE_DIRS

	const entries: FileEntry[] = []

	async function walk(dir: string, depth: number): Promise<void> {
		if (depth > maxDepth || entries.length >= maxFiles) return

		let dirEntries: Dirent[]
		try {
			dirEntries = await readdir(dir, { withFileTypes: true })
		} catch {
			return
		}

		const ctx = { entries, maxFiles, maxDepth, excludeDirs, walk }
		for (const entry of dirEntries) {
			if (entries.length >= maxFiles) return
			await processEntry(entry, dir, root, depth, ctx)
		}
	}

	await walk(root, 0)

	entries.sort((a, b) => {
		if (a.directory !== b.directory) return a.directory.localeCompare(b.directory)
		return a.name.localeCompare(b.name)
	})

	return entries
}
