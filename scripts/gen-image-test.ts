// generates a markdown fixture exercising every image rendering path

const sections: string[] = []

sections.push('# Image Rendering Test\n')
sections.push('This fixture exercises local images (PNG, JPEG, GIF), missing images, remote URLs, and mixed content.\n')

// local images — relative paths from test/fixtures/
sections.push('## Local Images\n')
sections.push('### PNG\n')
sections.push('![profile picture](../assets/profile.png)\n')

sections.push('### JPEG\n')
sections.push('![photo](../assets/IMG_2935.JPG)\n')

sections.push('### GIF\n')
sections.push('![duck](../assets/duck-simple.gif)\n')

// missing image — should show error state
sections.push('## Missing Image\n')
sections.push('![this image does not exist](../assets/nonexistent.png)\n')

// remote image — Phase F not implemented, should show error/text fallback
sections.push('## Remote Image (not yet supported)\n')
sections.push('![bluesky post](https://cdn.bsky.app/img/feed_fullsize/plain/did:plc:fcdgfml46uokazqoouqhepla/bafkreibc2lmdkfdruahkcehmi6nserlvohx2odkn4gj2op6qcl3ygzmq4i)\n')

// images mixed with other content
sections.push('## Mixed Content\n')
sections.push('Here is a paragraph before an image. It has **bold** and `inline code` to verify layout.\n')
sections.push('![profile picture](../assets/profile.png)\n')
sections.push('And here is text after the image. The image should be a block between these paragraphs.\n')

// multiple images in sequence
sections.push('## Multiple Images\n')
sections.push('Three images back to back:\n')
sections.push('![profile](../assets/profile.png)\n')
sections.push('![photo](../assets/IMG_2935.JPG)\n')
sections.push('![duck](../assets/duck-simple.gif)\n')

// image inside blockquote
sections.push('## Image in Blockquote\n')
sections.push('> Here is a quoted image:\n>')
sections.push('> ![profile](../assets/profile.png)\n')

// image with empty alt
sections.push('## Image with Empty Alt\n')
sections.push('![](../assets/profile.png)\n')

// path traversal attempt — should be rejected
sections.push('## Path Traversal (should fail)\n')
sections.push('![sneaky](../../../../etc/passwd)\n')

// text after images for scroll testing
sections.push('## After Images\n')
sections.push('If you can read this, scrolling past images works correctly.\n')
sections.push('The end.\n')

const output = sections.join('\n')
const dest = `${import.meta.dir}/../test/fixtures/image-test.md`
await Bun.write(dest, output)

const lines = output.split('\n').length
const bytes = new TextEncoder().encode(output).length
console.log(`wrote ${dest}`)
console.log(`${lines} lines, ${bytes} bytes`)
