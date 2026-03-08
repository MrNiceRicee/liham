---
title: "Next Features Roadmap"
type: brainstorm
date: 2026-03-07
updated: 2026-03-08
origin: conversation
---

# Next Features Roadmap

## What We're Building

Features to bring liham from a media-capable previewer to a complete terminal markdown tool. Ordered by priority and dependencies.

## Priority Order

| # | Feature | Priority | Effort | Status |
|---|---------|----------|--------|--------|
| 1 | Selection & Copy | MUST | Small | **DONE** |
| 2 | Video V2 (progress, seek, pause) | High | Medium | **DONE** |
| 2b | Video Pipeline V2 (ring buffer) | High | Large | **DONE** |
| 3 | Search | High | Medium | Planned |
| 4 | TOC | Medium | Medium | Pending |
| 5 | Math/Mermaid | Medium | Large | Draft |

### Future / Unplanned

| Feature | Priority | Effort | Notes |
|---------|----------|--------|-------|
| Smooth Scrubbing | Low | Medium | Keyframe cache for video-only. Audio scrubbing needs mpv. |
| mpv IPC Backend | Low | Large | Replace ffplay for proper AV sync. JSON protocol over Unix socket. |
| Rezi Renderer | On-hold | Large | Phase 5 of media architecture. Blocked on scroll + image bugs. |

---

## 1. Selection & Copy — DONE

Merged to main. Mouse drag selection + `y` yank to clipboard via OSC 52.

Plan: `docs/plans/2026-03-07-feat-selection-and-copy-plan.md`

---

## 2. Video V2 — DONE

Merged to main. Progress bar, left/right seek, space pause/resume.

Plans:
- `docs/plans/2026-03-07-feat-video-v2-plan.md`
- `docs/plans/2026-03-08-feat-video-pipeline-ring-buffer-plan.md` (ring buffer rearchitecture)

### Known Limitation

Audio sync drifts slightly over time due to two independent clocks (JS setTimeout vs ffplay's audio clock). The plan documents mpv IPC as the recommended future fix.

---

## 3. Search

### What
`/` activates search mode. Type query, see matches highlighted in the document. `n`/`N` jump between matches. `Esc` exits search.

### Why This Approach
- **Mode-based** — `/` enters search mode where `n`/`N` navigate matches. When search is inactive, `n`/`N` remain media focus keys. Clear separation, no conflicts.
- **Vim-familiar** — `/` for search, `n`/`N` for next/prev is deeply ingrained in terminal users.
- **Reuse browser filter pattern** — char-by-char input handling (no `<input>` element), match count display, highlight rendering.

### Key Decisions
1. **Search keys**: `/` to activate, `n`/`N` for next/prev, `Esc` to close, `Enter` to confirm (keeps search active but exits input mode).
2. **Search target**: raw markdown string (`viewerState.raw`). Simple string/regex match.
3. **Highlight**: wrap matched text segments with inverted colors or bright background in the rendered preview.
4. **Search bar**: bottom bar overlay (like vim's `/pattern` prompt), shows query + match count.
5. **Mode routing**: when search is active, `n`/`N` route to search nav instead of media focus.

### Open Questions
- Should search work in source pane too, or preview only?
- Regex support (vim-style) or plain text only?
- How to highlight matches in the rendered preview — IR-level injection or post-render overlay?

Plan: `docs/plans/2026-03-07-feat-search-plan.md` (status: planned)

---

## 4. TOC (Table of Contents)

### What
Press `t` to toggle a floating TOC panel. Shows document headings with hierarchy. Arrow keys navigate, Enter jumps to heading.

### Why This Approach
- **Floating panel toggle** — similar to media gallery pattern (absolute positioned, zIndex). Non-intrusive, doesn't take permanent screen space.
- **Heading extraction from IR** — walk the IR tree, collect `HeadingNode` entries with level + text. Simple recursive function.
- **Same overlay pattern** — follows MediaGallery's design: absolute box, zIndex, keyboard navigation.

### Key Decisions
1. **Toggle key**: `t` (for "table of contents"). No-op in browser mode.
2. **Panel position**: right-aligned floating panel, ~30 chars wide, full height. zIndex 120 (below gallery at 150).
3. **Heading display**: indented by level (h1 flush, h2 indented 2, h3 indented 4, etc.).
4. **Jump mechanism**: on Enter, close TOC and scroll preview pane to the selected heading's position.
5. **Heading extraction**: collect during `renderToOpenTUI()` traversal (same pattern as media node collection).

### Resolved Questions
- **Scroll to heading**: OpenTUI ScrollBox has `scrollTo(position)` but NO `scrollToChild()` or `scrollIntoView()`. Must track heading Y positions manually or estimate from child index. This is the hardest part of TOC.

### Open Questions
- Should TOC auto-highlight the current heading based on scroll position? (Nice-to-have, complex)

Plan: `docs/plans/2026-03-07-feat-toc-plan.md` (status: pending)

---

## 5. Math / Mermaid Rendering

### What
Render LaTeX math blocks as Unicode symbols. Render Mermaid diagrams as images or text fallback.

### Why This Approach
- **Unicode math** — convert common LaTeX to Unicode: α, β, ∫, ∑, ∞, superscripts/subscripts. Not perfect but readable inline. No heavy dependencies.
- **Mermaid as image** — use `@mermaid-js/mermaid-cli` to render SVG, then sharp to convert to halfblock image. Falls back to styled code block if mermaid-cli not available.
- **remark-math pipeline** — `remark-math` parses `$...$` and `$$...$$` into MDAST math nodes. Custom rehype handler converts to `CustomNode<'math'>` IR type.

### Key Decisions
1. **Math fidelity**: Unicode symbol mapping for common constructs. Show raw LaTeX for unsupported constructs.
2. **Math pipeline**: `remark-math` → custom rehype handler → `CustomNode<'math'>` → renderer component.
3. **Mermaid pipeline**: detect `mermaid` code blocks → render with mermaid-cli → display as halfblock image.
4. **Mermaid fallback**: if mermaid-cli not installed, show diagram source in styled code block with "install @mermaid-js/mermaid-cli" hint (same pattern as ffplay fallback).
5. **Inline math**: `$x^2$` → `x²` (inline Unicode). Display math `$$...$$` → centered block.

### Open Questions
- Which Unicode math library to use? (texmath, custom mapping, or a lightweight converter)
- Mermaid-cli is heavy (~200MB). Is it acceptable as an optional dependency?
- Should mermaid rendering be cached (same diagram = same image)?

Plan: `docs/plans/2026-03-07-feat-math-mermaid-plan.md` (status: draft)

---

## Dependencies Between Features

```
Selection & Copy ──→ DONE
Video V2 ──────────→ DONE
Search ────────────→ next up (benefits from Selection's selectable verification)
TOC ───────────────→ after Search (benefits from scroll-to-element pattern)
Math/Mermaid ──────→ independent (extends pipeline)
```

No hard dependencies — features can be built in any order. Recommended order follows priority table above.
