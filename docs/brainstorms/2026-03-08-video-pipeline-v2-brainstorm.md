# Video Pipeline V2 — Ring Buffer Architecture

**Date**: 2026-03-08
**Status**: brainstorm
**Branch**: `feat/video-v2`

## What We're Building

A rearchitected video playback pipeline that decouples frame decoding from display rendering using a pre-decode ring buffer and the proven `FrameTimer` pattern (already used for GIF animation).

### Current Problems

1. **Pause jank**: SIGSTOP freezes ffmpeg, but Bun's stream buffers and ffmpeg's internal buffers deliver pre-fetched frames that continue rendering for ~1-2 seconds after pause.
2. **Resume fast-forward**: `-re` flag (removed) used wall-clock pacing — SIGSTOP duration appeared as lag, causing burst playback on resume. Current sleep-based pacing has drift from setTimeout imprecision + CPU-heavy half-block rendering.
3. **Audio-video drift**: Dual-process (ffmpeg + ffplay) with no sync mechanism. Both start from same `-ss` offset but drift independently.
4. **Seek latency**: Every seek kills both processes and restarts from scratch (probe + spawn + decode). Noticeable delay.
5. **No scrubbing**: Can't hold arrow key and see frames update live.

### Target Experience

- **Pause**: Instant visual freeze. Audio stops simultaneously.
- **Resume**: Instant continuation from exact position. No skipped frames.
- **Seek**: Show target frame within ~100ms. Audio muted during seek, resumes at correct position.
- **Smooth scrubbing**: Hold arrow key → frames update live as timeline position changes.
- **Progress bar**: Real-time updates reflecting actual playback position.

## Why This Approach

### Ring Buffer + FrameTimer

The core insight: **decouple decode speed from display speed**.

Currently, ffmpeg's output rate and the renderer's consumption rate are tightly coupled through a single pipe. Pause, resume, seek, and pacing all fight over the same data flow.

With a ring buffer:
- **ffmpeg** decodes at max speed into a fixed-size buffer (producer)
- **FrameTimer** reads from the buffer at target fps (consumer)
- Producer and consumer are independent — timing issues in one don't affect the other

This pattern is already proven in the GIF animation path (`src/media/frame-timer.ts`), which uses drift-correcting `setTimeout` with epoch-based scheduling.

### Alternatives Considered

1. **Sleep-based pacing (current)**: Drift-prone, interacts poorly with SIGSTOP, stale buffer issues on resume.
2. **Decode-on-demand**: Request one frame at a time. Most control but complex ffmpeg interaction (no streaming).
3. **Single ffmpeg with `-f audiotoolbox`**: Perfect A/V sync but macOS-specific. Cross-platform audio adds significant complexity.
4. **MPV IPC backend**: Battle-tested seek/sync but adds a dependency and changes the rendering model entirely.

## Key Decisions

### 1. Ring buffer replaces pipe-direct consumption

**Before**: `readFrames(stdout)` → render immediately → sleep for pacing
**After**: `readFrames(stdout)` → write to ring buffer → FrameTimer reads buffer → render

The buffer absorbs timing variations from both ffmpeg (decode jitter) and the renderer (React commit latency).

### 2. Pause = stop timer (not SIGSTOP)

Primary pause mechanism becomes stopping the FrameTimer. No more SIGSTOP timing issues.

SIGSTOP is still sent to ffmpeg as a **CPU optimization** (prevents needless decoding while paused), but it's not the mechanism that freezes the display. The timer controls what's shown.

On resume: restart timer → next frame is already in the buffer → instant display. Then SIGCONT ffmpeg to continue filling the buffer.

### 3. Seek = flush buffer + restart ffmpeg + show first frame

1. Kill audio (mute during seek)
2. Flush ring buffer
3. Kill ffmpeg, restart with new `-ss` offset
4. Decode first frame → render immediately (before timer starts)
5. Continue filling buffer
6. Restart audio at same offset
7. Resume timer

The "show first frame immediately" step gives instant visual feedback. Buffer fill happens in the background.

### 4. Smooth scrubbing = single-frame mode

While arrow key is held (or rapid seek events):
- Enter "scrub mode" — timer paused, audio killed
- Each seek position: spawn ffmpeg with `-ss` + `-vframes 1` (single frame decode)
- Render that one frame immediately
- On scrub end (key released / debounce): start normal playback from final position

### 5. Audio re-sync on every seek/resume

Keep ffplay as separate process. Re-sync by:
- Kill ffplay on pause/seek
- Restart ffplay with `-ss <computed_elapsed>` on resume
- Brief silence (~50-100ms) on resume is acceptable

### 6. Buffer sizing

- **Default**: 30 frames (1 second at 30fps, 3 seconds at 10fps)
- **Memory**: width × height × 4 bytes × 30 frames. At 640×360 = ~27MB. At 320×180 = ~7MB.
- **Configurable**: Based on available terminal size (smaller terminal = smaller frames = less memory)
- **Ring behavior**: Oldest frame evicted when full. Producer blocks if consumer is too slow (shouldn't happen — consumer is timer-driven at target fps).

### 7. Progress bar from buffer position

Track `bufferWriteIndex` and `timerReadIndex`. Elapsed time = `seekOffset + timerReadIndex / fps`. More accurate than sampling every 10 frames.

## Architecture Sketch

```
                    ┌─────────────┐
                    │   ffmpeg    │  decodes at max speed
                    │ -ss offset  │  outputs RGBA to pipe
                    └──────┬──────┘
                           │ stdout (pipe)
                    ┌──────▼──────┐
                    │ readFrames  │  async generator
                    │ (existing)  │  accumulates pipe chunks → frames
                    └──────┬──────┘
                           │ Uint8Array frames
                    ┌──────▼──────┐
                    │ Ring Buffer │  fixed-size circular buffer
                    │  (new)      │  writeIndex, readIndex, capacity
                    └──────┬──────┘
                           │ getFrame(readIndex)
                    ┌──────▼──────┐
                    │ FrameTimer  │  drift-correcting setTimeout
                    │ (existing)  │  fires at target fps
                    └──────┬──────┘
                           │ onFrame callback
                    ┌──────▼──────┐
                    │ halfblock   │  RGBA → MergedSpan[][]
                    │ render      │  (CPU intensive)
                    └──────┬──────┘
                           │ setCurrentGrid()
                    ┌──────▼──────┐
                    │   React     │  ModalHalfBlockRows
                    │   render    │  renderPendingRef backpressure
                    └─────────────┘

    ┌──────────┐
    │  ffplay  │  separate process, same -ss offset
    │  audio   │  killed on pause/seek, restarted on resume
    └──────────┘
```

## State Flow

```
Play:   timer.play() → reads buffer → renders frames
Pause:  timer.pause() + SIGSTOP ffmpeg + kill ffplay
Resume: timer.play() + SIGCONT ffmpeg + restart ffplay(-ss elapsed)
Seek:   kill ffplay → flush buffer → kill ffmpeg → new ffmpeg(-ss) →
        decode 1st frame → render → fill buffer → restart ffplay → timer.play()
Scrub:  timer.pause() + kill ffplay → per-position: ffmpeg -vframes 1 → render
        → on settle: normal playback from final position
```

## Resolved Questions

1. **Ring buffer threading**: Trust async interleaving. `readFrames` yields on `await reader.read()`, FrameTimer yields on `setTimeout`. They naturally alternate on Bun's single-threaded event loop. The ring buffer actually improves this — decode and render happen on separate event loop ticks instead of the same one. Add explicit yields only if testing shows starvation (unlikely).

2. **Scrub debounce timing**: 300ms after last seek key press. Feels snappy, natural for key repeat rates.

3. **Buffer underrun**: Hold last frame. Timer keeps ticking, skips empty slots, resumes when buffer refills. Least jarring — avoids loading indicators interrupting flow.

4. **Memory budget**: 30 frames, ~27MB cap. Good balance of lookahead (1-3 seconds depending on fps) and memory usage. No dynamic scaling needed.

5. **Audio during seek**: Kill ffplay during active seeking/scrubbing. Restart at computed elapsed position when seek settles. Standard behavior (VLC, mpv, YouTube all do this).

## Open Questions

None — all questions resolved.
