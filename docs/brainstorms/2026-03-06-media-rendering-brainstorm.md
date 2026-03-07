# Media Rendering: GIF Animation + Media Architecture

**Date:** 2026-03-06
**Status:** brainstorm
**Scope:** GIF animation across renderers, shared media core, architecture for future audio/video

## What We're Building

A renderer-agnostic media layer that supports animated GIF playback on capable renderers, with an architecture that extends naturally to audio and video playback in the future.

### Immediate deliverable
- GIF animation working on Rezi (and any future renderer with native buffer control)
- OpenTUI continues to render GIFs as static first frame (React reconciler limitation)
- Core `FrameTimer` utility that manages frame cycling with drift correction
- `MediaCapabilities` detection for what the active renderer can handle

### Architecture deliverable
- `MediaPlayer` interface definition in core — coordinates frame delivery + playback state
- IR node types for video/audio (`VideoNode`, `AudioNode`)
- ffmpeg as optional lazy dependency (same pattern as sharp)
- Markdown embedding: `<video>`, `<audio>` HTML tags + auto-detect from `![](file.mp4)` syntax

## Why This Approach

### Core owns playback, renderer owns rendering

The core (src/media/) provides:
- **Decoded frames** — pre-decoded `Uint8Array[]` (GIF) or streaming frames (future video)
- **Frame timer** — drift-correcting timer that emits "show frame N" events. Not raw `setTimeout` — measures elapsed time and adjusts next delay to prevent drift accumulation
- **Playback state** — play/pause/seek/position as a simple state machine
- **Audio bridge** — spawns ffmpeg/ffplay child process, controls via signals or IPC

The renderer provides:
- **Frame display** — how to actually put pixels on screen (halfblock spans, FrameBuffer cells, Kitty protocol, etc.)
- **Controls UI** — keyboard shortcuts + mouse-clickable buttons, rendered with whatever primitives the renderer has
- **Capability reporting** — tells core whether it can animate, show controls, etc.

This separation means OpenTUI can choose "static only" while Rezi can do full animation, using the exact same decoded data and timer from core.

### Why not setTimeout for animation

`setTimeout(fn, delay)` drifts. If a frame should display at t=100ms but the callback fires at t=108ms, the next `setTimeout(fn, 100)` fires at t=208ms instead of t=200ms. Over 20 frames this compounds visibly. A `FrameTimer` measures wall-clock time and adjusts:

```
expected_next = start + frame_delays[0..n].sum()
actual_now = performance.now()
adjusted_delay = max(0, expected_next - actual_now)
setTimeout(fn, adjusted_delay)
```

Same pattern needed for audio/video sync later.

### Dependency story

| Dependency | Purpose | Required? | Fallback |
|---|---|---|---|
| sharp | Image decode (PNG, JPEG, GIF, WebP) | Optional | `[image: alt]` text |
| ffmpeg | Audio/video decode + playback | Optional (future) | `[video: alt]` / `[audio: alt]` text |

Both lazy-detected at runtime via the existing `initSharp()` pattern. A future `initFFmpeg()` would probe `ffmpeg -version` on first media encounter.

## Key Decisions

1. **Core owns playback timing, renderer owns display** — the `FrameTimer` and `MediaPlayer` live in the shared layer. Renderers subscribe to frame changes and render however they want.

2. **Memory pressure callback replaces `AnimationLimits`** — the current `AnimationLimits` (maxFrames/maxDecodedBytes) will be replaced by a `shouldContinue(): boolean` callback. Renderers that want simple limits implement them inside their callback. This is a cleaner API — one mechanism instead of two.

3. **ffmpeg for both audio and video** — single dependency handles all non-image media. Audio playback is a headless child process (no terminal pixels). Video is streaming RGBA frame extraction into the same `LoadedImage` shape the image pipeline already uses.

4. **Markdown embedding: HTML tags + image syntax** — `<video src="...">` and `<audio src="...">` for explicit control. `![alt](file.mp4)` auto-detects media type from extension/magic bytes. Both route through the same IR nodes.

5. **Controls: keyboard + mouse** — `[prev 5s] [play/pause] [next 5s]` rendered as clickable text buttons with OpenTUI's mouse events. Keyboard shortcuts (arrow keys, space) always work. Degrade to keyboard-only when mouse isn't available.

6. **OpenTUI renders GIFs static** — this is a renderer limitation (React reconciler tearing), not a core limitation. The core decodes all frames. When OpenTUI's architecture supports it (or Rezi replaces it), animation "just works."

7. **Memory pressure callback is the sole throttle** — replaces `AnimationLimits` (decision 2). The decoder accepts a `shouldContinue(): boolean` callback. Renderers with unlimited capacity pass `() => true`. OpenTUI's callback enforces the old 20-frame/10MB limits internally. One API, no confusion.

8. **Audio autoplay follows HTML semantics** — `<audio autoplay>` auto-plays, plain `<audio>` requires user action. No custom behavior invented.

9. **Progress bar is renderer-decided** — core provides position/duration. Each renderer chooses how (or whether) to visualize it based on its re-render capabilities.

## Architecture Sketch

```
src/media/                          # renamed from src/image/ — all media concerns
  types.ts                          # LoadedImage, MediaCapabilities, PlaybackState
  decoder.ts                        # sharp: image + GIF decode (existing)
  halfblock.ts, kitty.ts, etc.      # image rendering primitives (existing)
  cache.ts, semaphore.ts, etc.      # resource management (existing)
  frame-timer.ts                    # drift-correcting frame cycling (new)
  media-player.ts                   # coordinates frames + audio + state (new)
  ffmpeg.ts                         # lazy ffmpeg detection + child process (new)

src/pipeline/
  rehype-ir.ts                      # add video/audio compilation via customHandlers
  sanitize-media-src.ts             # reuse sanitize-image-src pattern

src/ir/types.ts                     # add VideoNode, AudioNode to CoreIRNode union

src/renderer/opentui/
  image.tsx                         # static GIF (unchanged)
  media-controls.tsx                # playback controls component (future)

src/renderer/rezi/                  # future
  image.tsx                         # animated GIF via FrameTimer subscription
  media-controls.tsx                # native controls
```

### Data flow for animated GIF (Rezi)

```
markdown → rehype-ir → ImageNode
  → useImageLoader (same hook, provides LoadedImage with frames[])
  → renderer checks: can I animate?
    → yes: subscribe to FrameTimer, swap frame buffer each tick
    → no: render frames[0] static
```

### Data flow for video (future)

```
markdown → rehype-ir → VideoNode
  → MediaPlayer.load(url)
    → initFFmpeg()
    → spawn ffmpeg: extract frames as streaming RGBA
    → spawn ffplay: audio playback (headless)
    → FrameTimer: sync frame display to audio position
  → renderer: display current frame + controls
```

## Resolved Questions

1. **Directory structure** — Rename `src/image/` to `src/media/`. One directory for all media concerns (images, GIF animation, future audio/video). Bigger refactor but cleaner long-term. All existing image code moves over, new media files added alongside.

2. **GIF memory on Rezi** — Memory pressure callback. Renderer passes an optional `shouldContinue(): boolean` callback to the decoder. Decoder checks after each frame decode. Truly unlimited for capable renderers, graceful truncation when memory is tight. More expressive than a static limit.

3. **Audio autoplay** — Respect the HTML attribute. `<audio autoplay>` in markdown auto-plays; `<audio>` without the attribute requires explicit user action. Follows web semantics, no surprises.

4. **Progress bar** — Renderer decides. Core provides position/duration data. Rezi can render a live `[=====>----] 2:34/5:00` bar with continuous re-render. OpenTUI can show static text that only updates on interaction. Each renderer chooses based on its rendering capabilities.

5. **Rename timing** — Bundle the `src/image/` → `src/media/` rename into one PR with atomic commits. First commit is the pure rename, subsequent commits add new media features. Clean history within a single PR.

6. **IR node design** — Separate `VideoNode` and `AudioNode` types. Matches the existing `ImageNode` pattern. Each media type gets explicit typing, clearer renderer dispatch.
