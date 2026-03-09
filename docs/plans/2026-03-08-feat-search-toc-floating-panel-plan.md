---
title: "Search + TOC + FloatingPanel Shared Infrastructure"
type: feat
status: active
date: 2026-03-08
origin: docs/brainstorms/2026-03-08-search-toc-floating-panel-brainstorm.md
supersedes:
  - docs/plans/2026-03-07-feat-search-plan.md
  - docs/plans/2026-03-07-feat-toc-plan.md
---

# Search + TOC + FloatingPanel Shared Infrastructure

## Enhancement Summary

**Deepened on:** 2026-03-08
**Review agents used:** TypeScript reviewer, Pattern recognition, Performance oracle, Architecture strategist, Code simplicity, Frontend races, Security sentinel, OpenTUI research
**Focus areas:** UX polish, reusability within the Liham ecosystem

### Key Improvements

**Reusability:**
1. **`extractText()` in `src/ir/text-utils.ts`** — not buried in TOC module. Reusable for alt text, tooltips, search previews, reading time estimation
2. **`splitHighlightSegments()` shared utility** — generic highlight splitting function shared by browser `HighlightedName` and source pane search highlights
3. **`handleTextInputKey` utility** — DRY between browser filter and search input (backspace, ctrl+w, ctrl+u)
4. **`handleFloatingPanelKey` returns result object** — reusable for any future panel (command palette, help overlay, bookmark list)
5. **`estimateHeight(node, paneWidth)` paneWidth-aware** — paragraph wrapping accuracy, reusable for virtual scrolling
6. **`legendEntries()` as named branch functions** — mirrors key routing priority, scalable to future features
7. **FloatingPanel position extensible** — enum today, but structured for future `'bottom-center'` (command palette) without API break

**Correctness:**
8. **SearchState as discriminated union** — eliminates meaningless `matchCount`/`currentMatch` fields during input phase
9. **TOC state as `TocState | null`** — eliminates invalid state `{ tocOpen: false, tocCursorIndex: 3 }`
10. **Live reload OOB crash fix** — clamp `currentMatch` in `useMemo`, not async dispatch
11. **Pre-compute `estimatedOffset` in `TocEntry`** — avoids threading `irNodes` through `RenderResult`

**Performance:**
12. **Viewport-scoped highlighting** — only highlight chunks near viewport, preventing element count explosion
13. **Pre-compute line offset table** — binary search for line/column in `findMatches`, avoids O(n*k)
14. **Match count cap (10,000)** — prevents OOM on large files with single-char queries

**UX:**
15. **Incremental highlight-as-you-type** — architecture supports this with zero extra work (useMemo already recomputes on each keystroke)
16. **SearchTokens reduced from 8 to 4** — derive prompt/query/matchCount colors from existing theme tokens
17. **0 matches: stay in input with error** — user edits query without retyping

### Naming Fixes

- `SearchMatch.index` → `charOffset` (avoids ambiguity with match ordinal)
- `TocEntry.nodeIndex` → `blockIndex` (matches `RenderContext.blockIndex`)
- `FloatingPanelItem.prefix` → required `string` (use `''` for none; `exactOptionalPropertyTypes` safe)

### Ecosystem Reusability Decisions

| Concern | Verdict | Rationale |
|---------|---------|-----------|
| Generic `OverlayState<T>` | **Don't do** | States are structurally different. `\| null` convention is sufficient. |
| `createSubReducer` helper | **Don't do** | The pattern is just "write a function." Boilerplate is 5 lines. |
| Unified scroll API | **Don't do** | Source scroll is exact, preview scroll is heuristic. Co-location in `scroll-utils.ts` is the right unification level. |
| Key routing registry | **Do later** | Linear if/else is fine at 6 levels. Add a precedence comment now. Refactor to handler list at ~10 levels. |
| Feature flags | **Don't do** | Features are inert until keypress. No config infrastructure needed. |
| Visitor/plugin system for RenderContext | **Do later** | Document as future architecture in comments. Build when 3rd accumulator arrives. |
| TOC collapsible headings | **Don't do** | Breaks pre-computed offsets. Keep TOC flat. |
| TOC current-position indicator | **Do later** | Needs scroll tracking infrastructure. Post-launch enhancement. |

## Overview

Three interconnected features sharing two primitives: a reusable **FloatingPanel** component (extracted from MediaGallery) and **scroll utilities** (line-based for search, IR height estimation for TOC). Search adds vim-style `/` find with match highlighting in the source pane. TOC adds a `t`-toggled heading panel that jumps to sections in the preview pane. Both can be active simultaneously.

## Problem Statement

Users viewing long markdown files have no way to search for content or see document structure. The only navigation is manual scrolling. Search provides find-and-jump. TOC provides structural overview and section navigation. Both need floating overlays and scroll positioning — capabilities that already exist in MediaGallery but are hardcoded.

## Proposed Solution

Extract shared infrastructure first (FloatingPanel + scroll utilities), then build search and TOC on top. This avoids triple-implementing overlay/scroll patterns and makes MediaGallery cleaner.

(see brainstorm: `docs/brainstorms/2026-03-08-search-toc-floating-panel-brainstorm.md`)

## Technical Approach

### Architecture

Three layers, same pattern as the media system:

1. **Shared primitives** — `FloatingPanel` (visual + key handler utility), `scrollToLine()`, `estimateHeadingOffset()`
2. **State** — `searchState: SearchState | null`, `tocState: TocState | null` in `AppState`, with sub-reducers
3. **Key routing** — priority chain in `dispatchViewerKey`. Add a comment at the top of the chain documenting this order:
   ```ts
   // key priority: search-input > search-active > toc > modal > media-focus > normal
   ```
   1. Search input phase (swallows all keys)
   2. Search active phase (owns `n`/`N`, passes scroll through)
   3. TOC open (owns j/k/Enter/Esc/g/G, passes `/` through to activate search)
   4. Media modal open (existing)
   5. Media focus mode (existing)
   6. Normal viewer keys (existing)

### Esc Priority Chain (all states)

1. Clear selection (existing)
2. Close search (input or active phase)
3. Close TOC
4. Close modal / unfocus media (existing)
5. Return to browser (existing)
6. Quit (existing)

### Key Decisions (from brainstorm)

1. **FloatingPanel = visual component + utility function** — `FloatingPanel` renders the overlay (position, border, background, zIndex, sliding window, item rows). `handleFloatingPanelKey()` is a co-located utility function called by App's `useKeyboard`. OpenTUI supports one `useKeyboard` per tree, so key handling must stay in App.

2. **SearchBar = separate component** — replaces status bar via conditional render, not a FloatingPanel. Structurally different (text input bar, not floating overlay).

3. **TOC scroll = IR node height estimation** — pure `estimateHeight(node)` function walks IR nodes summing estimated row heights. Testable, no render coupling, accurate from day one.

4. **TOC + search coexist** — different screen areas (TOC = right panel, search = bottom bar). `/` passes through from TOC to activate search. When both active, TOC owns `j`/`k`, search owns `n`/`N`.

5. **Search in preview-only layout** — search works in all layouts. Search bar shows match count. Highlights only visible when source pane is visible. No forced layout switch.

6. **0 matches on Enter** — stay in input phase with error indicator ("no matches" in red), not close. User can edit query without retyping.

7. **State resets** — `ReturnToBrowser` AND `OpenFile` both clear `searchState` and `tocOpen`.

8. **ToggleToc guard** — no-op when `tocEntries.length === 0` (guard at dispatch site, not reducer).

## Implementation Phases

### Phase 0: FloatingPanel + Scroll Utilities

Extract the floating overlay pattern from MediaGallery into a reusable component. Add scroll utilities.

#### 0.1: FloatingPanel Component

- [ ] Create `src/renderer/opentui/floating-panel.tsx`:

```tsx
interface FloatingPanelItem {
  label: string
  prefix: string  // e.g., media type icon, heading indent. '' for none.
}

interface FloatingPanelProps {
  readonly position: 'bottom-left' | 'right'  // extensible: add 'bottom-center' for command palette, 'center' for help
  readonly width: number
  readonly height: number
  readonly zIndex: number
  readonly title: string | null  // null = no title row. future: ReactNode for rich headers
  readonly theme: ThemeTokens
  readonly items: readonly FloatingPanelItem[]
  readonly cursorIndex: number
  readonly maxVisible?: number | undefined  // default 8. explicit | undefined for exactOptionalPropertyTypes
  readonly termWidth: number
  readonly footer?: ReactNode | undefined  // gallery info/progress rows
}
// future consumers: command palette (position='bottom-center', items=commands),
// help overlay (position='center', items=key bindings), bookmark list
```

- [ ] Extract absolute positioning logic from `media-gallery.tsx:144-158`
- [ ] Extract sliding window logic from `media-gallery.tsx:133-141` — parameterized by `maxVisible`
- [ ] Extract row rendering from `media-gallery.tsx:164-186` — focused/unfocused styles, truncation
- [ ] Position computation:
  - `'bottom-left'`: `bottom: 2, left: 1` (above status bar, same as gallery)
  - `'right'`: `top: 0, right: 0` (full height minus status bar)
- [ ] Background: `theme.codeBlock.backgroundColor`, border: `theme.pane.focusedBorderColor`
- [ ] Focused row: `theme.browser.selectedBg` / `selectedFg`

- [ ] Export `handleFloatingPanelKey()` utility function:

```tsx
interface FloatingPanelKeyResult {
  consumed: boolean
  newCursor?: number   // if cursor moved, the clamped new index
  action?: 'select' | 'close'
}

function handleFloatingPanelKey(
  key: KeyEvent,
  itemCount: number,
  cursor: number,
): FloatingPanelKeyResult
```

- Returns a result object — caller decides what to dispatch. No callbacks, no indirection.
- Handles: `j`/`down` (cursor+1), `k`/`up` (cursor-1), `g`/`home` (top), `G`/`end` (bottom), `return` → `action: 'select'`, `escape`/`q` → `action: 'close'`
- Clamps `newCursor` to `[0, itemCount - 1]`
- Returns `{ consumed: false }` for unhandled keys (pass through)

#### 0.2: Refactor MediaGallery

- [ ] Refactor `src/renderer/opentui/media-gallery.tsx` to use `FloatingPanel`
- [ ] Gallery becomes a thin wrapper that:
  - Converts `MediaEntry[]` to `FloatingPanelItem[]` (label = filename, prefix = type icon)
  - Renders `FloatingPanel` with `position='bottom-left'`, `zIndex=150`
  - Passes extra info rows (frame info, progress bar, video info) via `footer` prop
- [ ] `galleryDimensions()` still exported, computed from FloatingPanel dimensions
- [ ] Existing gallery key handling (`n`/`N` in viewer-keys) unchanged — gallery doesn't use `handleFloatingPanelKey` since its nav keys (`n`/`N`) differ from the standard `j`/`k`

- [ ] Test: gallery renders identically after refactor (visual snapshot or structural check)
- [ ] Test: `FloatingPanel` renders with correct positioning for `bottom-left`
- [ ] Test: `FloatingPanel` renders with correct positioning for `right`
- [ ] Test: sliding window centers on cursor for long lists
- [ ] Test: `handleFloatingPanelKey` returns true for handled keys, false for unhandled
- [ ] Test: cursor clamping at boundaries

**Files:**
- `src/renderer/opentui/floating-panel.tsx` (new)
- `src/renderer/opentui/media-gallery.tsx` (refactor)
- `src/renderer/opentui/media-gallery.test.ts` (update)

#### 0.3: Shared Highlight Utility

Extract the highlight splitting logic from `browser-pane.tsx:25-80` (`HighlightedName`) into a reusable pure function. Both browser filter highlights and search match highlights use the same "split text by character positions" algorithm.

- [ ] Create `src/renderer/opentui/highlight-splits.ts`:

```ts
interface TextSegment {
  text: string
  highlighted: boolean
}

// split text into segments at highlight boundaries — O(n) single pass
// reusable: browser filter highlights + source pane search highlights
function splitHighlightSegments(
  text: string,
  highlightedPositions: ReadonlySet<number>,
): TextSegment[]
```

- [ ] Refactor `HighlightedName` in `browser-pane.tsx` to use `splitHighlightSegments`
- [ ] Test: empty positions → single unhighlighted segment
- [ ] Test: contiguous positions merge into one highlighted segment
- [ ] Test: alternating positions produce correct segments

**Files:**
- `src/renderer/opentui/highlight-splits.ts` (new)
- `src/renderer/opentui/highlight-splits.test.ts` (new)
- `src/renderer/opentui/browser-pane.tsx` (refactor)

#### 0.4: Legend Entries Refactor

Refactor `legendEntries()` from a growing if/else blob into named branch functions that mirror the key routing priority chain. This scales cleanly as new features add their own legend branches.

- [ ] Extract each legend branch into a named function in `src/app/state.ts`:
  - `browserLegend(page)`, `searchInputLegend()`, `searchActiveLegend(page)`, `tocLegend(page)`, `modalLegend(modal, page)`, `mediaFocusLegend(page)`, `viewerLegend(state, page)`
- [ ] Main `legendEntries()` becomes a linear priority dispatcher:

```ts
export function legendEntries(state: AppState): LegendEntry[] {
  if (state.mode === 'browser') return browserLegend(state.legendPage)
  if (state.searchState?.phase === 'input') return searchInputLegend()
  if (state.searchState?.phase === 'active') return searchActiveLegend(state.legendPage)
  if (state.tocState?.kind === 'open') return tocLegend(state.legendPage)
  if (state.mediaModal.kind !== 'closed') return modalLegend(state.mediaModal, state.legendPage)
  if (state.mediaFocusIndex != null) return mediaFocusLegend(state.legendPage)
  return viewerLegend(state, state.legendPage)
}
```

> **Reusability:** each feature owns its legend function. Adding a new feature = adding one function + one line in the dispatcher. Priority chain matches key routing exactly — one mental model for both.

**Files:**
- `src/app/state.ts`

#### 0.5: Scroll Utilities + IR Text Utils

- [ ] Create `src/ir/text-utils.ts` (if not yet created in Phase 2.1 prep):
  - `extractText(children: IRNode[]): string` — recursive plain text from inline nodes
  - Test: `src/ir/text-utils.test.ts`

- [ ] Create `src/renderer/opentui/scroll-utils.ts`:

```ts
// source pane: exact line-based scroll
// padding offset of 1 from source-pane.tsx <box style={{ padding: 1 }}>
function scrollToLine(ref: ScrollBoxRef, line: number): void {
  ref.scrollTo(line + 1)
}

// preview pane: IR node height estimation
function estimateHeadingOffset(
  nodes: CoreIRNode[],
  headingIndex: number,
): number
```

- [ ] `estimateHeight(node: CoreIRNode, paneWidth?: number): number` — pure function, height in terminal rows. `paneWidth` enables accurate paragraph wrapping (defaults to 80):

| Node Type | Estimated Height |
|-----------|-----------------|
| heading | 1 (text) + 1 (marginBottom) = 2 |
| paragraph | `Math.ceil(extractText(children).length / (paneWidth - 2)) + 1` (wrapping + margin) |
| codeBlock | code line count + 2 (border) + 1 (language label) + 1 (margin) |
| list | sum of item heights (bullet + content lines) |
| blockquote | content lines + 2 (border) |
| thematicBreak | 1 |
| table | header row + separator + data rows + 2 (border) |
| image | estimated 10 rows (placeholder, actual varies) |
| html | 1 |

> **Reusability:** `estimateHeight` is useful beyond TOC — virtual scrolling, page break estimation, reading time. Accepting `paneWidth` makes paragraph estimates accurate instead of guessing. Uses `extractText()` from `src/ir/text-utils.ts`.

- [ ] `estimateHeight` depth guard: cap recursion at 100 levels to prevent stack overflow on pathologically nested IR (e.g., deeply nested blockquotes). Return 1 at max depth.
- [ ] `estimateHeadingOffset(nodes, headingIndex)` — walk top-level IR nodes, sum `estimateHeight()` until reaching the Nth heading, return accumulated rows
- [ ] Test: `estimateHeight` for each node type
- [ ] Test: `estimateHeight` depth guard returns 1 at max depth
- [ ] Test: `estimateHeadingOffset` with mixed content document
- [ ] Test: `scrollToLine` applies +1 offset

**Files:**
- `src/renderer/opentui/scroll-utils.ts` (new)
- `src/renderer/opentui/scroll-utils.test.ts` (new)

---

### Phase 1: Search

Vim-style `/` search within raw markdown. Five sub-phases.

#### 1.1: State Machine + Actions

Add search state to the app state machine. Pure reducer logic.

- [ ] Add `SearchState` as discriminated union to `src/app/state.ts`:

```ts
// discriminated union — input phase has no match tracking fields
type SearchState =
  | { phase: 'input'; query: string }
  | { phase: 'active'; query: string; matchCount: number; currentMatch: number }
```

> **Research insight (TypeScript review):** flat `{ phase, query, matchCount, currentMatch }` carries meaningless `matchCount`/`currentMatch` during input phase. Discriminated union prevents accidental reads without narrowing and makes "0 matches stays in input" trivially correct.

- [ ] Add `searchState: SearchState | null` to `AppState` (null = inactive)
- [ ] Create `src/app/state-search.ts` sub-reducer (follows `state-media-modal.ts` pattern):
  - `SearchOpen` → `{ phase: 'input', query: '' }`. Also clears `mediaFocusIndex` (search takes priority over media focus).
  - `SearchUpdate` → update `query` (truncate to 200 chars via `.slice(0, 200)`)
  - `SearchConfirm` → if `matchCount > 0`: transition to `{ phase: 'active', query, matchCount, currentMatch: 0 }`. If `matchCount === 0`: stay in input phase (don't close — show error indicator)
  - `SearchNext` → `currentMatch = (currentMatch + 1) % matchCount` (no-op if 0)
  - `SearchPrev` → `currentMatch = (currentMatch - 1 + matchCount) % matchCount`
  - `SearchClose` → set `searchState` to null
- [ ] Wire into `appReducer` switch
- [ ] Guard: `SearchOpen` no-op in browser mode
- [ ] `ReturnToBrowser` and `OpenFile` clear `searchState` to null
- [ ] Update `initialState()`: `searchState: null`
- [ ] Update `legendEntries()`:
  - search input: `Esc: cancel · Enter: confirm · type: search`
  - search active: `n/N: next/prev · Esc: close · /: new search`
  - normal viewer: add `/ search` to nav legend page

- [ ] Test: `SearchOpen` creates initial search state
- [ ] Test: `SearchOpen` clears media focus
- [ ] Test: `SearchUpdate` updates query and resets currentMatch
- [ ] Test: `SearchConfirm` with matches transitions to active
- [ ] Test: `SearchConfirm` with 0 matches stays in input phase
- [ ] Test: `SearchNext`/`SearchPrev` wrap at boundary
- [ ] Test: `SearchClose` clears searchState to null
- [ ] Test: `SearchOpen` no-op in browser mode
- [ ] Test: `ReturnToBrowser` clears searchState
- [ ] Test: `OpenFile` clears searchState

**Files:**
- `src/app/state.ts`
- `src/app/state-search.ts` (new)
- `src/app/state-search.test.ts` (new)

#### 1.2: Search Logic + Key Handling

Pure search function and key handlers.

- [ ] Create `src/search/find.ts`:

```ts
interface SearchMatch {
  charOffset: number  // character offset in raw string
  line: number        // 0-based line number
  column: number      // 0-based column
}

function findMatches(raw: string, query: string): SearchMatch[]
```

- Case-insensitive (`.toLowerCase()` once upfront, use native `indexOf` for engine-optimized search)
- Non-overlapping matches (advance by `query.length` after each match — less surprising for users)
- Empty query returns `[]`
- **Match count cap**: stop after `MAX_MATCHES = 10_000` to prevent OOM on large files with short queries
- **Pre-compute line offset table** for O(n + k*log(L)) instead of O(n*k):

```ts
// build line starts in single pass: O(n)
const lineStarts = [0]
for (let i = 0; i < raw.length; i++) {
  if (raw[i] === '\n') lineStarts.push(i + 1)
}
// binary search for each match: O(log L)
const line = binarySearchLineStarts(lineStarts, charOffset)
const column = charOffset - lineStarts[line]
```

- [ ] Extract `handleTextInputKey` utility into `src/renderer/opentui/text-input-keys.ts`:

```ts
// shared between browser filter and search input — DRY
function handleTextInputKey(key: KeyEvent, currentText: string, maxLength?: number): { newText: string; consumed: boolean }
```

  - Handles: printable chars (append), backspace (delete last), ctrl+w (delete word), ctrl+u (clear)
  - Refactor `browserFilterKey` in `browser-keys.ts` to use this utility

> **Research insight (Pattern recognition):** browser filter and search input have identical text editing logic. Extract once, reuse twice.

- [ ] Create `src/renderer/opentui/search-keys.ts`:
  - `handleSearchKey(key, searchState, dispatch, matchCount): boolean` — takes `SearchState` (narrowed), not full `AppState`
  - Input phase: delegate to `handleTextInputKey` → `SearchUpdate`, Enter → `SearchConfirm`, Esc → `SearchClose`
  - Active phase: `n` → `SearchNext`, `N` → `SearchPrev`, `/` → `SearchClose` + `SearchOpen` (new search), Esc → `SearchClose`, `q` → `Quit`
  - Input phase swallows ALL other keys (no scroll, no layout change)
  - Active phase: return `false` for unhandled keys (scroll j/k pass through)

- [ ] Modify `src/renderer/opentui/viewer-keys.ts`:
  - Add `/` to `VIEWER_KEY_MAP` → dispatches `SearchOpen`

- [ ] Modify `src/renderer/opentui/app.tsx` key routing:
  - Insert search branch at top of `dispatchViewerKey` (before TOC, modal, media):
    ```ts
    if (state.searchState != null) {
      const consumed = handleSearchKey(key, state, dispatch, matchCount)
      if (consumed) return
      // fall through for scroll keys in active phase
    }
    ```
  - Compute matches via `useMemo` with **defensive clamping** to prevent OOB crash on live reload:

    ```ts
    const { matches, safeIndex } = useMemo(() => {
      const m = findMatches(viewerState.raw, state.searchState?.query ?? '')
      const raw = state.searchState?.phase === 'active' ? state.searchState.currentMatch : 0
      const safe = m.length === 0 ? 0 : Math.min(raw, m.length - 1)
      return { matches: m, safeIndex: safe }
    }, [viewerState.raw, state.searchState])
    ```

    > **Research insight (Frontend races, HIGH):** after live reload, `currentMatch` can point past end of new matches array. `matches[staleIndex]` would be `undefined`, causing `scrollToLine(ref, undefined.line)` crash. Clamp in `useMemo`, reconcile lazily via `useEffect` dispatch.

- [ ] Test: `findMatches` finds all occurrences, case-insensitive
- [ ] Test: `findMatches` empty query → empty array
- [ ] Test: `findMatches` overlapping matches ("aa" in "aaa" → positions 0, 1)
- [ ] Test: `findMatches` correct line/column for multi-line text
- [ ] Test: search key handler routes chars to SearchUpdate in input phase
- [ ] Test: Enter dispatches SearchConfirm with match count
- [ ] Test: n/N in active phase dispatch SearchNext/SearchPrev
- [ ] Test: Esc dispatches SearchClose
- [ ] Test: scroll keys pass through in active phase

**Files:**
- `src/search/find.ts` (new)
- `src/search/find.test.ts` (new)
- `src/renderer/opentui/search-keys.ts` (new)
- `src/renderer/opentui/viewer-keys.ts`
- `src/renderer/opentui/app.tsx`

#### 1.3: Search Bar UI

Bottom bar that replaces status bar during search.

- [ ] Add `SearchTokens` to `src/theme/types.ts`:

```ts
interface SearchTokens {
  noMatchColor: string        // red for error state
  highlightBg: string         // background for non-current matches
  highlightFg: string         // foreground for non-current matches
  currentHighlightBg: string  // background for current match
}
```

> **Research insight (Simplicity):** reduced from 8 to 4 tokens. Derive the rest from existing theme:
> - Prompt `/` color → `theme.pane.focusedBorderColor`
> - Query text → `theme.paragraph.textColor`
> - Match count → `theme.pane.focusedBorderColor`
> - Current highlight fg → `theme.codeBlock.backgroundColor` (dark on bright orange)

- [ ] Add token values to `src/theme/dark.ts` (Tokyo Night Storm):
  - noMatchColor: `#f7768e` (red)
  - highlightBg: `#3d59a1` (blue-gray), highlightFg: `#c0caf5` (fg)
  - currentHighlightBg: `#ff9e64` (orange)
- [ ] Add token values to `src/theme/light.ts`

- [ ] Create `src/renderer/opentui/search-bar.tsx`:
  - Layout: `/ {query}_` left, `{current+1}/{total}` right (mirrors browser filter)
  - Input phase: cursor indicator (`_` appended)
  - Active phase: show match position counter
  - 0 matches: query text in `noMatchColor`, "no matches" label
  - **Incremental UX**: show live match count during input phase (e.g., `/ test_ 3 matches`). The architecture already supports this — `useMemo` recomputes matches on every `SearchUpdate`, and the search bar reads `matches.length` regardless of phase. No extra work needed.

- [ ] Modify `src/renderer/opentui/app.tsx`:
  - Conditional render: `{state.searchState != null ? <SearchBar /> : <StatusBar />}`

- [ ] Test: search bar renders query text
- [ ] Test: search bar shows match count in active phase
- [ ] Test: search bar shows "no matches" styling

**Files:**
- `src/theme/types.ts`
- `src/theme/dark.ts`
- `src/theme/light.ts`
- `src/renderer/opentui/search-bar.tsx` (new)
- `src/renderer/opentui/app.tsx`

#### 1.4: Source Pane Highlighting + Scroll-to-Match

Highlight matches in source pane, scroll to current match.

- [ ] Modify `src/renderer/opentui/source-pane.tsx`:
  - Accept optional `searchHighlight` prop (bundled to avoid partial-state):
    ```ts
    searchHighlight?: { matches: SearchMatch[]; currentIndex: number } | undefined
    ```
  - **Memoize `chunkLines`**: `useMemo(() => chunkLines(content, 100), [content])` — prevents re-splitting on every `n`/`N` keypress
  - **Viewport-scoped highlighting**: only apply highlight splitting to chunks near the viewport. Pre-compute a `Map<number, SearchMatch[]>` keyed by line number for O(1) chunk-to-matches lookup. Chunks outside viewport render as plain `<text>`.
  - **Cross-chunk match boundaries**: a match may span a chunk boundary (e.g., match starts at line 99, extends to line 101). The line-keyed map handles this: each match is indexed by its start line, and the highlight function clips the highlight range to the chunk's line range. Partial highlights at chunk edges are visually acceptable.
  - Current match: `currentHighlightBg` + `theme.codeBlock.backgroundColor` (fg)
  - Other matches: `highlightBg`/`highlightFg`
  - Highlight function uses `splitHighlightSegments` from `highlight-splits.ts` (extracted in Phase 0.3)

> **Research insight (Performance, HIGH):** naive highlighting on all chunks creates element count explosion (500+ matches → 2000+ spans). Viewport culling skips rendering culled chunks, but React still diffs the full JSX array. Viewport-scoping bounds highlight elements to ~20 regardless of total matches.

- [ ] Scroll-to-match in `app.tsx`:
  - `useEffect` watching `state.searchState?.currentMatch`
  - Call `scrollToLine(sourceRef, matches[currentMatch].line)` from `scroll-utils.ts`
  - Also scroll on `SearchConfirm` (first match)

- [ ] Thread match data through `renderViewerLayout` to `SourcePane`

- [ ] Test: source pane with no matches renders normally
- [ ] Test: source pane highlights match positions
- [ ] Test: current match has distinct highlight style
- [ ] Test: scroll-to-match positions correctly (+1 for padding)

**Files:**
- `src/renderer/opentui/source-pane.tsx`
- `src/renderer/opentui/app.tsx`

#### 1.5: Edge Cases + Polish

- [ ] Search + modal: modal key handler runs first, swallows `/` — search never activates (already handled by routing priority)
- [ ] Search + live reload: `useMemo` recomputes matches from new `viewerState.raw`. Clamp `currentMatch` via `SearchConfirm` re-dispatch if match count changes
- [ ] Search + layout change: search state preserved, highlights re-render in new dimensions
- [ ] Search + browser return: `ReturnToBrowser` clears searchState (added in 1.1)
- [ ] Empty Enter handling: 0 matches stays in input phase (added in 1.1)
- [ ] Query cap: 200 chars in reducer as safety bound
- [ ] `n`/`N` conflict: search active → search owns them; key routing handles this (added in 1.2)

- [ ] Test: live reload clamps currentMatch
- [ ] Test: empty Enter stays in input phase
- [ ] Test: query capped at 200 chars

**Files:**
- `src/app/state-search.ts`
- `src/renderer/opentui/app.tsx`

---

### Phase 2: TOC

Table of contents panel with heading extraction and jump-to-heading.

#### 2.1: Heading Collection

Collect headings during IR-to-JSX traversal, same pattern as media nodes.

- [ ] Create `src/ir/text-utils.ts` — reusable text extraction from IR nodes:

```ts
// reusable: TOC headings, alt text fallback, search previews, reading time
function extractText(children: IRNode[]): string
```

- `extractText()` recursively walks inline children, concatenates `TextNode.value` and `InlineCodeNode.value`, strips formatting (Strong, Emphasis, Link, Strikethrough)
- Lives in `src/ir/` (not `src/renderer/opentui/`) because it operates on IR types with no React dependency

> **Reusability:** extracted to `src/ir/` so scroll-utils, TOC, and future features (alt text, tooltips) import from the same place.

- [ ] Create `src/renderer/opentui/toc.ts` — `TocEntry` type + heading-to-panel-item conversion:

```ts
interface TocEntry {
  level: 1 | 2 | 3 | 4 | 5 | 6
  text: string             // plain text from heading children (via extractText)
  blockIndex: number       // sequential block index (matches RenderContext.blockIndex)
  estimatedOffset: number  // pre-computed row offset from estimateHeadingOffset()
}
```

- [ ] Extend `RenderContext` in `src/renderer/opentui/index.tsx`:
  - Add `toc: TocEntry[]` accumulator
  - Add `blockIndex: number` counter (incremented per top-level block node)
  - Add `irNodes: CoreIRNode[]` reference (for computing `estimatedOffset` at collection time)

- [ ] In `renderNode()` case `'heading'`: push `TocEntry` to `ctx.toc`, computing `estimatedOffset` inline via `estimateHeadingOffset(ctx.irNodes, ctx.blockIndex)`

> **Research insight (Architecture):** pre-computing `estimatedOffset` during traversal avoids threading `irNodes` through `RenderResult`. The consumer (scroll jump) reads a single number from `TocEntry` instead of re-walking the IR tree.

- [ ] Extend `RenderResult`:
  - `tocEntries: TocEntry[]`
  - `totalBlockCount: number`
  - (no `irNodes` needed — offset pre-computed in `TocEntry`)

- [ ] Test: document with h1-h3 returns correct TocEntry[] with levels and text
- [ ] Test: heading with bold/italic/code children extracts plain text
- [ ] Test: document with no headings returns empty tocEntries
- [ ] Test: blockIndex increments correctly for mixed content
- [ ] Test: estimatedOffset pre-computed correctly for each heading

**Files:**
- `src/ir/text-utils.ts` (new — or already created in Phase 0.5)
- `src/ir/text-utils.test.ts` (new)
- `src/renderer/opentui/toc.ts` (new)
- `src/renderer/opentui/toc.test.ts` (new)
- `src/renderer/opentui/index.tsx`

#### 2.2: State Machine Additions

- [ ] Add `TocState` type and `tocState: TocState | null` to `AppState` in `src/app/state.ts`:

```ts
// null = closed. discriminated union eliminates invalid {tocOpen: false, tocCursorIndex: 3}
type TocState =
  | { kind: 'open'; cursorIndex: number }
  | { kind: 'jumping'; cursorIndex: number }  // transient — triggers scroll effect, then → null
```

> **Research insight (TypeScript review):** flat `{ tocOpen: boolean, tocCursorIndex: number }` allows `{ tocOpen: false, tocCursorIndex: 3 }` — meaningless state. `TocState | null` eliminates this class of bugs. The `'jumping'` kind replaces a ref for tracking the jump target.

- [ ] Create `src/app/state-toc.ts` sub-reducer:
  - `ToggleToc` → if null, set `{ kind: 'open', cursorIndex: 0 }`. If open, set null. (Guard at dispatch site: no-op when `tocEntries.length === 0`)
  - `SetTocCursor` → `{ kind: 'open', cursorIndex: index }`. Called with absolute index from `handleFloatingPanelKey`'s `newCursor`.
  - `TocJump` → set `{ kind: 'jumping', cursorIndex }` (scroll effect reads index, then dispatches `TocJumpComplete`)
  - `TocJumpComplete` → set null (scroll done)
  - `CloseToc` → set null
- [ ] Export `moveCursor()` from `state.ts` — currently exists but is not exported. TOC and FloatingPanel key handler both need it.

- [ ] Wire into `appReducer`
- [ ] `ReturnToBrowser` and `OpenFile` set `tocState` to null. Also reset preview pane scroll position on `OpenFile` to prevent stale scroll offset carrying into new file.
- [ ] Update `initialState()`: `tocState: null`
- [ ] Update `legendEntries()`:
  - TOC open: `j/k: navigate · Enter: jump · Esc: close · g/G: top/bottom`
  - Normal viewer: add `t TOC` to nav legend page

- [ ] Test: ToggleToc opens and closes
- [ ] Test: ToggleToc resets cursor to 0 on open
- [ ] Test: SetTocCursor updates cursor index
- [ ] Test: TocJump transitions to 'jumping' kind
- [ ] Test: TocJumpComplete clears tocState to null
- [ ] Test: ReturnToBrowser and OpenFile clear tocState

**Files:**
- `src/app/state.ts`
- `src/app/state-toc.ts` (new)
- `src/app/state-toc.test.ts` (new)

#### 2.3: TOC Panel + Key Routing

- [ ] Create `src/renderer/opentui/toc-panel.tsx`:
  - Uses `FloatingPanel` with `position='right'`, `zIndex=120`
  - Width: `Math.min(30, Math.floor(termWidth * 0.35))`
  - Height: clamped to available entries + chrome
  - Title row: `TOC [cursor+1/total]`
  - Heading indent relative to minimum level (normalize: min level = flush left, each level above adds 2 spaces). Prevents wasted space when docs start with h3.
  - Items: `FloatingPanelItem[]` with label = heading text, prefix = indent spaces

- [ ] Key routing in `app.tsx` — insert TOC branch after search, before modal:

```ts
if (state.tocState != null && state.tocState.kind === 'open') {
  // pass / through to activate search
  if (key.name === '/' && state.searchState == null) {
    dispatch({ type: 'SearchOpen' })
    return
  }
  const result = handleFloatingPanelKey(key, tocEntries.length, state.tocState.cursorIndex)
  if (result.consumed) {
    if (result.newCursor != null) dispatch({ type: 'SetTocCursor', index: result.newCursor })
    if (result.action === 'select') dispatch({ type: 'TocJump' })
    if (result.action === 'close') dispatch({ type: 'CloseToc' })
    return
  }
}
```

> **Research insight (Pattern recognition):** `handleFloatingPanelKey` returns `{ newCursor }` as absolute index. The action becomes `SetTocCursor { index }` instead of `TocCursorMove { direction }`, avoiding a redundant direction-to-index conversion in the reducer.

- [ ] `t` key in `VIEWER_KEY_MAP`:
  - Guard at dispatch site: no-op if `tocEntries.length === 0`
  - Guard: no-op if media modal is open
  - Guard: no-op in source-only layout (no preview pane)
  - If `tocOpen`: dispatch `CloseToc` (toggle behavior)
  - Otherwise: dispatch `ToggleToc`

- [ ] Test: TOC panel renders correct heading count
- [ ] Test: indentation normalizes to minimum level
- [ ] Test: / from TOC activates search
- [ ] Test: t toggles TOC
- [ ] Test: t no-op in source-only layout
- [ ] Test: t no-op with no headings

**Files:**
- `src/renderer/opentui/toc-panel.tsx` (new)
- `src/renderer/opentui/app.tsx`
- `src/renderer/opentui/viewer-keys.ts`

#### 2.4: App Integration + Scroll Jump

- [ ] Store `tocEntries` and `totalBlockCount` in `viewerState` (no `irNodes` — offset pre-computed in `TocEntry`)
- [ ] On live reload: update `tocEntries`, clamp `tocState.cursorIndex` if needed, close TOC if all headings removed
- [ ] Render `TocPanel` when `state.tocState?.kind === 'open' && tocEntries.length > 0`:
  - Hidden in source-only layout
  - Hidden when media modal is open

- [ ] Scroll-to-heading on `TocJump`:
  - `useEffect` watching `state.tocState?.kind === 'jumping'`:
    - Read `tocEntries[tocState.cursorIndex].estimatedOffset` (pre-computed, no re-walk)
    - `previewRef.current.scrollTo(offset)`
    - If scroll sync enabled: also sync source pane via existing `scrollWithSync` pattern
    - Dispatch `TocJumpComplete` to clear tocState to null

> **Research insight (Frontend races):** using a ref for the jump target creates a race: ref may be stale if a re-render intervenes. The `'jumping'` discriminated state is declarative — the `useEffect` fires on state transition, reads the cursor from state (always current), and completes atomically.

- [ ] Test: TOC panel appears on `t`, disappears on `Esc`
- [ ] Test: Enter on heading scrolls preview pane via estimatedOffset
- [ ] Test: TOC not rendered in source-only layout
- [ ] Test: live reload clamps TOC cursor
- [ ] Test: live reload with no headings closes TOC

**Files:**
- `src/renderer/opentui/app.tsx`
- `src/renderer/opentui/index.tsx`

---

## Key Bindings Summary

### Search Mode

| Key | Input Phase | Active Phase | Normal Viewer (new) |
|-----|-------------|--------------|---------------------|
| `/` | — | New search (close + reopen) | Open search |
| printable chars | Append to query | — | — |
| `Backspace` | Delete last char | — | — |
| `Ctrl+w` | Delete last word | — | — |
| `Ctrl+u` | Clear query | — | — |
| `Enter` | Confirm (→ active if matches, stay if 0) | — | — |
| `n` | swallowed | Next match | Focus next media |
| `N` | swallowed | Prev match | Focus prev media |
| `Esc` | Close search | Close search | (existing chain) |
| `j`/`k`/scroll | swallowed | Pass through | Normal scroll |
| `q` | swallowed (types 'q') | Pass through (→ Quit) | Quit |

### TOC Mode

| Key | TOC Open | Normal Viewer (new) |
|-----|----------|---------------------|
| `t` | Close TOC | Open TOC |
| `j` / `down` | Cursor down | Scroll down |
| `k` / `up` | Cursor up | Scroll up |
| `g` / `home` | Cursor top | Scroll top |
| `G` / `end` | Cursor bottom | Scroll bottom |
| `Enter` | Jump to heading | — |
| `Esc` | Close TOC | (existing chain) |
| `/` | Pass through → open search | Open search |
| `q` | Close TOC | Quit |

### Dual Active (Search Active + TOC Open)

| Key | Owner | Behavior |
|-----|-------|----------|
| `j`/`k` | TOC | Moves TOC cursor (search active passes through) |
| `n`/`N` | Search | Navigates matches |
| `Esc` | Search | Closes search (TOC stays open) |
| `Enter` | TOC | Jumps to heading |
| `/` | Search | New search |

## Race Conditions and Mitigations

| Race | Severity | Mitigation |
|------|----------|------------|
| Stale matches after live reload | HIGH | `useMemo` recomputes from new `viewerState.raw`; clamp `currentMatch` in same `useMemo` (not async dispatch — prevents `matches[staleIndex]` crash) |
| TOC cursor OOB after live reload | MEDIUM | Clamp `tocState.cursorIndex` in live reload handler; close TOC (set null) if all headings removed |
| `n`/`N` ambiguity (media vs search) | LOW | Key routing priority: search active > media focus. Explicit chain, no ambiguity |
| Search input during modal | LOW | Modal handler runs first, swallows `/`. `SearchOpen` is structurally unreachable |
| TOC + modal conflict | LOW | `t` no-op when modal open (guard at dispatch site) |
| Stale TOC scroll target | MEDIUM | Declarative `'jumping'` state → `useEffect` reads `estimatedOffset` from current `tocEntries` at scroll time, not from dispatch-time closure |
| TOC jump + scroll sync | LOW | Call `syncScroll()` after programmatic `scrollTo()` in same `useEffect` |
| OpenFile with stale search/TOC | LOW | Both cleared in `OpenFile` reducer case. Also reset preview/source scroll position to 0 |
| Cross-chunk match highlight | LOW | Line-keyed map clips highlights to chunk's line range; partial highlights at edges visually acceptable |
| `estimateHeight` stack overflow | LOW | Depth guard caps recursion at 100; returns 1 at max depth |

## File Map

### New Files (Shared Primitives)
- `src/ir/text-utils.ts` — `extractText()` reusable IR text extraction (TOC, alt text, tooltips, search previews)
- `src/ir/text-utils.test.ts`
- `src/renderer/opentui/floating-panel.tsx` — FloatingPanel component + `handleFloatingPanelKey` utility
- `src/renderer/opentui/highlight-splits.ts` — `splitHighlightSegments()` shared highlight utility (browser + search)
- `src/renderer/opentui/highlight-splits.test.ts`
- `src/renderer/opentui/scroll-utils.ts` — `scrollToLine`, `estimateHeight(node, paneWidth)`, `estimateHeadingOffset`
- `src/renderer/opentui/scroll-utils.test.ts`
- `src/renderer/opentui/text-input-keys.ts` — `handleTextInputKey` shared utility (browser filter + search)

### New Files (Search)
- `src/search/find.ts` — `findMatches`, `SearchMatch` type
- `src/search/find.test.ts`
- `src/renderer/opentui/search-bar.tsx` — search prompt component
- `src/renderer/opentui/search-keys.ts` — search key handler
- `src/app/state-search.ts` — search sub-reducer
- `src/app/state-search.test.ts`

### New Files (TOC)
- `src/renderer/opentui/toc.ts` — `TocEntry` type, heading-to-panel-item conversion
- `src/renderer/opentui/toc.test.ts`
- `src/renderer/opentui/toc-panel.tsx` — TOC panel component (wraps FloatingPanel)
- `src/app/state-toc.ts` — TOC sub-reducer (`TocState` discriminated union)
- `src/app/state-toc.test.ts`

### Modified Files
- `src/app/state.ts` — `SearchState`, `TocState`, actions, legend refactor (named branch functions), export `moveCursor()`
- `src/renderer/opentui/media-gallery.tsx` — refactor to use FloatingPanel
- `src/renderer/opentui/media-gallery.test.ts` — update for refactor
- `src/renderer/opentui/browser-pane.tsx` — refactor `HighlightedName` to use `splitHighlightSegments`
- `src/renderer/opentui/browser-keys.ts` — refactor to use `handleTextInputKey` from `text-input-keys.ts`
- `src/renderer/opentui/app.tsx` — key routing (6-level priority chain with precedence comment), search/TOC wiring, conditional renders
- `src/renderer/opentui/viewer-keys.ts` — `/` and `t` key bindings
- `src/renderer/opentui/source-pane.tsx` — match highlighting via `splitHighlightSegments`, `chunkLines` memoization
- `src/renderer/opentui/index.tsx` — RenderContext + RenderResult extensions for TOC
- `src/theme/types.ts` — SearchTokens
- `src/theme/dark.ts` — search token values
- `src/theme/light.ts` — search token values

## Acceptance Criteria

### Search
- [ ] `/` in viewer mode opens search prompt at bottom
- [ ] Typing updates query in real time with match count
- [ ] `Enter` confirms (active if matches, error indicator if 0)
- [ ] `n`/`N` navigate matches with wraparound
- [ ] `Esc` exits from either phase
- [ ] Matches highlighted in source pane, current match distinct
- [ ] Source pane scrolls to current match
- [ ] Works in all layouts (match count only in preview-only)
- [ ] `n`/`N` own search matches, not media, while active
- [ ] Legend updates for search states
- [ ] Live reload recomputes matches
- [ ] `ReturnToBrowser` and `OpenFile` clear search

### TOC
- [ ] `t` toggles TOC panel (right-aligned)
- [ ] All headings shown with level-based indentation (normalized)
- [ ] `j`/`k`/`g`/`G` navigate headings
- [ ] `Enter` jumps to heading in preview pane, closes panel
- [ ] `Esc` or `t` closes without jumping
- [ ] `/` from TOC activates search (both active)
- [ ] Hidden in source-only layout and when modal open
- [ ] No-op when document has no headings
- [ ] Legend updates when TOC open
- [ ] Live reload clamps cursor
- [ ] Scroll sync works after TOC jump

### FloatingPanel
- [ ] MediaGallery renders identically after refactor
- [ ] Gallery and TOC share FloatingPanel component
- [ ] Sliding window works for both consumers

### Integration
- [ ] Key routing priority chain: search input > search active > TOC > modal > media focus > normal (integration test covering all 6 levels)
- [ ] Dual active (search active + TOC open): `j`/`k` moves TOC, `n`/`N` navigates matches
- [ ] `OpenFile` clears search + TOC + resets scroll positions

## Future Extensions (Post-Launch)

Designed for but not implemented now. Each unlocked by the shared primitives built in Phase 0.

| Extension | Unlocked By | Effort |
|-----------|-------------|--------|
| **Command palette** (`:`/`ctrl+p`) | FloatingPanel + `handleFloatingPanelKey` + `handleTextInputKey` | Add `'bottom-center'` position variant, filtered item list |
| **Regex search** (`/pattern/` syntax) | `findMatches` interface | Detect `/…/` wrapper, use `RegExp` instead of `indexOf` |
| **Case-sensitive toggle** (`\C` suffix) | SearchState | Add `caseSensitive: boolean` to SearchState, detect `\C` on Enter |
| **Search & replace** | SearchState + `findMatches` offsets | Add `'replacing'` phase to SearchState, replacement input |
| **TOC current-position indicator** | `estimatedOffset` in TocEntry | Binary search on offsets from scroll position, `●`/`○` prefix |
| **Help overlay** | FloatingPanel | `position='center'`, static item list, no cursor |
| **Preview pane highlighting** | `splitHighlightSegments` + IR tree walk | Walk IR inline nodes, apply styles to matching text ranges |
| **`estimateHeight` calibration** | `estimateHeight(node, paneWidth)` | Post-render Yoga layout measurement, calibration table |
| **RenderContext visitor system** | Current accumulator pattern | Formalize when 3rd accumulator needed (image list, link index) |

## Sources & References

### Origin

- **Brainstorm:** [docs/brainstorms/2026-03-08-search-toc-floating-panel-brainstorm.md](docs/brainstorms/2026-03-08-search-toc-floating-panel-brainstorm.md) — key decisions: FloatingPanel with utility function key handling, SearchBar as separate component, IR height estimation for TOC scroll, TOC + search coexistence, sliding window in FloatingPanel

### Internal References

- Media gallery pattern: `src/renderer/opentui/media-gallery.tsx` — FloatingPanel extraction source
- Sub-reducer pattern: `src/app/state-media-modal.ts` — canonical example
- Browser filter input: `src/renderer/opentui/browser-keys.ts` — char-by-char key handling
- Browser highlight: `src/renderer/opentui/browser-pane.tsx:25-80` — `HighlightedName` component
- Key routing: `src/renderer/opentui/viewer-keys.ts` — dispatch priority chain
- IR types: `src/ir/types.ts` — `HeadingNode`, inline node types
- Status bar: `src/renderer/opentui/status-bar.tsx` — replaced by SearchBar
- Source pane chunks: `src/renderer/opentui/source-pane.tsx` — 100-line chunk rendering
- Theme tokens: `src/theme/types.ts` — ThemeTokens interface

### Superseded Plans

- `docs/plans/2026-03-07-feat-search-plan.md` — standalone search plan, now integrated here
- `docs/plans/2026-03-07-feat-toc-plan.md` — standalone TOC plan, now integrated here
