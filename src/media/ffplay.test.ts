import { describe, expect, test } from 'bun:test'

import { isFfmpegAvailable, isFfplayAvailable, sanitizeMediaPath } from './ffplay.ts'

describe('isFfplayAvailable', () => {
	test('returns a boolean', () => {
		const result = isFfplayAvailable()
		expect(typeof result).toBe('boolean')
	})

	test('matches Bun.which result', () => {
		const expected = Bun.which('ffplay') != null
		expect(isFfplayAvailable()).toBe(expected)
	})
})

describe('isFfmpegAvailable', () => {
	test('returns a boolean', () => {
		const result = isFfmpegAvailable()
		expect(typeof result).toBe('boolean')
	})

	test('matches Bun.which result', () => {
		const expected = Bun.which('ffmpeg') != null
		expect(isFfmpegAvailable()).toBe(expected)
	})
})

describe('sanitizeMediaPath', () => {
	const base = `${import.meta.dir}/../../sandbox/assets`

	test('resolves valid local file', () => {
		const result = sanitizeMediaPath('fixture.txt', base)
		expect(result.ok).toBe(true)
		if (result.ok) expect(result.value).toContain('fixture.txt')
	})

	test('rejects empty path', () => {
		const result = sanitizeMediaPath('', base)
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.error).toBe('empty path')
	})

	test('rejects path starting with dash (flag injection)', () => {
		const result = sanitizeMediaPath('-autoexit', base)
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.error).toBe('path starts with dash')
	})

	test('rejects remote URLs', () => {
		// eslint-disable-next-line sonarjs/no-clear-text-protocols -- intentional: testing URL rejection
		expect(sanitizeMediaPath('http://evil.com/vid.mp4', base).ok).toBe(false)
		expect(sanitizeMediaPath('https://evil.com/vid.mp4', base).ok).toBe(false)
		// eslint-disable-next-line sonarjs/no-clear-text-protocols -- intentional: testing URL rejection
		expect(sanitizeMediaPath('ftp://evil.com/vid.mp4', base).ok).toBe(false)
	})

	test('rejects nonexistent file', () => {
		const result = sanitizeMediaPath('nonexistent.mp4', base)
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.error).toBe('file not found')
	})

	test('rejects directory', () => {
		const result = sanitizeMediaPath('.', base)
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.error).toBe('not a file')
	})

	test('resolves relative path from basePath', () => {
		const result = sanitizeMediaPath('../assets/fixture.txt', `${base}/../fixtures`)
		expect(result.ok).toBe(true)
		if (result.ok) expect(result.value).toContain('fixture.txt')
	})

	test('path with shell metacharacters is treated as literal filename', () => {
		// this file doesn't exist, but the point is it doesn't execute
		const result = sanitizeMediaPath('$(whoami).mp4', base)
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.error).toBe('file not found')
	})
})
