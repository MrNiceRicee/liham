---
title: "Phase 4: File Browser UX"
type: brainstorm
status: complete
date: 2026-03-05
---

# Phase 4: File Browser UX

## What We're Building

An in-app file browser for selecting markdown files, with fzf-style fuzzy filtering, a live preview pane, and shell tab completions for the CLI.

## Why This Approach

The v1 Go browser was minimal -- Bubbles list defaults, substring filtering, no preview. For v2 we're adding:

1. **Grouped flat list** -- files grouped under directory headers (always expanded). Shows hierarchy without tree-view complexity. Filtering hides entire groups with no matches.
2. **fzf-style fuzzy scoring** -- consecutive chars, word boundaries, path separators score higher. More discoverable than substring, more intuitive than regex.
3. **Side preview pane** -- reuses Phase 3's split pane foundation. Browser list replaces source pane, preview renders on cursor move.
4. **Shell completions** -- zsh + bash scripts for `liham <tab>` to suggest .md files and directories.

## Key Decisions

### Browser Layout
- **Split pane**: file list (left) + live preview (right), reusing existing `paneDimensions()` and focus management
- **Preview updates on cursor move** with ~100ms debounce to avoid thrashing the pipeline
- **Filter input at top** of the browser list (inline search box, not bottom prompt)

### File List
- **Flat list grouped by directory** -- directory headers are visual separators (not collapsible)
- **Item display**: filename as title, relative path as subtitle (like v1)
- **fzf-style fuzzy matching** -- score by consecutive chars, word boundaries, path separators
- **Navigation**: j/k, arrow keys, mouse click to select item
- **Mouse scroll** in the file list
- **Enter** to open file in preview mode

### Directory Scanner
- Recursive walk, depth 3 (configurable), 1000 file cap
- Exclude: `.git`, `node_modules`, `.next`, `dist`, `build`, `vendor`, `target`
- Skip control chars in filenames (security)
- Symlink cycle detection via `fs.realpath` + visited set
- Skip unreadable dirs (no crash)
- Sort: directories grouped, then alphabetical within groups

### App Mode Transitions
- `liham` (no args) -> browser mode (cwd)
- `liham ./docs` (dir arg) -> browser scoped to directory
- `liham README.md` (file arg) -> direct to preview (skip browser)
- `Esc` / `b` from preview -> back to browser (only when launched from browser)
- Browser state preserved on return (scroll position, filter text)

### Shell Completions
- Target: zsh + bash
- Complete .md files and directories for the first positional arg
- `liham --completions zsh` / `liham --completions bash` to output scripts
- Follow standard patterns (compdef for zsh, complete for bash)

### Scope Boundaries
- **Read-only** -- browser only opens files, no delete/rename/create
- File watcher integration deferred to Phase 5
- No collapsible directory groups (always expanded)

## Open Questions

_None -- all questions resolved during brainstorm._

## V1 Reference

The Go v1 browser used Bubbles' `list.Model` with `DefaultDelegate`, async `filepath.WalkDir`, built-in substring filtering. Browser model was retained in memory across mode transitions (state preserved). Watcher started on file selection, stopped on return to browser.
