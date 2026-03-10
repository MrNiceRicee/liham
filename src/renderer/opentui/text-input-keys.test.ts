import { describe, expect, test } from 'bun:test'

import type { KeyEvent } from '@opentui/core'

import { handleTextInputKey } from './text-input-keys.ts'

function makeKey(name: string, overrides?: Partial<KeyEvent>): KeyEvent {
	return { name, sequence: name, shift: false, ctrl: false, meta: false, ...overrides } as KeyEvent
}

describe('cursor movement', () => {
	test('left moves cursor back', () => {
		const r = handleTextInputKey(makeKey('left'), 'hello', 3)
		expect(r).toEqual({ newText: 'hello', cursor: 2, consumed: true })
	})

	test('left clamps at 0', () => {
		const r = handleTextInputKey(makeKey('left'), 'hello', 0)
		expect(r).toEqual({ newText: 'hello', cursor: 0, consumed: true })
	})

	test('right moves cursor forward', () => {
		const r = handleTextInputKey(makeKey('right'), 'hello', 3)
		expect(r).toEqual({ newText: 'hello', cursor: 4, consumed: true })
	})

	test('right clamps at end', () => {
		const r = handleTextInputKey(makeKey('right'), 'hello', 5)
		expect(r).toEqual({ newText: 'hello', cursor: 5, consumed: true })
	})

	test('home moves to start', () => {
		const r = handleTextInputKey(makeKey('home'), 'hello', 3)
		expect(r).toEqual({ newText: 'hello', cursor: 0, consumed: true })
	})

	test('end moves to end', () => {
		const r = handleTextInputKey(makeKey('end'), 'hello', 1)
		expect(r).toEqual({ newText: 'hello', cursor: 5, consumed: true })
	})
})

describe('word movement', () => {
	test('meta+left jumps to word start', () => {
		const r = handleTextInputKey(makeKey('left', { meta: true }), 'hello world', 8)
		expect(r.cursor).toBe(6)
		expect(r.consumed).toBe(true)
	})

	test('meta+right jumps to word end', () => {
		const r = handleTextInputKey(makeKey('right', { meta: true }), 'hello world', 0)
		expect(r.cursor).toBe(5)
		expect(r.consumed).toBe(true)
	})
})

describe('backspace', () => {
	test('deletes before cursor', () => {
		const r = handleTextInputKey(makeKey('backspace'), 'hello', 3)
		expect(r).toEqual({ newText: 'helo', cursor: 2, consumed: true })
	})

	test('no-op at position 0', () => {
		const r = handleTextInputKey(makeKey('backspace'), 'hello', 0)
		expect(r).toEqual({ newText: 'hello', cursor: 0, consumed: true })
	})

	test('deletes emoji correctly', () => {
		const r = handleTextInputKey(makeKey('backspace'), 'a👋b', 2)
		expect(r).toEqual({ newText: 'ab', cursor: 1, consumed: true })
	})
})

describe('forward delete', () => {
	test('deletes at cursor', () => {
		const r = handleTextInputKey(makeKey('delete'), 'hello', 2)
		expect(r).toEqual({ newText: 'helo', cursor: 2, consumed: true })
	})

	test('no-op at end', () => {
		const r = handleTextInputKey(makeKey('delete'), 'hello', 5)
		expect(r).toEqual({ newText: 'hello', cursor: 5, consumed: true })
	})
})

describe('word deletion', () => {
	test('ctrl+w deletes word before cursor', () => {
		const r = handleTextInputKey(makeKey('w', { ctrl: true }), 'hello world', 11)
		expect(r.newText).toBe('hello ')
		expect(r.cursor).toBe(6)
	})

	test('meta+backspace deletes word before cursor', () => {
		const r = handleTextInputKey(makeKey('backspace', { meta: true }), 'hello world', 11)
		expect(r.newText).toBe('hello ')
		expect(r.cursor).toBe(6)
	})

	test('ctrl+u clears all', () => {
		const r = handleTextInputKey(makeKey('u', { ctrl: true }), 'hello', 3)
		expect(r).toEqual({ newText: '', cursor: 0, consumed: true })
	})
})

describe('insert', () => {
	test('inserts at cursor position', () => {
		const r = handleTextInputKey(makeKey('x'), 'hello', 2)
		expect(r).toEqual({ newText: 'hexllo', cursor: 3, consumed: true })
	})

	test('inserts at end', () => {
		const r = handleTextInputKey(makeKey('x'), 'hello', 5)
		expect(r).toEqual({ newText: 'hellox', cursor: 6, consumed: true })
	})

	test('inserts at start', () => {
		const r = handleTextInputKey(makeKey('x'), 'hello', 0)
		expect(r).toEqual({ newText: 'xhello', cursor: 1, consumed: true })
	})

	test('space inserts at cursor', () => {
		const r = handleTextInputKey(makeKey('space'), 'ab', 1)
		expect(r).toEqual({ newText: 'a b', cursor: 2, consumed: true })
	})

	test('respects maxLength', () => {
		const r = handleTextInputKey(makeKey('x'), 'ab', 2, 2)
		expect(r).toEqual({ newText: 'ab', cursor: 2, consumed: true })
	})
})

describe('empty string', () => {
	test('all movement is no-op', () => {
		expect(handleTextInputKey(makeKey('left'), '', 0).cursor).toBe(0)
		expect(handleTextInputKey(makeKey('right'), '', 0).cursor).toBe(0)
		expect(handleTextInputKey(makeKey('home'), '', 0).cursor).toBe(0)
		expect(handleTextInputKey(makeKey('end'), '', 0).cursor).toBe(0)
	})

	test('backspace is no-op', () => {
		const r = handleTextInputKey(makeKey('backspace'), '', 0)
		expect(r).toEqual({ newText: '', cursor: 0, consumed: true })
	})

	test('forward delete is no-op', () => {
		const r = handleTextInputKey(makeKey('delete'), '', 0)
		expect(r).toEqual({ newText: '', cursor: 0, consumed: true })
	})

	test('insert works', () => {
		const r = handleTextInputKey(makeKey('a'), '', 0)
		expect(r).toEqual({ newText: 'a', cursor: 1, consumed: true })
	})
})

describe('non-consumed keys', () => {
	test('unknown key returns consumed false', () => {
		const r = handleTextInputKey(makeKey('f1'), 'hello', 3)
		expect(r.consumed).toBe(false)
		expect(r.newText).toBe('hello')
	})
})
