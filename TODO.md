# Liham — Next Work Session

## Task: Brainstorm Multi-Renderer Support (Ink + Rezi)

### What to do

Brainstorm whether and how to support Ink and Rezi TUI renderers alongside OpenTUI, given the IR layer from Phase 2c.

### Prompt

```
/ce:brainstorm

Context: Phase 2c (IR refactor) is complete. The pipeline is now:
  markdown → hast → IR nodes → renderer → framework output

Current state:
- IR types: `src/ir/types.ts` — 19 node types, pre-resolved styles (BlockStyle, InlineStyle)
- Renderer interface: `src/renderer/types.ts` — currently `{ render(node: IRNode): ReactNode }`
- OpenTUI renderer: `src/renderer/opentui/` — 8 files, IR → OpenTUI React JSX

We want to explore supporting two additional TUI frameworks:

1. **Ink** (`@vadimdemedes/ink`) — React-based, `<Box>` + `<Text>` primitives.
   - Text props: color, backgroundColor, bold, italic, underline, strikethrough, dimColor
   - Box props: flexDirection, borderStyle, borderColor, padding, margin
   - Same React paradigm as OpenTUI but different intrinsics
   - No `<strong>/<em>/<span>` — all styling via `<Text>` props
   - Uses context7 ID: /vadimdemedes/ink

2. **Rezi** (`@rezi-ui/core` + `@rezi-ui/jsx`) — custom JSX runtime (NOT React).
   - JSX via `@rezi-ui/jsx` with `jsxImportSource` — produces VNodes, not ReactNodes
   - Components: Box, Row, Column, Text, Divider, Table, etc.
   - TextStyle: { fg: Rgb, bg: Rgb, bold, dim, italic, underline, strikethrough }
   - Layout: ui.box(), ui.column(), ui.row() with flex-like props
   - Full component surface including Table, CodeEditor, DiffViewer, VirtualList
   - Uses context7 ID: /rtlzeromemory/rezi

Key questions to explore:
- Should `Renderer<T>` be generic to support both ReactNode (OpenTUI/Ink) and VNode (Rezi)?
- Or should we just have each renderer export a typed `render()` function and skip the interface?
- How does the app entry point change? OpenTUI uses `createCliRenderer` + `createRoot`,
  Ink uses `render()`, Rezi uses `createNodeApp`. These are fundamentally different lifecycles.
- Is InlineStyle already sufficient for all three? (It maps almost 1:1 to Rezi's TextStyle)
- What about Rezi's richer widget set (Table, CodeEditor, DiffViewer)? Should we add
  IR nodes for these or use CustomNode<T>?
- Ink has ink-markdown already — is a custom renderer even worth it vs using ink-markdown?
- Should this be a priority at all, or is it premature given Phase 2b isn't done?

Use context7 to look up current Ink and Rezi APIs before making decisions.
```

### Skills to use

- `/ce:brainstorm` — explores requirements and approaches before planning
- Use context7 for Ink (`/vadimdemedes/ink`) and Rezi (`/rtlzeromemory/rezi`) docs

### Key references

- IR types: `src/ir/types.ts`
- Renderer interface: `src/renderer/types.ts`
- OpenTUI renderer: `src/renderer/opentui/`
- Phase 2c plan: `docs/plans/2026-03-05-refactor-renderer-abstraction-ir-layer-plan.md`
- Phase 2c brainstorm: `docs/brainstorms/2026-03-05-renderer-abstraction-ir-layer-brainstorm.md`
