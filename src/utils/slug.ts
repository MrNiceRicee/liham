// GFM heading slug — converts heading text to a URL-friendly anchor.
// matches GitHub's algorithm: lowercase, strip non-alphanumeric (keep hyphens/spaces), spaces → hyphens.

export function gfmSlug(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^\w\s-]/g, '')
		.replace(/\s+/g, '-')
}
