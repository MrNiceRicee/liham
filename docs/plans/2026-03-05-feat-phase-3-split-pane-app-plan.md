---
title: "feat: Phase 3 — Split Pane App"
type: feat
status: active
date: 2026-03-05
deepened: 2026-03-05
origin: docs/brainstorms/2026-03-05-phase-3-split-pane-app-brainstorm.md
---

# Phase 3: Split Pane App

## Enhancement Summary

**Deepened on:** 2026-03-05
**Research agents used:** TypeScript reviewer, architecture strategist, pattern recognition specialist, code simplicity reviewer, performance oracle, frontend race condition reviewer, OpenTUI skill

### Key Improvements
1. Consolidated 8 sub-phases to 5 — merged status bar with app shell, source pane with layouts, eliminated standalone-component-with-no-consumer phases
2. Dropped premature renderer-agnostic input types — use `Pick` from OpenTUI's actual `KeyEvent`/`MouseEvent` instead of custom `KeyInput`/`MouseInput`
3. Deferred IR line annotations to a future phase (YAGNI — percentage sync doesn't use them)
4. Unified `ToggleFocus`/`FocusPane` into single `FocusPane(target)` action from the start
5. Added scroll sync feedback loop prevention, viewportCulling, resize debounce, and small-terminal guards

### New Considerations Discovered
- OpenTUI mouse wheel may conflict with scrollbox native scroll handling — test before wiring
- Status bar must be a flex child (not absolute positioned) for correct Yoga layout
- `CoreIRNode` has no base type — position field needs per-interface addition
- `exactOptionalPropertyTypes` requires conditional spread for optional position data
- `forwardRef` deprecated in React 19 — use ref-as-prop pattern
- Missing `statusBar` tokens in `ThemeTokens` — must extend theme types
- Scroll position lost on pane unmount during layout change — store in reducer state
- Clarify `mode` (viewer/browser) vs `layout` (pane arrangement) naming for Phase 4 compatibility

## Overview

Transform liham from a single-pane markdown previewer into a split-pane app with source + preview panes, status bar with contextual key legend, focus management, scroll sync, mouse support, and multiple layout modes. Five independently shippable sub-phases, each preserving a launchable app with no regressions.

**Current state:** single scrollbox viewer with full markdown rendering (headings, paragraphs, code blocks, blockquotes, lists, tables, links, images, thematic breaks), dark/light themes, OSC 11 detection. 106 tests, 264 assertions.

## Problem Statement / Motivation

The current app is a read-only scrollbox — no source view, no split pane, no keyboard legend. The Go v1 has all of these. Phase 3 closes the feature gap while establishing the state management foundation for Phases 4-6 (file browser, watcher, Kitty graphics).

## Proposed Solution

### Architectural Decisions

All decisions carried from brainstorm (see brainstorm: `docs/brainstorms/2026-03-05-phase-3-split-pane-app-brainstorm.md`).

1. **Incremental sub-phases** — each sub-phase is independently shippable. Single-pane mode stays default. Split pane activates via `--layout` flag.
2. **Status bar merged with app shell (3a)** — visual debugger for the state machine. Only shows keys that have visible effect in current phase.
3. **Single top-level keyboard handler** — one `useKeyboard` in App with key-to-action mapping inline. Global keys always handled, scroll keys routed to focused pane.
4. **Scroll sync is percentage-based only** — line annotations deferred until heading-aware sync is actually planned. Hast positions remain in the AST for future use.
5. **Contextual key legend, toggleable** — `?` to show/hide. Only shows keys relevant to current mode.
6. **`FocusPane(target)` only** — no `ToggleFocus`. Tab dispatches `FocusPane(opposite)`.

### Resolved Design Questions

| Question | Decision | Rationale |
|----------|----------|-----------|
| Build order | 5 sub-phases (3a-3e), each shippable | Merged from 8 — no throwaway components |
| Status bar timing | Merged into 3a (app shell) | Validates state machine, no extra phase boundary |
| Key dispatch | Inline in `useKeyboard` handler, key-to-action map as `Record` | One renderer, `BLOCK_COMPILERS` pattern for cognitive complexity |
| Mouse dispatch | Inline in mouse handler, same pattern | No custom `MouseInput` type — use OpenTUI's actual types |
| Scroll sync | Percentage-based only, no IR line annotations | YAGNI — add positions when heading-aware sync is planned |
| Layout rollout | All four layouts in one phase (3b) | Source pane composed immediately, no standalone-then-compose waste |
| Focus action | `FocusPane(target)` only | Tab uses `FocusPane(opposite)`, mouse uses `FocusPane(clicked)` — one action |
| `mode` vs `layout` | `layout` for pane arrangement, `mode` reserved for Phase 4 (viewer/browser) | Prevents naming collision |
| `PaneDimensions` return | Optional source/preview fields | `exactOptionalPropertyTypes` enforces null checks |
| Scroll position preservation | Store `scrollPercent` per-pane in reducer state | Survives layout change unmount/remount |
| Input types | `Pick<KeyEvent, 'name' \| 'ctrl' \| 'shift' \| 'meta'>` | Honest about source, widening is additive |

### OpenTUI API Surface (from research)

**Layout:** Yoga flexbox — `flexDirection: "row"` for horizontal split, percentage widths (`"50%"`), `flexGrow: 1` for fluid sizing. Scrollbox dimensions go in `style.rootOptions`, not top-level props.

**Focus:** Imperative via `focused` boolean prop. No built-in tab-order. Border styling via `borderColor` in `style.rootOptions` (verify `focusedBorderColor` works on scrollbox). Only one component should have `focused={true}` at a time.

**Scrollbox:** `ScrollBoxRenderable` — `scrollTo(pos)`, `scrollBy(delta, unit?)`, `scrollTop` (get/set), `scrollHeight` (get). Access via React `ref`. `viewportCulling` enables virtual rendering. No built-in scroll events. **Verify `scrollHeight` accuracy when `viewportCulling` is enabled.**

**Hooks:** `useKeyboard(handler)`, `useRenderer()`, `useTerminalDimensions()`, `useOnResize(callback)`, `useTimeline()`.

**Mouse:** `useMouse: true` in `createCliRenderer` config. **Warning:** scrollbox has native mouse wheel handling — enabling `useMouse` may cause double-scroll. Test native wheel behavior before wiring custom scroll dispatch.

**Key event:** `KeyEvent` from `@opentui/core` has `name`, `ctrl`, `meta`, `shift`, `option`, `eventType`, `repeated`, `sequence`. **Mouse event:** `RawMouseEvent` has `type: "down" | "up" | "move" | "scroll" | ...`, `x`, `y`, `scroll?: { direction, delta }`. There is no `'click'` event — it's `"down"`.

### Go Reference Implementation

Port reference from `main` branch:

- `internal/app/config.go` — `Mode` (Browser/Preview), `Layout` (Side/Top), `Config` struct
- `internal/app/model.go` — `Model` with `useReducer`-equivalent update loop, `handleKey()`, `routeScroll()`, `statusBar()`, `toggleFocus()`, `resize()`
- `internal/app/layout.go` — `paneDimensions()` (trivial: totalW/2 for side, totalH/2 for top, minus 1 for status bar), `joinPanes()`
- `internal/app/keys.go` — `keyMap` with q, tab, s, j/k, arrows, pgup/pgdn, ctrl+u/d
- `internal/source/model.go` — `ScrollPercent()` / `SetScrollPercent(pct)` using viewport offset math

## Implementation Phases

### Phase 3a: App Shell + State Machine + Status Bar

**Goal:** Replace the current minimal `App` with a state machine. Add status bar with contextual key legend. `?` toggles legend. The app still renders single-pane preview, but state management and visual feedback are in place.

**Files:**

- [x] `src/app/state.ts` — state types + reducer
  - `LayoutMode`: `'preview-only' | 'side' | 'top' | 'source-only'`
  - `FocusTarget`: `'source' | 'preview'`
  - `AppState`: `layout`, `focus`, `dimensions` ({width, height}), `scrollSync` (boolean), `legendVisible` (boolean), `scrollPercent` ({source: number, preview: number})
  - `AppAction` closed discriminated union: `Resize`, `FocusPane`, `ToggleSync`, `ToggleLegend`, `CycleLayout`, `Scroll`, `Quit`
  - `Scroll` action payload: `{ type: 'Scroll'; direction: 'up' | 'down' | 'top' | 'bottom' | 'pageUp' | 'pageDown' | 'halfUp' | 'halfDown'; target?: FocusTarget }`
  - Pure `appReducer(state, action) → state` function
  - `initialState(layout?: LayoutMode) → AppState`
  - `CycleLayout` in reducer: preview-only → side → top → source-only → preview-only. Guard: in 3a, cycling changes state but App only renders preview-only — add test for this.
  - `FocusPane`: set focus directly. No-op in single-pane layouts. Tab dispatches `FocusPane(opposite)`.
  - **Note:** `mode` field reserved for Phase 4 (viewer/browser). Do not conflate with `layout`.
- [x] `src/app/state.test.ts` — co-located tests
  - Reducer: each action type produces correct next state
  - Key-to-action map coverage (inline in test, mirrors the record)
  - Scroll keys suppressed in modes without scrollable panes
  - Resize action updates dimensions
  - CycleLayout to side in 3a still renders as preview-only (no crash)
  - `FocusPane('source')` in preview-only mode is a no-op
  - Reducer returns same reference when state unchanged (bail optimization)
  - Legend entries change based on layout state
- [x] `src/theme/types.ts` — add `statusBar` tokens
  - Add `statusBar: { fg: string }` to `ThemeTokens`
- [x] `src/theme/dark.ts` / `src/theme/light.ts` — add status bar colors
  - Dark: dim foreground (e.g., `#565f89`)
  - Light: dim foreground (e.g., `#8990b3`)
- [x] `src/renderer/opentui/status-bar.tsx` — OpenTUI component
  - Flex child at bottom (NOT `position: "absolute"`)
  - Height: 1 row, width: `"100%"`
  - Text color from `themeTokens.statusBar.fg`
  - Format: `key1 label · key2 label · key3 label`
  - Conditionally rendered based on `state.legendVisible`
  - Also shows: scroll percentage, layout indicator
  - Legend entries computed inline (pure function, not a separate file — extract when > 40 lines)
- [x] `src/renderer/opentui/app.tsx` — refactor to use `useReducer`
  - Import `appReducer`, `initialState` from `src/app/state.ts`
  - `useKeyboard` with `KEY_MAP: Record<string, (state) => AppAction | null>` dispatch map (matches `BLOCK_COMPILERS` pattern, keeps cognitive complexity low)
  - Key map parameter type: `Pick<KeyEvent, 'name' | 'ctrl' | 'shift' | 'meta'>` — not a custom `KeyInput` type
  - `useOnResize` dispatches `Resize` action (debounce 100ms to prevent resize storms)
  - `useTerminalDimensions` for initial dimensions
  - Quit action calls `renderer.destroy()`
  - Layout: outer `<box flexDirection="column" width="100%" height="100%">`, scrollbox with `flexGrow: 1`, StatusBar at bottom
  - Render output: single `<scrollbox>` with content (same as current, status bar added)
- [x] `src/cli/index.ts` — add `--layout` flag
  - Valid values: `preview-only` (default), `side`, `top`, `source-only`
  - Pass layout to boot context: `boot({ ir, theme, layout })`
  - Layout stored in app state but only `preview-only` renders in 3a

**Success criteria:** App behaves identically to current except for status bar at bottom. State machine is wired. `?` toggles legend. `--layout` flag parses. All existing tests pass + new state tests.

---

### Phase 3b: Panes + All Layouts

**Goal:** Build source pane, preview pane, and all four layout modes in one phase. Source pane is composed into the layout immediately — no standalone-then-compose waste.

**Files:**

- [x] `src/renderer/opentui/source-pane.tsx` — source viewer component
  - Props: `{ content: string; focused: boolean; theme: ThemeTokens; scrollRef: React.RefObject<ScrollBoxRenderable | null> }`
  - `<scrollbox ref={scrollRef} focused={focused} viewportCulling>` wrapping `<text>` with raw markdown
  - No syntax highlighting (matches Go behavior)
  - Raw markdown rendered in chunks (100 lines per `<text>` element) to reduce React element count for large files
  - Dimension styling via `style.rootOptions`
  - Ref-as-prop (not `forwardRef` — React 19 deprecation)
- [x] `src/renderer/opentui/preview-pane.tsx` — extracted from current app
  - Props: `{ content: ReactNode; focused: boolean; scrollRef: React.RefObject<ScrollBoxRenderable | null> }`
  - `<scrollbox ref={scrollRef} focused={focused} viewportCulling>` wrapping rendered content
  - Dimension styling via `style.rootOptions`
- [x] `src/cli/index.ts` — pass raw markdown to boot context
  - Boot context grows: `{ ir, theme, layout, raw }`
  - Consider defining a `BootContext` interface in `src/types/` to formalize the contract
- [x] `src/renderer/opentui/boot.tsx` — accept and pass raw content
- [x] `src/renderer/opentui/app.tsx` — compose all layouts
  - `paneDimensions()` inline function (15 lines — extract when it grows):
    - Side: each pane gets `width / 2`, `height - 1` (status bar)
    - Top: each pane gets `width`, `(height - 1) / 2`
    - Preview-only: preview gets full `width`, `height - 1`. Source: `undefined`.
    - Source-only: source gets full `width`, `height - 1`. Preview: `undefined`.
    - **Return type:** `{ source?: { width, height }; preview?: { width, height } }` — optional fields enforce null checks via `exactOptionalPropertyTypes`
    - **Minimum dimensions:** 10 cols / 5 rows per pane. Below threshold, fall back to single-pane.
  - Side: `<box flexDirection="row">` → `<SourcePane>` + `<PreviewPane>`. Separator: `border: ['right']` on source pane box.
  - Top: `<box flexDirection="column">` → `<SourcePane>` + `<PreviewPane>`. Separator: `border: ['bottom']` on source pane box.
  - Preview-only: only render `<PreviewPane>` (existing behavior)
  - Source-only: only render `<SourcePane>`
  - `l` key cycles layout and view updates immediately
  - Scroll refs: `useRef<ScrollBoxRenderable>(null)` for each pane, passed as `scrollRef` prop
  - **On layout change:** snapshot `scrollPercent` per-pane in reducer state before unmounting. Restore on remount via `useEffect` that calls `scrollTo()` from stored percent.
- [x] `src/app/state.test.ts` — add layout dimension tests
  - Side: both panes get half width
  - Top: both panes get half height
  - Preview-only: source is `undefined` in dimensions
  - Source-only: preview is `undefined` in dimensions
  - Odd terminal width/height: one pane gets the extra pixel
  - Small terminal (< 20 cols): falls back to single-pane
  - Layout cycle visits all four modes
  - Scroll percent preserved across layout change

**Success criteria:** `liham --layout side README.md` shows source left, preview right. `--layout top` shows vertical split. Default (`preview-only`) unchanged. `l` key cycles through all four layouts. Status bar reflects current layout. All tests pass.

---

### Phase 3c: Focus Management

**Goal:** Tab to switch focus between panes. Visual border color indicator. Scroll keys route to focused pane only.

**Files:**

- [x] `src/renderer/opentui/app.tsx` — wire focus from state
  - `state.focus` determines which pane gets `focused={true}` and `scrollRef`
  - Tab dispatches `FocusPane(opposite)` — only in split layouts
  - Pass focus to both `SourcePane` and `PreviewPane` components
  - Only focused pane's scrollbox has `focused={true}` — unfocused scrollbox ignores key events
- [x] `src/renderer/opentui/source-pane.tsx` / `preview-pane.tsx` — visual focus
  - Scrollbox `style.rootOptions.borderStyle: "single"`
  - Focused: `borderColor` from theme accent (e.g., `#7aa2f7`)
  - Unfocused: dim border color from theme (e.g., `#3b4261`)
  - Both border colors added to `ThemeTokens` if not already present
- [x] `src/app/state.ts` — focus routing in reducer
  - `FocusPane(target)`: set focus to target. No-op if target pane doesn't exist in current layout.
  - Single-pane layouts auto-focus the visible pane on `CycleLayout`.
  - Legend shows `Tab focus [source]` or `Tab focus [preview]` in split modes.
- [x] `src/app/state.test.ts` — add focus tests
  - Tab toggles focus in split mode
  - Tab is no-op in preview-only mode
  - Scroll actions route to focused pane (target defaults to focused)
  - Focus state reflected in legend entries
  - `CycleLayout` from side (focus source) → preview-only → auto-focus preview
  - `CycleLayout` back to side → restore last split focus

**Success criteria:** In side-by-side layout, Tab switches focus. Focused pane has distinct border color. j/k scrolls only the focused pane. Status bar shows current focus. All tests pass.

---

### Phase 3d: Scroll Sync

**Goal:** Percentage-based scroll sync between panes. `s` to toggle. Unidirectional — only focused pane initiates sync.

**Files:**

- [x] `src/renderer/opentui/app.tsx` — wire scroll sync
  - Sync calculation inline (one-liner with zero guard): `sourceHeight <= 0 ? 0 : (sourceTop / sourceHeight) * targetHeight`
  - **Unidirectional sync pattern** (prevents feedback loop):
    - Only the focused pane initiates sync
    - Scroll actions tagged with origin: `{ type: 'Scroll'; ...; origin: 'user' }` vs `{ type: 'Scroll'; ...; origin: 'sync' }`. Reducer ignores sync-originated scrolls for re-sync.
    - Alternatively: only dispatch sync from the keyboard/mouse handler, never from effects watching scroll position
  - **Sync timing:** handle scroll sync imperatively in the `useKeyboard` callback after dispatch:
    ```
    dispatch(scrollAction)
    // read focused ref's scrollTop (reflects pre-dispatch state)
    // compute sync target
    // call scrollTo() on other pane ref
    ```
    If OpenTUI processes scroll asynchronously, use `queueMicrotask` to read after next tick. Test empirically.
  - `s` key toggles sync via `ToggleSync` action
  - Null-check refs before reading/writing (pane may not exist in current layout)
- [x] `src/app/state.test.ts` — add scroll sync tests
  - Proportional sync: 50% source → 50% target
  - Short file (height <= viewport): target stays at 0
  - Zero scroll height: no division by zero
  - Sync toggle: s key flips state
  - Sync only fires from user-initiated scroll, not sync-initiated

**Success criteria:** In side layout with sync on, scrolling one pane proportionally scrolls the other. `s` toggles sync. No feedback loop. Legend shows `s sync [on/off]`. All tests pass.

---

### Phase 3e: Mouse Support

**Goal:** Click-to-focus pane, mouse wheel scrolling. Same action dispatch pattern as keyboard.

**Files:**

- [x] `src/renderer/opentui/boot.tsx` — enable mouse
  - `useMouse: true` in `createCliRenderer` config
- [x] `src/renderer/opentui/app.tsx` — wire mouse handler
  - Mouse event parameter: use OpenTUI's actual `RawMouseEvent` type (has `type: "down" | "scroll" | ...`, `x`, `y`, `scroll?: { direction, delta }`)
  - **Click-to-focus:** `type === "down"` → determine which pane was clicked via hit-testing against pane dimensions → `dispatch(FocusPane(target))`
  - **Wheel scroll:** `type === "scroll"` → `dispatch(Scroll({ direction: event.scroll.direction }))` targeting pane under cursor
  - **Double-scroll prevention:** test whether focused scrollbox handles wheel natively when `useMouse: true`. If so, either:
    - Let scrollbox handle wheel natively, only dispatch click-to-focus via mouse
    - Or disable scrollbox native wheel and handle all scroll imperatively
  - Wheel scroll triggers same sync logic as keyboard
- [x] `src/app/state.test.ts` — add mouse tests
  - Mouse down in source pane area → FocusPane('source')
  - Mouse down in preview pane area → FocusPane('preview')
  - Mouse down in status bar area → null (no action)
  - Scroll event → Scroll action with correct direction
  - Mouse down in single-pane mode → no focus switch

**Success criteria:** Mouse click switches pane focus. Mouse wheel scrolls focused pane. Scroll sync works with mouse wheel. No double-scroll. All tests pass.

---

### Phase 3f: Multi-Page Key Legend (follow-up)

**Goal:** Replace single-line legend with multi-page cycling. `?` cycles through pages. Shows vim scroll shortcuts on a dedicated page without cluttering the default nav view.

**Design:**

- Change `legendVisible: boolean` → `legendPage: 'off' | 'nav' | 'scroll'` in AppState
- `?` cycles: `nav` → `scroll` → `off` → `nav`
- Page `nav` (default): `? more · l layout · Tab source · s sync on · q quit`
- Page `scroll`: `? more · j/k scroll · g/G top/bottom · pgup/pgdn page · ctrl+d/u half`
- Page `off`: `[layout] · ? help`
- Future: add `help` page with deeper navigation (sub-menus)
- Update `ToggleLegend` action to `CycleLegend` or parameterize
- `legendEntries()` accepts page, returns entries for that page

**Files:**

- [x] `src/app/state.ts` — change legendVisible to legendPage, update reducer + legendEntries
- [x] `src/renderer/opentui/status-bar.tsx` — accept legendPage instead of legendVisible
- [x] `src/renderer/opentui/app.tsx` — pass legendPage
- [x] `src/app/state.test.ts` — test page cycling, entries per page

## System-Wide Impact

### Interaction Graph

`useKeyboard` → KEY_MAP lookup → `dispatch(action)` → `appReducer` → new state → React re-render → pane components update `focused` prop → OpenTUI routes key events to focused scrollbox. Scroll sync: after dispatch, read focused ref's `scrollTop`, compute proportional target, call `scrollTo()` on other ref.

### Error & Failure Propagation

- Scroll sync with null ref (pane unmounted): null-check prevents crash, sync silently skipped
- Layout change to split with insufficient terminal width: `paneDimensions` enforces minimums, falls back to single-pane
- Resize during scroll: reducer processes Resize first (sequential), scroll positions preserved via `scrollPercent` in state

### State Lifecycle Risks

- **Stale refs after layout change:** when switching from side to preview-only, the source pane unmounts. Its ref becomes null. Sync must null-check. **Mitigation:** snapshot `scrollPercent` in reducer state before layout change, restore on remount.
- **Resize during scroll sync:** terminal resize triggers both `Resize` action and potentially stale scroll positions. Reducer handles resize first, then scroll positions are recalculated from stored percentages (same pattern as Go `resize()`).
- **Focus in single-pane mode:** `CycleLayout` reducer auto-adjusts focus to the visible pane.
- **Scroll sync feedback loop:** sync must be unidirectional — only focused pane initiates. Tag scroll actions with origin or only sync in the keyboard/mouse handler (never from effects watching position changes).
- **Double-scroll on mouse wheel:** if scrollbox handles wheel natively AND we dispatch Scroll actions for wheel events, user sees double scroll speed. Test native behavior before wiring.
- **`renderer.destroy()` during render:** if SIGINT arrives mid-render, OpenTUI should handle teardown gracefully. Test with `kill -INT` during heavy re-render.

### Integration Test Scenarios

Test as reducer state machine traces (pure function — no rendering needed):

1. **Layout cycle with focus preservation:** side (focus source) → top (focus still source) → preview-only (auto-focus preview) → source-only (auto-focus source) → side (restore last split focus)
2. **Scroll sync across layout change:** sync on, scroll to 50% in side layout → switch to top → both panes still at ~50% (via stored scrollPercent)
3. **Mouse + keyboard interleave:** mouse FocusPane('preview'), keyboard Scroll(down), Tab → FocusPane('source'), mouse Scroll(down)
4. **Terminal resize in split:** resize while in side layout → pane dimensions update, scroll positions preserved proportionally
5. **Very small terminal:** terminal < 20 cols → paneDimensions falls back to single-pane automatically

## Acceptance Criteria

### Functional Requirements

- [ ] App shell manages state via `useReducer` with `AppAction` discriminated union
- [ ] Status bar shows contextual key hints, toggleable with `?`
- [ ] Source pane displays raw markdown text (no highlighting)
- [ ] `--layout side` shows horizontal split (source left, preview right)
- [ ] `--layout top` shows vertical split (source top, preview bottom)
- [ ] `--layout source-only` shows full-width raw markdown
- [ ] `--layout preview-only` (default) shows full-width rendered preview
- [ ] `Tab` switches focus between panes (visual border indicator)
- [ ] `s` toggles scroll sync (percentage-based, unidirectional)
- [ ] `l` cycles through layout modes
- [ ] Mouse click switches pane focus
- [ ] Mouse wheel scrolls focused pane (with sync, no double-scroll)
- [ ] Each sub-phase is independently shippable — no regressions

### Non-Functional Requirements

- [ ] `viewportCulling` enabled on both scrollboxes
- [ ] Terminal resize debounced (100ms)
- [ ] All new modules have co-located unit tests (`src/app/*.test.ts`)
- [ ] Existing 106 tests continue to pass throughout all sub-phases
- [ ] Cognitive complexity per function stays under 15 (KEY_MAP dispatch map pattern)

### Quality Gates

- [ ] `bun test` passes after each sub-phase
- [ ] `bun run lint` passes after each sub-phase
- [ ] App launches and renders correctly in preview-only mode after each sub-phase
- [ ] Benchmark: pipeline <500ms for 2000-line file, scroll >30fps in split mode

## Performance Considerations

- **Enable `viewportCulling`** on both scrollboxes — highest-leverage single setting for large files
- **Chunk source pane content** — render raw markdown in 100-line `<text>` chunks, not one element per line
- **Single-dispatch scroll sync** — compute both pane positions in one handler call, never cascade dispatches
- **Debounce terminal resize** — 100ms, prevents layout storm on window drag
- **Reducer bail optimization** — return same state reference when action produces no change (skip re-render)
- **Carry forward 1MB large-file guard** from Go version — warn users, optionally truncate

## Dependencies & Prerequisites

- Phase 2 complete (all rendering components, dark/light themes) ✅
- OpenTUI `@opentui/react` ^0.1.86 (current) — has all needed APIs
- No new dependencies required

## Sources & References

### Origin

- **Brainstorm document:** [docs/brainstorms/2026-03-05-phase-3-split-pane-app-brainstorm.md](docs/brainstorms/2026-03-05-phase-3-split-pane-app-brainstorm.md) — Key decisions: incremental sub-phases, status bar early as state debugger, contextual key legend, scroll sync, mouse support

### Internal References

- Go layout: `internal/app/layout.go` (main branch) — `paneDimensions()`, `joinPanes()`
- Go model: `internal/app/model.go` (main branch) — `handleKey()`, `routeScroll()`, `statusBar()`, `toggleFocus()`
- Go config: `internal/app/config.go` (main branch) — `Mode`, `Layout`, `Config`
- Go keys: `internal/app/keys.go` (main branch) — `keyMap`, `defaultKeyMap()`
- Go scroll: `internal/source/model.go` (main branch) — `ScrollPercent()`, `SetScrollPercent()`
- Current App: `src/renderer/opentui/app.tsx`
- Current boot: `src/renderer/opentui/boot.tsx`
- Phase 3 spec: `docs/plans/2026-03-04-feat-liham-typescript-opentui-rewrite-plan.md:439`

### OpenTUI API References

- Layout: `node_modules/@opentui/core/Renderable.d.ts` — LayoutOptions (Yoga flexbox)
- Scrollbox: `node_modules/@opentui/core/renderables/ScrollBox.d.ts` — ScrollBoxRenderable, viewportCulling
- Focus: `focusable`, `focused` props, `borderColor` in `style.rootOptions`
- Hooks: `useKeyboard`, `useRenderer`, `useTerminalDimensions`, `useOnResize` from `@opentui/react`
- Key events: `node_modules/@opentui/core/lib/KeyHandler.d.ts` — `KeyEvent` (actual shape)
- Mouse events: `node_modules/@opentui/core/lib/parse.mouse.d.ts` — `RawMouseEvent`, `MouseEventType`
