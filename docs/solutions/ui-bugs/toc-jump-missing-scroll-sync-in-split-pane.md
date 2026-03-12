---
title: "TOC jump ignores scroll sync in split-pane layout"
date: 2026-03-11
category: ui-bugs
tags:
  - toc
  - scroll-sync
  - split-pane
  - viewer
severity: medium
component: src/renderer/opentui/viewer-scroll-hooks.ts
symptom: >
  Pressing a TOC entry to jump to a heading scrolled only the focused pane.
  When scroll sync was enabled in a split-pane layout (side or top), the
  other pane did not follow.
root_cause: >
  useTocJump called scrollToDescendant and scrollToLine to position both
  panes directly, but never invoked syncScroll afterward. Scroll sync was
  only wired to keyboard and mouse scroll paths; the TOC jump code path
  had no equivalent call.
resolution: >
  After the direct scroll calls in useTocJump, check state.scrollSync and
  isSplitLayout(state.layout). When both are true, call syncScroll via
  queueMicrotask using previewRef as the authority (layout positions are
  more precise than raw line numbers).
---

## Problem

In liham's split-pane layout, triggering a TOC jump (`t` to open TOC, then selecting a heading) scrolled only the currently focused pane to the target heading. When scroll sync was enabled (`s` key), the other pane stayed at its current position instead of following.

## Investigation

`useTocJump` in `viewer-scroll-hooks.ts` handled the jump by:

1. Looking up the selected TOC entry's `sourceLine`.
2. Calling `scrollToDescendant` on `previewRef` — using OpenTUI's layout engine to find the exact rendered element position via `src-line-{n}` IDs.
3. Calling `scrollToLine` on `sourceRef` — a simple line-number-to-row offset scroll.
4. Dispatching `TocJumpComplete` to clear the jumping state.

`syncScroll` in `viewer-keys.ts` handles proportional syncing between panes. It reads `scrollTop / scrollHeight` from the authority pane and applies the same ratio to the other pane. It was already used by keyboard scroll (`scrollWithSync` in `app.tsx`) and mouse scroll handlers — but never by TOC jump.

## Root Cause

The TOC jump code path directly set scroll positions on both panes independently but never invoked `syncScroll` afterward. The normal scroll-sync pathway (keyboard/mouse handlers) only fires on user-initiated scroll events — not on programmatic jumps. The sync step was simply missing from the TOC jump codepath.

## Solution

```diff
-import type { AppAction, AppState } from '../../app/state.ts'
+import { type AppAction, type AppState, isSplitLayout } from '../../app/state.ts'
 import { findMatches } from '../../search/find.ts'
 import { scrollToLine } from './scroll-utils.ts'
 import type { TocEntry } from './toc.ts'
+import { syncScroll } from './viewer-keys.ts'

 // inside useTocJump, after both panes are individually scrolled:
     if (entry.sourceLine != null) {
       scrollToLine(sourceRef.current, entry.sourceLine)
     }
+    // sync the other pane proportionally when scroll sync is on
+    if (state.scrollSync && isSplitLayout(state.layout)) {
+      queueMicrotask(() => {
+        // use preview as authority (layout-based position is more precise)
+        syncScroll(previewRef.current, sourceRef.current)
+      })
+    }
     dispatch({ type: 'TocJumpComplete' })
```

## Why It Works

- **`queueMicrotask` timing:** `scrollTo()` is called synchronously, but OpenTUI's layout engine may not have committed the new scroll position until after the current JS task finishes. Deferring `syncScroll` by one microtask ensures `scrollTop`/`scrollHeight` reflect the just-applied jump.
- **Preview as authority:** `scrollToDescendant` locates the heading's exact pixel position using `findDescendantById` against OpenTUI's live layout tree — more precise than the line-number estimate used for the source pane.
- **`isSplitLayout` guard:** `syncScroll` is only meaningful when both panes are visible. Prevents a no-op call (and potential division-by-zero on `scrollHeight`) in single-pane layouts.

## Prevention: Scroll Sync Checklist

The codebase has four scroll entry points across three files. Any new scroll entry point must:

- [ ] Check `state.scrollSync && isSplitLayout(state.layout)` after scrolling
- [ ] Call `syncScroll` wrapped in `queueMicrotask` (never synchronous)
- [ ] Choose the correct authority pane (the one with the more precise position)
- [ ] Call `dispatch` after the sync block, not before (dispatching first can re-render and lose the ref's updated `scrollTop`)

### Current scroll entry points

| Entry point | File | Sync method |
|---|---|---|
| Keyboard scroll | `app.tsx` (`scrollWithSync`) | `syncScroll(focused → other)` via microtask |
| Mouse scroll | `viewer-keys.ts` (`createMouseHandlers`) | `syncScroll(scrolled → other)` via microtask |
| TOC jump | `viewer-scroll-hooks.ts` (`useTocJump`) | `syncScroll(preview → source)` via microtask |
| Search highlight | `viewer-scroll-hooks.ts` (`useSearchHighlight`) | Scrolls both panes independently (no sync) |

## Cross-References

- `src/renderer/opentui/viewer-keys.ts:205` — `syncScroll` implementation
- `src/renderer/opentui/app.tsx:83` — `scrollWithSync` (keyboard sync pattern)
- `src/renderer/opentui/scroll-utils.ts` — `scrollToLine`, `buildHeadingOffsets`
- `docs/learnings/2026-03-10-print-preview-and-recent-feature-learnings.md` — TOC/search sub-reducer context
