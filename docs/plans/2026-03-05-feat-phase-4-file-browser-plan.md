---
title: "feat: Phase 4 — File Browser with Fuzzy Filtering and Live Preview"
type: feat
status: completed
date: 2026-03-05
origin: docs/brainstorms/2026-03-05-phase-4-file-browser-brainstorm.md
---

# Phase 4: File Browser with Fuzzy Filtering and Live Preview

## Overview

Add an in-app file browser for selecting markdown files, with fzf-style fuzzy filtering, directory-grouped file list, live preview on cursor move, and shell tab completions for zsh/bash. This is the next major feature after Phase 3's split-pane app shell.

The browser reuses Phase 3's split pane foundation — the file list replaces the source pane, and the preview pane renders the highlighted file live. Mode transitions (browser ↔ preview) are managed by extending the existing `useReducer` state machine.

## Problem Statement / Motivation

Currently `liham` requires a file path argument. Without a file browser, users must know the exact path. The Go v1 had a basic browser (Bubbles list + substring filter). v2 improves on this with fzf-style scoring, directory grouping, and a live preview pane that leverages Phase 3's split layout.

## Proposed Solution

Six sub-phases, each independently shippable and testable:

| Sub-phase | Scope | Depends on |
|-----------|-------|------------|
| 4a | Directory scanner module | — |
| 4b | Fuzzy matcher module | — |
| 4c | State machine extensions | — |
| 4d | Browser pane component | 4a, 4b, 4c |
| 4e | App integration (boot, mode transitions, live preview) | 4d |
| 4f | Shell completions (zsh + bash) | — (independent) |

Phases 4a, 4b, 4c, and 4f are independent — can be implemented in any order or in parallel. Phase 4d requires 4a+4b+4c. Phase 4e requires 4d.

---

## Technical Approach

### Key Architectural Decisions

#### 1. Mode vs Layout Separation (see brainstorm)

`mode` governs **what** the app is doing. `layout` governs **how** panes are arranged. Phase 3 reserved `mode` for Phase 4.

```
mode: 'browser' | 'viewer'
layout: 'preview-only' | 'side' | 'top' | 'source-only'  (unchanged)
```

In browser mode, layout is restricted:
- `side` / `top` → file list + live preview (split)
- `preview-only` → file list only (full width, no preview)
- `source-only` → treated as `preview-only` in browser mode (no source to show)

Layout cycling (`l`) is **disabled** in browser mode. The `--layout` flag sets the initial layout for both modes.

#### 2. Key Routing: Mode-Aware Dispatch

The current `KEY_MAP` pattern breaks in browser mode because printable characters must go to the filter input, not action dispatch.

**Solution: Two-tier routing.**

```typescript
// in useKeyboard handler:
if (state.mode === 'browser') {
  return browserKeyHandler(key, state, dispatch)
}
// else: existing KEY_MAP / SHIFT_KEY_MAP dispatch
```

Browser key handler logic:
- **Ctrl+C** → quit
- **Esc** → clear filter if non-empty; quit if filter empty
- **Enter** → open selected file (dispatch OpenFile)
- **j / ↓** → cursor down
- **k / ↑** → cursor up
- **g** → cursor to first item
- **G** → cursor to last item
- **PgUp / PgDn** → page through list
- **Tab** → toggle focus between file list and preview pane (split mode only)
- **Backspace** → delete last char from filter
- **Ctrl+W** → delete last word from filter
- **Ctrl+U** → clear filter
- **All other printable chars** → append to filter (including `q`, `s`, `l`)

This means `q` does NOT quit from browser mode — only Ctrl+C or Esc-when-empty quits. This is the fzf convention and prevents filter/action conflicts.

#### 3. Esc Behavior Chain

| Mode | Filter state | From browser? | Esc behavior |
|------|-------------|---------------|-------------|
| browser | non-empty | — | clear filter |
| browser | empty | — | quit app |
| viewer | — | yes | return to browser |
| viewer | — | no (file arg) | quit app |

#### 4. Browser State Preservation

Browser state (filter, cursor, scroll, scan results) lives in the reducer — NOT in component-local state. This ensures it survives mode transitions (unmount/remount).

```typescript
interface BrowserState {
  files: FileEntry[]        // full scan results
  filter: string            // current filter text
  cursorIndex: number       // highlighted item index in filtered list
  scrollPosition: number    // scrollbox position
  scanStatus: 'scanning' | 'complete' | 'error'
  scanError?: string
}
```

#### 5. Live Preview Pipeline

When cursor moves in browser mode (split layout), the preview updates:
1. Debounce 150ms (slightly higher than the brainstorm's 100ms — pipeline is heavier than scroll)
2. Read file from disk
3. Run `processMarkdown()` pipeline
4. Update preview pane content
5. Cancel in-flight preview if cursor moves again before pipeline completes

Preview errors (corrupt file, read failure) show an error message in the preview pane — never crash.

#### 6. Fuzzy Matching: Custom Lightweight Implementation

No external dependency. For ≤1000 short strings, a simple scorer is fast enough:

```
score(query, text):
  - case-insensitive subsequence match required (no match → -1)
  - bonus: consecutive characters (+3 per consecutive)
  - bonus: match at word boundary / after path separator (+5)
  - bonus: match at start of string (+7)
  - penalty: gap between matches (-1 per gap char)
  - sort: by score descending, then alphabetical
  - match target: full relative path (not filename only)
```

Matched character positions are returned for highlight rendering.

---

## Implementation Phases

### Phase 4a: Directory Scanner

Create `src/browser/scanner.ts` — a pure async function with no UI dependencies.

**Files:**
- `src/browser/scanner.ts`
- `src/browser/scanner.test.ts`

**Tasks:**
- [x] Define `FileEntry` type: `{ name: string; relativePath: string; absolutePath: string; directory: string }`
- [x] Define `ScanOptions`: `{ maxDepth?: number; maxFiles?: number; excludeDirs?: string[] }`
- [x] Implement `scanDirectory(dir: string, options?: ScanOptions): Promise<FileEntry[]>`
  - [x] Recursive walk using `node:fs/promises` `readdir` with manual recursion (not `recursive: true` — need depth tracking)
  - [x] Default depth: 3, default maxFiles: 1000
  - [x] Default exclude: `.git`, `node_modules`, `.next`, `dist`, `build`, `vendor`, `target`, `.svn`, `.hg`, `__pycache__`, `.venv`, `coverage`
  - [x] Match `.md` extension only (case-insensitive)
  - [x] Skip filenames with C0/C1 control characters (reuse `sanitize.ts` pattern)
  - [x] Skip unreadable directories (catch EACCES/EPERM, continue)
  - [x] Do NOT follow symlinks (use `lstat` or `readdir` without `followSymlinks`)
  - [x] Sort: group by directory, alphabetical within groups
  - [x] Return empty array for non-existent or unreadable root directory
- [x] Tests:
  - [x] Scans nested directories up to depth limit
  - [x] Respects maxFiles cap
  - [x] Excludes junk directories
  - [x] Skips non-.md files
  - [x] Handles empty directories
  - [x] Handles permission errors gracefully
  - [x] Skips control chars in filenames
  - [x] Groups and sorts correctly

**Success criteria:** Scanner is a pure, testable module with no OpenTUI or React dependencies. All tests pass.

### Phase 4b: Fuzzy Matcher

Create `src/browser/fuzzy.ts` — a pure scoring function.

**Files:**
- `src/browser/fuzzy.ts`
- `src/browser/fuzzy.test.ts`

**Tasks:**
- [x] Define `FuzzyMatch`: `{ entry: FileEntry; score: number; positions: number[] }`
- [x] Implement `fuzzyMatch(query: string, text: string): { score: number; positions: number[] } | null`
  - [x] Case-insensitive subsequence matching
  - [x] Consecutive character bonus (+3)
  - [x] Word boundary / path separator bonus (+5)
  - [x] Start-of-string bonus (+7)
  - [x] Gap penalty (-1 per gap character)
  - [x] Return null for no match
  - [x] Return matched character positions for highlighting
- [x] Implement `fuzzyFilter(query: string, entries: FileEntry[]): FuzzyMatch[]`
  - [x] Apply `fuzzyMatch` against `entry.relativePath` for each entry
  - [x] Filter out non-matches
  - [x] Sort by score descending, then alphabetical
  - [x] Empty query returns all entries (score 0, no positions)
- [x] Tests:
  - [x] Empty query returns all items
  - [x] Exact match scores highest
  - [x] Consecutive chars score higher than scattered
  - [x] Word boundary matches score higher than mid-word
  - [x] Path separator matches score high (e.g., "ar" matches `api/README.md`)
  - [x] Non-matching query returns empty
  - [x] Positions array is correct for highlight rendering
  - [x] Case-insensitive matching

**Success criteria:** Fuzzy matcher is a pure, testable module. Scoring produces intuitive ordering for common file search patterns.

### Phase 4c: State Machine Extensions

Extend `src/app/state.ts` with browser mode support.

**Files:**
- `src/app/state.ts`
- `src/app/state.test.ts`

**Tasks:**
- [x] Add `AppMode` type: `'browser' | 'viewer'`
- [x] Add `BrowserState` interface (files, filter, cursorIndex, scrollPosition, scanStatus, scanError)
- [x] Extend `AppState` with:
  - [x] `mode: AppMode`
  - [x] `browser: BrowserState`
  - [x] `currentFile: string | undefined` (path of opened file)
  - [x] `fromBrowser: boolean` (enables back navigation)
- [x] Add new actions to `AppAction` union:
  - [x] `{ type: 'ScanComplete'; files: FileEntry[] }`
  - [x] `{ type: 'ScanError'; error: string }`
  - [x] `{ type: 'FilterUpdate'; text: string }`
  - [x] `{ type: 'CursorMove'; direction: 'up' | 'down' | 'top' | 'bottom' | 'pageUp' | 'pageDown' }`
  - [x] `{ type: 'OpenFile'; path: string }`
  - [x] `{ type: 'ReturnToBrowser' }`
- [x] Implement reducer cases:
  - [x] `ScanComplete` — set files, scanStatus to 'complete', reset cursor to 0
  - [x] `ScanError` — set scanStatus to 'error', scanError message
  - [x] `FilterUpdate` — set filter text, reset cursor to 0 (refiltering happens in component via memo)
  - [x] `CursorMove` — adjust cursorIndex within bounds (requires knowing filtered list length — pass as payload or compute in reducer)
  - [x] `OpenFile` — set mode to 'viewer', set currentFile, set fromBrowser to true
  - [x] `ReturnToBrowser` — set mode to 'browser', clear currentFile (browser state preserved)
- [x] Update `initialState()` to accept `mode` parameter:
  - [x] Browser mode: `mode: 'browser'`, `browser: { files: [], filter: '', cursorIndex: 0, scrollPosition: 0, scanStatus: 'scanning' }`, `fromBrowser: false`
  - [x] Viewer mode: `mode: 'viewer'`, `browser: { ... defaults }`, `fromBrowser: false`
- [x] Update `legendEntries()` for browser mode:
  - [x] Browser nav page: `? more · ↑/↓ navigate · enter open · esc quit · type to filter`
  - [x] Browser hint (legendPage off): `[browser] · ? help`
- [x] Ensure `paneDimensions()` handles browser mode:
  - [x] In browser mode, `preview-only` and `source-only` both mean "browser list full width"
  - [x] `side` / `top` split between browser list and preview pane
  - [x] Minimum width for browser list: 20 cols (narrower than 20+preview → browser full width)
- [x] Disable `CycleLayout` action in browser mode (no-op, return same state)
- [x] Tests:
  - [x] `initialState` with browser mode
  - [x] `ScanComplete` populates files and resets cursor
  - [x] `ScanError` sets error state
  - [x] `FilterUpdate` updates filter and resets cursor
  - [x] `CursorMove` respects bounds (0 to filteredLength - 1)
  - [x] `CursorMove` top/bottom/pageUp/pageDown
  - [x] `OpenFile` transitions mode to viewer, sets currentFile, fromBrowser
  - [x] `ReturnToBrowser` restores browser mode, preserves filter/cursor/files
  - [x] `CycleLayout` is no-op in browser mode
  - [x] `legendEntries` returns browser-specific hints
  - [x] `paneDimensions` in browser mode
  - [x] Integration: scan → filter → cursor → open → return → filter preserved

**Success criteria:** State machine handles all browser ↔ viewer transitions. All existing Phase 3 tests still pass. Browser state is preserved across mode transitions.

### Phase 4d: Browser Pane Component

Create the browser UI component.

**Files:**
- `src/renderer/opentui/browser-pane.tsx`
- `src/theme/types.ts` (extend)
- `src/theme/dark.ts` (extend)
- `src/theme/light.ts` (extend)

**Tasks:**
- [x] Add `BrowserTokens` to theme:
  - [x] `directoryColor` — dim accent for group headers (dark: `#565f89`, light: `#8990b3`)
  - [x] `selectedBg` — highlight for cursor item (dark: `#283457`, light: `#d5d6db`)
  - [x] `selectedFg` — text color for cursor item (dark: `#c0caf5`, light: `#343b58`)
  - [x] `matchHighlightColor` — accent for fuzzy match chars (dark: `#ff9e64`, light: `#965027`)
  - [x] `filterColor` — filter input text color (dark: `#7aa2f7`, light: `#2e7de9`)
  - [x] `fileCountColor` — dim count text (dark: `#565f89`, light: `#8990b3`)
- [x] Create `BrowserPane` component:
  - [x] Props: `files: FileEntry[]`, `filter: string`, `cursorIndex: number`, `matchPositions: Map<string, number[]>`, `focused: boolean`, `theme: ThemeTokens`, `scanStatus`, `onCursorChange`, `scrollRef`
  - [x] Layout:
    ```
    ┌─ filter ──────────────────────┐
    │ > readme_                      │ ← filter input at top
    ├────────────────────────────────┤
    │ docs/                          │ ← directory group header (dim)
    │ > README.md                    │ ← selected item (highlighted bg)
    │   getting-started.md           │
    │   api-reference.md             │
    │                                │
    │ guides/                        │
    │   tutorial.md                  │
    │   faq.md                       │
    ├────────────────────────────────┤
    │ 6/47                           │ ← match count in filter area
    └────────────────────────────────┘
    ```
  - [x] Filter input: `<box>` at top with filter text in `filterColor`, match count right-aligned
  - [x] File list: `<scrollbox>` with `viewportCulling` for performance
  - [x] Directory headers: `<text>` with `directoryColor`, no interaction (cursor skips them)
  - [x] File items: `<text>` with normal color, selected item gets `selectedBg`/`selectedFg`
  - [x] Fuzzy match highlighting: matched characters rendered in `matchHighlightColor`
  - [x] Cursor indicator: `>` prefix on selected item
  - [x] Loading state: centered "Scanning..." text when `scanStatus === 'scanning'`
  - [x] Empty state: "No markdown files found" when scan complete but 0 files
  - [x] No matches state: "No matches" when filter produces 0 results
  - [x] File cap warning: "showing 1000+ files" in status area if cap hit
- [x] Mouse support:
  - [x] Click on file item → dispatch `CursorMove` to that index
  - [x] Mouse scroll in file list → native scrollbox handling

**Success criteria:** Browser pane renders file list with directory grouping, fuzzy match highlights, filter input, and loading/empty states. Theme tokens added for both dark and light themes.

### Phase 4e: App Integration

Wire the browser into the app shell with mode transitions and live preview.

**Files:**
- `src/cli/index.ts` (modify)
- `src/renderer/opentui/boot.tsx` (modify)
- `src/renderer/opentui/app.tsx` (modify)

**Tasks:**
- [x] Update CLI argument parsing:
  - [x] No positional arg → `{ mode: 'browser', dir: process.cwd() }`
  - [x] Directory positional → `{ mode: 'browser', dir: resolvedPath }`
  - [x] File positional → `{ mode: 'viewer', filePath: resolvedPath }` (current behavior)
  - [x] Detect file vs directory with `Bun.file(path).exists()` + `stat.isDirectory()`
  - [x] Error message for non-existent paths
- [x] Update `BootContext` to support browser mode:
  - [x] `BootContext = ViewerBootContext | BrowserBootContext`
  - [x] `ViewerBootContext`: `{ mode: 'viewer'; ir: IRNode; theme: ThemeTokens; layout: LayoutMode; raw: string }`
  - [x] `BrowserBootContext`: `{ mode: 'browser'; dir: string; theme: ThemeTokens; layout: LayoutMode }`
- [x] Update `boot()` to handle both contexts
- [x] Update `App` component:
  - [x] Accept `BootContext` union as props
  - [x] Initialize `useReducer` with correct mode
  - [x] Browser mode key handler (two-tier routing per architecture decision):
    ```typescript
    if (state.mode === 'browser') {
      browserKeyHandler(key, dispatch, state)
    } else {
      // existing KEY_MAP / SHIFT_KEY_MAP dispatch
    }
    ```
  - [x] Browser mode render: `<BrowserPane>` (left/top) + `<PreviewPane>` (right/bottom) in split, or `<BrowserPane>` full width
  - [x] Live preview: `useEffect` watching cursor position, debounced 150ms
    - [x] Read file → `processMarkdown()` → set preview content
    - [x] Cancel in-flight preview on cursor change (AbortController or stale-check)
    - [x] Show error in preview pane on failure
    - [x] Skip preview update if layout is browser-only (no preview pane visible)
  - [x] `OpenFile` handler: read file, run pipeline, transition to viewer mode
  - [x] `ReturnToBrowser` handler: clear preview content, transition to browser mode
  - [x] Kick off directory scan in `useEffect` on mount (browser mode only)
  - [x] Dispatch `ScanComplete` or `ScanError` when scan finishes
- [x] Esc key implementation (per behavior chain):
  - [x] Browser + filter non-empty → dispatch `FilterUpdate({ text: '' })`
  - [x] Browser + filter empty → `renderer.destroy()`
  - [x] Viewer + fromBrowser → dispatch `ReturnToBrowser`
  - [x] Viewer + !fromBrowser → `renderer.destroy()`
- [x] Mouse handlers:
  - [x] Click in browser pane → focus browser (if split), set cursor to clicked item
  - [x] Click in preview pane → focus preview (if split)
  - [x] Mouse scroll → native scrollbox handling

**Success criteria:** Full browser→preview→browser flow works. Live preview updates on cursor move. Key routing is mode-aware. All existing Phase 3 functionality preserved in viewer mode.

### Phase 4f: Shell Completions

Add `--completions <shell>` flag for zsh and bash.

**Files:**
- `src/cli/completions.ts`
- `src/cli/index.ts` (modify — add flag)

**Tasks:**
- [x] Add `--completions` option to `parseCliArgs()`: accepts `'zsh'` or `'bash'`
- [x] Implement `generateZshCompletion(): string`
  - [x] `compdef` registration
  - [x] Complete `.md` files and directories for first positional arg
  - [x] Complete `--theme`, `--layout`, `--completions` flags with their values
- [x] Implement `generateBashCompletion(): string`
  - [x] `complete -F` registration
  - [x] Same completion targets as zsh
- [x] Print completion script to stdout and exit (like `--info`)
- [x] Usage: `eval "$(liham --completions zsh)"` in `.zshrc`

**Success criteria:** `liham --completions zsh` outputs a working zsh completion script. `liham --completions bash` outputs a working bash completion script. Tab-completing `liham <tab>` shows `.md` files and directories.

---

## System-Wide Impact

### Interaction Graph

- CLI `parseCliArgs()` → determines mode → `boot()` routes to App with correct context
- App `useReducer` → single state machine manages both browser and viewer modes
- Browser `scanDirectory()` → async, dispatches `ScanComplete`/`ScanError` to reducer
- Browser cursor move → debounced `processMarkdown()` → preview pane update
- `OpenFile` action → file read + pipeline → mode transition to viewer
- `ReturnToBrowser` action → mode transition, browser state preserved in reducer

### Error Propagation

- Scanner errors (EACCES, ENOENT) → caught per-directory, continues scan, logs skipped dirs
- Scanner root error → `ScanError` action → error message in browser pane
- Preview pipeline errors → error message in preview pane, browser remains functional
- File open errors (deleted between list and open) → error message, stay in browser mode
- All errors are non-fatal — the app never crashes from a bad file or directory

### State Lifecycle Risks

- **Browser state on mode transition:** Stored in reducer, not component state. Survives unmount/remount.
- **Preview content on return to browser:** Discarded (re-computed on next open). No stale content risk.
- **Scan results on return to browser:** Preserved. No re-scan (matches Go v1). New files require app restart.
- **Pipeline cancellation on rapid cursor:** Stale-check via cursor position at resolve time. No orphaned renders.

### API Surface Parity

- `BootContext` becomes a union type — all consumers must handle both variants
- `initialState()` gains a `mode` parameter — existing call sites pass `'viewer'` for backward compatibility
- `AppAction` union grows — existing actions unchanged, new actions are additive

---

## Acceptance Criteria

### Functional Requirements

- [x] `liham` (no args) launches file browser scanning cwd
- [x] `liham ./docs` launches file browser scoped to directory
- [x] `liham README.md` launches directly in preview mode (no browser)
- [x] File list shows .md files grouped by directory
- [x] Typing filters the list with fzf-style fuzzy matching
- [x] j/k/arrows navigate the cursor, mouse click selects items
- [x] Live preview updates on cursor move (debounced, split layout only)
- [x] Enter opens selected file in preview mode
- [x] Esc/b returns from preview to browser (when launched from browser)
- [x] Browser state (filter, cursor, scroll) preserved on return
- [x] Scanner respects depth limit (3), file cap (1000), junk exclusion
- [x] Loading state shown during directory scan
- [x] Empty state shown when no .md files found
- [x] Shell completions work for zsh and bash
- [x] All existing Phase 3 viewer functionality preserved

### Non-Functional Requirements

- [x] Fuzzy filter runs in <5ms for 1000 files
- [x] Live preview debounce prevents pipeline thrashing
- [x] File list uses `viewportCulling` for rendering performance
- [x] Scanner handles permission errors without crashing
- [x] No new runtime dependencies (fuzzy matcher is custom)

### Quality Gates

- [x] All new modules have unit tests (scanner, fuzzy, state)
- [x] All existing tests pass (152+ from Phase 3)
- [x] Both dark and light theme tokens added
- [x] TypeScript strict mode passes (`exactOptionalPropertyTypes`)

---

## Alternative Approaches Considered

1. **External fuzzy library (fuse.js, fzf-for-js):** Rejected — adds a dependency for a simple use case. 1000 short strings don't need a heavy matcher.
2. **Tree view instead of grouped flat list:** Rejected — harder to filter, more complex state, takes more visual space. Flat list with group headers gives hierarchy without overhead.
3. **Async generator scanner (yield partial results):** Considered but deferred — adds complexity for progressive rendering. Scan of 1000 files at depth 3 completes in <100ms typically. Loading state is sufficient.
4. **Re-scan on return to browser:** Rejected — matches Go v1 behavior, avoids loading flash on every mode transition. Users restart the app to see new files.

## Sources & References

### Origin

- **Brainstorm:** [docs/brainstorms/2026-03-05-phase-4-file-browser-brainstorm.md](docs/brainstorms/2026-03-05-phase-4-file-browser-brainstorm.md) — key decisions: grouped flat list, fzf scoring, side preview, inline filter at top, zsh+bash completions, read-only browser

### Internal References

- State machine: `src/app/state.ts` — `AppState`, `AppAction`, `appReducer`
- App component: `src/renderer/opentui/app.tsx` — `KEY_MAP`, `handleAction`, `renderLayout`
- Pane pattern: `src/renderer/opentui/source-pane.tsx` — scrollbox + focused + theme + border
- CLI entry: `src/cli/index.ts` — `parseCliArgs`, boot flow
- Boot: `src/renderer/opentui/boot.tsx` — `BootContext`, `boot()`
- Theme: `src/theme/types.ts`, `src/theme/dark.ts`, `src/theme/light.ts`
- Sanitizer: `src/pipeline/sanitize.ts` — control character stripping (reuse for filename check)
- Go v1 browser: `internal/browser/model.go` — reference for scan, mode transitions
- Go v1 app: `internal/app/model.go` — reference for `openFile`, `returnToBrowser`
- Rewrite plan Phase 4 section: `docs/plans/2026-03-04-feat-liham-typescript-opentui-rewrite-plan.md` (line 481)
- Phase 3 plan: `docs/plans/2026-03-05-feat-phase-3-split-pane-app-plan.md` — `mode` field reserved for Phase 4
