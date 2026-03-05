---
title: "fix: slow initial load from file browser"
type: fix
status: completed
date: 2026-03-04
origin: docs/brainstorms/2026-03-04-slow-initial-load-brainstorm.md
---

# fix: slow initial load from file browser

Selecting a file from the browser takes 3+ seconds on first load because `glamour.WithAutoStyle()` sends an OSC 11 terminal query inside alt screen + mouse mode, causing a timeout. The same query leaks escape bytes into the input stream, producing garbage characters in the filter.

Fix by detecting terminal background color **before** bubbletea enters alt screen, caching the result, and using an explicit glamour style.

## Acceptance Criteria

- [x] First file selection from browser loads in under 100ms (no perceptible delay)
- [x] No garbage characters appear in filter input on ctrl+c or any other key
- [x] Direct file mode (`liham README.md`) also uses pre-detected style
- [x] Returning to browser and selecting another file remains instant
- [x] Terminal resize re-creates renderer without re-querying terminal
- [x] File watcher re-renders use cached style

## MVP

### Step 1: Add style field to Config

`internal/app/config.go` — add `GlamourStyle string` to Config struct.

### Step 2: Detect style before alt screen

`internal/app/model.go` — in `Run()`, call `lipgloss.HasDarkBackground(os.Stdin, os.Stderr)` between `New(cfg)` and `tea.NewProgram(m)`. Store `"dark"` or `"light"` in `m.config.GlamourStyle`.

```go
// internal/app/model.go — Run()
func Run(cfg Config) error {
    m := New(cfg)

    // detect terminal background while still in normal mode —
    // must happen before tea.NewProgram enters alt screen
    if lipgloss.HasDarkBackground(os.Stdin, os.Stderr) {
        m.config.GlamourStyle = "dark"
    } else {
        m.config.GlamourStyle = "light"
    }

    p := tea.NewProgram(m)
    go func() {
        p.Send(programMsg{p: p})
    }()
    _, err := p.Run()
    return err
}
```

### Step 3: Pass style to preview model

`internal/preview/model.go` — update `New()` to accept a style string. Add a `style` field to the Model. Update `ensureRenderer()` to use `glamour.WithStandardStyle(style)` instead of `glamour.WithAutoStyle()`. Guard against empty style by defaulting to `"dark"`.

```go
// internal/preview/model.go
type Model struct {
    // ... existing fields
    style string
}

func New(style string) Model {
    if style == "" {
        style = "dark"
    }
    return Model{style: style}
}

func (m *Model) ensureRenderer(width int) {
    m.renderer, _ = glamour.NewTermRenderer(
        glamour.WithStandardStyle(m.style),
        glamour.WithWordWrap(width),
    )
    m.rendererWidth = width
}
```

### Step 4: Wire up in root model

`internal/app/model.go` — update `New()` to pass style to `preview.New(cfg.GlamourStyle)`.

Note: detection happens in `Run()` after `New()`, so the style must be set on the model after construction but before `tea.NewProgram`. Two options:
- Set `m.config.GlamourStyle` in `Run()` and have preview read it lazily
- Or set it on preview directly: `m.preview = preview.New(style)` after detection

Simplest: detect in `Run()`, set on model, then preview reads `m.config.GlamourStyle` when `ensureRenderer` is first called. This requires preview to have access to the style — pass it via `preview.New(style)` or add a `SetStyle()` setter.

Since detection happens after `New()` in `Run()`, use a setter:

```go
// in Run(), after detection:
m.preview.SetStyle(m.config.GlamourStyle)
```

### Step 5: Delete unused theme.go

`internal/app/theme.go` — delete the entire file. `NewRenderer()` is never called anywhere.

### Step 6: Remove glamour import from theme.go

Covered by deleting the file in Step 5.

## Edge Cases

- **Empty style string**: guarded in `preview.New()` — defaults to `"dark"` (matches `HasDarkBackground` error default)
- **Non-TTY (piped input)**: `HasDarkBackground` returns false → uses `"light"`. Glamour rendering still works, just with light theme
- **Terminal misreports color**: no worse than current behavior. Future `--style` flag can override

## Sources

- **Origin brainstorm:** [docs/brainstorms/2026-03-04-slow-initial-load-brainstorm.md](../brainstorms/2026-03-04-slow-initial-load-brainstorm.md) — pre-warm renderer chosen over CLI flag or async rendering
- **Glamour API:** `glamour.WithStandardStyle("dark"/"light")` skips terminal detection entirely (glamour.go:121, :306-322)
- **Lipgloss API:** `lipgloss.HasDarkBackground(in, out)` — safe in normal mode, unreliable in alt screen (lipgloss/v2 query.go:83)
- **Affected files:** `internal/preview/model.go:74`, `internal/app/model.go:407`, `internal/app/config.go`, `internal/app/theme.go` (delete)
