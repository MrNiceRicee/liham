---
title: "Print Preview: TTY Detection Crash & Test Renderer Clipping"
date: 2026-03-10
category: runtime-errors
tags: [tty-detection, test-renderer, stdin-pipe, height-estimation, print-mode, opentui]
component: src/cli/print.tsx, src/cli/index.ts
severity: high
features_since_last_compound:
  - Video Pipeline V2 (ring buffer architecture)
  - Search + TOC + FloatingPanel
  - Math (LaTeX → Unicode) + Mermaid (ASCII art)
  - Distribution (npm publish v1.1.0)
  - Print Preview Mode (--print, --plain, stdin)
---

# Print Preview: TTY Detection Crash & Test Renderer Clipping

Two runtime bugs discovered during print preview mode implementation. Both surfaced during manual testing, not caught by unit tests — they depend on terminal I/O state that tests can't easily simulate.

---

## Bug 1: Stdin Pipe Detection Crash

### Symptom

```
$ cat README.md | bun dev
TypeError: stdin.setRawMode is not a function
  at queryTerminal (src/media/detect.ts:206:9)
```

### Root Cause

Print mode detection only checked `!process.stdout.isTTY`. When stdin is piped but stdout is still a TTY (`cat file | liham`), print mode didn't trigger. Normal interactive mode loaded, calling `detectCapabilities()` → `stdin.setRawMode()` on a non-TTY stdin.

**The four TTY combinations:**

| stdin | stdout | expected behavior |
|-------|--------|-------------------|
| TTY   | TTY    | interactive mode  |
| TTY   | pipe   | print mode (piped output) |
| pipe  | TTY    | print mode (piped input) |
| pipe  | pipe   | print mode, plain |

Only the first two were handled. The third combination crashed.

### Fix

```typescript
// src/cli/index.ts — resolvePrintMode()
const stdinPiped = !process.stdin.isTTY && positional == null
const isPrint = (values.print ?? false) || plain || !process.stdout.isTTY || stdinPiped
```

### Prevention

When adding TTY-dependent modes, enumerate all stdin/stdout combinations as a truth table before writing conditionals. Each file descriptor is an independent axis — humans think about one scenario at a time, but the code must handle the full cross-product.

---

## Bug 2: Test Renderer Height Clipping

### Symptom

Print output truncated partway through long documents. Tables, code blocks, and content with borders/padding disappeared.

### Root Cause

OpenTUI's test renderer allocates a fixed grid (`width × height`). Content beyond that height is silently clipped. The original calculation:

```typescript
const height = Math.max(50, Math.ceil(chunk.estimatedHeight * 1.1))
```

`estimateHeight()` underestimates elements with visual chrome — table borders add top/bottom/separator rows, code blocks add border + padding rows, blockquotes add margins. A 10% buffer wasn't nearly enough.

### Fix

```typescript
// src/cli/print.tsx — renderChunk()
const height = Math.max(200, chunk.estimatedHeight * 3)
```

Safe because `spansToAnsi()` and `trimTrailing()` strip trailing empty rows — oversizing the buffer costs nothing in output.

### Prevention

Treat off-screen test renderers as capture buffers, not display viewports. Always oversize generously (2-3x), then trim. The cost of underallocation is silent data loss with no error. The cost of overallocation is zero (trimming is cheap).

---

## Broader Learnings (since 2026-03-07)

### Video Pipeline V2 — Ring Buffer Architecture

- **Deferred promise backpressure** works well for producer/consumer with ffmpeg stdout → ring buffer → React render loop
- **Two independent clocks** (JS setTimeout vs ffplay) cause AV sync drift — mpv IPC is the real fix
- **Probe caching:** split useEffect into probe effect + stream effect to avoid re-probing on seek/resume
- **Audio management:** kill+restart ffplay on resume/seek (no SIGSTOP/SIGCONT — unreliable with Bun)

### Search + TOC + FloatingPanel

- **Shared primitives pay off:** `FloatingPanel`, `handleTextInputKey()`, `splitHighlightSegments()` are reused by browser filter, search, and TOC
- **Key routing priority matters:** search-input > search-active > toc > modal > media-focus > normal. One wrong ordering breaks an entire interaction mode
- **Extract sub-reducers early:** `state-search.ts`, `state-toc.ts`, `state-legend.ts` keep the main reducer under sonarjs complexity limits
- **Discriminated union state:** `SearchState` (`input` | `active`) and `TocState` (`open` | `jumping`) prevent impossible state combinations

### Math + Mermaid — Compile-Time Processing

- **Do heavy work at compile time, not render time:** `unicodeit.replace()` and `renderMermaidASCII()` run in the rehype-ir pipeline, storing results in IR node `data`. React components just read pre-computed values — zero render-time cost
- **Custom IR nodes via `CustomNodeDataMap`:** conditional type gives type-safe `data` access without `as` casts
- **`sanitizeForTerminal()`** is critical for both — LaTeX and mermaid output can contain control characters

### Print Preview Mode — Test Renderer as Static Renderer

- **OpenTUI's test renderer doubles as a static renderer:** `testRender()` → `renderOnce()` → `captureSpans()`/`captureCharFrame()` works perfectly for non-interactive output
- **Context providers required:** components expect `ImageContext` even in test renderer. Without it, hooks fail or hit early-return paths that violate React hook rules
- **React warnings expected:** key prop and `act()` warnings fire in test renderer — suppress them in non-interactive mode
- **`renderer.destroy()` before `process.exit()`:** institutional learning — `process.exit()` bypasses React cleanup
- **SIGPIPE + EPIPE belt-and-suspenders:** Bun has inconsistencies between `console.log` and `process.stdout.write` for broken pipes
- **Chunked streaming:** split IR children into ~500-line groups, render each in fresh test renderer, write to stdout, destroy. Constant ~3MB memory regardless of document size

### Distribution + npm Publish

- **`@mrnicericee/liham`** scoped package on npm
- **`bunx @mrnicericee/liham README.md`** just works as a one-liner
- **Bin entry in package.json** points to `src/cli/index.ts` — Bun runs TypeScript directly

### General Patterns Reinforced

- **`Extract<Union, { discriminant: value }>` as function param type** — stays in sync with the union automatically, no separate interface to drift
- **sonarjs cognitive-complexity limit of 15** — forces extraction of helpers, which improves readability
- **Biome import sorting** — enforced across the codebase, prevents import order drift
- **`exactOptionalPropertyTypes: true`** — catches `undefined` vs missing property bugs early, requires explicit `| undefined` in union types

---

## Related Documentation

- Prior learning: `docs/learnings/2026-03-07-media-modal-and-selection-institutional-knowledge.md`
