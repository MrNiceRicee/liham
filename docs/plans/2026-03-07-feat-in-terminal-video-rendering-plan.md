---
title: In-Terminal Video Rendering
type: feat
status: active
date: 2026-03-07
deepened: 2026-03-07
---

# In-Terminal Video Rendering

## Enhancement Summary

**Deepened on:** 2026-03-07
**Research agents used:** 14 (TypeScript review, architecture, performance, security, race conditions, spec flow, pattern recognition, code simplicity, Bun.spawn streaming, React reconciliation, ffmpeg VFR, SIGSTOP/SIGCONT, audio-video sync, codebase patterns)

### Critical Fixes (must address)

1. **Frame-skip gate is broken** — `queueMicrotask` fires before React commits. Replace with `useEffect` to clear `renderPendingRef` after actual render commit.
2. **setState after unmount** — use load ID + staleness pattern from existing `useImageLoader` (invocation counter ref, not boolean).
3. **`probeVideo()` must return `ImageResult<VideoMetadata>`** — aligns with every fallible operation in the media layer. Never throw from async in useEffect.
4. **Add `reader.cancel()` in cleanup** — `handle.kill()` alone doesn't guarantee prompt pipe close. Cancel the reader before killing the process.
5. **Route video audio through `playAudio()`** — don't spawn inline. Ensures `killActiveAudio()` always finds the active audio process regardless of source.
6. **Validate ffprobe outputs as numbers** — `Number.isFinite()` on width/height/fps before interpolating into `-vf` filter string. Handle `r_frame_rate: "0/0"`, `duration: "N/A"`.
7. **Remove BOTH Enter-on-video intercepts** — `app.tsx` has TWO intercepts for Enter on non-image nodes (lines ~269 and ~278). Both must go when `playVideo()` is removed.

### Simplification Opportunities

1. **Drop `VideoPlaybackHandle`** — use module-level `activeVideoProc` + `killActiveVideo()` like existing audio pattern. Caller reads `proc.stdout` directly.
2. **Async generator > TransformStream** — simpler frame accumulation, eliminates one abstraction layer.
3. **Collapse phases** — Phase 1 (decoder library) + Phase 2 (wire into modal with lifecycle + cleanup + old code removal). Two phases, not four.
4. **Defer resize handling** — play at dimensions computed on open. GIF doesn't handle resize either.
5. **Defer `PlaybackInfo` type** — existing gallery shows `[vid]` via `typeIcon()`. Sufficient for v1.
6. **Rename `kind: 'image'` → `kind: 'open'`** — `MediaModalState` already handles images, GIFs, and now video. The name `'image'` is misleading.

### Key Research Discoveries

1. **Single-ffmpeg audio sync** — `ffmpeg -re ... -map 0:v:0 -f rawvideo pipe:1 -map 0:a:0 -f audiotoolbox -` eliminates startup drift entirely (single clock). Investigate as Tier 1 approach.
2. **`-readrate_initial_burst 0.5`** — reduces first-frame latency by allowing 0.5s of instant buffered reads before `-re` pacing kicks in.
3. **OpenTUI double-buffered rendering** — Zig native layer only emits ANSI for cells that actually changed. Row-level stability detection can leverage this for 30-70% less terminal output.
4. **SIGSTOP/SIGCONT works via `proc.kill("SIGSTOP")`** — Bun supports signal names. Must SIGCONT before SIGTERM when cleaning up a stopped process. Platform: macOS/Linux only.
5. **`bun test` stdout issue (#24690)** — `Bun.spawn()` with `stdout: 'pipe'` may return empty output inside `bun test`. Watch for this in integration tests.

---

## Overview

Replace the current ffplay SDL window approach with rendering video frames directly in the terminal using halfblock characters. Video frames are extracted by ffmpeg, streamed via stdout pipe, converted to halfblock grids, and rendered in the existing media modal overlay. Audio plays via `ffplay -nodisp` in the background.

## Problem Statement

The current `playVideo()` implementation suspends the TUI and launches ffplay in a separate SDL window. This has two UX problems:

1. Video opens in a **separate window**, breaking the TUI experience
2. Users must alt-tab back to the terminal after video ends

The goal is to render video inline within the modal overlay, the same way GIF animation already works — just with a different frame source (ffmpeg pipe instead of sharp GIF decode).

## Proposed Solution

**Architecture:**

```
ffprobe → metadata (fps, width, height, duration)
                ↓
ffmpeg -re -readrate_initial_burst 0.5 → raw RGBA frames on stdout pipe
                ↓
Bun.spawn stdout reader → async generator accumulates fixed-size frame chunks
                ↓
build LoadedImage shape → renderHalfBlockMerged() → MergedSpan[][]
                ↓
setState(grid) → ModalHalfBlockRows renders in modal
                ↓
Audio: playAudio() → ffplay -nodisp -autoexit -vn (background)
```

This reuses the entire existing halfblock rendering pipeline. The modal already supports animated content (GIF). Video is architecturally the same — just a streaming frame source instead of pre-decoded frames.

### Research Insights: Architecture

**Single-ffmpeg audio option (investigate for v1 or v2):**
A single ffmpeg process can output raw video to stdout AND play audio via platform audio device:
```
ffmpeg -re -v quiet -i <path> \
  -map 0:v:0 -f rawvideo -pix_fmt rgba -vf "scale=W:H,fps=10" pipe:1 \
  -map 0:a:0? -f audiotoolbox -
```
- `-f audiotoolbox` (macOS) / `-f pulse` (Linux) outputs to system speakers
- `0:a:0?` optional stream specifier — no error if no audio track
- Eliminates startup drift entirely (single clock, single demux)
- Reduces process management to one PID
- **Risk:** Not confirmed working with `pipe:1` + device output combination. Needs empirical testing.
- **Fallback:** If this fails, dual-process approach (ffmpeg + ffplay) with ~100-300ms drift is acceptable.

**Back-pressure is automatic:**
The OS pipe buffer (64KB macOS, 64KB Linux) + Bun's PipeReader naturally throttle ffmpeg when the consumer is slow. No manual flow control needed. If React stalls for ~400ms, the pipe fills and ffmpeg blocks.

---

## Technical Approach

### Key Design Decisions

1. **Push-based frame pacing** — ffmpeg's `-re` flag throttles output to real-time (~20% CPU vs 500% without). The pipe reader calls `setState` directly as frames arrive. No separate timer needed. If React can't keep up, a `renderPending` ref gates frame updates.

   > **Research fix:** The `renderPending` gate must use `useEffect` (fires after React commit), NOT `queueMicrotask` (fires before React renders). See Phase 2a for corrected pattern.

   > **ffmpeg VFR handling:** `-re` is DTS/PTS-aware — it paces based on actual packet timestamps, not assumed constant intervals. The `fps=10` filter correctly handles both CFR and VFR input by dropping/duplicating frames based on PTS. No `-vsync`/`-fps_mode` flags needed.

2. **Single-frame buffer** — only the latest frame is held in memory. Previous frames are discarded. No accumulation, no cache. Video frames bypass `ImageCache` entirely.

   > **Research:** Pre-allocate a single frame buffer (`new Uint8Array(frameSize)`) and copy chunks in with offset tracking. Let stream chunks be GC'd. At 10 FPS / 80x48, total memory overhead is ~100-200 KiB beyond the frame buffer.

3. **Replaces SDL approach** — the new in-terminal rendering replaces `playVideo()` for the default path. The old suspend/resume approach is removed. Audio-only playback (`playAudio()`) remains unchanged.

   > **Spec flow note:** Remove BOTH Enter-on-video intercepts in `app.tsx` (pre-modal at ~line 269 AND in-modal at ~line 278). Both call `handleMediaPlay()` which routes to the deleted `playVideo()`.

4. **Module-level process tracking** — a module-level `activeVideoProc` variable tracks the ffmpeg subprocess, with `killActiveVideo()` for cleanup. Same pattern as `activeAudioProc` in `ffplay.ts`.

   > **Simplification:** Drop the `VideoPlaybackHandle` abstraction. The handle adds indirection for no functional gain — only one consumer exists (`ModalVideoContent`), and the caller reads `proc.stdout` directly. Use `activeVideoProc` + `killActiveVideo()` like audio.

5. **No pause for v1** — play and stop only. Pause requires SIGSTOP/SIGCONT coordination between two processes plus pipe state management. Can be added later.

   > **Research (future pause):** Bun's `proc.kill("SIGSTOP")` works — signal names are fully supported. SIGSTOP cannot be caught/blocked by ffmpeg — kernel guarantee. Pipe buffers preserve all data safely across SIGSTOP/SIGCONT. Sequential signal sends have microsecond gap (imperceptible). **Critical:** Must SIGCONT before SIGTERM/SIGKILL when cleaning up a stopped process. Platform: macOS/Linux only, no Windows support. After SIGSTOP, drain 1-2 extra frames from pipe buffer before showing freeze frame.

6. **Audio sync is approximate** — both processes spawn as fast as possible. Startup drift (~100-300ms) is acceptable for v1. No sync protocol.

   > **Research:** Human perception of A/V sync: <100ms imperceptible, 100-200ms detectable on sharp cues, 200-400ms noticeable on speech. Terminal video at 10 FPS halfblock is inherently "abstract" — lower lip-sync expectations. 300ms is borderline acceptable. The single-ffmpeg approach (see architecture section) would reduce drift to near-zero.

7. **Even height enforced at ffmpeg level** — compute target dimensions with even height before spawning ffmpeg. No per-frame padding needed.

   > **Performance:** Correct call. `padToEvenHeight()` in `decoder.ts` copies the entire RGBA buffer. At 10 FPS that's 10 buffer copies/sec avoided.

8. **10 FPS target** — conservative frame rate that works on all terminals. Reduces CPU and terminal throughput requirements. Can be bumped to 15 if performance allows.

   > **Research:** React reconciliation budget at 10 FPS: estimated 6-21ms total per frame (halfblock 1-3ms, React diff 2-8ms, Zig commit 1-3ms, ANSI output 1-5ms) vs 100ms frame budget. Significant headroom. OpenTUI's Zig double-buffered renderer only emits ANSI for cells that actually changed between frames.

### File Map

New files:
- `src/media/video-decoder.ts` — ffprobe metadata, ffmpeg frame streaming, dimension calculation, process tracking
- `src/media/video-decoder.test.ts` — unit tests

Modified files:
- `src/media/ffplay.ts` — add `isFfmpegAvailable()`, remove old `playVideo()` + `TuiSuspendResume`
- `src/media/types.ts` — update `MediaCapabilities` (canPlayVideo requires ffmpeg)
- `src/renderer/opentui/media-modal.tsx` — add `ModalVideoContent` component
- `src/renderer/opentui/app.tsx` — rewire video playback to in-terminal rendering
- `src/app/state.ts` — rename `kind: 'image'` → `kind: 'open'` in `MediaModalState`

> **Simplification:** Consider adding video functions to `ffplay.ts` instead of a separate `video-decoder.ts` if ffplay.ts stays under 500 lines. Process lifecycle tracking for both audio and video would live in one file.

> **Pattern note:** Extract shared `killProcess(proc, timeoutMs)` helper to avoid duplicating the SIGTERM→500ms→SIGKILL escalation between audio and video. Consolidate `process.on('exit')` handlers into a single active-process registry.

### Implementation Phases

---

#### Phase 1: Video Frame Decoder Module

Core streaming infrastructure. No UI changes yet — purely a library module with tests.

##### Phase 1a: ffmpeg/ffprobe Detection

- [x] Add `isFfmpegAvailable()` to `src/media/ffplay.ts` (same pattern as `isFfplayAvailable()`)
  ```ts
  export function isFfmpegAvailable(): boolean {
    return Bun.which('ffmpeg') != null
  }
  ```
- [x] ffprobe ships with ffmpeg — checking ffmpeg is sufficient (they're always co-packaged)
- [x] Update `MediaCapabilities`: `canPlayVideo` now requires ffmpeg (not just ffplay)
  - `canPlayVideo = isFfmpegAvailable()` (video rendering needs ffmpeg for frame extraction)
  - `canPlayAudio = isFfplayAvailable()` (audio-only still uses ffplay)
- [x] Update CLI `--info` output to show `ffmpeg: true/false`
- [x] Update `app.tsx` `handleMediaPlay` to check correct capability per media type
- [x] Test: detection returns true when ffmpeg is installed

> **Spec flow edge case:** If ffmpeg is missing but ffplay is present, video shows fallback but audio-only playback is still possible. Consider: when `canPlayVideo === false` and `canPlayAudio === true`, offer audio-only playback for video nodes with audio tracks.

**Files:** `src/media/ffplay.ts`, `src/media/types.ts`, `src/cli/index.ts`

##### Phase 1b: ffprobe Metadata Extraction

- [x] Create `src/media/video-decoder.ts` with `probeVideo()`:
  ```ts
  interface VideoMetadata {
    width: number
    height: number
    fps: number
    duration: number // seconds, 0 if unknown
    hasAudio: boolean
  }

  async function probeVideo(
    filePath: string,
    signal?: AbortSignal,
  ): Promise<ImageResult<VideoMetadata>>
  ```
- [x] Call `sanitizeMediaPath()` as the **first line** — before any process spawn
- [x] Command: `ffprobe -v quiet -print_format json -select_streams v:0 -show_entries stream=width,height,r_frame_rate,duration -show_entries format=duration <path>`
- [x] Parse `r_frame_rate` fraction string (e.g., `"30000/1001"` → 29.97)
- [x] Detect audio stream presence: `ffprobe -v quiet -select_streams a:0 -show_entries stream=codec_type -print_format json <path>`
- [x] Add 5-second timeout on ffprobe (`Bun.spawn` timeout option)
- [x] Cap ffprobe stdout to 64KB before `JSON.parse()` (defense-in-depth)
- [x] Cap dimensions: reject if width or height > 16384 (raw metadata check)
- [ ] Test: parses metadata from test video correctly
- [ ] Test: timeout on hung ffprobe
- [x] Test: `https://` URLs rejected by `sanitizeMediaPath()`
- [x] Test: paths with `../` handled safely

> **Research fix:** Return `ImageResult<VideoMetadata>`, not `Promise<VideoMetadata>`. Aligns with `decodeImage()`, `getImageDimensions()`, `loadImageFile()`. Prevents unhandled rejections in useEffect async code.

> **Research fix:** Accept optional `AbortSignal` for cancellation on unmount. When the signal fires, kill the ffprobe process and return `{ ok: false, error: 'aborted' }`. The existing `useImageLoader` uses this pattern (creates AbortController, calls `controller.abort()` in cleanup).

> **Security: Validate all parsed values defensively:**
> - `r_frame_rate`: parse as fraction, fall back to 10 FPS if unparseable, `"0/0"`, NaN, Infinity, or negative
> - `duration`: parse as float, fall back to 0 if `"N/A"` or missing
> - `width`/`height`: validate as positive integers, reject if missing/zero/negative
> - Use `Number.isFinite()` before interpolating into `-vf` filter string
> - `try/catch` around `JSON.parse()` with graceful error return
> - For `avg_frame_rate` vs `r_frame_rate`: use `avg_frame_rate` for display (more meaningful for VFR), use `r_frame_rate` only as fallback

> **Spec flow edge case:** `.mp4` files with no video stream (audio-only) will have missing/zero width+height. After probeVideo(), check that width and height are positive. If not, return `{ ok: false, error: 'no video stream' }`.

**Files:** `src/media/video-decoder.ts`

##### Phase 1c: Frame Streaming

- [x] Add `createVideoStream()` to `src/media/video-decoder.ts`:
  ```ts
  interface VideoStreamOptions {
    filePath: string
    width: number   // target pixel width (= terminal cols), max 2048
    height: number  // target pixel height (= terminal rows * 2, must be even), max 2048
    fps: number     // target fps (default 10)
  }

  function createVideoStream(options: VideoStreamOptions): Subprocess
  ```
- [ ] Call `sanitizeMediaPath()` as the **first line**
- [x] Validate dimensions: `Number.isFinite()`, positive, max 2048, height is even
- [x] Command: `ffmpeg -re -readrate_initial_burst 0.5 -v quiet -i <path> -f rawvideo -pix_fmt rgba -vf "scale=<W>:<H>,fps=<FPS>" pipe:1`
- [x] Construct `-vf` filter string from validated integers only:
  ```ts
  const vf = `scale=${Math.round(width)}:${Math.round(height)},fps=${Math.min(fps, 60)}`
  ```
- [x] Stderr: `'ignore'` (suppress ffmpeg logs)
- [x] Return the `Subprocess` directly — caller reads `proc.stdout`
- [x] Module-level `activeVideoProc` tracking (register immediately at spawn)
- [x] `killActiveVideo()`: SIGTERM → 500ms race → SIGKILL (same pattern as `killActiveAudio()`)
- [x] Register with `process.on('exit')` handler using SIGKILL (synchronous, matching audio pattern)
- [ ] Test: reads correct number of frames from a known video
- [ ] Test: frame size matches expected `width * height * 4`
- [ ] Test: kill() terminates the ffmpeg process
- [x] Test: partial frame at end of stream is discarded (no crash)

> **Research: Frame accumulation via async generator (simpler than TransformStream):**
> ```ts
> async function* readFrames(
>   stdout: ReadableStream<Uint8Array>,
>   frameSize: number,
> ): AsyncGenerator<Uint8Array> {
>   const buffer = new Uint8Array(frameSize)
>   let offset = 0
>   for await (const chunk of stdout) {
>     let chunkOffset = 0
>     while (chunkOffset < chunk.length) {
>       const remaining = frameSize - offset
>       const toCopy = Math.min(remaining, chunk.length - chunkOffset)
>       buffer.set(chunk.subarray(chunkOffset, chunkOffset + toCopy), offset)
>       offset += toCopy
>       chunkOffset += toCopy
>       if (offset === frameSize) {
>         yield new Uint8Array(buffer)  // copy out (or double-buffer for v2)
>         offset = 0
>       }
>     }
>   }
>   // partial frame at end deliberately discarded
> }
> ```
> - Pre-allocated buffer with offset tracking — no array concatenation
> - `chunk.subarray()` creates views without copying
> - A single chunk can span frame boundaries — inner while loop handles this
> - `for await` is well-optimized in Bun for subprocess stdout
> - Back-pressure is automatic via OS pipe buffer

> **Research: rawvideo pipe writes are NOT frame-aligned.** POSIX pipe atomicity only guarantees atomicity for writes ≤ PIPE_BUF (4096 bytes). At 80x48 RGBA = 15,360 bytes/frame, frames WILL be split across multiple writes. Frame accumulation is mandatory.

> **Security:** Lower effective dimension cap to 2048 for ffmpeg output (the 16384 cap on raw metadata is a sanity check; values passed to ffmpeg scale= should be terminal-realistic).

> **Performance:** Consider double-buffer approach for v2 to eliminate per-frame Uint8Array allocation:
> ```ts
> const bufA = new Uint8Array(frameSize)
> const bufB = new Uint8Array(frameSize)
> let useA = true
> // ...yield the buffer directly, swap on next frame
> ```

**Files:** `src/media/video-decoder.ts`, `src/media/video-decoder.test.ts`

##### Phase 1d: Dimension Calculation

- [x] Add `computeVideoDimensions()` helper:
  ```ts
  interface VideoDimensions {
    pixelWidth: number   // for ffmpeg -vf scale
    pixelHeight: number  // always even
    termCols: number     // 1 col = 1 pixel
    termRows: number     // 1 row = 2 pixels
  }

  function computeVideoDimensions(
    videoWidth: number,
    videoHeight: number,
    termWidth: number,
    termHeight: number, // available height minus chrome
  ): VideoDimensions
  ```
- [x] Preserve aspect ratio: fit within `termWidth × (termHeight * 2)` pixel box
- [x] Round pixel height to even (round down)
- [ ] Enforce even height assertion: throw if height is odd (defensive, should never happen)
- [x] `termCols = pixelWidth`, `termRows = pixelHeight / 2`
- [x] Minimum viable dimension: if result < 20x5 (term cols x rows), return null to trigger text fallback
- [x] Test: 16:9 video in 80x24 terminal → correct fit
- [x] Test: portrait video → width-constrained
- [x] Test: odd height is rounded to even
- [x] Test: very small terminal returns null

> **Pattern note:** The terminal dimension mapping (`termCols = width`, `termRows = height / 2`) duplicates logic in `terminalDimensions()` in `decoder.ts`. Consider extracting to a shared utility.

> **Spec flow: "Chrome" height** — available height must subtract: status bar (2 rows) + modal info bar (2 rows if visible). Gallery panel should auto-hide during video playback.

**Files:** `src/media/video-decoder.ts`

---

#### Phase 2: Modal Video Rendering + Lifecycle

Wire the streaming decoder into the modal overlay. Includes process lifecycle, cleanup, old code removal, and fallback. This is a single phase because process cleanup is a correctness requirement, not polish.

##### Phase 2a: ModalVideoContent Component

- [x] Add `ModalVideoContent` to `src/renderer/opentui/media-modal.tsx`:
  ```tsx
  function ModalVideoContent({
    src, alt, theme, maxCols, maxRows, basePath,
  }): ReactNode
  ```
- [x] State: `'loading' | 'playing' | 'error' | 'ended'`
- [ ] **Single useEffect** for video + audio (not separate effects — avoids cleanup ordering issues):
  ```ts
  const loadIdRef = useRef(0)
  const renderPendingRef = useRef(false)
  const [currentGrid, setCurrentGrid] = useState<MergedSpan[][] | null>(null)
  const [playbackState, setPlaybackState] = useState<'loading' | 'playing' | 'error' | 'ended'>('loading')

  // clear renderPending after React commits (NOT queueMicrotask)
  useEffect(() => {
    renderPendingRef.current = false
  })

  useEffect(() => {
    const thisLoadId = ++loadIdRef.current
    const isStale = () => loadIdRef.current !== thisLoadId
    const controller = new AbortController()
    let proc: Subprocess | null = null
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null
    let audioStarted = false

    void (async () => {
      // 1. probe
      const result = await probeVideo(src, controller.signal)
      if (isStale() || !result.ok) {
        if (!isStale()) setPlaybackState('error')
        return
      }
      const meta = result.value

      // 2. compute dimensions
      const dims = computeVideoDimensions(meta.width, meta.height, maxCols, maxRows)
      if (dims == null || isStale()) return

      // 3. start video stream
      proc = createVideoStream({
        filePath: src, width: dims.pixelWidth, height: dims.pixelHeight, fps: 10,
      })

      // 4. start audio (through playAudio, not inline spawn)
      if (meta.hasAudio) {
        void playAudio(src, basePath)
        audioStarted = true
      }

      // 5. frame read loop
      setPlaybackState('playing')
      for await (const rgba of readFrames(proc.stdout, dims.pixelWidth * dims.pixelHeight * 4)) {
        if (isStale()) break
        if (renderPendingRef.current) continue // frame skip
        const image: LoadedImage = {
          rgba, width: dims.pixelWidth, height: dims.pixelHeight,
          terminalCols: dims.termCols, terminalRows: dims.termRows,
          byteSize: rgba.byteLength, source: src,
        }
        const grid = renderHalfBlockMerged(image, bgColor)
        renderPendingRef.current = true
        setCurrentGrid(grid)
      }

      // 6. check exit code for error vs normal end
      if (!isStale()) {
        const exitCode = await proc.exited
        setPlaybackState(exitCode === 0 ? 'ended' : 'error')
      }
    })()

    return () => {
      loadIdRef.current++ // mark stale
      controller.abort()  // cancel in-flight probeVideo
      reader?.cancel()    // abort pending pipe read
      if (proc != null) {
        try { proc.kill('SIGKILL') } catch { /* already dead */ }
      }
      if (audioStarted) killActiveAudio()
    }
  }, [src, basePath, maxCols, maxRows])
  ```
- [ ] Loading state: show `[loading video: alt]` text
- [ ] Error state: show `[video: alt]` with error message
- [ ] Ended state: show last rendered frame (natural — grid state persists)
- [ ] Test: component renders loading state initially
- [ ] Test: component renders halfblock grid during playback

> **Research fix (critical): Frame-skip gate.**
> The original plan used `queueMicrotask(() => { renderPendingRef.current = false })`. This fires BEFORE React commits — React 18+ batches setState and renders as a macrotask. The microtask fires, clears the flag, and the next frame is accepted while React is still processing the previous one.
>
> The fix: a no-deps `useEffect` that runs after every React commit:
> ```ts
> useEffect(() => { renderPendingRef.current = false })
> ```
> This guarantees frames are only accepted after React has committed the previous grid.

> **Research fix (critical): Stale async detection.**
> Use the invocation counter pattern from `useImageLoader` (monotonically increasing `loadIdRef`, not a boolean). Rapid URL changes (1→2→1) can create race conditions that a boolean stale flag doesn't capture.

> **Race condition: cleanup uses SIGKILL, not graceful kill.**
> React useEffect cleanup must be synchronous. The SIGTERM→500ms→SIGKILL escalation is async — can't await in cleanup. Use `SIGKILL` directly in cleanup (same as existing `process.on('exit')` handler). Reserve graceful kill for app-level quit.

> **Race condition: Rapid n/N.**
> User pressing n/N quickly spawns and kills ffmpeg repeatedly. The load ID pattern handles this — each mount increments the counter, previous async work bails on stale check. Consider: refuse n/N if a navigation is already pending (debounce).

> **Performance: React.memo on rows is HARMFUL for video** — every frame produces new arrays, comparison always fails, so you pay comparison cost and still re-render. Skip memo for video grid. The existing `ModalHalfBlockRows` correctly does not use React.memo.

> **Performance: React concurrent features not helpful** — `startTransition`/`useDeferredValue` add overhead without benefit for real-time video. Automatic batching (React 18+) helps for free.

**Files:** `src/renderer/opentui/media-modal.tsx`

##### Phase 2b: Wire Into MediaModal + State

- [ ] In `MediaModal`, replace `ModalMediaFallback` for video nodes:
  ```tsx
  {node.type === 'image' ? (
    <ModalImageContent ... />
  ) : node.type === 'video' ? (
    <ModalVideoContent ... />
  ) : (
    <ModalMediaFallback ... />  // audio-only stays as text
  )}
  ```
- [ ] Rename `MediaModalState` `kind: 'image'` to `kind: 'open'`:
  ```ts
  export type MediaModalState =
    | { kind: 'closed' }
    | { kind: 'open'; mediaIndex: number; galleryHidden: boolean; paused: boolean }
  ```
- [ ] Update all `kind === 'image'` checks to `kind === 'open'`
- [ ] Gate `TogglePlayPause` (spacebar): no-op when focused media node is a `VideoNode` (video has no pause in v1)
- [ ] Update legend to hide "pause" label when viewing video
- [ ] `ModalVideoContent` gets basePath from `ImageContext` (already provided by parent)
- [ ] Test: opening modal on video node shows video content, not text fallback

**Files:** `src/renderer/opentui/media-modal.tsx`, `src/app/state.ts`, `src/renderer/opentui/viewer-keys.ts`

##### Phase 2c: Remove Old SDL Approach + Cleanup

- [ ] Remove `playVideo()` function from `src/media/ffplay.ts`
- [ ] Remove `TuiSuspendResume` interface
- [ ] Remove **both** video playback intercepts from `app.tsx`:
  - Pre-modal Enter intercept (~line 269): calls `handleMediaPlay` for non-image focused nodes
  - In-modal Enter intercept (~line 278): calls `handleMediaPlay` for non-image in modal
  - Audio playback intercept stays (Enter on audio node → `playAudio()`)
- [ ] Video nodes now open the modal (same as images) — modal handles playback
- [ ] Remove `renderer.suspend()`/`renderer.resume()` calls for video
- [ ] Test: Enter on video node opens modal (not SDL window)

**Files:** `src/media/ffplay.ts`, `src/renderer/opentui/app.tsx`

##### Phase 2d: Graceful Fallback

- [ ] When `canPlayVideo === false` (no ffmpeg) and modal opens on video node:
  - Show `[video: alt]` text
  - Info bar: `install ffmpeg to play video`
- [ ] Test: video modal without ffmpeg shows fallback + hint

**Files:** `src/renderer/opentui/media-modal.tsx`

##### Phase 2e: Error Handling

- [ ] ffprobe fails (timeout, parse error): show text fallback with error
- [ ] ffmpeg crashes mid-playback: check exit code, show error state, keep last frame if available
- [ ] ffmpeg exits with non-zero code: transition to `'error'` state (not `'ended'`)
- [ ] Pipe read error (EPIPE): treat as end-of-stream, show last frame
- [ ] Test: corrupt video shows error state gracefully

> **Research: Max playback duration timeout.** Add a ceiling: `probeMetadata.duration + 30` seconds, or hard cap of 30 minutes. Prevents indefinitely-running ffmpeg from crafted videos.

> **V1 intentional omissions (document in code comments):**
> - No pause/resume (SIGSTOP/SIGCONT deferred)
> - No seeking (arrow keys)
> - No loop support (ignore `VideoNode.loop`)
> - No autoplay (ignore `VideoNode.autoplay`)
> - No poster frame during loading (ignore `VideoNode.poster`)
> - Approximate audio sync (~300ms drift with dual-process)
> - Remote video URLs not supported (rejected by `sanitizeMediaPath`)
> - Resize during playback: video plays at dimensions computed on open

**Files:** `src/media/video-decoder.ts`, `src/renderer/opentui/media-modal.tsx`

---

## Scalability Assessment

### Terminal Size → Performance Projections

| Terminal Size | Pixels | RGBA/frame | ANSI/frame | ANSI/sec (10fps) | halfblock ms/frame (est) | Total CPU (est) |
|:-------------|:-------|:-----------|:-----------|:-----------------|:------------------------|:----------------|
| 80x24 | 80x48 | 15 KB | ~50 KB | 500 KB/s | ~1-2ms | ~28% |
| 120x40 | 120x80 | 38 KB | ~110 KB | 1.1 MB/s | ~3-4ms | ~35% |
| 200x50 | 200x100 | 80 KB | ~180 KB | 1.8 MB/s | ~8-12ms | ~50% |
| 300x80 | 300x160 | 192 KB | ~400 KB | 4.0 MB/s | ~18-25ms | ~90% |

Most modern terminals (iTerm2, WezTerm, Kitty, Alacritty) handle 2-5 MB/s. Terminal.app caps at ~500 KB/s. At 300x80 (ultrawide), the ~25ms render time leaves 75ms headroom for React + output in the 100ms frame budget — this is the practical ceiling.

### V2 Performance Optimizations (if needed)

1. **Row-level delta detection** — compare each row to previous grid, reuse unchanged row references. React skips rows with stable references. Could reduce terminal output by 30-70% for typical video (gradual camera motion).
2. **Packed-integer colors in halfblock** — replace per-pixel hex string allocation with packed `(r << 16) | (g << 8) | b` integers. Only call `toHex()` at span boundaries. 60-75% reduction in string allocations.
3. **Double-buffer frame Uint8Array** — eliminate per-frame allocation (see Phase 1c research note).
4. **Adaptive frame rate** — if commit latency exceeds 80ms for 3 consecutive frames, drop to 5 FPS. Recover after 5 fast commits.
5. **Opaque fast-path** — skip alpha blending for video frames (video codecs produce fully opaque pixels). ~10% speedup.
6. **Direct ANSI bypass** — nuclear option: generate ANSI strings directly, skip React for video grid. Only if P0-P4 are insufficient for 300+ column terminals.

---

## System-Wide Impact

### Interaction Graph

- `Enter` on focused video → `OpenMediaModal` → `ModalVideoContent` mounts → `probeVideo()` → `createVideoStream()` → frame loop → `renderHalfBlockMerged()` → `ModalHalfBlockRows` renders
- Audio spawns via `playAudio(src, basePath)` → background `ffplay -nodisp -autoexit -vn`
- `Esc` → `CloseMediaModal` → `ModalVideoContent` unmounts → useEffect cleanup → SIGKILL ffmpeg + `killActiveAudio()`
- `n`/`N` in modal → unmount current `ModalVideoContent` → cleanup → mount new content (image/video/audio)

### Error Propagation

- ffprobe failure → `probeVideo()` returns `{ ok: false }` → component shows text fallback, no crash
- ffmpeg crash → pipe reader gets `done: true` early → check exit code → error or ended state
- Audio ffplay crash → audio stops, video continues (independent processes)
- React render error → standard error boundary (halfblock rendering is well-tested)

### State Lifecycle Risks

- **Orphaned ffmpeg**: Load ID staleness pattern + useEffect SIGKILL cleanup + `process.on('exit')` SIGKILL. Three layers of defense.
- **Orphaned audio**: Routed through `playAudio()` → `activeAudioProc` tracking → `killActiveAudio()` + `process.on('exit')`.
- **Memory accumulation**: single-frame buffer — only latest grid + latest RGBA in memory. No accumulation. `useFrameGridCache` from image path is NOT used for video.
- **Rapid n/N**: load ID increments on each mount. Previous async work bails on stale check. SIGKILL in cleanup is immediate.
- **setState after unmount**: stale check in every async continuation prevents this. React 18+ silently no-ops setState on unmounted components (no warning).

### Integration Test Scenarios

1. Open video in modal → verify halfblock frames render → Esc → modal closes, no orphaned processes
2. Open video → press n → next image shows → press n → back to video → new video plays
3. Open video without ffmpeg installed → fallback text shown with install hint
4. Open corrupt video → error state shown, app doesn't crash
5. Open video → Esc immediately (before first frame) → no orphaned ffmpeg process
6. Open video → rapid n/N/n/N → no orphaned processes, each video starts/stops cleanly
7. Video without audio track → plays silently, no error
8. Video ends → last frame shown, modal stays open, "Ended" state

## Acceptance Criteria

### Functional Requirements

- [ ] Video frames render as halfblock characters in the media modal
- [ ] Audio plays alongside video via ffplay -nodisp
- [ ] Esc stops video and audio, closes modal
- [ ] n/N navigates between media (stops current video, starts next)
- [ ] Video without audio track plays silently (no error)
- [ ] Video end shows last frame, modal stays open
- [ ] Loading state shown before first frame

### Non-Functional Requirements

- [ ] 10 FPS minimum render rate
- [ ] No orphaned ffmpeg/ffplay processes on any exit path
- [ ] Memory: single-frame buffer, no accumulation
- [ ] CPU: ffmpeg `-re` flag keeps decode usage at ~20%
- [ ] Terminal throughput: halfblock output stays within terminal limits (see scalability table)

### Quality Gates

- [ ] All new code has unit tests
- [ ] ffprobe/ffmpeg spawns use argv arrays (no shell, no injection)
- [ ] All paths use `sanitizeMediaPath()` for path validation
- [ ] `probeVideo()` returns `ImageResult<T>`, never throws
- [ ] ffprobe output values validated with `Number.isFinite()` before use in `-vf` filter
- [ ] Dimensions capped at 2048 for ffmpeg output
- [ ] Existing tests continue to pass (416+)

## Dependencies & Risks

- **ffmpeg/ffprobe required** — not installed on all systems. Mitigation: graceful fallback with install hint. Detection at startup.
- **Terminal throughput** — halfblock output at 10 FPS for 200-column terminal is ~1.8 MB/s of ANSI escapes. Most terminals handle this, but slow terminals may lag. Mitigation: frame skipping via `renderPending` ref (useEffect-based gate).
- **Audio sync** — dual-process approach has ~100-300ms startup drift. Mitigation: acceptable for v1 terminal video. Single-ffmpeg approach can reduce to near-zero (see architecture research).
- **React reconciliation speed** — 10 FPS of full-grid state updates: estimated 6-21ms per frame vs 100ms budget. OpenTUI's Zig double-buffer further reduces output. Not a bottleneck.
- **Rezi renderer** — out of scope. Rezi has open bugs (scroll, image crash). Video support can be added when Rezi stabilizes.
- **`bun test` stdout issue** — Bun.spawn with `stdout: 'pipe'` may return empty in `bun test` (Bun issue #24690). May need workarounds for integration tests.
- **Bun spawn memory leak** — Fixed in Bun PR #18316. Ensure Bun version ≥1.2 where piped stdout/stderr finalization is correct.

## Key Bindings (updated)

| Key | Video in Modal |
|-----|----------------|
| `Esc` | Stop video + audio, close modal |
| `n` | Stop video, next media |
| `N` | Stop video, prev media |
| `q` | Quit app (kills all processes) |
| `Space` | No-op for video (pause deferred to v2) |

## Sources & References

### Internal References

- Halfblock renderer: `src/media/halfblock.ts` — `renderHalfBlockMerged()`
- Frame timer (GIF pattern): `src/media/frame-timer.ts` — `createFrameTimer()`
- Modal overlay: `src/renderer/opentui/media-modal.tsx` — `ModalHalfBlockRows`, `ModalImageContent`
- ffplay module: `src/media/ffplay.ts` — `sanitizeMediaPath()`, `playAudio()`, `killActiveAudio()`
- Image decoder: `src/media/decoder.ts` — `LoadedImage`, `padToEvenHeight()`
- Image loader: `src/renderer/opentui/use-image-loader.ts` — `loadIdRef` stale pattern, `AbortController` cancellation
- State machine: `src/app/state.ts` — `MediaModalState`, `AppAction`
- Media architecture plan: `docs/plans/2026-03-06-feat-media-architecture-plan.md`
- Media modal plan: `docs/plans/2026-03-07-feat-media-modal-and-selection-plan.md`
- Institutional knowledge: `docs/learnings/2026-03-07-media-modal-and-selection-institutional-knowledge.md`

### External References — Research Findings

- **ffmpeg VFR handling**: `-re` is DTS/PTS-aware, paces on actual timestamps. `fps=10` filter handles VFR correctly. Source: [ffmpeg readrate commit](https://github.com/FFmpeg/FFmpeg/commit/c320b78), [fps filter docs](https://blog.jdlh.com/en/2020/04/30/ffmpeg-fps-documented/)
- **ffmpeg `-readrate_initial_burst`**: Reduces first-frame latency. Source: [ffmpeg-devel patch](https://ffmpeg.org/pipermail/ffmpeg-devel/2023-April/308243.html)
- **Bun.spawn stdout**: `ReadableStream<Uint8Array>`, chunks are variable-sized (not frame-aligned). `proc.kill("SIGTERM"/"SIGKILL"/"SIGSTOP")` all supported. Source: [Bun spawn docs](https://bun.sh/docs/runtime/child-process)
- **Bun spawn memory leak**: Fixed in PR #18316. Source: [GitHub PR](https://github.com/oven-sh/bun/pull/18316)
- **Bun test stdout issue**: Issue #24690. Source: [GitHub issue](https://github.com/oven-sh/bun/issues/24690)
- **POSIX pipe atomicity**: Writes > PIPE_BUF (4096 bytes) may split. Source: [pipe(7)](https://man7.org/linux/man-pages/man7/pipe.7.html)
- **A/V sync perception**: <100ms imperceptible, 100-200ms detectable, 200-400ms noticeable on speech. Source: [PMC study](https://pmc.ncbi.nlm.nih.gov/articles/PMC4451240/)
- **Single-ffmpeg audio**: `-f audiotoolbox` (macOS) / `-f pulse` (Linux) for direct audio output. Source: [ffmpeg devices docs](https://www.ffmpeg.org/ffmpeg-devices.html)
- **SIGSTOP/SIGCONT**: Kernel-guaranteed suspension, pipe buffers preserved, must SIGCONT before SIGTERM. Source: [pipe(7)](https://man7.org/linux/man-pages/man7/pipe.7.html), [TheLinuxCode](https://thelinuxcode.com/stop-process-using-sigstop-signal-linux/)
- **React reconciliation**: 10 FPS well within budget. useEffect gate correct for render-commit detection. Source: [OpenTUI DeepWiki](https://deepwiki.com/sst/opentui), [React docs](https://react.dev/reference/react/memo)
- termvideo (Go, reference implementation): https://github.com/levkush/termvideo

## Test Files

- `src/media/video-decoder.test.ts` — ffprobe parsing, dimension calculation, frame streaming, frame accumulator
- `src/media/ffplay.test.ts` — update for detection changes, sanitizeMediaPath rejection tests

## .gitignore Update

The user requested completely omitting all media from `test/assets/` (including pictures). Update `.gitignore`:

```
# test assets — all media files excluded from git
test/assets/*.mov
test/assets/*.MOV
test/assets/*.mp4
test/assets/*.mp3
test/assets/*.wav
test/assets/*.avi
test/assets/*.mkv
test/assets/*.webm
test/assets/*.png
test/assets/*.PNG
test/assets/*.jpg
test/assets/*.JPG
test/assets/*.jpeg
test/assets/*.JPEG
test/assets/*.gif
test/assets/*.GIF
test/assets/*.bmp
test/assets/*.webp
test/assets/*.svg
test/assets/*.tiff
test/assets/*.ico
```

Then `git rm --cached test/assets/*.png test/assets/*.jpg test/assets/*.JPG test/assets/*.gif` etc. to untrack already-committed media files.
