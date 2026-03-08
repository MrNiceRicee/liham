---
title: "Phase 6 Continued: Quick Wins, Remote Fetch, GIF Animation, Image Links"
type: feat
status: completed
date: 2026-03-06
origin: docs/handoffs/2026-03-06-phase-6-continued.md
---

# Phase 6 Continued: Quick Wins, Remote Fetch, GIF Animation, Image Links

## Enhancement Summary

**Deepened on:** 2026-03-06
**Sections enhanced:** All 4 phases + new prerequisite phase
**Research agents used:** OpenTUI skill, TypeScript reviewer, Performance oracle, Security sentinel, Architecture strategist, Pattern recognition, Frontend races reviewer, Code simplicity reviewer, Best practices researcher

### Key Improvements from Research

1. **New prerequisite phase (Phase 0):** Extract `useImageLoader` hook from `ImageBlock` to reduce complexity before adding features. Fix hooks violation properly. Extract `createSemaphore()` utility. Fix `clearImageCache()` bug.
2. **`<a href>` cannot wrap `<box>` in OpenTUI** — Phase 4 redesigned: link wrapping must happen per-row inside `<text>` elements, not around the image container.
3. **`LoadedFile` discriminated union** (`kind: 'local' | 'remote'`) replaces sentinel values (`absolutePath: ''`, `mtime: 0`).
4. **Optional fields for animated images** (`frames?`, `delays?` on `LoadedImage`) instead of discriminated union — zero migration cost for existing consumers.
5. **Fetch semaphore removed** — decode semaphore (max 2) already serializes the expensive work. Add fetch coalescing instead.
6. **SSRF hardened:** `redirect: 'manual'` with hop limit, IPv6-mapped IPv4 blocking, `decompress: false` to prevent compression bombs.
7. **Pre-computed half-block frames** for GIF animation — eliminates 200K+ allocations/second per animated GIF.
8. **GIF delay clamp follows browser convention:** delay <=10ms -> 100ms (Chrome/Firefox/Safari behavior).
9. **Kitty 24-bit image IDs documented** as upgrade path — true-color foreground (`\x1b[38;2;R;G;Bm`) enables 16M IDs. Keep 8-bit (255 wrap) for now.
10. **AbortSignal.any() null guard bug** — optional `signal` parameter must be guarded before composing.

### New Considerations Discovered

- **Fetch semaphore slot leak on unmount** (race condition) — eliminated by removing the semaphore entirely
- **Kitty transmit completes after cleanup** — need stale check after async PNG encode
- **Stale frameIndex after live reload** — explicit reset + defensive index clamp
- **`clearImageCache()` does not clear `inflightDecodes`** — latent bug to fix in Phase 0
- **`compileParagraph` promotion already works** for image links when `compileAnchor` returns `ImageNode` directly

---

## Overview

Four branches of remaining image work on top of the Phase 6 MVP (merged to `main`, 316 tests). Each branch is independently mergeable and ordered to unblock testing and reduce risk.

**Branch order:** prerequisite refactor -> quick-wins -> remote fetch -> gif animation -> image links.

## Problem Statement

Phase 6 MVP delivers local image rendering via half-block and Kitty virtual placements. Five gaps remain:

1. No CLI flag to disable images (`LIHAM_IMAGE_PROTOCOL=text` is the workaround but undiscoverable)
2. Kitty image IDs collide after 255 images (8-bit hash range)
3. Remote images (`https://`) are allowed by the URL sanitizer but never fetched
4. Animated GIFs show only the first frame
5. Image links (`[![img](src)](href)`) render the image but lose the link

Plus: `ImageBlock` component is at the complexity ceiling (170+ lines, 4 state vars, 2 refs, 3 render paths, nested async closures). Adding features without refactoring first will exceed the sonarjs cognitive-complexity 15 threshold.

## Technical Approach

### Architecture

```
src/image/semaphore.ts    <- Phase 0: shared createSemaphore() utility (NEW)
src/image/fetcher.ts      <- Phase 2: fetchRemoteImage() (NEW)
src/renderer/opentui/
  use-image-loader.ts     <- Phase 0: extracted hook (NEW)
  image.tsx               <- Phase 0: restructured; Phases 2-4: incremental changes
cli/index.ts              <- Phase 1: --no-images flag
image/kitty.ts            <- Phase 1: monotonic image IDs
image/types.ts            <- Phase 2: LoadedFile union; Phase 3: animated fields
image/decoder.ts          <- Phase 0: use createSemaphore; Phase 3: multi-frame decode
pipeline/rehype-ir.ts     <- Phase 4: href threading to ImageNode
ir/types.ts               <- Phase 4: href field on ImageNode
```

### Implementation Phases

---

#### Phase 0: Prerequisite Refactor (on `feat/phase-6-quick-wins` branch, before Phase 1 items)

Reduce `ImageBlock` complexity and fix existing bugs before adding features.

##### 0a. Extract `createSemaphore()` utility

The decode semaphore pattern in `decoder.ts` (23 lines of inline promise-based code) will be needed again. Extract it once.

```typescript
// src/image/semaphore.ts
interface Semaphore {
    acquire(signal?: AbortSignal): Promise<void>
    release(): void
}

function createSemaphore(max: number): Semaphore {
    let active = 0
    const queue: { resolve: () => void; rejected: boolean }[] = []

    return {
        async acquire(signal?: AbortSignal) {
            if (active < max) { active++; return }
            return new Promise<void>((resolve, reject) => {
                const entry = { resolve, rejected: false }
                queue.push(entry)
                signal?.addEventListener('abort', () => {
                    const idx = queue.indexOf(entry)
                    if (idx !== -1) {
                        queue.splice(idx, 1)
                        entry.rejected = true
                        reject(signal.reason)
                    }
                }, { once: true })
            })
        },
        release() {
            while (queue.length > 0) {
                const entry = queue.shift()!
                if (!entry.rejected) { entry.resolve(); return }
            }
            active--
        },
    }
}
```

The abort-aware design prevents slot leaks when components unmount while waiting in the queue (critical race condition identified by review).

Refactor `decoder.ts` to use `createSemaphore(2)` instead of inline state.

**Files:** `src/image/semaphore.ts` (new), `src/image/decoder.ts`
**Tests:** Semaphore acquire/release, abort removes waiter from queue, no slot leak
**Effort:** ~40 lines new, ~20 lines removed from decoder

##### 0b. Fix hooks violation in `ImageBlock`

The early return at `image.tsx:99` (`if (ctx == null || node.url == null) return renderTextFallback(...)`) is before `useEffect`, violating React's rules of hooks. If `ctx` transitions between `null` and non-null (browser preview vs viewer mode), React throws.

**Fix:** Declare all hooks unconditionally at the top. Move conditional logic inside the hooks and the render return:

```typescript
function ImageBlock({ node, nodeKey }: ImageBlockProps) {
    const ctx = useContext(ImageContext)
    const [state, setState] = useState<ImageState>('idle')
    const [image, setImage] = useState<LoadedImage | null>(null)
    const [errorMsg, setErrorMsg] = useState('')
    const loadIdRef = useRef(0)

    useEffect(() => {
        // skip loading when no context or no URL or text-only protocol
        if (ctx == null || node.url == null) return
        if (ctx.capabilities.protocol === 'text') return
        // ... existing loading logic
    }, [node.url, ctx?.basePath, ctx?.capabilities.protocol, ctx?.maxCols])

    // ... other hooks

    // conditional rendering AFTER all hooks
    if (ctx == null || node.url == null || ctx.capabilities.protocol === 'text') {
        return renderTextFallback(node, nodeKey)
    }
    // ... normal render paths
}
```

**Files:** `src/renderer/opentui/image.tsx`
**Effort:** ~15 lines restructured

##### 0c. Extract `useImageLoader` hook

Move the loading state machine, cache lookup, inflight coalescing, and decode orchestration out of `ImageBlock` into a custom hook:

```typescript
// src/renderer/opentui/use-image-loader.ts
function useImageLoader(
    url: string | undefined,
    ctx: ImageContextValue | null,
): { state: ImageState; image: LoadedImage | null; errorMsg: string }
```

This hook encapsulates `loadIdRef`, `inflightDecodes` map, cache get/set, `loadImageFile()` call, `decodeImage()` call, and stale detection. `ImageBlock` becomes a thin rendering shell.

**Files:** `src/renderer/opentui/use-image-loader.ts` (new), `src/renderer/opentui/image.tsx`
**Effort:** ~100 lines moved (not new code, just relocated)

##### 0d. Fix `clearImageCache()` bug

`clearImageCache()` resets the LRU cache (called on `ReturnToBrowser` / file switch) but does not clear `inflightDecodes`. A stale decode in flight could populate the new cache with an old result.

**Fix:** Clear both in `clearImageCache()`:

```typescript
export function clearImageCache(): void {
    imageCache.clear()
    inflightDecodes.clear()
}
```

**Files:** `src/renderer/opentui/image.tsx`
**Effort:** 1 line

##### 0e. Add stale check after Kitty PNG encode

The `transmitKittyImage()` function does an async PNG encode via sharp, then writes escape sequences. If the component unmounts or the image changes during the encode, the transmit completes after cleanup deleted the old image — creating a ghost overlay.

**Fix:** Check staleness after the async encode:

```typescript
// inside transmitKittyImage, after PNG encode
if (loadIdRef.current !== thisLoadId) return  // superseded
```

**Files:** `src/renderer/opentui/image.tsx` (or `use-image-loader.ts` after extraction)
**Effort:** 2 lines

##### Phase 0 acceptance criteria

- [x] `createSemaphore()` utility extracted, decoder refactored to use it
- [x] Semaphore is abort-aware (no slot leak on unmount during queue wait)
- [x] All hooks in `ImageBlock` called unconditionally (no early return before hooks)
- [x] `useImageLoader` hook extracted, `ImageBlock` is a thin rendering shell
- [x] `clearImageCache()` also clears `inflightDecodes`
- [x] Kitty transmit has stale check after PNG encode
- [x] All 316 existing tests pass, lint clean

---

#### Phase 1: Quick Wins (`feat/phase-6-quick-wins`)

Three small, independent items. Unblocks testing for all subsequent branches.

##### 1a. `--no-images` flag

Add `--no-images` to `parseCliArgs()` in `src/cli/index.ts`.

```typescript
// src/cli/index.ts — parseCliArgs options
'no-images': { type: 'boolean', default: false },
```

Thread through the existing detection flow:

```typescript
// src/cli/index.ts — after resolveDetection()
if (flags['no-images']) {
    detection.image = { protocol: 'text', cellPixelWidth: 0, cellPixelHeight: 0 }
}
```

**`--info` output:** Display `image protocol: text (--no-images)` when active.

**Loading skip:** The `useImageLoader` hook (extracted in Phase 0) checks `ctx.capabilities.protocol === 'text'` and returns early — no wasted decode.

**Files:** `src/cli/index.ts`
**Tests:** CLI flag parsing, verify text fallback with `--no-images`
**Effort:** ~10 lines

##### 1b. Monotonic image IDs

Replace `generateImageId()` hash-based approach with a monotonic counter.

**Current problem:** `hash % 255 + 1` means documents with >255 images get ID collisions.

**Constraint:** Kitty virtual placements encode the image ID in the 8-bit foreground color index (`\x1b[38;5;{id}m`). IDs must be 1-255. A monotonic counter wraps at 255.

```typescript
// src/image/kitty.ts
let nextImageId = 0

export function generateImageId(): number {
    nextImageId = (nextImageId % 255) + 1
    return nextImageId
}
```

**No `resetImageIdCounter()` export.** Tests should assert behavioral properties (monotonic, wraps at 255, never returns 0), not absolute counter state.

**ID recycling:** Transmitting with an existing ID implicitly replaces the old image in the terminal. Combined with the stale check after PNG encode (Phase 0e), this prevents ghost overlays from recycled IDs.

### Research Insights: Kitty 24-bit Image IDs

The Kitty protocol is NOT limited to 8-bit IDs. True-color foreground (`\x1b[38;2;R;G;Bm`) enables 24-bit IDs (R + G*256 + B*65536 = up to 16,777,215). A third diacritic from the rowcolumn table extends to full 32-bit. Source: [Kitty graphics protocol docs](https://sw.kovidgoyal.net/kitty/graphics-protocol/).

For a markdown previewer displaying a handful of images, 8-bit (255 wrap) is sufficient. The 24-bit upgrade path is documented here for future use if needed — change `\x1b[38;5;{id}m` to `\x1b[38;2;{id & 0xFF};{(id >> 8) & 0xFF};{(id >> 16) & 0xFF}m` in `buildPlaceholderText()`.

**Files:** `src/image/kitty.ts`, `src/image/kitty.test.ts`
**Tests:** Counter wraps at 255, sequence is 1,2,...,255,1,2,..., never returns 0
**Effort:** ~10 lines

##### 1c. U+10EEEE scrollbox validation

**Decision gate, not a code change.** OpenTUI docs do not cover supplementary-plane Unicode handling in scrollboxes — empirical testing required.

**Test procedure:**
1. Open a markdown with an image rendering via Kitty virtual placement
2. Scroll the image partially out of view — check for layout corruption
3. Scroll it back — verify restoration

**Outcomes:**
- **Pass:** Kitty virtual placements viable in scrollboxes. No code change.
- **Fail:** Force `halfblock` for images inside scrollboxes.

**Files:** None (manual test) or `src/renderer/opentui/image.tsx` if it fails
**Effort:** ~30 min manual testing + ~5 lines if fix needed

##### Phase 1 acceptance criteria

- [x] `--no-images` flag disables all image rendering (text fallback)
- [x] `--no-images` skips image loading (no wasted decode)
- [x] `--info` reflects `--no-images` override
- [x] Image IDs are monotonic 1-255, wrapping correctly
- [x] No ID collision for documents with >255 images
- [x] U+10EEEE scrollbox behavior documented (pass or fail + fix)
- [x] All existing tests pass, lint clean

---

#### Phase 2: Remote Fetch (`feat/phase-6-remote-fetch`)

HTTP image fetching with timeout, size limit, SSRF basics.

##### 2a. `LoadedFile` discriminated union

Replace the flat `LoadedFile` type with a discriminated union. Sentinel values (`absolutePath: ''`, `mtime: 0`) are unsafe — any code passing `absolutePath` to `fs.stat()` would silently do the wrong thing.

```typescript
// src/image/types.ts
interface LocalFile {
    kind: 'local'
    bytes: Uint8Array
    absolutePath: string
    mtime: number
}

interface RemoteFile {
    kind: 'remote'
    bytes: Uint8Array
    url: string
}

type LoadedFile = LocalFile | RemoteFile
```

Update `loadImageFile()` to return `ImageResult<LocalFile>`. Cache key function branches on `kind`:

```typescript
function imageCacheKey(file: LoadedFile, targetWidth: number): string {
    if (file.kind === 'local') return `${file.absolutePath}:${String(file.mtime)}:${String(targetWidth)}`
    return `${file.url}:${String(targetWidth)}`
}
```

**Files:** `src/image/types.ts`, `src/image/loader.ts`, `src/image/cache.ts`, `src/renderer/opentui/use-image-loader.ts`
**Effort:** ~20 lines

##### 2b. `fetchRemoteImage()` function

New module `src/image/fetcher.ts` — fetch logic is conceptually distinct from local file I/O.

```typescript
export async function fetchRemoteImage(
    url: string,
    signal?: AbortSignal,
): Promise<ImageResult<RemoteFile>>
```

**Fetch logic:**

1. SSRF check (see 2c)
2. Compose abort signal — **guard optional signal against null:**
   ```typescript
   const timeoutSignal = AbortSignal.timeout(10_000)
   const combined = signal != null
       ? AbortSignal.any([timeoutSignal, signal])
       : timeoutSignal
   ```
3. `fetch(url, { redirect: 'manual', signal: combined, decompress: false })` — manual redirects for SSRF validation, `decompress: false` prevents compression bombs
4. Handle redirects manually (see 2c)
5. Stream body with byte counter — abort at 10MB:
   ```typescript
   const reader = response.body!.getReader()
   const chunks: Uint8Array[] = []
   let totalBytes = 0
   while (true) {
       const { done, value } = await reader.read()
       if (done) break
       totalBytes += value.byteLength
       if (totalBytes > MAX_FILE_SIZE) {
           await reader.cancel()
           return { ok: false, error: 'remote image too large' }
       }
       chunks.push(value)
   }
   const bytes = Buffer.concat(chunks)
   chunks.length = 0  // release chunk references for GC
   ```
6. Validate magic bytes (reuse `isValidMagicBytes()` from loader.ts)
7. Return `{ ok: true, value: { kind: 'remote', bytes, url } }`

**No Content-Type validation.** Magic bytes are authoritative — CDNs frequently serve `application/octet-stream` for images. Content-Type headers lie.

**Error messages — terse, matching existing convention:**
- `'remote image too large'`
- `'remote image failed'` (timeout, network error, bad magic bytes, any other failure)
- `'remote image blocked'` (SSRF)

**Files:** `src/image/fetcher.ts` (new)
**Tests:** Mock fetch for success, timeout, size limit, bad magic bytes, network error
**Effort:** ~70 lines

##### 2c. SSRF mitigations with redirect validation

Inline check inside `fetchRemoteImage()` — not a separate function. Blocks the most obvious attacks (cloud metadata, localhost services) without over-engineering.

```typescript
function isBlockedHost(hostname: string): boolean {
    const bare = hostname.replace(/^\[|\]$/g, '')  // strip IPv6 brackets
    if (bare === 'localhost' || bare === '::1' || bare === '0.0.0.0' || bare === '[::]') return true
    if (bare.startsWith('127.') || bare.startsWith('169.254.')) return true
    // IPv6-mapped IPv4 bypass prevention
    if (/^::ffff:/i.test(bare)) {
        const mapped = bare.replace(/^::ffff:/i, '')
        if (mapped.startsWith('127.') || mapped.startsWith('169.254.')) return true
    }
    return false
}
```

**Redirect handling:** `redirect: 'manual'` with validation at each hop, max 5 redirects:

```typescript
let currentUrl = url
for (let hops = 0; hops < 5; hops++) {
    const response = await fetch(currentUrl, { redirect: 'manual', signal: combined, decompress: false })
    if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location')
        if (location == null) return { ok: false, error: 'remote image failed' }
        currentUrl = new URL(location, currentUrl).href
        const redirectHost = new URL(currentUrl).hostname
        if (isBlockedHost(redirectHost)) return { ok: false, error: 'remote image blocked' }
        continue
    }
    // success — proceed to body streaming
    break
}
```

**What is NOT blocked (and why):** Private LAN ranges (10.x, 172.16.x, 192.168.x) — a CLI user fetching from their LAN is a legitimate use case. DNS rebinding (hostname resolving to private IP after check) — not standard for CLI tools; VS Code, Obsidian, and marked.js do not do this. Source: OWASP SSRF cheat sheet is scoped to server-side applications, not desktop CLI tools.

**Files:** `src/image/fetcher.ts`
**Effort:** Included in 2b's ~70 lines

##### 2d. Image component routing + fetch coalescing

Update `useImageLoader` hook to detect URL scheme and route to fetch vs local load.

```typescript
const isRemote = url?.startsWith('http://') || url?.startsWith('https://')
```

**Fetch coalescing:** Add `inflightFetches` map (keyed by URL) alongside existing `inflightDecodes` map. Two components rendering the same remote URL share one fetch instead of consuming two independent network requests:

```typescript
const inflightFetches = new Map<string, Promise<ImageResult<RemoteFile>>>()
```

Check and coalesce before fetching. Clear entry when promise settles.

**No fetch semaphore.** The decode semaphore (max 2) already serializes the CPU-bound work. Network I/O is non-blocking — fetching all images concurrently and letting them queue at the decode semaphore is simpler and faster (network latency is parallelized).

**Files:** `src/renderer/opentui/use-image-loader.ts`
**Tests:** Remote URL triggers fetch path, duplicate URLs coalesced
**Effort:** ~25 lines

##### Phase 2 acceptance criteria

- [x] `https://` images render correctly (half-block + Kitty)
- [x] `http://` images also work
- [x] Timeout at 10s produces error fallback
- [x] Response >10MB rejected (streaming byte counter)
- [x] Magic bytes validated for remote images
- [x] Localhost, 127.x, 169.254.x, `[::1]`, `0.0.0.0` blocked
- [x] IPv6-mapped IPv4 (`::ffff:127.0.0.1`) blocked
- [x] Redirects validated per-hop, max 5
- [x] `decompress: false` prevents compression bombs
- [x] Duplicate remote URLs coalesced into single fetch
- [x] `LoadedFile` is `LocalFile | RemoteFile` discriminated union
- [x] In-flight fetches aborted on unmount
- [x] Cache works for remote images (second render is instant)
- [x] All existing tests pass, lint clean
- [x] Test with Bluesky CDN URL from handoff doc

---

#### Phase 3: GIF Animation (`feat/phase-6-gif-animation`)

Animated GIF frame cycling via half-block rendering. Kitty virtual placements are not viable for animation (re-transmitting per frame is too expensive), so animated GIFs always use half-block regardless of terminal capabilities.

##### 3a. Optional fields on `LoadedImage`

Add animation fields as optional properties — zero migration cost for existing consumers:

```typescript
// src/image/types.ts
export interface LoadedImage {
    rgba: Uint8Array        // first frame (always present)
    width: number
    height: number
    terminalRows: number
    terminalCols: number
    byteSize: number
    source: string
    frames?: Uint8Array[]   // all frames including first (animated GIFs only)
    delays?: number[]       // ms per frame, clamped (animated GIFs only)
}
```

`rgba` always holds the first frame. `image.frames != null` means animated. Existing consumers (`halfblock.ts` destructuring `rgba`, `image.tsx` Kitty transmit using `img.rgba`, cache using `byteSize`) need zero changes.

With `exactOptionalPropertyTypes: true`, `frames` and `delays` must be omitted entirely (not set to `undefined`) for static images. The decoder returns `{ ...staticFields }` without `frames`/`delays` for single-frame images, and `{ ...staticFields, frames, delays }` for animated GIFs.

**Files:** `src/image/types.ts`
**Effort:** 3 lines added to interface

##### 3b. Multi-frame decode

Update `decodeImage()` in `src/image/decoder.ts` to detect and decode animated GIFs.

**Detection:** After `sharp(bytes).metadata()`, check `metadata.pages > 1`.

**Decode flow:**

```typescript
const frameCount = Math.min(pages ?? 1, MAX_GIF_FRAMES)
const frames: Uint8Array[] = []
let totalDecoded = 0

for (let i = 0; i < frameCount; i++) {
    const frame = sharp(bytes, { page: i, limitInputPixels: 25_000_000 })
        .resize(targetWidth, undefined, { fit: 'inside', withoutEnlargement: true, kernel: 'lanczos3' })
        .ensureAlpha()
    // pad height to even for half-block
    const meta = await frame.metadata()
    if (meta.height! % 2 !== 0) {
        frame.extend({ bottom: 1, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    }
    const buf = new Uint8Array(await frame.raw().toBuffer())
    totalDecoded += buf.byteLength
    // cumulative byte check during loop, not only after
    if (totalDecoded > MAX_GIF_DECODED_BYTES) break
    frames.push(buf)
}
```

**Frame delays — follow browser convention:** Clamp delay <=10ms to 100ms. GIF delay=0 means "unspecified"; all major browsers (Chrome, Firefox, Safari) normalize <=10ms to ~100ms. Source: [Mozilla bug #232822](https://bugzilla.mozilla.org/show_bug.cgi?id=232822), [Chromium issue #271424748](https://issuetracker.google.com/issues/271424748).

```typescript
const MIN_FRAME_DELAY_MS = 100  // browser convention for delay <= 10ms
const clampedDelays = (delay ?? []).slice(0, frames.length).map(d =>
    d <= 10 ? MIN_FRAME_DELAY_MS : d
)
```

**Constants:**

```typescript
const MAX_GIF_FRAMES = 20
const MAX_GIF_DECODED_BYTES = 10 * 1024 * 1024
```

**Return:** Set `rgba` to `frames[0]` (first frame), include `frames` and `delays`:

```typescript
return {
    ok: true,
    value: {
        rgba: frames[0],
        width, height, terminalRows, terminalCols,
        byteSize: totalDecoded,
        source,
        frames,
        delays: clampedDelays,
    },
}
```

**Static GIF:** `metadata.pages === 1` uses existing single-frame path. No `frames`/`delays` on the result.

**Files:** `src/image/decoder.ts`
**Tests:** Animated GIF decodes multiple frames, frame cap works, delay <=10ms clamped to 100ms, cumulative byte check, static GIF unchanged
**Effort:** ~50 lines

##### 3c. Pre-computed half-block frames + frame cycling

### Research Insight: Performance

Calling `renderHalfBlockMerged()` per frame at 10-20fps creates ~40,000 short-lived allocations per frame per GIF (pixel blending, hex strings, MergedSpan objects). At 5 animated GIFs, that is 200K+ allocations/second — guaranteed GC jank. Source: Performance oracle analysis.

**Fix: Pre-render all frames when the image loads, not on each tick.**

```typescript
// inside ImageBlock, after image loads
const renderedFramesRef = useRef<MergedSpan[][][] | null>(null)

useEffect(() => {
    if (image?.frames == null) { renderedFramesRef.current = null; return }
    renderedFramesRef.current = image.frames.map(rgba => {
        const frameImg: LoadedImage = { ...image, rgba }
        return renderHalfBlockMerged(frameImg, ctx.bgColor)
    })
}, [image, ctx.bgColor])
```

Frame cycling becomes an index swap into pre-rendered arrays — O(1) per tick.

**Frame cycling timer with drift compensation:**

```typescript
const [frameIndex, setFrameIndex] = useState(0)
const frameStartRef = useRef(performance.now())

useEffect(() => {
    if (image?.frames == null || image?.delays == null) return
    const targetDelay = image.delays[frameIndex] ?? 100
    const elapsed = performance.now() - frameStartRef.current
    const adjustedDelay = Math.max(0, targetDelay - elapsed)

    const timer = setTimeout(() => {
        frameStartRef.current = performance.now()
        setFrameIndex(i => (i + 1) % image.frames!.length)
    }, adjustedDelay)
    return () => clearTimeout(timer)
}, [image, frameIndex])
```

Using `setTimeout` per frame (not `setInterval`) because GIF frames have per-frame delays. `requestAnimationFrame` is not available in terminal renderers. Source: [Josh Comeau's useTimeout](https://www.joshwcomeau.com/snippets/react-hooks/use-timeout/).

**Frame index reset on image change:** The loading hook (Phase 0c) sets `setFrameIndex(0)` when a new image loads. Defensive clamp in render path:

```typescript
const safeIndex = image?.frames != null
    ? Math.min(frameIndex, image.frames.length - 1)
    : 0
```

**Rendering:** Use pre-rendered frames when available, fall back to live rendering for static images:

```typescript
const rows = renderedFramesRef.current?.[safeIndex]
    ?? renderHalfBlockMerged(image, ctx.bgColor)
```

Update `HalfBlockRows` to accept `MergedSpan[][]` directly (instead of `LoadedImage`):

```typescript
interface HalfBlockRowsProps {
    readonly rows: MergedSpan[][]
    readonly width: number
}

const HalfBlockRows = memo(function HalfBlockRows({ rows, width }: HalfBlockRowsProps) {
    // ... render rows
}, (prev, next) => prev.rows === next.rows)
```

**Protocol degradation for animated GIFs:** Two inline conditionals, not an abstraction:

```typescript
let effectiveProtocol = ctx.capabilities.protocol
if (image.frames != null) effectiveProtocol = 'halfblock'
if (node.href != null && effectiveProtocol === 'kitty-virtual') effectiveProtocol = 'halfblock'
```

**Files:** `src/renderer/opentui/image.tsx`
**Tests:** Frame cycling timer fires, frameIndex wraps, pre-rendered frames used, cleanup on unmount
**Effort:** ~50 lines

##### 3d. Cache and memory

Animated images stored in the main LRU cache. `byteSize` is the sum of all frame RGBA data. A 20-frame GIF at 500KB/frame = 10MB, which is 20% of the 50MB budget — acceptable.

Pre-rendered `MergedSpan[][][]` arrays live in a `useRef` per `ImageBlock` instance (not in the shared cache). They are GC'd when the component unmounts.

**Files:** No changes to `src/image/cache.ts`
**Effort:** 0 lines

### Research Insight: `toHex()` Lookup Table

The `toHex()` function in `halfblock.ts` creates 7 string allocations per call (3x `toString(16)`, 3x `padStart`, 1x template literal). Called twice per pixel pair. Use a pre-computed lookup table:

```typescript
const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'))
function toHex(r: number, g: number, b: number): string {
    return `#${HEX[r]}${HEX[g]}${HEX[b]}`
}
```

~50% reduction in string allocations within `renderHalfBlockMerged`. Especially impactful for the one-time pre-render of all GIF frames. Source: Performance oracle.

**Files:** `src/image/halfblock.ts`
**Effort:** 3 lines

##### Phase 3 acceptance criteria

- [x] Animated GIFs cycle through frames at correct delays
- [x] Static GIFs (1 frame) render identically to current behavior
- [x] Frame count capped at 20
- [x] Cumulative decoded size capped at 10MB per GIF (checked during loop)
- [x] Frame delays <=10ms clamped to 100ms (browser convention)
- [x] Animated GIFs use half-block even on Kitty terminals
- [x] Static images on Kitty terminals still use Kitty virtual placements
- [x] Half-block frames pre-rendered once, not per tick
- [x] `toHex()` uses lookup table
- [x] Timer cleared on unmount
- [x] Frame index resets on image change, with defensive clamp
- [x] Timer drift compensated
- [x] All existing tests pass, lint clean

---

#### Phase 4: Image Links (`feat/phase-6-image-links`)

`[![img](src)](href)` renders a clickable image using OSC 8 hyperlinks.

### Research Insight: OpenTUI `<a>` Nesting Rules

**`<a href>` is a text modifier in OpenTUI — it only works inside `<text>`.** It cannot wrap `<box>` elements. The OpenTUI docs explicitly state text modifiers only work inside `<text>`, alongside `<span>`, `<strong>`, `<em>`, `<u>`, and `<br>`. Source: OpenTUI skill research, `references/components/text-display.md`.

This means the original plan (wrapping the image `<box>` in `<a>`) is **invalid**. The link must be applied **per-row inside `<text>` elements** for half-block rendering.

##### 4a. IR compilation — thread href to ImageNode

Add optional `href` to `ImageNode`:

```typescript
// src/ir/types.ts — ImageNode
interface ImageNode {
    type: 'image'
    alt: string
    url?: string
    href?: string
    style: InlineStyle
}
```

Use the spread pattern for `exactOptionalPropertyTypes`:

```typescript
return { ...imgNode, ...(href.length > 0 ? { href } : {}) }
```

**In `compileAnchor()`:** Detect single `<img>` child and return an `ImageNode` with `href` attached:

```typescript
// inside compileAnchor
const children = node.children.filter(isElement)
if (children.length === 1 && children[0].tagName === 'img') {
    const imgNode = compileInline(state, children[0])
    if (imgNode != null && imgNode.type === 'image') {
        return { ...imgNode, ...(href.length > 0 ? { href } : {}) }
    }
}
// normal link compilation...
```

**Paragraph promotion already works.** Since `compileAnchor` now returns an `ImageNode` directly (not a `LinkNode` wrapping an `ImageNode`), the existing `compileParagraph` check (`children[0]?.type === 'image'`) handles promotion without modification. Source: Pattern recognition review.

**Files:** `src/ir/types.ts`, `src/pipeline/rehype-ir.ts`
**Tests:** `[![alt](img.png)](https://example.com)` compiles to `ImageNode` with `href`, promoted out of paragraph
**Effort:** ~15 lines

##### 4b. ImageBlock link wrapping — per-row inside `<text>`

Since `<a>` only works inside `<text>`, the link must wrap each row's content individually.

**Half-block path:** Modify `HalfBlockRows` to accept an optional `href` and wrap each row's spans inside `<a>`:

```typescript
interface HalfBlockRowsProps {
    readonly rows: MergedSpan[][]
    readonly width: number
    readonly href?: string
}

const HalfBlockRows = memo(function HalfBlockRows({ rows, width, href }: HalfBlockRowsProps) {
    return (
        <box style={{ height: rows.length, width }}>
            {rows.map((spans, rowIdx) => (
                <text key={rowIdx}>
                    {href != null ? <a href={href}>{renderSpans(spans)}</a> : renderSpans(spans)}
                </text>
            ))}
        </box>
    )
}, (prev, next) => prev.rows === next.rows && prev.href === next.href)
```

Each row's spans are wrapped in `<a>`, which emits OSC 8 per `<text>` line. Terminal emulators render the link indicator for each row — the entire image area becomes clickable.

**Text fallback path:** Link inside `<text>`:

```typescript
<text key={key}>
    <a href={node.href}><span style={{ fg: node.style.fg }}>[image: {node.alt}]</span></a>
</text>
```

**Kitty degradation:** Kitty virtual placements replace cell content — OSC 8 sequences are consumed. When `node.href` is present and protocol is `kitty-virtual`, force half-block. This is already handled by the inline conditional in Phase 3c:

```typescript
if (node.href != null && effectiveProtocol === 'kitty-virtual') effectiveProtocol = 'halfblock'
```

**effectiveProtocol as useEffect dependency:** The loading hook must re-trigger when protocol changes (e.g., live reload adds an href → Kitty degrades to halfblock → need to re-render without Kitty transmit):

```typescript
// in useImageLoader dependencies
[node.url, ctx?.basePath, effectiveProtocol, ctx?.maxCols]
```

**Mixed-content links:** Only pure image links (`[![img](src)](href)`) get image-link treatment. Mixed content like `[text ![img](src)](href)` compiles normally — the anchor has multiple children, so it does not match the single-`<img>`-child check.

**Files:** `src/renderer/opentui/image.tsx`
**Tests:** Half-block rows wrapped in `<a>` per row, text fallback link, Kitty degrades to halfblock
**Effort:** ~20 lines

##### Phase 4 acceptance criteria

- [x] `[![alt](img.png)](https://example.com)` renders a clickable image
- [x] Half-block rows wrapped in `<a>` per row (OSC 8 per line)
- [x] `<a>` is inside `<text>`, not wrapping `<box>` (OpenTUI constraint)
- [x] Kitty terminals degrade to half-block for linked images
- [x] Text fallback shows `[image: alt]` as clickable link
- [x] Pure image links promoted out of paragraphs
- [x] Mixed-content links render normally (no special treatment)
- [x] `effectiveProtocol` in useEffect dependencies
- [x] `href` uses spread pattern for `exactOptionalPropertyTypes`
- [x] All existing tests pass, lint clean

---

## System-Wide Impact

### Interaction graph

- Phase 0: Internal refactor — extract hooks, fix bugs, no behavioral change
- Phase 1: CLI flag -> detection result -> ImageContext -> useImageLoader (simple override)
- Phase 2: useImageLoader -> new fetch path -> existing decode -> existing cache -> existing render
- Phase 3: Decoder -> animated fields on LoadedImage -> ImageBlock frame timer -> pre-rendered HalfBlockRows
- Phase 4: IR compiler -> ImageNode.href -> HalfBlockRows per-row `<a>` wrapper

No callbacks, middleware, or observers. All changes are in the image pipeline's data flow.

### Error propagation

All image errors produce `ImageResult<T>` with `ok: false` — never thrown. Errors surface as `[image: alt]` text fallback in the UI.

### State lifecycle risks

- **Semaphore slot leak:** Eliminated — abort-aware `createSemaphore()` removes waiters on abort
- **Hooks violation:** Fixed — all hooks called unconditionally, conditional logic inside hooks
- **Remote fetch abort:** AbortController cleanup in useEffect prevents orphaned fetches
- **Fetch coalescing:** Duplicate URLs share one fetch; stale check prevents old results updating new renders
- **GIF timer cleanup:** clearTimeout in useEffect cleanup prevents orphaned timers
- **Stale frameIndex:** Explicit reset on image change + defensive clamp
- **Kitty ghost images:** Stale check after PNG encode prevents transmit after cleanup
- **Cache/inflight consistency:** `clearImageCache()` also clears `inflightDecodes`
- **Kitty ID recycling:** Transmitting with recycled ID implicitly replaces old image

## Dependencies & Prerequisites

- **Phase 0 must land first** — reduces ImageBlock complexity, fixes bugs
- Phase 1 has no dependencies beyond Phase 0
- Phase 2 depends on Phase 0 (uses extracted hook, `LoadedFile` union, semaphore utility)
- Phase 3 depends on Phase 1 (monotonic IDs prevent collisions during animation)
- Phase 4 is independent of Phases 2 and 3

**Recommended merge order:** Phase 0 + Phase 1 (same branch) -> Phase 2 -> Phase 3 -> Phase 4

## Risk Analysis & Mitigation

| Risk | Mitigation |
|------|-----------|
| ImageBlock complexity | Phase 0 extracts hooks before adding features |
| Semaphore slot leak on unmount | Abort-aware createSemaphore() |
| Hooks violation | Full restructure in Phase 0 |
| Remote fetch hangs | 10s AbortSignal.timeout, streaming byte counter |
| Compression bomb | `decompress: false` in fetch |
| SSRF redirect bypass | `redirect: 'manual'` with per-hop validation |
| IPv6-mapped IPv4 SSRF bypass | Bracket stripping + `::ffff:` prefix detection |
| GIF animation jank | Pre-rendered half-block frames, drift-compensated timer |
| Stale frameIndex after live reload | Explicit reset + defensive clamp |
| Kitty ghost overlay from recycled IDs | Stale check after PNG encode |
| `<a>` wrapping `<box>` (invalid in OpenTUI) | Per-row `<a>` inside `<text>` |
| `clearImageCache()` / `inflightDecodes` inconsistency | Fixed in Phase 0 |

## Sources & References

### Origin

- **Handoff document:** [docs/handoffs/2026-03-06-phase-6-continued.md](docs/handoffs/2026-03-06-phase-6-continued.md)
- **Phase 6 design doc:** [docs/plans/2026-03-06-feat-phase-6-kitty-graphics-protocol-design.md](docs/plans/2026-03-06-feat-phase-6-kitty-graphics-protocol-design.md)

### Internal References

- Image pipeline: `src/image/` (types, detect, loader, decoder, halfblock, kitty, cache)
- Image component: `src/renderer/opentui/image.tsx`
- IR compilation: `src/pipeline/rehype-ir.ts` (img handler ~line 510, compileParagraph ~line 230, compileAnchor ~line 461)
- CLI args: `src/cli/index.ts` (parseCliArgs ~line 83)
- IR types: `src/ir/types.ts` (ImageNode ~line 145)
- Test fixture: `test/fixtures/image-test.md`
- Test assets: `test/assets/` (profile.png, IMG_2935.JPG, duck-simple.gif)

### External References

- [Kitty graphics protocol — image IDs and virtual placements](https://sw.kovidgoyal.net/kitty/graphics-protocol/)
- [GIF delay clamping — browser convention](https://bugzilla.mozilla.org/show_bug.cgi?id=232822)
- [Bun AbortSignal.any() support](https://bun.com/reference/globals/AbortSignal/any)
- [Bun fetch — decompress option, redirect behavior](https://bun.com/docs/runtime/networking/fetch)
- [OWASP SSRF Prevention — scoped to server-side, not CLI tools](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)
- [OpenTUI `<a>` — text modifier only, not block-level](references/components/text-display.md)

### Patterns to Follow

- `ImageResult<T>` for all fallible operations (never throw)
- Factory functions over classes (`createSemaphore`, `createImageCache`)
- `loadIdRef` invocation counter for stale async detection
- `exactOptionalPropertyTypes: true` — use spread for optional fields
- Extract helpers at sonarjs cognitive-complexity 15
- Tests colocated with source (`*.test.ts`)
- Terse error messages matching existing convention (`'file not found'`, `'file too large'`)
