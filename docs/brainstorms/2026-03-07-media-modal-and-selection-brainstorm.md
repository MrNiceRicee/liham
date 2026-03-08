---
status: complete
branch: feat/media-modal-and-selection
date: 2026-03-07
---

# Media Modal + Selection/Copy Brainstorm

## What We're Building

Four phased features for the OpenTUI renderer:

1. **Selection + Copy** — wire up OpenTUI's existing Selection class and OSC 52
   clipboard so mouse-drag selects text and auto-copies to system clipboard on
   mouse-up. No extra keypress needed.

2. **Media Modal Overlay** — full-screen takeover modal for viewing media. Built
   with `position: "absolute"` + `zIndex` on a `<box>`. Triggered by `Enter` on
   a focused media node. `n`/`N` cycle through media nodes in the document.
   `m` opens a media gallery list overlay. Click on images also opens modal.

3. **GIF Animation** — animate GIFs inside the modal using React state +
   FrameTimer. The modal is the only React subtree, so reconciliation scope is
   tiny (no full-document re-render). Decode all frames on modal open. If React
   approach still tears, pivot to direct terminal writes.

4. **Video/Audio Playback** — spawn `ffplay` as child process. Video: modal
   hides TUI, ffplay takes terminal, returns on exit. Audio: ffplay runs in
   background (`-nodisp`), modal shows progress UI with play/pause. Graceful
   fallback when ffplay is not installed (poster frame + "install ffmpeg" hint).

## Why This Approach

- **OpenTUI already has the primitives** — Selection class, OSC 52 clipboard,
  absolute positioning, zIndex. We're wiring existing APIs, not building from
  scratch.
- **Modal isolates media rendering** — the React reconciler tearing that killed
  inline GIF animation is scoped away. Only the modal box re-renders on frame
  changes.
- **ffplay is pragmatic** — it's already installed, handles all formats, and
  avoids building a video decoder. Graceful fallback keeps the app useful
  without it.
- **Phase order ships value fast** — selection/copy is the smallest scope with
  the biggest UX win. Modal is the foundation everything else needs. GIF before
  video because the decoder/FrameTimer already exist.

## Key Decisions

### Selection + Copy
- **Auto-copy on select**: mouse drag highlights via OpenTUI Selection, mouse-up
  auto-copies via `renderer.copyToClipboardOSC52(text)`. Only copies when there
  is an active selection (not on every mouse-up).
- **No vim visual mode for now** — just mouse drag. Vim `v` mode is future work.
- **Assumption to verify**: OpenTUI's Selection class works with current
  `useMouse: true` setup. May need to wire `startSelection`/`updateSelection`
  manually from mouse events if it doesn't auto-handle drag.

### Modal Trigger UX
- **Enter on focused media**: `n` jumps to next media node, `N` to previous.
  Enter opens modal for the focused node. Esc closes modal.
- **Focused media indicator**: when `n`/`N` lands on a media node, scroll it
  into view and render a visible highlight (e.g. a colored border or inverted
  bar below the image with the alt text). Must be obvious which node is focused.
- **Gallery overlay**: `m` opens a list of all media in the document. Navigate
  with j/k, Enter to view. Has its own legend bar. Can be Phase 2b if scope
  gets large — basic modal + `n`/`N` first.
- **Click on image**: mouse click on a rendered image also opens the modal.
- **All three coexist** — keyboard nav, gallery, and click are complementary.

### Modal Design
- **Full-screen takeover**: modal takes 100% of terminal. Image renders at max
  terminal width. Info bar at bottom (filename, dimensions, type).
- **Esc closes** and returns to document at same scroll position.

### GIF Animation
- **React state approach first**: FrameTimer `onFrame` callback sets
  `useState(frameIndex)`. Modal component re-renders only itself.
- **Fallback plan**: if tearing persists, pivot to direct terminal writes
  (cursor positioning + halfblock escape sequences, bypassing React).

### Video/Audio
- **ffplay for both**: video takes over terminal, audio runs `-nodisp` with a
  custom progress UI in the modal.
- **Detect ffplay at startup**: add `canPlayVideo`/`canPlayAudio` to
  MediaCapabilities. Check `which ffplay` during capability detection.
- **Graceful fallback**: without ffplay, video modal shows poster frame (decoded
  as image) + "install ffmpeg to play" hint. Audio shows text fallback.

### Key Bindings (viewer mode)
| Key | Action |
|-----|--------|
| `n` | Jump to next media node |
| `N` | Jump to previous media node |
| `m` | Open media gallery overlay |
| `Enter` | Open modal for focused media |
| `Esc` | Close modal / unfocus media |
| Mouse click on image | Open modal |
| Mouse drag | Select text |
| Mouse up (after drag) | Auto-copy to clipboard via OSC 52 |

## Implementation Phases

### Phase 1: Selection + OSC 52 Copy
- Wire OpenTUI's Selection class to mouse drag events
- On selection end, call `renderer.copyToClipboardOSC52(selection.getSelectedText())`
- Verify `selectable: true` is default on text renderables

### Phase 2: Modal Overlay Foundation
- Verify `position: "absolute"` + `zIndex` layers over scrollbox in OpenTUI
- Build modal component: absolute box, full-screen, info bar
- Add `mediaFocus` state to app state machine (focused media index, or null)
- Visual indicator for focused media node (border/highlight)
- Wire `n`/`N` keys for media node cycling, Enter to open modal
- Wire click handler for images
- Render static images at full terminal width in modal
- Modal info bar: filename, dimensions, type
- Legend updates when modal is open
- Phase 2b (if time): `m` gallery overlay with its own list nav + legend

### Phase 3: GIF Animation in Modal
- Remove `maxFrames: 1` cap when loading for modal (decode all frames)
- Use FrameTimer + useState in modal component
- Render halfblock frames on timer tick
- Play/pause with space bar in modal
- If tearing: pivot to direct terminal write approach

### Phase 4: Video/Audio via ffplay
- Detect ffplay availability at startup (extend MediaCapabilities)
- Video: hide TUI, spawn `ffplay -autoexit <path>`, restore TUI on exit
- Audio: spawn `ffplay -nodisp <path>`, show progress UI in modal
- Graceful fallback: poster frame for video, text for audio, "install ffmpeg" hint

## Resolved Questions

- **Tab conflicts with pane focus?** Yes — use `n`/`N` for media cycling instead.
- **Gallery vs per-node nav?** Both — `m` for gallery, `n`/`N` for cycling.
  Complementary UX.
- **GIF tearing in modal?** Try React state first (scoped reconciliation).
  Fallback to direct terminal writes if needed.
- **No ffplay?** Graceful fallback — poster frame + install hint. Modal still
  opens.
