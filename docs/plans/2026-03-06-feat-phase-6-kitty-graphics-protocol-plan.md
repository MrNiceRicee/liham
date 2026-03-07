---
title: "feat: Phase 6 — Kitty Graphics Protocol Images"
type: feat
status: active
date: 2026-03-06
deepened: 2026-03-06
origin: docs/plans/2026-03-06-feat-phase-6-kitty-graphics-protocol-design.md
---

# Phase 6: Kitty Graphics Protocol Images

## Enhancement Summary

**Deepened on:** 2026-03-06
**Sections enhanced:** 6 phases + architecture + acceptance criteria + risk analysis
**Research agents used:** architecture-strategist, performance-oracle, security-sentinel, kieran-typescript-reviewer, pattern-recognition-specialist, code-simplicity-reviewer, julik-frontend-races-reviewer, best-practices-researcher (sharp, Kitty, half-block, terminal detection), opentui skill, spec-flow-analyzer

### Key Improvements

1. **WezTerm does NOT support virtual placements** — WezTerm lacks U+10EEEE unicode placeholder support. Detection must distinguish Kitty/Ghostty (virtual placements) from WezTerm (half-block fallback only). Design doc incorrectly listed WezTerm as "Kitty supported" for virtual placements.
2. **sanitizeImageSrc must use scheme allowlist, not blocklist** — the proposed DANGEROUS_SCHEMES blocklist is bypassable (blob:, ftp:, gopher:, etc. pass through). Switch to: relative paths allowed, http:/https: allowed, everything else rejected. Matches sanitizeUrl() security posture.
3. **Invocation counter replaces boolean stale flag** — boolean staleRef is insufficient for rapid URL changes. Use a monotonically increasing loadIdRef counter (pattern already exists in app.tsx:314 as fileChangeIdRef). Each async callback checks if its loadId still matches current.
4. **process.exit() in onDestroy skips React cleanup** — normal quit via renderer.destroy() calls process.exit(0) synchronously. React useEffect cleanup functions never run. Need process.on('exit') handler to send Kitty cleanup commands for all active image IDs.
5. **writeOut() accessible via resolveRenderLib()** — CliRenderer.writeOut is private. Correct path: `resolveRenderLib().writeOut(renderer.rendererPtr, data)` using public APIs from @opentui/core.
6. **renderer.resolution provides pixel dimensions** — OpenTUI already queries pixel resolution at startup. Derive cell pixel size as `renderer.resolution.width / renderer.width`. Eliminates need for separate CSI 16t query in many cases.
7. **Cell buffer uses Uint32Array** — U+10EEEE (0x10EEEE) fits in u32 storage. bufferSetCell uses char.codePointAt(0) which handles supplementary plane. Validation still essential but prospects are good.
8. **sharp has built-in limitInputPixels** — defaults to 268M pixels. Use as defense-in-depth alongside the metadata() pre-check. Also: sharp.concurrency(1) for predictable single-threaded processing.
9. **Half-block convention: U+2584 (lower half block)** — fg=bottom pixel, bg=top pixel. Pad odd height to even. Same-color optimization: emit space with bg only. No dithering needed for truecolor.
10. **Combine theme + image detection into single stdin session** — send OSC 11 + Kitty query + CSI 16t + DA1 in one write, parse all responses from one buffer. Reduces startup from 100ms to ~80ms.

### New Considerations Discovered

- **WezTerm virtual placement gap:** WezTerm supports basic Kitty graphics but NOT unicode placeholders (U+10EEEE). Detection must return `'kitty-virtual'` vs `'kitty-direct'` vs `'halfblock'` vs `'text'`. WezTerm falls back to half-block.
- **ScrollBox uses scissor rects** — if U+10EEEE survives the cell buffer, scrollbox clipping works automatically via Zig scissor rect mechanism. No manual scroll tracking needed.
- **OpenTUI has native drawSuperSampleBuffer** — Zig backend can render RGBA pixels as half-block natively. Future optimization path, but React component model makes pure-TS approach simpler for now.
- **image.tsx is a precedent-setting component** — it would be the first renderer component with React hooks (useState, useEffect, useRef, useContext) and the first React context in the codebase. All existing renderer components are pure functions. This is justified by async image lifecycle but should be explicitly acknowledged.
- **Cache stampede from duplicate images** — five references to the same image in one doc cause five parallel decodes. Need an inflight promise map (~15 LOC) for request coalescing.
- **Cache eviction can delete Kitty images from mounted components** — LRU eviction sends `a=d,d=I` but the component still holds pixel data in React state. Component's virtual placement is deleted from terminal memory. Need ref-counting or separate eviction from Kitty cleanup.
- **React keys: image-{contentHash} is not unique** — duplicate images in same parent produce duplicate React keys. Use `image-{nodeIndex}-{contentHash}` instead.
- **Browser preview does not address images** — preview renders the full pipeline including ImageNode blocks. Must decide: text-only fallback in preview (simple) or full image rendering with cancellation (complex).
- **297-entry diacritics lookup table** — virtual placement row/column encoding requires a complete mapping from the Kitty spec's rowcolumn-diacritics.txt file, not just the first few entries.
- **tmux DCS passthrough** — OpenTUI issue #334 found Kitty query leaking into tmux pane title. Verify OpenTUI version includes fix (PR #415), or handle tmux wrapping in detect.ts.
- **Image IDs are terminal-global** — shared across ALL processes. Include PID in hash to avoid cross-process collisions. Two liham instances in tmux panes could otherwise collide.
- **redirect: 'follow' contradicts manual redirect counting** — fetch API's redirect: 'follow' does not expose intermediate hops. Must use redirect: 'manual' for HTTPS downgrade detection and redirect counting.

---

## Overview

Add inline image rendering to liham's markdown preview using the Kitty graphics protocol, with half-block character and text fallbacks. The implementation splits into a shared renderer-agnostic image layer (`src/image/`) and a thin OpenTUI adapter, following liham's established pattern of keeping framework dependencies confined to `src/renderer/opentui/`.

See design doc: `docs/plans/2026-03-06-feat-phase-6-kitty-graphics-protocol-design.md`

## Problem Statement / Motivation

Images in markdown (`![alt](path)`) currently render as `[image: alt]` text placeholders. This is the last major content type without visual rendering. Phase 6 completes the preview experience by:

1. Rendering images inline via Kitty graphics protocol in supported terminals (Kitty, Ghostty)
2. Providing half-block character fallback for non-Kitty terminals with 24-bit color (including WezTerm)
3. Preserving the existing `[image: alt]` fallback for minimal terminals
4. Supporting both local and remote (`https://`) images

## Proposed Solution

### Architecture

```
src/
  image/                              # shared, renderer-agnostic (no @opentui imports)
    types.ts                          # LoadedImage, ImageCapabilities, HalfBlockGrid, Result<T>
    detect.ts                         # terminal image capability detection
    loader.ts                         # path resolution, validation, file reading
    decoder.ts                        # sharp: decode + resize to terminal dimensions
    cache.ts                          # content-hash LRU cache (50MB budget)
    remote.ts                         # fetch https:// URLs to temp cache
    halfblock.ts                      # RGBA pixels -> styled character grid
    kitty.ts                          # Kitty protocol escape sequence generation (pure functions)
  pipeline/
    sanitize-image-src.ts             # image-specific URL/path sanitizer (NEW)
  renderer/opentui/
    image.tsx                         # OpenTUI image component (NEW)
    image-context.tsx                 # React context for basePath + capabilities (NEW)
```

### Research Insights: Architecture

**Kitty protocol logic extraction (from architecture-strategist):** The plan originally placed all Kitty protocol encoding in `image.tsx`. This creates excessive cognitive complexity for a single file (state machine + protocol encoding + chunking + diacritics + half-block JSX). Extract Kitty protocol logic to `src/image/kitty.ts` (renderer-agnostic, pure functions). This module handles: chunk generation, virtual placement commands, diacritics encoding, cleanup commands, image ID generation. Independently testable. ~150 LOC.

**Cache as factory function (from architecture-strategist + pattern-recognition):** The codebase avoids module-level singletons. `watcher.ts` exports `createFileWatcher`/`createDirectoryWatcher` factories. Cache should follow: `createImageCache()` factory, instance held in `useRef` at app level or passed via context. More testable, no global state leaking between test runs.

**image.tsx as first stateful renderer component (from pattern-recognition):** Every existing renderer component (`heading.tsx`, `code-block.tsx`, `table.tsx`, etc.) is a pure function `renderXxx(node, key)`. `image.tsx` introduces useState/useEffect/useContext/useRef — a fundamentally different pattern. Justified by async image lifecycle (decode, fetch, animation), but the plan should: (1) wrap in a `renderImageBlock(node, key)` function for dispatch consistency, (2) document this as an architectural precedent.

**First React context (from pattern-recognition):** `ImageContext` is the codebase's first `createContext`/`useContext` usage. Currently everything flows through function parameters. Justified because image components are deeply nested in the render tree — threading basePath + capabilities through every `renderNode`/`renderChildren` call would be too invasive.

---

### Data Flow

```
markdown ![alt](./photo.png)
  -> rehype-ir: sanitizeImageSrc() preserves relative path, stores in ImageNode
  -> renderer detects image block node
  -> image.tsx component mounts:
       1. resolve path relative to markdown file dir (via React context)
       2. loader.ts: validate, read bytes
       3. decoder.ts: sharp metadata (dimensions) -> reserve space
       4. decoder.ts: sharp decode (RGBA) -> cache
       5. render: Kitty virtual placement | half-block grid | [image: alt]
```

## Technical Approach

### Critical Integration Issues (from SpecFlow analysis)

These must be resolved before image rendering can work:

**1. Image path sanitization** (`src/pipeline/sanitize-image-src.ts`)

Current `sanitizeUrl()` rejects all relative paths — `![](./photo.png)` produces `url: undefined`. Need a separate sanitizer for image `src` attributes.

Update `rehype-ir.ts` line ~506 to use `sanitizeImageSrc()` instead of `sanitizeUrl()` for `img` elements.

### Research Insights: sanitizeImageSrc

**CRITICAL CORRECTION (from security-sentinel):** The original plan proposed a DANGEROUS_SCHEMES blocklist. This is fundamentally weaker than the allowlist approach used by `sanitizeUrl()`. Unknown/future schemes (blob:, ftp:, gopher:, dict:, sftp:) pass through a blocklist. Switch to a **hybrid allowlist** approach:

```typescript
function sanitizeImageSrc(src: string): string {
    const cleaned = stripControlChars(src)  // shared with sanitize-url.ts
    if (cleaned.length === 0) return ''
    // also strip percent-encoded control chars (consistency with sanitizeUrl)
    const decoded = stripPercentEncodedControls(cleaned)
    // detect if the string has a scheme: matches /^[a-zA-Z][a-zA-Z0-9+\-.]*:/
    const schemeMatch = decoded.match(/^[a-zA-Z][a-zA-Z0-9+\-.]*:/)
    if (schemeMatch) {
        // has a scheme — only allow http: and https:
        const scheme = schemeMatch[0].toLowerCase()
        if (scheme !== 'http:' && scheme !== 'https:') return ''
    }
    // no scheme = relative path — allow through for renderer to resolve
    return decoded
}
```

**Additional security hardening:**
- Strip percent-encoded control chars (`%00-%1f`, `%7f-%9f`) — `sanitizeUrl()` does this, `sanitizeImageSrc()` must too
- Consider MAX_URL_LENGTH equivalent (2048 chars) for consistency
- `file:` URIs intentionally rejected — document as known limitation. Users with `file:///path` markdown (common from Pandoc) will see text fallback.
- `data:` URIs intentionally rejected — potential decompression bomb vector via embedded data. Document in Known Limitations.

---

**2. Markdown file path context**

The renderer needs `dirname(filePath)` to resolve relative image paths. Thread via React context:
- Create `ImageContext` with `{ basePath: string, capabilities: ImageCapabilities, bgColor: string }`
- Provide in `app.tsx` (already has `filePath`)
- Consume in `image.tsx` via `useContext(ImageContext)`

### Research Insights: ImageContext

**bgColor instead of theme string (from TypeScript reviewer):** Original plan had `theme: 'dark' | 'light'`. Theme detection can return null, and the half-block renderer needs an actual color value, not a string requiring secondary lookup. Use `bgColor: string` directly (from theme tokens) for alpha blending. Simpler type, no null handling.

**Browser preview gap (from spec-flow-analyzer):** `renderBrowserPreview()` in app.tsx calls `processMarkdown()` then `renderToOpenTUI()`. With Phase 6, this produces ImageNode blocks. The preview path does NOT wrap content in `<ImageContext.Provider>`. **Decision: browser preview uses text-only fallback for images.** The image component should check for missing context and fall back to `[image: alt]`. This avoids cache/cancellation/performance issues from rapid cursor movement in browser mode.

---

**3. ImageNode promoted to block type**

Add `'image'` to `BLOCK_TYPES` in `src/ir/types.ts`. This ensures `renderChildren()` flushes inline groups before an image and renders it as a block component (not wrapped in `<text>`).

Handle in `renderNode()` switch in `src/renderer/opentui/index.tsx`:
```
case 'image':
    return renderImageBlock(node, key)
```

### Research Insights: inline vs block images

Images in markdown are technically inline (can appear in paragraphs), but for terminal rendering they need block-level treatment. The promotion to block type means `![alt](img)` inside a paragraph will cause a break — the inline text before it flushes, the image renders as a block, then inline text after continues.

**Style type decision (from TypeScript reviewer + pattern-recognition):** `ImageNode` currently uses `InlineStyle` while all block nodes use `BlockStyle`. Options: (1) change to `BlockStyle` (consistency), (2) keep `InlineStyle` and document the exception. **Recommendation: keep `InlineStyle`** — the image component ignores most style properties and uses theme tokens + ImageContext directly. Add a comment in `types.ts` explaining the exception.

**Inline fallback path (from pattern-recognition):** `inline.tsx` still has `case 'image': return renderImage(core, key)`. After block promotion, this becomes dead code for normal flow. **Preserve it as a safety net** — if an image ends up in an inline context via CustomNode, the old `[image: alt]` text renders. Add a comment marking it as fallback.

**Nested images (from spec-flow-analyzer):** Test cases needed for:
- `Some text ![img](path) more text` — paragraph breaks into three pieces
- `![img1](a.png) ![img2](b.png)` — consecutive block images
- `> ![img](path)` — image inside blockquote
- `- Item with ![img](path)` — image inside list item

---

**4. U+10EEEE validation in OpenTUI**

Before implementing virtual placements, verify that OpenTUI's Zig backend passes through U+10EEEE (Supplementary Private Use Area-B) unmodified.

### Research Insights: OpenTUI rendering pipeline

**Cell buffer storage (from OpenTUI skill agent):** The cell buffer uses **Uint32Array** (confirmed in bundled JS). Each cell stores a single u32 codepoint. U+10EEEE = 0x10EEEE = 1,109,742 which fits in u32. The `bufferSetCell` FFI call uses `char.codePointAt(0)` which correctly handles supplementary plane characters.

**Assessment:** U+10EEEE **should** survive cell buffer storage. The remaining risk is the **output path** — `lib.render()` diffs the cell buffer and outputs UTF-8 to the terminal. Zig's `std.unicode` supports supplementary plane codepoints, but the specific render path must be tested.

**ScrollBox interaction (from OpenTUI skill agent):** ScrollBox uses **scissor rects** for content clipping. If U+10EEEE works in the cell buffer, virtual placement placeholder text participates in Yoga layout naturally — scrolls and clips correctly via the scissor mechanism. **This is the ideal path — scrollbox integration is essentially free.**

**writeOut() access (from OpenTUI skill agent):** `CliRenderer.writeOut` is declared **private**. Correct access path:
```typescript
import { resolveRenderLib } from '@opentui/core'
const lib = resolveRenderLib()
lib.writeOut(renderer.rendererPtr, kittyEscapeSequence)
```
Both `resolveRenderLib()` and `renderer.rendererPtr` are public. Create a thin wrapper (`writeKittySequence`) that uses only public APIs.

**Pixel resolution already available (from OpenTUI skill agent):** `renderer.resolution` returns `{ width: number, height: number }` representing terminal pixel dimensions, queried at startup. Cell pixel size = `renderer.resolution.width / renderer.width`. Eliminates need for CSI 16t query when renderer is available. Keep CSI 16t as fallback when `renderer.resolution` is null.

**Fallback plan if U+10EEEE fails in cell buffer:** Render a `<box height={rows}>` as a layout spacer, then use `writeOut()` with `\e[s` (save cursor) / `\e[{row};{col}H` (position) / image data / `\e[u` (restore cursor). Images won't clip to scrollbox viewport — would need manual scroll tracking and per-row visibility calculation. This is substantially harder. **Decision gate after Phase A: if U+10EEEE fails, consider half-block-only as the "good" rendering path and defer Kitty virtual placements.**

**writeOut() timing (from race-condition reviewer + OpenTUI skill agent):** writeOut() writes directly to stdout, bypassing OpenTUI's render pipeline. Must call from `useEffect` (runs after render/paint), never from render body. Kitty image transmission from useEffect is one-time upload, not per-frame. Cleanup in unmount useEffect could race with next render — use `queueMicrotask` if needed.

---

### Implementation Phases

#### Phase A: Foundation — Types, Detection, Pipeline Fixes

**Goal:** types, capability detection, and fix the pipeline to preserve image paths.

Files:
- `src/image/types.ts` (NEW)
- `src/image/detect.ts` (NEW)
- `src/image/detect.test.ts` (NEW)
- `src/pipeline/sanitize-image-src.ts` (NEW)
- `src/pipeline/sanitize-image-src.test.ts` (NEW)
- `src/ir/types.ts` (EDIT — add `'image'` to `BLOCK_TYPES`)
- `src/pipeline/rehype-ir.ts` (EDIT — use `sanitizeImageSrc` for `img`)
- `src/theme/types.ts` (EDIT — expand `ImageTokens`)
- `src/theme/dark.ts` (EDIT — add new image tokens)
- `src/theme/light.ts` (EDIT — add new image tokens)

Tasks:
- [ ] `src/image/types.ts` — define all core types:
  ```typescript
  // result type following PipelineResult pattern in src/types/pipeline.ts
  type ImageResult<T> = { ok: true; value: T } | { ok: false; error: string; cause?: unknown }

  interface LoadedImage {
      rgba: Uint8Array       // decoded RGBA pixel data
      width: number          // pixel width after resize
      height: number         // pixel height after resize
      terminalRows: number   // rows at current terminal dimensions
      terminalCols: number   // cols at current terminal dimensions
      byteSize: number       // rgba.byteLength, for memory budget tracking
      source: string         // original path/URL for cache key + error messages
  }

  interface HalfBlockCell {
      char: string           // '▄' | ' '
      fg: string             // 24-bit hex color for bottom pixel
      bg: string             // 24-bit hex color for top pixel
  }
  type HalfBlockGrid = HalfBlockCell[][]

  // distinguish virtual placement support from basic kitty graphics
  type ImageProtocol = 'kitty-virtual' | 'halfblock' | 'text'

  interface ImageCapabilities {
      protocol: ImageProtocol
      cellPixelWidth: number   // required, default 8
      cellPixelHeight: number  // required, default 16
  }
  ```
- [ ] `src/image/detect.ts` — **combined** detection with theme, replacing current separate flow:
  - [ ] Check `LIHAM_IMAGE_PROTOCOL` env var first (override, like `LIHAM_THEME`)
  - [ ] Tier 1: env var checks (`KITTY_WINDOW_ID`, `GHOSTTY_RESOURCES_DIR` → kitty-virtual; `TERM_PROGRAM === 'WezTerm'` → halfblock only; `ZELLIJ_SESSION_NAME` or `TERM` starts with `screen` → text)
  - [ ] Tier 2: **combined query** with theme detection — send OSC 11 + Kitty graphics query + CSI 16t + DA1 sentinel in single stdin raw-mode session, 80ms timeout
  - [ ] Parse responses by regex (order-independent): KITTY_RESPONSE_RE, CELL_SIZE_RE, OSC11_RE, DA1_RE
  - [ ] Cell pixel dimensions: derive from `renderer.resolution` when available (post-boot), CSI 16t response during pre-boot detection, default 8x16 fallback
  - [ ] Export `parseDetectionResponse()` separately for unit testability (follows `parseOsc11Response()` pattern)
  - [ ] **tmux handling:** check `$TMUX` env var. Verify OpenTUI version includes fix for issue #334 (DCS passthrough wrapping). If not, wrap Kitty query in `\x1bPtmux;\x1b{...}\x1b\\`
  - [ ] **Multiplexer fallback:** Zellij and GNU Screen → skip Kitty detection, return `halfblock` or `text` immediately
  - [ ] Stateless function — no module-level cache (thread result through BootContext)
  - [ ] Return type: `{ theme: 'dark' | 'light' | null; image: ImageCapabilities }`
- [ ] `src/image/detect.test.ts` — test env var parsing, response parsing, timeout fallback, tmux detection, WezTerm → halfblock
- [ ] `src/pipeline/sanitize-image-src.ts` — image-specific sanitizer with **scheme allowlist**:
  - [ ] Strip C0/C1 control characters (shared `stripControlChars()` with `sanitize-url.ts`)
  - [ ] Strip percent-encoded control chars (same as `sanitizeUrl()`)
  - [ ] Detect scheme via `/^[a-zA-Z][a-zA-Z0-9+\-.]*:/` — if present, only allow `http:` and `https:`
  - [ ] No scheme = relative path → allow through
  - [ ] Extract `stripControlChars()` and `stripPercentEncodedControls()` as shared helpers from `sanitize-url.ts`
- [ ] `src/pipeline/sanitize-image-src.test.ts` — test relative paths, scheme allowlist, percent-encoded controls, `javascript:` rejection, `file:` rejection, `data:` rejection, `blob:` rejection
- [ ] `src/ir/types.ts` — add `'image'` to `BLOCK_TYPES` set. Add comment on ImageNode keeping InlineStyle.
- [ ] `src/pipeline/rehype-ir.ts` — change `img` handler to use `sanitizeImageSrc()` instead of `sanitizeUrl()`
- [ ] `src/theme/types.ts` — expand `ImageTokens`:
  ```typescript
  export interface ImageTokens {
      fallbackColor: string
      loadingColor: string
      placeholderBg: string
  }
  ```
- [ ] `src/theme/dark.ts` + `src/theme/light.ts` — add `loadingColor`, `placeholderBg` values
- [ ] **Validation tasks:**
  - [ ] Render U+10EEEE through OpenTUI `<text>` and hex-dump terminal output
  - [ ] Test U+10EEEE **inside a `<scrollbox>`** — scroll up/down, verify characters survive clipping
  - [ ] Test `resolveRenderLib().writeOut(renderer.rendererPtr, data)` with Kitty escape sequences
  - [ ] **Decision gate:** if U+10EEEE fails, document and decide: defer Kitty to future (half-block-only MVP) or implement writeOut+cursor positioning fallback

### Research Insights: Capability Detection

**Combined query sequence (from terminal-detection-researcher):**
```
\x1b]11;?\x1b\\                                    <- OSC 11 theme query
\x1b_Gi=31,s=1,v=1,a=q,t=d,f=24;AAAA\x1b\\       <- Kitty graphics query
\x1b[16t                                            <- cell pixel size query
\x1b[c                                              <- DA1 sentinel (shared)
```
All in one write, one 80ms timeout window, one stdin session. Parse by regex, not position. Replaces current separate `detectTheme()` call.

**WezTerm gap (from Kitty-protocol-researcher):** WezTerm supports basic Kitty graphics (`a=T`) but does NOT support:
- Virtual placements (`U=1`)
- Unicode placeholders (U+10EEEE)
- Shared memory mode (`t=s`)

For liham's scrollbox use case, WezTerm **must** fall back to half-block rendering. The `ImageProtocol` type should NOT include a generic `'kitty'` value — distinguish `'kitty-virtual'` (Kitty + Ghostty) from WezTerm (half-block).

**Multiplexer handling (from terminal-detection-researcher):**
- `$TMUX` set → inside tmux, need DCS passthrough wrapping for Kitty query
- `$ZELLIJ_SESSION_NAME` set → Zellij, Sixel only (no Kitty), fall back to halfblock/text
- `$TERM` starts with `screen` and no `$TMUX` → GNU Screen, fall back immediately
- SSH: env vars stripped but escape queries still work via PTY forwarding. `t=f` mode won't work (remote filesystem), use `t=d` only.

**Success criteria:** `sanitizeImageSrc` preserves `./photo.png` while rejecting `javascript:`, `file:`, `data:`, `blob:`. `ImageNode` is a block type. Detection returns correct protocol — `kitty-virtual` for Kitty/Ghostty, `halfblock` for WezTerm/non-Kitty-24bit, `text` otherwise. Theme tokens expanded. U+10EEEE validation documented with decision.

**Depends on:** nothing

---

#### Phase B: Image Loading + Decoding

**Goal:** load local images from disk, decode with sharp, resize to terminal dimensions.

Files:
- `src/image/loader.ts` (NEW)
- `src/image/loader.test.ts` (NEW)
- `src/image/decoder.ts` (NEW)
- `src/image/decoder.test.ts` (NEW)
- `package.json` (EDIT — add `sharp` as optionalDependency)

Tasks:
- [ ] `bun add sharp` — add as **optionalDependency** (not regular dependency) to match graceful degradation behavior
- [ ] `src/image/loader.ts`:
  - [ ] `resolveImagePath(src: string, basePath: string): ImageResult<string>` — resolve relative to basePath
  - [ ] Guard against `node.url` being `undefined` — early return with error result (ImageNode.url is optional under exactOptionalPropertyTypes)
  - [ ] Path traversal check: `realpath(resolved)` must start with `realpath(basePath)` (resolve both sides, follow symlinks before check)
  - [ ] `fs.stat` size check — reject > 10MB
  - [ ] Validate magic bytes: PNG (`89504e47`), JPEG (`ffd8ff`), GIF (`474946`), WebP (bytes 0-3 `52494646` AND bytes 8-11 `57454250` — check correct offsets, not contiguous)
  - [ ] Return `ImageResult<{ bytes: Uint8Array; absolutePath: string; mtime: number }>`
  - [ ] Paths with spaces, unicode, special characters must work
- [ ] `src/image/loader.test.ts`:
  - [ ] Happy path: load PNG, JPEG, GIF, WebP from temp dir
  - [ ] Traversal rejection: `../../../etc/passwd`
  - [ ] Size rejection: file > 10MB
  - [ ] Bad magic bytes: text file renamed to `.png`
  - [ ] WebP magic bytes at correct offsets (not contiguous check)
  - [ ] Missing file: graceful error
  - [ ] Symlink: valid symlink passes, symlink pointing outside basePath fails
  - [ ] Unicode filename: `画像.png`
  - [ ] Image syntax inside code block → text, not ImageNode (negative test for pipeline)
- [ ] `src/image/decoder.ts`:
  - [ ] Lazy sharp import on first decode (not at module evaluation time — zero startup cost when no images present):
    ```typescript
    let sharpModule: typeof import('sharp').default | undefined
    export async function initSharp(): Promise<boolean> {
        try {
            sharpModule = (await import('sharp')).default
            sharpModule.cache(false)        // disable libvips internal cache (we have our own)
            sharpModule.concurrency(1)      // single-threaded, predictable memory
            return true
        } catch { return false }            // graceful degradation to text-only
    }
    ```
  - [ ] `getImageDimensions(bytes: Uint8Array): Promise<ImageResult<{ width: number; height: number }>>` — sharp metadata only (fast, no decode)
  - [ ] `decodeImage(bytes: Uint8Array, targetCols: number, cellPixelWidth: number, cellPixelHeight: number, purpose: 'kitty' | 'halfblock'): Promise<ImageResult<LoadedImage>>` — full decode + resize
  - [ ] **Decompression bomb check:** reject if `meta.width` or `meta.height` is undefined, zero, or negative. Then check `width * height > MAX_DECODED_PIXELS` (25 million)
  - [ ] **Defense-in-depth:** pass `limitInputPixels: 25_000_000` to sharp constructor (sharp's built-in protection, default 268M — set stricter)
  - [ ] Resize: `fit: 'inside'`, `withoutEnlargement: true`, `kernel: 'lanczos3'`
  - [ ] For `purpose: 'halfblock'`: round height to nearest even number (pad to even for clean half-block pairs)
  - [ ] For `purpose: 'kitty'`: resize to `targetCols * cellPixelWidth` pixels wide
  - [ ] GIF: first frame only (sharp default `pages: 1`, document intent with explicit option)
  - [ ] WebP: disable `fastShrinkOnLoad` if precise kernel control is needed
  - [ ] Return `ImageResult<LoadedImage>` with RGBA buffer
  - [ ] **Decode semaphore:** limit concurrent sharp pipelines to 2 (prevents memory spikes on resize with many visible images). Simple promise-based semaphore, separate from remote fetch semaphore.
  - [ ] sharp.concurrency(1) + decode semaphore(2) = max 2 concurrent single-threaded decodes
- [ ] `src/image/decoder.test.ts`:
  - [ ] Decode PNG, JPEG, GIF, WebP to RGBA
  - [ ] Resize maintains aspect ratio
  - [ ] Dimensions-only path returns correct values without full decode
  - [ ] 1x1 pixel image: minimum 1 terminal row
  - [ ] Corrupt image: graceful error (ImageResult.ok === false)
  - [ ] Decompression bomb: reject image with huge dimensions but small file size
  - [ ] Zero/undefined dimensions: rejected
  - [ ] Half-block purpose: output height is even

### Research Insights: sharp Pipeline

**Correct RGBA extraction pipeline (from sharp-researcher, verified against official docs):**
```typescript
const { data, info } = await sharp(bytes, {
    limitInputPixels: 25_000_000,   // defense-in-depth
    pages: 1,                        // first frame for animated GIF/WebP
    failOn: 'error',                 // default, good balance
})
    .ensureAlpha()                   // guarantee 4 channels (RGBA)
    .resize(targetWidth, null, {
        fit: 'inside',               // never upscale, maintain aspect ratio
        kernel: 'lanczos3',          // best quality for downscaling photos
        withoutEnlargement: true,    // never upscale beyond original
    })
    .raw()                           // output raw pixel data
    .toBuffer({ resolveWithObject: true })

// info.width, info.height = actual resized dimensions
// info.channels = 4 (guaranteed by ensureAlpha)
// data = Uint8Array of RGBA pixels, length = width * height * 4
```

**sharp + Bun compatibility (from sharp-researcher):** Officially supported since sharp v0.33.0. Uses Node-API (N-API), which Bun implements 95%+. Installation: `bun add sharp`. Known issue: Alpine Linux / musl-libc environments may have runtime errors. Prebuilt binaries available for macOS x64/ARM64, Linux glibc, Windows.

**Memory notes (from sharp-researcher):**
- `sharp.cache(false)` disables libvips operation cache (default: 50MB memory, 20 files, 100 ops). No benefit for sequential unrelated images.
- `sharp.concurrency(1)` limits native threads per operation. Default is CPU core count. For a TUI tool, single-threaded is predictable.
- `fastShrinkOnLoad` (default true) helps JPEG/WebP significantly — libjpeg decodes at 1/2, 1/4, 1/8 scale during decompression. A 4000x3000 JPEG being resized to 160px wide benefits enormously.
- For a typical resize operation: input ~200KB, decoded ~8MB, output ~57KB (160x90 RGBA).

**Success criteria:** can load `./photo.png` relative to a markdown file, decode to RGBA, resize to fit 80 columns. Path traversal rejected. 10MB file limit enforced. Decompression bomb rejected. Zero/undefined dimensions rejected.

**Depends on:** Phase A (types)

---

#### Phase C: Half-Block Fallback Renderer

**Goal:** convert RGBA pixel data to styled character grid for non-Kitty terminals.

Files:
- `src/image/halfblock.ts` (NEW)
- `src/image/halfblock.test.ts` (NEW)

Tasks:
- [ ] `src/image/halfblock.ts`:
  - [ ] `renderHalfBlock(image: LoadedImage, bgColor: string): HalfBlockGrid`
  - [ ] Image height already padded to even by decoder (purpose: 'halfblock')
  - [ ] Use **lower half block** U+2584 (▄) — industry convention from viu/viuer, timg
  - [ ] For each pair of vertically adjacent pixels: `{ char: '▄', fg: bottomHex, bg: topHex }`
  - [ ] Alpha blending: straight alpha compositing against `bgColor`:
    ```
    result = (fg * alpha + bg * (255 - alpha)) / 255  // per channel, integer arithmetic
    ```
  - [ ] **Same-color optimization:** when top and bottom pixels have same color after blending, emit `{ char: ' ', fg: '', bg: color }` — saves foreground escape sequence
  - [ ] **Full transparency:** when both pixels fully transparent, emit `{ char: ' ', bg: bgColor }`
  - [ ] ~60 lines of core logic
- [ ] `src/image/halfblock.test.ts`:
  - [ ] 2x2 red/blue image -> correct fg/bg hex values
  - [ ] Transparent pixel blends against bgColor
  - [ ] 1x1 image (padded to 1x2) -> 1 row, 1 cell
  - [ ] Same-color optimization: space character when top == bottom
  - [ ] All-transparent image: spaces with bgColor

### Research Insights: Half-Block Rendering

**Convention from viuer/viu (from half-block-researcher):** The lower half block (U+2584) fills the bottom of the cell. Set `fg = bottomPixelColor` and `bg = topPixelColor`. This is the standard across viu/viuer, timg, chafa (with `--symbols vhalf`), and TerminalImageViewer.

**No dithering needed (from half-block-researcher):** With 24-bit truecolor (16.7M colors), there is no quantization step. Dithering solves color banding from quantization, which doesn't occur with truecolor. At terminal resolution, dithering introduces visible noise that degrades the image.

**Performance (from half-block-researcher):** For an 80-column, 40-row pixel image (20 terminal rows): 80 * 20 = 1600 cells. Single pass over pixel buffer, <1ms. Bottleneck is not the grid conversion but the ANSI output size and React element count.

**React output optimization (from performance-oracle):** The half-block grid produces ~3200 `<span>` elements for a full-width image. React reconciliation of 3200 elements on every re-render is not free. **Memoize** the half-block React output with `React.memo` and custom comparison on `contentHash + targetWidth`. Prevents re-diffing on unrelated re-renders (scroll, keyboard).

**Alternative characters (from half-block-researcher):** Quarter blocks (2x2 per cell) offer higher spatial resolution but must map 4 pixel colors to 2 (fg+bg), reducing color accuracy. Sextant characters have poor font support. Braille is monochrome only. **Half blocks are the correct choice for color images.**

**Native alternative (from OpenTUI skill agent):** OpenTUI has `drawSuperSampleBuffer` in the Zig backend that does RGBA-to-half-block natively. However, it requires imperative API access through `OptimizedBuffer`, which conflicts with the React component model. Pure-TS approach is simpler and maintainable. Consider the native path as a future optimization.

**Success criteria:** 4x4 test image produces correct `HalfBlockGrid` with expected colors. ~60 lines of core logic.

**Depends on:** Phase B (LoadedImage type)

---

#### Phase D: OpenTUI Renderer Adapter

**Goal:** the image component that ties everything together — Kitty virtual placements, half-block rendering, text fallback, loading states.

Files:
- `src/image/kitty.ts` (NEW — pure Kitty protocol functions)
- `src/image/kitty.test.ts` (NEW)
- `src/renderer/opentui/image.tsx` (NEW)
- `src/renderer/opentui/image-context.tsx` (NEW)
- `src/renderer/opentui/index.tsx` (EDIT — add image block dispatch)
- `src/renderer/opentui/app.tsx` (EDIT — provide ImageContext, thread capabilities)
- `src/renderer/opentui/boot.tsx` (EDIT — add imageCapabilities to BootContext)
- `src/cli/index.ts` (EDIT — run combined detection at startup, pass to BootContext)

Tasks:

**Kitty protocol module (`src/image/kitty.ts` — pure functions, no React):**
- [ ] `generateImageId(source: string, pid: number): number` — content hash of source + PID, mod 255 + 1 (range 1-255 for MVP, 8-bit foreground color)
- [ ] `buildTransmitChunks(id: number, pngBytes: Uint8Array): string` — concatenate ALL chunks into a single string buffer (not separate writeOut calls):
  - [ ] 4096-byte base64 chunks, first chunk has full control data, subsequent only `m` key
  - [ ] `U=1,q=2,f=100,t=d` for direct PNG transmission
  - [ ] For local files that don't need resize: `t=f` with base64-encoded absolute path
  - [ ] Return single string ready for one writeOut() call
- [ ] `buildVirtualPlacement(id: number, cols: number, rows: number): string` — `a=p,U=1,i={id},c={cols},r={rows},q=2`
- [ ] `buildPlaceholderText(id: number, rows: number, cols: number): string` — generate U+10EEEE characters with diacritics:
  - [ ] Embed the 297-entry diacritics lookup table from Kitty's `rowcolumn-diacritics.txt`
  - [ ] Image ID in foreground color: `\e[38;5;{id}m` (8-bit for IDs 1-255)
  - [ ] Row/column diacritics on each placeholder character
  - [ ] Diacritics inheritance: only emit on first cell per row, subsequent cells inherit (bandwidth optimization)
- [ ] `buildCleanupCommand(id: number): string` — `a=d,d=I,i={id},q=2` (uppercase I frees memory)
- [ ] `buildCleanupAllCommand(): string` — `a=d,d=A,q=2` (for process exit handler)
- [ ] **CRITICAL:** never string-interpolate user data into escape sequences. All values must be numeric (image ID, row/col counts) or base64-encoded (file paths, pixel data).
- [ ] `src/image/kitty.test.ts` — test chunk generation, diacritics encoding, cleanup commands, edge cases (1x1 image, max-size image)

**Context + wiring:**
- [ ] `src/renderer/opentui/image-context.tsx` — React context:
  ```typescript
  interface ImageContextValue {
      basePath: string
      capabilities: ImageCapabilities
      bgColor: string       // from theme tokens, for half-block alpha blending
  }
  ```
- [ ] `src/renderer/opentui/boot.tsx` — add `imageCapabilities: ImageCapabilities` to both BootContext variants
- [ ] `src/cli/index.ts` — call combined detection during startup (replaces separate `detectTheme()`), pass both theme and imageCapabilities to BootContext. Add `LIHAM_IMAGE_PROTOCOL` env var support. Add `--info` output for image protocol + cell dimensions + sharp availability.
- [ ] `src/renderer/opentui/app.tsx` — wrap render tree with `<ImageContext.Provider>` using filePath + capabilities + bgColor. **NOT provided for browser preview path** — preview uses text-only fallback.
- [ ] `src/renderer/opentui/index.tsx` — add `case 'image': return renderImageBlock(node, key)` in `renderNode()` switch. `renderImageBlock` is a thin wrapper that renders `<ImageBlock node={node} key={key} />`.
- [ ] **ReturnToBrowser cleanup:** when mode switches from viewer to browser, clear image cache, send Kitty cleanup for all active IDs. Handle in ImageContext.Provider unmount effect or explicit dispatch.

**Image component (`image.tsx`):**
- [ ] State machine: `'idle' | 'loading' | 'loaded' | 'error'` (4 states, not 5 — merged loading-meta/loading-decode)
- [ ] `useContext(ImageContext)` — if context is missing (browser preview), render text fallback immediately
- [ ] Guard against `node.url` being `undefined` — early return to text fallback
- [ ] **Invocation counter pattern** (not boolean stale flag):
  ```typescript
  const loadIdRef = useRef(0)
  useEffect(() => {
      const thisLoadId = ++loadIdRef.current
      async function load() {
          // ... each await checks: if (loadIdRef.current !== thisLoadId) return
      }
      load()
      return () => { /* cleanup: Kitty delete, clear animation timer */ }
  }, [node.url, ctx.basePath, terminalWidth])  // include width for resize
  ```
- [ ] **Local images — pre-emptive sizing:**
  - [ ] Read dimensions via `getImageDimensions()` (fast, <1ms)
  - [ ] Reserve `<box height={rows}>` immediately (no layout jump)
  - [ ] Decode in background, render image into reserved space
- [ ] **Loading display:** static `[loading: alt]` text with theme `loadingColor` (not wave animation — simpler, no timers)
- [ ] **Kitty rendering (when `capabilities.protocol === 'kitty-virtual'`):**
  - [ ] Access renderer via `useRenderer()` from `@opentui/react`
  - [ ] Use `resolveRenderLib().writeOut(renderer.rendererPtr, data)` for all escape sequences
  - [ ] All writeOut calls in useEffect (after render), never in render body
  - [ ] Transmit + place + render placeholders in useEffect on mount/URL change
  - [ ] Cleanup on unmount: send cleanup command via writeOut
  - [ ] **Process exit handler:** register `process.on('exit', ...)` to send cleanup for all active image IDs (process.exit in onDestroy skips React cleanup)
- [ ] **Half-block rendering (when `capabilities.protocol === 'halfblock'`):**
  - [ ] Call `renderHalfBlock()` from shared layer
  - [ ] Map `HalfBlockGrid` to `<text>` rows of `<span fg={fg} bg={bg}>{char}</span>`
  - [ ] Wrap in `React.memo` with custom comparison on `contentHash + targetWidth`
- [ ] **Text fallback (when `capabilities.protocol === 'text'` or decode error or missing context):**
  - [ ] Render `[image: alt]` with theme `fallbackColor` (current behavior)
- [ ] **Error states:**
  - [ ] File not found: `[image: alt (not found)]`
  - [ ] Too large: `[image: alt (too large)]`
  - [ ] Decode failed: `[image: alt]`
  - [ ] Never include raw file path or URL in error text without `sanitizeForTerminal()`
- [ ] **React keys:** use `image-{nodeIndex}-{contentHash}` (not `image-{contentHash}` alone — duplicate images in same parent produce duplicate keys)
- [ ] **Resize handling:** derive terminal width from React context/state (not separate `useOnResize()`). Width in useEffect dependency array triggers re-decode via invocation counter. Image-specific debounce: 500ms (longer than app's 100ms — sharp decode is expensive, brief display of wrong-size image during drag is acceptable).
- [ ] **Inflight promise map** for request coalescing: when multiple components request decode of the same cache key simultaneously, share the same Promise instead of starting parallel decodes (~15 LOC).

**`--info` flag update:**
- [ ] `src/cli/index.ts` — add image protocol, cell pixel dimensions, sharp availability, `LIHAM_IMAGE_PROTOCOL` override status to `--info` diagnostics output

### Research Insights: Kitty Virtual Placement Protocol

**Complete virtual placement lifecycle (from Kitty-protocol-researcher, verified against spec and Kitty Go source):**

Step 1 — Transmit image invisibly:
```
\x1b_Gi={id},f=100,t=d,U=1,q=2,m=1;{chunk1_base64}\x1b\
\x1b_Gm=1;{chunk2_base64}\x1b\
\x1b_Gm=0;{final_chunk_base64}\x1b\
```
- `U=1` = virtual placement mode (store, don't display)
- `q=2` = suppress ALL responses (both OK and errors, confirmed from Kitty Go source: `GRT_quiet_silent`)
- `f=100` = PNG format (terminal decodes)
- Only first chunk needs full control data; subsequent MUST have ONLY `m` key (and optionally `q`)
- Chunk size: 4096 bytes of base64
- **CRITICAL:** must finish ALL chunks before sending any other graphics commands
- **Concatenate all chunks into single buffer, one writeOut() call** — reduces syscall overhead from N writes to 1

Step 2 — Create virtual placement:
```
\x1b_Ga=p,U=1,i={id},c={cols},r={rows},q=2\x1b\
```

Step 3 — Emit placeholder text (rendered by application):
```
\e[38;5;{id}m              <- set foreground color to image ID (8-bit)
\U10EEEE\U0305\U0305       <- placeholder char + row 0 diacr + col 0 diacr
\U10EEEE\U0305\U030D       <- row 0, col 1 (inherits from left if same fg)
\e[39m\n                    <- reset fg, newline
```
Diacritics: 297-entry table from `rowcolumn-diacritics.txt`. U+0305=0, U+030D=1, U+030E=2, U+0310=3, U+0312=4, U+033D=5, etc.

Step 4 — Cleanup (on unmount):
```
\x1b_Ga=d,d=I,i={id},q=2\x1b\
```
- `d=I` (uppercase) = delete placements AND free image data from memory
- `d=i` (lowercase) = only remove placements, data stays — causes memory leaks

**Image ID management (from Kitty-protocol-researcher + race-condition-reviewer):**
- IDs are **terminal-global**, not per-process. Two liham instances can collide.
- Include PID in hash input: `hash(source + process.pid) mod 255 + 1`
- For MVP: IDs 1-255 using 8-bit foreground `\e[38;5;{id}m`. A single document with 5-10 images is well within range.
- If > 255 needed later: 24-bit foreground `\e[38;2;{r};{g};{b}m` where RGB encodes the ID
- Verify 24-bit encoding works in Ghostty before using (only confirmed in Kitty)

### Research Insights: Race Condition Prevention

**Invocation counter pattern (from race-condition-reviewer, pattern exists in app.tsx:314):**
```typescript
const loadIdRef = useRef(0)
useEffect(() => {
    const thisLoadId = ++loadIdRef.current
    const controller = new AbortController()  // fresh per invocation

    async function load() {
        setState('loading')
        const result = await loadAndDecode(node.url, ctx, controller.signal)
        if (loadIdRef.current !== thisLoadId) return  // superseded
        if (!result.ok) { setState('error'); return }
        setImage(result.value)
        setState('loaded')
    }
    load()

    return () => {
        controller.abort()
        // Kitty cleanup for this specific image
    }
}, [node.url, ctx.basePath, terminalWidth])
```

**Key race scenarios (from race-condition-reviewer):**
1. **Rapid URL changes** — invocation counter ensures only latest result is used (boolean stale flag fails for A→B→C rapid changes)
2. **Cache stampede** — inflight promise map prevents duplicate decodes for same image
3. **Resize pile-up** — 500ms debounce + decode semaphore(2) + invocation counter discards stale results
4. **Process exit** — `process.on('exit', ...)` with synchronous `fs.writeSync` for Kitty cleanup (process.exit skips React useEffect cleanup)
5. **Cache eviction during render** — separate Kitty cleanup from cache eviction. Eviction only frees RGBA pixel data. Kitty `a=d,d=I` only sent on component unmount, not on cache eviction. Re-mount triggers re-decode from disk (fast for local files).
6. **writeOut() interleaving** — all writeOut calls from useEffect (after render), never from render body. Prevents interleaving with OpenTUI's ANSI output.

**Cleanup ordering on quit (from race-condition-reviewer):**
- `renderer.destroy()` → `process.exit(0)` (boot.tsx line 32) — synchronous, React cleanup never runs
- Must register `process.on('exit', callback)` that iterates all active image IDs and writes cleanup commands synchronously
- `process.on('exit')` runs synchronously, cannot do async I/O — use `fs.writeSync(1, ...)` to write to stdout
- SIGKILL cannot be caught — document `printf '\x1b_Ga=d,d=A\x1b\\'` as manual cleanup

**Success criteria:** local PNG renders via Kitty protocol in Kitty terminal. Half-block fallback works in non-Kitty 24-bit terminals (including WezTerm). Text fallback works everywhere. No layout jump for local images. No stale images after file switch or rapid navigation.

**Depends on:** Phase A, B, C

---

#### Phase E: LRU Memory Cache

**Goal:** prevent unbounded memory usage from decoded image data.

### Research Insights: Simplification (from code-simplicity-reviewer)

**The simplicity reviewer recommends eliminating the full LRU cache for MVP.** A typical markdown document has 0-5 images at ~0.5MB each (terminal resolution). The 50MB budget is never hit in normal use. A simple `Map<string, LoadedImage>` with `clear()` on file switch may suffice.

**Counter-argument (from performance-oracle):** Image-heavy documentation with 20+ images will exceed the budget. LRU eviction prevents unbounded growth. The 50MB budget is for edge cases, not normal use.

**Recommendation:** implement a lightweight LRU (not a full data structure) — track insertion order, evict oldest when budget exceeded. ~50 LOC, not the ~120 LOC full implementation originally planned.

Files:
- `src/image/cache.ts` (NEW)
- `src/image/cache.test.ts` (NEW)
- `src/renderer/opentui/image.tsx` (EDIT — use cache)

Tasks:
- [ ] `src/image/cache.ts` — **factory function** `createImageCache(budgetBytes: number)`:
  - [ ] Key: `absolutePath + mtime + targetWidth` (include target dimensions — prevents serving wrong-resolution images after resize)
  - [ ] Value: `LoadedImage` (RGBA buffer)
  - [ ] Track `byteSize` per entry, total budget
  - [ ] 50MB per-document budget (hardcoded, defer configurability)
  - [ ] LRU eviction: when budget exceeded, evict least-recently-accessed entries
  - [ ] `get(key)` / `set(key, image)` / `clear()` / `totalBytes()` API
  - [ ] **Generic eviction callback:** `onEvict?: (key: string) => void` — no imageId parameter (keeps cache renderer-agnostic). Renderer looks up its own metadata if needed.
  - [ ] `clear()` called on file switch (browser mode) and ReturnToBrowser mode transition
  - [ ] **NO Kitty cleanup on eviction** — separation of concerns. Kitty cleanup only on component unmount. Eviction means re-decode on next mount, which is fast for local files.
- [ ] `src/image/cache.test.ts`:
  - [ ] Basic get/set/eviction
  - [ ] Budget enforcement: add entries until eviction triggers
  - [ ] LRU order: access pattern affects eviction order
  - [ ] Clear resets everything
  - [ ] Same key returns cached value
  - [ ] Key includes target dimensions — different widths = different entries
- [ ] `src/renderer/opentui/image.tsx` — check cache before decode, store after decode
- [ ] Disable sharp's internal libvips cache: `sharp.cache(false)` to avoid double-caching

**Success criteria:** 20 images at 3MB each -> cache holds ~16, evicts oldest. File switch clears all entries. Resize produces new cache entries (key includes width).

**Depends on:** Phase B (LoadedImage type)

---

#### Phase F: Remote Image Fetching

**Goal:** fetch `https://` images with loading state.

### Research Insights: Simplification (from code-simplicity-reviewer)

**The simplicity reviewer recommends deferring Phase F to a future release.** Most markdown images are local files. Remote image support is a convenience feature. The plan can ship Phases A-E (local images working end-to-end) and add remote as a follow-up.

**If included in MVP, simplify significantly:**
- No concurrent semaphore (edge case of edge case)
- No streaming byte counter (Content-Length check + AbortSignal.timeout covers 99%)
- No temp file cache with TTL (just re-fetch, images are small)
- No redirect chain tracking (use redirect: 'manual' for HTTPS downgrade check only)

Files:
- `src/image/remote.ts` (NEW)
- `src/image/remote.test.ts` (NEW)

Tasks:
- [ ] `src/image/remote.ts`:
  - [ ] `fetchRemoteImage(url: string, signal?: AbortSignal): Promise<ImageResult<Uint8Array>>`
  - [ ] Scheme allowlist: `https:` only by default. Allow `http:` behind `LIHAM_ALLOW_HTTP_IMAGES=1` env var (from security-sentinel — prevents cleartext fetch by default).
  - [ ] `fetch(url, { signal: AbortSignal.any([AbortSignal.timeout(5000), signal]), redirect: 'manual' })` — **redirect: 'manual'** not 'follow' (enables per-hop validation)
  - [ ] Manual redirect loop (max 5 hops):
    - [ ] Check each `Location` URL against scheme allowlist
    - [ ] Reject HTTPS → HTTP downgrade at each hop
    - [ ] Reject redirect to non-http schemes
  - [ ] Check `Content-Length` header — reject > 10MB early
  - [ ] **Streaming size limit:** byte counter on response body, abort at 10MB (do not rely on Content-Length alone — can be spoofed/omitted)
  - [ ] Write to buffer, validate via `loader.ts` (magic bytes check)
  - [ ] **SSRF mitigation (from security-sentinel):** block private/link-local IPs after DNS resolution: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`, `169.254.0.0/16`, `::1`, `fd00::/8`, `fe80::/10`. A malicious README could reference `http://169.254.169.254/` (cloud metadata).
- [ ] `src/image/remote.test.ts`:
  - [ ] Mock fetch for: successful PNG, 404, timeout, oversized, redirect chain
  - [ ] HTTPS downgrade rejection
  - [ ] Private IP blocking
  - [ ] Streaming abort at 10MB
- [ ] `src/renderer/opentui/image.tsx` — integrate remote fetcher:
  - [ ] Detect remote URL (starts with `http://` or `https://`)
  - [ ] Pass `AbortController.signal` for cancellation on file switch
  - [ ] Show static `[loading: alt]` text during fetch
  - [ ] On abort (file switch): silently discard via invocation counter

**Success criteria:** remote PNG loads with loading text. Timeout at 5s. Size limit enforced via streaming. Cancelled on file switch. HTTPS downgrade rejected. Private IPs blocked.

**Depends on:** Phase B (loader), Phase D (image component)

---

### Phase Dependency Graph

```
A (types, detect, pipeline fixes)
├── B (loader, decoder, sharp)
│   ├── C (halfblock) ─┐
│   │                   └── D (renderer adapter) <- also depends on A, B
│   └── E (cache)
└── F (remote) <- depends on B, D
```

Phases A → B → C → D is the critical path. E and F can be developed after B and D respectively.

**Simplification option (from code-simplicity-reviewer):** Merge C into D (half-block is ~60 LOC consumed only by image.tsx), defer F to future release. Result: 4 phases (A, B, D, E) instead of 6.

## System-Wide Impact

### Interaction Graph

CLI startup → combined theme+image detection (single raw-mode session, 80ms) → pass through BootContext → App provides ImageContext (NOT for browser preview) → image component mounts → resolves path via loader → checks cache → decodes via sharp (with decompression bomb check + decode semaphore) → stores in LRU cache → renders via Kitty virtual placement (writeOut via resolveRenderLib) / half-block grid / text. On file change: watcher fires → pipeline re-runs → React reconciler diffs → unchanged images survive via stable keys → changed images re-decode. On file switch: cache cleared with generic callback → all image components unmount → Kitty cleanup commands sent via useEffect cleanup + process.on('exit') handler. On ReturnToBrowser: cache cleared, Kitty cleanup for all active IDs.

### Error Propagation

- **Loader errors** (not found, traversal, size, magic bytes) → `ImageResult<T>` with `ok: false` → image component shows specific fallback text
- **Decoder errors** (corrupt image, sharp failure, decompression bomb) → caught via ImageResult → `[image: alt]` or `[image: alt (too large)]` fallback
- **Remote errors** (timeout, 404, size, HTTPS downgrade, private IP) → `ImageResult<T>` with `ok: false` → fallback text
- **Kitty protocol errors** → suppressed via `q=2` flag → no stdin noise
- **sharp import failure** → `initSharp()` returns false → `ImageCapabilities.protocol` forced to `'text'` if no sharp available → all images fall back to text-only mode. Shown in `--info` output.
- **OpenTUI U+10EEEE failure** → detected in Phase A validation → documented decision gate
- **Missing ImageContext** (browser preview) → `useContext` returns undefined → text fallback

### State Lifecycle Risks

- **Partial image transmission on exit:** process.on('exit') handler sends `a=d,d=I` for all active IDs synchronously. SIGKILL cannot be caught — images persist in terminal memory.
- **Cache stale after image file edit:** watcher only watches the markdown file, not referenced images. Cache keys include mtime, so reopening triggers new decode.
- **React re-render causing Kitty flicker:** stable content-hash keys prevent unmount/remount of unchanged images. Only changed images re-transmit.
- **sharp thread pool exhaustion:** mitigated by `sharp.concurrency(1)` + decode semaphore(2). Max 2 concurrent single-threaded decodes.
- **Cache eviction does NOT delete Kitty images:** by design. Kitty cleanup only on component unmount. Eviction means re-decode on next mount.
- **Image IDs terminal-global:** PID included in hash to minimize cross-process collisions. Two liham instances in tmux could still collide at very low probability.

### Integration Test Scenarios

1. Open markdown with 3 local images (PNG, JPEG, GIF) → all render in Kitty terminal → resize terminal → images re-render at new width after 500ms debounce
2. Open markdown with `![](https://example.com/photo.png)` → loading text → image appears → press Escape → fetch cancelled
3. Open markdown with `![](../../../etc/passwd)` → path traversal rejected → `[image: alt (not found)]` shown
4. Open markdown with 25 images totaling 80MB decoded → cache evicts to stay under 50MB → scrolling back re-decodes evicted images
5. Open markdown in WezTerm → half-block fallback renders (NOT Kitty virtual placements) → verify no escape sequence garbage
6. Open markdown with tiny PNG that decodes to enormous dimensions → decompression bomb rejected → `[image: alt (too large)]`
7. File switch while remote images loading → AbortController fires → invocation counter discards stale results → no stale images appear in new file
8. Open markdown with same image referenced 5 times → single decode via inflight map → single cache entry → 5 separate React components with unique keys
9. ReturnToBrowser from viewer with images → cache cleared → Kitty cleanup sent → return to browser
10. Open markdown with image inside blockquote/list → renders as block within parent container
11. Open markdown in tmux → DCS passthrough wrapping for detection query → correct protocol detected
12. `--info` output shows image protocol, cell dimensions, sharp availability
13. `LIHAM_IMAGE_PROTOCOL=text` overrides auto-detection → text fallback everywhere

## Acceptance Criteria

### Functional Requirements

- [ ] Local PNG, JPEG, GIF, WebP images render inline via Kitty protocol in Kitty and Ghostty terminals
- [ ] Half-block character fallback on non-Kitty terminals with 24-bit color (including WezTerm)
- [ ] Text fallback `[image: alt]` on minimal terminals
- [ ] Remote `https://` images fetch with loading text indicator
- [ ] Path traversal prevention (reject paths outside markdown directory)
- [ ] 10MB per-image file size limit, 25MP decoded pixel limit, 50MB per-document memory budget
- [ ] Pre-emptive sizing for local images (no layout jump)
- [ ] Virtual placements scroll correctly inside `<scrollbox>` (or validated fallback documented)
- [ ] Kitty images cleaned up on normal exit (process.on('exit') handler with `d=I`)
- [ ] Image protocol and cell dimensions shown in `--info` output
- [ ] File switch in browser mode clears image cache and aborts remote fetches
- [ ] `LIHAM_IMAGE_PROTOCOL` env var overrides auto-detection
- [ ] Browser preview mode uses text-only fallback for images
- [ ] ReturnToBrowser mode transition clears cache and sends Kitty cleanup
- [ ] Duplicate images in same document share single cache entry (inflight promise map)
- [ ] React keys unique for duplicate image references (position-based, not content-only)
- [ ] WezTerm detected as half-block only (NOT Kitty virtual placements)
- [ ] sharp availability shown in `--info` output
- [ ] Images inside blockquotes, lists, and headings render correctly as block elements

### Non-Functional Requirements

- [ ] Image decode completes in < 200ms for typical images (< 2MB)
- [ ] No new `@opentui` imports outside `src/renderer/opentui/`
- [ ] All `src/image/` modules work independently of rendering framework
- [ ] `sharp` import failure degrades gracefully to text-only fallback
- [ ] No sharp internal cache (disabled with `sharp.cache(false)`)
- [ ] sharp.concurrency(1) for predictable single-threaded processing
- [ ] Decode semaphore limits concurrent sharp pipelines to 2
- [ ] Combined theme + image detection in single stdin session (~80ms startup)

### Quality Gates

- [ ] Co-located tests for all `src/image/` modules (`bun:test`)
- [ ] Security tests: path traversal, oversized file, bad magic bytes, scheme allowlist (not blocklist), decompression bomb, percent-encoded control chars
- [ ] Pipeline tests: `sanitizeImageSrc` preserves relative paths, rejects `javascript:`, `file:`, `data:`, `blob:`, allows `https:`
- [ ] Half-block tests: pixel-level color accuracy, same-color optimization, transparency blending
- [ ] Kitty protocol tests: chunk generation, diacritics encoding, cleanup commands, image ID uniqueness with PID
- [ ] Race condition tests: invocation counter discards stale results, inflight map prevents duplicate decodes
- [ ] All existing 246 tests still pass
- [ ] ESLint clean: max-lines 500, cognitive-complexity 15
- [ ] TypeScript strict: `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`

## Alternative Approaches Considered

**Jimp instead of sharp:** Jimp is already a transitive dependency via OpenTUI, which would avoid adding a native dep. However, sharp is significantly faster for large images, has explicit Bun support, and handles more formats. The native binary adds ~30MB to node_modules but is prebuilt for all major platforms. If sharp import fails at runtime, fall back to text-only (graceful degradation). sharp added as `optionalDependency` to reflect this.

**Direct placement instead of virtual placements:** simpler Kitty protocol usage, but images float at absolute screen positions and break when scrolling. Virtual placements are required for correct scrollbox behavior. WezTerm only supports direct placements, which is why it falls back to half-block.

**Image path resolution at compile time (in rehype-ir):** Would embed absolute paths in IR, making it non-portable. Renderer-time resolution via React context is cleaner and keeps the IR agnostic.

**Scheme blocklist for sanitizeImageSrc:** Originally proposed DANGEROUS_SCHEMES blocklist. Replaced with scheme allowlist after security review — blocklist is bypassable with unknown schemes (blob:, ftp:, gopher:, etc.).

**Boolean stale flag for async cancellation:** Originally proposed staleRef.current boolean. Replaced with invocation counter after race condition review — boolean is insufficient for rapid A→B→C URL changes. Counter pattern already proven in app.tsx:314.

**Full LRU cache with eviction callbacks for Kitty cleanup:** Replaced with generic eviction callback + separate Kitty cleanup on component unmount. Keeps cache renderer-agnostic, prevents "disappearing image" bug where eviction deletes Kitty data from mounted components.

## Risk Analysis & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| U+10EEEE fails in OpenTUI | Medium | High | Validate in Phase A (cell buffer is Uint32Array — promising). Decision gate: half-block-only MVP or writeOut+cursor fallback |
| sharp fails to install on user's platform | Low | Medium | optionalDependency + graceful degradation to text-only. Document in README |
| Kitty protocol varies across terminals | Medium | Medium | WezTerm detected as half-block (no virtual placements). Test on Kitty, Ghostty. Suppress with `q=2` |
| Large images cause OOM | Low | High | 10MB file limit, 25MP pixel limit + sharp.limitInputPixels, 50MB memory budget, LRU eviction, sharp.cache(false), sharp.concurrency(1), decode semaphore(2) |
| Remote fetch hangs | Low | Medium | 5s timeout, AbortSignal, streaming size limit |
| `app.tsx` exceeds max-lines | Medium | Low | All image logic in `image.tsx`, `image-context.tsx`, `kitty.ts`. Keep `app.tsx` changes minimal |
| Decompression bomb | Low | High | metadata() dimension check + sharp.limitInputPixels(25M) — double protection |
| Race condition: stale image renders | Medium | Medium | Invocation counter (not boolean), AbortController per effect, inflight promise map |
| Cross-process image ID collision | Low | Low | PID in hash input. Two liham instances in tmux: very low collision probability |
| tmux DCS passthrough issues | Medium | Medium | Check OpenTUI version for issue #334 fix. Wrap queries if needed. Fall back to half-block. |
| sanitizeImageSrc bypass | Low | High | Scheme allowlist (not blocklist), percent-encoded control char stripping, MAX_URL_LENGTH |
| SSRF via remote image fetch | Medium | Medium | Block private/link-local IPs after DNS resolution. HTTPS-only by default. |
| process.exit skips Kitty cleanup | High | Medium | process.on('exit') handler with synchronous writeSync for all active IDs |

## Known Limitations (Intentional)

- **SIGKILL cleanup:** Kitty images persist after unclean exit. User can clear with `printf '\x1b_Ga=d,d=A\x1b\\'`
- **Image file watching:** watcher monitors the markdown file, not referenced images. Editing an image requires re-opening the markdown file or triggering a re-render
- **SVG not supported:** sharp can decode SVG but with platform-dependent librsvg. Excluded from magic bytes validation. May add in future
- **Animated GIF:** first frame only. Full animation deferred (see TODO.md Tier 3)
- **No `--no-images` flag:** defer to future. Users can set `LIHAM_IMAGE_PROTOCOL=text` as workaround
- **HEIC not supported:** patent-encumbered, not in sharp prebuilt binaries
- **Image IDs limited to 1-255 for MVP:** 24-bit encoding (IDs > 255) deferred. Documents with 255+ images use text fallback for overflow.
- **`file:` URIs not supported:** `file:///path/to/image.png` rejected by sanitizer. Relative and http/https paths work. Common in Pandoc-generated markdown.
- **`data:` URIs not supported:** `data:image/png;base64,...` rejected. Potential decompression bomb vector. Common in Mermaid diagram output.
- **WezTerm limited to half-block:** WezTerm does not support Kitty virtual placements (U+10EEEE). Images render via half-block characters, not Kitty protocol.
- **Browser preview: text-only images:** Image components in browser preview mode render `[image: alt]` text, not actual images, to avoid performance issues from rapid file browsing.
- **BMP not supported:** sharp can decode BMP but not in magic bytes validation. Add if users request.

## Sources & References

### Origin

- **Design document:** [docs/plans/2026-03-06-feat-phase-6-kitty-graphics-protocol-design.md](docs/plans/2026-03-06-feat-phase-6-kitty-graphics-protocol-design.md) — renderer-agnostic split, sharp, virtual placements, half-block fallback, LRU cache, remote fetch
- **Rewrite plan Phase 6:** [docs/plans/2026-03-04-feat-liham-typescript-opentui-rewrite-plan.md](docs/plans/2026-03-04-feat-liham-typescript-opentui-rewrite-plan.md) — original specification with capability detection tiers, security requirements, memory budget

### Internal References

- Current image fallback: `src/renderer/opentui/inline.tsx:30-38`
- ImageNode IR type: `src/ir/types.ts:145-150`
- BLOCK_TYPES set: `src/ir/types.ts:199-212`
- URL sanitizer (reference): `src/pipeline/sanitize-url.ts`
- Image IR compilation: `src/pipeline/rehype-ir.ts:504-513`
- Theme detection (pattern): `src/theme/detect.ts`
- BootContext: `src/renderer/opentui/boot.tsx:14-25`
- Renderer dispatch: `src/renderer/opentui/index.tsx:22-70`
- App component: `src/renderer/opentui/app.tsx`
- ImageTokens: `src/theme/types.ts:30-32`
- Invocation counter pattern: `src/renderer/opentui/app.tsx:314` (fileChangeIdRef)
- PipelineResult type: `src/types/pipeline.ts`
- Debouncer pattern: `src/watcher/watcher.ts:42-57`
- OpenTUI writeOut: accessible via `resolveRenderLib().writeOut(renderer.rendererPtr, data)` from `@opentui/core`
- OpenTUI cell buffer: `Uint32Array` (node_modules/@opentui/core bundled JS line 9532)
- OpenTUI ScrollBox: scissor rects for clipping (bundled JS line 14278-14287)
- OpenTUI renderer.resolution: pixel dimensions queried at startup
- OpenTUI drawSuperSampleBuffer: native half-block rendering (buffer.d.ts line 57) — future optimization path

### External References

- [Kitty Graphics Protocol spec](https://sw.kovidgoyal.net/kitty/graphics-protocol/) — escape sequences, virtual placements, chunked transfer, diacritics encoding
- [Kitty rowcolumn-diacritics.txt](https://sw.kovidgoyal.net/kitty/_downloads/f0a0de9ec8d9ff4456206db8e0814937/rowcolumn-diacritics.txt) — 297-entry diacritics table
- [Kitty icat source (Go)](https://github.com/kovidgoyal/kitty/blob/master/kittens/icat/transmit.go) — reference implementation, q=2 usage
- [Kitty graphics command constants (Go)](https://github.com/kovidgoyal/kitty/blob/master/tools/tui/graphics/command.go) — GRT_quiet_silent = q=2
- [sharp documentation](https://sharp.pixelplumbing.com/) — image decoding, metadata, resize, raw output, cache control
- [sharp input metadata](https://sharp.pixelplumbing.com/api-input/) — metadata() for fast dimension extraction
- [sharp constructor options](https://sharp.pixelplumbing.com/api-constructor/) — limitInputPixels, failOn, pages
- [sharp + Bun issue #3511](https://github.com/lovell/sharp/issues/3511) — Bun support resolved in v0.33.0
- [Kitty discussions: Basics for a Good Image Protocol](https://github.com/kovidgoyal/kitty/discussions/6936) — design rationale for virtual placements
- [WezTerm Kitty graphics issue #986](https://github.com/wezterm/wezterm/issues/986) — no virtual placement support
- [Ghostty protocol improvements tracker](https://github.com/ghostty-org/ghostty/issues/8272) — 0/6 complete as of 2026
- [OpenTUI issue #334](https://github.com/anomalyco/opentui/issues/334) — Kitty query leaking into tmux pane title
- [viuer block.rs source](https://github.com/atanunq/viuer/blob/master/src/printer/block.rs) — half-block reference implementation
- [timg terminal image viewer](https://github.com/hzeller/timg) — half-block delta encoding, same-color optimization
- [chafa terminal graphics](https://hpjansson.org/chafa/) — symbol matching, dithering modes
