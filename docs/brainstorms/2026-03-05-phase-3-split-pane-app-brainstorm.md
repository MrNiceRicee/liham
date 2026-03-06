# Phase 3: Split Pane App — Brainstorm

**Date:** 2026-03-05
**Status:** ready for planning
**Origin:** Phase 3 spec in `docs/plans/2026-03-04-feat-liham-typescript-opentui-rewrite-plan.md` (line 439)

## What We're Building

Transform liham from a single-pane markdown previewer into a split-pane app with:
- side-by-side source + preview panes
- status bar with contextual key legend
- focus management between panes
- scroll sync (percentage-based + source-line annotations for future heading-aware sync)
- mouse support (click-to-focus, wheel scroll)
- multiple layout modes (side, top, preview-only, source-only)

**Current state:** single scrollbox viewer with full markdown rendering, dark/light themes, 106 tests passing.

## Why This Approach

### Incremental sub-phases over breaking rewrite
Each sub-phase is independently shippable. The app stays launchable after every merge — single-pane mode remains default, split view activates via `--layout` flag. No regression between sub-phases.

### Status bar early as state machine debugger
The status bar shows current mode, focus state, and available keys — instant visual feedback that the `useReducer` is wired correctly. Built right after the app shell, before any new panes.

### Renderer-agnostic key/mouse dispatch
Keyboard and mouse input follow the same pattern:
- **Renderer-agnostic pure function:** `mapKeyToAction(key, appState) -> AppAction | null`
- **Renderer-specific thin wrapper:** `useKeyboard` / `useMouse` hook calls the mapper and dispatches

The reducer doesn't know whether input came from keyboard or mouse. Portable across OpenTUI, Ink, Rezi.

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Build order | Incremental sub-phases, each shippable | No regression, progressive complexity |
| Status bar timing | Right after app shell (3b) | Visual debugger for state machine |
| Status bar style | Contextual key legend, toggleable with `?` | Show only relevant keys per mode, hide for max content area |
| Keyboard dispatch | Single top-level handler, pure mapper function | One place to debug, renderer-agnostic mapping |
| Mouse support | Own sub-phase, same action dispatch pattern | Click-to-focus + wheel → same AppActions as keyboard |
| Scroll sync scope | Percentage-based + source-line annotations | Plumb hast position data through IR now, avoid retrofitting for heading-aware sync later |
| Layout mode rollout | Preview-only + side first, top + source-only later | Verify core split before adding variants |

## Sub-Phase Breakdown

### 3a: App Shell + State Machine
- New `App` component with `useReducer` and `AppAction` discriminated union
- State: mode (preview-only initially), focus, dimensions, scroll positions
- `useOnResize()` for terminal resize handling
- Refactor current App to use new state machine (no behavior change yet)
- `mapKeyToAction()` pure function extracted from keyboard handler

### 3b: Status Bar + Key Legend
- Bottom bar showing available keys contextually
- `?` key toggles legend visibility
- Shows mode indicator, file info, scroll percentage
- Reads from app state — validates state machine is working

### 3c: Source Pane
- Raw markdown text in `<scrollbox>`
- Plain text, no syntax highlighting (matches Go behavior)
- Same keyboard navigation as preview (j/k, arrows, pgup/pgdn, g/G)
- Testable standalone before composing into split

### 3d: Side-by-Side Layout
- `--layout side` flag (preview-only remains default)
- Horizontal split: source left, preview right
- Layout calculation: `(terminalSize, layoutMode) -> paneRects`
- `l` key to cycle layout modes

### 3e: Focus Management
- `Tab` to toggle focus between panes
- Visual focus indicator (border color change)
- Focused pane receives scroll keys
- Status bar updates to show focused pane

### 3f: Scroll Sync + Line Annotations
- Percentage-based proportional sync between panes
- `s` key to toggle sync on/off
- Division-by-zero guard for short files
- Annotate IR nodes with source line ranges (from hast position data)
- Groundwork for heading-aware sync in future phases

### 3g: Mouse Support
- `useMouse: true` in renderer boot
- Click-to-focus pane
- Mouse wheel scrolling in focused pane
- `mapMouseToAction()` pure function, same dispatch pattern as keyboard
- Same AppActions as keyboard equivalents (FocusPane, Scroll)

### 3h: Top Layout + Source-Only Mode
- `--layout top` for vertical split (source top, preview bottom)
- `--layout source` for full-width raw markdown view
- Layout cycle key (`l`) includes all modes

## Open Questions

*None — all design questions resolved during brainstorm.*

## References

- Phase 3 spec: `docs/plans/2026-03-04-feat-liham-typescript-opentui-rewrite-plan.md` line 439-478
- Multi-renderer plan pattern: `docs/plans/2026-03-05-feat-multi-renderer-dispatch-and-phase-2b-plan.md`
- Go layout port reference: `internal/app/layout.go`
- Go scroll sync reference: `internal/app/model.go`
