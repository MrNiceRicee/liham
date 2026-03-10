// shared test utilities for pipeline tests

import { expect } from 'bun:test'

import type { IRNode } from '../ir/types.ts'

export function assertOk(result: {
	ok: boolean
	value?: unknown
}): asserts result is { ok: true; value: IRNode } {
	expect(result.ok).toBe(true)
}

export function findNodes(node: IRNode, type: string): IRNode[] {
	const results: IRNode[] = []
	if (node.type === type) results.push(node)
	if ('children' in node && Array.isArray(node.children)) {
		for (const child of node.children as IRNode[]) {
			results.push(...findNodes(child, type))
		}
	}
	return results
}
