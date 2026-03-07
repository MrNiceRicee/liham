---
title: Media Modal Overlay and Text Selection
type: feat
status: active
date: 2026-03-07
origin: docs/brainstorms/2026-03-07-media-modal-and-selection-brainstorm.md
---

# Media Modal Overlay and Text Selection

## Enhancement Summary

**Deepened on:** 2026-03-07
**Research agents used:** OpenTUI skill, TypeScript reviewer, performance oracle, security sentinel, architecture strategist, pattern recognition, frontend races reviewer, simplicity reviewer

### Key Improvements
1. **Selection API corrected** — `useSelectionHandler` is Solid-only; React needs manual mouse event wiring or runtime verification of `renderer.on("selection")`
2. **Simplified scope** — gallery overlay (Phase 2f) cut entirely; actions consolidated from 8 to 5; media collection inlined into `renderToOpenTUI()` instead of separate tree walk
3. **Critical race conditions identified** — 7 HIGH-priority races with concrete mitigations (stale decode, clipboard wipe, focus index OOB, audio overlap, SIGINT gap)
4. **Security hardening** — command injection via ffplay (CRITICAL), SSRF mitigation, pre-existing `sanitizeForTerminal` bug in `compileVideo`/`compileAudio`
5. **Performance caps** — GIF frames capped at 50 (not 100), lazy halfblock pre-computation, frame-skip mechanism for terminal output backpressure

### Pre-Existing Bugs Found
- `src/pipeline/compile-media.ts:29,49` — `compileVideo()`/`compileAudio()` missing `sanitizeForTerminal(alt)` (image has it, video/audio do not)
- `src/media/fetcher.ts:11-26` — `isBlockedHost()` missing RFC 1918 private ranges (`10.*`, `172.16-31.*`, `192.168.*`)
- Fix these before or during Phase 1.

---

## Overview

Four phased features for the OpenTUI renderer: text selection with auto-copy, a full-screen media modal overlay, animated GIF playback in the modal, and video/audio playback via ffplay. Each phase ships independently and builds on the prior.

## Problem Statement

Liham renders images inline but provides no way to view them at full resolution, navigate between media nodes, select/copy text, or play video/audio. Users need these interactions to make liham a complete markdown previewer.

## Proposed Solution

Wire OpenTUI's existing primitives (Selection class, OSC 52 clipboard, absolute positioning, zIndex) into four incremental phases. Selection is self-contained. The modal is the foundation for GIF animation and video/audio. (see brainstorm: `docs/brainstorms/2026-03-07-media-modal-and-selection-brainstorm.md`)

## Technical Approach

### Architecture

The modal is a sibling `<box>` at the app root with `position: "absolute"` and `zIndex: 100`, layered over the existing flex layout. Media node indexing is collected during `renderToOpenTUI()` traversal (no separate tree walk needed). A `MediaFocusContext` lets `ImageBlock` components reactively show focus indicators without re-rendering the entire document tree.

### Key Architectural Decisions

1. **Media collection during IR-to-JSX conversion** — collect media nodes as a side-channel during `renderToOpenTUI()` via a `RenderContext` accumulator. No separate `collectMediaNodes()` walk, no IR tree retention in `useRef`. The media list arrives alongside the rendered JSX.

   ```ts
   interface RenderResult {
     jsx: ReactNode
     mediaNodes: MediaEntry[]
   }
   ```

2. **MediaFocusContext (separate from ImageContext)** — new React context providing `focusedMediaIndex: number | null` and `onMediaClick: (index: number) => void`. Kept separate from `ImageContext` because they have different update frequencies: `ImageContext` is stable (changes on file open/resize), `MediaFocusContext` changes on every `n`/`N` press. Merging would cause all `ImageBlock` instances to re-render on focus change, defeating the `memo` optimization on `HalfBlockRows`.

3. **Modal state as discriminated union** — eliminates impossible states (e.g., `modalState: 'image'` with `mediaFocusIndex: null`):
   ```ts
   type MediaModalState =
     | { kind: 'closed' }
     | { kind: 'image'; mediaIndex: number }
   ```

4. **Modal as app sub-state** — modal is NOT a third `AppMode`. It is a sub-state within viewer mode. Key routing checks `modalState` before dispatching viewer keys. This preserves viewer state (scroll position, pane focus) while the modal is open.

5. **Esc priority chain (3 levels)** — (1) close modal or clear focus if active, (2) return to browser if `fromBrowser`, (3) quit. A single `CloseMediaModal` action handles both "close modal" and "clear focus" — when `modalState.kind === 'closed'` and `mediaFocusIndex !== null`, it just clears the focus.

6. **Selection vs click disambiguation** — do NOT start selection on `onMouseDown`. Defer selection start to `onMouseMove` after the mouse has moved >= 3 cells. This eliminates the race between click and zero-length selection entirely.

7. **Single `useKeyboard` handler** — OpenTUI fires ALL `useKeyboard` hooks; there is no event stopping. Modal key routing must be a branch in the existing `App`-level handler, NOT a separate `useKeyboard` in the modal component.

### File Map

New files:
- `src/renderer/opentui/media-modal.tsx` — modal overlay component + `useModalMedia` hook
- `src/renderer/opentui/media-focus-context.tsx` — MediaFocusContext provider + hook
- `src/renderer/opentui/viewer-keys.ts` — extracted viewer key dispatch (pre-work, app.tsx is 569 lines)
- `src/media/ffplay.ts` — ffplay detection + spawn helpers (Phase 4)

Modified files:
- `src/app/state.ts` — add `mediaFocusIndex`, `mediaModal`, new actions
- `src/renderer/opentui/app.tsx` — wire key handlers, modal rendering, media context
- `src/renderer/opentui/image.tsx` — focus indicator, click handler via context
- `src/renderer/opentui/image-context.tsx` — unchanged (focus goes in separate context)
- `src/renderer/opentui/index.tsx` — `RenderContext` accumulator for media collection, `selectable` on `<text>`
- `src/renderer/opentui/boot.tsx` — thread media capabilities
- `src/media/types.ts` — add `canPlayVideo` to `MediaCapabilities`
- `src/media/detect.ts` — add ffplay detection
- `src/media/decoder.ts` — modal-specific animation limits
- `src/ir/types.ts` — add `MediaIRNode` type alias
- `src/pipeline/compile-media.ts` — fix missing `sanitizeForTerminal` on video/audio alt
- `src/media/fetcher.ts` — add missing private network ranges to `isBlockedHost()`

### Pre-Work: Extract Viewer Keys

**Before starting Phase 1**, extract viewer key handling from `app.tsx` into `src/renderer/opentui/viewer-keys.ts`. The file is already at 569 lines (past the 500-line extraction threshold). This follows the `browser-keys.ts` extraction precedent and makes room for modal key routing.

### Implementation Phases

---

#### Phase 0: Pre-Existing Bug Fixes

Ship independently. These are security issues found during research.

- [x] Add `sanitizeForTerminal(alt)` to `compileVideo()` at `src/pipeline/compile-media.ts:29` and `compileAudio()` at line 49 (matching `compileImg()` at line 68)
- [x] Extend `isBlockedHost()` in `src/media/fetcher.ts` to cover `10.*`, `172.16-31.*`, `192.168.*`, `100.64-127.*` (CGNAT), and `fc00::/7` (IPv6 ULA)
- [x] Add `MediaIRNode` type alias to `src/ir/types.ts`: `type MediaIRNode = ImageNode | VideoNode | AudioNode`
- [x] Test: video/audio alt text with escape sequences is sanitized
- [x] Test: fetch to `10.0.0.1`, `192.168.1.1` blocked

**Files touched:**
- `src/pipeline/compile-media.ts`
- `src/media/fetcher.ts`
- `src/ir/types.ts`

---

#### Phase 1: Selection + OSC 52 Copy

Self-contained, zero dependencies on other phases. Biggest UX win for smallest scope.

**How it works:** OpenTUI's React reconciler does NOT expose `useSelectionHandler` (that is Solid-only). The `"selection"` event on the core renderer needs runtime verification. Two approaches:

1. **Verify `renderer.on("selection", handler)` at runtime** — add a debug hook, check if the event fires. If it does, use it directly.
2. **Manual mouse event approach (fallback)** — use `onMouseDown`/`onMouseMove`/`onMouseUp` to track drag, call `renderer.copyToClipboardOSC52()` on drag end.

**Tasks:**

- [ ] **Runtime verification first**: add temporary `renderer.on("selection", (sel) => console.log("selection:", sel))` to verify the event exists
- [ ] If `"selection"` event works:
  - extract to `useSelection` custom hook (`src/renderer/opentui/use-selection.ts`)
  - handler: `const text = selection.getSelectedText(); if (text.trim().length > 0) renderer.copyToClipboardOSC52(text);`
  - guard: never copy empty/whitespace-only text (prevents clipboard wipe on accidental click)
  - cleanup: `renderer.off("selection", handler)` on unmount
- [ ] If `"selection"` event does NOT work:
  - implement manual mouse tracking with deferred selection start (see disambiguation below)
- [ ] Set `selectable` on all `<text>` elements in `renderChildren()` (`src/renderer/opentui/index.tsx`)
  - OpenTUI docs show `selectable` is opt-in, NOT default true
- [ ] Verify selection works across both source and preview panes in split layout
- [ ] Test: drag select in preview pane copies to clipboard
- [ ] Test: drag select across empty regions does not trigger copy
- [ ] Test: selection highlighting visually appears during drag
- [ ] Test: clicking (not dragging) does NOT wipe clipboard

**Selection vs click disambiguation (critical for Phase 2 coexistence):**

```ts
// defer selection start to mouseMove, not mouseDown
let downPos: { x: number; y: number } | null = null
let selectionStarted = false

onMouseDown(e) { downPos = { x: e.col, y: e.row } }

onMouseMove(e) {
  if (downPos == null) return
  const dist = Math.abs(e.col - downPos.x) + Math.abs(e.row - downPos.y)
  if (dist >= 3 && !selectionStarted) {
    selection.startSelection(downPos.x, downPos.y)
    selectionStarted = true
  }
  if (selectionStarted) selection.updateSelection(e.col, e.row)
}

onMouseUp(e) {
  if (selectionStarted) {
    const text = selection.finishSelection()
    if (text.trim().length > 0) renderer.copyToClipboardOSC52(text)
  } else if (downPos != null) {
    handleImageClick(e)  // genuine click — Phase 2 wires this
  }
  downPos = null; selectionStarted = false
}
```

This eliminates the zero-length-selection-wipes-clipboard race entirely. Selection only begins once the mouse has provably moved.

**Edge cases:**
- OSC 52 not supported by terminal — copy silently fails (fire-and-forget, matches terminal convention)
- Check `renderer.isOsc52Supported()` before copying — skip silently if unsupported
- Selection in browser mode — filter input captures mouse; selection is viewer-only
- Cross-pane drag — undefined behavior, acceptable for now (each pane is a separate scrollbox)
- Large selection — OSC 52 has a ~74,994 byte limit in some terminals. Cap payload if needed.

**Files touched:**
- `src/renderer/opentui/use-selection.ts` (new) — custom hook
- `src/renderer/opentui/app.tsx` — invoke hook
- `src/renderer/opentui/index.tsx` — add `selectable` to `<text>` elements

**Success criteria:** mouse drag highlights text, mouse-up copies to system clipboard via OSC 52.

---

#### Phase 2: Modal Overlay Foundation

The core phase. Builds the media navigation, focus indicator, and full-screen modal.

##### Phase 2a: Media Node Collection (via RenderContext)

**No separate tree walk needed.** Collect media nodes during the existing IR-to-JSX traversal.

- [x] Add `RenderContext` to `renderToOpenTUI()` (`src/renderer/opentui/index.tsx`):
  ```ts
  interface RenderContext {
    maxWidth?: number
    media: MediaEntry[]  // accumulated during traversal
  }

  interface RenderResult {
    jsx: ReactNode
    mediaNodes: MediaEntry[]
  }
  ```
- [x] In `renderNode()`, when encountering `image`/`video`/`audio` nodes, push to `ctx.media`:
  ```ts
  case 'image':
    const mediaIndex = ctx.media.length
    ctx.media.push({ node, index: mediaIndex })
    return <ImageBlock {...props} mediaIndex={mediaIndex} />
  ```
- [x] `MediaEntry` type — drop the redundant `type` field (node already carries `node.type`):
  ```ts
  type MediaEntry = {
    node: MediaIRNode  // ImageNode | VideoNode | AudioNode
    index: number
  }
  ```
- [x] Store media list alongside viewer content:
  ```ts
  const [viewerState, setViewerState] = useState<{
    content: ReactNode
    raw: string
    mediaNodes: MediaEntry[]  // added
  } | null>(null)
  ```
- [ ] On live reload, clamp `mediaFocusIndex` atomically with content update:
  - dispatch a `LiveReload` action that carries the new `mediaCount`
  - reducer clamps focus index: `Math.min(mediaFocusIndex, mediaCount - 1)`
  - if modal is open and focused node URL changed, close modal
- [x] Test: `renderToOpenTUI` returns correct media list for fixture with images, video, audio
- [x] Test: empty document returns empty media list
- [x] Test: document with only text returns empty media list

**Files touched:**
- `src/renderer/opentui/index.tsx` — RenderContext, media collection
- `src/renderer/opentui/app.tsx` — store mediaNodes in viewerState

##### Phase 2b: State Machine Additions

- [x] Add to `AppState` (`src/app/state.ts`):
  ```ts
  mediaFocusIndex: number | null
  mediaModal: MediaModalState
  ```
  where:
  ```ts
  type MediaModalState =
    | { kind: 'closed' }
    | { kind: 'image'; mediaIndex: number }
  ```
- [x] Add 5 actions to `AppAction` (consolidated from 8):
  - `{ type: 'FocusNextMedia'; mediaCount: number }` — cycle forward, wrap around
  - `{ type: 'FocusPrevMedia'; mediaCount: number }` — cycle backward, wrap around
  - `{ type: 'FocusMedia'; index: number }` — focus specific node (click)
  - `{ type: 'OpenMediaModal' }` — open modal for currently focused node
  - `{ type: 'CloseMediaModal' }` — close modal AND/OR clear focus (single action)
- [x] Add reducer cases:
  - `FocusNextMedia`: `mediaFocusIndex = ((current ?? -1) + 1) % mediaCount` (no-op if `mediaCount === 0`)
  - `FocusPrevMedia`: `mediaFocusIndex = ((current ?? 0) - 1 + mediaCount) % mediaCount`
  - `FocusMedia`: set `mediaFocusIndex = index`
  - `OpenMediaModal`: guard `mediaFocusIndex !== null`, set `mediaModal: { kind: 'image', mediaIndex: mediaFocusIndex }`
  - `CloseMediaModal`: if modal open, set `mediaModal: { kind: 'closed' }` preserving `mediaFocusIndex`; if modal closed but focus active, set `mediaFocusIndex: null`
- [x] Update `legendEntries()`:
  - media focused (no modal): `n/N: next/prev media | Enter: view | Esc: unfocus`
  - modal open: `n/N: next/prev | Esc: close | space: play/pause`
- [x] `initialState()`: `mediaFocusIndex: null`, `mediaModal: { kind: 'closed' }`
- [x] Test: reducer cycles focus index correctly, wraps at boundaries
- [x] Test: single media node — n/N stay on index 0
- [x] Test: no media nodes — FocusNextMedia is no-op
- [x] Test: CloseMediaModal when modal open closes modal; when just focused, clears focus

**Files touched:**
- `src/app/state.ts` — state shape, actions, reducer, legend

##### Phase 2c: MediaFocusContext + Focus Indicator

- [x] Create `src/renderer/opentui/media-focus-context.tsx`:
  ```ts
  type MediaFocusContextValue = {
    focusedMediaIndex: number | null
    onMediaClick: (index: number) => void
  }
  ```
- [x] Provide in `App` wrapping viewer layout:
  - `focusedMediaIndex` from `state.mediaFocusIndex`
  - `onMediaClick` wrapped in `useCallback`: dispatches `FocusMedia` then `OpenMediaModal`
  - context value wrapped in `useMemo` keyed to `[state.mediaFocusIndex]` to prevent unnecessary re-renders
- [x] `ImageBlock` (`src/renderer/opentui/image.tsx`):
  - consume `MediaFocusContext` via `useContext`
  - if `mediaIndex === focusedMediaIndex`, render highlight border (colored border or inverted bar below image with alt text)
  - add `onMouseDown` handler: record position, `onMouseUp`: if not dragged, call `onMediaClick(mediaIndex)`
  - clear any active selection when opening modal: `selection.clearSelection()` to prevent stale highlight
- [ ] For video/audio text stubs (`[video: alt]`, `[audio: alt]`):
  - wrap in a thin component that consumes `MediaFocusContext`
  - show focus indicator when focused, handle click
- [x] Test: focused image renders with visible highlight
- [x] Test: unfocused image renders without highlight
- [x] Test: click on image opens modal; drag on image starts selection

**Files touched:**
- `src/renderer/opentui/media-focus-context.tsx` (new)
- `src/renderer/opentui/app.tsx` — provide context
- `src/renderer/opentui/index.tsx` — pass mediaIndex prop to ImageBlock
- `src/renderer/opentui/image.tsx` — consume context, focus indicator, click handler

##### Phase 2d: Key Bindings

- [x] Extract viewer key handling to `src/renderer/opentui/viewer-keys.ts` (pre-work)
- [x] Add to `VIEWER_KEY_MAP`:
  - `n`: focus next media (no-op if no media)
  - `return` (NOT `Enter` — OpenTUI uses `return`): open modal if media focused
- [x] Add to `VIEWER_SHIFT_KEY_MAP`:
  - `n`: focus prev media
- [x] Refactor Esc handler — 3-level chain:
  ```ts
  if (state.mediaModal.kind !== 'closed' || state.mediaFocusIndex !== null) {
    dispatch({ type: 'CloseMediaModal' })
  } else if (state.fromBrowser) {
    dispatch({ type: 'ReturnToBrowser' })
  } else {
    renderer.destroy()
  }
  ```
- [x] When modal is open, intercept keys before viewer dispatch (single `useKeyboard`, NOT separate hook):
  ```ts
  // in App useKeyboard handler
  if (state.mediaModal.kind !== 'closed') {
    handleModalKey(key, state, dispatch)  // n/N/Esc/space — swallow all other keys
    return
  }
  ```
- [ ] Scroll-into-view when `n`/`N` focuses a media node:
  - `ImageBlock` uses `useEffect` to scroll itself into view when it becomes focused
  - access scrollbox ref via `ImageContext.scrollRef`
- [ ] `n`/`N`/`return` are no-ops in `source-only` layout (no preview pane visible)
- [ ] Test: pressing `n` focuses first media node and scrolls to it
- [ ] Test: pressing `N` wraps from first to last
- [ ] Test: `return` opens modal when media is focused, no-op when not
- [ ] Test: Esc priority chain — modal > focus > browser > quit

**Files touched:**
- `src/renderer/opentui/viewer-keys.ts` (new — extracted from app.tsx)
- `src/renderer/opentui/app.tsx` — key routing with modal branch
- `src/renderer/opentui/image.tsx` — scroll-into-view on focus

##### Phase 2e: Modal Component

- [ ] Create `src/renderer/opentui/media-modal.tsx`:
  ```tsx
  <box style={{
    position: 'absolute',
    top: 0, left: 0,
    width: '100%', height: '100%',
    zIndex: 100,
    flexDirection: 'column',
    backgroundColor: theme.bg,  // solid dark — no rgba transparency in terminals
  }}>
    <box style={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center' }}>
      {renderMediaContent(mediaNode, capabilities, ...)}
    </box>
    <box border={['top']} style={{ height: 2 }}>
      <text>{sanitizeForTerminal(filename)} | {width}x{height} | {type} | [{current}/{total}]</text>
    </box>
  </box>
  ```
- [ ] Add `position: "relative"` to root `<box>` in `App` for reliable absolute positioning context
- [ ] Modal must be a **sibling** of scrollbox content (not nested inside scrollbox — or it scrolls with content)
- [ ] Image rendering in modal:
  - use cached pane-width image directly (no re-decode for v1 — terminal resolution makes the difference negligible)
  - constrain to terminal dimensions, maintain aspect ratio
  - for kitty-virtual: transmit at available resolution
  - for halfblock: render `HalfBlockRows`
  - for text protocol: show `[image: alt]` centered
- [ ] Info bar content — apply `sanitizeForTerminal()` to all text from IR nodes:
  - filename: basename from `node.url` (relative) or full URL for remote
  - dimensions: original pixel dimensions from decoded image metadata
  - type: `image/png`, `image/gif`, `video`, `audio`
  - media position: `[3/7]`
- [ ] Single component instance with changing props (NOT remount per image) — this makes `useImageLoader`'s `loadIdRef` staleness check work correctly for rapid `n`/`N` cycling
- [ ] Test: modal renders at full terminal dimensions
- [ ] Test: modal info bar shows correct filename, dimensions, type
- [ ] Test: Esc closes modal, returns to same scroll position
- [ ] Test: n/N cycles media within open modal

**Files touched:**
- `src/renderer/opentui/media-modal.tsx` (new)
- `src/renderer/opentui/app.tsx` — render modal, add position relative to root

---

#### Phase 3: GIF Animation in Modal

Builds on the modal from Phase 2. The modal's isolated React subtree means re-renders are scoped — no risk of the full-document tearing that killed inline GIF animation.

##### Phase 3a: Modal-Specific Animation Limits

- [x] Raise animation limits for modal context:
  - `maxFrames: 50` (up from 1 for inline) — covers nearly all real-world GIFs while bounding memory
  - `maxDecodedBytes: 30 * 1024 * 1024` (30MB budget for modal)
  - pass animation limits via `ImageContextValue.animationLimits` (modal overrides inline defaults)
- [x] Include animation limits in cache key so modal and inline decodes don't collide (same URL, different frame counts)
- [x] Show frame count in info bar: `42 frames` or `50 frames (capped)`
- [x] Test: modal decodes more than 1 frame for animated GIFs
- [x] Test: frame cap at maxFrames is respected

**Memory budget at 50 frames, 200 columns:**
- Raw RGBA: 200 * 200 * 4 * 50 = ~7.6 MB
- MergedSpan grids: ~9.5 MB
- Total: ~17 MB (within 30MB cap)

**Files touched:**
- `src/renderer/opentui/media-modal.tsx` — modal-specific decode options
- `src/media/decoder.ts` — accept overridden animation limits, `purpose` in cache key

##### Phase 3b: FrameTimer + React State

- [ ] In `MediaModal` component, use `FrameTimer` to drive frame animation:
  ```tsx
  const [frameIndex, setFrameIndex] = useState(0)
  const timerRef = useRef<FrameTimerHandle | null>(null)

  useEffect(() => {
    if (image?.delays == null || image.delays.length === 0) return
    const timer = createFrameTimer({
      delays: image.delays,
      onFrame: setFrameIndex,
      loop: true,
    })
    timerRef.current = timer
    timer.play()
    return () => { timer.dispose() }
  }, [image])
  ```
- [ ] Add `disposed` flag to `createFrameTimer` — check it inside `setTimeout` callback before calling `onFrame` to prevent setState-on-unmounted race
- [ ] Render the current frame's halfblock grid: `frames[frameIndex]`
- [ ] Animated GIFs always use halfblock (not kitty-virtual) — same as inline
- [ ] Add frame-skip mechanism: if the previous frame's render is not yet flushed (track via a `renderPending` ref), skip the current frame to prevent terminal output buffer backup
- [ ] Test: GIF animates in modal (frame index cycles)
- [ ] Test: opening modal on static image does not start timer
- [ ] Test: rapid close/reopen does not produce React unmounted-setState warnings

**Files touched:**
- `src/renderer/opentui/media-modal.tsx` — FrameTimer integration
- `src/media/frame-timer.ts` — add `disposed` flag

##### Phase 3c: Lazy Halfblock Pre-Computation

**Critical performance pattern: pre-render frames, not per-tick. But use a lazy strategy (2-frame window) instead of all-frames-upfront.**

- [ ] Decode all RGBA frames on modal open (bounded by `maxFrames` and `maxDecodedBytes`)
- [ ] Pre-compute `MergedSpan[][]` lazily: current frame + next frame
  - compute frame 0 and 1 on open (first frame shows immediately)
  - on each `onFrame` tick, compute frame N+2 in a `setTimeout(0)` for the one after next
  - store computed frames in a `Map<number, MergedSpan[][]>` ref
- [ ] `onFrame` indexes into the pre-computed map — zero allocation per tick
- [ ] If frame is not yet computed (user seeked ahead), compute synchronously with a brief stall
- [ ] Discard all computed frames on modal close (free memory)
- [ ] Peak memory: O(2 frames) instead of O(all frames)
- [ ] Test: animation is smooth (no visible stutter from lazy computation)
- [ ] Test: first frame visible immediately

**Upgrade path:** if the 2-frame window causes stutter with very fast GIFs (<50ms delays), upgrade to "first 10 eager, rest in setTimeout chain." Measure before pre-computing all.

**Files touched:**
- `src/renderer/opentui/media-modal.tsx` — lazy pre-compute logic

##### Phase 3d: Play/Pause

- [ ] Space bar toggles `timerRef.current.pause()` / `timerRef.current.play()`
- [ ] Show playback state in info bar: `Playing` / `Paused`
- [ ] Wire space key in modal key handler (Phase 2d already reserved it)
- [ ] Test: space pauses animation, space again resumes
- [ ] Test: pause state shown in info bar

**Files touched:**
- `src/renderer/opentui/media-modal.tsx` — play/pause state
- `src/renderer/opentui/viewer-keys.ts` — space key in modal handler

**Fallback plan:** if React state approach causes tearing in the modal, consider `FrameBufferRenderable` from OpenTUI core — a low-level 2D rendering surface with direct pixel manipulation. This stays within OpenTUI's render pipeline (no competing terminal writes) while bypassing React reconciliation:
```ts
const canvas = new FrameBufferRenderable(renderer, { id: "gif", width, height })
canvas.frameBuffer.setCell(x, y, char, fg, bg)
```

---

#### Phase 4: Video/Audio via ffplay

Most complex phase. Spawning external processes from a TUI app requires careful lifecycle management.

##### Phase 4a: ffplay Detection + MediaCapabilities

- [ ] Create `src/media/ffplay.ts`:
  ```ts
  // Bun.which is synchronous — no async needed
  function isFfplayAvailable(): boolean {
    return Bun.which('ffplay') !== null
  }
  ```
- [ ] Add `canPlayVideo: boolean` to `MediaCapabilities` (`src/media/types.ts`)
  - `canPlayAudio` already exists
- [ ] Call `isFfplayAvailable()` during CLI startup alongside `detectCapabilities()`
- [ ] Thread result through `BootContext` -> `App` props
- [ ] Test: detection returns true when ffplay is installed
- [ ] Test: detection returns false when ffplay is missing

**Files touched:**
- `src/media/ffplay.ts` (new)
- `src/media/types.ts` — add `canPlayVideo`
- `src/media/detect.ts` — call `isFfplayAvailable()`
- `src/cli/index.ts` — thread capability
- `src/renderer/opentui/boot.tsx` — thread to App

##### Phase 4b: Video Playback

**Architecture challenge:** `renderer.destroy()` calls `process.exit(0)` via `onDestroy`. Cannot use it to "hide" the TUI.

**Blocking investigation:** check if OpenTUI exposes a `suspend()`/`resume()` API (like Bubbletea's `tea.Suspend`). If yes, use it. If not, use raw alternate screen buffer manipulation.

**Approach (raw escape sequences):**
1. Register SIGINT handler **before** suspending (handles the SIGINT-between-suspend-and-spawn race)
2. Write `\x1b[?1049l` (leave alternate screen) + `\x1b[?25h` (show cursor) + `\x1b[?1003l` (disable mouse)
3. Spawn `ffplay -autoexit <path>` as child process
4. If SIGINT arrived during setup, forward to ffplay
5. On ffplay exit, write `\x1b[?1049h` + `\x1b[?25l` + `\x1b[?1003h` synchronously via `writeSync`
6. Restore original SIGINT handler
7. Force full TUI re-render

**Security (CRITICAL):**
- [ ] **Never use shell execution.** Use `Bun.spawn(['ffplay', '-autoexit', path])` with argv array — bypasses shell parsing entirely
- [ ] Create `sanitizeMediaPath()` in `src/media/ffplay.ts`:
  - for local paths: `realpath()` resolution, verify file exists via `stat()`, reject if path starts with `-` (flag injection)
  - for URLs: validate `http:`/`https:` scheme only, apply `isBlockedHost()` (including private ranges)
  - **strongly consider restricting ffplay to local files only** — eliminates SSRF entirely
- [ ] Add containment check: resolved path must be under the markdown file's parent directory or a parent thereof
- [ ] `suspendTui()` / `resumeTui()` helpers with `try/finally`:
  - register `process.on('exit')` handler (synchronous `writeSync`) to restore terminal on crash
  - handle SIGINT/SIGTERM — kill ffplay, restore TUI
  - handle ffplay crash — always restore TUI in `finally` block
- [ ] Pause all FrameTimer instances before suspend, resume after restore
- [ ] Clear Kitty image ID tracking on suspend (images re-transmit on resume)
- [ ] Re-check `isFfplayAvailable()` just before spawning (handles uninstall between startup and use)
- [ ] Test: ffplay spawns and TUI restores on exit
- [ ] Test: SIGINT during ffplay restores TUI
- [ ] Test: path starting with `-` rejected
- [ ] Test: path with shell metacharacters does NOT execute (argv isolation)

**Files touched:**
- `src/media/ffplay.ts` — suspend/resume helpers, sanitization, spawn logic
- `src/renderer/opentui/media-modal.tsx` — video playback trigger

##### Phase 4c: Audio Playback (simplified for v1)

**v1 scope: "Playing... press Esc to stop." No pause/resume, no progress, no ffprobe.**

- [ ] Spawn `ffplay -nodisp -autoexit <path>` in background
- [ ] Modal shows simple audio UI:
  - alt text / filename
  - `Playing...` status
  - `Press Esc to stop`
- [ ] Track active audio process — only one at a time:
  - when opening new audio, **await** old process exit before spawning new (prevents audio overlap)
  - add 500ms timeout on kill, escalate to SIGKILL if needed:
    ```ts
    proc.kill('SIGTERM')
    await Promise.race([proc.exited, new Promise(r => setTimeout(r, 500))])
    if (!proc.killed) proc.kill('SIGKILL')
    ```
- [ ] Kill audio process in `process.on('exit')` handler (prevents orphaned ffplay on quit)
- [ ] Kill audio on `renderer.destroy()` path
- [ ] Esc kills ffplay process and closes modal
- [ ] Test: audio plays in background, modal shows status
- [ ] Test: Esc kills ffplay process
- [ ] Test: opening new audio stops previous (no overlap)
- [ ] Test: quitting app kills audio process

**Files touched:**
- `src/media/ffplay.ts` — audio spawn, process tracking
- `src/renderer/opentui/media-modal.tsx` — audio UI

##### Phase 4d: Graceful Fallback

- [ ] When `canPlayVideo === false` and modal opens on video node:
  - if `poster` field exists, decode and display poster frame as static image
  - show hint text: `install ffmpeg to play video`
- [ ] When `canPlayVideo === false` and modal opens on audio node:
  - show text: `[audio: alt text]` + `install ffmpeg to play audio`
- [ ] Fallback info bar shows the same metadata (filename, type)
- [ ] Test: video modal without ffplay shows poster + hint
- [ ] Test: audio modal without ffplay shows text fallback

**Files touched:**
- `src/renderer/opentui/media-modal.tsx` — fallback rendering

---

## Race Conditions and Mitigations

### HIGH Priority

| Race | Description | Mitigation |
|------|-------------|------------|
| Zero-length selection wipes clipboard | Click on image triggers `finishSelection()` with empty text, copying empty string | Defer `startSelection()` to `onMouseMove` after >= 3 cell movement; guard `text.trim().length > 0` |
| Stale decode in modal | User presses n/N rapidly; decode for image A completes after user moved to image B | Single modal component instance with changing URL prop; `useImageLoader`'s `loadIdRef` handles staleness. Check `signal.aborted` after semaphore acquire and in decode loop. |
| FrameTimer fires after dispose | Timer callback calls `setState` after component unmount | Add `disposed` boolean flag to `createFrameTimer`; check before `onFrame()` call |
| mediaFocusIndex OOB after live reload | File edited to remove images while focus is on a later index | Clamp atomically in reducer via `LiveReload` action carrying new `mediaCount` |
| Two audio streams overlap | Kill signal not yet delivered when new ffplay spawns | `await proc.exited` (with timeout) before spawning new process |
| Audio outlives TUI | User quits with `q` while audio playing | Kill audio in `process.on('exit')` handler and `renderer.destroy()` path |
| SIGINT between suspend and spawn | Ctrl+C during TUI-to-ffplay transition | Install SIGINT handler before suspending; suppress during gap, forward to ffplay once spawned |

### MEDIUM Priority

| Race | Description | Mitigation |
|------|-------------|------------|
| Frame backpressure | React reconciliation slower than frame rate | Frame-skip mechanism: track `renderPending` ref, skip frames while previous render in flight |
| Cache serves wrong maxFrames | `preview-only` layout pane width equals terminal width; cache key collides | Include `purpose: 'modal'` discriminator in cache key |
| Decode semaphore starvation | All slots occupied by inline decodes when modal opens | Cancel or deprioritize inline decodes when modal opens; or give modal priority in semaphore |
| n/N during async reload | Focus index meaningful for old media list, stale for new | Clamp atomically in `LiveReload` action; consider anchoring focus by URL instead of index |

### Pre-Existing (found during review)

| Race | Description | Mitigation |
|------|-------------|------------|
| Fetch semaphore leak | Inflight fetches occupy semaphore slots after `clearImageCache()` on navigation | Track and abort all inflight fetches on cache clear; or create new semaphore alongside new cache |

---

## System-Wide Impact

### Interaction Graph

- `n`/`N` key -> `appReducer` -> `FocusNextMedia`/`FocusPrevMedia` -> state update -> `MediaFocusContext` re-provides -> `ImageBlock` re-renders focus indicator -> `useEffect` scrolls into view
- `return` key -> `appReducer` -> `OpenMediaModal` -> `MediaModal` mounts -> image renders at terminal width
- Mouse drag (>= 3 cells) -> deferred selection start -> finishSelection -> `copyToClipboardOSC52`
- Mouse click (< 3 cells on image) -> `onMediaClick` from context -> `FocusMedia` + `OpenMediaModal`
- Live reload -> rebuild `viewerState.mediaNodes` -> `LiveReload` action clamps focus -> close modal if node gone

### Error Propagation

- Image decode failure in modal -> show text fallback `[image: alt]` in modal (same as inline)
- ffplay spawn failure (`ENOENT`) -> show error in modal info bar, do not crash app
- OSC 52 failure -> silent (fire-and-forget, terminal convention)
- Selection on empty region -> no copy (empty string guard + deferred start)

### State Lifecycle Risks

- **Modal open during live reload:** `LiveReload` action clamps focus index atomically; modal closes if focused node no longer exists
- **ffplay running during file delete:** ffplay continues (separate process), modal closes on TUI restore
- **Memory:** lazy-computed halfblock frames (O(2 frames)) freed on modal close. Modal decode uses separate cache entries (purpose-keyed) from inline cache

### Integration Test Scenarios

1. Open document with 3 images -> press `n` three times -> verify focus cycles 1->2->3->1 and scrolls each into view
2. Focus image -> press `return` -> modal opens -> press `n` -> modal shows next image -> press Esc -> returns to viewer at original scroll position
3. Drag-select text in preview pane -> verify text copied to clipboard -> click on image -> verify modal opens (not confused with selection)
4. Open animated GIF in modal -> verify animation plays -> press space -> verify paused -> press space -> resumes
5. Live reload while modal is open on image #2 -> remove image #2 from markdown -> verify modal closes gracefully
6. Rapid n/N in modal with large images -> verify no stale image flash (correct image always displays)
7. Open video -> Ctrl+C during ffplay -> verify terminal restores cleanly

## Acceptance Criteria

### Phase 0: Bug Fixes
- [ ] Video/audio alt text sanitized against terminal escape injection
- [ ] Private network ranges blocked in `isBlockedHost()`

### Phase 1: Selection
- [ ] Mouse drag highlights text in preview pane
- [ ] Mouse-up auto-copies selected text to system clipboard via OSC 52
- [ ] No copy when there is no active selection or selection is whitespace-only
- [ ] Click (< 3 cell movement) does NOT wipe clipboard
- [ ] `selectable` explicitly set on text elements
- [ ] Works in all viewer layout modes (preview-only, side, top)

### Phase 2: Modal
- [ ] `n`/`N` cycles through media nodes with visible focus indicator
- [ ] Focused media node scrolls into view
- [ ] `return` opens full-screen modal with image at terminal width
- [ ] Click on image opens modal (disambiguated from drag-select)
- [ ] Modal info bar shows sanitized filename, dimensions, type, position
- [ ] `Esc` closes modal and preserves scroll position
- [ ] `n`/`N` cycles media within open modal
- [ ] `n`/`N`/`return` are no-ops in source-only layout and when no media exists
- [ ] Legend updates for focused/modal states
- [ ] Live reload with modal open handles gracefully (clamp, close if needed)
- [ ] Modal is sibling of scrollbox, not child (does not scroll with content)

### Phase 3: GIF Animation
- [ ] Animated GIF plays in modal (up to 50 frames)
- [ ] Space bar toggles play/pause
- [ ] Lazy frame computation — O(2 frames) peak memory, no allocation storm
- [ ] First frame visible immediately
- [ ] Frame count shown in info bar
- [ ] Frame-skip mechanism prevents terminal output backup

### Phase 4: Video/Audio
- [ ] ffplay detected at startup (synchronous `Bun.which`), capability threaded through
- [ ] Video: TUI suspends, ffplay plays, TUI restores on exit
- [ ] Audio: plays in background with "Playing... Esc to stop" UI
- [ ] Single audio at a time (old killed before new spawns, no overlap)
- [ ] Audio killed on app quit (no orphaned processes)
- [ ] Graceful fallback without ffplay (poster frame + install hint)
- [ ] Only local paths allowed for ffplay (SSRF eliminated)
- [ ] Argv-based spawn (no shell, no command injection)
- [ ] Paths sanitized: realpath, existence check, no dash prefix

## Key Bindings (Viewer Mode)

| Key | Normal | Media Focused | Modal Open |
|-----|--------|---------------|------------|
| `n` | Focus first media | Focus next media | Next media in modal |
| `N` | Focus last media | Focus prev media | Prev media in modal |
| `return` | -- | Open modal | -- |
| `Esc` | Browser/quit | Clear focus | Close modal |
| `Space` | -- | -- | Play/pause (GIF) |
| Mouse drag (>= 3 cells) | Select text | Select text | -- |
| Mouse click (< 3 cells, image) | Open modal | Open modal | -- |

## Dependencies & Risks

- **OpenTUI Selection API in React** — `useSelectionHandler` is Solid-only. Must verify `renderer.on("selection")` at runtime. Mitigation: manual mouse event approach as fallback.
- **`selectable` prop** — NOT true by default in OpenTUI. Must explicitly set on all `<text>` elements. Mitigation: add in `renderChildren()`.
- **`position: "absolute"` + `zIndex`** — confirmed available in OpenTUI types. Add `position: "relative"` to root box for reliable positioning context. Must verify layering over scrollbox early.
- **Multiple `useKeyboard` hooks** — all fire, no event stopping. Modal keys MUST be a branch in the existing App-level handler, NOT a separate hook.
- **`renderer.destroy()` + `process.exit(0)`** — blocks Phase 4 video. Mitigation: raw terminal escape sequences for suspend/resume. Investigate OpenTUI `suspend()` API first.
- **GIF memory** — 50 frames at full terminal width: ~17 MB. Bounded by `maxDecodedBytes: 30MB` cap and lazy computation (O(2 frames) peak).
- **ffplay availability** — not installed on all systems. Mitigation: graceful fallback with poster frame + install hint. Re-check before spawning.
- **Command injection** — CRITICAL risk if ffplay path goes through shell. Mitigation: mandatory `Bun.spawn()` with argv array, `sanitizeMediaPath()`, existence check, dash-prefix rejection.

## Test Files

Following the co-located test file convention:
- `src/app/state-media.test.ts` — media focus/modal reducer actions
- `src/media/ffplay.test.ts` — detection, path sanitization
- `src/renderer/opentui/index.test.ts` — extend with media collection tests

## Sources & References

### Origin

- **Brainstorm document:** [docs/brainstorms/2026-03-07-media-modal-and-selection-brainstorm.md](docs/brainstorms/2026-03-07-media-modal-and-selection-brainstorm.md) — key decisions: auto-copy on select (no extra keypress), n/N for media cycling (not Tab), modal isolates GIF rendering, ffplay with graceful fallback

### Internal References

- State machine pattern: `src/app/state.ts` — useReducer, discriminated union actions
- Image rendering: `src/renderer/opentui/image.tsx` — kitty/halfblock/text pipeline
- Image context: `src/renderer/opentui/image-context.tsx` — context pattern precedent
- FrameTimer: `src/media/frame-timer.ts` — drift-correcting frame cycling
- IR types: `src/ir/types.ts` — ImageNode, VideoNode, AudioNode
- Media capabilities: `src/media/types.ts` — MediaCapabilities shape
- Key handling: `src/renderer/opentui/app.tsx:110` — VIEWER_KEY_MAP pattern
- Browser keys extraction: `src/renderer/opentui/browser-keys.ts` — file extraction precedent
- Boot lifecycle: `src/renderer/opentui/boot.tsx` — renderer setup, BootContext
- Selection API: `@opentui/core` Selection class, `renderer.copyToClipboardOSC52()`
- Layout patterns: OpenTUI `position: "absolute"` + `zIndex` for modal overlay

### Related Plans

- Phase 6 (Kitty graphics): `docs/plans/2026-03-06-feat-phase-6-kitty-graphics-protocol-plan.md`
- Phase 6 continued (lazy loading, GIF): `docs/plans/2026-03-06-feat-phase-6-continued-plan.md`
- Media architecture: `docs/plans/2026-03-06-feat-media-architecture-plan.md`
- Phase 3 split-pane (state machine): `docs/plans/2026-03-05-feat-phase-3-split-pane-app-plan.md`
