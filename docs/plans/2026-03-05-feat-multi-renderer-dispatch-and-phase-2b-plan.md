---
title: "feat: Multi-Renderer Dispatch + Phase 2b Completion"
type: feat
status: active
date: 2026-03-05
deepened: 2026-03-05
origin: docs/brainstorms/2026-03-05-multi-renderer-support-brainstorm.md
---

# Multi-Renderer Dispatch + Phase 2b Completion

## Enhancement Summary

**Deepened on:** 2026-03-05
**Research agents used:** TypeScript reviewer, architecture strategist, security sentinel, performance oracle, pattern recognition, code simplicity, best practices researcher, OpenTUI skill

### Key Improvements
1. Slimmed Phase A — no separate registry.ts or args.ts; inline parseArgs in CLI entry, direct static import for one renderer
2. Security: C1 control char stripping (`\x80-\x9f`), URL sanitization at IR compilation level, OSC 8 injection prevention
3. Performance: parallelize OSC 11 detection with file read, table column widths in renderer (not IR), static imports
4. Architecture: `RendererBootFn` accepts context object (ir + theme), theme detect moves to `src/theme/detect.ts`, remove `darkTheme` default from processor

### New Considerations Discovered
- OpenTUI signal handling is automatic — remove manual SIGINT/SIGTERM handlers
- `renderer.destroy()` handles exit — never call `process.exit()` directly
- `renderer.themeMode` returns dark/light/null — potential alternative to OSC 11 for theme detection
- OSC 8 terminal blocklist needed (TERM=dumb, linux, Apple_Terminal)
- C1 controls (`\x9b` CSI, `\x9c` ST, `\x9d` OSC) not stripped by current sanitizer — security gap

## Overview

Lay the renderer-agnostic foundation for liham: CLI entry point with `--renderer` flag, per-renderer boot functions, and entry point restructuring. Then complete remaining Phase 2b items (tables, images, links, light theme, theme detection) in the new IR architecture — all designed to be renderer-agnostic from the start, with OpenTUI as the working implementation.

## Problem Statement / Motivation

Phase 2c established the IR layer (`markdown → hast → IR → renderer`), cleanly decoupling parsing from rendering. But the entry point (`src/index.tsx`) is still hardwired to OpenTUI's lifecycle. Before adding more features, we need the dispatch structure so that:

1. Every new IR node and renderer component is built with multi-renderer awareness
2. Adding Ink or Rezi later is just a new `src/renderer/<name>/` directory — no entry point surgery
3. The `bin.liham` declared in `package.json` actually works (`src/cli/index.ts` doesn't exist yet)

Phase 2b items (tables, images, links, themes) are also outstanding. These should be implemented in the renderer-agnostic pattern from day one.

## Proposed Solution

### Architectural Decisions

All decisions below stem from the brainstorm (see brainstorm: `docs/brainstorms/2026-03-05-multi-renderer-support-brainstorm.md`).

1. **CLI flag for renderer selection**: `--renderer opentui` (default). No config files.
2. **Each renderer owns its boot function**: no shared lifecycle abstraction. OpenTUI uses `createCliRenderer` + `createRoot`, Ink will use `render()`, Rezi will use `createNodeApp()`. These are too different to abstract cleanly.
3. **Delete `src/renderer/types.ts`**: the current `Renderer` interface is imported nowhere and too narrow for non-React renderers. Each renderer exports a typed `boot()` function. The `RendererBootFn` type lives in `src/cli/index.ts` where it's consumed — no shared types file needed for one type.
4. **Only implement OpenTUI now**: Ink and Rezi come after Phase 2b features are solid. The dispatch structure is the deliverable — not multiple renderers.

### Resolved Design Questions

| Question | Decision | Rationale |
|----------|----------|-----------|
| CLI parsing | `parseArgs` from `node:util` with `as const` | built-in, no new dependency, works in Bun. `as const` gives narrow TS types. |
| Entry point | `src/cli/index.ts` (matches `package.json` bin) | `src/index.tsx` becomes internal; CLI is the public surface |
| Renderer dispatch | direct static import (no registry) | only one renderer — a registry is premature. Add when renderer #2 arrives. |
| Separate `args.ts` | no — inline in `cli/index.ts` | ~15 lines of parseArgs doesn't warrant its own module |
| `RendererBootFn` signature | `(ctx: { ir: IRNode; theme: ThemeTokens }) => Promise<void>` | renderers need theme for their app shell; don't force ambient state |
| `ImageNode.url` | add `url?: string` field | one-way door — discarding src URL blocks future Kitty/iTerm2 support |
| Table alignment | per-column array on `TableNode` | matches GFM spec (alignment is per-column, not per-cell) |
| Table column widths | renderer concern, not IR | renderer knows terminal width, padding, border size. Use `string-width` for measurement. |
| OSC 8 URL schemes | allowlist: `http:`, `https:`, `mailto:` | reject `javascript:`, `data:`, `file:`, etc. |
| OSC 8 terminal compat | blocklist: `TERM=dumb`, `linux`, `TERM_PROGRAM=Apple_Terminal` | graceful degradation — show text without hyperlink escape |
| OSC 11 timeout | 50ms (parallelize with file read), fallback to dark | bat uses 20ms; 50ms gives wider terminal compat while parallelized I/O hides it |
| Theme detection location | `src/theme/detect.ts` (not `src/terminal/`) | theme detection is a theme concern — lives with themes it selects between |
| Theme flag | `--theme auto\|dark\|light` (default: `auto`) | manual override for terminals that don't respond to OSC 11 |
| Non-TTY stdout | error with message suggesting future `--format` flag | alt-screen with piped stdout produces garbage |
| Processor theme default | remove `darkTheme` default from `processMarkdown()` | CLI layer owns theme selection — processor should require it |
| App.tsx placement | move to `src/renderer/opentui/app.tsx` (kebab-case) | OpenTUI-specific (uses `useKeyboard`, `useRenderer`). Rename from PascalCase to match project convention. |
| Signal handlers | OpenTUI handles SIGINT/SIGTERM/SIGHUP automatically | remove manual `process.on` handlers. Use `renderer.destroy()` for cleanup, never `process.exit()`. |

## Implementation Phases

### Phase A: CLI Entry Point + Renderer Dispatch

Restructure the entry point and wire up the dispatch pattern. No new features — just reorganization.

**New files:**

- `src/cli/index.ts` — CLI entry point: parseArgs, validate, dispatch to boot

**Modified files:**

- `src/renderer/opentui/boot.tsx` — extracted from current `src/index.tsx` (OpenTUI lifecycle)
- `src/app/App.tsx` → `src/renderer/opentui/app.tsx` (move + rename to kebab-case)
- `src/pipeline/processor.ts` — remove `darkTheme` default parameter, make theme required
- `package.json` — verify `bin.liham` points to `src/cli/index.ts`

**Deleted files:**

- `src/renderer/types.ts` — unused `Renderer` interface, imported nowhere
- `src/index.tsx` — replaced by `src/cli/index.ts`
- `src/app/` directory — empty after move

**`src/cli/index.ts` shape:**

```typescript
import { parseArgs } from 'node:util'

// renderer name union — add entries as renderers are implemented
type RendererName = 'opentui'
const VALID_RENDERERS: RendererName[] = ['opentui']

const options = {
  renderer: { type: 'string' as const, default: 'opentui' },
  theme: { type: 'string' as const, default: 'auto' },
  help: { type: 'boolean' as const, short: 'h' },
} as const

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options,
  allowPositionals: true,
  strict: true,
})

// validate renderer name against union immediately
function isRendererName(v: string): v is RendererName {
  return (VALID_RENDERERS as string[]).includes(v)
}
```

**`src/cli/index.ts` flow:**

```
1. parse args (--renderer, --theme, --help, positional file path)
2. validate: file exists, renderer name is known, stdout is TTY
3. parallelize: [readFile(path), detectTheme()] via Promise.all
4. run pipeline: processMarkdown(markdown, theme) — theme is required, no default
5. dispatch: static import of boot from renderer/opentui/boot.tsx
   (switch on renderer name — one case now, add cases for ink/rezi later)
```

### Research Insights — Phase A

**parseArgs type narrowing (TypeScript reviewer):**
- Use `as const` on the entire options object to get literal type inference
- Options with `default` are typed as guaranteed-present (no `undefined`)
- Options without `default` are typed as optional — with `exactOptionalPropertyTypes`, must check existence before use
- Validate `renderer` against `RendererName` union immediately after parsing; use a type guard

**Boot function signature (TypeScript + architecture reviewers):**
- `RendererBootFn` should accept a context object, not just IR: `(ctx: { ir: IRNode; theme: ThemeTokens }) => Promise<void>`
- Don't force renderers to reach into ambient state for theme
- The async return accommodates renderers with async setup

**OpenTUI boot specifics (OpenTUI skill):**
- `renderer.destroy()` handles cleanup AND exit — never call `process.exit()` directly
- OpenTUI automatically handles SIGINT, SIGTERM, SIGQUIT, SIGHUP, SIGBREAK, SIGPIPE, SIGBUS, SIGFPE
- Remove the manual `process.on('SIGINT')` and `process.on('SIGTERM')` handlers from current `src/index.tsx`
- With `exitOnCtrlC: false`, only need `useKeyboard` handler for `q`/`escape` calling `renderer.destroy()`
- `renderer.themeMode` returns `'dark' | 'light' | null` — could supplement OSC 11 detection

**Simplicity check (simplicity reviewer):**
- No separate `registry.ts` — one renderer doesn't need a registry. A `switch` statement is simpler.
- No separate `args.ts` — ~15 lines of parseArgs inline in the entry point is fine.
- Boot extraction IS worth doing — it separates framework lifecycle from CLI orchestration.
- Add the registry pattern only when renderer #2 is actually being built.

**Architecture (architecture strategist):**
- Reserve `--theme` in Phase A even though only `dark` works initially — prevents Phase D from modifying arg surface
- Remove the `darkTheme` default from `processMarkdown()` — CLI layer is the single owner of theme selection
- The `content: ReactNode` prop pattern in App should be preserved — keep App as a pure layout shell, never let it accept IR directly

**Acceptance criteria:**
- [x] `liham file.md` works exactly as before (default renderer = opentui)
- [x] `liham --renderer opentui file.md` works
- [x] `liham --renderer unknown file.md` errors with available renderer list
- [x] `liham --help` prints usage
- [x] `liham` (no args) prints usage
- [x] `src/cli/index.ts` is the actual entry point matching `package.json` bin
- [x] `src/renderer/types.ts` deleted (unused interface)
- [x] `src/app/App.tsx` moved to `src/renderer/opentui/app.tsx`
- [ ] `processMarkdown()` requires theme parameter (no default)
- [x] No manual signal handlers — OpenTUI handles them
- [x] No `process.exit()` calls — use `renderer.destroy()`
- [x] Existing tests still pass (49 tests, 167 assertions)

---

### Phase B: Table Support (IR + Compiler + OpenTUI Renderer)

Add GFM table rendering end-to-end.

**New IR types in `src/ir/types.ts`:**

```typescript
interface TableNode {
  type: 'table'
  alignments: ('left' | 'center' | 'right' | null)[]
  style: BlockStyle
  children: IRNode[] // TableRowNode[]
}

interface TableRowNode {
  type: 'tableRow'
  isHeader: boolean
  style: BlockStyle
  children: IRNode[] // TableCellNode[]
}

interface TableCellNode {
  type: 'tableCell'
  style: BlockStyle
  children: IRNode[]
}
```

Add to `CoreIRNode` union. Add `'table'`, `'tableRow'`, `'tableCell'` to `BLOCK_TYPES`.

**New/modified files:**

- `src/ir/types.ts` — add 3 node types + update union + block set
- `src/pipeline/rehype-ir.ts` — add `compileTable`, `compileTableRow`, `compileTableCell` to `BLOCK_COMPILERS`
- `src/renderer/opentui/table.tsx` — new: renders table with box borders
- `src/renderer/opentui/index.tsx` — add table/tableRow/tableCell cases to switch
- `src/pipeline/rehype-ir.test.ts` — IR-level tests for table compilation
- `src/pipeline/processor.test.ts` — integration tests with GFM table markdown

**Design notes:**
- Column width calculation is a renderer concern — not in IR
- GFM alignment stored as column array on `TableNode` (from hast `align` property)
- Filter whitespace-only text children in table elements (hast artifact)
- OpenTUI renderer: use `<box>` with borders for table structure
- Keep child types as `IRNode[]` for consistency with ListNode/ListItemNode — validate structure in compiler

### Research Insights — Phase B

**Table IR design (TypeScript reviewer):**
- Nesting constraints (TableNode → TableRowNode → TableCellNode) are invisible at the type level since `children: IRNode[]`. This is acceptable — validate in the compiler (same approach as ListNode/ListItemNode).
- Store alignment on `TableNode` as a column array, not per-cell. Reduces duplication and inconsistency risk.
- `isHeader: boolean` on TableRowNode is simpler than a separate `TableHeaderRowNode` discriminant. Acceptable since rendering logic is identical except for styling.

**Column width calculation (performance oracle):**
- **Two-pass measure-then-render**: (1) walk all cells to find max content width per column, (2) render with those widths. First pass is O(rows × cols) — trivially fast.
- Use `string-width` npm package for accurate measurement (handles East Asian wide chars, emoji, zero-width joiners). `.length` is wrong for terminal column widths.
- Cap displayed rows at ~100 with a "... N more rows" indicator for pathologically large tables.
- Start with equal-width columns as v1, refine to measured widths.

**OpenTUI table rendering (OpenTUI skill):**
- No built-in table component — build from `<box>` + `<text>` primitives
- Use `flexDirection="row"` for rows, fixed `width` on cells for column alignment
- `borderStyle: 'single'` for table borders, `borderBottom` for header separator
- Percentage widths require parent to have explicit size
- `gap` prop for cell spacing

**Renderer-agnostic verification (architecture strategist):**
- Ink has no built-in table — would need `ink-table` or custom box layout. IR stores data, not layout — correct approach.
- Rezi has a `Table` component with its own column model. IR stores raw cells; Rezi renderer would map to its native Table.
- The IR shape (rows → cells → inline content) is framework-neutral.

**Acceptance criteria:**
- [x] GFM tables render with visible borders and header separation
- [x] Column alignment (left/center/right) is respected
- [x] Tables with inline formatting (bold, code, links) in cells work
- [x] Empty cells render correctly
- [x] IR tests validate table node structure
- [x] Large tables (>100 rows) show overflow indicator

---

### Phase C: Link + Image + Thematic Break Polish + Sanitizer Hardening

Complete the remaining inline/block elements. Harden sanitization.

**Sanitizer hardening (SECURITY — do first):**

- `src/pipeline/sanitize.ts` — extend regex to strip C1 controls (`\x80-\x9f`):
  ```typescript
  // BEFORE (only C0):
  const CONTROL_CHARS = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g
  // AFTER (C0 + C1):
  const CONTROL_CHARS = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g
  ```
  - `\x9b` (CSI) can inject cursor movement/screen clearing
  - `\x9c` (ST) can terminate OSC sequences prematurely
  - `\x9d` (OSC) can start operating system commands
  - Add test cases for C1 control characters

**Link — OSC 8 hyperlinks:**

- `src/pipeline/sanitize-url.ts` — new module:
  - Scheme allowlist: `http:`, `https:`, `mailto:` only
  - Strip ALL bytes in `\x00-\x1f` and `\x7f-\x9f` (C0 + C1 control chars)
  - After percent-decoding, re-check for control chars (prevents `%1b%5d` bypass)
  - Validate with `URL` constructor after sanitization — reject malformed URLs
  - Max 2048 characters
  - Return empty string on rejection

- `src/pipeline/rehype-ir.ts` — call `sanitizeUrl()` in `compileAnchor()` at IR compilation time (all renderers benefit)

- `src/renderer/opentui/inline.tsx` — update link case:
  - Use `<a href={url}>` (test if OpenTUI emits OSC 8 natively)
  - If not: emit raw `\x1b]8;;URL\x1b\\text\x1b]8;;\x1b\\` via helper
  - Blocklist terminals: skip OSC 8 if `TERM=dumb`, `TERM=linux`, `TERM_PROGRAM=Apple_Terminal`
  - Prefer ST (`\x1b\\`) over BEL (`\x07`) as string terminator

**Image — preserve URL + placeholder:**

- `src/ir/types.ts` — add `url?: string` to `ImageNode`
- `src/pipeline/rehype-ir.ts` — read `src` attribute, apply `sanitizeUrl()` to image URLs too
- `src/renderer/opentui/inline.tsx` — render as `[image: alt-text]` placeholder (dimmed text)

**Thematic break — full-width line:**

- `src/renderer/opentui/thematic-break.tsx` — render full-width horizontal line using repeated char

### Research Insights — Phase C

**OSC 8 escape injection (security sentinel — HIGH):**
- If a URL contains BEL (`\x07`) or ST (`\x9c`/`\x1b\\`), it prematurely terminates the OSC 8 sequence. Everything after is interpreted as raw terminal input.
- Attack scenario: `http://evil.com\x07\x1b]52;c;BASE64\x07` — closes OSC 8, injects clipboard write
- The URL sanitizer MUST strip all C0+C1 control chars AND validate with `URL` constructor
- Apply `sanitizeUrl()` at IR compilation level — not renderer level — so all renderers get the protection

**OSC 8 best practices (best practices researcher):**
- Format: `\x1b]8;params;URI\x1b\\` visible text `\x1b]8;;\x1b\\`
- Omit `id=` parameter for simple utilities (terminals auto-group by URI)
- Prefer ST (`\x1b\\`) over BEL (`\x07`) as terminator
- No way to detect terminal support — assume support, blocklist known-bad terminals
- GCC blocklist: `TERM=dumb`, `TERM=linux`, `TERM_PROGRAM=Apple_Terminal`
- Broad support: Alacritty 0.11+, Ghostty, iTerm2 3.1+, Kitty 0.19+, WezTerm, Windows Terminal 1.4+, all VTE-based terminals

**Image URL sanitization (security sentinel):**
- Apply same allowlist to `ImageNode.url` — prevents future Kitty graphics from fetching `file://` or `javascript:` URLs
- When Kitty graphics lands (Phase 7), require `--allow-remote-images` flag for remote URL fetching

**rehype-highlight ReDoS risk (security sentinel — MEDIUM):**
- `detect: true` runs highlight.js auto-detection against every code block
- Complex grammar regexes can cause catastrophic backtracking
- The 5-second pipeline timeout uses `Promise.race` but a synchronous regex hang blocks the event loop
- Consider: restrict grammar subset or disable auto-detection for untrusted input

**Acceptance criteria:**
- [ ] C1 control characters (`\x80-\x9f`) stripped from all text content
- [ ] Links render with underline + color, clickable via OSC 8 in supported terminals
- [ ] `javascript:`, `data:`, `file:` URLs stripped; percent-encoded control chars caught
- [ ] URL sanitization applied at IR compilation (in `compileAnchor` and image compiler)
- [ ] OSC 8 skipped for blocklisted terminals (TERM=dumb, linux, Apple_Terminal)
- [ ] Images render as `[image: alt-text]` placeholder
- [ ] `ImageNode` preserves sanitized source URL in IR
- [ ] Thematic breaks render as full-width lines
- [ ] Sanitizer tests cover C1 controls, OSC 8 injection payloads, percent-encoded bypasses

---

### Phase D: Light Theme + Theme Detection

**Light theme:**

- `src/theme/light.ts` — Tokyo Night Light palette (counterpart to dark theme's Tokyo Night)
- Mirror the structure of `src/theme/dark.ts` exactly

**Theme detection:**

- `src/theme/detect.ts` — new module: OSC 11 query → `'dark' | 'light' | null`
  - Skip query if `!process.stdout.isTTY`
  - Put terminal in raw mode (`process.stdin.setRawMode(true)`)
  - Write OSC 11 query: `\x1b]11;?\x1b\\`
  - Read response from stdin with **50ms timeout** and **max 256 byte buffer**
  - Parse with strictly anchored regex: `^\x1b\]11;rgb:([0-9a-f]{2,4})\/([0-9a-f]{2,4})\/([0-9a-f]{2,4})`
  - Compute relative luminance: `L = 0.2126*R + 0.7152*G + 0.0722*B`
  - Return `'dark'` if L < 0.5, `'light'` otherwise
  - Return `null` on timeout/failure (caller decides fallback)
  - Drain remaining stdin bytes after read
  - Restore terminal settings in `finally` block — guaranteed even on throw

- `src/cli/index.ts` — integrate:
  - Detection chain: `--theme` flag → `LIHAM_THEME` env var → OSC 11 (if TTY) → dark default
  - **Parallelize** detection with file read: `Promise.all([detectTheme(), readFile()])`
  - Resolve detected theme name to `ThemeTokens` object before passing to pipeline

### Research Insights — Phase D

**OSC 11 detection patterns (best practices researcher):**
- bat uses `terminal-colorsaurus` with similar approach; `terminal-light` crate uses 20ms timeout
- Detection chain (from bat): explicit flag → env var → OSC 11 → platform default
- `COLORFGBG` env var (set by some terminals like rxvt) can supplement OSC 11
- Zellij has reported incorrect color responses — timeout fallback is essential
- Linux console does NOT ignore unrecognized OSCs — can cause garbled output. Must check `TERM=linux` before querying.

**OSC 11 security (security sentinel — MEDIUM):**
- Malicious terminal response could include extra escape sequences
- Read fixed max buffer (256 bytes), discard anything beyond
- Use strictly anchored regex — prevent matching partial sequences
- On parse failure, return `null` silently — never propagate raw response

**Performance (performance oracle):**
- Parallelize OSC 11 detection with file read — saves up to 50ms cold start
- Don't re-render with default theme then switch — theme is baked into IR at compile time (style fields on every node). Double-render means double pipeline + visible color flash.
- 50ms timeout is acceptable when parallelized with file I/O

**renderer.themeMode (OpenTUI skill):**
- OpenTUI's `renderer.themeMode` returns `'dark' | 'light' | null` based on terminal settings
- `renderer.on('theme_mode', handler)` for live changes
- This could supplement or replace OSC 11 detection when using OpenTUI — but runs after renderer creation (alt-screen), so use OSC 11 for pre-boot detection and `themeMode` for live theme switching (Phase 5 territory)

**Theme detection return type (TypeScript reviewer):**
- Return `'dark' | 'light' | null` — make failure explicit
- CLI layer decides the fallback (dark), not the detection module
- Detection module has no dependency on theme types — pure utility

**Acceptance criteria:**
- [ ] `--theme dark` uses dark theme, `--theme light` uses light theme
- [ ] `--theme auto` (default) runs detection chain: flag → env → OSC 11 → dark
- [ ] `LIHAM_THEME=light` env var overrides auto-detection
- [ ] Auto-detection completes within 50ms even on non-responding terminals
- [ ] Detection skipped for `TERM=linux` and non-TTY stdout
- [ ] Light theme has good contrast on light terminal backgrounds (Tokyo Night Light)
- [ ] Theme detection runs before alt-screen (no OSC 11 timeout issue)
- [ ] Detection and file read happen in parallel (`Promise.all`)
- [ ] `src/theme/detect.ts` returns `null` on failure — caller picks default

## Technical Considerations

**Bundle impact:** `parseArgs` is built-in (`node:util`), no new dependencies. One new dev dependency: `string-width` for table column measurement.

**Testing strategy:**
- CLI arg parsing: unit tests inline with `src/cli/index.ts` or colocated `src/cli/index.test.ts`
- Table IR: unit tests in `rehype-ir.test.ts`, integration tests in `processor.test.ts`
- URL sanitization: unit tests for `src/pipeline/sanitize-url.ts` — include injection payloads, percent-encoded bypasses
- Sanitizer hardening: add C1 control character tests to existing `sanitize.test.ts`
- Theme detection: mock-friendly module boundary; test parsing logic separately from TTY I/O
- Tests colocated alongside source (existing convention)

**Renderer-agnostic verification:** Each new IR node type should be reviewed against Ink and Rezi's component models to ensure the IR shape doesn't accidentally couple to OpenTUI. Specifically:
- Table: Ink has no built-in table — would need `ink-table` or custom. Rezi has `Table` component. IR stores data, not layout — correct.
- Links: Ink uses `<Link>`, Rezi likely handles `<a>`. OSC 8 is terminal-level. URL sanitization at IR level protects all renderers.
- Images: All frameworks use the same placeholder pattern initially. URL preserved for future Kitty/iTerm2 support.

**Processor caching note (performance oracle):**
- `processMarkdown()` recreates the unified processor on every call
- For live reload (Phase 5), cache the processor instance keyed by theme identity
- Not needed now (one-shot CLI), but worth noting for the future

## Dependencies & Risks

| Risk | Mitigation | Source |
|------|------------|--------|
| OpenTUI `<a>` may not emit OSC 8 | test at runtime in supported terminal; fallback to raw escape sequences | OpenTUI skill |
| `parseArgs` quirks in Bun | test early; `as const` + `default` gives reliable TS types per Node.js v20+ docs | best practices |
| Table column width calculation | use `string-width` for accurate terminal width; start equal-width, refine to measured | performance oracle |
| OSC 11 unreliable across terminals | 50ms timeout + env var fallback + `--theme` flag override | best practices |
| C1 control char injection | extend sanitizer regex to `\x7f-\x9f` — one-line fix with high security impact | security sentinel |
| OSC 8 URL injection via BEL/ST | strip all C0+C1 from URLs, percent-decode-then-recheck, validate with `URL` constructor | security sentinel |
| rehype-highlight ReDoS | bounded by pipeline timeout; consider grammar subset if auto-detect causes issues | security sentinel |
| Large GFM tables (>100 rows) | cap rendered rows with overflow indicator; IR stores full data | performance oracle |

## Sources & References

- **Origin brainstorm:** [docs/brainstorms/2026-03-05-multi-renderer-support-brainstorm.md](docs/brainstorms/2026-03-05-multi-renderer-support-brainstorm.md) — CLI flag dispatch, per-renderer boot, OpenTUI-only for now
- **IR layer brainstorm:** [docs/brainstorms/2026-03-05-renderer-abstraction-ir-layer-brainstorm.md](docs/brainstorms/2026-03-05-renderer-abstraction-ir-layer-brainstorm.md) — pre-resolved styles, semantic inlines, custom handlers
- **Phase 2c plan (completed):** [docs/plans/2026-03-05-refactor-renderer-abstraction-ir-layer-plan.md](docs/plans/2026-03-05-refactor-renderer-abstraction-ir-layer-plan.md)
- **Main rewrite plan:** [docs/plans/2026-03-04-feat-liham-typescript-opentui-rewrite-plan.md](docs/plans/2026-03-04-feat-liham-typescript-opentui-rewrite-plan.md) — Phase 2b items (lines 403-437)
- **Terminal detection fix:** [docs/brainstorms/2026-03-04-slow-initial-load-brainstorm.md](docs/brainstorms/2026-03-04-slow-initial-load-brainstorm.md) — OSC 11 before alt-screen pattern
- **OSC 8 specification:** [egmontkob canonical gist](https://gist.github.com/egmontkob/eb114294efbcd5adb1944c9f3cb5feda)
- **Terminal OSC 8 support list:** [Alhadis/OSC8-Adoption](https://github.com/Alhadis/OSC8-Adoption)
- **Node.js parseArgs docs:** [nodejs.org/api/util](https://nodejs.org/api/util.html#utilparseargsconfig)
- **bat theme detection:** [sharkdp/bat issue #1746](https://github.com/sharkdp/bat/issues/1746)
