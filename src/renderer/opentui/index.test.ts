import { describe, expect, it } from 'bun:test'

import type { AudioNode, ImageNode, IRNode, VideoNode } from '../../ir/types.ts'

import { renderToOpenTUIWithMedia } from './index.tsx'

function makeImage(alt: string, url?: string): ImageNode {
	return { type: 'image', alt, url, style: { fg: '#888888' } }
}

function makeVideo(alt: string, src?: string): VideoNode {
	return { type: 'video', alt, src, autoplay: false, loop: false, style: { fg: '#888888' } }
}

function makeAudio(alt: string, src?: string): AudioNode {
	return { type: 'audio', alt, src, autoplay: false, loop: false, style: { fg: '#888888' } }
}

function makeRoot(...children: IRNode[]): IRNode {
	return { type: 'root', children }
}

describe('renderToOpenTUIWithMedia — media collection', () => {
	it('collects image nodes', () => {
		const ir = makeRoot(makeImage('photo', 'img.png'))
		const { mediaNodes } = renderToOpenTUIWithMedia(ir)
		expect(mediaNodes.length).toBe(1)
		expect(mediaNodes[0]!.node.type).toBe('image')
		expect(mediaNodes[0]!.index).toBe(0)
	})

	it('collects video nodes', () => {
		const ir = makeRoot(makeVideo('clip', 'video.mp4'))
		const { mediaNodes } = renderToOpenTUIWithMedia(ir)
		expect(mediaNodes.length).toBe(1)
		expect(mediaNodes[0]!.node.type).toBe('video')
	})

	it('collects audio nodes', () => {
		const ir = makeRoot(makeAudio('song', 'track.mp3'))
		const { mediaNodes } = renderToOpenTUIWithMedia(ir)
		expect(mediaNodes.length).toBe(1)
		expect(mediaNodes[0]!.node.type).toBe('audio')
	})

	it('collects mixed media in order', () => {
		const ir = makeRoot(
			makeImage('photo1', 'a.png'),
			makeVideo('clip', 'b.mp4'),
			makeImage('photo2', 'c.png'),
			makeAudio('song', 'd.mp3'),
		)
		const { mediaNodes } = renderToOpenTUIWithMedia(ir)
		expect(mediaNodes.length).toBe(4)
		expect(mediaNodes[0]!.node.type).toBe('image')
		expect(mediaNodes[0]!.index).toBe(0)
		expect(mediaNodes[1]!.node.type).toBe('video')
		expect(mediaNodes[1]!.index).toBe(1)
		expect(mediaNodes[2]!.node.type).toBe('image')
		expect(mediaNodes[2]!.index).toBe(2)
		expect(mediaNodes[3]!.node.type).toBe('audio')
		expect(mediaNodes[3]!.index).toBe(3)
	})

	it('returns empty media list for text-only document', () => {
		const ir = makeRoot({ type: 'text', value: 'hello world' })
		const { mediaNodes } = renderToOpenTUIWithMedia(ir)
		expect(mediaNodes.length).toBe(0)
	})

	it('returns empty media list for empty document', () => {
		const ir = makeRoot()
		const { mediaNodes } = renderToOpenTUIWithMedia(ir)
		expect(mediaNodes.length).toBe(0)
	})

	it('returns jsx alongside media nodes', () => {
		const ir = makeRoot(makeImage('photo', 'img.png'))
		const { jsx, mediaNodes } = renderToOpenTUIWithMedia(ir)
		expect(jsx).not.toBeNull()
		expect(mediaNodes.length).toBe(1)
	})
})
