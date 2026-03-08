---
title: "Next Features Roadmap"
type: brainstorm
date: 2026-03-07
origin: conversation
---

# Next Features Roadmap

## What We're Building

Five features to bring liham from a media-capable previewer to a complete terminal markdown tool. Ordered by priority and dependencies.

## Priority Order

| # | Feature | Priority | Effort | Dependencies |
|---|---------|----------|--------|-------------|
| 1 | Selection & Copy | MUST | Small | None |
| 2 | Video V2 (progress, seek, pause) | High | Medium | None |
| 3 | Search | High | Medium | None (but benefits from Selection infra) |
| 4 | Bookmarks/TOC | Medium | Medium | None |
| 5 | Math/Mermaid | Medium | Large | remark-math, unicode mapping |

---

## 1. Selection & Copy (MUST)

### What
Mouse drag to highlight text in preview/source panes, `y` to copy to system clipboard via OSC 52.

### Why This Approach
- **Deliberate copy only** — no auto-copy on mouse-up. User explicitly presses `y` (yank) after selecting. Avoids accidental clipboard overwrites.
- **OpenTUI has full selection infrastructure** — `Selection` class, `renderer.on('selection')` event, `getSelectedText()`, `copyToClipboardOSC52()`, `selectable` prop. Just needs wiring.
- **Minimal scope** — ~2-3 files changed. Wire selection event in `app.tsx`, add `y` key binding.

### Key Decisions
1. **Copy trigger**: `y` (vim-style yank). Not `Ctrl+C` — liham has `exitOnCtrlC: true` and changing that would break expected terminal behavior.
2. **Selection visual**: OpenTUI handles highlight rendering natively via the Selection class.
3. **Empty guard**: never copy empty/whitespace-only text to clipboard.
4. **OSC 52 fallback**: if terminal doesn't support OSC 52, fail silently (fire-and-forget).
5. **Pane scope**: selection works within a single scrollbox pane (no cross-pane drag).
6. **`selectable` default**: verified `true` on `TextBufferRenderable` — no explicit prop needed on `<text>` elements.

### Implementation Sketch
- `y` key binding in viewer mode: check `renderer.hasSelection`, call `copyToClipboardOSC52(sel.getSelectedText())`
- `Esc` clears active selection (added to the existing Esc priority chain: selection > modal > focus > browser > quit)
- Selection highlighting is built-in — OpenTUI renders it natively on mouse drag
- May need `useEffect` subscribing to `renderer.on('selection')` for state tracking (e.g., legend update)

### Resolved Questions
- **`selectable` default**: YES, defaults to `true` on `TextBufferRenderable`. No explicit prop needed.
- **`Ctrl+C` interference**: YES, `exitOnCtrlC: true` in boot config. Using `y` for copy instead — no conflict.
- **Cmd+C on macOS**: handled by the terminal emulator itself (never reaches the app). Liham doesn't need to intercept it.

---

## 2. Video V2 — Progress, Seek, Pause

### What
Full video playback controls: progress bar with elapsed/total time, left/right arrow seeking, space bar pause/resume.

### Why This Approach
- **Full controls** — progress bar + seek + pause. Users expect these from any video player.
- **Seek via ffmpeg restart** — ffmpeg's pipe output doesn't support seeking. Restart the process with `-ss` offset. Same pattern as replay (restartCount), but with a start offset.
- **Progress tracking** — count frames in the read loop, multiply by frame duration for elapsed time. Duration already available from ffprobe metadata.

### Key Decisions
1. **Progress bar**: text-based in the gallery info bar. Format: `▓▓▓▓▓░░░░░ 1:23 / 3:45`
2. **Seek**: left/right arrows seek ±5s (or ±10s with shift). Restart ffmpeg with `-ss` offset. Kill audio and restart at same offset.
3. **Pause**: space bar sends `SIGSTOP` to ffmpeg process, `SIGCONT` to resume. Audio pause via `SIGSTOP`/`SIGCONT` on ffplay process.
4. **Frame counter**: track frame count in read loop, derive elapsed = `frameCount / fps`.
5. **Seek state**: add `seekOffset: number` to modal state (seconds). Include in useEffect deps to trigger restart.

### Resolved Questions
- **SIGSTOP/SIGCONT**: YES, `Bun.spawn` accepts `NodeJS.Signals` including `SIGSTOP`/`SIGCONT`. `proc.kill('SIGSTOP')` works.

### Open Questions
- Audio sync after seek — restarting both ffmpeg and ffplay at the same offset should stay in sync, but drift over time is possible.
- VFR (variable frame rate) videos — frame counting assumes constant fps. May need pts-based timing from ffmpeg output.

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

---

## 4. Bookmarks / TOC

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

---

## Dependencies Between Features

```
Selection & Copy ──→ (none, ship first)
                        │
Video V2 ──────────→ (none, independent)
                        │
Search ────────────→ (benefits from Selection's selectable verification,
                      but no hard dependency)
                        │
TOC ───────────────→ (benefits from Search's scroll-to-element pattern,
                      but no hard dependency)
                        │
Math/Mermaid ──────→ (extends pipeline, independent of UI features)
```

No hard dependencies — features can be built in any order. Recommended order follows priority table above.

## Implementation Timeline

1. **Selection & Copy** — small scope, ship on this branch or next
2. **Video V2** — medium scope, own branch
3. **Search** — medium scope, own branch
4. **TOC** — medium scope, own branch (can parallel with Search)
5. **Math/Mermaid** — large scope, own branch, lower priority
