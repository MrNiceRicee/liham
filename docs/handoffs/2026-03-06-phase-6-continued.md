# Handoff: Phase 6 Continued — Remote Fetch, Quick Wins, GIF Animation, Image Links

## Context

Phase 6 MVP is merged to `main` (316 tests, lint clean). Local images render via half-block (any 24-bit terminal) and Kitty virtual placements (Kitty/Ghostty). The image pipeline is: `sanitizeImageSrc → loader → decoder (sharp) → cache → renderer`.

## What to do

Use `/ce:plan` to create implementation plans for the remaining Phase 6 work, then execute them as separate branches. Each item below is one branch.

### Branch 1: `feat/phase-6-remote-fetch` (Medium effort)

**Remote image fetching — `https://` images with loading state.**

What exists:
- `sanitizeImageSrc()` already allows `http:` and `https:` schemes
- `loadImageFile()` currently only handles local paths (resolve + realpath + readFile)
- Image component already shows `[loading: alt]` during async decode
- LRU cache already keys by path+mtime+width

What to build:
- `fetchRemoteImage(url: string)` in `src/image/loader.ts` (or new `src/image/fetcher.ts`)
  - `fetch()` with AbortController timeout (~10s)
  - Response size limit (10MB, same as local)
  - Content-Type validation (image/png, image/jpeg, image/gif, image/webp)
  - Return `ImageResult<{ bytes: Uint8Array; url: string }>`
- Update `ImageBlock` component to detect URL scheme and route to fetch vs local load
- Cache key for remote: `url + targetWidth` (no mtime for remote)
- Consider: ETag/Last-Modified for cache invalidation? Probably overkill for MVP.

Test image: `https://cdn.bsky.app/img/feed_fullsize/plain/did:plc:fcdgfml46uokazqoouqhepla/bafkreibc2lmdkfdruahkcehmi6nserlvohx2odkn4gj2op6qcl3ygzmq4i`

SSRF note: For a CLI tool on the user's machine, SSRF is minimal risk. Basic mitigations: no `file://`, no private IP ranges (10.x, 172.16-31.x, 192.168.x, 127.x), no redirect following to non-http(s).

### Branch 2: `feat/phase-6-quick-wins` (Small effort)

Three small items:

1. **`--no-images` flag** — Trivial. Add to parseArgs, force `imageCapabilities.protocol = 'text'` when set. ~10 lines.

2. **24-bit image ID encoding** — Current `generateImageId()` returns `hash % 255 + 1` (range 1-255). For docs with >255 images, IDs collide. Fix: use a monotonic counter per session instead of hash. Only matters for Kitty protocol.

3. **U+10EEEE validation inside OpenTUI scrollbox** — Test whether OpenTUI's scrollbox correctly handles the Kitty placeholder character (U+10EEEE). If it corrupts layout, we know Kitty virtual placements won't work inside scrollboxes and should default to halfblock. This is a decision gate, not necessarily a code change.

### Branch 3: `feat/phase-6-gif-animation` (Medium effort)

**Animated GIF: decode frames, cycle on timer interval.**

What exists:
- Decoder uses `pages: 1` to read only first frame
- sharp can decode all GIF frames: `sharp(bytes, { pages: -1 })` gives all pages
- sharp metadata includes `pages` count and `delay` array (ms per frame)

What to build:
- Detect animated GIFs (metadata.pages > 1)
- Decode all frames to RGBA buffers
- Store frame array + delays in `LoadedImage` (extend type)
- `useEffect` timer in ImageBlock that cycles through frames
- Frame index state, re-render HalfBlockRows with current frame
- Cleanup: clear timer on unmount
- Memory concern: cap at ~20 frames or 10MB per GIF

### Branch 4: `feat/phase-6-image-links` (Small effort)

**Image links: `[![img](src)](href)` — wrap image in clickable link.**

What exists:
- `<a href>` in OpenTUI emits OSC 8 hyperlinks natively
- Image inside link produces hast: `<a href="..."><img src="..." alt="..."></a>`
- Current IR: link contains image as child

What to build:
- Detect image-inside-link pattern in IR compilation or rendering
- Wrap the ImageBlock component output in `<a href="...">` when parent is a link
- May need to thread the link URL through ImageNode or handle at render dispatch level

### Branch 5: `feat/phase-6-progressive-loading` (Medium effort)

**Progressive/lazy loading for very large documents.**

Only tackle if performance is a problem with many images. The current decode semaphore (max 2) and LRU cache (50MB) already provide basic resource management. Consider:
- Intersection observer equivalent: only decode images near the viewport
- Placeholder sizing: reserve terminal rows before decode completes
- Priority queue: decode visible images first

## Key references

- Image pipeline: `src/image/` (types, detect, loader, decoder, halfblock, kitty, cache)
- Image component: `src/renderer/opentui/image.tsx`
- Image context: `src/renderer/opentui/image-context.tsx`
- IR compilation: `src/pipeline/rehype-ir.ts` (img handler at line ~505)
- Test fixture: `test/fixtures/image-test.md`
- Test assets: `test/assets/` (profile.png, IMG_2935.JPG, duck-simple.gif)
- Design doc: `docs/plans/2026-03-06-feat-phase-6-kitty-graphics-protocol-design.md`

## Patterns to follow

- Branch per feature, merge to main when tests pass
- Tests in same directory as source (`*.test.ts`)
- ESLint clean (sonarjs cognitive-complexity 15, perfectionist imports)
- `exactOptionalPropertyTypes: true` — use spread props for optional JSX props
- Extract helpers at complexity 15
- Factory functions over classes (see `createImageCache`)
- `ImageResult<T>` for all fallible operations

## Dropped items (not pursuing)

- tmux DCS passthrough — niche
- Sixel/iTerm2 protocols — big scope, low priority
- HEIC — blocked on sharp prebuilts
- BMP — nobody uses BMP in markdown
- `file:`/`data:` URI — edge cases, security concerns
- SVG — possible via sharp (librsvg), but deferred for now
