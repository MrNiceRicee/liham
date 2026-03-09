---
title: Viewer Search
type: feat
status: superseded
superseded_by: docs/plans/2026-03-08-feat-search-toc-floating-panel-plan.md
date: 2026-03-07
origin: docs/brainstorms/2026-03-07-media-modal-and-selection-brainstorm.md
note: "MEDIUM feature. Search within raw markdown in viewer mode. Vim-style / prompt."
---

# Viewer Search

## Overview

Add vim-style search to the viewer mode. `/` opens a search prompt at the bottom of the screen, the user types a query against the raw markdown text (`viewerState.raw`), matches are highlighted in the source pane, and `n`/`N` navigate between matches. Search is viewer-only — browser mode already has its own fuzzy filter.

## Problem Statement

Users viewing long markdown files have no way to jump to specific content. The only navigation is manual scrolling (j/k, page up/down, g/G). Search provides a fundamental find-and-jump capability.

## Proposed Solution

A new `SearchState` sub-state in the app state machine, a bottom-bar search prompt that replaces the status bar while active, case-insensitive string matching against `viewerState.raw`, match position tracking with `n`/`N` navigation, and visual highlighting of matches in the source pane.

## Technical Approach

### Architecture

Search is a **viewer sub-mode**, similar to how the media modal is a viewer sub-state (not a separate `AppMode`). When search is active, key routing changes: printable characters feed the search query, `n`/`N` navigate matches, `Esc` exits search, `Enter` confirms (keeps highlights, exits input mode). This is the same pattern as `MediaModalState` — a discriminated union overlaid on the viewer state.

The search bar is a bottom overlay that visually replaces the status bar. Match positions are computed from the raw markdown string and mapped to line numbers for scroll-to-match in the source pane.

### Key Architectural Decisions

1. **Search target: raw markdown** — search operates on `viewerState.raw` (the plain text markdown source). This is the same string rendered by `SourcePane`. It avoids the complexity of searching the rendered IR tree or the JSX output. Matches map directly to line offsets in the source pane.

2. **Search as viewer sub-state, not AppMode** — search is active within viewer mode, not a third mode. This preserves viewer state (scroll position, layout, pane focus) and follows the media modal precedent. The `searchState` field sits alongside `mediaFocusIndex` and `mediaModal` in `AppState`.

3. **Two search phases: input and navigation** — when the user presses `/`, search enters "input" mode (typing updates the query). `Enter` transitions to "active" mode (query is locked, `n`/`N` navigate). `Esc` from either mode exits search entirely. This matches vim behavior and avoids the complexity of live-updating match navigation while typing.

4. **Case-insensitive by default** — simple `.toLowerCase()` comparison. No regex support. Keeps the implementation minimal and the UX predictable. Can be extended later with a toggle.

5. **Match highlighting in source pane only** — the preview pane renders structured JSX from the IR tree. Injecting highlights into the rendered preview would require modifying the IR-to-JSX pipeline, which is invasive. Source pane is plain text, so highlighting is straightforward — split text around match positions and wrap matches in `<span>` with inverted/highlight colors.

6. **Reuse browser filter input pattern** — the browser mode's `FilterUpdate` action, char-by-char key handling (`browserFilterKey`), and `HighlightedName` component demonstrate the exact pattern needed. Search input handling is structurally identical (single chars append, backspace removes, ctrl+w deletes word, ctrl+u clears).

7. **`n`/`N` conflict resolution** — in viewer mode, `n`/`N` currently navigate media focus. When search is active (input or navigation phase), `n`/`N` navigate search matches instead. Media navigation is suppressed during search. This is the same pattern as the media modal swallowing keys — search active = search owns `n`/`N`.

### State Design

```ts
type SearchPhase = 'input' | 'active'

interface SearchState {
  phase: SearchPhase
  query: string
  matchCount: number
  currentMatch: number  // 0-based index into matches
}

// in AppState
searchState: SearchState | null  // null = search inactive
```

Match positions are **not stored in app state** — they are derived in the component from `viewerState.raw` + `searchState.query`. The reducer only tracks the query string, match count (for display), and current match index (for navigation). This keeps the reducer pure and avoids serializing large position arrays.

### Match Position Computation

```ts
interface SearchMatch {
  index: number       // character offset in raw string
  line: number        // 0-based line number
  column: number      // 0-based column in line
}

function findMatches(raw: string, query: string): SearchMatch[] {
  if (query.length === 0) return []
  const results: SearchMatch[] = []
  const lowerRaw = raw.toLowerCase()
  const lowerQuery = query.toLowerCase()
  let pos = 0
  while ((pos = lowerRaw.indexOf(lowerQuery, pos)) !== -1) {
    // compute line/column from character offset
    const before = raw.slice(0, pos)
    const line = (before.match(/\n/g) ?? []).length
    const lastNewline = before.lastIndexOf('\n')
    const column = lastNewline === -1 ? pos : pos - lastNewline - 1
    results.push({ index: pos, line, column })
    pos += 1  // allow overlapping matches
  }
  return results
}
```

The line number is used to scroll the source pane to the current match. This computation is memoized in the component (via `useMemo` keyed on `raw` + `query`).

### File Map

New files:
- `src/search/find.ts` — `findMatches()` pure function, `SearchMatch` type
- `src/renderer/opentui/search-bar.tsx` — search prompt component (bottom overlay)
- `src/renderer/opentui/search-keys.ts` — search mode key handler (extracted like `viewer-keys.ts`)

Modified files:
- `src/app/state.ts` — `SearchState`, search actions, reducer cases, legend entries
- `src/renderer/opentui/app.tsx` — key routing for search mode, search bar rendering, match computation
- `src/renderer/opentui/source-pane.tsx` — match highlighting in source text
- `src/renderer/opentui/viewer-keys.ts` — `/` key to activate search, guard `n`/`N` when search active
- `src/theme/types.ts` — `SearchTokens` for highlight colors
- `src/theme/dark.ts` — search token values (dark theme)
- `src/theme/light.ts` — search token values (light theme)

### Implementation Phases

---

#### Phase 1: State Machine + Actions

Add search state to the app state machine. Pure reducer logic, fully testable without UI.

- [ ] Add `SearchState` type and `searchState: SearchState | null` to `AppState`
- [ ] Add actions to `AppAction`:
  - `{ type: 'SearchOpen' }` — enter search input mode
  - `{ type: 'SearchUpdate'; query: string }` — update query text
  - `{ type: 'SearchConfirm'; matchCount: number }` — transition input -> active (locks query, sets match count)
  - `{ type: 'SearchNext' }` — advance to next match (wraps)
  - `{ type: 'SearchPrev' }` — go to previous match (wraps)
  - `{ type: 'SearchClose' }` — exit search entirely
- [ ] Add `searchReducer` sub-reducer (follows `mediaFocusReducer` pattern):
  - `SearchOpen`: set `searchState: { phase: 'input', query: '', matchCount: 0, currentMatch: 0 }`
  - `SearchUpdate`: update `query`, reset `currentMatch` to 0
  - `SearchConfirm`: transition to `phase: 'active'`, set `matchCount`. If `matchCount === 0`, close search instead.
  - `SearchNext`: `currentMatch = (currentMatch + 1) % matchCount` (no-op if matchCount === 0)
  - `SearchPrev`: `currentMatch = (currentMatch - 1 + matchCount) % matchCount`
  - `SearchClose`: set `searchState` to null
- [ ] Guard: `SearchOpen` is no-op in browser mode
- [ ] `initialState()`: `searchState: null` (existing states keep `null` — no breaking change due to `exactOptionalPropertyTypes` since this is a required field set to null)
- [ ] Update `legendEntries()`:
  - search input: `Esc: cancel · Enter: confirm · type: search`
  - search active: `n/N: next/prev · Esc: close · /: new search`
  - normal viewer: add `/ search` to nav page
- [ ] Test: `SearchOpen` creates initial search state
- [ ] Test: `SearchUpdate` updates query and resets currentMatch
- [ ] Test: `SearchConfirm` with matches transitions to active
- [ ] Test: `SearchConfirm` with 0 matches closes search
- [ ] Test: `SearchNext` wraps at boundary
- [ ] Test: `SearchPrev` wraps at boundary
- [ ] Test: `SearchClose` clears searchState to null
- [ ] Test: `SearchOpen` no-op in browser mode
- [ ] Test: legend entries update for search input/active/off states

**Files touched:**
- `src/app/state.ts`

---

#### Phase 2: Search Logic + Key Handling

Wire the pure search function and key handlers. Extract search keys into a dedicated file following the `browser-keys.ts` / `viewer-keys.ts` pattern.

- [ ] Create `src/search/find.ts`:
  - `SearchMatch` interface: `{ index: number; line: number; column: number }`
  - `findMatches(raw: string, query: string): SearchMatch[]` — case-insensitive, overlapping matches allowed
  - pure function, no side effects
- [ ] Create `src/renderer/opentui/search-keys.ts`:
  - `handleSearchKey(key, state, dispatch, matchCount): boolean` — returns true if key was consumed
  - input phase: printable chars append to query (via `SearchUpdate`), backspace removes last char, ctrl+w deletes word, ctrl+u clears, Enter dispatches `SearchConfirm`, Esc dispatches `SearchClose`
  - active phase: `n` dispatches `SearchNext`, `N` dispatches `SearchPrev`, `/` dispatches `SearchClose` then `SearchOpen` (start new search), Esc dispatches `SearchClose`, `q` dispatches `Quit`
  - all other keys swallowed during input phase (no scroll, no layout change)
  - active phase allows scroll keys (j/k/g/G etc.) to pass through to viewer handler
- [ ] Modify `src/renderer/opentui/viewer-keys.ts`:
  - add `/` to `VIEWER_KEY_MAP` — dispatches `SearchOpen` (no-op in source-only? — allow in all layouts since source pane is always searchable)
  - guard `n`/`N` in `handleViewerKey`: when `searchState?.phase === 'active'`, route to `SearchNext`/`SearchPrev` instead of media focus
- [ ] Modify `src/renderer/opentui/app.tsx`:
  - in `useKeyboard`, check `state.searchState != null` before viewer key dispatch:
    ```ts
    if (state.searchState != null) {
      const consumed = handleSearchKey(key, state, dispatch, matchCount)
      if (consumed) return
      // fall through to viewer keys for scroll in active phase
    }
    ```
  - compute matches via `useMemo`: `findMatches(viewerState.raw, state.searchState?.query ?? '')`
- [ ] Test: `findMatches` finds all occurrences, case-insensitive
- [ ] Test: `findMatches` returns empty array for empty query
- [ ] Test: `findMatches` handles overlapping matches (e.g., "aa" in "aaa" finds positions 0 and 1)
- [ ] Test: `findMatches` computes correct line/column for multi-line text
- [ ] Test: key handler routes printable chars to SearchUpdate in input phase
- [ ] Test: Enter in input phase dispatches SearchConfirm with match count
- [ ] Test: `n`/`N` in active phase dispatch SearchNext/SearchPrev
- [ ] Test: Esc in either phase dispatches SearchClose
- [ ] Test: scroll keys pass through in active phase

**Files touched:**
- `src/search/find.ts` (new)
- `src/renderer/opentui/search-keys.ts` (new)
- `src/renderer/opentui/viewer-keys.ts`
- `src/renderer/opentui/app.tsx`

---

#### Phase 3: Search Bar UI

Render the search prompt as a bottom overlay, replacing the status bar during search.

- [ ] Add `SearchTokens` to theme types:
  ```ts
  interface SearchTokens {
    promptColor: string      // the "/" prompt character
    queryColor: string       // typed query text
    matchCountColor: string  // "3/12" match counter
    noMatchColor: string     // "0 matches" warning color
  }
  ```
- [ ] Add token values to dark theme (Tokyo Night palette):
  - promptColor: `#7aa2f7` (blue)
  - queryColor: `#c0caf5` (foreground)
  - matchCountColor: `#9ece6a` (green)
  - noMatchColor: `#f7768e` (red)
- [ ] Add token values to light theme
- [ ] Create `src/renderer/opentui/search-bar.tsx`:
  - `SearchBar` component — renders in the status bar's 2-row height slot
  - layout: `/ {query}` on the left, `{current}/{total}` on the right (mirrors browser filter layout)
  - input phase: show blinking cursor effect (append `_` to query text, or rely on terminal cursor)
  - active phase: show match count, current position
  - no matches: show query in `noMatchColor` with "no matches" label
- [ ] Modify `src/renderer/opentui/app.tsx`:
  - conditionally render `SearchBar` instead of `StatusBar` when `state.searchState != null`:
    ```tsx
    {state.searchState != null ? (
      <SearchBar
        searchState={state.searchState}
        theme={props.theme}
      />
    ) : (
      <StatusBar ... />
    )}
    ```
- [ ] Test: search bar renders query text
- [ ] Test: search bar shows match count in active phase
- [ ] Test: search bar shows "no matches" styling when matchCount is 0 during input

**Files touched:**
- `src/theme/types.ts` — add `SearchTokens`
- `src/theme/dark.ts` — add search token values
- `src/theme/light.ts` — add search token values
- `src/renderer/opentui/search-bar.tsx` (new)
- `src/renderer/opentui/app.tsx`

---

#### Phase 4: Source Pane Highlighting + Scroll-to-Match

Highlight matches in the source pane and scroll to the current match on `n`/`N`.

- [ ] Modify `src/renderer/opentui/source-pane.tsx`:
  - accept optional `searchMatches: SearchMatch[]` and `currentMatchIndex: number` props
  - when matches are present, split text chunks around match positions and wrap matched segments in `<span>` with highlight styling (inverted colors or bright background)
  - current match gets a distinct style (e.g., brighter highlight) vs other matches
  - highlight function: takes a text chunk, its starting line offset, and the match list, returns `ReactNode[]` with highlight spans interspersed
- [ ] Add highlight colors to `SearchTokens`:
  ```ts
  highlightBg: string       // background for non-current matches
  highlightFg: string       // foreground for non-current matches
  currentHighlightBg: string // background for current match
  currentHighlightFg: string // foreground for current match
  ```
- [ ] Scroll-to-match: when `currentMatch` changes, scroll the source pane to the line containing the match
  - use `sourceRef.current.scrollTo(lineOffset)` — compute pixel offset from line number
  - triggered in `app.tsx` via `useEffect` watching `state.searchState?.currentMatch`
  - also scroll on `SearchConfirm` (jump to first match)
- [ ] Thread match data from `app.tsx` through `renderViewerLayout` to `SourcePane`:
  - `renderViewerLayout` accepts optional `searchHighlight` prop
  - `SourcePane` receives matches and highlights accordingly
- [ ] Test: source pane with no matches renders normally (no highlights)
- [ ] Test: source pane highlights match positions with correct colors
- [ ] Test: current match has distinct highlight style
- [ ] Test: scroll-to-match positions source pane at correct line

**Files touched:**
- `src/renderer/opentui/source-pane.tsx` — highlight rendering
- `src/renderer/opentui/layout.tsx` — thread search props
- `src/renderer/opentui/app.tsx` — pass match data, scroll-to-match effect
- `src/theme/types.ts` — highlight tokens
- `src/theme/dark.ts` — highlight values
- `src/theme/light.ts` — highlight values

---

#### Phase 5: Edge Cases + Polish

Handle interaction with other viewer features and edge cases.

- [ ] Search + media focus interaction: when search is active and user had media focused, clear media focus on `SearchOpen` (search takes priority). Restore is not needed — user can re-enter media focus after closing search.
- [ ] Search + modal interaction: if media modal is open, `/` does nothing (modal swallows keys). User must close modal first.
- [ ] Search + live reload: when file reloads, recompute matches against new `viewerState.raw`. If match count changes:
  - clamp `currentMatch` to new count (same pattern as `rescanCursor`)
  - if all matches gone, close search active phase
- [ ] Search + layout change: matches are in raw text, which is layout-independent. Changing layout preserves search state. Source pane re-renders with highlights in new dimensions.
- [ ] Search + browser return: `ReturnToBrowser` clears `searchState` (search is viewer-only)
- [ ] Empty query handling: pressing Enter with empty query exits search (same as Esc)
- [ ] Very long query: no explicit cap needed — the status bar naturally truncates via flex layout. But cap at 200 chars in reducer as a safety bound.
- [ ] Performance: `findMatches` is O(n*m) where n = raw length, m = query length. For typical markdown files (< 100KB), this is <1ms. No debouncing needed. If needed later, gate recomputation behind `useMemo`.
- [ ] Test: SearchOpen clears media focus
- [ ] Test: ReturnToBrowser clears searchState
- [ ] Test: live reload clamps currentMatch
- [ ] Test: empty Enter closes search

**Files touched:**
- `src/app/state.ts` — edge case guards in reducer
- `src/renderer/opentui/app.tsx` — live reload integration

---

## Race Conditions and Mitigations

| Race | Description | Mitigation |
|------|-------------|------------|
| Stale matches after live reload | File content changes while search is active; match positions now reference old text | Recompute matches from new `viewerState.raw` in `useMemo`; clamp `currentMatch` in reducer |
| `n`/`N` ambiguity | `n`/`N` used for both media navigation and search navigation | Search active = search owns `n`/`N`; media focus suppressed during search |
| Search input during modal | User presses `/` while media modal is open | Modal key handler runs first, swallows `/` — search never activates |
| Scroll-to-match after layout change | Layout changes while search is active; source pane dimensions change | `useEffect` triggers on `currentMatch` change, which re-scrolls. Layout change alone doesn't move the match cursor. |

## Acceptance Criteria

- [ ] `/` in viewer mode opens search prompt at bottom of screen
- [ ] Typing updates the query in real time with match count display
- [ ] `Enter` confirms search, transitions to navigation mode
- [ ] `n` jumps to next match, `N` jumps to previous match, both wrap around
- [ ] `Esc` exits search from either input or active mode
- [ ] Matches highlighted in source pane with distinct current-match style
- [ ] Source pane scrolls to current match on `n`/`N` and on initial confirm
- [ ] No matches: clear visual feedback ("no matches" in search bar)
- [ ] Search preserves viewer state (layout, pane focus, scroll position in preview)
- [ ] `n`/`N` navigate search matches, not media, while search is active
- [ ] Search works in all layout modes (preview-only, side, top, source-only)
- [ ] Status bar legend updates to reflect search keybindings
- [ ] File live reload recomputes matches without crashing
- [ ] Browser return clears search state

## Key Bindings (Search Mode)

| Key | Input Phase | Active Phase | Normal Viewer (new) |
|-----|-------------|--------------|---------------------|
| `/` | -- | New search (close + reopen) | Open search |
| printable chars | Append to query | -- | -- |
| `Backspace` | Delete last char | -- | -- |
| `Ctrl+w` | Delete last word | -- | -- |
| `Ctrl+u` | Clear query | -- | -- |
| `Enter` | Confirm (-> active) | -- | -- |
| `n` | (consumed, no-op) | Next match | Focus next media |
| `N` | (consumed, no-op) | Prev match | Focus prev media |
| `Esc` | Close search | Close search | Modal/focus/browser/quit |
| `j`/`k`/scroll | (consumed) | Pass through to viewer | Normal scroll |
| `q` | (consumed) | Quit | Quit |

## Test Files

Following the co-located test file convention:
- `src/app/state-search.test.ts` — search reducer actions (Phase 1)
- `src/search/find.test.ts` — `findMatches` pure function (Phase 2)

## Dependencies & Risks

- **Source pane text splitting** — `SourcePane` currently renders text in 100-line chunks. Highlight injection requires splitting chunks at match boundaries. The `chunkLines` function needs to be aware of match positions, or highlighting needs to operate at a finer granularity (per-line). Risk: increased React element count for files with many matches. Mitigation: cap highlighted matches to visible viewport (the `viewportCulling` prop on scrollbox already handles this).
- **Scroll-to-match precision** — `ScrollBoxRenderable.scrollTo(position)` takes a pixel offset, not a line number. Need to compute the offset from the line number. OpenTUI scrollbox uses Yoga layout, so each `<text>` element's height equals its line count. Mitigation: estimate offset as `line * 1` (1 row per line in source pane), or use `scrollBy` relative to current position.
- **No preview pane search** — searching rendered preview would require IR-level match tracking. Deliberately out of scope. Users can switch to source-only or side layout to see matches in context.

## Sources & References

### Internal References

- State machine pattern: `src/app/state.ts` — useReducer, discriminated union actions, sub-reducers
- Browser filter input: `src/renderer/opentui/browser-keys.ts` — char-by-char key handling, FilterUpdate action
- Browser filter display: `src/renderer/opentui/browser-pane.tsx` — `HighlightedName` component, match count display
- Fuzzy match positions: `src/browser/fuzzy.ts` — `FuzzyMatch.positions` array for highlight indices
- Source pane: `src/renderer/opentui/source-pane.tsx` — text chunk rendering, scrollbox ref
- Viewer keys: `src/renderer/opentui/viewer-keys.ts` — key dispatch pattern, media focus routing
- Status bar: `src/renderer/opentui/status-bar.tsx` — bottom bar layout, legend rendering
- Media modal key swallowing: `src/renderer/opentui/viewer-keys.ts:handleModalKey` — precedent for mode-based key interception
- App key routing: `src/renderer/opentui/app.tsx:useKeyboard` — mode dispatch, media/viewer branching
