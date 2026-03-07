---
title: "feat: Phase 6 — Kitty Graphics Protocol Images"
type: feat
status: draft
date: 2026-03-06
origin: docs/plans/2026-03-04-feat-liham-typescript-opentui-rewrite-plan.md
---

# Phase 6: Kitty Graphics Protocol Images

## Overview

Render inline images in markdown previews using the Kitty graphics protocol with graceful fallback. The architecture splits image handling into a shared renderer-agnostic layer (`src/image/`) and thin renderer adapters, so future renderers (Rezi, Ink) get image support with minimal work.

## Key Decisions

1. **Renderer-agnostic split** — shared `src/image/` layer handles loading, decoding, caching, detection. Renderer adapters handle display.
2. **sharp** for image decoding — mature (10+ years), explicit Bun support, PNG/JPEG/GIF.
3. **Own capability detection** — no OpenTUI imports in internals. Detection lives in `src/image/detect.ts`.
4. **Virtual placements** (U+10EEEE) — scroll-safe images inside `<scrollbox>`. Required for correct behavior.
5. **Half-block fallback** — shared renderer producing styled character grids. Works with any renderer that supports fg/bg text colors.
6. **Non-blocking loading** — React state per image component. Pre-emptive sizing for local images, wave animation for remote fetches.
7. **LRU memory budget** — 50MB per document, evict least-recently-used.
8. **Remote fetch** — temp cache in `os.tmpdir()`, 5s timeout, 10MB limit.
9. **No HEIC** — patent-encumbered, not in sharp prebuilt binaries. Additive later if needed.

## Architecture

### File Structure

```
src/
  image/                          # shared layer (renderer-agnostic, no @opentui imports)
    types.ts                      # LoadedImage, ImageCapability, HalfBlockGrid types
    detect.ts                     # terminal image protocol capability detection
    loader.ts                     # resolve path, validate, read bytes, size limits
    decoder.ts                    # sharp: decode PNG/JPEG/GIF -> raw RGBA, resize to fit
    cache.ts                      # content-hash cache + LRU memory budget (50MB/doc)
    remote.ts                     # fetch https:// URLs to temp cache
    halfblock.ts                  # RGBA -> styled character grid (2 vertical pixels per cell)
  renderer/
    opentui/
      image.tsx                   # OpenTUI adapter: Kitty virtual placements + halfblock + text fallback
```

### Data Flow

```
ImageNode { url, alt }
  -> loader.ts (resolve path, validate magic bytes, reject >10MB)
  -> decoder.ts (sharp: decode + resize to terminal columns)
  -> cache.ts (store decoded RGBA, track memory, LRU evict)
  -> renderer picks strategy:
       Kitty supported?  -> virtual placement (U+10EEEE)
       Not Kitty?        -> halfblock.ts -> styled text grid
       Decode failed?    -> [image: alt] text fallback
```

### IR Changes

None. `ImageNode` stays as `{ type: 'image', alt, url?, style }`. The renderer calls the shared image service at render time.

## Shared Layer

### Types (`image/types.ts`)

```typescript
interface LoadedImage {
  rgba: Uint8Array        // decoded RGBA pixel data
  width: number           // pixel width
  height: number          // pixel height
  byteSize: number        // for memory budget tracking
  source: string          // original path/URL for cache key + error messages
}

interface HalfBlockCell {
  char: string            // '▀' | '▄' | '█' | ' '
  fg: string              // 24-bit hex color for top pixel
  bg: string              // 24-bit hex color for bottom pixel
}

type HalfBlockGrid = HalfBlockCell[][]  // rows of cells

type ImageProtocol = 'kitty' | 'halfblock' | 'text'

interface ImageCapabilities {
  protocol: ImageProtocol
  pixelWidth?: number     // terminal cell pixel dimensions
  pixelHeight?: number
}
```

### Capability Detection (`image/detect.ts`)

Two tiers, following the same pattern as `src/theme/detect.ts`:

**Tier 1 — environment variables (sync):**
- `TERM === 'xterm-kitty'` or `KITTY_WINDOW_ID` set -> Kitty
- `TERM_PROGRAM === 'WezTerm'` -> Kitty supported
- `TERM_PROGRAM === 'ghostty'` -> Kitty supported

**Tier 2 — query sequence (async, authoritative):**
- Send 1x1 pixel query: `\x1b_Gi=31,s=1,v=1,a=q,t=d,f=24;AAAA\x1b\\`
- Send DA1 as sentinel: `\x1b[c`
- If graphics response before DA -> Kitty confirmed
- Timeout + raw stdin, same pattern as theme detection

Result cached for session. Passed through `BootContext` alongside theme.

### Image Loader (`image/loader.ts`)

- Resolve path relative to markdown file's directory
- Reject paths that resolve outside markdown file's parent tree (traversal prevention)
- `fs.stat` size check — reject > 10MB
- Validate magic bytes: PNG (`89504e47`), JPEG (`ffd8ff`), GIF (`474946`)
- Return raw `Uint8Array` bytes

### Image Decoder (`image/decoder.ts`)

- sharp: decode PNG/JPEG/GIF -> raw RGBA buffer
- GIF: first frame only (animated deferred)
- Resize to fit terminal width: `targetCols * cellPixelWidth` pixels, maintain aspect ratio
- Also expose metadata-only path (dimensions without full decode) for pre-emptive sizing

### Cache + LRU (`image/cache.ts`)

- Key by content hash of source path/URL
- 50MB per-document budget, LRU eviction when exceeded
- Clear cache on file switch (browser -> different file)
- Track byte sizes from `LoadedImage.byteSize`

### Remote Fetcher (`image/remote.ts`)

- Accept `https://` and `http://` only (reject other schemes)
- Content-hash URL -> check `os.tmpdir()/liham-images/{hash}.bin`
- Skip re-fetch if cached and < 1 hour old
- `fetch()` with `AbortSignal.timeout(5000)`, reject > 10MB via `Content-Length`
- Stream to temp file, hand off to loader for magic byte validation
- Temp directory cleaned on process exit

### Half-Block Renderer (`image/halfblock.ts`)

- Input: `LoadedImage` (RGBA pixels)
- Downsample to `targetCols x (targetRows * 2)` pixels (2 vertical pixels per cell)
- For each pair of vertically adjacent pixels: `{ char: '▀', fg: topHex, bg: bottomHex }`
- Alpha blending against terminal background (dark theme = black, light theme = white)
- Output: `HalfBlockGrid` — renderer maps to styled text primitives
- ~60 lines of core logic

## Renderer Adapter (OpenTUI)

### `src/renderer/opentui/image.tsx`

**Kitty virtual placements:**
1. Transmit image invisibly: `\x1b_Gi={id},f=100,t=d,U=1,q=1;{base64chunks}\x1b\\`
   - `f=100`: send PNG directly, terminal decodes
   - `U=1`: store but don't display (virtual placement mode)
   - `q=1`: suppress OK responses
   - Chunked at 4096 bytes with `m=1` (more) / `m=0` (last)
2. Render U+10EEEE placeholder characters — rows x cols filling the image area
3. Terminal replaces placeholders with image pixels
4. On unmount: delete image (`a=d,i={id}`) to free terminal memory

**Local file optimization:** use `t=f` (file path) instead of `t=d` (direct data) for local images — terminal reads the file, zero base64 overhead.

**Loading states:**

```
Local images:
  1. Read dimensions via sharp metadata (fast, no full decode)
  2. Reserve <box> at correct height (no layout jump)
  3. Decode + render image into reserved space

Remote images:
  1. Show [loading image] with wave animation (░▒▓█▓▒░ cycling)
  2. useEffect interval shifts wave offset every ~100ms
  3. On fetch complete: expand to image
```

**Fallback chain:**
- Kitty supported -> virtual placements
- Not Kitty -> half-block grid as `<text>` rows of `<span fg={fg} bg={bg}>▀</span>`
- Decode failed -> `[image: alt]` styled text (current behavior)

### Other Renderers (future)

- **Rezi**: call `ui.image({ src: bytes, width, height, protocol: 'auto' })` — built-in Kitty/Sixel/blitter support
- **Ink**: similar to OpenTUI adapter, use half-block grid as `<Text>` elements

## Implementation Phases

| Phase | What | Depends on |
|-------|------|------------|
| **A** | `src/image/types.ts` + `detect.ts` — types and capability detection | nothing |
| **B** | `src/image/loader.ts` + `decoder.ts` — local image loading with sharp | A |
| **C** | `src/image/halfblock.ts` — half-block renderer | B |
| **D** | `src/renderer/opentui/image.tsx` — Kitty virtual placements + half-block + fallback, loading states, wave animation | A, B, C |
| **E** | `src/image/cache.ts` — LRU memory budget | B |
| **F** | `src/image/remote.ts` — fetch remote URLs with wave loading | B, D |

## Security

- **Path traversal**: reject resolved paths outside markdown file's parent tree
- **File size**: `fs.stat` check before reading, reject > 10MB
- **Magic bytes**: validate PNG/JPEG/GIF headers before decoding
- **Remote URLs**: scheme allowlist (`http`, `https`), size limit, timeout
- **Error messages**: never include raw file bytes, show original relative path only
- **Memory budget**: 50MB per document, LRU eviction prevents unbounded growth

## Deferred / Future Work (Tier 3)

- [ ] Animated GIF: decode frames, cycle on timer interval
- [ ] Image links: `[![img](src)](href)` — wrap image component in `<a>`
- [ ] tmux DCS passthrough for pre-3.5 versions
- [ ] HEIC support (if sharp prebuilt ever includes libheif)
- [ ] Progressive/lazy loading for very large documents
- [ ] Sixel protocol support (for terminals without Kitty)
- [ ] iTerm2 inline image protocol
