---
title: "feat: Build liham markdown preview TUI"
type: feat
status: completed
date: 2026-03-04
origin: docs/brainstorms/2026-03-04-liham-mvp-brainstorm.md
deepened: 2026-03-04
---

# feat: Build liham — Markdown Preview TUI

## Enhancement Summary

**Deepened on:** 2026-03-04
**Sections enhanced:** 6 phases + architecture + dependencies
**Research agents used:** architecture-strategist, performance-oracle, security-sentinel, code-simplicity-reviewer, pattern-recognition-specialist, best-practices-researcher, framework-docs-researcher, context7 (bubbletea v2, lipgloss v2, glamour, fsnotify, bubbles v2)

### Key Improvements

1. **Bubbles v2 compatibility confirmed** — risk resolved. Import paths: `charm.land/bubbles/v2/viewport`, `charm.land/bubbles/v2/list`. Viewport uses functional options constructor.
2. **Two performance blockers identified** — fsnotify debounce required (atomic saves fire 2-4 events), scroll sync division-by-zero guard needed for short files.
3. **Architecture refinement** — split `internal/app/` into focused files (config.go, messages.go, layout.go, focus.go) to prevent god object in model.go. Add Config struct as Cobra-to-Bubbletea handoff contract.
4. **V2 API corrections** — `Init()` returns `(tea.Model, tea.Cmd)`, child `View()` returns `string` (only root returns `tea.View`), mouse events are typed (`MouseClickMsg`, `MouseWheelMsg`).
5. **Watcher pattern** — use `p.Send()` to inject messages from goroutine, `context.Context` for clean cancellation, skip vim temp files (`4913`, `*~`).

### Blockers (Must Address)

- **B1:** fsnotify debounce timer (50-100ms) — without this, a single Neovim save triggers 2-4 redundant re-renders
- **B2:** Scroll sync division-by-zero — `ScrollPercent()` when `TotalLines <= ViewportHeight` causes panic. Guard: `if totalLines <= height { percent = 0 }`

## Overview

Build a terminal-native markdown previewer that shows a live split-pane view (raw source + Glamour-rendered preview) with file watching, scroll sync, and a fuzzy file browser. Single Go binary, built on the Charm stack (Bubbletea v2, Lipgloss v2, Glamour, Bubbles v2).

Two modes: **file mode** (`liham README.md`) for split-pane preview with live reload, and **browser mode** (`liham`) for fuzzy file picking. Both reading and writing are first-class use cases (see brainstorm: `docs/brainstorms/2026-03-04-liham-mvp-brainstorm.md`).

## Problem Statement / Motivation

Existing terminal markdown tools are either renderers (Glow) or editors. There's no tool that gives you a live side-by-side view of raw source and rendered output in the terminal — the workflow of editing in nvim while seeing rendered preview in another pane doesn't exist without a browser.

## Proposed Solution

A single Go binary using the component-per-pane architecture: one `tea.Program`, each pane (source, preview, file browser) as its own model, orchestrated by a thin parent model (see brainstorm: architecture decision).

## Technical Approach

### Architecture

```
┌──────────────────────────────────────────────┐
│  main.go → Cobra (root cmd) → tea.NewProgram │
│                                              │
│  ┌─────────── app.Model ──────────────┐      │
│  │  mode: browser | preview           │      │
│  │  layout: side | top                │      │
│  │  focus: left | right               │      │
│  │                                    │      │
│  │  ┌──────────┐  ┌───────────┐       │      │
│  │  │ source   │  │ preview   │       │      │
│  │  │ Model    │  │ Model     │       │      │
│  │  │(viewport)│  │(viewport) │       │      │
│  │  └──────────┘  └───────────┘       │      │
│  │                                    │      │
│  │  ┌──────────┐  ┌───────────┐       │      │
│  │  │ browser  │  │ watcher   │       │      │
│  │  │ Model    │  │ (tea.Cmd) │       │      │
│  │  │(list+    │  │           │       │      │
│  │  │ input)   │  │           │       │      │
│  │  └──────────┘  └───────────┘       │      │
│  └────────────────────────────────────┘      │
└──────────────────────────────────────────────┘
```

#### Architecture Research Insights

**Config struct as Cobra-to-Bubbletea contract:**
```go
// internal/app/config.go
type Config struct {
    FilePath    string
    DirPath     string
    Layout      Layout
    PreviewOnly bool
    SourceOnly  bool
    NoWatch     bool
    SyncScroll  bool
}
```
Cobra populates this in `RunE`, passes to `app.New(cfg)`. Keeps flag parsing out of the TUI layer entirely.

**Typed mode and layout constants:**
```go
type Mode int
const (
    ModeBrowser Mode = iota
    ModePreview
)

type Layout int
const (
    LayoutSide Layout = iota
    LayoutTop
)
```

**Inter-component message contract — all custom messages in one file:**
```go
// internal/app/messages.go
type FileChangedMsg struct{ Content []byte }
type FileDeletedMsg struct{}
type FileSelectedMsg struct{ Path string }
type RenderCompleteMsg struct{ Output string }
type DirScanCompleteMsg struct{ Files []string }
```
Child components communicate to parent exclusively through typed `tea.Msg` values returned as `tea.Cmd`. Parent routes messages down via each child's `Update()`.

**Focus management:**
```go
// internal/app/focus.go
type FocusTarget int
const (
    FocusSource FocusTarget = iota
    FocusPreview
)
```
The focused pane gets a distinct border style. Key/scroll events route only to the focused pane unless scroll sync is active.

**Watcher lifecycle with context.Context:**
Use `cmd.Context()` from Cobra → `tea.WithContext(ctx)` → pass `ctx` to watcher goroutine. Watcher exits cleanly on context cancellation (quit or mode switch).

### Directory Structure

```
liham/
├── main.go                    # entry point, minimal
├── go.mod
├── go.sum
├── cmd/
│   └── root.go                # cobra root command, flag parsing, Config construction
├── internal/
│   ├── app/
│   │   ├── model.go           # root tea.Model — Init/Update/View wiring only
│   │   ├── config.go          # Config struct — Cobra handoff contract
│   │   ├── messages.go        # all custom tea.Msg types
│   │   ├── keys.go            # keybinding definitions
│   │   ├── layout.go          # Layout type, split ratio, join logic
│   │   ├── focus.go           # FocusTarget type, routing logic
│   │   └── theme.go           # glamour theme config (structured for future --theme)
│   ├── source/
│   │   └── model.go           # source pane — viewport wrapping raw markdown text
│   ├── preview/
│   │   └── model.go           # preview pane — viewport wrapping glamour-rendered output
│   ├── browser/
│   │   └── model.go           # file browser — textinput + list, substring filtering
│   └── watcher/
│       └── watcher.go         # fsnotify wrapper, debounce, p.Send() pattern
├── docs/
│   ├── brainstorms/
│   └── plans/
└── initial-idea.md
```

### Key V2 API Notes (from context7 research)

- **Import paths**: `charm.land/bubbletea/v2`, `charm.land/lipgloss/v2`, `charm.land/bubbles/v2/viewport`, `charm.land/bubbles/v2/list`, `github.com/charmbracelet/glamour`
- **Init() returns `(tea.Model, tea.Cmd)`** — v2 change from v1's single `tea.Cmd` return
- **View()**: root model returns `tea.View` (set AltScreen, MouseMode here), child models return `string`
- **Key events**: `tea.KeyPressMsg` (not `tea.KeyMsg` from v1), use `msg.String()` for matching
- **Mouse events**: typed messages — `tea.MouseClickMsg`, `tea.MouseWheelMsg`, `tea.MouseMotionMsg` (not unified `tea.MouseMsg`)
- **Layout**: `lipgloss.JoinHorizontal(lipgloss.Top, leftPane, rightPane)` for side-by-side
- **Glamour auto-style**: `glamour.WithAutoStyle()` handles dark/light detection
- **Viewport v2**: `viewport.New(viewport.WithWidth(w), viewport.WithHeight(h))` — functional options, methods for `SetWidth()`, `SetHeight()`, `ScrollPercent()`, `SetYOffset()`, `SoftWrap`
- **List v2**: built-in filtering with `SetFilteringEnabled(true)`, `FilterState()` to check filter status
- **Terminal features**: set declaratively on root `tea.View` — `v.AltScreen = true`, `v.MouseMode = tea.MouseModeNormal`

### Implementation Phases

#### Phase 1: Project Scaffolding & Basic Split View

**Goal:** `liham README.md` opens and displays a static split-pane view.

Tasks:
- [x] `go mod init github.com/joshuasantos/liham` — `main.go`
- [x] `go get` all dependencies — `go.mod`:
  - `charm.land/bubbletea/v2`
  - `charm.land/lipgloss/v2`
  - `charm.land/bubbles/v2`
  - `github.com/charmbracelet/glamour`
  - `github.com/fsnotify/fsnotify`
  - `github.com/spf13/cobra`
- [x] `git init` + initial commit
- [x] Cobra root command with positional arg for file path — `cmd/root.go`
  - Use `RunE` (not `Run`) for error returns
  - Construct `Config` struct, pass to `app.New(cfg)`
  - Validate file path with `filepath.Abs()` + `filepath.EvalSymlinks()`
- [x] Config struct for Cobra→Bubbletea handoff — `internal/app/config.go`
- [x] Custom message types — `internal/app/messages.go`
- [x] Root app model with basic window size handling — `internal/app/model.go`
  - Lazy viewport init: don't set dimensions until first `tea.WindowSizeMsg`
  - Root `View()` returns `tea.View` with `AltScreen = true`, `MouseMode = tea.MouseModeCellMotion`
- [x] Source pane model: load file content into viewport — `internal/source/model.go`
  - Use `viewport.New(viewport.WithWidth(w), viewport.WithHeight(h))`
  - Child `View()` returns `string`
- [x] Preview pane model: render markdown with Glamour, display in viewport — `internal/preview/model.go`
  - Create Glamour renderer once, cache rendered output
  - `glamour.NewTermRenderer(glamour.WithAutoStyle(), glamour.WithWordWrap(width))`
  - Rebuild renderer only on width change
- [x] Theme config struct with `glamour.WithAutoStyle()` — `internal/app/theme.go`
- [x] Layout types and split logic — `internal/app/layout.go`
  - `lipgloss.JoinHorizontal()` for side-by-side, 50/50 split
- [x] `q` / `ctrl+c` to quit — `internal/app/keys.go`

**Success criteria:** Run `liham README.md`, see raw source on left, rendered preview on right. Quit with `q`.

##### Phase 1 Research Insights

**Viewport initialization pattern:**
```go
// don't create viewport until you know terminal dimensions
func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
    switch msg := msg.(type) {
    case tea.WindowSizeMsg:
        if !m.ready {
            m.viewport = viewport.New(
                viewport.WithWidth(msg.Width/2),
                viewport.WithHeight(msg.Height-2), // room for status bar
            )
            m.ready = true
        } else {
            m.viewport.SetWidth(msg.Width / 2)
            m.viewport.SetHeight(msg.Height - 2)
        }
    }
}
```

**Glamour renderer caching:**
```go
// create once, only rebuild when width changes
type PreviewModel struct {
    renderer *glamour.TermRenderer
    rendered string
    width    int
}

func (m *PreviewModel) ensureRenderer(width int) {
    if m.width != width {
        m.renderer, _ = glamour.NewTermRenderer(
            glamour.WithAutoStyle(),
            glamour.WithWordWrap(width),
        )
        m.width = width
    }
}
```

**Root View() pattern for v2:**
```go
func (m Model) View() tea.View {
    var v tea.View
    v.AltScreen = true
    v.MouseMode = tea.MouseModeNormal
    content := lipgloss.JoinHorizontal(lipgloss.Top, m.source.View(), m.preview.View())
    v.Body = content + "\n" + m.statusBar()
    return v
}
```

#### Phase 2: Interaction — Focus, Scrolling, Scroll Sync

**Goal:** Navigate within and between panes.

Tasks:
- [x] Focus state tracking (left/right) with visual border highlight on focused pane — `internal/app/focus.go`
- [x] `tab` to toggle focus — `internal/app/keys.go`
- [x] `j`/`k`/arrows route to focused pane's viewport — `internal/app/model.go`
- [x] Mouse scroll enabled by default (Bubbletea v2 `tea.MouseWheelMsg`) — `internal/app/model.go`
- [x] Percentage-based scroll sync: when enabled, scrolling one pane sets the other to the same % — `internal/app/model.go`
  - **BLOCKER GUARD:** protect against division-by-zero when `TotalLines <= ViewportHeight`
- [x] `s` to toggle scroll sync on/off — `internal/app/keys.go`
- [x] `--sync-scroll` flag to start with sync enabled — `cmd/root.go`

**Success criteria:** Tab between panes, scroll independently or in sync. Mouse wheel works. No panic on short files.

##### Phase 2 Research Insights

**Scroll sync with zero-division guard:**
```go
func syncScroll(source, target viewport.Model) {
    totalLines := source.TotalLineCount()
    height := source.Height
    if totalLines <= height {
        target.SetYOffset(0)
        return
    }
    percent := source.ScrollPercent()
    targetTotal := target.TotalLineCount()
    if targetTotal <= target.Height {
        return
    }
    targetOffset := int(float64(targetTotal-target.Height) * percent)
    target.SetYOffset(targetOffset)
}
```

**Mouse wheel handling in v2:**
```go
case tea.MouseWheelMsg:
    // route to focused pane, then sync if enabled
    if m.focus == FocusSource {
        m.source, cmd = m.source.Update(msg)
        if m.syncScroll {
            syncScroll(m.source.viewport, m.preview.viewport)
        }
    }
```

**Focus border styling:**
```go
var (
    focusedBorder = lipgloss.NewStyle().Border(lipgloss.RoundedBorder()).BorderForeground(lipgloss.Color("62"))
    blurredBorder = lipgloss.NewStyle().Border(lipgloss.RoundedBorder()).BorderForeground(lipgloss.Color("240"))
)
```

#### Phase 3: File Watching

**Goal:** Preview auto-updates when the file is saved externally.

Tasks:
- [x] fsnotify wrapper that watches the **parent directory** (not the file itself) — `internal/watcher/watcher.go`
  - watches parent dir and filters events matching target filename
  - handles atomic saves (Neovim/Vim write temp file then rename over original — fsnotify loses inode watch on rename, so watching parent dir catches the CREATE event for the new file)
  - **BLOCKER:** debounce timer (80ms) with `time.AfterFunc` to collapse event bursts
  - skip vim temp files: ignore filenames matching `4913`, `*~`, `.swp`, `.swx`
- [x] `FileChangedMsg` custom message type — `internal/watcher/watcher.go`
- [x] Use `p.Send()` pattern: watcher goroutine sends messages into the `tea.Program` event loop — `internal/watcher/watcher.go`
- [x] Watcher accepts `context.Context` for clean cancellation — `internal/watcher/watcher.go`
- [x] On `FileChangedMsg`: re-read file, update source pane content, re-render preview as async `tea.Cmd` — `internal/app/model.go`
- [x] `--no-watch` flag to disable — `cmd/root.go`
- [x] Handle file deletion: show "file deleted" message in status bar, keep source at last-known content, stop watcher — `internal/app/model.go`
- [x] Stop watcher cleanly when returning to browser mode (cancel context, prevent goroutine leak) — `internal/app/model.go`

**Success criteria:** Edit file in separate terminal, save, preview updates within ~200ms. No duplicate renders on single save.

##### Phase 3 Research Insights

**Debounced watcher with p.Send():**
```go
func Watch(ctx context.Context, path string, p *tea.Program) error {
    w, err := fsnotify.NewWatcher()
    if err != nil {
        return err
    }
    dir := filepath.Dir(path)
    base := filepath.Base(path)
    w.Add(dir)

    var debounce *time.Timer
    go func() {
        defer w.Close()
        for {
            select {
            case <-ctx.Done():
                return
            case event := <-w.Events:
                if filepath.Base(event.Name) != base {
                    continue
                }
                // skip vim temp files
                if isVimTemp(event.Name) {
                    continue
                }
                if event.Has(fsnotify.Write) || event.Has(fsnotify.Create) {
                    if debounce != nil {
                        debounce.Stop()
                    }
                    debounce = time.AfterFunc(80*time.Millisecond, func() {
                        content, err := os.ReadFile(path)
                        if err == nil {
                            p.Send(FileChangedMsg{Content: content})
                        }
                    })
                }
                if event.Has(fsnotify.Remove) || event.Has(fsnotify.Rename) {
                    p.Send(FileDeletedMsg{})
                }
            case <-w.Errors:
                // log or ignore
            }
        }
    }()
    return nil
}

func isVimTemp(name string) bool {
    base := filepath.Base(name)
    return base == "4913" ||
        strings.HasSuffix(base, "~") ||
        strings.HasSuffix(base, ".swp") ||
        strings.HasSuffix(base, ".swx")
}
```

**Async Glamour re-render pattern:**
```go
case FileChangedMsg:
    m.source.SetContent(string(msg.Content))
    // render in background to avoid blocking UI
    return m, func() tea.Msg {
        output, _ := m.renderer.Render(string(msg.Content))
        return RenderCompleteMsg{Output: output}
    }
case RenderCompleteMsg:
    m.preview.SetContent(msg.Output)
```

#### Phase 4: Layout Variants

**Goal:** Support `--preview-only`, `--source-only`, `--layout top`.

Tasks:
- [x] Layout enum: `side` (default), `top` — `internal/app/config.go`
- [x] `--layout` flag with validation (reject invalid values at Cobra level) — `cmd/root.go`
- [x] `lipgloss.JoinVertical()` for top/bottom layout — `internal/app/layout.go`
- [x] `--preview-only` flag: single pane, full-width rendered preview — `cmd/root.go`, `internal/app/model.go`
- [x] `--source-only` flag: single pane, full-width raw source — `cmd/root.go`, `internal/app/model.go`
- [x] Flag conflict handling: `--preview-only` / `--source-only` override `--layout` — `cmd/root.go`
- [x] `--preview-only` + `--source-only` together → exit with error: "flags are mutually exclusive" — `cmd/root.go`
- [x] Keybindings adapt: no `tab` in single-pane modes, no scroll sync — `internal/app/model.go`

**Success criteria:** All three layout modes render correctly. Flags compose without errors.

##### Phase 4 Research Insights

**Layout rendering logic:**
```go
// internal/app/layout.go
func (m Model) renderPanes() string {
    if m.config.PreviewOnly {
        return m.preview.View()
    }
    if m.config.SourceOnly {
        return m.source.View()
    }
    switch m.config.Layout {
    case LayoutTop:
        return lipgloss.JoinVertical(lipgloss.Left, m.source.View(), m.preview.View())
    default:
        return lipgloss.JoinHorizontal(lipgloss.Top, m.source.View(), m.preview.View())
    }
}
```

**Pane dimension calculation:**
```go
func (m Model) paneDimensions(totalW, totalH int) (w, h int) {
    h = totalH - 1 // status bar
    if m.config.PreviewOnly || m.config.SourceOnly {
        return totalW, h
    }
    switch m.config.Layout {
    case LayoutTop:
        return totalW, h / 2
    default:
        return totalW / 2, h
    }
}
```

**Flag validation in Cobra:**
```go
PreRunE: func(cmd *cobra.Command, args []string) error {
    if previewOnly && sourceOnly {
        return fmt.Errorf("--preview-only and --source-only are mutually exclusive")
    }
    layout, _ := cmd.Flags().GetString("layout")
    if layout != "side" && layout != "top" {
        return fmt.Errorf("--layout must be 'side' or 'top', got %q", layout)
    }
    return nil
},
```

#### Phase 5: File Browser Mode

**Goal:** `liham` with no args opens a fuzzy file picker.

Tasks:
- [x] Browser model: Bubbles `list` with built-in filtering enabled — `internal/browser/model.go`
  - `list.New()` with filtering enabled by default in bubbles v2
  - No separate `textinput` needed — list v2 has filtering built in
- [x] Walk directory tree up to 3 levels deep, collect `.md` files — `internal/browser/model.go`
  - Uses `filepath.WalkDir` — does not follow symlinks by default
  - Cap file count at 1000, async scan as `tea.Cmd`
- [x] `enter` to select file → send `FileSelectedMsg` → transition to preview mode — `internal/app/model.go`
- [x] `esc` / `b` from preview mode → return to browser, restore filter/scroll state — `internal/app/model.go`
  - browser model is retained in parent model while preview is active (not recreated)
  - `esc` in browser mode → handled by list's built-in filter (clears filter, does not quit)
- [x] Cobra: detect no-arg invocation → start in browser mode — `cmd/root.go`
- [x] Cobra: detect directory arg (`liham ./docs`) → browser scoped to that directory — `cmd/root.go`
- [x] Start file watcher when opening a file from browser — `internal/app/model.go`

**Success criteria:** `liham` shows .md files, type to filter, enter to open, esc to go back. State preserved on return.

##### Phase 5 Research Insights

**List v2 with built-in filtering:**
```go
// internal/browser/model.go
type item struct {
    path string
    name string
}
func (i item) Title() string       { return i.name }
func (i item) Description() string { return filepath.Dir(i.path) }
func (i item) FilterValue() string { return i.name }

func New(dir string) Model {
    l := list.New([]list.Item{}, list.NewDefaultDelegate(), 0, 0)
    l.SetFilteringEnabled(true)
    l.Title = "markdown files"
    return Model{list: l, dir: dir}
}
```

**Async directory scan:**
```go
func scanDir(dir string, maxDepth int) tea.Cmd {
    return func() tea.Msg {
        var files []string
        count := 0
        filepath.WalkDir(dir, func(path string, d fs.DirEntry, err error) error {
            if err != nil {
                return fs.SkipDir // permission errors: skip
            }
            depth := strings.Count(strings.TrimPrefix(path, dir), string(os.PathSeparator))
            if depth > maxDepth {
                return fs.SkipDir
            }
            if !d.IsDir() && strings.HasSuffix(d.Name(), ".md") {
                files = append(files, path)
                count++
                if count >= 1000 {
                    return fs.SkipAll
                }
            }
            return nil
        })
        return DirScanCompleteMsg{Files: files}
    }
}
```

**Mode transition with watcher lifecycle:**
```go
case FileSelectedMsg:
    m.mode = ModePreview
    m.source.SetContent(loadFile(msg.Path))
    m.preview.Render(loadFile(msg.Path))
    if !m.config.NoWatch {
        ctx, cancel := context.WithCancel(m.ctx)
        m.watcherCancel = cancel
        watcher.Watch(ctx, msg.Path, m.program)
    }

case tea.KeyPressMsg:
    if m.mode == ModePreview && (msg.String() == "esc" || msg.String() == "b") {
        if m.watcherCancel != nil {
            m.watcherCancel() // stop watcher before returning to browser
            m.watcherCancel = nil
        }
        m.mode = ModeBrowser
    }
```

#### Phase 6: Edge Cases & Polish

**Goal:** Handle real-world usage gracefully.

Tasks:
- [x] Invalid file path → exit with clear error message — `cmd/root.go`
  - Canonicalize with `filepath.Abs()` then `filepath.EvalSymlinks()`
- [x] Non-markdown file → open anyway, best-effort render — `internal/app/model.go`
- [x] Empty file → show empty panes, watcher still active — `internal/app/model.go`
- [x] Very large file (>1MB) → warn in status bar, debounce Glamour re-renders to prevent UI freeze — `internal/app/model.go`
- [x] Terminal resize → `tea.WindowSizeMsg` reflows all panes, preserves scroll percentage — `internal/app/model.go`
  - Debounce resize handler (rapid resize events during drag)
- [x] Status bar at bottom: thin fixed-height row showing context-appropriate keybindings per mode — `internal/app/model.go`
- [x] Split ratio: 50/50 for both `side` and `top` layouts (configurable split is V2) — `internal/app/layout.go`
- [x] Mouse scroll on unfocused pane with sync enabled → scrolls both panes (follows cursor pane) — `internal/app/model.go`
- [x] Disambiguate file vs directory arg: check `os.Stat()`, handle symlinks — `cmd/root.go`
- [x] File browser: empty directory (no .md files found) → show message — `internal/browser/model.go`
- [x] File browser: permission errors on directory walk → skip and continue — `internal/browser/model.go`
- [x] Sanitize filenames for display (prevent terminal escape sequence injection) — `internal/browser/model.go`

**Success criteria:** No panics or weird rendering on edge cases. Resize is smooth.

##### Phase 6 Research Insights

**Path canonicalization:**
```go
// cmd/root.go — validate and canonicalize path before entering TUI
func resolvePath(arg string) (string, error) {
    abs, err := filepath.Abs(arg)
    if err != nil {
        return "", fmt.Errorf("invalid path: %w", err)
    }
    resolved, err := filepath.EvalSymlinks(abs)
    if err != nil {
        return "", fmt.Errorf("cannot resolve path: %w", err)
    }
    return resolved, nil
}
```

**Resize debounce:**
```go
case tea.WindowSizeMsg:
    // store scroll percentage before resize
    sourcePercent := m.source.ScrollPercent()
    previewPercent := m.preview.ScrollPercent()
    // resize panes
    w, h := m.paneDimensions(msg.Width, msg.Height)
    m.source.SetWidth(w)
    m.source.SetHeight(h)
    m.preview.SetWidth(w)
    m.preview.SetHeight(h)
    // re-render preview with new width (rebuilds glamour renderer)
    m.preview.Render(m.source.RawContent())
    // restore scroll positions
    m.source.SetScrollPercent(sourcePercent)
    m.preview.SetScrollPercent(previewPercent)
```

## Alternative Approaches Considered

| Approach | Why rejected |
|----------|-------------|
| Monolithic model | Single `Update()` would grow unwieldy with browser + split pane + scroll sync (see brainstorm) |
| Separate `tea.Program` per mode | Awkward transitions, terminal flicker, no shared state (see brainstorm) |
| External fuzzy library | Extra dependency for minimal gain — Bubbles list v2 has built-in filtering (see brainstorm) |
| Line-based scroll sync | Fragile with wrapped/folded content — percentage-based is more robust (see brainstorm) |
| Separate textinput for browser filter | Bubbles list v2 includes filtering — no separate component needed |

## Acceptance Criteria

### Functional Requirements

- [x] `liham README.md` opens split-pane view (source left, preview right)
- [x] File watcher auto-updates preview on external save
- [x] `tab` toggles focus, `s` toggles scroll sync, `j`/`k`/arrows scroll
- [x] `esc`/`b` returns to file browser from preview mode
- [x] `liham` (no args) opens fuzzy file picker for .md files
- [x] `liham ./docs` scopes browser to that directory
- [x] `--preview-only`, `--source-only`, `--layout top|side` all work correctly
- [x] `--no-watch` disables file watcher
- [x] `--sync-scroll` starts with scroll sync enabled
- [x] Mouse scroll works by default
- [x] Glamour auto-detects dark/light terminal background
- [x] `q` / `ctrl+c` quits cleanly

### Non-Functional Requirements

- [x] Single static Go binary, no runtime dependencies
- [x] Preview update latency < 200ms after file save
- [x] No duplicate re-renders on single atomic save (debounce)
- [x] Smooth terminal resize handling
- [x] No panics on edge cases (empty file, deleted file, non-markdown, permission errors, short files with scroll sync)

## Dependencies & Prerequisites

- Go 1.22+ (for recent module features)
- `charm.land/bubbletea/v2` — v2 beta, pin exact version
- `charm.land/lipgloss/v2` — v2 beta, pin exact version
- `charm.land/bubbles/v2` — **confirmed compatible** with bubbletea v2 (viewport, list, textinput all available)
- `github.com/charmbracelet/glamour` — stable
- `github.com/fsnotify/fsnotify` — stable
- `github.com/spf13/cobra` — stable

**Resolved risk:** Bubbles v2 is compatible with Bubbletea v2. Import at `charm.land/bubbles/v2/viewport` and `charm.land/bubbles/v2/list`. No fork or raw viewport needed.

**Remaining risk:** Bubbletea v2 and Lipgloss v2 are in beta. API may shift. Pin exact versions in `go.mod`.

## Risk Analysis & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Bubbletea v2 beta breaking changes | Medium | High | Pin exact version, vendor if needed |
| ~~Bubbles viewport not v2-compatible~~ | ~~Medium~~ | ~~High~~ | **RESOLVED** — Bubbles v2 confirmed at `charm.land/bubbles/v2/viewport` |
| Glamour rendering performance on large files | Low | Medium | Render in async `tea.Cmd`, debounce, cache output |
| fsnotify atomic save event storm | High | High | **BLOCKER B1** — debounce 50-100ms with `time.AfterFunc`, skip vim temp files |
| Scroll sync panic on short files | High | High | **BLOCKER B2** — guard `ScrollPercent()` when `TotalLines <= Height` |
| fsnotify platform quirks (macOS vs Linux) | Low | Low | fsnotify handles cross-platform; test on macOS (primary dev platform) |
| Symlink loops in directory walker | Low | Medium | `filepath.WalkDir` does not follow symlinks by default |
| Huge directory stalls browser | Low | Medium | Cap file count at 1000, async scan as `tea.Cmd` |

## Sources & References

### Origin

- **Brainstorm document:** [docs/brainstorms/2026-03-04-liham-mvp-brainstorm.md](docs/brainstorms/2026-03-04-liham-mvp-brainstorm.md) — Key decisions carried forward: component-per-pane architecture, percentage-based scroll sync, Bubbles built-ins for file browser, `--preview-only`/`--source-only` flag naming

### External References

- Bubbletea v2 upgrade guide: https://github.com/charmbracelet/bubbletea/blob/main/UPGRADE_GUIDE_V2.md
- Bubbletea v2 module: `charm.land/bubbletea/v2`
- Lipgloss v2 module: `charm.land/lipgloss/v2`
- Bubbles v2 module: `charm.land/bubbles/v2` (viewport, list, textinput)
- Glamour: `github.com/charmbracelet/glamour` — `WithAutoStyle()`, `WithWordWrap()`
- fsnotify: `github.com/fsnotify/fsnotify` — watch parent dir, debounce, event filtering
- Cobra: `github.com/spf13/cobra` — `RunE`, `PreRunE`, `cmd.Context()`

### Research Agents (Deepen)

- architecture-strategist: Config struct, split app/ files, typed constants, inter-component messages
- performance-oracle: fsnotify debounce (B1), scroll sync guard (B2), async rendering
- security-sentinel: path canonicalization, symlink protection, file count cap, filename sanitization
- code-simplicity-reviewer: confirmed phase structure, noted user chose to keep Phase 4 layout variants
- pattern-recognition-specialist: message contract, focus management, god object prevention
- best-practices-researcher: p.Send() pattern, cmd.Context(), lazy viewport init
- framework-docs-researcher: Bubbles v2 confirmed, viewport/list API details

### Initial Idea

- [initial-idea.md](../../initial-idea.md) — original brainstorm with full feature wishlist and name exploration
