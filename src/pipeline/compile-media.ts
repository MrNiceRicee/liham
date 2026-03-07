// media node compilation — video, audio, and image auto-detection from extensions.
// extracted from rehype-ir.ts to keep file size under max-lines.

import type { Element } from 'hast'

import type { AudioNode, ImageNode, IRNode, VideoNode } from '../ir/types.ts'
import type { ThemeTokens } from '../theme/types.ts'

import { sanitizeImageSrc } from './sanitize-image-src.ts'
import { sanitizeForTerminal } from './sanitize.ts'

const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov', '.avi', '.mkv'])
const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a'])

export function detectMediaType(src: string): 'image' | 'video' | 'audio' {
	const dotIndex = src.lastIndexOf('.')
	if (dotIndex === -1) return 'image'
	const afterDot = src.slice(dotIndex)
	const ext = afterDot.split(/[?#]/)[0]!.toLowerCase()
	if (VIDEO_EXTENSIONS.has(ext)) return 'video'
	if (AUDIO_EXTENSIONS.has(ext)) return 'audio'
	return 'image'
}

export function compileVideo(theme: ThemeTokens, node: Element): VideoNode {
	const rawSrc = node.properties?.['src']
	const src = typeof rawSrc === 'string' ? sanitizeImageSrc(rawSrc) : undefined
	const rawAlt = node.properties?.['alt']
	const alt = typeof rawAlt === 'string' ? rawAlt : ''
	const autoplay = node.properties?.['autoPlay'] != null
	const loop = node.properties?.['loop'] != null
	const rawPoster = node.properties?.['poster']
	const poster = typeof rawPoster === 'string' ? sanitizeImageSrc(rawPoster) : undefined

	return {
		type: 'video',
		alt: alt.length > 0 ? alt : 'video',
		...(src != null && src.length > 0 ? { src } : {}),
		...(poster != null && poster.length > 0 ? { poster } : {}),
		autoplay,
		loop,
		style: { fg: theme.image.fallbackColor },
	}
}

export function compileAudio(theme: ThemeTokens, node: Element): AudioNode {
	const rawSrc = node.properties?.['src']
	const src = typeof rawSrc === 'string' ? sanitizeImageSrc(rawSrc) : undefined
	const rawAlt = node.properties?.['alt']
	const alt = typeof rawAlt === 'string' ? rawAlt : ''
	const autoplay = node.properties?.['autoPlay'] != null
	const loop = node.properties?.['loop'] != null

	return {
		type: 'audio',
		alt: alt.length > 0 ? alt : 'audio',
		...(src != null && src.length > 0 ? { src } : {}),
		autoplay,
		loop,
		style: { fg: theme.image.fallbackColor },
	}
}

export function compileImg(theme: ThemeTokens, node: Element): IRNode {
	const alt = typeof node.properties?.['alt'] === 'string' ? node.properties['alt'] : 'image'
	const src = typeof node.properties?.['src'] === 'string' ? node.properties['src'] : ''
	const url = sanitizeImageSrc(src)
	const sanitizedAlt = sanitizeForTerminal(alt)

	if (url.length > 0) {
		const mediaType = detectMediaType(url)
		if (mediaType === 'video') {
			return {
				type: 'video',
				alt: sanitizedAlt.length > 0 ? sanitizedAlt : 'video',
				src: url,
				autoplay: false,
				loop: false,
				style: { fg: theme.image.fallbackColor },
			}
		}
		if (mediaType === 'audio') {
			return {
				type: 'audio',
				alt: sanitizedAlt.length > 0 ? sanitizedAlt : 'audio',
				src: url,
				autoplay: false,
				loop: false,
				style: { fg: theme.image.fallbackColor },
			}
		}
	}

	return {
		type: 'image',
		alt: sanitizedAlt,
		...(url.length > 0 ? { url } : {}),
		style: { fg: theme.image.fallbackColor },
	} satisfies ImageNode
}
