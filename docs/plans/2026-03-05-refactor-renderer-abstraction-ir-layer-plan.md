---
title: Renderer Abstraction (IR Layer)
type: refactor
status: completed
date: 2026-03-05
origin: docs/brainstorms/2026-03-05-renderer-abstraction-ir-layer-brainstorm.md
---

# Renderer Abstraction (IR Layer)

## Overview

Decouple the hast-to-JSX compiler (`rehype-terminal.tsx`) from OpenTUI by introducing an intermediate representation (IR) layer. The pipeline becomes:

```
markdown -> unified (remark/rehype) -> hast -> [compiler] -> IR nodes -> [renderer] -> framework JSX
```

The compiler (`rehype-ir`) transforms hast into renderer-agnostic IR nodes with pre-resolved styles. Each renderer (`renderer/opentui/`, future `renderer/ink/`) consumes IR nodes and produces framework-specific JSX. `processMarkdown` returns IR; the renderer is called separately by the app entry point.

## Problem Statement / Motivation

Currently `rehype-terminal.tsx` (507 lines) directly produces OpenTUI JSX — intrinsics (`<box>`, `<text>`, `<span>`, `<strong>`, etc.), `TextAttributes` bitmasks, and inline `<text>` wrapping are all hardcoded. All 6 component files return OpenTUI JSX and receive raw hast `Element` nodes.

Swapping renderer today = rewriting the compiler + all components. With the IR, swapping = writing a new renderer directory.

## Proposed Solution

Split `rehype-terminal.tsx` into three layers:

1. **IR types** (`src/ir/types.ts`) — discriminated union of renderer-agnostic nodes
2. **Compiler** (`src/pipeline/rehype-ir.ts`) — hast -> IR with pre-resolved styles + sanitization
3. **Renderer** (`src/renderer/opentui/`) — IR -> OpenTUI JSX (the current component logic, refactored)

(See brainstorm: `docs/brainstorms/2026-03-05-renderer-abstraction-ir-layer-brainstorm.md`)

## Technical Considerations

### Key Decisions (from brainstorm)

1. **Pre-resolved styles** — IR nodes carry fully resolved theme colors/attributes. Renderers don't need theme access.
2. **Semantic inline nodes** — markdown constructs (strong, emphasis, link) are distinct IR types. Syntax highlighting spans are styled `text` nodes.
3. **Inline `<text>` wrapping in renderer** — IR stays flat. OpenTUI renderer handles grouping inlines into `<text>` wrappers.
4. **Custom handler extensibility** — compiler accepts optional `customHandlers` map keyed by tagName. `CustomNode<T>` generic in the union.
5. **Sanitization in compiler** — all IR text values are pre-sanitized via `sanitizeForTerminal()`.
6. **`processMarkdown` returns IR** — renderer is called separately by the app.

### Architecture

```
src/
  ir/
    types.ts                    # IR node discriminated union + helpers
  pipeline/
    rehype-ir.ts                # compiler: hast -> IR (replaces rehype-terminal.tsx)
    rehype-ir.test.ts           # IR-level unit tests
    processor.ts                # (modified) pipeline returns IR
    processor.test.ts           # (modified) integration tests through full pipeline
  renderer/
    types.ts                    # renderer interface contract
    opentui/
      index.tsx                 # render(ir) -> ReactNode entry point
      heading.tsx               # IR HeadingNode -> OpenTUI JSX
      paragraph.tsx
      code-block.tsx
      blockquote.tsx
      list.tsx
      thematic-break.tsx
      fallback.tsx
      inline.tsx                # inline node rendering + text wrapping
  components/                   # (removed — moved to renderer/opentui/)
  types/
    pipeline.ts                 # (modified) PipelineResult.value -> IRNode
    components.ts               # (removed — replaced by renderer/types.ts)
```

### System-Wide Impact

- **`src/index.tsx`**: adds `renderToOpenTUI(ir)` call between pipeline and App
- **`src/app/App.tsx`**: unchanged — still receives `ReactNode` content
- **`src/pipeline/processor.ts`**: returns IR instead of ReactNode. No longer passes `components`/`fallback` to compiler.
- **`src/types/pipeline.ts`**: `PipelineSuccess.value` changes from `ReactNode` to `IRNode`
- **`src/theme/`**: unchanged — consumed by compiler only

## Acceptance Criteria

- [x] IR types defined as discriminated union in `src/ir/types.ts`
- [x] `rehype-ir.ts` compiler produces IR nodes from hast with pre-resolved styles
- [x] `customHandlers` option works for extensibility
- [x] All text values in IR are pre-sanitized
- [x] `src/renderer/opentui/` renders all current node types identically to current output
- [x] Inline `<text>` wrapping logic lives in renderer, not compiler
- [x] `processMarkdown` returns IR; renderer called separately in `src/index.tsx`
- [x] IR-level unit tests cover all node types
- [x] Existing integration tests pass through full pipeline (markdown -> IR -> renderer -> ReactNode)
- [x] `isBlockNode()` utility exported from `ir/types.ts`
- [x] Old `src/components/` directory removed
- [x] Old `rehype-terminal.tsx` removed
- [x] All 26+ tests pass, lint clean, type-check clean

## Implementation Phases

### Phase 1: IR Type Definitions

**Files:** `src/ir/types.ts`

Define the discriminated union. All style fields are optional where noted. Export `isBlockNode()` helper.

```typescript
// src/ir/types.ts

// style types
interface BlockStyle {
  fg?: string
  bg?: string
  bold?: boolean
  dim?: boolean
  borderColor?: string
  gutterColor?: string
}

interface InlineStyle {
  fg?: string
  bg?: string
  bold?: boolean
  italic?: boolean
  dim?: boolean
  underline?: boolean
  strikethrough?: boolean
}

// block nodes
interface RootNode { type: 'root'; children: IRNode[] }
interface HeadingNode { type: 'heading'; level: 1|2|3|4|5|6; style: BlockStyle; children: IRNode[] }
interface ParagraphNode { type: 'paragraph'; style: BlockStyle; children: IRNode[] }
interface CodeBlockNode { type: 'codeBlock'; code: string; language?: string; style: BlockStyle; children: IRNode[] }
interface BlockquoteNode { type: 'blockquote'; style: BlockStyle; children: IRNode[] }
interface ListNode { type: 'list'; ordered: boolean; start?: number; children: IRNode[] }
interface ListItemNode { type: 'listItem'; bullet: string; style: BlockStyle; children: IRNode[] }
interface ThematicBreakNode { type: 'thematicBreak'; style: { color: string; char: string } }
interface UnknownBlockNode { type: 'unknown'; tagName: string; style: BlockStyle; children: IRNode[] }

// inline nodes
interface TextNode { type: 'text'; value: string; style?: InlineStyle }
interface StrongNode { type: 'strong'; style: InlineStyle; children: IRNode[] }
interface EmphasisNode { type: 'emphasis'; style: InlineStyle; children: IRNode[] }
interface StrikethroughNode { type: 'strikethrough'; style: InlineStyle; children: IRNode[] }
interface InlineCodeNode { type: 'inlineCode'; value: string; style: InlineStyle }
interface LinkNode { type: 'link'; url: string; style: InlineStyle; children: IRNode[] }
interface ImageNode { type: 'image'; alt: string; style: InlineStyle }
interface BreakNode { type: 'break' }
interface CheckboxNode { type: 'checkbox'; checked: boolean }

// custom extension
interface CustomNode<T extends string = string> {
  type: T
  style?: Record<string, unknown>
  children?: IRNode[]
  data?: Record<string, unknown>
}

type IRNode =
  | RootNode | HeadingNode | ParagraphNode | CodeBlockNode | BlockquoteNode
  | ListNode | ListItemNode | ThematicBreakNode | UnknownBlockNode
  | TextNode | StrongNode | EmphasisNode | StrikethroughNode
  | InlineCodeNode | LinkNode | ImageNode | BreakNode | CheckboxNode
  | CustomNode<string>

// helper
function isBlockNode(node: IRNode): boolean
```

**Tasks:**
- [x] Define all node interfaces in `src/ir/types.ts`
- [x] Define `BlockStyle` and `InlineStyle` types
- [x] Define `CustomNode<T>` generic
- [x] Define `IRNode` union type
- [x] Export `isBlockNode()` utility (checks against known block type set)
- [x] Export all types for consumers

### Phase 2: Compiler (rehype-ir)

**Files:** `src/pipeline/rehype-ir.ts`

Build the compiler while `rehype-terminal.tsx` and `src/components/` still exist as reference. The hast walking logic (`one()`, `element()`, `root()`, `text()`) remains structurally similar but returns IR nodes instead of JSX.

**Key migrations:**
- `INLINE_HANDLERS` map -> produces IR inline nodes instead of JSX
- `HLJS_COLORS` + `getHighlightColor()` -> resolves to `style.fg` on `TextNode`
- `getListItemBullet()` copied here from `List.tsx` (needs ancestor context during hast walk)
- `extractCode()` + `extractLanguage()` copied here from `CodeBlock.tsx`
- `createChildrenWrapped` is **not ported** — IR stays flat, renderer wraps
- `sanitizeForTerminal()` called on all text values
- Ancestor tracking (`CompilerState.ancestors`) preserved for list bullet depth + code-inside-pre detection

**Options interface:**
```typescript
interface RehypeIROptions {
  theme: ThemeTokens
  customHandlers?: Record<string, CustomHandler>
}

type CustomHandler = (
  node: Element,
  theme: ThemeTokens,
  compileChildren: (node: Element) => IRNode[]
) => IRNode | undefined
```

**Tasks:**
- [x] Create `src/pipeline/rehype-ir.ts` as a unified compiler plugin
- [x] Implement `RehypeIROptions` with `theme` and optional `customHandlers`
- [x] Port `one()` dispatcher to return `IRNode` instead of `ReactNode`
- [x] Port `root()` to return `RootNode`
- [x] Port `element()` to produce block IR nodes (heading, paragraph, codeBlock, etc.)
- [x] Port inline handlers to produce inline IR nodes (text, strong, emphasis, etc.)
- [x] Copy `getListItemBullet()` from `List.tsx`, compute bullets during hast walk
- [x] Copy `extractCode()` + `extractLanguage()` from `CodeBlock.tsx`, populate `CodeBlockNode`
- [x] Resolve HLJS classes to `style.fg` on `TextNode` during compilation
- [x] Resolve theme tokens to style fields on all IR nodes
- [x] Call `sanitizeForTerminal()` on all text values
- [x] Handle `customHandlers` — check before default handling, fall through on `undefined`
- [x] Handle `pre > code` pattern — produce `CodeBlockNode` with both `code` and `children`
- [x] Handle `hr` -> `ThematicBreakNode`
- [x] Handle unknown inline elements — flatten children (no wrapper node)
- [x] Emit `VFile.message()` warnings for unknown block elements

### Phase 3: Renderer Interface + OpenTUI Renderer

**Files:** `src/renderer/types.ts`, `src/renderer/opentui/*.tsx`

Define the renderer contract, then build the OpenTUI renderer from existing component logic. Old component files are still present as reference — they are deleted in Phase 6.

```typescript
// src/renderer/types.ts
interface Renderer {
  render(node: IRNode): ReactNode
}
```

**Tasks:**
- [x] Define `Renderer` interface in `src/renderer/types.ts`
- [x] Create `src/renderer/opentui/index.tsx` — main `render()` function with node type switch
- [x] Create `src/renderer/opentui/heading.tsx` from `Heading.tsx`, accept `HeadingNode`
- [x] Create `src/renderer/opentui/paragraph.tsx` from `Paragraph.tsx`
- [x] Create `src/renderer/opentui/code-block.tsx` from `CodeBlock.tsx` (no hast extraction — data comes from IR)
- [x] Create `src/renderer/opentui/blockquote.tsx` from `Blockquote.tsx`
- [x] Create `src/renderer/opentui/list.tsx` from `List.tsx` (no `getListItemBullet` — bullet comes from IR)
- [x] Create `src/renderer/opentui/thematic-break.tsx`
- [x] Create `src/renderer/opentui/fallback.tsx` (handles `unknown` + `CustomNode` nodes)
- [x] Create `src/renderer/opentui/inline.tsx` — handles all inline IR nodes + `<text>` wrapping logic (ported from `createChildrenWrapped`)

### Phase 4: Pipeline Wiring

**Files:** `src/pipeline/processor.ts`, `src/types/pipeline.ts`, `src/index.tsx`

Wire the new compiler and renderer into the app.

**Tasks:**
- [x] Update `src/types/pipeline.ts` — `PipelineSuccess.value` type: `ReactNode` -> `IRNode`
- [x] Update `src/pipeline/processor.ts` — use `rehypeIR` instead of `rehypeTerminal`, remove `components`/`fallback` from options
- [x] Update `src/index.tsx` — call `renderToOpenTUI(result.value)` before passing to `App`
- [x] Verify `App.tsx` still receives `ReactNode` content (no changes needed)

### Phase 5: Tests

**Files:** `src/pipeline/rehype-ir.test.ts` (new), `src/pipeline/processor.test.ts` (modified)

Two-layer test strategy: IR unit tests + integration tests.

**Tasks:**
- [x] Create `src/pipeline/rehype-ir.test.ts` — IR-level unit tests
  - [x] Test each block node type (heading levels, paragraph, codeBlock, blockquote, list, thematicBreak)
  - [x] Test each inline node type (text, strong, emphasis, strikethrough, inlineCode, link, image, break, checkbox)
  - [x] Test style resolution (theme tokens -> IR style fields)
  - [x] Test HLJS color resolution on code spans
  - [x] Test list bullet computation (ordered, unordered, nested depth)
  - [x] Test `code` + `children` on CodeBlockNode (with and without highlighting)
  - [x] Test sanitization of text values
  - [x] Test `customHandlers` (match, fall-through, undefined return)
  - [x] Test unknown elements -> `UnknownBlockNode`
- [x] Update `src/pipeline/processor.test.ts` — rewire as integration tests
  - [x] Update `render()` helper to call `processMarkdown` + `renderToOpenTUI`
  - [x] Existing assertions on React tree structure should pass unchanged
  - [x] Update any assertions that reference `componentMap` or `BaseNodeProps`

### Phase 6: Cleanup

- [x] Delete `src/pipeline/rehype-terminal.tsx`
- [x] Delete `src/components/` directory entirely (block/, util/, index.ts)
- [x] Delete `src/types/components.ts`
- [x] Remove `src/components/index.ts` component registry
- [x] Run `bun run lint` — fix any issues
- [x] Run `bun run check` — fix any type errors
- [x] Run `bun test` — all tests pass
- [x] Verify app renders identically: `bun run dev -- test/fixtures/2a.md`

## Sources & References

### Origin

- **Brainstorm document:** [docs/brainstorms/2026-03-05-renderer-abstraction-ir-layer-brainstorm.md](docs/brainstorms/2026-03-05-renderer-abstraction-ir-layer-brainstorm.md)
  - Key decisions carried forward: pre-resolved styles, semantic inline nodes, renderer directory structure, CustomNode\<T\> extensibility, syntax highlight resolution in compiler

### Internal References

- Pipeline wiring: `src/pipeline/processor.ts:1-62`
- Current compiler (refactor target): `src/pipeline/rehype-terminal.tsx:1-506`
- Component registry: `src/components/index.ts:1-33`
- Component contract: `src/types/components.ts:1-12`
- Theme types: `src/theme/types.ts:1-74`
- Pipeline result type: `src/types/pipeline.ts:1-14`
- App entry point: `src/index.tsx:1-58`
- Test suite: `src/pipeline/processor.test.ts`
- Original rewrite plan: `docs/plans/2026-03-04-feat-liham-typescript-opentui-rewrite-plan.md:268-292`
