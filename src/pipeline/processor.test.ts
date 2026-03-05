import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { processMarkdown } from './processor.ts'

describe('processMarkdown', () => {
	it('returns ok result for valid markdown', async () => {
		const result = await processMarkdown('# Hello\n\nA paragraph.')
		expect(result.ok).toBe(true)
		if (result.ok) {
			expect(result.value).toBeDefined()
		}
	})

	it('returns ok for empty markdown', async () => {
		const result = await processMarkdown('')
		expect(result.ok).toBe(true)
	})

	it('handles inline formatting', async () => {
		const result = await processMarkdown('**bold** *italic* ~~strike~~ `code`')
		expect(result.ok).toBe(true)
	})

	it('handles code blocks with language', async () => {
		const result = await processMarkdown('```typescript\nconst x = 1\n```')
		expect(result.ok).toBe(true)
	})

	it('handles GFM tables', async () => {
		const result = await processMarkdown('| a | b |\n|---|---|\n| 1 | 2 |')
		expect(result.ok).toBe(true)
	})

	it('handles GFM task lists', async () => {
		const result = await processMarkdown('- [x] done\n- [ ] pending')
		expect(result.ok).toBe(true)
	})

	it('handles links and images', async () => {
		const result = await processMarkdown('[link](https://example.com)\n\n![alt](img.png)')
		expect(result.ok).toBe(true)
	})

	it('handles nested lists', async () => {
		const md = '- a\n  - b\n    - c\n- d'
		const result = await processMarkdown(md)
		expect(result.ok).toBe(true)
	})
})

describe('processMarkdown benchmark fixtures', () => {
	const fixturesDir = resolve(import.meta.dir, '../../test/fixtures')

	it('processes small.md under 200ms', async () => {
		const md = readFileSync(resolve(fixturesDir, 'small.md'), 'utf-8')
		const start = performance.now()
		const result = await processMarkdown(md)
		const elapsed = performance.now() - start

		expect(result.ok).toBe(true)
		expect(elapsed).toBeLessThan(200)
	})

	it('processes large.md under 200ms', async () => {
		const md = readFileSync(resolve(fixturesDir, 'large.md'), 'utf-8')
		const start = performance.now()
		const result = await processMarkdown(md)
		const elapsed = performance.now() - start

		expect(result.ok).toBe(true)
		expect(elapsed).toBeLessThan(200)
	})
})
