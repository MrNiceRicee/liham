# Slow Initial Load from File Browser

**Date:** 2026-03-04
**Status:** Ready for planning

## What We're Building

Fix the 3+ second delay when selecting a file from the browser, and the ctrl+c garbage character bug that accompanies it.

## Problem

When running `liham` (browser mode) and selecting a file:
- First file selection takes 3+ seconds to render — feels broken
- Pressing ctrl+c while waiting produces garbage characters in the filter input
- Mouse clicks resolve the delay (likely flushing the input buffer)
- Subsequent file selections are instant (renderer is cached)

## Root Cause Analysis

`glamour.WithAutoStyle()` performs terminal background color detection via OSC 11 query. This query is sent **after** bubbletea has already entered alt screen + mouse capture mode. The terminal's response to OSC 11 either:
1. Times out (3+ second delay)
2. Leaks escape sequence bytes into the input stream (ctrl+c garbage)

The glamour renderer is created lazily in `preview.SetSize()` → `ensureRenderer()`, which only runs when a file is first opened from the browser. This is why only the first load is affected.

**Code path:**
```
openFile() → preview.SetSize() → ensureRenderer() → glamour.NewTermRenderer(glamour.WithAutoStyle()) → OSC 11 query → timeout
```

**Affected files:**
- `internal/preview/model.go:74-80` — `ensureRenderer` with `WithAutoStyle()`
- `internal/app/theme.go:5-9` — unused `NewRenderer` (also uses `WithAutoStyle()`)

## Why This Approach: Pre-warm Renderer

**Chosen approach:** Detect terminal style and create the glamour renderer eagerly — before bubbletea enters alt screen mode.

**Why:**
- OSC 11 query works reliably when the terminal is in normal mode (before alt screen)
- Zero cost at file selection time — renderer is already warm
- Fixes both the slow load AND the garbage characters (no OSC query during alt screen)
- No user-facing flags needed (auto-detection still works, just earlier)

**Rejected alternatives:**
- `--dark`/`--light` CLI flag: requires user to specify, defeats auto-detection
- Async render with loading state: adds complexity, doesn't fix the ctrl+c garbage

## Key Decisions

1. **Detect style before `tea.NewProgram`** — run `lipgloss.HasDarkBackground()` (or equivalent) in `app.New()` or `app.Run()`, before bubbletea takes over the terminal
2. **Cache the style result** — store as dark/light enum in Config or Model, pass to preview when creating renderer
3. **Use explicit style path** — replace `glamour.WithAutoStyle()` with `glamour.WithStylePath("dark")` or `glamour.WithStylePath("light")` using the cached result
4. **Optionally pre-create renderer** — could create the glamour renderer at a default width during init, then only recreate on width change
5. **Clean up `theme.go`** — the `NewRenderer` function appears unused; remove or integrate it

## Open Questions

None — approach is clear and well-scoped.
