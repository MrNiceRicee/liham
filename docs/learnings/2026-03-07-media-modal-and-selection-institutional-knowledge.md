# Institutional Knowledge: Media Modal + Selection Feature
**Date:** 2026-03-07
**Project:** liham (terminal markdown previewer)
**Feature Branch:** feat/media-modal-and-selection

---

## Overview

This document consolidates all relevant institutional knowledge from the liham project's existing plans and architecture patterns related to implementing the four-phase media modal + selection feature:

1. **Selection + OSC 52 clipboard copy** (mouse drag → auto-copy)
2. **Media modal overlay** (absolute positioning, keyboard + mouse navigation)
3. **GIF animation in modal** (FrameTimer + React state, pre-rendered frames)
4. **Video/Audio playback** (ffplay child process spawning, graceful fallback)

---

## Part 1: Selection + OSC 52 Clipboard Copy

### Existing Knowledge

**From Phase 3 plan (`2026-03-05-feat-phase-3-split-pane-app-plan.md`):**

- **OpenTUI has `Selection` class** — already available in `@opentui/core`
- **OSC 52 is built into OpenTUI** — `renderer.copyToClipboardOSC52(text)` is the public API
- **Mouse event type:** `RawMouseEvent` from OpenTUI with fields: `type: "down" | "up" | "move" | "scroll"`, `x`, `y`, `scroll?: { direction, delta }`
- **No custom `MouseInput` type** — use OpenTUI's actual `RawMouseEvent` types directly
- **Mouse dispatch pattern:** inline handler with `if (event.type === "down")` checks, `dispatch(FocusPane(...))` action dispatch

### Key Implementation Insights

1. **Auto-copy only on selection end** (not every mouse-up)
   - Query `selection.getSelectedText()`
   - Only invoke `copyToClipboardOSC52()` if there is an active selection
   - Verify `selectable: true` is default on text renderables

2. **Assumption to verify** (from brainstorm):
   - OpenTUI's Selection class auto-handles drag events with current `useMouse: true` setup
   - May need manual `startSelection`/`updateSelection` wiring from mouse events if auto-handling doesn't work
   - **Action:** Test empirically in Phase 1

3. **No vim visual mode yet** — Phase 1 is mouse-only, `v` mode deferred

---

## Part 2: Modal Overlay Foundation

### OpenTUI API for Modals

**From Phase 3 plan:**

- **`position: "absolute"` + `zIndex` work** — verified as viable for layering over scrollbox
- **`<box>` with `position: "absolute"`** is the modal container
- **Full-screen modal:** stretch to `width: "100%"`, `height: "100%"` in style
- **Modal stacking:** Use higher `zIndex` than content below (scrollbox defaults to lower zIndex)

### Modal State Management Pattern

**From Phase 3 plan (split-pane state machine):**

The project uses `useReducer` with discriminated union `AppAction` types. Modal state should follow this pattern:

```typescript
// AppState additions for modal phase
interface AppState {
    // ... existing fields
    mediaFocus: number | null           // index of focused media node, null if none
    modalOpen: boolean                   // true if media modal is visible
    modalMediaIndex: number | null       // which media node is shown in modal
}

// Action types to add
type ModalAction =
    | { type: 'FocusMediaNode'; index: number }
    | { type: 'NextMedia' }              // 'n' key
    | { type: 'PreviousMedia' }          // 'N' key
    | { type: 'OpenMediaModal' }         // Enter on focused media or click
    | { type: 'CloseMediaModal' }        // Esc key
    | { type: 'OpenMediaGallery' }       // 'm' key (Phase 2b)
```

### Visual Indicator for Focused Media

**Design pattern from memory:**
- Render a colored border or inverted bar below focused media node
- Alt text visible in indicator
- Must be obvious which node is focused
- Scroll focused node into view when `n`/`N` navigation lands on it

### Key Binding Pattern

**From Phase 3 plan — keyboard dispatch:**
- Use top-level `useKeyboard` handler with inline `KEY_MAP` record (not switch statement)
- Prevents cognitive complexity explosion (sonarjs threshold: 15)
- Pattern: `KEY_MAP: Record<string, (state) => AppState>`
- Matches existing codebase style (used for `BLOCK_COMPILERS`, `INLINE_COMPILERS`)

### Click-to-Focus Pattern (from Phase 3e)

```typescript
// Mouse handler pattern for click-to-focus
if (event.type === "down") {
    // hit-test coordinates against component dimensions
    const target = determineClickTarget(event.x, event.y, paneDimensions)
    if (target) dispatch(FocusPane(target))
}
```

Image clicks should follow similar pattern:
```typescript
// inside ImageBlock component
onClick={(e) => dispatch(OpenMediaModal)}
```

---

## Part 3: GIF Animation in Modal — Pre-Rendered Frames

### Existing FrameTimer

**Status:** Already implemented in `src/media/frame-timer.ts` (Phase 2 of media architecture)

**From Phase 6 continued plan (`2026-03-06-feat-phase-6-continued-plan.md`) — GIF animation section (Phase 3c):**

#### Performance Gotcha: Allocation Storm

**Problem:** Calling `renderHalfBlockMerged()` per frame at 10-20fps creates ~40,000 short-lived allocations per frame per GIF (pixel blending, hex strings, MergedSpan objects). At 5 animated GIFs, that is 200K+ allocations/second — guaranteed GC jank.

**Solution: Pre-compute all frames when image loads, not on each tick**

```typescript
const renderedFramesRef = useRef<MergedSpan[][][] | null>(null)

useEffect(() => {
    if (image?.frames == null) { renderedFramesRef.current = null; return }
    renderedFramesRef.current = image.frames.map(rgba => {
        const frameImg: LoadedImage = { ...image, rgba }
        return renderHalfBlockMerged(frameImg, ctx.bgColor)
    })
}, [image, ctx.bgColor])
```

Frame cycling becomes an O(1) index swap into pre-rendered arrays.

#### Frame Cycling Timer with Drift Correction

**Implementation pattern (from Phase 6 continued):**

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

**Why `setTimeout` per frame (not `setInterval` or `requestAnimationFrame`):**
- GIF frames have per-frame delays (variable timing)
- `requestAnimationFrame` unavailable in terminal renderers
- `setTimeout` with drift adjustment (above) fixes accumulated error on frame N+1

#### Frame Index Reset on Image Change

**Pattern:**
```typescript
// Defensive clamp in render path
const safeIndex = image?.frames != null
    ? Math.min(frameIndex, image.frames.length - 1)
    : 0
```

Explicitly reset `frameIndex` when a new image loads (in the loading hook). The clamp catches stale indices from live reload.

#### Rendering Path

```typescript
const rows = renderedFramesRef.current?.[safeIndex]
    ?? renderHalfBlockMerged(image, ctx.bgColor)
```

Use pre-rendered frames when available, fall back to live rendering for static images.

#### hex() Lookup Table Optimization

**From Phase 6 continued (Phase 3 research insight):**

The `toHex()` function creates 7 string allocations per call. Use a pre-computed table:

```typescript
const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'))
function toHex(r: number, g: number, b: number): string {
    return `#${HEX[r]}${HEX[g]}${HEX[b]}`
}
```

~50% reduction in string allocations within `renderHalfBlockMerged()`. Especially impactful for pre-rendering all GIF frames.

#### Animated GIF Always Uses Half-Block

**From Phase 6 continued — protocol degradation:**

Even on Kitty terminals, animated GIFs use half-block (re-transmitting Kitty images per frame is too expensive).

```typescript
let effectiveProtocol = ctx.capabilities.protocol
if (image.frames != null) effectiveProtocol = 'halfblock'  // animated GIFs always half-block
if (node.href != null && effectiveProtocol === 'kitty-virtual') effectiveProtocol = 'halfblock'  // image links degrade
```

#### GIF Delay Clamping (Browser Convention)

**From Phase 6 continued — Phase 3b:**

Delay ≤10ms → 100ms (matches Chrome, Firefox, Safari behavior). GIF delay=0 means "unspecified"; browsers normalize to ~100ms.

```typescript
const MIN_FRAME_DELAY_MS = 100
const clampedDelays = (delay ?? []).slice(0, frameCount).map(d =>
    d <= 10 ? MIN_FRAME_DELAY_MS : d
)
```

---

## Part 4: Video/Audio Playback via Child Processes

### Status

**Not yet implemented.** Media architecture plan (Phase 4 in brainstorm) mentions it but no code exists. Video/audio IR types and compilation exist, but renderer components are text-only stubs.

### Key Design Decisions from Brainstorm

**From media-modal-and-selection brainstorm:**

1. **ffplay is pragmatic:**
   - Already installed (part of ffmpeg)
   - Handles all formats
   - Avoids building a video decoder

2. **Video playback:**
   - Hide TUI with `renderer.destroy()`
   - Spawn `ffplay -autoexit <path>` as child process
   - Restore TUI on ffplay exit
   - **Risk:** synchronous `renderer.destroy()` at SIGINT (see Part 5 below)

3. **Audio playback:**
   - Spawn `ffplay -nodisp <path>` (no display)
   - Modal shows custom progress UI (current time, duration, play/pause buttons)
   - Progress driven by ffplay metadata query or time callback

4. **Graceful fallback when ffplay unavailable:**
   - Detect `which ffplay` at startup → add `canPlayVideo`/`canPlayAudio` to `MediaCapabilities`
   - Video without ffplay: render poster frame (decoded as image) + "install ffmpeg" hint
   - Audio without ffplay: text fallback + hint

### Risk: TUI Cleanup During Async Operations

**From Phase 6 plan — critical integration issues:**

> "process.exit() in onDestroy skips React cleanup — normal quit via renderer.destroy() calls process.exit(0) synchronously. React useEffect cleanup functions never run. Need process.on('exit') handler to send Kitty cleanup commands for all active image IDs."

**Implication for video spawning:**
- When spawning ffplay via `childProcess.spawn()`, SIGINT (Ctrl+C) reaches both the parent (liham) and child (ffplay) simultaneously
- If we call `renderer.destroy()` before awaiting child exit, it calls `process.exit(0)` synchronously
- Child process cleanup happens asynchronously — orphaned process
- **Mitigation:** Graceful child handling before calling `renderer.destroy()`

```typescript
// pseudo-code
const child = spawn('ffplay', [videoPath])
process.on('SIGINT', () => {
    child.kill('SIGTERM')  // graceful
    // wait for exit before destroy
    child.on('exit', () => {
        renderer.destroy()
    })
    // timeout fallback
    setTimeout(() => {
        child.kill('SIGKILL')
        renderer.destroy()
    }, 5000)
})
```

### Video Implementation Sketch

**Not a pattern yet, but informed by memory architecture:**

```typescript
// src/renderer/opentui/video.tsx
interface VideoNodeProps {
    readonly node: VideoNode
}

function VideoComponent({ node }: VideoNodeProps) {
    const ctx = useContext(ImageContext)

    if (ctx?.capabilities.canPlayVideo) {
        return (
            <box onClick={() => playVideoFullScreen(node.url)}>
                {/* poster frame or half-block */}
            </box>
        )
    }

    // text fallback + hint
    return <text>[video: {node.alt}] (install ffmpeg to play)</text>
}

async function playVideoFullScreen(url: string) {
    const renderer = useRenderer()
    try {
        const child = spawn('ffplay', ['-autoexit', url])
        await new Promise((resolve) => child.on('exit', resolve))
    } finally {
        renderer.createRoot().render(<App />)
    }
}
```

---

## Part 5: Critical Patterns & Gotchas

### 1. React Hooks Must Be Called Unconditionally

**From Phase 6 continued — Phase 0b:**

Early returns before hooks violate React's rules. If a value transitions between `null` and non-null (browser preview vs viewer mode), React throws.

**Fix:** Declare all hooks at top, move conditional logic inside hooks:

```typescript
// WRONG
function ImageBlock({ node }: Props) {
    const ctx = useContext(ImageContext)
    if (ctx == null) return renderTextFallback(...)  // ❌ early return before useEffect
    useEffect(() => { ... })
}

// CORRECT
function ImageBlock({ node }: Props) {
    const ctx = useContext(ImageContext)
    // all hooks first
    const [state, setState] = useState(...)
    useEffect(() => {
        if (ctx == null) return  // ✓ conditional inside effect
        // ...
    }, [...])
    // conditional rendering after all hooks
    if (ctx == null) return renderTextFallback(...)
}
```

### 2. Semaphore Abort Handling (Slot Leak Prevention)

**From Phase 6 continued — Phase 0a:**

When a component unmounts while waiting in a semaphore queue, the slot must be released. Use abort-aware semaphore design:

```typescript
const entry = { resolve, rejected: false }
queue.push(entry)
signal?.addEventListener('abort', () => {
    const idx = queue.indexOf(entry)
    if (idx !== -1) {
        queue.splice(idx, 1)
        entry.rejected = true  // ← mark rejected to prevent slot leak
        reject(signal.reason)
    }
}, { once: true })
```

### 3. Stale Async Detection: Invocation Counter Pattern

**From Phase 6 plan + Phase 6 continued:**

Use a monotonically increasing counter (not a boolean stale flag) to detect when an async callback is superseded:

```typescript
const loadIdRef = useRef(0)

useEffect(() => {
    const thisLoadId = ++loadIdRef.current

    loadImageFile(node.url).then(file => {
        if (loadIdRef.current !== thisLoadId) return  // superseded
        // ... proceed
    })
}, [node.url])
```

**Why not boolean?** Rapid URL changes (1 → 2 → 1) can create race conditions where the stale flag doesn't capture the intended "current" version.

### 4. AbortSignal Guard Before Composing

**From Phase 6 continued — Phase 2b:**

When composing abort signals (timeout + manual cancel), guard optional signal against null:

```typescript
const timeoutSignal = AbortSignal.timeout(10_000)
const combined = signal != null
    ? AbortSignal.any([timeoutSignal, signal])
    : timeoutSignal
```

Without the guard, `AbortSignal.any([timeoutSignal, null])` fails.

### 5. Kitty Cleanup on Process Exit

**From Phase 6 plan — critical integration issue #5:**

`renderer.destroy()` calls `process.exit(0)` synchronously. React useEffect cleanup never runs. For Kitty image cleanup:

```typescript
process.on('exit', () => {
    // send Kitty delete command for all active image IDs
    const commands = activeImageIds.map(id => `\x1b_Ga=d,d=I,i=${id}\x1b\\`)
    process.stdout.write(commands.join(''))
})
```

This is critical for temporary images that need explicit cleanup in the terminal.

### 6. `exactOptionalPropertyTypes: true` — Use Spread for Optional Fields

**From Phase 6 continued (throughout):**

With `exactOptionalPropertyTypes: true`, optional fields must be omitted entirely, not set to `undefined`:

```typescript
// For LoadedImage.frames and .delays
if (frames.length > 1) {
    return { ...staticFields, frames, delays: clampedDelays }
} else {
    return staticFields  // ✓ no frames/delays keys
}

// For ImageNode.href
return { ...imgNode, ...(href.length > 0 ? { href } : {}) }
```

### 7. Mouse Event Type vs Component Event Handler

**From Phase 3 plan:**

OpenTUI's `useMouseCallback` receives `RawMouseEvent` from `@opentui/core`. Do NOT create custom `MouseInput` types — use OpenTUI's actual types:

```typescript
// Types from @opentui/core
interface RawMouseEvent {
    type: "down" | "up" | "move" | "scroll"
    x: number
    y: number
    scroll?: { direction: "up" | "down"; delta: number }
}
```

### 8. Scroll Sync Unidirectional Pattern

**From Phase 3d:**

To prevent feedback loops, tag scroll actions with origin:

```typescript
type ScrollAction =
    | { type: 'Scroll'; target: 'focused' | 'preview'; direction: 'up' | 'down'; origin: 'user' }
    | { type: 'Scroll'; target: string; origin: 'sync' }

// In reducer:
if (action.origin === 'user') {
    // perform scroll + trigger sync
} else {
    // sync-initiated scroll — don't re-sync
}
```

### 9. Icon / Open Media Key Conflicts

**From brainstorm:**
- Tab conflicts with pane focus? → Use `n`/`N` for media cycling instead
- `m` for gallery overlay is okay (no conflict)
- Esc closes modal and unfocuses media (standard)

---

## Part 6: Specific Implementation Patterns from the Codebase

### TypeScript Strict Mode Enforcement

**From memory:**
- `exactOptionalPropertyTypes: true` — enforced throughout
- No `any` types
- Use discriminated unions (e.g., `LoadedFile` as `LocalFile | RemoteFile`)
- Runtime `typeof` checks before casting

### Test Organization

**Pattern:** Co-located unit tests (`*.test.ts` next to source)

```
src/renderer/opentui/
  image.tsx
  image.test.ts
  use-image-loader.ts
  use-image-loader.test.ts
```

### Cognitive Complexity Ceiling: 15

**From multiple plans:**
- Sonarjs enforces max complexity of 15 per function
- When a function hits this limit, extract helpers
- `BLOCK_COMPILERS` and `INLINE_COMPILERS` dispatch maps are the pattern for avoiding complexity explosion

### Factory Functions Over Classes

**Pattern throughout codebase:**
- `createFileWatcher()` not `new FileWatcher()`
- `createImageCache()` not `new ImageCache()`
- `createSemaphore()` not `new Semaphore()`
- Enables easier testing, avoids module-level singletons

### Context for Deeply-Nested Components

**From Phase 6 plan — first context in codebase:**

```typescript
// ImageContext is justified because:
// 1. Every image component is deeply nested in render tree
// 2. Threading basePath + capabilities through every renderNode/renderChildren call would be too invasive
// 3. Async image lifecycle requires coordination (cache, in-flight decodes, etc.)
```

This sets precedent for modal context (modal state flows down to components inside modal).

### Color/Theme Pattern

**From Phase 3 plan — theme:**
- Theme is singleton passed to processor
- CLI owns theme selection (not processor default)
- `ThemeTokens` extensible for new token types (e.g., status bar colors, modal overlay bg)

---

## Part 7: Known Gaps & Questions for Implementation

### Selection/Clipboard

- [ ] **Verify:** Does OpenTUI's Selection class auto-handle drag with `useMouse: true`?
- [ ] **Verify:** Is `selectable: true` default on text renderables?
- [ ] **Assumption test:** Manual `startSelection`/`updateSelection` wiring needed? (use Phase 1 to validate)

### Modal

- [ ] **Verify:** Does `position: "absolute"` + `zIndex` layer correctly over scrollbox in all OpenTUI versions?
- [ ] **Verify:** What zIndex values are safe? Does scrollbox have implicit zIndex?
- [ ] **Verify:** Can modal accept keyboard events while scrollbox is below?

### GIF Animation

- [ ] **Verify:** Do pre-rendered `MergedSpan[][][]` arrays cause perceptible memory impact for typical markdown (5-10 images)?
- [ ] **Verify:** Does `setTimeout`-based frame cycling feel smooth at 60fps / 10fps?
- [ ] **Verify:** Does `toHex()` lookup table actually improve frame-cycling perf measurably?

### Video/Audio

- [ ] **Verify:** How does SIGINT reach child process when spawned?
- [ ] **Test:** Does graceful child kill (SIGTERM → timeout → SIGKILL) work reliably?
- [ ] **Test:** Can we query ffplay progress without spawning a separate ffmpeg process?

### Integration

- [ ] **Verify:** Does modal state coexist with existing viewer/browser mode state, or need refactoring?
- [ ] **Verify:** How does live reload (file watcher) interact with open modal?
  - Is modal closed on reload?
  - Is `FileDeleted` state handled in modal?

---

## Part 8: Recommended Reading Order

1. **Start:** Brainstorm — `docs/brainstorms/2026-03-07-media-modal-and-selection-brainstorm.md` (already read)
2. **Phase 3 patterns:** `docs/plans/2026-03-05-feat-phase-3-split-pane-app-plan.md` (Phase 3e: mouse support, Phase 3c: focus management)
3. **GIF animation:** `docs/plans/2026-03-06-feat-phase-6-continued-plan.md` (Phase 3c: GIF animation section)
4. **Media architecture:** `docs/plans/2026-03-06-feat-media-architecture-plan.md` (FrameTimer, MediaCapabilities, VideoNode/AudioNode)
5. **OpenTUI intrinsics:** CLAUDE.md memory section "OpenTUI Intrinsics (verified)"

---

## Part 9: Success Criteria for Each Phase

### Phase 1: Selection + OSC 52 Copy
- [ ] Mouse drag selects text (OpenTUI Selection class)
- [ ] Mouse up auto-copies selection to system clipboard via OSC 52
- [ ] No extra keypress needed
- [ ] Selection only copies if there's an active selection (not on every mouse-up)
- [ ] All existing tests pass

### Phase 2: Modal Overlay Foundation
- [ ] `position: "absolute"` + `zIndex` verified working in OpenTUI
- [ ] Modal component renders full-screen
- [ ] `n`/`N` keys jump to next/previous media node
- [ ] Enter opens modal for focused node
- [ ] Esc closes modal
- [ ] Focused media node has visible indicator (border/highlight)
- [ ] Scroll focused node into view on `n`/`N` navigation
- [ ] Modal info bar shows: filename, dimensions, type
- [ ] Click on image opens modal
- [ ] Legend updates when modal is open
- [ ] All existing tests pass

### Phase 3: GIF Animation in Modal
- [ ] All frames decoded on modal open
- [ ] Pre-computed half-block frames (no per-tick allocation)
- [ ] Frame cycling at correct delays (clamped ≤10ms to 100ms)
- [ ] Space bar pauses/resumes
- [ ] Drift corrected (timer adjusted on each tick)
- [ ] Frame index reset on image change, defensive clamp
- [ ] Timer cleaned up on unmount
- [ ] All existing tests pass

### Phase 4: Video/Audio via ffplay
- [ ] ffplay availability detected at startup (`MediaCapabilities.canPlayVideo`/`canPlayAudio`)
- [ ] Video: modal hides TUI, ffplay takes terminal, TUI restores on exit
- [ ] Audio: ffplay spawned with `-nodisp`, progress UI in modal
- [ ] Graceful fallback without ffplay: poster frame + "install ffmpeg" hint
- [ ] SIGINT handling: child process killed gracefully before TUI restore
- [ ] All existing tests pass

---

## References

**Key Documents:**
- `docs/brainstorms/2026-03-07-media-modal-and-selection-brainstorm.md` — feature spec
- `docs/plans/2026-03-05-feat-phase-3-split-pane-app-plan.md` — state machine, mouse patterns, focus management
- `docs/plans/2026-03-06-feat-phase-6-continued-plan.md` — GIF animation, semaphore, stale async detection
- `docs/plans/2026-03-06-feat-media-architecture-plan.md` — FrameTimer, MediaCapabilities, video/audio IR

**Code Patterns:**
- Phase 3 (split-pane): `useReducer`, `AppAction` discriminated union, `KEY_MAP` dispatch
- Phase 6 (images): `createSemaphore()`, `LoadedImage` with optional fields, `useImageLoader` hook
- Existing components: `src/renderer/opentui/image.tsx` (first stateful component, React context precedent)

**Testing & CI:**
- Tests colocated: `src/**/*.test.ts`
- Run: `bun test` (all tests), `bun run lint` (sonarjs complexity + eslint)
- Benchmark baseline: pipeline <500ms for 2000-line file

