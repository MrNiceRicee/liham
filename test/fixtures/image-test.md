# Image Rendering Test

This fixture exercises local images (PNG, JPEG, GIF), missing images, remote URLs, and mixed content.

## Local Images

### PNG

![profile picture](../assets/profile.png)

### JPEG

![photo](../assets/IMG_2935.JPG)

### GIF

![duck](../assets/duck-simple.gif)

## Missing Image

![this image does not exist](../assets/nonexistent.png)

## Remote Image (not yet supported)

![bluesky post](https://cdn.bsky.app/img/feed_fullsize/plain/did:plc:fcdgfml46uokazqoouqhepla/bafkreibc2lmdkfdruahkcehmi6nserlvohx2odkn4gj2op6qcl3ygzmq4i)

## Mixed Content

Here is a paragraph before an image. It has **bold** and `inline code` to verify layout.

![profile picture](../assets/profile.png)

And here is text after the image. The image should be a block between these paragraphs.

## Multiple Images

Three images back to back:

![profile](../assets/profile.png)

![photo](../assets/IMG_2935.JPG)

![duck](../assets/duck-simple.gif)

## Image in Blockquote

> Here is a quoted image:
>
> ![profile](../assets/profile.png)

## Image with Empty Alt

![](../assets/profile.png)

## Path Traversal (should fail)

![sneaky](../../../../etc/passwd)

## After Images

If you can read this, scrolling past images works correctly.

The end.
