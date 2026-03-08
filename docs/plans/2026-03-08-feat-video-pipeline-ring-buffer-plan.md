---
title: "feat: Video Pipeline V2 — Ring Buffer Architecture"
type: feat
status: completed
date: 2026-03-08
deepened: 2026-03-08
origin: docs/brainstorms/2026-03-08-video-pipeline-v2-brainstorm.md
---

# feat: Video Pipeline V2 — Ring Buffer Architecture

## Enhancement Summary

**Deepened on:** 2026-03-08
**Research agents used:** 13 (5 research + 7 review + 1 flow analyzer)

### Key Improvements
1. Ring buffer `write()` returns `Promise<boolean> | boolean` using deferred promise pattern — eliminates busy-wait
2. Collapsed 9 phases to 4 phases — each with a testable deliverable
3. Deferred smooth scrubbing to a follow-up plan — solves 4/5 problems in smaller scope
4. Added critical correctness fixes: stdout stream cancellation in cleanup, `videoStopped` reset on process exit
5. Pre-decode keyframe cache recommended for future scrubbing (benchmarked: instant lookup vs 57ms/frame spawn)

### New Considerations Discovered
- **CRITICAL**: Producer backpressure MUST use `setTimeout(r, 0)` not microtask yields — `await Promise.resolve()` deadlocks the consumer because microtasks run before macrotask `setTimeout` callbacks
- **CRITICAL**: `createVideoStream()` is missing `sanitizeMediaPath()` call — existing V1 security gap to fix
- **CRITICAL**: Effect cleanup must call `proc.stdout.cancel()` to force-close the pipe reader — SIGKILL alone leaves the async generator suspended on buffered pipe data
- Bun's `proc.kill('SIGSTOP')` silently does nothing when internal poller is `detached` — always use `process.kill(pid, 'SIGSTOP')` instead
- Timer precision: Bun setTimeout at 33ms gives ~1ms avg jitter, 3ms max — sufficient for 30fps
- Ring buffer frame copy can be eliminated by merging pipe accumulation directly into buffer slots (saves ~27MB/s allocation)

---

## Overview

Rearchitect the video playback pipeline from tightly-coupled pipe-to-render to a decoupled ring buffer + timer design. This eliminates pause jank, enables instant seek, and fixes audio sync — pushing terminal video playback to production-grade quality.

## Problem Statement

The current pipeline has fundamental timing issues (see brainstorm: `docs/brainstorms/2026-03-08-video-pipeline-v2-brainstorm.md`):

1. **Pause jank**: SIGSTOP freezes ffmpeg, but pipe buffers deliver stale frames for ~1-2s
2. **Resume fast-forward**: Sleep-based pacing drifts from setTimeout imprecision + CPU-heavy rendering
3. **Seek latency**: Every seek kills both processes and re-probes metadata (~200-500ms wasted)
4. **No scrubbing**: Can't hold arrow key and see frames update live
5. **Audio drift**: Dual-process (ffmpeg + ffplay) with no sync mechanism

This plan addresses problems 1-3 and 5. Problem 4 (smooth scrubbing) is deferred to a follow-up plan.

### Research Insights

**Timer precision benchmarked on this machine (Bun, Apple Silicon):**
- 33ms target (30fps): avg 34.0ms, p95 34.8ms, p99 37.6ms — ~1ms avg jitter
- Under CPU load (20ms render): 20.9ms drift over 300 ticks, recoverable with drift correction
- Under CPU load (35ms render, over-budget): 455ms drift without frame-skipping — **frame-skipping is mandatory** when render time exceeds frame interval

**Bun SIGSTOP root cause confirmed:**
- `proc.kill('SIGSTOP')` uses `Subprocess.kill()` in `subprocess.zig` → silently no-ops when poller is `detached`
- `process.kill(pid, 'SIGSTOP')` uses POSIX `kill()` syscall directly → always works
- Not a filed Bun issue yet — the silent success on no-op violates least surprise

## Proposed Solution

Decouple frame decoding from display using a **pre-decode ring buffer** between ffmpeg (producer) and a **drift-correcting interval timer** (consumer). Pause becomes "stop the timer" (not SIGSTOP). Resume is instant (buffer already has frames). Seek flushes the buffer and shows the first decoded frame immediately.

```
ffmpeg → fillRingBuffer → [Ring Buffer] → FrameTimer → halfblock render → React

ffplay (audio) — SIGSTOP on pause, SIGCONT on resume, kill+restart on seek
```

## Technical Approach

### Architecture

**Ring Buffer** (`src/media/ring-buffer.ts`):
- Pre-allocated circular buffer of `Uint8Array` frames
- `write(frame)` — copies into next slot. Returns `true` synchronously when space available (fast path, zero allocation). Returns `Promise<boolean>` when full (deferred promise, resolves when consumer reads a frame). Returns `false` when buffer is flushed/disposed during wait.
- `read()` — returns reference to next frame or null if empty. Unparks the producer if it was waiting. **Consumer must use frame before next `read()` call** (reference into internal slot).
- `flush()` — synchronous reset: indices to 0, clear ended flag, reject any parked producer with `false`
- `markEnded()` / `markError(reason)` — producer signals stream complete or error
- `readonly ended: boolean`, `readonly errored: boolean`, `readonly empty: boolean`, `readonly full: boolean`
- Factory function: `createRingBuffer(capacity, frameSize)`
- Stores raw RGBA (natural ffmpeg output format)

### Research Insights: Ring Buffer Design

**Deferred promise backpressure pattern** (from Go-style bounded channels):

```typescript
write(frame: Uint8Array): Promise<boolean> | boolean {
  if (!this.full) {
    this.slots[this.writeIndex].set(frame)
    this.writeIndex = (this.writeIndex + 1) % this.capacity
    this.count++
    return true  // synchronous fast path — no Promise allocated
  }
  // buffer full: park the producer with a deferred promise
  const { promise, resolve } = Promise.withResolvers<boolean>()
  this.parkedWriter = resolve
  return promise
}

read(): Uint8Array | null {
  if (this.empty) return null
  const frame = this.slots[this.readIndex]
  this.readIndex = (this.readIndex + 1) % this.capacity
  this.count--
  // unpark writer if waiting — MUST use setTimeout, not queueMicrotask
  if (this.parkedWriter) {
    const resolve = this.parkedWriter
    this.parkedWriter = null
    setTimeout(() => resolve(true), 0)  // yield to macrotask queue
  }
  return frame
}
```

**Why `setTimeout(r, 0)` not `queueMicrotask()`**: Microtasks run before macrotask callbacks. If the producer resumes as a microtask, it runs before the consumer's next `setTimeout` tick, potentially filling the buffer and re-parking in a tight loop that starves the consumer. Using `setTimeout(r, 0)` yields to the macrotask queue where the consumer's timer lives.

**Memory layout**: Separate pre-allocated `Uint8Array` per slot (not one contiguous `ArrayBuffer`). V8/JSC allocates large TypedArrays outside the JS heap — no meaningful overhead difference. Separate arrays provide bounds checking and simpler flush semantics.

**Memory budget cap**: Use `Math.min(30, Math.floor(MEMORY_BUDGET / frameSize))` instead of fixed 30 frames. At 30MB budget: 32 frames at 640x360, 8 frames at 1280x720. Prevents OOM at high resolutions.

**No existing npm package** combines async backpressure + pre-allocated TypedArray slots + single-threaded. Custom ~80 lines is simpler and more correct than wrapping any library.

**Sources:**
- [extra-promise BufferedChannel](https://www.npmjs.com/package/extra-promise) — closest Go-style channel pattern
- [Promise.withResolvers() in Bun](https://bun.com/reference/globals/PromiseConstructor/withResolvers)
- [Node.js Backpressuring in Streams](https://nodejs.org/en/learn/modules/backpressuring-in-streams)

---

**Video Timer** — extend existing `createFrameTimer`:
- Add constant-interval mode: `createFrameTimer({ delays: [1000/fps], onFrame, loop: true })`
- Add `tickCount` readonly getter to `FrameTimerHandle`
- Use **Pattern B drift correction** (rolling expected): `nextTickAt = Math.max(now, nextTickAt) + intervalMs` — gracefully drops frames when overloaded instead of cascading catch-up ticks
- Existing `disposed` guard in callback body prevents post-dispose firing
- Existing `play()` emits first frame immediately (no wait for interval)

### Research Insights: Timer Design

**Pattern A (epoch-anchored, current FrameTimer) vs Pattern B (rolling expected):**

| Aspect | Pattern A | Pattern B |
|--------|-----------|-----------|
| Under normal load | Excellent | Excellent |
| When overloaded | Cascading catch-up ticks | Graceful frame drop |
| 300-tick total drift | -0.49ms | ~0ms |
| Max jitter | 3.06ms | 3.06ms |

Pattern B is better for video because when render time exceeds the frame interval, Pattern A fires catch-up ticks at 0ms delay (causing cascading delays), while Pattern B resets the baseline to "now" and drops the missed frames.

**Hybrid spin-wait not needed**: setTimeout + setImmediate spin gives sub-1ms jitter but adds 6-14% CPU overhead. At 33ms intervals, 3ms jitter is 1/11th of a frame — imperceptible for terminal video.

**`performance.now()` over `Date.now()`**: Monotonic clock, immune to NTP adjustments and system sleep. The existing FrameTimer already uses this correctly.

**Frame-skipping belongs in the consumer** (ring buffer read logic), not the timer. The timer ticks at constant rate; the consumer decides whether to skip buffer entries if behind schedule.

**Sources:**
- [node-game-loop (setTimeout + setImmediate hybrid)](https://github.com/timetocode/node-game-loop)
- [A Tale of Two Clocks — Web Audio Scheduling](https://web.dev/articles/audio-scheduling)
- [Accurate setInterval replacement (epoch-anchored)](https://gist.github.com/manast/1185904)

---

**Seek Debouncing** — inline with existing `createDebouncer`:
- Export `createDebouncer` from `src/watcher/watcher.ts` (currently module-private)
- Use inline in component with a `lastSeekOffset` ref variable — 4 lines of code, no new module

```typescript
// inline in ModalVideoContent
const lastSeekRef = useRef(0)
const seekDebouncer = useMemo(() => {
  const debouncer = createDebouncer(300)
  return {
    seek(offset: number) {
      lastSeekRef.current = offset
      debouncer.schedule(() => onSettle(lastSeekRef.current))
    },
    cancel: () => debouncer.cancel(),
  }
}, [])
```

### Implementation Phases

**Collapsed from 9 to 4 phases. Each phase has a testable deliverable. Cleanup tasks distributed into each phase rather than deferred.**

#### Phase 1: Foundations — Ring Buffer + useEffect Split + Probe Caching

Build the ring buffer module AND split the monolithic useEffect upfront. The useEffect split prevents a temporary regression where every seek re-probes metadata.

**Ring Buffer** — new file `src/media/ring-buffer.ts`:

- [x] Define `RingBuffer` interface: `write(frame): Promise<boolean> | boolean`, `read(): Uint8Array | null`, `flush(): void`, `markEnded(): void`, `markError(reason: string): void`
- [x] Readonly getters: `ended`, `errored`, `errorReason`, `empty`, `full`, `length`, `capacity`
- [x] Implement `createRingBuffer(capacity: number, frameSize: number): RingBuffer`
- [x] Memory budget cap: `capacity = Math.min(requestedCapacity, Math.floor(MEMORY_BUDGET / frameSize))`
- [x] Pre-allocate `capacity` slots of `new Uint8Array(frameSize)` at creation
- [x] Write fast path: copies input via `.set()`, returns `true` (zero allocation)
- [x] Write full path: creates deferred promise via `Promise.withResolvers()`, parks producer
- [x] Read returns reference to internal slot, unparks writer via `setTimeout(resolve, 0)`
- [x] Flush is synchronous: reset indices, clear ended/error flags, reject parked writer with `false`
- [x] Implement `[Symbol.dispose]()` as alias for a cleanup method that flushes and prevents further writes
- [x] Tests: write/read cycle, full buffer backpressure (deferred promise resolves), empty buffer returns null, flush during parked write returns false, ended signal, error signal, wrap-around, memory budget cap

**useEffect Split** — in `media-modal.tsx`:

- [x] Split monolithic useEffect into `probeEffect` and `streamEffect`
- [x] `probeEffect` depends on `[src, basePath]` only — runs once per video
- [x] Probe result cached in `probeRef = useRef<{ meta: VideoMetadata, dims: VideoDimensions } | null>(null)`
- [x] `streamEffect` depends on `[restartCount, seekOffset, maxCols, maxRows]` — uses cached probe
- [x] Resize recomputes `VideoDimensions` from cached metadata + new terminal size (no re-probe)

**Security fixes** (existing V1 bugs):

- [x] Add `sanitizeMediaPath()` as first line in `createVideoStream()` (CRITICAL — currently missing)
- [x] Add `Number.isFinite(seekOffset) && seekOffset >= 0` guard in `createVideoStream()` and `playAudio()`
- [x] Gate debug logging behind LIHAM_DEBUG=1 env var (7 locations across 4 files)

**Existing V1 bug fix:**

- [x] Reset `videoStopped = false` in the `.exited` handler of `video-decoder.ts` (currently stale flag breaks pause for subsequent videos)
- [x] Same fix for `audioStopped` in `ffplay.ts`

**Files:** `src/media/ring-buffer.ts`, `src/media/ring-buffer.test.ts`, `src/renderer/opentui/media-modal.tsx`, `src/media/video-decoder.ts`, `src/media/ffplay.ts`

#### Phase 2: Pipeline Rewrite — Producer + Consumer + Timer

Replace the tightly-coupled `runFrameLoop` with the decoupled ring buffer + timer pipeline. This is the core change that fixes pause jank, resume fast-forward, and improves seek.

**FrameTimer enhancement** — modify `src/media/frame-timer.ts`:

- [x] Add `readonly tickCount: number` getter to `FrameTimerHandle` interface
- [x] Add Pattern B drift correction option for constant-interval mode
- [x] Ensure `disposed` guard is set BEFORE `clearTimeout` in `dispose()` (prevents post-dispose callback execution)
- [x] `tickCount` only increments when `onFrame` callback is invoked (not on underrun skips)
- [x] Update existing tests, add constant-interval test cases

**Producer** — new async function `fillRingBuffer`:

- [x] `fillRingBuffer(proc, buffer, isStale, onEvent)` — standalone function, not a context object
- [x] `onEvent` callback uses discriminated union: `{ type: 'progress'; elapsed: number } | { type: 'ended' } | { type: 'error'; reason: string }`
- [x] Loop: `for await (const rgba of readFrames(...))` → check `isStale()` → `await buffer.write(rgba)`
- [x] SIGSTOP ffmpeg when buffer is full with hysteresis: SIGSTOP at 90% full, SIGCONT at 50% capacity
- [x] Producer manages its own SIGSTOP/SIGCONT — consumer is unaware of process management
- [x] `isStale()` checked AFTER every `await reader.read()` and BEFORE every `buffer.write()`
- [x] Wrap `for await` in try/catch to handle pipe errors from killed ffmpeg process
- [x] On stream end: `buffer.markEnded()`; on error: `buffer.markError(reason)`
- [x] Progress reporting: track `framesWritten` for elapsed time calculation

**Consumer** — timer-driven rendering in `ModalVideoContent`:

- [x] Create `FrameTimer` with `delays: [1000/fps]`, `loop: true`
- [x] Timer `onFrame` callback: `buffer.read()` → if null, hold last grid (underrun, don't increment tickCount) → else `renderHalfBlockMerged()` → `setCurrentGrid()`
- [x] `renderPendingRef` backpressure: skip frame if React hasn't committed previous grid
- [x] Ended detection: when buffer `ended` and `empty` → `setPlaybackState('ended')`, timer stops
- [x] Error detection: when buffer `errored` → `setPlaybackState('error')`
- [x] Elapsed time: `seekOffset + timer.tickCount / fps`

**Effect cleanup** (critical for correctness):

- [x] Call `proc.stdout.cancel()` to force-close the pipe reader (prevents old producer from draining stale pipe data)
- [x] Call `timer.dispose()` (disposed guard prevents post-cleanup callback)
- [x] Call `buffer.flush()` (synchronous, rejects parked writer)
- [x] Kill ffmpeg process, kill ffplay process

**Pause/Resume:**

- [x] Pause = `timer.pause()` + `process.kill(pid, 'SIGSTOP')` for ffmpeg + SIGSTOP ffplay
- [x] Resume = `timer.play()` (instant — frame in buffer) + `process.kill(pid, 'SIGCONT')` for ffmpeg + SIGCONT ffplay (fallback: restart if process died)
- [x] Always use `process.kill(pid, signal)` — never `proc.kill(signal)` for SIGSTOP/SIGCONT

**Remove old code:**

- [x] Delete `runFrameLoop` function and `FrameLoopContext` interface
- [x] Delete `pausedRef` spin-wait pattern (no longer needed)
- [x] Remove `await playAudio()` blocking — spawn audio in parallel with first buffer fill

**Files:** `src/media/frame-timer.ts`, `src/media/frame-timer.test.ts`, `src/renderer/opentui/media-modal.tsx`, `src/media/video-decoder.ts`

### Research Insights: Producer/Consumer Interleaving

**Event loop analysis**: The producer awaits `reader.read()` which yields to the event loop. The consumer fires via `setTimeout`. In Bun, `for await` on a ReadableStream with available pipe data processes multiple chunks per event loop tick — the producer can consume multiple frames in a single macrotask. The deferred promise backpressure pattern (Phase 1) solves this: when the buffer is full, the producer parks on a `Promise` that resolves via `setTimeout(r, 0)` in the consumer, guaranteeing the consumer gets event loop time.

**Eliminating redundant frame copy**: `readFrames` currently yields `new Uint8Array(buffer)` — a 920KB copy per frame. Then `ring.write(frame)` copies into a pre-allocated slot. That's two copies per frame (~55MB/s at 30fps). Future optimization: merge pipe accumulation directly into ring buffer slots, eliminating the intermediate copy. Deferred to avoid changing `readFrames` API in this plan.

**SIGSTOP/SIGCONT hysteresis**: Don't signal on every slot transition. SIGSTOP at 90% full (27/30 frames), SIGCONT at 50% (15/30 frames). This prevents signal storms when the producer and consumer are at similar speeds.

#### Phase 3: Seek Rewrite

Implement fast seek using the split effects and ring buffer.

- [x] **Seek flow** via `streamEffect` re-fire (dependency: `restartCount`, `seekOffset`):
  1. Cleanup: cancel stdout stream, kill ffmpeg, kill audio, dispose timer, flush buffer
  2. Recompute dimensions from cached probe + current terminal size
  3. Spawn new ffmpeg with `-ss <seekOffset>`
  4. Producer writes first frame → render immediately (before timer starts)
  5. `timer.play()` starts from tick 0
  6. If not paused: restart ffplay at `seekOffset` (spawn in parallel, don't await)
- [x] **Seek preserves paused state**: if paused + seek → render first frame, stay paused. Frame-by-frame stepping works naturally.
- [x] **Replay** (`ReplayMedia`): resets `seekOffset = 0`, increments `restartCount` → same as seek flow
- [x] ~~**Add maximum playback duration timeout**~~ — removed per user preference (no playback cap)
- [x] **Add `-fflags +nobuffer -analyzeduration 0` to ffplay args** for faster audio startup (~100-200ms instead of ~500ms)

**Files:** `src/renderer/opentui/media-modal.tsx`, `src/media/ffplay.ts`

### Research Insights: Seek & Audio Sync

**Audio sync approach**: SIGSTOP/SIGCONT for ffplay pause is viable and used in production (telega.el Emacs client). Expect minor click/pop on resume from audio buffer discontinuity — acceptable for terminal apps. Kill+restart remains necessary for seek (audio must restart at new position). Brief silence (~100-200ms) on resume is within broadcast tolerance (ATSC: +30ms audio early, -90ms audio late).

**ffplay cannot be controlled programmatically**: ffplay has no stdin command interface, no IPC mechanism. Keyboard commands go through SDL event handling. Seeking requires kill+restart with new `-ss`. This is a fundamental limitation.

**ffplay startup flags for reduced latency:**
```
ffplay -nodisp -vn -fflags +nobuffer -analyzeduration 0 -ss <offset> <file>
```

**Future upgrade path**: Replace ffplay with `mpv --no-video --input-ipc-server=/tmp/mpvsocket`. mpv provides JSON IPC over Unix sockets for instant seek (`<10ms`), pause/resume, and position queries. The node-mpv npm package wraps this cleanly. This is a "Phase 5" enhancement, not needed for V2.

**No drift correction needed**: At 10fps terminal video, 100ms drift (one frame) is imperceptible. Audio and video start from the same `-ss` offset and free-run. Periodic restart (every 5min) is sufficient if users report drift on long videos.

#### Phase 4: Audio Cleanup + Polish

- [x] **Audio SIGSTOP/SIGCONT for pause** (keep process alive, avoid restart latency)
- [x] **Fallback to kill+restart** if SIGCONT fails (process may have died)
- [x] Guard all signal sends with try/catch (process may have exited)
- [x] **CoreAudio device contention**: verify old ffplay has fully exited (check `proc.exited` resolved) before spawning new one on seek
- [x] Reset `audioStopped` flag when ffplay process exits naturally (prevent stale flag)
- [x] Update progress bar to use `timer.tickCount / fps` instead of sampling every 10 frames
- [x] **File deletion integration**: component unmount triggers effect cleanup (kill processes, dispose timer)
- [x] Verify SIGSTOP try/catch only sets `videoStopped = true` on successful signal delivery
- [x] Add integration-style tests: ring buffer + timer interaction
- [x] No reducer changes needed — existing actions work with V2 pipeline
- [x] Run full test suite + lint

**Files:** `src/media/ffplay.ts`, `src/renderer/opentui/media-modal.tsx`, `src/app/state-media.test.ts`

## System-Wide Impact

### Interaction Graph

- `SeekMedia` reducer → increments `restartCount` + updates `seekOffset` → `streamEffect` re-fires → cancels stdout → flushes buffer → kills processes → restarts pipeline
- `TogglePlayPause` reducer → flips `paused` → pause effect → `timer.pause()`/`timer.play()` + SIGSTOP/SIGCONT + audio control
- `ReplayMedia` reducer → resets `seekOffset` to 0 + increments `restartCount` → same as seek flow
- `CloseMediaModal` reducer → ModalVideoContent unmounts → effect cleanup → cancel stdout, dispose timer, flush buffer, kill processes
- Terminal resize → prop change → stream restart with cached probe + new dimensions (no re-probe)

### Error Propagation

- ffmpeg spawn failure → `probeVideo` returns `{ ok: false }` → `setPlaybackState('error')` → fallback text
- ffmpeg exit mid-stream → `readFrames` generator returns → producer calls `buffer.markEnded()` → consumer drains → `setPlaybackState('ended')`
- ffmpeg error mid-stream → producer catches, calls `buffer.markError(reason)` → consumer detects → `setPlaybackState('error')`
- ffplay spawn failure → `playAudio` returns `{ ok: false }` → audio silently absent (video continues)
- SIGSTOP/SIGCONT failure → try/catch swallows, sets flag only on success

### State Lifecycle Risks

- **Ring buffer on seek**: flush is synchronous, called in effect cleanup. Parked producer's deferred promise rejected with `false`. `isStale()` check after every `await` prevents old producer from writing to flushed buffer.
- **Stdout stream cancellation**: `proc.stdout.cancel()` in cleanup forces the async generator to exit, preventing stale frame drainage from kernel pipe buffer (typically 64KB on macOS = 0-2 frames).
- **Stale async detection**: `loadIdRef` counter pattern (existing, proven) prevents stale frame writes. Producer checks `isStale()` after every `await reader.read()` and before every `buffer.write()`.
- **Timer post-dispose**: `disposed` flag set before `clearTimeout` in `dispose()`. Callback body checks `disposed` first. Even if callback was already dequeued, it exits immediately.
- **Process cleanup**: effect cleanup cancels stdout, kills ffmpeg + ffplay, disposes timer, flushes buffer. Exit handler (`process.on('exit')`) catches orphans.
- **`videoStopped`/`audioStopped` reset**: flags reset in `.exited` handler to prevent stale state affecting subsequent videos.
- **Concurrent video transitions**: Only one video pipeline runs at a time (`activeVideoProc` singleton). Ring buffer reused across video transitions via `flush()` if frame size matches, recreated if frame size changes.

### API Surface Parity

- No external API affected — all changes are internal to the media pipeline
- Key handlers unchanged (`viewer-keys.ts` `handleModalKey` — same actions dispatched)
- Reducer unchanged (same `SeekMedia`, `TogglePlayPause`, `ReplayMedia` actions)
- `createDebouncer` exported from `watcher.ts` (was module-private, now public)

### Behavioral Changes from V1

- **Seek preserves paused state** (V2) vs seek resets paused to false (V1). V2 behavior is correct for ring buffer architecture — user expects to remain paused after seeking.
- **Audio pause via SIGSTOP** (V2) vs kill+restart (V1). V2 is faster resume but may produce minor click/pop.
- **Probe caching** — seek no longer re-probes metadata.

## Acceptance Criteria

### Functional Requirements

- [ ] Pause freezes video instantly (no 1-2s delay)
- [ ] Resume continues from exact position (no fast-forward or skipped frames)
- [ ] Seek shows target frame within ~100ms
- [ ] Audio pauses with video (no audio continuing after video freezes)
- [ ] Audio resumes at correct position (within ~200ms sync)
- [ ] Replay works cleanly (no stale frames from previous playback)
- [ ] Video ends naturally (last frame shown, state = 'ended')
- [ ] Terminal resize restarts playback at correct position
- [ ] Progress bar updates in real-time during playback

### Non-Functional Requirements

- [ ] Ring buffer memory: ≤30MB budget (capacity scales with frame size)
- [ ] No orphaned ffmpeg/ffplay processes on any exit path
- [ ] Maximum playback duration: 30 minutes (prevents resource exhaustion from crafted videos)
- [ ] All existing media tests pass (`bun test`)
- [ ] Lint passes (`bun run lint`)
- [ ] TypeScript strict mode with `exactOptionalPropertyTypes: true`

### Quality Gates

- [ ] Ring buffer: ≥10 unit tests (write/read, full-backpressure, empty, flush, flush-during-park, ended, error, wrap-around, memory-budget, dispose)
- [ ] FrameTimer: existing tests pass + ≥3 new tests (tickCount, constant-interval, pattern-B drift)
- [ ] State tests updated for any reducer changes
- [ ] Security: `sanitizeMediaPath` called in `createVideoStream`, `seekOffset` validated
- [ ] Cleanup: zero `[DBG]` logging statements in production code

## Dependencies & Prerequisites

- Existing `readFrames` async generator (reused as-is, future optimization: merge into ring buffer write)
- Existing `createVideoStream` (reused, `-re` already removed)
- Existing `probeVideo` (reused, called once per video via probe caching)
- Existing `halfblock.ts` `renderHalfBlockMerged` (reused in consumer)
- Existing `createFrameTimer` (enhanced with tickCount + constant-interval mode)
- Existing `createDebouncer` (exported from watcher.ts for seek debouncing)

## Risk Analysis & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Event loop starvation (producer blocks consumer) | Choppy playback | Deferred promise backpressure: producer parks on `Promise`, consumer unparks via `setTimeout(r, 0)`. Producer yields to macrotask queue, guaranteeing consumer gets time. |
| Ring buffer memory at high resolution | OOM on constrained systems | Memory budget cap: `Math.min(30, Math.floor(30_000_000 / frameSize))`. At 640x360: 32 frames. At 1280x720: 8 frames. |
| ffplay SIGSTOP unreliable for pause | Audio continues during pause | Always use `process.kill(pid, 'SIGSTOP')` — never `proc.kill()`. Fallback: kill + restart on resume if SIGCONT fails. |
| CoreAudio device contention on rapid seek | Silent audio for seconds | Verify old ffplay fully exited (`proc.exited` resolved) before spawning new one. |
| Old producer writes to flushed buffer after seek | Ghost frame from wrong timeline | Three-layer protection: `isStale()` check after every await, `proc.stdout.cancel()` in cleanup, `buffer.flush()` rejects parked writer. |
| Crafted video with infinite duration | Resource exhaustion | 30-minute hard cap in producer loop. `probeVideo` already has 5s timeout. |
| Resize during playback recreates buffer | Brief playback gap | Reuse buffer instance if frame size unchanged. Recreate only when dimensions change. |

## Future Work: Smooth Scrubbing (Deferred)

**Prerequisite**: Phases 1-4 of this plan must be complete and stable first. The ring buffer pipeline (pause/play, seek forward/back, audio sync) is the foundation that scrubbing builds on. Without a solid ring buffer + timer-driven consumer, scrubbing cannot work — it depends on `buffer.flush()`, the `streamEffect` lifecycle, and probe caching.

**Plan**: A separate implementation plan will be written once the ring buffer pipeline is merged and validated. All research findings are preserved below.

Smooth scrubbing (hold arrow key → frames update live) is deferred to a follow-up plan. The recommended approach, based on benchmarking:

**Pre-decode keyframe cache** (measured on this machine):

| Step | Time |
|------|------|
| Extract keyframe timestamps via ffprobe | ~instant |
| Batch-decode all keyframes (parallel) | 193-327ms |
| Cache lookup (nearest keyframe) | 0.008ms |
| Optional exact-frame refine (H.264) | ~57ms |

**Architecture sketch:**
1. On video open: `ffprobe -skip_frame nokey` → extract keyframe timestamps
2. Parallel batch: decode all keyframes into `Map<timestamp, Uint8Array>` (~5.5MB for 5-min video at 80x60)
3. On scrub: instantly show nearest cached keyframe (sub-ms lookup)
4. Debounced exact-frame decode replaces the keyframe when ready
5. On scrub settle (300ms): start normal playback from final position

**Per-frame decode latency (benchmarked, Bun.spawn end-to-end):**

| Codec | Output Size | Avg/Frame | Effective FPS |
|-------|-----------|-----------|---------------|
| H.264 | 80x60 RGBA | 57ms | ~17fps |
| HEVC 1080p | 80x45 RGBA | 276ms | ~3.6fps |

**Key findings:**
- Spawning a new ffmpeg per key press is NOT viable at 30Hz for HEVC — keyframe cache is mandatory
- Hardware decode (VideoToolbox) is SLOWER for single frames (~250-360ms) due to GPU pipeline setup
- `-noaccurate_seek` flag gives ~1ms improvement — use it for scrubbing
- Output resolution barely matters (scaling 1080p→40x22 vs 80x45: <3ms difference — decode dominates)
- Best flags: `ffmpeg -ss <offset> -noaccurate_seek -i <file> -vframes 1 -f rawvideo -pix_fmt rgba -vf scale=W:H -an pipe:1`
- Track scrub process in module-level variable + `process.on('exit')` handler to prevent orphans
- Use existing `createSemaphore(1)` to limit concurrent scrub decodes

## Alternative Approaches Considered

(See brainstorm: `docs/brainstorms/2026-03-08-video-pipeline-v2-brainstorm.md`)

1. **Sleep-based pacing (current V1)**: Drift-prone, stale buffer issues on resume. Rejected.
2. **Single ffmpeg + audiotoolbox**: Perfect A/V sync but macOS-only. Rejected for cross-platform.
3. **MPV IPC backend**: Battle-tested but adds dependency. Rejected — ffmpeg-only constraint. **Recommended as future upgrade for audio sync** (JSON IPC over Unix sockets, instant seek, position queries).
4. **Decode-on-demand**: Most control but no streaming. Too complex for the benefit.
5. **Separate VideoTimer module**: FrameTimer with `delays: [1000/fps]` and `loop: true` gives constant-interval behavior. Adding `tickCount` and Pattern B drift correction to existing FrameTimer is simpler than a new module.
6. **Separate SeekDebouncer module**: Existing `createDebouncer` from `watcher.ts` with a `lastOffset` ref achieves the same result in 4 lines. No new module needed.

## Sources & References

### Origin

- **Brainstorm document:** [docs/brainstorms/2026-03-08-video-pipeline-v2-brainstorm.md](docs/brainstorms/2026-03-08-video-pipeline-v2-brainstorm.md) — Key decisions carried forward: ring buffer replaces pipe-direct, pause = stop timer, seek = flush + restart + first-frame display, memory budget cap.

### Internal References

- Frame timer drift correction: `src/media/frame-timer.ts:33-53`
- readFrames async generator: `src/media/video-decoder.ts:372-403`
- Current runFrameLoop: `src/renderer/opentui/media-modal.tsx:274-330`
- Factory function pattern: `src/media/cache.ts:1-73`
- Debounce pattern: `src/watcher/watcher.ts` `createDebouncer()`
- Invocation counter stale detection: `src/renderer/opentui/media-modal.tsx:356` `loadIdRef`
- State reducer: `src/app/state-media-modal.ts:34-46` `seekMedia()`
- Modal key handlers: `src/renderer/opentui/viewer-keys.ts:61-101` `handleModalKey()`
- Semaphore pattern: `src/media/semaphore.ts` `createSemaphore()`
- Current V1 video plan: `docs/plans/2026-03-07-feat-video-v2-plan.md`

### Institutional Knowledge

- `docs/learnings/2026-03-07-media-modal-and-selection-institutional-knowledge.md` — Pre-render frames to avoid GC jank, hex lookup table optimization, SIGINT cleanup pattern, invocation counter for stale detection

### Research (2026-03-08 deepening)

**Ring buffer design:**
- [extra-promise BufferedChannel](https://www.npmjs.com/package/extra-promise) — Go-style bounded channel pattern
- [Promise.withResolvers() in Bun](https://bun.com/reference/globals/PromiseConstructor/withResolvers)
- [V8 TypedArray Memory Optimization](https://dev.to/asadk/v8-engine-secrets-how-we-slashed-memory-usage-by-66-with-typedarrays-g95)

**Timer precision:**
- [node-game-loop (setTimeout + setImmediate hybrid)](https://github.com/timetocode/node-game-loop)
- [A Tale of Two Clocks — Web Audio Scheduling](https://web.dev/articles/audio-scheduling)
- [Accurate setInterval replacement](https://gist.github.com/manast/1185904)

**ffmpeg seeking:**
- [FFmpeg Seeking Wiki](https://trac.ffmpeg.org/wiki/Seeking)
- [Jellyfin Trickplay 110x speedup](https://github.com/jellyfin/jellyfin/issues/11336)
- [Faster thumbnail extraction (Sebastian Aigner)](https://sebi.io/posts/2024-12-21-faster-thumbnail-generation-with-ffmpeg-seeking/)

**Bun signals:**
- Bun subprocess source: `src/bun.js/api/bun/subprocess.zig` — `Process.kill()` no-ops when poller is `detached`
- Bun process.kill source: `src/bun.js/bindings/BunProcess.cpp` — directly calls POSIX `kill()`

**Audio sync:**
- [telega-ffplay.el — Emacs ffplay Integration](https://github.com/zevlg/telega.el/blob/master/telega-ffplay.el) — SIGSTOP/SIGCONT for ffplay in production
- [mpv JSON IPC](https://github.com/mpv-player/mpv/blob/master/DOCS/man/ipc.rst) — future upgrade path
- [Audio-to-Video Synchronization tolerances](https://en.wikipedia.org/wiki/Audio-to-video_synchronization) — ATSC: +30ms/-90ms
