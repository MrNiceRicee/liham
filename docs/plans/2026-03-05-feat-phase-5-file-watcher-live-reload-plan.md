---
title: "Phase 5: File Watcher — Live Reload on File Changes"
type: feat
status: active
date: 2026-03-05
---

# Phase 5: File Watcher — Live Reload on File Changes

## Overview

When viewing a markdown file, watch it for changes and automatically re-run the pipeline + re-render the preview. This makes liham useful as a live preview alongside an editor. The Go v1 already has a proven watcher (`internal/watcher/watcher.go`) — this phase ports that pattern to TypeScript using Bun's `node:fs` `watch()` API, integrated into the React component lifecycle.

## Problem Statement / Motivation

Currently, liham renders a markdown file once at startup. If the user edits the file in an external editor, they must quit and re-launch liham to see changes. This makes liham impractical as a live preview tool alongside an editor — the primary use case for a terminal markdown previewer.

The Go v1 had live reload via fsnotify. The TypeScript rewrite needs parity.

## Proposed Solution

1. **Watcher module** (`src/watcher/watcher.ts`) — pure TypeScript, no React. Watches the parent directory (not the file directly) for atomic save compatibility. Debounces events, filters editor temp files, emits typed events via callback.

2. **Architecture plumbing** — thread `filePath` through `BootContext` → `AppProps`. Refactor viewer content from immutable props to mutable `useState`. Add `--no-watch` CLI flag.

3. **App integration** — `useEffect` hook for watcher lifecycle tied to `state.mode` and file path. On change: re-read file, re-run pipeline, update both source and preview panes. Preserve scroll position. Show "file deleted" warning in status bar.

## Technical Approach

### Architecture

```
CLI (--no-watch flag, filePath)
  → BootContext { filePath, noWatch }
    → AppProps { filePath, noWatch }
      → useEffect: createFileWatcher(parentDir, { onEvent, debounceMs })
        → onChange: Bun.file().text() → processMarkdown() → renderToOpenTUI() → setState
        → onDelete: show warning, stop watcher
        → cleanup: watcher.close()
```

**Key architecture decisions:**

1. **Watch parent directory, not file** — atomic saves (Vim, Emacs, VS Code) delete + rename, creating a new inode. Watching the file directly loses the watch on rename. Watching the parent catches Create events for the new file.

2. **Content ownership refactor** — currently viewer content arrives as immutable `props.content` (CLI direct) or mutable `viewerFileContent` state (browser open). For live reload, ALL viewer content must be mutable. Move to a single `useState` initialized from props.

3. **Watcher module is pure (no React)** — returns a cleanup function. The React integration lives in a `useEffect` inside `App`. This makes the watcher testable independently.

4. **Pipeline error handling** — keep last successful render in preview pane, update source pane raw text always, show brief status bar warning. Users save incrementally; showing errors that replace the preview would be disruptive.

5. **Use `node:fs` `watch()`** — Bun supports it. The Go v1's fsnotify pattern maps directly: watch parent dir, filter by filename, debounce Write/Create events, handle Remove/Rename as deletion.

### Implementation Phases

#### Phase A: Watcher Module

Create `src/watcher/watcher.ts` — a pure TypeScript module with no React dependencies.

**New files:**
- `src/watcher/watcher.ts`
- `src/watcher/watcher.test.ts`

**Event types:**

```typescript
// src/watcher/watcher.ts

export type WatcherEvent =
  | { type: 'change'; path: string }
  | { type: 'delete'; path: string }
  | { type: 'error'; message: string }

export interface WatcherOptions {
  onEvent: (event: WatcherEvent) => void
  debounceMs?: number  // default: 80
}

export interface FileWatcher {
  close(): void
}
```

**Factory function:**

```typescript
export function createFileWatcher(filePath: string, options: WatcherOptions): FileWatcher
```

**Behavior:**
- Resolves `filePath` to absolute, extracts parent dir and basename
- Calls `fs.watch(parentDir)` — shallow watch on parent directory
- On each event, filters by basename match (ignore events for other files)
- Filters editor temp files via `isEditorTemp(name)`:
  - `4913` (Vim test file)
  - `*~` (Vim/Emacs backup)
  - `.swp`, `.swx` (Vim swap)
  - `___jb_tmp___`, `___jb_old___` (JetBrains)
  - `#*#`, `.#*` (Emacs auto-save / lock)
- On Write/Create (`rename` event with filename match, or `change` event): reset debounce timer, fire `{ type: 'change' }` after debounce
- On Remove/Rename where file disappears: immediately fire `{ type: 'delete' }`, stop the watcher
- On `fs.watch` error: fire `{ type: 'error' }` — don't crash
- Returns `{ close() }` that stops the timer, closes the `FSWatcher`

**Adaptive debounce:**
- Formula: `min(500, max(80, lastPipelineTime * 0.8))`
- `lastPipelineTime` tracks `processMarkdown() + renderToOpenTUI()` duration (not file I/O)
- Initial debounce: 80ms (base minimum). Updated after each successful pipeline run
- Cap at 500ms to prevent sluggishness on large files
- The debounce value is managed externally (by the App component) and passed to the watcher via `debounceMs`. The watcher does NOT own the adaptive logic — it just uses whatever debounce value it receives. The App tracks pipeline times and updates the debounce ref

Wait — simpler approach: the watcher owns a fixed debounce. The App owns the adaptive timing by controlling when it triggers the pipeline after receiving a `change` event. The watcher's job is just to coalesce rapid OS events (80ms base). The App adds its own adaptive delay on top if needed.

Actually, simplest: **the watcher owns the debounce timer internally** with a fixed 80ms. This matches the Go v1 exactly. Adaptive debounce is deferred — it's an optimization, not MVP. If pipeline stacking is observed, add the adaptive layer later.

**Tests (`src/watcher/watcher.test.ts`):**
- `isEditorTemp()` — unit tests for each pattern
- `createFileWatcher()` — integration-style tests writing to a temp dir
- Verify debounce coalesces rapid writes
- Verify file deletion fires `delete` event
- Verify cleanup via `close()`
- Verify events for other files in the same directory are ignored

#### Phase B: Architecture Plumbing

Modify existing files to thread `filePath` and `noWatch` through the stack, and refactor content ownership.

**Modified files:**
- `src/renderer/opentui/boot.tsx`
- `src/renderer/opentui/app.tsx`
- `src/app/state.ts`
- `src/cli/index.ts`
- `src/cli/completions.ts`

**B1. BootContext + AppProps — add `filePath` and `noWatch`**

```typescript
// boot.tsx — BootContext viewer variant
| { mode: 'viewer'; ir: IRNode; theme: ThemeTokens; layout: LayoutMode; raw: string; renderTimeMs: number; filePath: string; noWatch: boolean }
```

```typescript
// app.tsx — AppProps viewer variant
| { mode: 'viewer'; content: ReactNode; raw: string; layout: LayoutMode; theme: ThemeTokens; renderTimeMs: number; filePath: string; noWatch: boolean }
```

Boot passes `filePath` and `noWatch` through to `App`.

**B2. CLI — add `--no-watch` flag**

```typescript
// cli/index.ts — add to options
'no-watch': { type: 'boolean' as const, default: false },
```

Add to `CliMode` viewer variant: `noWatch: boolean`. Thread through `resolvePositional()`. Pass to `boot()` call. Add to help text. Add to shell completions.

**B3. State — initialize `currentFile` for CLI direct mode**

Currently `state.currentFile` is only set by the `OpenFile` action (browser → viewer). For CLI direct mode, it's `undefined`. The watcher needs the file path.

Add a new action to set the file on mount:

```typescript
| { type: 'SetCurrentFile'; path: string }
```

Reducer case: `return { ...state, currentFile: action.path }`.

Dispatch this in a `useEffect` on mount when `props.mode === 'viewer'`.

Alternatively, just set `currentFile` in the `initialState` function by passing `filePath` from props. Cleaner — no extra action needed.

```typescript
// app.tsx — in useReducer initializer
const [state, dispatch] = useReducer(appReducer, props, (p) => ({
  ...initialState(p.layout, p.mode),
  dimensions: dims,
  ...(p.mode === 'viewer' ? { currentFile: p.filePath } : {}),
}))
```

**B4. Content ownership refactor**

Move viewer content from immutable props to mutable state. The initial render uses props content. The watcher updates via setState.

```typescript
// app.tsx — replace viewerContent/viewerRaw/viewerFileContent with unified state
const [viewerState, setViewerState] = useState<{ content: ReactNode; raw: string }>(() => {
  if (props.mode === 'viewer') return { content: props.content, raw: props.raw }
  return { content: null, raw: '' }
})
```

Remove `viewerFileContent` state. Update `handleOpenFile` to use `setViewerState`. Remove `currentViewerContent` / `currentViewerRaw` derivation — just use `viewerState.content` and `viewerState.raw`.

#### Phase C: App Integration

Wire the watcher into the App component lifecycle.

**Modified files:**
- `src/renderer/opentui/app.tsx`
- `src/renderer/opentui/status-bar.tsx`
- `src/app/state.ts`

**C1. Watcher `useEffect`**

```typescript
// app.tsx — new effect
useEffect(() => {
  const filePath = state.currentFile
  if (filePath == null) return
  if (state.mode !== 'viewer') return
  if (props.mode === 'viewer' && props.noWatch) return

  const watcher = createFileWatcher(filePath, {
    onEvent: (event) => {
      if (event.type === 'change') {
        reloadFile(filePath)
      } else if (event.type === 'delete') {
        dispatch({ type: 'FileDeleted' })
      }
    },
  })

  return () => { watcher.close() }
}, [state.currentFile, state.mode])
```

**Key lifecycle behaviors:**
- **CLI direct mode**: starts on mount (`state.currentFile` set from props, `state.mode === 'viewer'`)
- **Browser → viewer**: starts when `OpenFile` sets `currentFile` and mode becomes `'viewer'`
- **Viewer → browser**: cleanup runs because `state.mode` changes from `'viewer'`
- **Browser → viewer (different file)**: cleanup runs (old `currentFile`), new effect runs (new `currentFile`)
- **Quit**: cleanup runs on component unmount

**C2. `reloadFile()` — pipeline re-render**

```typescript
// app.tsx — inline async function, called from watcher callback
const fileChangeIdRef = useRef<number>(0)

const reloadFile = useCallback(async (filePath: string) => {
  const changeId = ++fileChangeIdRef.current

  try {
    const t0 = performance.now()
    const markdown = await Bun.file(filePath).text()
    if (fileChangeIdRef.current !== changeId) return  // stale

    const result = await processMarkdown(markdown, props.theme)
    if (fileChangeIdRef.current !== changeId) return  // stale

    if (!result.ok) {
      // keep last good preview, update raw source, show warning
      setViewerState(prev => ({ ...prev, raw: markdown }))
      // could set a pipeline error flag for status bar
      return
    }

    const panes = paneDimensions(state.layout, state.dimensions.width, state.dimensions.height, 'viewer')
    const width = (panes.preview?.width ?? state.dimensions.width) - 4
    const rendered = renderToOpenTUI(result.value, width)
    const elapsed = performance.now() - t0

    if (fileChangeIdRef.current !== changeId) return  // stale

    setViewerState({ content: rendered, raw: markdown })
    setRenderTimeMs(elapsed)
  } catch {
    // read failed (permission, locked, etc.) — silently ignore like Go v1
  }
}, [props.theme, state.layout, state.dimensions])
```

**Stale detection:** `fileChangeIdRef` increments on each call. If a newer change arrives while the pipeline is running, the older result is discarded. This reuses the proven pattern from `renderBrowserPreview`.

**C3. Scroll position preservation**

After content updates via `setViewerState`, the scrollbox content changes. OpenTUI's `<scrollbox>` should maintain scroll position when content replaces inline. If it doesn't (jumps to top), save `scrollTop` before update and restore via `scrollTo()` after via a `queueMicrotask`:

```typescript
const scrollBefore = previewRef.current?.scrollTop ?? 0
setViewerState({ content: rendered, raw: markdown })
queueMicrotask(() => {
  previewRef.current?.scrollTo(scrollBefore)
})
```

If content shrinks, the scrollbox clamps automatically. This is the pixel-offset approach — simpler than percentage and matches user expectation of "stay where I was."

**C4. `FileDeleted` action + status bar**

Add to `AppAction`:

```typescript
| { type: 'FileDeleted' }
```

Add to `AppState`:

```typescript
fileDeleted: boolean  // default: false
```

Reducer: `return { ...state, fileDeleted: true }`.

Reset on `OpenFile`: `fileDeleted: false`.

**Status bar update:**

```typescript
// status-bar.tsx — add fileDeleted prop
interface StatusBarProps {
  entries: LegendEntry[]
  layout: string
  theme: ThemeTokens
  renderTimeMs?: number
  fileDeleted?: boolean
}
```

When `fileDeleted` is true, show warning text (e.g., `"file deleted"`) in the status bar, using a warning color from the theme. Last-known content stays visible in the panes.

**C5. Watcher initialization failure**

If `fs.watch()` throws (e.g., `ENOSPC` on Linux — inotify limit), catch the error and continue without watching. The app works as a static previewer. Optionally show a brief status bar message. Don't crash.

```typescript
try {
  const watcher = createFileWatcher(...)
  return () => { watcher.close() }
} catch {
  // watch unavailable — static mode fallback
  return
}
```

#### Phase D: Tests

**New test files:**
- `src/watcher/watcher.test.ts`

**Test categories:**

1. **`isEditorTemp()` unit tests:**
   - Vim: `4913`, `file.md~`, `file.md.swp`, `file.md.swx`
   - JetBrains: `file.md___jb_tmp___`, `file.md___jb_old___`
   - Emacs: `#file.md#`, `.#file.md`
   - Normal files pass through: `file.md`, `README.md`, `notes.txt`

2. **`createFileWatcher()` integration tests:**
   - Write to watched file → `change` event fires
   - Delete watched file → `delete` event fires
   - Write to OTHER file in same dir → no event
   - Rapid writes → single `change` event (debounce)
   - `close()` → no more events
   - Editor temp files → filtered out

3. **State machine tests (`src/app/state-browser.test.ts` or new file):**
   - `FileDeleted` action sets `fileDeleted: true`
   - `OpenFile` resets `fileDeleted: false`
   - `currentFile` set in initial state for viewer mode

4. **App integration (manual verification):**
   - `liham README.md` → edit file → preview updates
   - `liham` → select file → edit → preview updates → Esc → select another file
   - `liham --no-watch README.md` → edit file → no update
   - Delete file while viewing → status bar shows warning
   - Vim atomic save → single clean update (no double render)

## Acceptance Criteria

### Functional Requirements

- [ ] File changes detected via parent-directory watching
- [ ] Preview and source panes update on file change
- [ ] Render time stat updates on each reload
- [ ] 80ms debounce coalesces rapid save events
- [ ] Vim/Emacs/JetBrains temp files filtered — no spurious re-renders
- [ ] File deletion stops watcher, shows "file deleted" warning in status bar
- [ ] Watcher starts on viewer entry (both CLI direct and browser-open paths)
- [ ] Watcher stops on return-to-browser transition
- [ ] Watcher stops on quit (all exit paths: q, Esc, Ctrl+C)
- [ ] Opening a different file from browser stops old watcher, starts new one
- [ ] `--no-watch` flag disables watching entirely
- [ ] Pipeline error on re-render keeps last good preview, updates source raw text
- [ ] File read failure on re-render is silently ignored (matches Go v1)
- [ ] Scroll position preserved across content updates
- [ ] In-flight pipeline results discarded when newer change arrives (stale detection)
- [ ] Watcher initialization failure degrades to static mode (no crash)

### Non-Functional Requirements

- [ ] Latency: file change → preview update < 200ms (for typical files)
- [ ] No orphaned FSWatcher instances after quit
- [ ] No `setState` calls after component unmount

### Quality Gates

- [ ] `isEditorTemp()` unit tests pass for all editor patterns
- [ ] `createFileWatcher()` integration tests pass (write, delete, debounce, filter, cleanup)
- [ ] State machine tests pass for `FileDeleted` action
- [ ] All existing 214 tests still pass (zero regressions)
- [ ] Zero ESLint errors (sonarjs cognitive-complexity < 15)
- [ ] Biome format clean

## Dependencies & Risks

| Risk | Mitigation |
|------|-----------|
| Bun's `fs.watch` doesn't fire Create on atomic saves | Watch parent dir. Validate with Vim test during implementation. Fallback: watch file directly + re-create watch on ENOENT |
| inotify limit on Linux (ENOSPC) | Catch initialization error, degrade to static mode |
| Pipeline stacking on large files | 80ms debounce + stale detection via ref counter. Add adaptive debounce later if needed |
| Content flicker on re-render | React state batching should prevent intermediate paints. If observed, batch setViewerState + setRenderTimeMs |
| Scroll jump on content change | Save/restore scrollTop around state update |

## Future Considerations

- **Adaptive debounce** — `min(500, max(80, lastPipelineTime * 0.8))` can be added if pipeline stacking is observed. Not MVP.
- **Resize-triggered re-render** — currently content is rendered at boot-time width. After Phase 5, the next file save re-renders at new width, causing a jarring jump. Fix: re-render on resize too (separate enhancement).
- **Browser mode directory watching** — re-scan directory when files are added/removed. Not in Phase 5 scope.
- **Browser preview cache invalidation** — cached previews become stale when files change externally. Separate enhancement.
- **Watching indicator** — show "watching" in status bar during normal operation. Deferred — render time updates already signal activity.

## Sources & References

### Internal References

- Go v1 watcher: `internal/watcher/watcher.go` — parent-dir watching, 80ms debounce, vim temp filter
- Go v1 integration: `internal/app/model.go:315-340` — watcher lifecycle (start/stop)
- Rewrite plan Phase 5 spec: `docs/plans/2026-03-04-feat-liham-typescript-opentui-rewrite-plan.md:505-535`
- Browser preview stale detection: `src/renderer/opentui/app.tsx:44-72` — `cursorRef` snapshot pattern
- Resize debounce: `src/renderer/opentui/app.tsx:232-239` — timer ref pattern
- Directory scan cleanup: `src/renderer/opentui/app.tsx:179-196` — cancelled boolean pattern
- handleOpenFile: `src/renderer/opentui/app.tsx:262-289` — pipeline re-render in component

### External References

- Bun `fs.watch` docs: `oven-sh/bun/docs/guides/read-file/watch.mdx`
- Node.js `fs.watch` API: persistent FSWatcher with `close()` cleanup
