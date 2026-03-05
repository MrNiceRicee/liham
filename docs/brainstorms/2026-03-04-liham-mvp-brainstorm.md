# Brainstorm: liham — Markdown Preview TUI

**Date:** 2026-03-04
**Status:** Reviewed

---

## What We're Building

A terminal-native markdown previewer with a live split-pane view (raw source + Glamour-rendered preview), file watching, and a fuzzy file browser. Built with Go on the Charm stack (Bubbletea v2, Lipgloss v2, Glamour, Bubbles).

Two modes:
1. **File mode** — `liham README.md` opens split-pane with live preview, auto-updates on save
2. **Browser mode** — `liham` or `liham ./docs` opens a fuzzy file picker for .md files, select to open in split view

Both reading and writing are first-class use cases from day one.

---

## Why This Approach

### Architecture: Component-per-pane

One `tea.Program`, but each pane (source viewport, preview viewport, file picker) is its own model with its own `Update()` and `View()`. A thin parent model orchestrates layout, focus, and message routing.

**Why not monolithic?** The scope (split pane + file browser + scroll sync + focus management) would make a single `Update()` unwieldy. Component separation keeps each piece testable and self-contained.

**Why not separate programs?** We want smooth transitions between file browser and preview (press a key to go back), shared state (theme, window size), and no terminal flicker on mode switch.

### Tech Stack

| Layer | Library |
|---|---|
| TUI framework | `charm.land/bubbletea/v2` |
| Styling / layout | `charm.land/lipgloss/v2` |
| Markdown rendering | `github.com/charmbracelet/glamour` |
| Scrollable panes | `github.com/charmbracelet/bubbles` (viewport) |
| File watching | `github.com/fsnotify/fsnotify` |
| CLI framework | `github.com/spf13/cobra` |

---

## Key Decisions

1. **Component-per-pane architecture** — each pane owns its state and logic, parent model handles layout and routing
2. **Percentage-based scroll sync** — both panes stay at the same relative scroll position; more robust than line-based when rendered output wraps differently than source
3. **Fuzzy finder for file browser** — type to filter, flat list of .md files, enter to open. Not a tree view. Uses Bubbles' built-in textinput + list components with substring filtering (no extra fuzzy library).
4. **Recurse with depth limit** — file browser searches subdirectories up to 3 levels deep
5. **Flag naming: --preview-only / --source-only** — positive framing, clean pair
6. **Source pane is read-only** — delegate editing to `$EDITOR`, keeps scope tight
7. **Glamour theme auto-detects** terminal background (dark/light)

---

## MVP Scope

- [ ] Open a file: `liham README.md`
- [ ] Split pane: raw source (left) + rendered preview (right)
- [ ] File watcher — preview auto-updates on save
- [ ] Scroll sync (percentage-based) — toggle on/off with `s`
- [ ] Focus toggle — `tab` to switch active pane
- [ ] Glamour theme follows terminal background (dark/light auto)
- [ ] `q` / `ctrl+c` to quit
- [ ] File browser mode — `liham` with no args opens fuzzy file picker for .md files

### CLI Flags (MVP)

```
liham README.md                    # file mode, split view
liham                              # browser mode, fuzzy picker
liham ./docs                       # browser mode, scoped to directory

liham README.md --preview-only     # full width rendered, no source
liham README.md --source-only      # just source, no preview
liham README.md --layout side      # default, left/right split
liham README.md --layout top       # top/bottom split
liham README.md --no-watch         # disable file watcher
liham README.md --sync-scroll      # start with scroll sync enabled

# --preview-only and --source-only override --layout (single pane, no split)
# invalid file path → exit with error message
# non-markdown file → open anyway (source pane shows raw text, preview does best-effort render)
```

### Keybindings (MVP)

```
q / ctrl+c    quit
tab           toggle focus between panes
s             toggle scroll sync
j/k or arrows scroll active pane
esc / b       return to file browser (from preview mode, restores previous filter/scroll state)
```

**Focus behavior:** The focused pane receives scroll input and has a visible border highlight. The unfocused pane is still visible but doesn't respond to scroll keys.

---

## Resolved Questions

1. **Glamour theme customization** — auto dark/light only for MVP, but structure the theme handling so adding `--theme` later is not a big refactor (e.g. theme config passed around rather than hardcoded)
2. **Mouse support** — enabled by default. Bubbletea v2 has it built in, users expect scroll wheel to work.
3. **Frontmatter handling** — render as-is, no special treatment. Simplest path, revisit if needed.

---

## Out of Scope (V2+)

- Heading jump navigation (`]h` / `[h`)
- Search within source (`/`)
- Copy to clipboard
- stdin support (`cat README.md | liham`)
- Image rendering for Kitty/iTerm2
- Custom Glamour themes beyond dark/light
- Line numbers in source pane
- Shell completion generation
