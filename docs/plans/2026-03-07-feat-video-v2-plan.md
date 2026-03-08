---
title: "Video V2: Progress, Seek, and Pause"
type: feat
status: active
date: 2026-03-07
origin: docs/brainstorms/2026-03-07-media-modal-and-selection-brainstorm.md
---

# Video V2: Progress, Seek, and Pause

## Overview

Add playback controls to in-terminal video rendering: a text-based progress bar, seek via arrow keys, and pause/resume via SIGSTOP/SIGCONT. These build on the existing video pipeline (ffprobe metadata, ffmpeg RGBA streaming, halfblock modal rendering) without changing the core architecture.

## Problem Statement

The current video player is fire-and-forget. Users can only watch from the start, restart with `r`, or close with Esc. There is no way to see playback position, skip ahead, or pause. These are basic playback controls that users expect.

## Proposed Solution

Three capabilities layered on the existing `ModalVideoContent`:

1. **Progress bar** -- track elapsed time via frame counter in the read loop, render a text-based bar in the gallery info panel. Format: `~~~~~ooooo 1:23 / 3:45`
2. **Pause** -- send SIGSTOP to the ffmpeg process (and ffplay audio process) on space bar, SIGCONT to resume. Kernel-guaranteed suspension with zero pipe data loss.
3. **Seek** -- kill the current ffmpeg/ffplay processes and restart with `-ss <offset>`. Arrow keys: left/right +/-5s, shift+left/shift+right +/-10s.

---

## Architecture Changes

### State

Add `seekOffset` to `MediaModalState`:

```ts
type MediaModalState =
  | { kind: 'closed' }
  | { kind: 'open'; mediaIndex: number; galleryHidden: boolean; paused: boolean; restartCount: number; seekOffset: number }
```

`seekOffset` is the starting position in seconds for the current playback. It advances on seek actions and resets to 0 on replay.

Add a new action:

```ts
| { type: 'SeekMedia'; delta: number; duration: number }
```

The reducer clamps `seekOffset` to `[0, duration]`.

### Video Elapsed Time

Track elapsed time inside `ModalVideoContent` via a frame counter in the read loop:

```ts
let frameCount = 0
// inside readFrames loop:
frameCount++
const elapsed = seekOffset + (frameCount / fps)
```

This is pushed to the parent via a callback (similar to `onFrameInfo`) so the gallery info bar can render it.

### Progress Bar

Rendered in the gallery info bar (not in the modal itself). The gallery already renders `formatMediaInfo()` -- extend it to include progress when video metadata is available.

Format: `~~~~~ooooo 1:23 / 3:45` where `~` = filled, `o` = empty. Bar width scales to available space in the gallery panel.

### Pause via SIGSTOP/SIGCONT

SIGSTOP suspends the ffmpeg process at the kernel level. The OS pipe buffer preserves all data. SIGCONT resumes. This is simpler and more reliable than any application-level pause because:

- SIGSTOP cannot be caught, blocked, or ignored by the target process
- Pipe buffers are preserved across stop/resume (POSIX guarantee)
- No frame data is lost -- the read loop picks up exactly where it left off
- Sequential SIGSTOP/SIGCONT on ffmpeg + ffplay has microsecond gap (imperceptible)

After SIGSTOP, drain 1-2 buffered frames from the OS pipe before showing the freeze frame (the pipe buffer may contain pre-read data).

**Critical cleanup rule:** must send SIGCONT before SIGTERM/SIGKILL when killing a stopped process. A stopped process cannot process signals until resumed.

### Seek via ffmpeg Restart

Seeking restarts the ffmpeg process with `-ss <offset>` prepended to the input args. This is the standard ffmpeg seek approach (input-level seek is fast, uses keyframes). The audio process is also killed and restarted at the same offset via `ffplay -ss <offset>`.

The `seekOffset` state value tracks the current playback origin. On seek:
1. Kill current ffmpeg + ffplay processes
2. Update `seekOffset` in state (`seekOffset + delta`, clamped to `[0, duration]`)
3. `restartCount` increments to trigger the useEffect re-run
4. `ModalVideoContent` useEffect reads `seekOffset` and passes `-ss` to both `createVideoStream` and `playAudio`

---

## Key Decisions

1. **Frame counter for elapsed time, not wall clock.** Wall clocks drift when frames are skipped. `frameCount / fps` reflects actual decoded frames, which tracks real video position (ffmpeg's `-re` paces output to real time).

2. **Progress bar in gallery info bar, not modal overlay.** The gallery panel already exists for media info. Adding progress there avoids z-index/layout complexity and keeps the modal surface dedicated to video content.

3. **SIGSTOP/SIGCONT for pause, not application-level.** No protocol needed with ffmpeg. Kernel handles everything. Platform: macOS/Linux only (acceptable -- liham's target platforms).

4. **Kill-and-restart for seek, not pipe manipulation.** ffmpeg's `-ss` with input-level seeking is fast (keyframe-based). Pipe-level seek is not possible with rawvideo output. The restart latency (~200-500ms) is acceptable for terminal video.

5. **seekOffset in reducer state, not component-local.** Enables seek actions from the key handler without prop drilling. The reducer clamps to valid range.

6. **Duration from ffprobe metadata.** Already available in `VideoMetadata.duration`. Zero-duration videos (live streams, broken metadata) disable the progress bar and seek.

---

## Implementation Phases

### Phase 1: Progress Bar + Elapsed Time Tracking

Core plumbing: frame counting, elapsed time callback, and progress bar rendering.

- [ ] Add `seekOffset: number` to `MediaModalState` open variant (default 0)
- [ ] Update `OpenMediaModal` reducer to set `seekOffset: 0`
- [ ] Update `ReplayMedia` reducer to set `seekOffset: 0`
- [ ] Add `VideoPlaybackInfo` type to `media-modal.tsx`:
  ```ts
  interface VideoPlaybackInfo {
    elapsed: number   // seconds
    duration: number  // seconds, 0 if unknown
    paused: boolean
  }
  ```
- [ ] Add `onVideoInfo` callback prop to `ModalVideoContent` (alongside existing `onFrameInfo` pattern)
- [ ] Track `frameCount` in the `readFrames` loop, compute `elapsed = seekOffset + (frameCount / fps)`, call `onVideoInfo` periodically (every ~10 frames to avoid excessive re-renders)
- [ ] Pass `seekOffset` to `ModalVideoContent` from modal state
- [ ] Store `videoInfo` in `MediaModal` parent state (alongside `frameInfo`)
- [ ] Add `formatProgressBar(elapsed, duration, barWidth)` helper to `media-gallery.tsx`:
  - returns `~~~~~ooooo 1:23 / 3:45`
  - `formatTimestamp(seconds)` helper: `mm:ss` format, handles hours if >= 3600
  - bar width = available space minus timestamp text minus padding
  - when duration is 0, show elapsed only: `1:23` (no bar, no total)
- [ ] Render progress bar in gallery info panel when `videoInfo` is present
- [ ] Test: `formatTimestamp` -- 0 -> `0:00`, 83 -> `1:23`, 3661 -> `1:01:01`
- [ ] Test: `formatProgressBar` -- correct fill ratio, correct timestamps
- [ ] Test: `seekOffset: 0` set on `OpenMediaModal` and `ReplayMedia`

**Files:**
- `src/app/state.ts` -- add `seekOffset` to `MediaModalState`
- `src/renderer/opentui/media-modal.tsx` -- frame counting, `onVideoInfo` callback
- `src/renderer/opentui/media-gallery.tsx` -- `formatProgressBar`, render in info panel
- `src/app/state-media.test.ts` -- reducer tests for seekOffset

### Phase 2: Pause via SIGSTOP/SIGCONT

Wire the existing `TogglePlayPause` action to send SIGSTOP/SIGCONT to ffmpeg and ffplay.

- [ ] Export `getActiveAudioProc()` from `ffplay.ts` (returns the module-level `activeAudioProc` reference)
- [ ] Export `getActiveVideoProc()` from `video-decoder.ts` (returns module-level `activeVideoProc`)
- [ ] Add `pauseActiveVideo()` / `resumeActiveVideo()` to `video-decoder.ts`:
  ```ts
  export function pauseActiveVideo(): void {
    if (activeVideoProc != null) activeVideoProc.kill('SIGSTOP')
  }
  export function resumeActiveVideo(): void {
    if (activeVideoProc != null) activeVideoProc.kill('SIGCONT')
  }
  ```
- [ ] Add `pauseActiveAudio()` / `resumeActiveAudio()` to `ffplay.ts` (same pattern)
- [ ] Update `killActiveVideo()`: send SIGCONT before SIGTERM if process was stopped
  - Track `videoStopped` boolean alongside `activeVideoProc`
  - On kill: if stopped, SIGCONT first, then SIGTERM -> 500ms -> SIGKILL
- [ ] Update `killActiveAudio()`: same SIGCONT-before-SIGTERM pattern
- [ ] In `ModalVideoContent`, react to `paused` prop changes:
  ```ts
  useEffect(() => {
    if (paused) {
      pauseActiveVideo()
      pauseActiveAudio()
    } else {
      resumeActiveVideo()
      resumeActiveAudio()
    }
  }, [paused])
  ```
- [ ] Pass `paused` from modal state to `ModalVideoContent` (currently not wired)
- [ ] Drain 1-2 frames from pipe after SIGSTOP before freezing display (the OS pipe buffer may have pre-read frames)
- [ ] Update progress bar to show pause state: `paused` label in gallery info
- [ ] Update modal legend: show `pause`/`play` for video (currently space is no-op for video)
- [ ] Test: `pauseActiveVideo` sends SIGSTOP to active process
- [ ] Test: `resumeActiveVideo` sends SIGCONT to active process
- [ ] Test: `killActiveVideo` sends SIGCONT before SIGTERM when stopped

**Files:**
- `src/media/video-decoder.ts` -- pause/resume exports, SIGCONT-before-kill
- `src/media/ffplay.ts` -- pause/resume exports, SIGCONT-before-kill
- `src/renderer/opentui/media-modal.tsx` -- wire paused prop to SIGSTOP/SIGCONT
- `src/renderer/opentui/viewer-keys.ts` -- remove video space bar no-op guard
- `src/app/state.ts` -- update legend to show pause/play for video

### Phase 3: Seek via Arrow Keys

Kill-and-restart approach with `-ss` offset.

- [ ] Add `SeekMedia` action to `AppAction`:
  ```ts
  | { type: 'SeekMedia'; delta: number; duration: number }
  ```
- [ ] Add `SeekMedia` reducer case:
  - Guard: `mediaModal.kind !== 'open'` -> no-op
  - Compute `newOffset = clamp(mediaModal.seekOffset + delta, 0, duration)`
  - If `newOffset === mediaModal.seekOffset` -> no-op (at boundary)
  - Set `seekOffset: newOffset`, increment `restartCount`, set `paused: false`
- [ ] Add seek key bindings to `handleModalKey` in `viewer-keys.ts`:
  - `left`: `{ type: 'SeekMedia', delta: -5, duration }` (need duration from video info)
  - `right`: `{ type: 'SeekMedia', delta: 5, duration }`
  - `shift+left`: `{ type: 'SeekMedia', delta: -10, duration }`
  - `shift+right`: `{ type: 'SeekMedia', delta: 10, duration }`
  - No-op when duration is 0 (unknown duration, cannot seek)
- [ ] Thread `duration` to `handleModalKey` -- the video info callback sets duration in a ref accessible from the key handler
- [ ] Update `createVideoStream` to accept optional `seekOffset`:
  ```ts
  interface VideoStreamOptions {
    filePath: string
    width: number
    height: number
    fps: number
    seekOffset?: number  // -ss value in seconds
  }
  ```
  When `seekOffset > 0`, prepend `-ss <offset>` before `-i` in the ffmpeg args (input-level seek for fast keyframe seeking).
- [ ] Update `playAudio` to accept optional `seekOffset`:
  Add `-ss <offset>` to ffplay args when offset > 0.
- [ ] In `ModalVideoContent`, pass `seekOffset` to both `createVideoStream` and `playAudio`
- [ ] Reset `frameCount` to 0 on each playback start (the seekOffset handles the base)
- [ ] Update legend: add `</>: seek` entry for video modal
- [ ] Test: `SeekMedia` reducer clamps to `[0, duration]`
- [ ] Test: `SeekMedia` at boundary is no-op
- [ ] Test: `SeekMedia` increments `restartCount`
- [ ] Test: `SeekMedia` resets `paused` to false
- [ ] Test: `createVideoStream` with seekOffset prepends `-ss`

**Files:**
- `src/app/state.ts` -- `SeekMedia` action, reducer case
- `src/renderer/opentui/viewer-keys.ts` -- seek key bindings
- `src/media/video-decoder.ts` -- `seekOffset` option in `createVideoStream`
- `src/media/ffplay.ts` -- `seekOffset` option in `playAudio`
- `src/renderer/opentui/media-modal.tsx` -- pass seekOffset through
- `src/app/state-media.test.ts` -- seek reducer tests

---

## Race Conditions and Mitigations

| Race | Mitigation |
|------|------------|
| SIGSTOP then immediate seek (kill) | Seek sets `paused: false`, which triggers SIGCONT in the pause effect. But the kill in cleanup uses SIGKILL anyway (useEffect cleanup is SIGKILL). The SIGCONT-before-SIGTERM safety is in `killActiveVideo()` for graceful app quit. |
| Rapid seek (left/left/left) | Each seek increments `restartCount`, triggering useEffect cleanup (SIGKILL old) then fresh spawn. Load ID pattern prevents stale callbacks. Same as existing rapid `n`/`N`. |
| Seek past end of video | Reducer clamps `seekOffset` to `[0, duration]`. ffmpeg with `-ss` past duration exits immediately with code 0 -- handled as `'ended'` state. |
| Seek with unknown duration | Seek keys are no-op when `duration === 0`. Progress bar shows elapsed only. |
| SIGCONT on already-running process | SIGCONT on a running process is a no-op (POSIX). Safe to send unconditionally before SIGTERM. |
| Pause then close modal | useEffect cleanup: SIGCONT before SIGKILL via `killActiveVideo()`. Prevents orphaned stopped process. |

---

## Tests

Following existing co-located test convention:

- `src/app/state-media.test.ts` -- extend with:
  - `seekOffset` initialized to 0 on `OpenMediaModal`
  - `seekOffset` reset to 0 on `ReplayMedia`
  - `SeekMedia` advances/retreats seekOffset, clamps at boundaries
  - `SeekMedia` increments `restartCount`
  - `SeekMedia` no-op when modal closed
  - legend shows seek keys for video

- `src/media/video-decoder.test.ts` -- extend with:
  - `createVideoStream` with `seekOffset` includes `-ss` arg
  - `pauseActiveVideo`/`resumeActiveVideo` send correct signals

- `src/renderer/opentui/media-gallery.test.ts` (new or extend):
  - `formatTimestamp` edge cases (0, 59, 60, 3599, 3600)
  - `formatProgressBar` fill ratio, boundary cases, zero duration

---

## Acceptance Criteria

### Progress Bar
- [ ] Elapsed time tracked via frame counter during video playback
- [ ] Progress bar rendered in gallery info panel: `~~~~~ooooo 1:23 / 3:45`
- [ ] Timestamps in `mm:ss` format (hours shown when >= 60 min)
- [ ] Videos with unknown duration show elapsed time only (no bar)
- [ ] Progress bar updates smoothly during playback (every ~1s)

### Pause
- [ ] Space bar pauses video (SIGSTOP to ffmpeg) and audio (SIGSTOP to ffplay)
- [ ] Space bar resumes (SIGCONT to both)
- [ ] Progress bar shows "paused" state
- [ ] Gallery info shows play/pause state
- [ ] Legend shows pause/play for video (not just GIF)
- [ ] Stopped processes are SIGCONT'd before SIGTERM/SIGKILL on cleanup

### Seek
- [ ] Left/right arrow keys seek +/-5 seconds
- [ ] Shift+left/right seek +/-10 seconds
- [ ] Seek restarts ffmpeg with `-ss <offset>` and ffplay at same offset
- [ ] Seek clamps to [0, duration] -- no negative or past-end
- [ ] Seek is no-op when duration is unknown (0)
- [ ] Progress bar and elapsed time update after seek
- [ ] Seek while paused resumes playback
- [ ] Legend shows seek key bindings when video is in modal

### Quality Gates
- [ ] No orphaned ffmpeg/ffplay processes on any exit path (pause, seek, close, quit)
- [ ] All new state actions have reducer unit tests
- [ ] Existing tests continue passing
- [ ] SIGCONT sent before SIGTERM/SIGKILL for stopped processes
