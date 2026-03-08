---
title: "Search + TOC + FloatingPanel Shared Infrastructure"
type: brainstorm
date: 2026-03-08
origin: conversation
---

# Search + TOC + FloatingPanel Shared Infrastructure

## Core Insight

Search, TOC, and Media Gallery all share two primitives:
1. **Floating overlay panel** — absolute positioned box with border, keyboard navigation, dismissible
2. **Scroll-to-position** — jump a scrollbox to a specific content location

Building these as shared infrastructure avoids triple-implementing the same patterns and makes the media gallery cleaner by extracting its overlay logic.

## Three Consumers

| Feature | Panel Position | Panel Content | Scroll Target |
|---------|---------------|---------------|---------------|
| Media Gallery | bottom-left, zIndex 150 | media list + info | n/a (separate modal) |
| Search Bar | bottom overlay, replaces status bar | `/ query` + match count | source pane → match line |
| TOC Panel | right-aligned, zIndex 120 | heading hierarchy | preview pane → heading position |

## What Exists Today

### Media Gallery (`src/renderer/opentui/media-gallery.tsx`)
- Absolute positioned `<box>` with border, hardcoded positioning
- Sliding window for visible items (max 8)
- Keyboard navigation via viewer-keys (`n`/`N` for focus, Enter for modal)
- `galleryDimensions()` helper for modal to reserve space
- Props: mediaNodes, focusedIndex, theme, termWidth, termHeight, frameInfo, paused, videoInfo

### Status Bar (`src/renderer/opentui/status-bar.tsx`)
- Bottom bar with legend entries, file info
- 2-row height slot at bottom of viewer
- Search plan says search bar should replace this while search is active

### Scroll Infrastructure
- `ScrollBoxRenderable.scrollTo(position)` takes pixel offset
- `ScrollBoxRenderable.scrollBy(amount, 'viewport')` for relative scroll
- No `scrollIntoView()` or `scrollToChild()` — must compute pixel offset manually
- Source pane: 1 line = 1 row (monospace text), so line N ≈ pixel offset N
- Preview pane: variable height per element (headings, paragraphs, images, code blocks)

## Proposed Shared Primitives

### 1. FloatingPanel Component

Extract the absolute-positioned overlay pattern from MediaGallery into a reusable component.

```tsx
interface FloatingPanelProps {
  position: 'bottom-left' | 'bottom' | 'right'
  width: number
  height: number
  zIndex: number
  title?: string
  theme: ThemeTokens
  children: ReactNode
}
```

**What changes for MediaGallery**: gallery becomes a thin wrapper that renders its item list inside a FloatingPanel. The absolute positioning, border, background color, and zIndex move into FloatingPanel.

**What TOC uses**: FloatingPanel with position='right', heading list as children, arrow key navigation.

**What Search uses**: search bar is different — it replaces the status bar, not a floating panel. It's a bottom bar, not an overlay. So Search Bar might NOT use FloatingPanel. It's more of a conditional render: `{searchActive ? <SearchBar /> : <StatusBar />}`.

**Decision**: FloatingPanel handles positioning, border, background, zIndex, sliding window, AND built-in keyboard nav (j/k, Enter, Esc). Two consumers (gallery, TOC) justify the extraction, and future features (help overlay, command palette) will also reuse it.

### 2. ScrollToPosition Utility

A utility that computes the pixel offset for a given content position and calls `scrollTo()`.

**For source pane (search):**
- Source pane is monospace, 1 line = 1 terminal row
- Pixel offset ≈ line number (0-indexed)
- `scrollTo(matchLine)` — straightforward

**For preview pane (TOC):**
- Preview pane has variable-height elements
- Need to track heading Y positions during render
- Options:
  a. Estimate: walk IR nodes, sum estimated heights (1 per text line, code block height, etc.)
  b. Measure: after render, query Yoga layout for each heading element's Y offset
  c. Percentage: compute heading position as fraction of total content, multiply by scrollHeight
- Option (c) is simplest: heading index / total headings ≈ scroll percentage. Rough but usable.
- Option (b) is most accurate but requires React refs on heading elements and post-layout measurement.

**Decision**: line-based scroll for search (exact), IR node height estimation for TOC (pure `estimateHeight()` function, testable, accurate).

## Proposed Implementation Order

### Phase 0: FloatingPanel + ScrollToLine
- Extract FloatingPanel from MediaGallery
- Refactor MediaGallery to use FloatingPanel
- Add `scrollToLine(ref, lineNumber)` utility for source pane
- Tests: FloatingPanel renders, MediaGallery unchanged behavior

### Phase 1: Search (5 sub-phases from existing plan)
- State machine + actions
- Search logic + key handling
- Search bar UI (replaces status bar — NOT FloatingPanel)
- Source pane highlighting + scroll-to-match (uses scrollToLine)
- Edge cases + polish

### Phase 2: TOC
- Heading extraction from IR (during renderToOpenTUI traversal)
- TOC panel using FloatingPanel (position='right')
- Arrow key navigation within TOC
- Jump-to-heading via IR node height estimation (pure estimateHeight function)
- `t` toggle key binding

## Resolved Questions

1. **FloatingPanel keyboard nav → built-in.** FloatingPanel handles j/k cursor movement, Enter select, Esc close internally. Consumers pass `items[]`, `onSelect`, `onClose` callbacks. Gallery and TOC both get navigation for free. DRYest approach.

2. **Search bar → separate component.** SearchBar is structurally different (replaces status bar, has text input). Not a floating overlay. Conditional render: `{searchActive ? <SearchBar /> : <StatusBar />}`.

3. **TOC scroll → IR node height estimation.** Pure `estimateHeight(node)` function that walks IR nodes summing estimated row heights. Testable, no render coupling, accurate from day one. Better long-term maintainability than percentage-based.

4. **TOC + search → both active simultaneously.** They occupy different screen areas (TOC = right panel, search = bottom bar). Key routing: search input phase locks keys; search active phase allows `t` to toggle TOC.

5. **Gallery refactor → position + border + sliding window.** FloatingPanel handles positioning, border, background, zIndex, AND the sliding window for long lists. Gallery and TOC both benefit from built-in windowing.

## References

- Media Gallery: `src/renderer/opentui/media-gallery.tsx` — current floating panel implementation
- Search plan: `docs/plans/2026-03-07-feat-search-plan.md` — 5-phase plan (status: planned)
- TOC plan: `docs/plans/2026-03-07-feat-toc-plan.md` — plan exists (status: pending)
- Status bar: `src/renderer/opentui/status-bar.tsx` — bottom bar that search replaces
- Browser pane: `src/renderer/opentui/browser-pane.tsx` — fuzzy filter pattern to reuse for search
- State machine: `src/app/state.ts` — useReducer pattern, sub-reducer extraction
- Scroll: `applyScroll()` in `src/renderer/opentui/viewer-keys.ts` — existing scroll helpers
- OpenTUI ScrollBox: `scrollTo(position)`, `scrollBy(amount, unit)` — no scrollIntoView
