---
title: Selection and Copy
type: feat
status: completed
note: Phase 1 implemented. Phase 2 (verify native selection) is manual testing.
date: 2026-03-07
origin: docs/brainstorms/2026-03-07-media-modal-and-selection-brainstorm.md
---

# Selection and Copy

## Overview

Wire OpenTUI's native text selection (mouse drag) and `y` key yank to OSC 52 clipboard. Mouse drag highlights text visually via OpenTUI's built-in Selection class. Pressing `y` copies the selected text to the system clipboard. Esc clears any active selection.

This was Phase 1 of the media modal plan but was deferred. Now implemented as a standalone feature.

## Architecture

### Data Flow

```
mouse drag → OpenTUI Selection (native highlighting)
  → renderer.on("selection", handler) fires on mouse-up
  → stash Selection reference in ref

y key pressed → read renderer.getSelection()
  → getSelectedText() → guard empty/whitespace
  → renderer.copyToClipboardOSC52(text)
  → renderer.clearSelection()

Esc pressed → renderer.clearSelection() (added to existing Esc chain)
```

### File Map

| File | Change |
|------|--------|
| `src/renderer/opentui/viewer-keys.ts` | add `y` to `VIEWER_KEY_MAP`, Esc clears selection |
| `src/renderer/opentui/app.tsx` | pass renderer to viewer key handler, wire `y` copy logic |
| `src/app/state.ts` | add `y` legend entry |

No new files. The feature is ~30 lines across 3 files.

### Why No Custom Hook

The original plan proposed a `useSelection` hook. That is unnecessary because:
- OpenTUI handles selection highlighting natively (mouse drag on `selectable` text elements works out of the box with `useMouse: true`)
- The `"selection"` event fires automatically on drag-end
- The only app-level work is the `y` key handler (read selection, copy, clear) and the Esc integration
- A hook would add a file and lifecycle management for something that is a one-liner in the key handler

## Implementation

### Phase 1: `y` Key Yank + Esc Clear

- [x] Add `y` to `VIEWER_KEY_MAP` in `viewer-keys.ts` — returns a new `CopySelection` action
- [x] Add `CopySelection` to `AppAction` union in `state.ts` (passthrough, no state change — handled by side-effect in `app.tsx`)
- [x] In `dispatchAction()` in `app.tsx`, handle `CopySelection`:
  ```ts
  if (action.type === 'CopySelection') {
    const sel = renderer?.getSelection()
    if (sel == null) return
    const text = sel.getSelectedText()
    if (text.trim().length === 0) return
    renderer.copyToClipboardOSC52(text)
    renderer.clearSelection()
    return
  }
  ```
- [x] Extend Esc handler in `handleViewerKey()` — insert selection clear before modal/focus check:
  ```ts
  if (key.name === 'escape') {
    if (renderer?.hasSelection) {
      renderer.clearSelection()
      return null
    }
    // existing modal > focus > browser > quit chain
  }
  ```
  This means the new Esc priority chain is: selection > modal > focus > browser > quit
- [x] Pass `renderer` to `handleViewerKey()` (it already receives `dispatch` — add renderer as parameter)
- [x] Add legend entry for `y` in the nav legend page (`legendEntries()` in `state.ts`):
  ```ts
  entries.push({ key: 'y', label: 'copy' })
  ```
  Only shown when not in media focus mode (media focus legend is separate)
- [x] Guard: `y` is a no-op when `renderer.hasSelection` is false (no selection to copy)

### Phase 2: Verify Native Selection Works

- [ ] Verify `useMouse: true` (already set in `boot.tsx`) enables drag-to-select on `<text>` elements
- [ ] Verify `selectable` defaults to `true` on `TextBufferRenderable` (per brainstorm decision — no explicit prop needed)
- [ ] If selection does NOT work natively, set `selectable` explicitly on `<text>` elements in `renderChildren()` (`src/renderer/opentui/index.tsx`)
- [ ] Verify selection works in all viewer layouts: preview-only, side, top, source-only
- [ ] Verify selection is scoped to single scrollbox pane (no cross-pane drag)

## Key Decisions

1. **`y` not auto-copy on mouse-up** — explicit yank is more predictable. Auto-copy on every drag-end can wipe clipboard on accidental drags.
2. **`y` not Ctrl+C** — `exitOnCtrlC: true` in boot config means Ctrl+C kills the app. Changing that would require reworking exit handling.
3. **No `selectable` prop needed** — OpenTUI's `TextBufferRenderable` defaults `selectable` to `true`. Verified in brainstorm.
4. **OSC 52 fail-silent** — if the terminal doesn't support OSC 52, `copyToClipboardOSC52()` returns `false`. We ignore the return value (no error UI).
5. **Esc clears selection** — inserted at highest priority in the Esc chain. This is consistent with vim behavior (Esc clears visual selection).
6. **No `ClearSelection` state action needed** — selection is renderer-level state, not app state. `renderer.clearSelection()` is a direct API call, no reducer involvement.
7. **Empty guard** — never copy empty or whitespace-only text. Prevents clipboard wipe on accidental selections.

## Tests

Add to existing `src/app/state-media.test.ts` or create `src/renderer/opentui/selection.test.ts`:

- [ ] `y` key returns `CopySelection` action from `VIEWER_KEY_MAP`
- [ ] `y` key returns `null` when in media focus mode (blocked by `MEDIA_FOCUS_ALLOWED`)
- [ ] `CopySelection` is a passthrough in `appReducer` (state unchanged)
- [ ] legend includes `y: copy` entry on nav page
- [ ] Esc priority: selection clear checked before modal/focus/browser/quit

Note: actual clipboard copy is a side-effect using the renderer API — integration testing requires a running OpenTUI renderer. Unit tests verify the key mapping and state machine behavior.

## Acceptance Criteria

- [ ] Mouse drag highlights text in viewer panes (OpenTUI native)
- [ ] Pressing `y` copies selected text to system clipboard via OSC 52
- [ ] `y` is a no-op when no text is selected
- [ ] `y` does not copy empty or whitespace-only selections
- [ ] `y` clears the visual selection after copying
- [ ] Esc clears any active selection (before checking modal/focus/browser/quit)
- [ ] OSC 52 failure is silent (no crash, no error UI)
- [ ] Legend shows `y: copy` in viewer nav page
- [ ] Works in all viewer layout modes (preview-only, side, top, source-only)
- [ ] Selection is pane-scoped (no cross-pane drag)
