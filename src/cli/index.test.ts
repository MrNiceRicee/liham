import { expect, test } from 'bun:test'
import { resolve } from 'node:path'

import pkg from '../../package.json'

const projectRoot = resolve(import.meta.dir, '../..')
const cliPath = resolve(projectRoot, 'src/cli/index.ts')

async function runCli(args: string[], stdin?: string) {
	const proc = Bun.spawn(['bun', cliPath, ...args], {
		cwd: projectRoot,
		stdin: stdin == null ? 'ignore' : new Blob([stdin]).stream(),
		stdout: 'pipe',
		stderr: 'pipe',
	})

	const [stdout, stderr] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	])
	return { exitCode: proc.exitCode, stderr, stdout }
}

test('CLI help exits successfully and describes usage', async () => {
	const result = await runCli(['--help'])

	expect(result.stdout).toContain('usage:')
	expect(result.stdout).toContain('liham [options] [path]')
	expect(result.stderr).toBe('')
	expect(result.exitCode).toBe(0)
})

test('CLI version exits successfully', async () => {
	const result = await runCli(['--version'])

	expect(result.stdout.trim()).toBe(pkg.version)
	expect(result.stderr).toBe('')
	expect(result.exitCode).toBe(0)
})

test('CLI prints markdown from a file and stdin', async () => {
	const fileResult = await runCli(['--print', '--plain', 'test/fixtures/small.md'])
	const stdinResult = await runCli(['--plain'], '# Stdin heading')

	expect(fileResult.stdout).toContain('Heading 1')
	expect(fileResult.stderr).toBe('')
	expect(fileResult.exitCode).toBe(0)
	expect(stdinResult.stdout).toContain('Stdin heading')
	expect(stdinResult.stderr).toBe('')
	expect(stdinResult.exitCode).toBe(0)
})
