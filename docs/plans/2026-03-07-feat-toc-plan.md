---
title: Bookmarks / Table of Contents Panel
type: feat
status: pending
date: 2026-03-07
size: medium
---

# Bookmarks / Table of Contents Panel

## Overview

A floating TOC panel in viewer mode, toggled with `t`, showing all headings extracted from the document. Users navigate headings with j/k and jump to a heading with Enter, which closes the panel and scrolls the preview pane to the selected heading's estimated position.

## Problem Statement

Longer markdown documents have no way to see the document structure at a glance or jump to a specific section. Users must scroll manually through the entire document to find content. A TOC panel provides structural navigation the same way the media gallery provides media navigation.

## Proposed Solution

Reuse the floating panel pattern from `MediaGallery` (absolute positioned box, zIndex, keyboard navigation) to render a heading list. Headings are collected during the existing `renderToOpenTUI()` traversal (same as media node collection). The TOC panel floats right-aligned at zIndex 120 (below media gallery at 150). Selecting a heading estimates its scroll position and jumps there.

## Technical Approach

### Architecture

The TOC follows the same three-layer pattern as media:

1. **Collection** — headings collected during IR-to-JSX traversal via `RenderContext` (alongside media nodes)
2. **State** — `tocOpen: boolean`, `tocCursorIndex: number` in `AppState`, with actions for open/close/navigate/jump
3. **Rendering** — `TocPanel` component (absolute positioned floating panel)

### Heading Extraction

Collect headings during the `renderToOpenTUI()` traversal, same pattern as `MediaEntry` collection. Each heading entry captures:

```ts
interface TocEntry {
  level: 1 | 2 | 3 | 4 | 5 | 6
  text: string        // plain text extracted from heading children
  nodeIndex: number    // sequential block index for position estimation
}
```

Plain text extraction walks the heading's `children` recursively, concatenating `TextNode.value` and `InlineCodeNode.value` — stripping formatting but preserving content. This is a pure function operating on the IR, no React dependency.

The `nodeIndex` is the sequential count of top-level block nodes at the point the heading is encountered. This provides a rough position estimate for scrolling.

### Scroll Position Estimation

OpenTUI's `ScrollBox` has `scrollTo(position)` but no `scrollToChild()`. Position must be estimated.

**Strategy: proportional estimation.** The heading's `nodeIndex` relative to the total block count gives a ratio. Multiply by `scrollHeight` to get an approximate scroll position:

```ts
const ratio = entry.nodeIndex / totalBlockCount
const target = Math.round(ratio * scrollRef.current.scrollHeight)
scrollRef.current.scrollTo(target)
```

This is imprecise (code blocks and images take variable height) but provides a reasonable jump point. The media gallery's scroll-into-view pattern (`box.y` from `BoxRenderable`) is more accurate but requires keeping refs to heading boxes — a heavier approach that can be added later if the proportional estimate proves insufficient.

### Key Architectural Decisions

1. **Collection alongside media nodes** — headings are collected in the same `RenderContext` pass that collects media entries. No separate tree walk. The `RenderResult` grows to include `tocEntries: TocEntry[]`.

2. **TOC as app sub-state, not a mode** — like the media modal, the TOC is a sub-state within viewer mode. It does NOT change `AppMode`. Key routing checks `tocOpen` before dispatching normal viewer keys. This preserves viewer state (scroll position, pane focus) while the TOC is open.

3. **Panel position: right-aligned** — the media gallery is left-aligned (bottom-left). The TOC goes right-aligned to avoid overlap. Width is ~30 chars (or 30% of terminal, whichever is smaller). Full height minus status bar.

4. **zIndex 120** — below media gallery (150) and media modal (100). The TOC provides navigation context; the modal is immersive and should overlay everything.

5. **Single `useKeyboard` handler** — same pattern as media modal. TOC key routing is a branch in the existing App-level handler, NOT a separate `useKeyboard`.

6. **Independent of media focus** — TOC and media focus are orthogonal. Opening the TOC does not clear media focus. However, when the TOC is open, normal viewer keys are blocked (same pattern as media focus lock).

### File Map

New files:
- `src/renderer/opentui/toc-panel.tsx` — floating TOC panel component
- `src/renderer/opentui/toc.ts` — `extractText()` helper, `TocEntry` type

Modified files:
- `src/app/state.ts` — add `tocOpen`, `tocCursorIndex`, TOC actions, TOC legend entries
- `src/renderer/opentui/index.tsx` — collect `TocEntry[]` in `RenderContext` and `RenderResult`
- `src/renderer/opentui/app.tsx` — wire TOC panel, key routing branch, scroll-to-heading
- `src/renderer/opentui/viewer-keys.ts` — `t` key binding, TOC key handler

### Implementation Phases

---

#### Phase 1: Heading Collection

Collect headings during IR-to-JSX traversal. Pure data extraction, no UI.

- [ ] Create `src/renderer/opentui/toc.ts`:
  - `TocEntry` interface: `{ level, text, nodeIndex }`
  - `extractText(children: IRNode[]): string` — recursive plain text extraction from IR inline nodes (handles `TextNode`, `InlineCodeNode`, `StrongNode`, `EmphasisNode`, `LinkNode`, `StrikethroughNode` children)
- [ ] Extend `RenderContext` in `src/renderer/opentui/index.tsx`:
  - add `toc: TocEntry[]` accumulator
  - add `blockIndex: number` counter (incremented for each top-level block node)
- [ ] In `renderNode()` case `'heading'`: push `TocEntry` to `ctx.toc` with `extractText(node.children)`, `node.level`, and current `blockIndex`
- [ ] Track `blockIndex` — increment in `renderChildrenInternal()` for each block node at root depth (add a `depth` or `isRoot` flag to `RenderContext`)
- [ ] Extend `RenderResult` to include `tocEntries: TocEntry[]`
- [ ] Update `renderToOpenTUIWithMedia()` to return `tocEntries`
- [ ] Test: document with h1, h2, h3 returns correct `TocEntry[]` with levels and text
- [ ] Test: heading with bold/italic/code children extracts plain text correctly
- [ ] Test: document with no headings returns empty `tocEntries`
- [ ] Test: heading with nested formatting (bold inside link) extracts all text

**Files touched:**
- `src/renderer/opentui/toc.ts` (new)
- `src/renderer/opentui/index.tsx`

---

#### Phase 2: State Machine Additions

Add TOC state and actions to the app reducer.

- [ ] Add to `AppState` (`src/app/state.ts`):
  ```ts
  tocOpen: boolean
  tocCursorIndex: number
  ```
- [ ] Add actions to `AppAction`:
  - `{ type: 'ToggleToc' }` — toggle `tocOpen`, reset cursor to 0 on open
  - `{ type: 'TocCursorMove'; direction: 'up' | 'down' | 'top' | 'bottom'; tocLength: number }` — navigate within TOC
  - `{ type: 'TocJump' }` — signal that user pressed Enter on a TOC entry (consumed by app.tsx for scroll)
  - `{ type: 'CloseToc' }` — close without jumping
- [ ] Add `tocReducer` sub-reducer:
  - `ToggleToc`: toggle `tocOpen`, reset `tocCursorIndex` to 0 on open
  - `TocCursorMove`: reuse `moveCursor()` helper (already exists for browser)
  - `TocJump`: set `tocOpen: false` (scroll handled by app.tsx effect)
  - `CloseToc`: set `tocOpen: false`
- [ ] Wire into `appReducer` main switch
- [ ] Update `initialState()`: `tocOpen: false`, `tocCursorIndex: 0`
- [ ] Close TOC on mode transitions: `ReturnToBrowser` and `OpenFile` should set `tocOpen: false`
- [ ] Update `legendEntries()`:
  - TOC open: `{ key: 'j/k', label: 'navigate' }, { key: 'Enter', label: 'jump' }, { key: 'Esc', label: 'close' }, { key: 'g/G', label: 'top/bottom' }`
- [ ] Test: `ToggleToc` opens and closes TOC
- [ ] Test: `ToggleToc` resets cursor to 0 on open
- [ ] Test: `TocCursorMove` navigates correctly, clamps at boundaries
- [ ] Test: `TocJump` closes TOC
- [ ] Test: `ReturnToBrowser` closes TOC

**Files touched:**
- `src/app/state.ts`

---

#### Phase 3: Key Bindings

Wire TOC toggle and navigation keys.

- [ ] Add `t` to `VIEWER_KEY_MAP` in `src/renderer/opentui/viewer-keys.ts`:
  - returns `{ type: 'ToggleToc' }` (no-op in source-only layout)
- [ ] Create `handleTocKey()` in `viewer-keys.ts`:
  - `j` / `down`: `TocCursorMove` direction `'down'`
  - `k` / `up`: `TocCursorMove` direction `'up'`
  - `g`: `TocCursorMove` direction `'top'`
  - `escape`: `CloseToc`
  - `return`: `TocJump`
  - `t`: `CloseToc` (toggle behavior — pressing `t` again closes)
  - `q`: `Quit`
  - all other keys: swallowed (same pattern as modal key lock)
- [ ] Add shift `G` to `handleTocKey()`: `TocCursorMove` direction `'bottom'`
- [ ] In `dispatchViewerKey()` in `app.tsx`, add TOC branch before media modal branch:
  ```ts
  if (state.tocOpen) {
    const action = handleTocKey(key, state, dispatch, tocLength)
    if (action == null) return
    onAction(action)
    return
  }
  ```
- [ ] `t` key should be blocked when media modal is open or media is focused (TOC and modal are mutually exclusive interactions)
- [ ] Test: pressing `t` dispatches `ToggleToc`
- [ ] Test: pressing `j`/`k` when TOC open dispatches cursor move
- [ ] Test: pressing `Esc` when TOC open dispatches `CloseToc`
- [ ] Test: pressing `t` when TOC open dispatches `CloseToc`
- [ ] Test: non-TOC keys are swallowed when TOC is open

**Files touched:**
- `src/renderer/opentui/viewer-keys.ts`
- `src/renderer/opentui/app.tsx`

---

#### Phase 4: TOC Panel Component

The floating panel UI. Follows the `MediaGallery` component pattern.

- [ ] Create `src/renderer/opentui/toc-panel.tsx`:
  - `TocPanelProps`: `tocEntries`, `cursorIndex`, `theme`, `termWidth`, `termHeight`
  - absolute positioned `<box>` — right-aligned, zIndex 120
  - width: `Math.min(30, Math.floor(termWidth * 0.35))`
  - height: full content height (clamped to available entries + chrome)
  - border with `theme.pane.focusedBorderColor`
  - title row: `TOC [cursor/total]`
  - heading rows indented by level: h1 flush, h2 indent 2, h3 indent 4, h4 indent 6, h5 indent 8, h6 indent 10
  - focused row uses `theme.browser.selectedBg` / `selectedFg` (same as media gallery)
  - unfocused rows use `theme.paragraph.textColor`
  - sliding window for long TOC lists (reuse media gallery scroll pattern)
  - truncate heading text to fit panel width
  - background: `theme.codeBlock.backgroundColor` (matches gallery)
- [ ] Test: panel renders correct number of heading rows
- [ ] Test: indentation matches heading level
- [ ] Test: focused row has selected style
- [ ] Test: long headings are truncated

**Files touched:**
- `src/renderer/opentui/toc-panel.tsx` (new)

---

#### Phase 5: App Integration + Scroll Jump

Wire the panel into the app and implement scroll-to-heading.

- [ ] Store `tocEntries` in `viewerState` (alongside `content`, `raw`, `mediaNodes`)
- [ ] On live reload, update `tocEntries` and clamp `tocCursorIndex` if needed
- [ ] Render `TocPanel` when `state.tocOpen && tocEntries.length > 0`
- [ ] Implement scroll-to-heading in `App`:
  - track a `tocJumpTarget` ref (set when `TocJump` is dispatched)
  - in a `useEffect` triggered by `tocOpen` transitioning to `false` with a jump target:
    - compute `ratio = tocEntries[target].nodeIndex / totalBlockCount`
    - `previewRef.current.scrollTo(Math.round(ratio * previewRef.current.scrollHeight))`
  - clear `tocJumpTarget` after scrolling
- [ ] Wire `totalBlockCount` — count total top-level blocks during traversal (already tracked by `blockIndex` in Phase 1)
- [ ] Store `totalBlockCount` in `RenderResult` alongside `tocEntries`
- [ ] TOC panel hidden in source-only layout (no preview pane to scroll)
- [ ] TOC panel hidden when media modal is open
- [ ] Test: TOC panel appears on `t` press, disappears on `Esc`
- [ ] Test: Enter on a heading scrolls preview pane
- [ ] Test: TOC not rendered in source-only layout

**Files touched:**
- `src/renderer/opentui/app.tsx`
- `src/renderer/opentui/index.tsx` (add `totalBlockCount` to `RenderResult`)

---

## Race Conditions and Mitigations

| Race | Description | Mitigation |
|------|-------------|------------|
| TOC cursor OOB after live reload | File edited to remove headings while TOC is open | Clamp `tocCursorIndex` in reducer when `tocEntries` length changes; close TOC if all headings removed |
| Stale scroll target | Jump dispatched, but live reload changes document before scroll executes | Use `tocEntries` from current `viewerState` at scroll time, not from dispatch time |
| TOC + media modal conflict | Both panels want key focus | TOC key check happens before modal check; `t` key blocked in modal mode; opening modal closes TOC |

## Acceptance Criteria

- [ ] `t` in viewer mode toggles TOC panel on/off
- [ ] TOC panel shows all headings with correct indentation by level
- [ ] `j`/`k` navigate headings in the TOC panel
- [ ] `g`/`G` jump to top/bottom of TOC list
- [ ] `Enter` closes TOC and scrolls preview to selected heading
- [ ] `Esc` closes TOC without jumping
- [ ] TOC panel right-aligned, does not overlap media gallery
- [ ] Keys are locked to TOC navigation when panel is open (same as media focus lock)
- [ ] Legend updates when TOC is open
- [ ] TOC hidden in source-only layout and when media modal is open
- [ ] Heading text extracted correctly from headings with inline formatting
- [ ] Empty documents (no headings) — `t` is a no-op
- [ ] Live reload clamps TOC cursor

## Key Bindings (Viewer Mode)

| Key | Normal | TOC Open |
|-----|--------|----------|
| `t` | Open TOC | Close TOC |
| `j` / `down` | Scroll down | TOC cursor down |
| `k` / `up` | Scroll up | TOC cursor up |
| `g` | Scroll top | TOC cursor top |
| `G` | Scroll bottom | TOC cursor bottom |
| `Enter` | -- | Jump to heading |
| `Esc` | Browser/quit | Close TOC |

## Test Files

Following the co-located test file convention:
- `src/renderer/opentui/toc.test.ts` — `extractText()`, heading collection
- `src/app/state-toc.test.ts` — TOC reducer actions (toggle, cursor, jump)

## Sources & References

### Internal References

- Media gallery pattern: `src/renderer/opentui/media-gallery.tsx` — floating panel, sliding window, zIndex
- Media collection pattern: `src/renderer/opentui/index.tsx` — `RenderContext` accumulator
- State machine: `src/app/state.ts` — sub-reducer pattern, legend entries
- Key handling: `src/renderer/opentui/viewer-keys.ts` — key map dispatch, modal key lock
- Scroll-into-view: `src/renderer/opentui/image.tsx` — `scrollTo` via `BoxRenderable.y`
- Heading rendering: `src/renderer/opentui/heading.tsx` — heading component
- IR types: `src/ir/types.ts` — `HeadingNode` with `level` and `children`
