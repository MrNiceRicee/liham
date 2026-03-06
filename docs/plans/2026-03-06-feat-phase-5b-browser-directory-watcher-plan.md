---
title: "Phase 5b: Browser Directory Watcher"
type: feat
status: active
date: 2026-03-06
---

# Phase 5b: Browser Directory Watcher

## Overview

Add directory watching to browser mode so the file list updates live when `.md` files are created, deleted, or renamed on disk. Currently the browser scans once on mount and never rescans — the list goes stale immediately.

This extends Phase 5's file watcher (viewer mode, single file) to browser mode (directory-level, full rescan).

## Problem Statement

When a user has liham's browser open alongside their editor:
- Creating a new `.md` file doesn't appear in the list
- Deleting a file leaves a stale entry that errors on open
- Renaming a file shows the old name
- `git checkout` / `git stash pop` can change many files — none reflected

The user must quit and relaunch liham to see current files.

## Proposed Solution

A new `createDirectoryWatcher()` function that watches the browser's root directory for filesystem events, debounces them, and triggers a full `scanDirectory()` rescan. A new `RescanComplete` reducer action updates the file list while preserving cursor position by tracking the selected file's path.

## Implementation Phases

### Phase A: Directory Watcher Module

**New export in `src/watcher/watcher.ts`:**

```typescript
export interface DirectoryWatcherOptions {
  onEvent: () => void    // simple "something changed" callback
  debounceMs?: number    // default 300ms (heavier than file watcher's 80ms)
}

export interface DirectoryWatcher {
  close(): void
}

export function createDirectoryWatcher(
  dirPath: string,
  options: DirectoryWatcherOptions,
): DirectoryWatcher
```

**Design decisions:**
- Lives in the same `watcher.ts` file — small enough, shares `isEditorTemp()`
- Watches `dirPath` directly (not parent dir like file watcher)
- Uses `fs.watch(dirPath, { recursive: true })` — works on macOS via FSEvents. On Linux where `recursive` isn't supported, falls back to shallow watching (acceptable degradation)
- Fires a single `onEvent()` callback (no event type discrimination — the rescan handles everything)
- 300ms debounce (not 80ms) — directory rescans are heavier, and bulk operations like `git checkout` emit many events
- Filters editor temp files via `isEditorTemp()` — prevents spurious rescans
- Ignores events from excluded directories (`.git`, `node_modules`, etc.) by checking if the event filename starts with an excluded prefix
- Same `closed` guard pattern as `createFileWatcher()`

**Tests in `src/watcher/watcher.test.ts`:**
- Creates temp directory, starts watcher, creates `.md` file → event fires
- Deletes `.md` file → event fires
- Creates non-`.md` file → event still fires (rescan filters by extension)
- Editor temp file → no event
- Debounce coalesces rapid events into single callback
- `close()` stops events
- Error on non-existent directory → throws

### Phase B: State Machine — `RescanComplete` Action

**New action in `src/app/state.ts`:**

```typescript
| { type: 'RescanComplete'; files: FileEntry[] }
```

**Reducer logic:**
1. Get `selectedPath = state.browser.files[state.browser.cursorIndex]?.absolutePath`
2. Update `files` to `action.files`, set `scanStatus: 'complete'`
3. Find `selectedPath` in new list → use its index as new `cursorIndex`
4. If not found → clamp to `Math.min(oldCursorIndex, newFiles.length - 1)`
5. Preserve `filter` (unchanged — `filteredMatches` memo recomputes automatically)

This differs from `ScanComplete` which always resets cursor to 0 (correct for initial load, wrong for live rescan).

**Tests in `src/app/state.test.ts`:**
- `RescanComplete` preserves cursor on same file when list changes
- `RescanComplete` clamps cursor when selected file is deleted
- `RescanComplete` resets to 0 when list is empty
- `RescanComplete` preserves filter text

### Phase C: App Integration — Watcher Lifecycle

**In `src/renderer/opentui/app.tsx`:**

New `useEffect` for directory watching, structured like the viewer file watcher:

```typescript
useEffect(() => {
  if (state.mode !== 'browser') return
  if (noWatch) return
  if (state.browser.scanStatus !== 'complete') return  // wait for initial scan

  const scanId = { current: 0 }

  try {
    const watcher = createDirectoryWatcher(browserDir, {
      onEvent: () => {
        const id = ++scanId.current
        scanDirectory(browserDir).then((files) => {
          if (scanId.current !== id) return  // stale
          previewCacheRef.current.clear()     // invalidate preview cache
          dispatch({ type: 'RescanComplete', files })
        }).catch(() => {})  // scan error — silently ignore
      },
    })

    return () => { watcher.close() }
  } catch {
    return  // watcher init failed — degrade to static mode
  }
}, [state.mode, state.browser.scanStatus])
```

**Key behaviors:**
- Starts only after initial scan completes (`scanStatus === 'complete'`)
- Stops when mode changes to viewer (cleanup runs)
- Restarts when returning to browser (mode changes back)
- Stale detection via local counter (same pattern as viewer watcher)
- Clears `previewCacheRef` on each rescan to avoid stale preview content
- Silent degradation on watcher init failure

### Phase D: `--no-watch` Threading for Browser Mode

**Files to update:**
- `src/cli/index.ts` — pass `noWatch` to browser `CliMode` variant and `boot()`
- `src/renderer/opentui/boot.tsx` — add `noWatch` to browser `BootContext` variant
- `src/renderer/opentui/app.tsx` — add `noWatch` to browser `AppProps` variant, check in useEffect

This is mechanical type threading — the flag already exists, just needs to flow through the browser path too.

## Acceptance Criteria

- [ ] Directory changes (create/delete/rename `.md` files) update the browser file list
- [ ] 300ms debounce coalesces rapid events (e.g., `git checkout`) into single rescan
- [ ] Cursor tracks previously-selected file by path after rescan
- [ ] Cursor clamps to `newLength - 1` when selected file is deleted
- [ ] Filter is preserved across rescans
- [ ] Browser preview cache is invalidated on rescan
- [ ] Watcher starts only after initial scan completes (no race)
- [ ] Watcher stops on browser → viewer transition
- [ ] Watcher restarts on viewer → browser return
- [ ] `--no-watch` disables directory watching in browser mode
- [ ] Editor temp files do not trigger rescans
- [ ] Watcher init failure degrades gracefully (static file list)
- [ ] No orphaned FSWatcher instances after mode transitions or quit
- [ ] All existing tests pass, new tests for `createDirectoryWatcher` and `RescanComplete`

## Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Linux `recursive: true` not supported | High | Accept shallow watching on Linux — document limitation |
| `git checkout` floods events | Medium | 300ms debounce + stale detection prevents redundant rescans |
| Rescan latency on large dirs | Low | `scanDirectory` has 1000-file cap + depth limit of 3 |
| inotify descriptor limit (Linux) | Low | Single watcher per directory, graceful degradation on ENOSPC |

## Non-Goals

- Watching file content changes in browser mode (viewer watcher handles this)
- Visual "watching" indicator in status bar (defer to future)
- Incremental file list updates (full rescan is simpler and correct)
- Subdirectory watching on Linux (platform limitation of `fs.watch`)
