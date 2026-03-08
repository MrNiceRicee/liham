---
title: "feat: Video Pipeline V2 — Ring Buffer Architecture"
type: feat
status: active
date: 2026-03-08
origin: docs/brainstorms/2026-03-08-video-pipeline-v2-brainstorm.md
---

# feat: Video Pipeline V2 — Ring Buffer Architecture

## Overview

Rearchitect the video playback pipeline from tightly-coupled pipe-to-render to a decoupled ring buffer + timer design. This eliminates pause jank, enables instant seek, and unlocks smooth scrubbing — pushing terminal video playback to production-grade quality.

## Problem Statement

The current pipeline has fundamental timing issues (see brainstorm: `docs/brainstorms/2026-03-08-video-pipeline-v2-brainstorm.md`):

1. **Pause jank**: SIGSTOP freezes ffmpeg, but pipe buffers deliver stale frames for ~1-2s
2. **Resume fast-forward**: Sleep-based pacing drifts from setTimeout imprecision + CPU-heavy rendering
3. **Seek latency**: Every seek kills both processes and re-probes metadata (~200-500ms wasted)
4. **No scrubbing**: Can't hold arrow key and see frames update live
5. **Audio drift**: Dual-process (ffmpeg + ffplay) with no sync mechanism

## Proposed Solution

Decouple frame decoding from display using a **pre-decode ring buffer** between ffmpeg (producer) and a **drift-correcting interval timer** (consumer). Pause becomes "stop the timer" (not SIGSTOP). Resume is instant (buffer already has frames). Seek flushes the buffer and shows the first decoded frame immediately.

```
ffmpeg → readFrames → [Ring Buffer] → VideoTimer → halfblock render → React

ffplay (audio) — killed on pause/seek, restarted with -ss on resume
```

(See brainstorm: architecture sketch and state flow diagram)

## Technical Approach

### Architecture

**Ring Buffer** (`src/media/ring-buffer.ts`):
- Pre-allocated circular buffer of `Uint8Array` frames
- `write(frame)` — copies into next slot, returns false if full (producer must wait)
- `read()` — returns next frame or null if empty (consumer skips)
- `flush()` — synchronous reset (`writeIndex = readIndex = 0`)
- `markEnded()` / `isEnded()` — producer signals stream complete
- Factory function pattern: `createRingBuffer(capacity, frameSize)`
- Stores raw RGBA (not pre-rendered grids) — resize-safe, simpler

**Video Timer** (`src/media/video-timer.ts`):
- New constant-interval timer (FrameTimer requires `delays[]` upfront + known frame count)
- Drift-correcting setTimeout (reuse epoch-based correction from `frame-timer.ts`)
- Open-ended: fires until `.stop()` or `.dispose()`, no frame count needed
- `play()`, `pause()`, `stop()`, `dispose()`, `state`, `tickCount`
- `onTick(tickIndex)` callback — consumer reads from ring buffer

**Seek Debouncer** (`src/media/seek-debouncer.ts`):
- `createSeekDebouncer(onSettle, settleMs)` — factory function
- `.seek(offset)` — called on each seek key, resets debounce timer
- `.cancel()` — for cleanup on unmount/close
- After 300ms of no seeks: calls `onSettle(finalOffset)` to resume normal playback
- During active scrub: audio killed, timer paused, single-frame renders

### Implementation Phases

#### Phase 1: Ring Buffer Module

New file `src/media/ring-buffer.ts` — pure data structure, zero dependencies.

- [ ] Define `RingBuffer` interface: `write`, `read`, `peek`, `flush`, `markEnded`, `isEnded`, `isEmpty`, `isFull`, `length`, `capacity`
- [ ] Implement `createRingBuffer(capacity: number, frameSize: number): RingBuffer`
- [ ] Pre-allocate `capacity` slots of `new Uint8Array(frameSize)` at creation
- [ ] Write copies input into pre-allocated slot (avoids allocation per frame)
- [ ] Read returns a reference to the slot (consumer must use before next read)
- [ ] Flush is synchronous: reset indices, clear ended flag
- [ ] Tests: `src/media/ring-buffer.test.ts` — write/read cycle, full buffer, empty buffer, flush, ended signal, wrap-around, concurrent interleaving simulation

**Files:** `src/media/ring-buffer.ts`, `src/media/ring-buffer.test.ts`

#### Phase 2: Video Interval Timer

New file `src/media/video-timer.ts` — drift-correcting constant-interval timer.

- [ ] Define `VideoTimer` interface: `play`, `pause`, `stop`, `dispose`, `state: 'idle'|'playing'|'paused'|'stopped'`, `tickCount: number`
- [ ] Implement `createVideoTimer(fps: number, onTick: (tick: number) => void): VideoTimer`
- [ ] Drift correction: `nextTickAt = Math.max(now, nextTickAt) + intervalMs` (same pattern as current `runFrameLoop`)
- [ ] `pause()` records accumulated time, `play()` recalculates epoch (same as `frame-timer.ts` line 63)
- [ ] `stop()` is terminal — no resume (used when stream ends)
- [ ] Tests: `src/media/video-timer.test.ts` — tick count, pause/resume timing, drift correction, stop is terminal, dispose cleans up

**Files:** `src/media/video-timer.ts`, `src/media/video-timer.test.ts`
**Pattern reference:** `src/media/frame-timer.ts` (drift correction logic)

#### Phase 3: Seek Debouncer

New file `src/media/seek-debouncer.ts` — 300ms settle detection.

- [ ] Define `SeekDebouncer` interface: `seek(offset: number)`, `cancel()`, `isActive: boolean`
- [ ] Implement `createSeekDebouncer(onSettle: (finalOffset: number) => void, settleMs: number): SeekDebouncer`
- [ ] Each `.seek()` call stores the offset and resets a setTimeout timer
- [ ] When timer fires (no seek for `settleMs`): calls `onSettle(lastOffset)`
- [ ] `.cancel()` clears timer without calling `onSettle`
- [ ] Tests: `src/media/seek-debouncer.test.ts` — single seek settles, rapid seeks debounce, cancel prevents settle

**Files:** `src/media/seek-debouncer.ts`, `src/media/seek-debouncer.test.ts`
**Pattern reference:** `src/watcher/watcher.ts` `createDebouncer()` (existing debounce helper)

#### Phase 4: Producer — Ring Buffer Writer

Rewrite the decode loop in `media-modal.tsx` to write to ring buffer instead of rendering directly.

- [ ] New async function `fillRingBuffer(ctx: ProducerContext): Promise<void>` replacing `runFrameLoop`
- [ ] `ProducerContext`: `proc`, `buffer: RingBuffer`, `isStale`, `onProgress`, `onEnded`
- [ ] Loop: `for await (const rgba of readFrames(...))` → `buffer.write(rgba)`
- [ ] If buffer full: `await` a microtask yield, then retry (pipe backpressure stops ffmpeg naturally)
- [ ] SIGSTOP ffmpeg when buffer is full (CPU optimization — process is already pipe-blocked, SIGSTOP saves decode CPU)
- [ ] SIGCONT when buffer has space (consumer reads free up slots)
- [ ] On stream end: `buffer.markEnded()`
- [ ] Progress reporting: track `framesWritten` for elapsed time calculation
- [ ] Remove old `runFrameLoop` function and `FrameLoopContext` interface

**Files:** `src/renderer/opentui/media-modal.tsx` (major rewrite of lines 255-330)

#### Phase 5: Consumer — Timer-Driven Rendering

Replace pipe-direct rendering with timer-driven buffer reads.

- [ ] In `ModalVideoContent`: create `VideoTimer` and `RingBuffer` instances
- [ ] Timer `onTick` callback: `buffer.read()` → if null, hold last grid (underrun) → else `renderHalfBlockMerged()` → `setCurrentGrid()`
- [ ] `renderPendingRef` backpressure stays on consumer side (skip tick if React hasn't committed)
- [ ] Pause = `timer.pause()` + SIGSTOP ffmpeg (CPU optimization) + kill ffplay
- [ ] Resume = `timer.play()` (instant — frame already in buffer) + SIGCONT ffmpeg + restart ffplay at elapsed
- [ ] Ended detection: when buffer `isEnded()` and `isEmpty()` → `setPlaybackState('ended')`
- [ ] Elapsed time: `seekOffset + timer.tickCount / fps` (accurate even during underrun — tick only counts consumed frames)
- [ ] Remove `pausedRef` spin-wait pattern (no longer needed)

**Files:** `src/renderer/opentui/media-modal.tsx` (ModalVideoContent rewrite)

#### Phase 6: Seek Rewrite + Probe Caching

Split the monolithic useEffect and cache probe results.

- [ ] **Split useEffect** into two:
  - `probeEffect` — depends on `[src, basePath]` only. Runs once per video. Stores `VideoMetadata` + computed `VideoDimensions` in refs.
  - `streamEffect` — depends on `[restartCount, seekOffset, maxCols, maxRows]`. Uses cached probe. Manages ffmpeg + ring buffer + timer lifecycle.
- [ ] **Probe caching**: `probeRef = useRef<{ meta: VideoMetadata, dims: VideoDimensions } | null>(null)`
- [ ] **Seek flow**:
  1. `streamEffect` cleanup: kill ffmpeg, kill audio, `timer.dispose()`
  2. `buffer.flush()` (synchronous — same buffer instance persisted)
  3. Spawn new ffmpeg with `-ss <seekOffset>`
  4. Producer writes first frame → render immediately (before timer starts)
  5. `timer.play()` starts from frame 1
  6. If `!paused`: restart ffplay at `seekOffset`
- [ ] **Seek preserves paused state** (see brainstorm: resolved question). If paused + seek: render first frame, stay paused. Frame-by-frame stepping works naturally.
- [ ] **Resize handling**: recompute `VideoDimensions` from cached metadata + new terminal size. Only restart stream (not re-probe).

**Files:** `src/renderer/opentui/media-modal.tsx`

#### Phase 7: Smooth Scrubbing

Integrate seek debouncer for smooth scrub UX.

- [ ] New function `decodeSingleFrame(filePath, seekOffset, dims): Promise<Uint8Array | null>` in `video-decoder.ts`
  - Spawns `ffmpeg -ss <offset> -i <file> -vframes 1 -f rawvideo -pix_fmt rgba -vf scale=W:H pipe:1`
  - Separate from `activeVideoProc` — uses its own local proc variable (no module-level tracking)
  - Timeout: 500ms, returns null on failure
- [ ] In `ModalVideoContent`: create `SeekDebouncer`
- [ ] On seek key: `debouncer.seek(newOffset)` + immediately call `decodeSingleFrame()` → render
- [ ] During active scrub (debouncer active): timer paused, audio killed, main ffmpeg killed
- [ ] On settle (300ms after last seek): start normal playback from final offset (spawn ffmpeg, fill buffer, start timer, restart audio)
- [ ] Scrub is component-local state (not in reducer) — derived from debouncer's `isActive`
- [ ] Progress bar updates per-frame during scrub via `onVideoInfo` callback

**Files:** `src/media/video-decoder.ts` (add `decodeSingleFrame`), `src/renderer/opentui/media-modal.tsx`

#### Phase 8: Audio Sync Rewrite

Clean up audio lifecycle for tighter sync.

- [ ] **Pause**: SIGSTOP ffplay (keep process alive, avoid restart latency on resume)
- [ ] **Resume**: SIGCONT ffplay (instant — no spawn delay). Only restart if process died.
- [ ] **Seek**: kill ffplay → restart with `-ss <newOffset>` (audio must restart from new position)
- [ ] **Scrub settle**: restart ffplay at final position with ~50ms delay after first video frame renders
- [ ] **Elapsed calculation for audio**: `seekOffset + timer.tickCount / fps` — same as video progress
- [ ] Guard all signal sends with try/catch (process may have exited)
- [ ] Remove `await playAudio()` blocking — spawn audio in parallel with first buffer fill

**Files:** `src/media/ffplay.ts`, `src/renderer/opentui/media-modal.tsx`

#### Phase 9: Cleanup + Polish

- [ ] Add resize debounce (200ms) to `maxCols`/`maxRows` before triggering stream restart
- [ ] Remove all `process.stderr.write('[DBG]...')` debug logging
- [ ] Remove old `runFrameLoop`, `FrameLoopContext`, sleep-based pacing code
- [ ] Update `state-media-modal.ts` tests for any reducer changes
- [ ] Add integration-style tests: ring buffer + video timer interaction
- [ ] Update progress bar to use `timer.tickCount / fps` instead of sampling every 10 frames
- [ ] Verify SIGSTOP try/catch only sets `videoStopped = true` on successful signal delivery
- [ ] Run full test suite + lint

**Files:** `src/renderer/opentui/media-modal.tsx`, `src/media/video-decoder.ts`, `src/media/ffplay.ts`, `src/app/state-media.test.ts`

## System-Wide Impact

### Interaction Graph

- `SeekMedia` reducer → increments `restartCount` + updates `seekOffset` → `streamEffect` re-fires → flushes buffer → kills processes → restarts pipeline
- `TogglePlayPause` reducer → flips `paused` → pause effect → `timer.pause()`/`timer.play()` + SIGSTOP/SIGCONT + audio control
- `ReplayMedia` reducer → resets `seekOffset` to 0 + increments `restartCount` → same as seek flow
- `CloseMediaModal` reducer → ModalVideoContent unmounts → effect cleanup → dispose timer, flush buffer, kill processes
- Terminal resize → prop change → debounced → stream restart with cached probe + new dimensions

### Error Propagation

- ffmpeg spawn failure → `probeVideo` returns `{ ok: false }` → `setPlaybackState('error')` → fallback text
- ffmpeg exit mid-stream → `readFrames` generator returns → producer calls `buffer.markEnded()` → consumer drains → `setPlaybackState('ended' | 'error')`
- ffplay spawn failure → `playAudio` returns `{ ok: false }` → audio silently absent (video continues)
- SIGSTOP/SIGCONT failure → try/catch swallows, sets flag only on success

### State Lifecycle Risks

- **Ring buffer on seek**: flush is synchronous, called in effect cleanup before new producer starts. No interleaving risk.
- **Stale async detection**: `loadIdRef` counter pattern (existing, proven) prevents stale frame writes
- **Process cleanup**: effect cleanup kills ffmpeg + ffplay, disposes timer. No orphaned processes.

### API Surface Parity

- No external API affected — all changes are internal to the media pipeline
- Key handlers unchanged (`viewer-keys.ts` `handleModalKey` — same actions dispatched)
- Reducer unchanged (same `SeekMedia`, `TogglePlayPause`, `ReplayMedia` actions)

## Acceptance Criteria

### Functional Requirements

- [ ] Pause freezes video instantly (no 1-2s delay)
- [ ] Resume continues from exact position (no fast-forward or skipped frames)
- [ ] Seek shows target frame within ~100ms
- [ ] Smooth scrubbing: hold arrow key → frames update live at key repeat rate
- [ ] Audio pauses with video (no audio continuing after video freezes)
- [ ] Audio resumes at correct position (within ~200ms sync)
- [ ] Replay works cleanly (no stale frames from previous playback)
- [ ] Video ends naturally (last frame shown, state = 'ended')
- [ ] Terminal resize restarts playback at correct position
- [ ] Progress bar updates in real-time during playback and scrubbing

### Non-Functional Requirements

- [ ] Ring buffer memory: ≤30MB for any terminal size
- [ ] No orphaned ffmpeg/ffplay processes on any exit path
- [ ] All existing media tests pass (`bun test`)
- [ ] Lint passes (`bun run lint`)
- [ ] TypeScript strict mode with `exactOptionalPropertyTypes: true`

### Quality Gates

- [ ] Ring buffer: ≥8 unit tests (write/read, full, empty, flush, ended, wrap)
- [ ] Video timer: ≥6 unit tests (tick, pause/resume, drift, stop, dispose)
- [ ] Seek debouncer: ≥4 unit tests (settle, debounce, cancel)
- [ ] State tests updated for any reducer changes

## Dependencies & Prerequisites

- Existing `readFrames` async generator (reused as-is)
- Existing `createVideoStream` (reused, `-re` already removed)
- Existing `probeVideo` (reused, called once per video)
- Existing `halfblock.ts` `renderHalfBlockMerged` (reused in consumer)
- Existing `frame-timer.ts` drift correction logic (referenced for video timer)

## Risk Analysis & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Event loop starvation (producer blocks consumer) | Choppy playback | Trust async interleaving; producer yields on `await reader.read()`, consumer yields on `setTimeout`. Add explicit yield if testing shows issues. |
| 27MB ring buffer too much memory | OOM on constrained systems | Buffer size is configurable. Terminal size naturally limits frame dimensions. Most terminals produce ~5-10MB buffers. |
| Single-frame decode too slow for smooth scrub | Laggy scrubbing | `-ss` before `-i` = keyframe seek (fast). `-vframes 1` = single frame decode. Expect <100ms per frame. |
| ffplay SIGSTOP unreliable | Audio continues during pause | Already verified working with `process.kill(pid, 'SIGSTOP')`. Fallback: kill + restart on resume (current V1 approach). |
| Resize during scrub | Complex state interaction | Scrub debouncer `.cancel()` on resize → exit scrub mode → restart pipeline with new dimensions. |

## Alternative Approaches Considered

(See brainstorm: `docs/brainstorms/2026-03-08-video-pipeline-v2-brainstorm.md`)

1. **Sleep-based pacing (current V1)**: Drift-prone, stale buffer issues on resume. Rejected.
2. **Single ffmpeg + audiotoolbox**: Perfect A/V sync but macOS-only. Rejected for cross-platform.
3. **MPV IPC backend**: Battle-tested but adds dependency. Rejected — ffmpeg-only constraint.
4. **Decode-on-demand**: Most control but no streaming. Too complex for the benefit.

## Sources & References

### Origin

- **Brainstorm document:** [docs/brainstorms/2026-03-08-video-pipeline-v2-brainstorm.md](docs/brainstorms/2026-03-08-video-pipeline-v2-brainstorm.md) — Key decisions carried forward: ring buffer replaces pipe-direct, pause = stop timer, seek = flush + restart + first-frame display, 30-frame buffer cap, 300ms scrub debounce.

### Internal References

- Frame timer drift correction: `src/media/frame-timer.ts:33-53`
- readFrames async generator: `src/media/video-decoder.ts:372-403`
- Current runFrameLoop: `src/renderer/opentui/media-modal.tsx:274-330`
- Factory function pattern: `src/media/cache.ts:1-73`
- Debounce pattern: `src/watcher/watcher.ts` `createDebouncer()`
- Invocation counter stale detection: `src/renderer/opentui/media-modal.tsx:356` `loadIdRef`
- State reducer: `src/app/state-media-modal.ts:34-46` `seekMedia()`
- Modal key handlers: `src/renderer/opentui/viewer-keys.ts:61-101` `handleModalKey()`
- Current V1 video plan: `docs/plans/2026-03-07-feat-video-v2-plan.md`

### Institutional Knowledge

- `docs/learnings/2026-03-07-media-modal-and-selection-institutional-knowledge.md` — Pre-render frames to avoid GC jank, hex lookup table optimization, SIGINT cleanup pattern, invocation counter for stale detection
