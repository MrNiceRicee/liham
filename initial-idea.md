# `liham` — Markdown Preview TUI (Brainstorm)

> A terminal-native markdown previewer built on Bubbletea v2 + the Charm stack.
> *Liham* (Tagalog) — a letter; something written.

---

## The Idea

A fast, keyboard-driven TUI that opens a markdown file and shows a **live split-pane view** — raw source on the left, Glamour-rendered preview on the right — with file watching so the preview updates automatically as you edit in your editor of choice.

---

## Core Use Case

```
nvim notes.md        # your editor, separate pane/window
liham notes.md      # this tool, watching + previewing live
```

No browser. No Electron. No `localhost:3000`. Just two terminal panes.

---

## Layout

```
┌─────────────────────────┬─────────────────────────┐
│  notes.md  [raw]        │  Preview                │
│                         │                         │
│  # Hello World          │  ██ Hello World         │
│                         │                         │
│  This is **bold** and   │  This is bold and       │
│  _italic_ text.         │  italic text.           │
│                         │                         │
│  - item one             │  • item one             │
│  - item two             │  • item two             │
│                         │                         │
└─────────────────────────┴─────────────────────────┘
  [q] quit  [tab] focus  [s] scroll-sync  [r] reload
```

---

## Tech Stack

| Layer | Library |
|---|---|
| TUI framework | `charm.land/bubbletea/v2` |
| Styling / layout | `charm.land/lipgloss/v2` |
| Markdown rendering | `github.com/charmbracelet/glamour` |
| Scrollable panes | `github.com/charmbracelet/bubbles` (viewport) |
| File watching | `github.com/fsnotify/fsnotify` |
| Distribution | Homebrew formula (single Go binary) |

---

## Features (MVP)

- [ ] Open a file: `liham README.md`
- [ ] Split pane: raw source (left) + rendered preview (right)
- [ ] File watcher — preview auto-updates on save
- [ ] Scroll sync — both panes scroll together (toggle off/on)
- [ ] Focus toggle — `tab` to switch active pane
- [ ] Glamour theme follows terminal background (dark/light auto)
- [ ] `q` / `ctrl+c` to quit

---

## Features (V2 / Nice to Have)

- [ ] **File browser mode** — `liham` with no args opens a fuzzy file picker (like Glow's TUI mode)
- [ ] **Source-only mode** — `--no-source` flag, full width preview
- [ ] **Preview-only mode** — `--no-source`, useful for reading
- [ ] **Configurable layout** — `--layout side|top` (side-by-side vs top/bottom)
- [ ] **Custom Glamour theme** — `--theme dracula|tokyo-night|...`
- [ ] **Line number toggle** in source pane
- [ ] **Heading jump** — `]h` / `[h` to jump between headings
- [ ] **Search** — `/` to search within raw source
- [ ] **Copy to clipboard** — yank rendered text or source
- [ ] **stdin support** — `cat README.md | mdp`
- [ ] **Image rendering** — inline images for Kitty/iTerm2 terminals

---

## Bubbletea v2 Advantages for This Project

- **Cursed Renderer** — ncurses-based, optimized for frequent redraws (file watch updates)
- **Declarative `View()`** — split pane layout is just `lipgloss.JoinHorizontal(...)`, no imperative terminal mode toggling
- **Auto color downsampling** — Glamour themes just work regardless of terminal color depth
- **Mouse support** — scroll preview pane with mouse wheel out of the box

---

## Distribution Plan

1. Build with `go build` → single static binary (`liham`)
2. Publish GitHub releases with GoReleaser (cross-platform binaries)
3. Submit Homebrew formula → `brew install liham`
4. Bonus: `brew tap <your-tap>` for faster iteration before core acceptance

---

## Name Ideas

| Name | Tagalog root | Meaning | Notes |
|---|---|---|---|
| `liham` | *liham* | a letter; something written | **working name** — poetic, memorable |
| `sulyap` | *sulyap* | a quick glance / peek | strong runner-up |
| `tanaw` | *tanaw* | to gaze at from a distance | poetic, great "preview" vibe |
| `tingin` | *tingin* | to look / to view | very natural, conversational |
| `basa` | *basa* | to read | simple, one syllable, clean |
| `titik` | *titik* | letter / character (typography) | nice for a text-focused tool |
| `sulat` | *sulat* | writing / written word | clean, 2 syllables |

---

## CLI API

### Basic invocation

```bash
# file mode — open specific file with live preview
liham README.md

# directory mode — fuzzy file picker, only surfaces .md files
liham
liham ./docs

# stdin mode
cat README.md | liham
echo "# Hello" | liham
```

### Flags

```bash
# layout
liham README.md --layout side      # default, left/right split
liham README.md --layout top       # top/bottom split
liham README.md --preview-only     # full width rendered, no source pane
liham README.md --source-only      # just source, no preview

# appearance
liham README.md --theme dark       # force dark glamour theme
liham README.md --theme light
liham README.md --width 100        # wrap width for preview pane

# behavior
liham README.md --no-watch         # disable file watcher, static view
liham README.md --sync-scroll      # start with scroll sync enabled
```

### Shell completion (via Cobra)

```bash
liham completion zsh    # paste into .zshrc
liham completion bash
liham completion fish
```

Once installed, `liham <tab>` completes to `.md` files in the current directory and `liham --<tab>` shows all flags with descriptions.

### CLI framework

**Cobra** for the CLI layer — gives subcommands, flag parsing, and shell completion generation for free. Entry point stays thin: Cobra parses args/flags, then hands off to the Bubbletea program.

---

## Open Questions

- Scroll sync strategy — line-based or percentage-based? (percentage is more robust with wrapped/folded content)
- Should the source pane be **editable**, or read-only + delegate to `$EDITOR`? (read-only keeps v1 scope tight)
- Worth supporting frontmatter (YAML/TOML) with distinct styling?
- Glamour has limited theme support — worth forking/extending or just shipping a few presets?
- `--preview-only` vs `--no-source` — which flag name is more intuitive?
- Should directory mode recurse subdirectories, or stay flat?

links:
https://github.com/charmbracelet/bubbletea?tab=readme-ov-file 
https://github.com/charmbracelet/bubbletea/releases/tag/v2.0.0