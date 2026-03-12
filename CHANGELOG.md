# Changelog

All notable changes to this project will be documented in this file.

## [1.1.3] - 2026-03-11

### Added
- `--version`/`-v` flag to show current version
- `liham upgrade` subcommand to self-update via bun or npm
- Shell completion support for upgrade subcommand and version flag

### Removed
- TODO.md (use GitHub issues instead)

## [1.1.2] - 2026-03-11

### Fixed
- TOC jump now syncs both panes when scroll sync is on in split layout

### Changed
- Pre-compute heading offsets in O(n) single pass (was O(h*n) per heading)
- Debounce search highlights (150ms) to reduce re-renders during typing
- Extract video state machine into dedicated module (media-modal 608 -> 175 lines)
- Extract shared halfblock rendering module (3x deduplication across image, video thumbnail, modal)
- Convert video decoder from module-level singleton to factory pattern with proper cleanup
- Rename SearchState.phase to kind for discriminant consistency
- Consolidate duplicated sub-reducer branches and media navigation logic
- Add type safety improvements: CORE_TYPES set, ImageResult discriminated union, dimension validation

## [1.1.1] - 2026-03-10

### Added
- Print preview mode (`--print`/`-p`) for non-interactive markdown rendering
- Plain text output (`--plain`) strips ANSI codes
- Stdin pipe support (`echo '# test' | liham`)
- Chunked streaming for constant ~3MB memory on large documents

## [1.1.0] - 2026-03-09

### Added
- Video thumbnail rendering in preview pane
- Context-aware modal legend entries by media type
- Universal scroll-to with sourceLine IDs and search centering
- Grapheme-aware text input cursor for browser filter and search
- Ctrl+e/y line scroll, ctrl+d/u half-page scroll

### Fixed
- Audio modal, preview highlighting, navigation cleanup
- Option key handling, browser filter priority, scroll centering
- Media and search interaction edge cases

### Changed
- Extract activeLayer() for single-source overlay priority
- Collapse mediaFocusIndex + mediaModal into MediaOverlay union
- Extract safeKill, safeSendSignal, extractError helpers

## [1.0.1] - 2026-03-08

### Fixed
- Package name and repository URLs

## [1.0.0] - 2026-03-08

### Added
- Split-pane markdown previewer (source + rendered preview)
- Side-by-side and top-bottom layouts with scroll sync
- File browser with fuzzy filtering
- File watcher with live reload
- Kitty graphics protocol image rendering with half-block fallback
- Remote image fetching with SSRF mitigations
- Animated GIF support (static first frame)
- Video playback with ring buffer pipeline and half-block rendering
- Audio playback via mpv (preferred) or ffplay
- Media modal with gallery, seek, pause, volume controls
- Vim-style search (`/`, `n`/`N`) with inline highlighting
- Table of contents panel (`t`) with heading navigation
- LaTeX math rendering (Unicode output)
- Mermaid diagram rendering (ASCII art)
- Selection and yank to clipboard (OSC 52)
- Light and dark theme with auto-detection (OSC 11)
- Shell completions for zsh and bash
- Status bar with render time, scroll position, file info
