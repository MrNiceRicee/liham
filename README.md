# liham

Terminal markdown previewer with split-pane view, search, TOC, math, mermaid, and media support.

![liham — terminal markdown previewer](./assets/hero.gif)

## Prerequisites

[Bun](https://bun.sh) v1.1 or later.

```sh
curl -fsSL https://bun.sh/install | bash
```

## Install

```sh
bunx @mrnicericee/liham README.md
```

Or install globally:

```sh
bun add -g @mrnicericee/liham
```

## Quick Start

```sh
liham              # browse .md files in current directory
liham README.md    # preview a file
liham docs/        # browse a directory
```

Press `?` for keybindings. Enable [shell completions](#shell-completions) for tab autocompletion.

## Features

- **Split pane** — source and rendered preview side by side, toggle with `l`
- **Syntax highlighting** — 190+ languages via highlight.js
- **Search** — vim-style `/` with match highlighting, `n`/`N` navigation
- **Table of contents** — `t` to toggle, jump to any heading
- **Math** — LaTeX rendered as Unicode
- **Mermaid** — diagrams rendered as colored ASCII art
- **Images** — Kitty graphics protocol with halfblock/text fallback ([terminal compatibility](#terminal-compatibility))
- **Video / GIF** — in-terminal playback via ffmpeg ([optional dependencies](#optional-dependencies))

![media playback](./assets/media.gif)
- **File browser** — fuzzy filter, live file watching
- **Themes** — auto-detect dark/light from terminal background ([environment variables](#environment-variables))

## How It Works

liham uses a [unified.js](https://unifiedjs.com) pipeline to transform markdown into terminal UI:

```mermaid
graph TD
    A[Markdown] --> B[remark-parse]
    B --> C[remark-math]
    C --> D[remark-gfm]
    D --> E[remark-rehype]
    E --> F[rehype-highlight]
    F --> G[rehype-ir]
    G --> H[IR Nodes]
    H --> I[React / OpenTUI]
```

| Stage | What it does |
|---|---|
| **remark-parse** | Parses markdown into an mdast syntax tree |
| **remark-math** | Extracts LaTeX `$...$` and `$$...$$` blocks |
| **remark-gfm** | Adds tables, task lists, strikethrough, autolinks |
| **remark-rehype** | Converts mdast → hast (HTML AST) |
| **rehype-highlight** | Applies syntax highlighting to code blocks |
| **rehype-ir** | Compiles hast into liham's intermediate representation |
| **React / OpenTUI** | Renders IR nodes as terminal UI components |

## Keybindings

| Key | Action | Context |
|---|---|---|
| `j` / `k` | Scroll / navigate | all |
| `g` / `G` | Top / bottom | all |
| `Ctrl+d` / `Ctrl+u` | Half page down / up | viewer |
| `l` | Cycle layout | viewer |
| `s` | Toggle scroll sync | viewer |
| `Tab` | Switch pane focus | viewer, browser |
| `/` | Search | viewer |
| `n` / `N` | Next / prev match or media | search, modal |
| `t` | Table of contents | viewer |
| `y` | Copy selection | viewer |
| `Enter` | Open file / media | browser, viewer |
| `Space` | Play / pause | modal |
| `←` / `→` | Seek ±1s | modal |
| `r` | Replay | modal |
| `+` / `-` | Volume up / down | modal |
| `m` | Mute / unmute | modal |
| `?` | Toggle help | all |
| `Escape` | Back / close | all |
| `q` | Quit | all |

## CLI Flags

```
liham [file|directory] [options]

Options:
  -t, --theme <name>     Color theme: auto, dark, light (default: auto)
  -l, --layout <mode>    Layout: side, top, preview-only, source-only
  -i, --info             Show terminal capabilities
  --no-images            Disable image rendering
  --no-watch             Disable file watching
  --completions <shell>  Output shell completions (zsh, bash)
  -h, --help             Show help
```

## Environment Variables

| Variable | Description |
|---|---|
| `LIHAM_THEME` | Override theme when `--theme auto` (`dark` or `light`) |
| `LIHAM_IMAGE_PROTOCOL` | Override image protocol detection |
| `LIHAM_DEBUG` | Set to `1` for verbose media debug logging |

## Optional Dependencies

| Dependency | Install | Unlocks |
|---|---|---|
| [ffmpeg](https://ffmpeg.org) | `brew install ffmpeg` | Video/GIF playback |
| [mpv](https://mpv.io) | `brew install mpv` | Better audio sync, volume control, seeking (auto-detected, falls back to ffplay) |
| [sharp](https://sharp.pixelplumbing.com) | Auto-installed as optional dep | High-quality image resizing |

## Terminal Compatibility

Best experience in Kitty, WezTerm, Ghostty, or iTerm2. Works in any terminal with text fallback for images.

## Shell Completions

### zsh (one-time setup)

```sh
mkdir -p ~/.zfunc && liham --completions zsh > ~/.zfunc/_liham && grep -q 'zfunc' ~/.zshrc || echo 'fpath=(~/.zfunc $fpath)\nautoload -Uz compinit && compinit' >> ~/.zshrc && exec zsh
```

### bash

```sh
liham --completions bash > /etc/bash_completion.d/liham
```

## License

MIT
