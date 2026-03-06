---
date: 2026-03-05
topic: multi-renderer-support
---

# Multi-Renderer Support

## What We're Building

A CLI flag (`--renderer <name>`) that selects which TUI renderer liham uses. OpenTUI is the default. The architecture supports adding Ink and Rezi (or others) later without changing the pipeline or IR layer.

The IR layer (Phase 2c) already decouples parsing from rendering: `markdown -> hast -> IR -> renderer`. This brainstorm covers how the renderer selection and boot lifecycle work.

## Why This Approach

### Decisions Made

1. **CLI flag for selection** (`--renderer opentui|ink|rezi`)
   - Simplest UX, no config files needed
   - Default: `opentui` (omitting the flag uses OpenTUI)
   - Future: could add config file support if needed, flag would override

2. **Each renderer owns its own boot function** (option A — no shared lifecycle abstraction)
   - OpenTUI, Ink, and Rezi have fundamentally different app lifecycles:
     - OpenTUI: `createCliRenderer()` + `createRoot(renderer).render(<App />)`
     - Ink: `render(<Component />)` from `ink`
     - Rezi: `createNodeApp()` with its own JSX runtime (`jsxImportSource`)
   - Abstracting these behind a common interface would be leaky and fragile
   - Each renderer gets a boot file: `src/renderer/<name>/boot.ts`
   - `src/index.tsx` parses the flag and dispatches to the correct boot function

3. **Implement only OpenTUI now, architect for future renderers**
   - Phase 2b (tables, images, links, light theme) isn't done yet
   - Adding renderers now means duplicating incomplete feature work
   - Lay down the dispatch structure and `boot()` pattern so adding a renderer later is just: new directory + boot file + node-to-JSX mapping

### Renderer-Agnostic Principles (going forward)

- **IR is the contract.** All renderer work consumes `IRNode` trees. No renderer should reach back into hast or markdown.
- **Styles are pre-resolved in IR.** Renderers map `BlockStyle`/`InlineStyle` to their framework's props — they don't interpret theme tokens.
- **New IR nodes before new renderers.** Finish the IR node coverage (tables, images, etc.) before adding Ink/Rezi. Each new node type should be designed with all three renderers in mind.
- **No shared React assumption.** The `Renderer` interface currently returns `ReactNode`. When Rezi is added (non-React JSX), the interface should become generic (`Renderer<T>`) or each renderer should just export a typed `render()` + `boot()` without sharing an interface. Prefer the latter — the interface adds no value if the boot lifecycles are already separate.
- **CustomNode<T> for renderer-specific features.** Rezi has rich widgets (Table, CodeEditor, DiffViewer). These map to `CustomNode<T>` in the IR — renderers that don't support them fall back gracefully.

## Key Design: Entry Point Dispatch

```
src/index.tsx (current)
  -> parse --renderer flag (default: 'opentui')
  -> processMarkdown(markdown, theme) -> IRNode
  -> dispatch to renderer boot:
       'opentui' -> src/renderer/opentui/boot.ts
       'ink'     -> src/renderer/ink/boot.ts      (future)
       'rezi'    -> src/renderer/rezi/boot.ts     (future)
```

Each boot file:
- receives the IR tree (and theme if needed)
- calls its own `render()` to produce framework-native output
- handles its own app lifecycle (mount, cleanup, signals)

## Open Questions

- Should `--renderer` accept short aliases? (`-r otui`, `-r ink`)
- Should unknown renderer names error with a list of available ones?
- When adding Ink: worth using `ink-markdown` directly, or keep custom IR-based renderer for consistency?
- Rezi's JSX runtime (`jsxImportSource`) — does this need a separate tsconfig or build step?

## Next Steps

-> `/ce:plan` to implement the dispatch structure + refactor index.tsx
