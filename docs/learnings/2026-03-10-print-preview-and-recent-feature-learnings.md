# Learnings: Print Preview Mode & Recent Features

**Date:** 2026-03-10
**Covers:** Video V2, Search/TOC, Math/Mermaid, Distribution, Print Preview

---

## TTY Detection — Enumerate All Combinations

When adding behavior that depends on TTY state, write the truth table first.

Print mode only checked `!process.stdout.isTTY`. When stdin was piped but stdout was still a TTY (`cat README.md | liham`), print mode didn't trigger. Normal mode loaded and called `stdin.setRawMode()` on a non-TTY stdin — crash.

| stdin | stdout | expected mode |
|-------|--------|---------------|
| TTY   | TTY    | interactive   |
| TTY   | pipe   | print (piped output) |
| pipe  | TTY    | print (piped input) |
| pipe  | pipe   | print, plain  |

Fix: `stdinPiped = !process.stdin.isTTY && positional == null` added to print mode detection.

**Applies when:** any mode depends on file descriptor state, environment detection, or multiple independent boolean signals.

---

## Test Renderer Buffer — Oversize Then Trim

OpenTUI's test renderer allocates a fixed grid. Content beyond that height is silently clipped — no error, no warning, just missing output.

`estimateHeight()` underestimates elements with visual chrome (table borders, code block padding, separator rows). A 1.1x multiplier caused truncated output.

Fix: `Math.max(200, estimatedHeight * 3)`. Safe because `spansToAnsi()` and `trimTrailing()` strip trailing empty rows — oversizing costs nothing in output.

**Rule:** when rendering into a fixed buffer for capture, always oversize generously. The trim step is cheap; silent data loss from underallocation has no error signal.

---

## Test Renderer as Static Renderer

OpenTUI's `@opentui/react/test-utils` doubles as a non-interactive static renderer:

```
testRender(jsx, { width, height })
  → renderOnce()
  → captureSpans() for styled ANSI
  → captureCharFrame() for plain text
  → renderer.destroy()
```

Gotchas discovered:
- **Context providers required** — components expect `ImageContext` even in test renderer. Without it, hooks hit early-return paths that violate React hook rules.
- **React warnings expected** — key prop and `act()` warnings fire. Suppress them with a `console.error` filter in non-interactive mode.
- **`renderer.destroy()` before `process.exit()`** — `process.exit()` bypasses React cleanup.

---

## Chunked Streaming for Constant Memory

Split IR children into ~500-line groups, render each in a fresh test renderer, write to stdout, destroy. Memory stays at ~3MB per chunk regardless of document size.

Key constraint: never split a block-level node (tables, lists, code blocks stay whole). A chunk boundary always falls between top-level blocks.

---

## SIGPIPE + EPIPE Belt-and-Suspenders

Both handlers needed for piped output (`liham README.md | head -5`):

```typescript
process.on('SIGPIPE', () => process.exit(0))

// and in the write loop:
try { process.stdout.write(output) }
catch (err) { if (err.code === 'EPIPE') process.exit(0) }
```

Bun has inconsistencies between `console.log` and `process.stdout.write` for broken pipes. Handle both paths.

---

## Compile-Time Processing > Render-Time Processing

Math and mermaid rendering runs in the rehype-ir pipeline (compile time), not during React render:

- `unicodeit.replace()` converts LaTeX → Unicode, stored in `node.data.unicode`
- `renderMermaidASCII()` with truecolor output, stored in `node.data.rendered`

React components just read pre-computed values — zero render-time cost. Both sanitize output via `sanitizeForTerminal()` to strip control characters.

**Rule:** if processing doesn't depend on viewport or user state, do it at compile time.

---

## Shared Primitives Across Features

Several utilities built for one feature became shared infrastructure:

- `FloatingPanel` — reused by gallery, TOC, future command palette
- `handleTextInputKey()` — shared by browser filter + search input
- `splitHighlightSegments()` — shared by browser filter + search highlighting
- `extractText()` — recursive IR text extraction for search, TOC, and print mode

**Rule:** when building the second consumer of a pattern, extract. Not before.

---

## Sub-Reducer Extraction

The main app reducer hit sonarjs cognitive-complexity limits. Extracting domain-specific sub-reducers kept each file under 15:

- `state-search.ts` — search state transitions
- `state-toc.ts` — TOC state transitions
- `state-legend.ts` — legend entry computation
- `state-media-modal.ts` — media modal lifecycle

Each sub-reducer owns a discriminated union state type (`SearchState`, `TocState`), making impossible states unrepresentable.

---

## Key Routing Priority

Interactive key handling requires strict priority ordering:

```
search-input > search-active > toc > modal > media-focus > normal
```

One wrong ordering breaks an entire interaction mode. Extract the dispatch function (`viewer-dispatch.ts`) and test the priority chain explicitly.

---

## Video Pipeline — Ring Buffer with Backpressure

Producer (ffmpeg stdout) → ring buffer → consumer (React timer-driven render):

- Ring buffer is pre-allocated, circular, with deferred promise backpressure
- Consumer uses epoch-anchored timer (Pattern B) for constant frame intervals
- Audio via ffplay: kill+restart on resume/seek (SIGSTOP/SIGCONT unreliable with Bun)
- Known limitation: two independent clocks (JS setTimeout vs ffplay) cause AV sync drift

---

## TypeScript Patterns Reinforced

- **`Extract<Union, { discriminant: value }>` as function param** — stays in sync with the union, no separate interface to drift
- **`exactOptionalPropertyTypes: true`** — catches `undefined` vs missing property bugs early
- **`isCustomNode<T>()` type guard** — narrows `CustomNode<string>` to specific variants without `as` casts
- **Biome import sorting enforced** — prevents import order drift across the codebase
