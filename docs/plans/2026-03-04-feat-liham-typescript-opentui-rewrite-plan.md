---
title: "feat: Rewrite liham to TypeScript/OpenTUI with unified.js pipeline"
type: feat
status: completed
date: 2026-03-04
deepened: 2026-03-04
origin: docs/brainstorms/2026-03-04-ts-rewrite-remark-pipeline-brainstorm.md
---

# Rewrite liham to TypeScript/OpenTUI with unified.js Pipeline

## Enhancement Summary

**Deepened on:** 2026-03-04
**Research agents used:** architecture-strategist, performance-oracle, security-sentinel, kieran-typescript-reviewer, best-practices-researcher (unified.js, Kitty graphics), framework-docs-researcher (OpenTUI), context7 (unified, rehype, opentui)

### Key Improvements

1. **Revised phase order** -- merged pipeline + framework validation into a single phase to de-risk OpenTUI dependency early (architecture review)
2. **Component tree virtualization** -- only materialize React components for visible viewport, critical for large files (performance oracle)
3. **Terminal escape sequence sanitization** -- mandatory `sanitizeForTerminal()` on all text output to prevent escape injection from malicious markdown (security sentinel)
4. **Abstract component layer** -- decouple rehype-terminal from OpenTUI via intermediate representation, making the framework swappable (architecture review)
5. **State management via `useReducer`** -- typed action discriminated union preserves Elm-like predictability from Go version (TypeScript review)
6. **Kitty virtual placements** -- use U+10EEEE Unicode placeholders for scroll-safe images instead of manual placement lifecycle (Kitty research)
7. **ANSI half-block fallback** -- upgraded from plain `[image: alt-text]` to pixel-approximated block characters for non-Kitty terminals (Kitty research)

### New Considerations Discovered

- OpenTUI is v0.1.86, pre-1.0, Bun-exclusive -- credible but requires version pinning and upstream tracking
- OpenTUI confirmed: `<scrollbox>`, `useKeyboard()`, `useOnResize()`, `useTerminalDimensions()` hooks exist
- OpenTUI has no automatic cleanup on `process.exit()` -- must call `renderer.destroy()` explicitly
- tmux has **native** Kitty graphics support as of March 2026 -- no DCS wrapping needed for tmux 3.5+
- `hast-util-to-jsx-runtime` is the reference implementation for hast-to-React conversion -- model rehype-terminal after it
- Pipeline output must use `file.result` (not `file.value`) for non-string compilers, with `CompileResultMap` type augmentation

---

## Overview

Full rewrite of liham from Go/Bubbletea to TypeScript/OpenTUI, replacing glamour with a unified.js (remark/rehype) rendering pipeline. The core architectural shift: each markdown AST node becomes a live OpenTUI React component instead of an intermediate ANSI string. This enables images, interactivity, and future rich editing as natural extensions of the component tree.

The rewrite replaces Go code in-place once the TypeScript version reaches feature parity with the current Go implementation (see brainstorm: `docs/brainstorms/2026-03-04-ts-rewrite-remark-pipeline-brainstorm.md`).

## Problem Statement / Motivation

The current Go/Bubbletea/glamour stack works but has fundamental limitations:

1. **String-based rendering** -- glamour produces one monolithic ANSI string. No individual control over elements, no lifecycle management for rich content (images), no path to interactivity.
2. **No plugin ecosystem** -- goldmark is capable but has no remark/rehype-equivalent plugin ecosystem. Every rendering capability must be built from scratch.
3. **No image support** -- terminal image rendering requires per-element lifecycle management (Kitty protocol setup/teardown) that string-based rendering cannot provide.
4. **Architecture ceiling** -- adding features like math, mermaid, callouts, or editing would require increasingly brittle post-processing of ANSI strings.

unified.js gives us the plugin pipeline for free. Only the final step (rehype-terminal) is custom (see brainstorm: origin).

## Proposed Solution

### Pipeline Architecture

```
markdown string
  -> remark-parse (mdast)
  -> remark-gfm, remark-math, remark-frontmatter (transform mdast)
  -> remark-rehype (hast)
  -> rehype-highlight (transform hast)
  -> rehype-terminal (custom: hast -> OpenTUI React component tree)
  -> OpenTUI renders components directly (display + scroll)
```

Component-based, not string-based. Each hast node maps to a live OpenTUI component that owns its own rendering. An `<Image>` component manages its Kitty protocol lifecycle, a `<CodeBlock>` handles syntax highlighting and borders, and future editing is a mode switch on existing components (see brainstorm: origin).

### Research Insights: Pipeline Implementation

**Model after `hast-util-to-jsx-runtime` + `rehype-react`.** This is the closest existing analog -- it converts hast to React elements. The rehype-terminal plugin follows the same pattern:

```typescript
// rehype-terminal plugin structure (from unified docs + rehype-react source)
import type { Root } from 'hast'
import type { ReactNode } from 'react'

// register custom return type
declare module 'unified' {
  interface CompileResultMap {
    ReactNode: ReactNode
  }
}

export default function rehypeTerminal(options: RehypeTerminalOptions) {
  // assign compiler (lowercase c -- modern unified API)
  // non-string output goes to file.result, not file.value
  this.compiler = (tree: Root, file: VFile): ReactNode => {
    return hastToTerminalComponents(tree, { file, ...options })
  }
}
```

**Use recursive dispatch pattern, not `unist-util-visit`.** Compilers produce output per node; visitors mutate in place. The dispatcher routes by `node.type`:

```typescript
function one(state: CompilerState, node: HastNode, key: string): ReactNode {
  if (node.type === 'element') return element(state, node, key)
  if (node.type === 'root') return root(state, node, key)
  if (node.type === 'text') return text(state, node)
  // unknown: warn + render children as plain content
  state.file.message(`Unknown node type: ${node.type}`, { place: node.position })
  if ('children' in node) return createChildren(state, node)
  return null
}
```

**Thread ancestor context** through the state object. Push/pop onto `state.ancestors` around element processing. This enables context-aware rendering: `<code>` inside `<pre>` renders as a code block; `<code>` inline renders as `<InlineCode>`.

**Error handling:** Use `VFileMessage` for structured errors with source positions. Use `file.message()` for recoverable warnings (unknown nodes), `throw` only for unrecoverable errors (missing configuration).

### Component Model

Each hast node maps to an OpenTUI React component:

| hast node | Component | Notes |
|-----------|-----------|-------|
| `h1`-`h6` | `<Heading level={n}>` | styled with decorations, border-bottom for h1/h2 |
| `p` | `<Paragraph>` | wraps inline children |
| `pre` + `code` | `<CodeBlock lang="ts">` | syntax-highlighted, bordered |
| `code` (inline) | `<InlineCode>` | background-colored span |
| `blockquote` | `<Blockquote>` | left border, muted color |
| `ul`/`ol` + `li` | `<List>` + `<ListItem>` | nested indentation, bullet/number |
| `table`/`thead`/`tbody`/`tr`/`th`/`td` | `<Table>` tree | formatted terminal table with borders |
| `a` | `<Link>` | OSC 8 hyperlink where supported, styled text fallback |
| `img` | `<Image>` | Kitty graphics with U+10EEEE virtual placements, ANSI half-block fallback |
| `strong` | `<Strong>` | bold via `<strong>` intrinsic element |
| `em` | `<Emphasis>` | italic via `<em>` intrinsic element |
| `del` | `<Strikethrough>` | strikethrough |
| `hr` | `<HorizontalRule>` | full-width line |
| `br` | line break | |
| unknown | `<Fallback>` | renders children as plain text with `file.message()` warning |

### Research Insights: Component Organization

**Group components by block/inline distinction** (architecture review):

```
src/components/
  block/       # Heading, Paragraph, CodeBlock, Blockquote, List, Table, HorizontalRule, Image
  inline/      # InlineCode, Strong, Emphasis, Strikethrough, Link
  util/        # Fallback
  index.ts     # component registry
```

**Component registry with `satisfies`** for type-safe exhaustive mapping (TypeScript review):

```typescript
const componentMap = {
  h1: Heading, h2: Heading, h3: Heading, h4: Heading, h5: Heading, h6: Heading,
  p: Paragraph,
  pre: CodeBlock,
  blockquote: Blockquote,
  ul: List, ol: List, li: ListItem,
  table: Table, thead: TableHead, tbody: TableBody, tr: TableRow, th: TableCell, td: TableCell,
  a: Link,
  img: Image,
  strong: Strong, em: Emphasis, del: Strikethrough,
  hr: HorizontalRule,
  code: InlineCode,  // inline; pre+code handled by CodeBlock
} satisfies Record<string, ComponentType<BaseNodeProps>>
```

**Each component exports its own props interface, co-located** -- no central `props.ts` barrel file.

### Theme System

Even for v1, rehype-terminal components consume style tokens from a theme object -- not hard-coded colors. This enables dark/light auto-detection and future custom themes without rewriting components.

```typescript
interface ThemeTokens {
  heading: { color: string; bold: boolean; prefix: string }
  codeBlock: { borderColor: string; backgroundColor: string; gutterColor: string }
  blockquote: { borderChar: string; borderColor: string; textColor: string }
  link: { color: string; underline: boolean }
  image: { fallbackColor: string }
  inlineCode: { backgroundColor: string }
  // one key per component -- flat, not nested
}
```

### Research Insights: Theme Implementation

**Flat, per-component token structure** (TypeScript review). Deeply nested theme objects are hard to type, hard to merge for overrides, and hard to validate. Each component looks up `theme.heading` or `theme.codeBlock` -- no traversal.

**Dark/light detection**: pre-detect via OSC 11 before alt screen (same fix as Go version). The mode selects a theme object; the theme type has no `mode` field.

**Runtime theme validation**: when loading user-provided theme JSON (future), validate with `valibot` or `zod`. Never type-assert parsed JSON.

Two built-in themes: `dark` and `light`. Auto-detected via OSC 11 query before OpenTUI enters alt screen (same pre-detection pattern as the Go fix -- see brainstorm: origin, and `docs/brainstorms/2026-03-04-slow-initial-load-brainstorm.md`).

## Technical Approach

### Architecture

Component-per-pane, same proven pattern as the Go version:

```
App (orchestrator, useReducer with typed actions)
  |-- Browser (file picker with fuzzy search)
  |-- SourcePane (raw markdown viewport in scrollbox)
  |-- PreviewPane (rehype-terminal rendered viewport in scrollbox)
  |-- StatusBar (mode, file, sync indicator)
```

Parent `App` handles mode switching, focus routing, scroll sync, and watcher lifecycle. Each pane is an independent component.

### Research Insights: State Management

**Use `useReducer` with a discriminated union action type** (TypeScript review, architecture review). This preserves the Elm-like predictability of the Go Bubbletea `Update` function:

```typescript
type AppAction =
  | { type: 'file:selected'; path: string }
  | { type: 'file:changed'; path: string; content: string }
  | { type: 'scroll:sync'; percent: number }
  | { type: 'focus:change'; pane: 'browser' | 'source' | 'preview' }
  | { type: 'mode:change'; mode: 'browser' | 'preview' }
  | { type: 'watcher:error'; error: string }
  | { type: 'pipeline:complete'; tree: ReactNode }
  | { type: 'pipeline:error'; error: PipelineError }
```

**Do not scatter `useState` calls.** The Go version's single `Update` function with message switching was its strength -- replicate that with a single reducer.

### Research Insights: OpenTUI Integration

**OpenTUI status (as of 2026-03-04):**
- Version: v0.1.86, pre-1.0, MIT license
- 9,105 GitHub stars, 30 contributors, ~91K weekly npm downloads
- Bun-exclusive (Node.js/Deno support not ready)
- Powers OpenCode in production
- API changing frequently -- pin dependency version

**Key OpenTUI components confirmed via docs:**
- `<scrollbox>` -- built-in scrollable viewport with keyboard/mouse, customizable scrollbar
- `<box>` -- layout container with flexbox via Yoga
- `<text>` -- text rendering with inline `<span>`, `<strong>`, `<em>`, `<u>`, `<b>`, `<i>`
- `<input>`, `<select>`, `<textarea>` -- input elements

**Key hooks confirmed:**
- `useKeyboard(handler, options?)` -- keyboard events, optional key release
- `useOnResize(callback)` -- terminal resize events
- `useTerminalDimensions()` -- reactive width/height
- `useRenderer()` -- access to `CliRenderer` instance

**Critical gotchas:**
- `renderer.destroy()` must be called on exit -- OpenTUI does NOT auto-cleanup on `process.exit()`
- Known `<scrollbox>` mouse click race condition during scroll (hit grid updates async)
- Text styling requires nested elements: `<text><span fg="red">colored</span></text>`
- JSX factory may need `jsxImportSource` in tsconfig -- check OpenTUI's requirements

**Setup pattern:**
```typescript
import { createCliRenderer } from '@opentui/core'
import { createRoot } from '@opentui/react'

const renderer = await createCliRenderer({ useAlternateScreen: true })
createRoot(renderer).render(<App />)

// cleanup on exit
process.on('SIGINT', () => { renderer.destroy(); process.exit(0) })
process.on('SIGTERM', () => { renderer.destroy(); process.exit(0) })
```

### Research Insights: Abstract Component Layer

**Status: Planned and brainstormed.** See dedicated plan: `docs/plans/2026-03-05-refactor-renderer-abstraction-ir-layer-plan.md` and brainstorm: `docs/brainstorms/2026-03-05-renderer-abstraction-ir-layer-brainstorm.md`.

The original idea of `TerminalNode[]` has evolved into a full IR (Intermediate Representation) layer with pre-resolved styles. Key changes from the original sketch:

- Renamed from `TerminalNode` to `IRNode` (more accurate -- it's compiler IR, not terminal-specific)
- IR carries pre-resolved theme styles (colors, bold flags) so renderers don't need theme access
- Semantic inline nodes for markdown constructs + styled text for syntax highlighting
- `CustomNode<T>` generic for extensibility
- `processMarkdown` returns IR; renderer called separately
- Inline `<text>` wrapping is a renderer concern, not compiler

Architecture:
```
markdown -> unified (remark/rehype) -> hast -> rehype-ir (compiler) -> IRNode tree -> renderer -> framework JSX
```

This work is tracked as Phase 2c below.

### Key Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| TUI framework | OpenTUI v0.1.x | built-in `<scrollbox>`, React reconciler, Zig backend (see brainstorm). Pin version. |
| Rendering pipeline | unified.js | remark/rehype plugin ecosystem, proven architecture |
| Final renderer | rehype-ir + renderer/opentui | hast -> IRNode tree -> OpenTUI JSX (see Phase 2c plan) |
| Image protocol | Kitty Graphics | best quality, Kitty/WezTerm/Ghostty. Virtual placements (U+10EEEE) for scroll safety. |
| Image fallback | ANSI half-block characters | pixel-approximated block chars (U+2580-U+259F with 24-bit color), not just alt-text |
| Runtime | bun | required by OpenTUI (Bun-exclusive). Also provides `bun compile`. |
| Package manager | bun | consistent with runtime |
| CLI parser | TBD (evaluate commander/yargs/clipanion) | must support mutual exclusion, shell completion |
| Dev tooling | ESLint + Biome | strict, no swallowed catches (see brainstorm) |
| Distribution | npm + bun compile binary | dual: `bun add -g liham` + compiled releases |
| State management | `useReducer` with typed actions | Elm-like predictability, mirrors Go Bubbletea pattern |
| Test runner | `bun:test` | built-in, fast, TypeScript-native |

### Implementation Phases

**Phase order revised** based on architecture review: validate the riskiest assumption (OpenTUI + pipeline integration) in a single vertical slice before building the full component library.

#### Phase 1: Project Scaffolding and Dev Tooling

Set up the TypeScript project structure, dev tooling, and build system. No TUI code yet.

- [x] Initialize bun project with `package.json`, `tsconfig.json`
- [x] Set up ESLint config extending home-jarvis base (`~/Documents/code/personal/2026/home-jarvis/eslint.config.base.ts`)
  - [x] Add ts-eslint, sonarjs, perfectionist plugins
  - [x] Override `allowEmptyCatch: false` (stricter than home-jarvis)
  - [x] Add `@typescript-eslint/no-explicit-any: 'error'`
  - [ ] Add `@typescript-eslint/strict-boolean-expressions: 'error'` (prevent `if (value)` on strings/numbers)
  - [ ] Add `eslint-plugin-boundaries` to enforce module dependency graph
- [x] Set up Biome config for formatting (reference `~/Documents/code/personal/2026/home-jarvis/biome.json`)
  - [x] Remove CSS-specific options (tailwindDirectives, cssModules) -- irrelevant here
- [x] `tsconfig.json` with strict settings:
  - [x] `strict: true`, `noUncheckedIndexedAccess: true`, `noFallthroughCasesInSwitch: true`
  - [x] `exactOptionalPropertyTypes: true` (distinguishes missing vs. undefined -- matters for theme overrides)
  - [x] `noPropertyAccessFromIndexSignature: true` (bracket notation for dynamic keys)
  - [x] `verbatimModuleSyntax: true` (enforces `import type`)
  - [x] `noUnusedLocals: true`, `noUnusedParameters: true`
  - [x] `moduleResolution: "bundler"`
  - [ ] Set `jsx` / `jsxImportSource` per OpenTUI requirements
- [x] Create directory structure:
  ```
  src/
    cli/               # CLI entry point, argument parsing
    app/               # root component, orchestration, useReducer
    pipeline/          # unified.js pipeline, rehype-terminal, sanitize
    components/
      block/           # Heading, Paragraph, CodeBlock, Blockquote, List, Table, HorizontalRule, Image
      inline/          # InlineCode, Strong, Emphasis, Strikethrough, Link
      util/            # Fallback
      index.ts         # component registry with satisfies
    browser/           # file picker component
    source/            # raw markdown pane
    preview/           # rendered preview pane
    watcher/           # file watcher
    theme/             # theme system, dark/light detection
    hooks/             # useScrollSync, useFileWatcher, useKittyImage
    types/             # shared type definitions, TerminalNode union, AppAction
  ```
- [x] Add `.gitignore` for node_modules, dist, .turbo, etc.
- [x] Verify `bun run lint`, `bun run format`, `bun run typecheck` all work
- [x] Create basic `src/index.ts` entry point (hello world to verify bun runs)

**Success criteria:** `bun run lint && bun run format --check && bun run typecheck` passes on empty project.

#### Phase 2: Pipeline Vertical Slice + Framework Validation

Build the pipeline AND a minimal OpenTUI app in a single phase. This validates the full vertical slice: markdown string -> pipeline -> component tree -> rendered scrollable terminal output. **This is the highest-risk phase -- if this works, the architecture is proven.**

##### Phase 2a: Pipeline Core + 4 Components

- [x] Install unified.js ecosystem: `unified`, `remark-parse`, `remark-gfm`, `remark-rehype`, `rehype-highlight`
- [x] Install OpenTUI: `@opentui/core`, `@opentui/react`
- [x] Create `sanitizeForTerminal()` in `src/pipeline/sanitize.ts`:
  - [x] Strip bytes `0x00-0x1f` (except `\n`, `\t`) and `0x7f`
  - [x] Strip ESC byte (`0x1b`) to prevent terminal escape injection
  - [x] This is the SOLE path for all text output to terminal
- [x] Create pipeline module (`src/pipeline/processor.ts`):
  ```typescript
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: false })
    .use(rehypeHighlight)
    .use(rehypeTerminal, { components: componentMap, theme })
  ```
  - [x] Add `CompileResultMap` type augmentation for `ReactNode`
  - [x] Pipeline returns `Result<ReactNode, PipelineError>` (discriminated union, no throws across boundary)
  - [x] Add 5-second execution timeout to mitigate ReDoS from rehype-highlight
- [x] Create rehype-terminal plugin (`src/pipeline/rehype-terminal.ts`):
  - [x] Assign `this.compiler` (lowercase c -- modern unified API)
  - [x] Recursive dispatch pattern (model after `hast-util-to-jsx-runtime`)
  - [x] Thread `state.ancestors` for parent context (code inside pre vs inline)
  - [x] `state.components` for tag-to-component mapping (extensible)
  - [x] All text nodes pass through `sanitizeForTerminal()` before output
  - [x] Unknown nodes: `file.message()` warning + render children as plain text
  - [x] Output goes to `file.result` (not `file.value`)
- [x] Implement 4 core components:
  - [x] `Heading.tsx` -- h1-h6 with level-based styling
  - [x] `Paragraph.tsx` -- wraps inline children
  - [x] `CodeBlock.tsx` -- syntax-highlighted, bordered
  - [x] `Fallback.tsx` -- unknown node handler
- [x] Create theme types (`src/theme/types.ts`) + basic dark theme
- [x] Create minimal OpenTUI app that renders pipeline output in a `<scrollbox>`:
  - [x] Parse a markdown file, run pipeline, render in scrollable viewport
  - [x] Keyboard navigation: j/k, arrows for scroll
  - [x] **Measure: pipeline time for 500-line file, scroll frame rate with 200+ components**
- [x] Write tests: markdown string in -> verify component tree structure out

**Performance gate:** If pipeline > 200ms for 500 lines or scroll < 30fps, STOP and investigate before proceeding. Options: component tree virtualization, worker thread, or reconsider OpenTUI.

**Success criteria:** `bun run src/index.ts README.md` shows rendered markdown in a scrollable OpenTUI viewport. Pipeline handles malformed markdown without crashing. Performance benchmarks pass.

##### Phase 2b: Remaining Components + Full Theme

Items pulled forward from 2b into 2a (done):
- [x] `Blockquote.tsx` -- heavy left border + subtle background (`border: ['left']`, `borderStyle: 'heavy'`)
- [x] `List.tsx` + `ListItem.tsx` -- bullet depth (bullet/circle/square), ordered numbers, task lists (`[x]`/`[ ]`)
- [x] Inline handling in rehype-terminal: bold, italic, strikethrough (`TextAttributes.STRIKETHROUGH`), inline code, links, images, break, underline
- [x] Full dark theme (`dark.ts`) with RPG rarity heading colors (Tokyo Night palette)

Remaining 2b items:
- [ ] `Table.tsx` tree -- formatted with borders (filter whitespace-only text children in table elements)
- [ ] `HorizontalRule.tsx` -- full-width line
- [ ] `Image.tsx` -- placeholder only (Kitty in Phase 7)
- [ ] `Link.tsx` -- OSC 8 hyperlink with URL sanitization:
    - [ ] Whitelist schemes: `http:`, `https:`, `mailto:` only
    - [ ] Strip control characters from URLs (`\x07`, `\x1b`, `\x00`)
    - [ ] Max URL length: 2048 characters
- [ ] `light.ts` theme
- [ ] `detect.ts` -- OSC 11 query before alt screen

**Success criteria:** All GFM elements render correctly. Theme auto-detection works.

##### Phase 2c: Renderer Abstraction (IR Layer)

**Dedicated plan:** `docs/plans/2026-03-05-refactor-renderer-abstraction-ir-layer-plan.md`

Decouple the hast-to-JSX compiler from OpenTUI by introducing an IR layer. Split `rehype-terminal.tsx` into `rehype-ir.ts` (compiler producing `IRNode` tree) and `renderer/opentui/` (IR -> OpenTUI JSX). See the dedicated plan for full phase breakdown.

- [ ] IR type definitions (`src/ir/types.ts`)
- [ ] Compiler (`src/pipeline/rehype-ir.ts`) with pre-resolved styles + custom handlers
- [ ] OpenTUI renderer (`src/renderer/opentui/`)
- [ ] Pipeline wiring (`processMarkdown` returns IR, renderer called separately)
- [ ] Two-layer test strategy (IR unit tests + integration tests)
- [ ] Cleanup (remove `rehype-terminal.tsx`, `src/components/`, `src/types/components.ts`)

**After 2c:** Resume remaining 2b items (Table, HorizontalRule, Image, OSC 8 links, light theme, theme detection) in the new architecture pattern: add IR node type to `ir/types.ts`, add compiler handler to `rehype-ir.ts`, add renderer component to `renderer/opentui/`. Phases 3+ are unchanged — they consume the rendered `ReactNode` output, which the pipeline still produces via IR → renderer.

#### Phase 3: App Shell, Source Pane, and Split Layout

Build the full multi-pane application with scroll sync.

- [ ] Create root `App` component (`src/app/App.tsx`):
  - [ ] `useReducer` with `AppAction` discriminated union
  - [ ] Manages app state: mode, focus, dimensions, scroll positions
  - [ ] Explicit cleanup: register `SIGINT`/`SIGTERM` handlers calling `renderer.destroy()`
  - [ ] Handles terminal resize via `useOnResize()`
- [ ] Create `PreviewPane` component (`src/preview/PreviewPane.tsx`):
  - [ ] Receives rendered component tree from pipeline
  - [ ] OpenTUI `<scrollbox>` for scrolling
  - [ ] Keyboard navigation: j/k, arrows, pgup/pgdn, ctrl-u/ctrl-d, g/G
  - [ ] Mouse wheel scrolling
- [ ] Create `SourcePane` component (`src/source/SourcePane.tsx`):
  - [ ] Raw markdown text in `<scrollbox>`
  - [ ] Plain text (no syntax highlighting -- matching Go behavior)
  - [ ] Same keyboard/mouse navigation as preview
- [ ] Create `StatusBar` component (`src/app/StatusBar.tsx`):
  - [ ] Shows filename, scroll percentage, mode indicator, sync state
- [ ] Implement layout system (`src/app/layout.ts`):
  - [ ] `side` layout: horizontal split (source left, preview right)
  - [ ] `top` layout: vertical split (source top, preview bottom)
  - [ ] `preview-only`: full-width preview
  - [ ] `source-only`: full-width source
  - [ ] Pane dimension calculation (port from `internal/app/layout.go`)
- [ ] Implement focus management:
  - [ ] Tab to toggle focus between panes
  - [ ] Visual focus indicator (border color change)
  - [ ] Mouse click to focus pane
- [ ] Implement scroll sync (`src/hooks/useScrollSync.ts`):
  - [ ] Percentage-based sync (port from Go: `internal/app/model.go`)
  - [ ] Division-by-zero guard for short files
  - [ ] `s` key to toggle sync on/off
  - [ ] Annotate rendered components with source line ranges (from mdast/hast position data) to enable future heading-aware sync
- [ ] Create CLI entry point (`src/cli/index.ts`):
  - [ ] Parse file argument (minimal `process.argv` parsing -- full CLI in Phase 8)
  - [ ] Detect terminal style (OSC 11 before alt screen)
  - [ ] Initialize pipeline, render file, launch OpenTUI app

**Success criteria:** Split pane with source and preview. Tab switches focus. Scroll sync proportionally links both panes. Layout flags work. Clean exit.

#### Phase 4: File Browser

Port the file browser from Go with fuzzy filtering.

- [ ] Create `Browser` component (`src/browser/Browser.tsx`):
  - [ ] Scan directory for `.md` files (configurable depth, default 3)
  - [ ] Max file count cap (1000, matching Go)
  - [ ] Exclude junk directories: `.git`, `node_modules`, `.next`, `dist`, `build`, `vendor`, `target`
  - [ ] Fuzzy filtering (typing filters the list)
  - [ ] j/k/arrow navigation
  - [ ] Enter to select file -> transition to preview mode
- [ ] Directory scanning (`src/browser/scanner.ts`):
  - [ ] Recursive walk with depth limit
  - [ ] Symlink resolution via `fs.realpath` -- track visited paths to detect cycles
  - [ ] Permission error handling (skip unreadable dirs, no crash)
  - [ ] Sort: directories grouped, then alphabetical
- [ ] App mode transitions:
  - [ ] No argument -> browser mode
  - [ ] Directory argument -> browser scoped to directory
  - [ ] File argument -> direct to preview (skip browser)
  - [ ] `esc`/`b` from preview -> back to browser (only when launched from browser)

**Success criteria:** File browser shows `.md` files, fuzzy filter works, selecting a file transitions to preview mode. Back navigation works.

#### Phase 5: File Watcher and Live Reload

Port the fsnotify watcher pattern to bun.

- [ ] Create watcher module (`src/watcher/watcher.ts`):
  - [ ] Watch parent directory (not file directly -- atomic save compatibility)
  - [ ] 80ms base debounce, adaptive: `max(80, lastPipelineTime * 0.8)`
  - [ ] Filter vim temp files: `4913`, `*~`, `.swp`, `.swx`
  - [ ] On file change: re-read file, re-run pipeline, update preview
  - [ ] On file deletion: stop watcher, show warning in status bar
  - [ ] Clean cancellation via `AbortController`
  - [ ] Export only watcher factory + typed event types (debounce logic is internal)
- [ ] Watcher event types as discriminated union:
  ```typescript
  type WatcherEvent =
    | { type: 'change'; path: string }
    | { type: 'delete'; path: string }
    | { type: 'error'; path: string; code: string }
  ```
- [ ] Use bun's built-in `Bun.file().watch()` or `fs.watch` -- evaluate which handles atomic saves better
- [ ] `--no-watch` flag to disable
- [ ] Watcher lifecycle:
  - [ ] Start when entering preview mode
  - [ ] Stop when returning to browser
  - [ ] Stop on exit (cleanup in `renderer.destroy()` handler)
- [ ] Pipeline re-render on change:
  - [ ] Drop intermediate renders (cancel in-flight, only latest content triggers pipeline)
  - [ ] Preserve scroll position during re-render
- [ ] Verify: edit file in external editor, liham updates within ~100ms

**Success criteria:** File changes detected and preview updated with <200ms latency. Watcher stops cleanly on exit. Vim/Neovim atomic saves handled correctly.

#### Phase 6: Kitty Graphics Protocol Images

Implement terminal image rendering for the `<Image>` component.

- [ ] Terminal capability detection (`src/components/block/image/detect.ts`):
  - [ ] **Tier 1: Environment variables** (synchronous, fast):
    - `TERM === 'xterm-kitty'` or `KITTY_WINDOW_ID` set -> Kitty
    - `TERM_PROGRAM === 'WezTerm'` -> WezTerm (requires `enable_kitty_graphics`)
    - `TERM_PROGRAM === 'ghostty'` -> Ghostty
    - `KONSOLE_VERSION` set -> Konsole
  - [ ] **Tier 2: Query sequence** (async, authoritative):
    - Send 1x1 pixel query: `\x1b_Gi=31,s=1,v=1,a=q,t=d,f=24;AAAA\x1b\`
    - Use DA request as sentinel: `\x1b[c`
    - If graphics response arrives before DA -> Kitty supported
  - [ ] **tmux detection**: Check if `TERM` starts with `screen` or `tmux`
    - tmux 3.5+ (March 2026): native Kitty graphics passthrough, no wrapping needed
    - Older tmux: wrap in DCS passthrough `\x1bPtmux;\x1b...\x1b\\`
  - [ ] Cache result for session
- [ ] Image loading (`src/components/block/image/loader.ts`):
  - [ ] Resolve path relative to markdown file's directory
  - [ ] **Security: reject paths that resolve outside markdown file's parent tree** (prevent traversal)
  - [ ] **Check `fs.stat` size before reading** -- reject images > 10MB
  - [ ] **Validate magic bytes** (PNG/JPEG/GIF headers) before processing
  - [ ] Support PNG, JPEG, GIF (first frame)
  - [ ] Resize to fit terminal column width (maintain aspect ratio)
  - [ ] Never include raw file bytes in error messages (show original relative path only)
- [ ] Kitty protocol rendering (`src/components/block/image/kitty.ts`):
  - [ ] Use `f=100` (send PNG format -- let terminal decode)
  - [ ] For local files: use `t=f` (file path) to avoid base64 overhead
  - [ ] For processed/resized images: use `t=d` (direct) with chunked base64 (4096 byte chunks)
  - [ ] **Virtual placements with `U=1`**: transmit image invisibly, render U+10EEEE placeholder characters that scroll naturally with content
  - [ ] Image caching: assign stable image IDs, only retransmit when file changes or terminal width changes
  - [ ] Delete off-screen images to stay within Kitty's 320MB quota
  - [ ] Use `q=1` to suppress OK responses (reduce noise)
- [ ] Fallback rendering (`src/components/block/image/fallback.ts`):
  - [ ] **Tier 1 fallback: ANSI half-block characters** (U+2580-U+259F with 24-bit color) -- pixel-approximated rendering
  - [ ] **Tier 2 fallback: styled alt-text** `[image: alt-text]` for minimal terminals
  - [ ] Failed image load: `[image: failed to load <relative-path>]`
- [ ] Per-document image memory budget (e.g., 50MB total decoded image data, LRU eviction)

**Success criteria:** Images render inline via Kitty protocol in supported terminals. Virtual placements scroll correctly. Non-Kitty terminals show half-block or alt-text fallback. No crashes on missing/broken images.

#### Phase 7: CLI, Distribution, and Go Removal

Complete the CLI interface, set up distribution, and remove Go code.

- [ ] CLI argument parsing (`src/cli/index.ts`):
  - [ ] Positional: `[file-or-directory]` (optional)
  - [ ] `--layout side|top` (default: side)
  - [ ] `--preview-only` / `--source-only` (mutually exclusive)
  - [ ] `--no-watch`
  - [ ] `--sync-scroll` (default: true)
  - [ ] `--version`
  - [ ] `--help`
  - [ ] `completion` subcommand (shell completion generation)
  - [ ] Support `--` separator for filenames starting with `--`
  - [ ] Validate: file exists, is readable via `fs.realpath` (resolve symlinks)
  - [ ] Non-markdown files: show warning but render anyway (user's choice)
  - [ ] Path resolution: `fs.realpath` to canonicalize, reject if resolved path is unexpected
- [ ] Binary compilation:
  - [ ] `bun compile` script in package.json
  - [ ] Test compiled binary on macOS
  - [ ] Publish SHA-256 checksums alongside release binaries
- [ ] npm package setup:
  - [ ] `bin` field in package.json pointing to CLI entry
  - [ ] `files` field to explicitly whitelist published files (no accidental .env leaks)
  - [ ] No `postinstall`/`preinstall` lifecycle scripts
  - [ ] Register `liham` package name proactively
  - [ ] Verify `bun add -g liham` works
- [ ] Feature parity checklist (verify all Go features work):
  - [ ] File argument -> preview mode
  - [ ] Directory argument -> browser mode
  - [ ] No argument -> browser mode (cwd)
  - [ ] Split pane layouts (side, top)
  - [ ] Preview-only and source-only modes
  - [ ] Scroll sync toggle
  - [ ] File watcher with live reload
  - [ ] Back navigation from preview to browser
  - [ ] All keybindings (j/k, arrows, pgup/pgdn, g/G, tab, s, q, esc, ctrl+c)
  - [ ] Mouse wheel scrolling
  - [ ] Terminal resize handling
  - [ ] Status bar with all indicators
  - [ ] Large file warning
- [ ] Remove Go code:
  - [ ] Delete `cmd/`, `internal/`, `main.go`, `go.mod`, `go.sum`
  - [ ] Update or create `README.md`
- [ ] Create `CLAUDE.md` for the TypeScript project

**Success criteria:** `liham` CLI works identically to the Go version for all existing features, plus Kitty images. Available as npm package and compiled binary. Go code removed.

## Alternative Approaches Considered

All evaluated and rejected during brainstorming (see brainstorm: origin):

| Approach | Why Rejected |
|----------|--------------|
| Stay with Go + goldmark custom renderer | No plugin ecosystem, every renderer built from scratch |
| Go TUI + TS renderer subprocess | Two languages, IPC complexity, cross-runtime debugging |
| Go + external tools only | Doesn't solve the architecture gap |
| Ink (React for CLIs) | No built-in scrolling (issues #222, #432 open for years) -- dealbreaker for a markdown previewer |

## System-Wide Impact

### Interaction Graph

CLI entry -> parse args -> detect terminal style (OSC 11) -> detect Kitty graphics support -> create unified.js processor -> if file arg: read file -> run pipeline (with timeout) -> sanitize all text output -> create App component with `useReducer` -> OpenTUI `createRoot().render()`. On file change: watcher fires -> adaptive debounce -> re-read -> re-run pipeline -> cancel in-flight render -> React reconciler diffs component tree -> OpenTUI Zig backend diffs cells and emits ANSI.

### Error Propagation

- **Pipeline errors** (malformed markdown, plugin crash, ReDoS timeout): caught at pipeline level via `Result<T, PipelineError>`, fall back to raw text display. No throws across pipeline boundary.
- **Component render errors**: per-component try/catch in dispatch (OpenTUI may not support React error boundaries). Render inline error marker, don't crash the tree.
- **File system errors** (read failure, permission denied): caught at boundary (watcher module, file reader), surfaced as typed events, shown in status bar.
- **Watcher errors**: watcher emits `{ type: 'error' }` event, App reducer handles it, status bar shows warning.
- **Image load errors**: `<Image>` component renders fallback alt-text. Never exposes resolved absolute paths in error messages.
- **Terminal escape injection**: impossible -- all text passes through `sanitizeForTerminal()` before terminal output.

### State Lifecycle Risks

- **Watcher cleanup**: must stop watcher before mode transition (browser <-> preview) and on exit. Use AbortController pattern. Register `SIGINT`/`SIGTERM` handlers.
- **OpenTUI cleanup**: `renderer.destroy()` must be called on ALL exit paths (normal quit, ctrl+c, SIGTERM, uncaught exceptions). OpenTUI does NOT auto-cleanup.
- **Kitty image cleanup**: images transmitted via Kitty protocol must be deleted (`a=d`) when scrolling out of view and on exit. Virtual placements (U+10EEEE) handle scroll naturally; explicit deletion reclaims terminal memory. Per-document memory budget with LRU eviction prevents unbounded growth.
- **Pipeline re-render race**: if a new file change arrives while pipeline is running, cancel in-flight render and start fresh with latest content. Never show stale partial renders. The adaptive debounce prevents pipeline invocations from stacking.

### Security Considerations

**Priority-ordered remediation (from security review):**

1. **Terminal output sanitization** (Phase 2a) -- `sanitizeForTerminal()` strips control characters from ALL rendered text. Prevents OSC 52 clipboard hijack, CSI cursor manipulation, and Kitty graphics injection via markdown content.
2. **OSC 8 URL sanitization** (Phase 2b) -- whitelist `http:`, `https:`, `mailto:` schemes. Strip control characters. Max 2048 chars.
3. **Image path restriction** (Phase 6) -- resolve relative to markdown dir, reject traversal outside parent tree.
4. **Image size limits** (Phase 6) -- 10MB per image, 50MB per document budget.
5. **Pipeline timeout** (Phase 2a) -- 5-second execution timeout mitigates ReDoS from highlight.js grammars.
6. **Block raw HTML** (Phase 2a) -- `allowDangerousHtml: false` on `remark-rehype`.
7. **Symlink cycle detection** (Phase 4) -- `fs.realpath` + visited path tracking.
8. **npm distribution** (Phase 7) -- `files` field, no lifecycle scripts, SHA-256 checksums.

### Integration Test Scenarios

1. **Live reload with split pane**: edit file in vim (atomic save) -> verify both source and preview update, scroll positions preserved
2. **Browser to preview to browser**: launch without args -> select file -> verify watcher starts -> press esc -> verify watcher stops -> verify browser shows
3. **Resize during scroll sync**: scroll to middle of long file with sync on -> resize terminal -> verify both panes maintain relative position
4. **Image in non-Kitty terminal**: render markdown with images in a terminal without Kitty support -> verify half-block or alt-text fallback, no escape sequence garbage
5. **Large file performance**: open a 2000-line markdown file -> verify pipeline completes in <500ms, scrolling remains smooth
6. **Malicious markdown**: render file with embedded escape sequences (`\x1b]52;c;...`) -> verify sanitization prevents terminal manipulation
7. **Image path traversal**: render file with `![](../../etc/passwd)` -> verify path rejected, fallback rendered
8. **Pipeline timeout**: render file with crafted code block triggering slow highlight.js grammar -> verify timeout, raw text fallback

## Acceptance Criteria

### Functional Requirements

- [ ] All v1 must-have features from brainstorm implemented (file browser, split pane, live reload, scroll sync, pipeline, code blocks, headings/blockquotes/lists/tables, Kitty images)
- [ ] Feature parity with Go version for all existing functionality
- [ ] rehype-terminal handles all GFM elements without crashing
- [ ] Theme auto-detection (dark/light) works without alt-screen delay
- [ ] Image fallback works gracefully on non-Kitty terminals (half-block or alt-text)
- [ ] Terminal escape sequences in markdown content are sanitized before output
- [ ] All text output passes through `sanitizeForTerminal()`

### Non-Functional Requirements

- [ ] Pipeline renders 500-line markdown in <200ms
- [ ] Scrolling maintains 60fps in OpenTUI (Zig backend target: 30-60fps)
- [ ] `bun compile` produces working binary
- [ ] npm global install works
- [ ] Clean exit on ALL paths: no orphan watchers, no Kitty image artifacts, terminal restored via `renderer.destroy()`
- [ ] Image memory budget enforced (50MB per document, LRU eviction)

### Quality Gates

- [ ] ESLint + Biome pass with zero warnings
- [ ] No empty catch blocks anywhere (`allowEmptyCatch: false`)
- [ ] No `any` types (`@typescript-eslint/no-explicit-any: 'error'`)
- [ ] TypeScript strict mode with `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`
- [ ] Module boundaries enforced via `eslint-plugin-boundaries`
- [ ] Pipeline tested with malformed markdown (unclosed fences, broken tables, nested edge cases)
- [ ] Security tests: escape injection, path traversal, oversized images
- [ ] Test runner: `bun:test` with unit tests for pipeline, components, watcher, scanner

## Performance Considerations

### Research Insights: Performance Analysis

**Scalability estimates (without optimization):**

| Document size | Components (est.) | Pipeline (est.) | Reconciliation (est.) | Total (est.) |
|---|---|---|---|---|
| 100 lines | 40-80 | 3-8ms | 5-10ms | 8-18ms |
| 500 lines | 150-300 | 10-25ms | 20-40ms | 30-65ms |
| 1000 lines | 300-600 | 20-50ms | 50-100ms | 70-150ms |
| 2000 lines | 600-1200 | 40-100ms | 100-200ms | 140-300ms |
| 5000 lines | 1500-3000 | 100-250ms | 250-500ms | 350-750ms |

**Required optimizations (priority order):**

1. **Component tree virtualization** (Priority 1 -- required for launch). Only materialize React components for visible viewport + overscan buffer. Nodes outside viewport remain as hast data. This is the single highest-impact optimization.

2. **Adaptive debounce** (Priority 1). Prevent pipeline stacking: `max(80, lastPipelineTime * 0.8)`. Simple to implement, prevents worst-case UX.

3. **Kitty image caching with stable IDs** (Priority 1). Assign stable image IDs, transmit once, re-display with placement commands. Without this, image-heavy docs are unusable during live reload.

4. **Source-map scroll sync** (Priority 2). Propagate mdast/hast position data to component tree. Sync by document position, not scroll percentage. Percentage-based sync drifts with variable-height components.

5. **Worker thread for pipeline** (Priority 2). Run remark-parse through rehype plugins in a `Bun.Worker`. Keep rehype-terminal (component creation) on main thread. Preserves 60fps scroll during pipeline execution.

6. **Pipeline caching** (Priority 2). Cache unified processor (create once, reuse). Cache intermediate hast tree -- skip re-processing when content unchanged (hash comparison).

**Memory budget:** ~2-4MB steady state for large documents (AST + component tree). Image cache needs LRU cap (50MB) to prevent growth.

## Dependencies and Prerequisites

| Dependency | Risk | Mitigation |
|------------|------|------------|
| OpenTUI v0.1.x | Pre-1.0, API unstable, Bun-exclusive | Pin version. Validate in Phase 2a vertical slice. Abstract component layer enables framework swap. |
| unified.js ecosystem | Stable, well-maintained | Low risk. ~37M weekly downloads. |
| bun | Required by OpenTUI | Accept Bun lock-in. No Node.js fallback for OpenTUI currently. |
| bun compile | Relatively new feature | Test early in Phase 7. Fallback: npm-only distribution. |
| Kitty Graphics Protocol | Terminal-dependent | Graceful fallback chain: Kitty -> half-block -> alt-text. |

## Risk Analysis and Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| OpenTUI can't handle large component trees | Medium | Critical | Phase 2a vertical slice validates with 200+ components. If fails: component tree virtualization, or fallback to Ink + custom scroll. |
| OpenTUI breaking changes | High | Medium | Pin version. Budget time for upstream tracking. Abstract component layer limits blast radius. |
| Bun incompatibility on target platform | Low | High | Test on macOS (primary). Linux testing in CI. |
| Pipeline too slow for live reload | Low | High | Benchmark in Phase 2a. If slow: adaptive debounce, worker thread, incremental rendering. |
| Kitty protocol complexity in tmux | Medium | Medium | tmux 3.5+ has native support (March 2026). Older tmux: DCS passthrough. If unreliable: skip images in tmux. |
| Terminal escape injection via markdown | Medium | High | `sanitizeForTerminal()` on all text output. Pipeline timeout. `allowDangerousHtml: false`. |
| `bun compile` binary too large | Low | Low | Accept size. npm install for users who care about size. |
| Scroll sync drift with component rendering | High | Medium | Start with percentage-based (Go parity). Source position annotations enable heading-aware sync as fast follow. |

## Testing Strategy

- **Test runner:** `bun:test` (built-in, fast, TypeScript-native)
- **Unit tests:**
  - Pipeline: markdown string -> verify TerminalNode tree structure
  - sanitizeForTerminal: verify control character stripping
  - Individual components: verify render output
  - Scanner: verify directory walking, symlink handling, exclusions
  - Watcher: verify debounce, vim temp filtering, cancellation
  - Scroll sync: verify percentage calculation, zero-division guard
- **Integration tests:**
  - Full pipeline: markdown -> pipeline -> component tree -> verify all GFM elements
  - Security: escape injection, path traversal, oversized images
  - Performance: 500-line benchmark < 200ms
- **Snapshot tests:** rendered component tree snapshots for regression detection
- **No tests in Go version** -- this is the opportunity to establish a testing foundation

## Future Considerations

These are explicitly deferred beyond v1 (see brainstorm: origin):

- Math/LaTeX rendering (rehype-katex -> terminal)
- Mermaid diagrams (shell out to mmdc -> Kitty image)
- Callout/admonition blocks
- Table of contents sidebar
- Custom user themes (JSON/TS files, validated with valibot/zod)
- Rich markdown editor mode
- Sixel fallback for older terminals
- WASM plugin support
- stdin piping (`cat README.md | liham`)
- Heading-aware scroll sync (position annotations in place from Phase 3)
- AST-level incremental diffing for optimal live reload performance
- Node.js/Deno runtime support (when OpenTUI adds it)

## Sources and References

### Origin

- **Brainstorm document:** [docs/brainstorms/2026-03-04-ts-rewrite-remark-pipeline-brainstorm.md](docs/brainstorms/2026-03-04-ts-rewrite-remark-pipeline-brainstorm.md) -- key decisions carried forward: OpenTUI over Ink (scrolling), component-based rendering over string-based, strict dev tooling with no swallowed catches

### Internal References

- Go orchestrator pattern: `internal/app/model.go` (mode switching, scroll sync, watcher lifecycle)
- Go watcher pattern: `internal/watcher/watcher.go` (parent-dir watching, 80ms debounce, vim temp filter)
- Go layout calculations: `internal/app/layout.go` (pane dimensions)
- Go scroll sync: `internal/app/model.go` (percentage-based with zero-division guard)
- Go CLI flags: `cmd/root.go` (all flags and argument handling)
- Go config model: `internal/app/config.go` (Mode, Layout typed enums)
- Go escape sanitization: `internal/browser/model.go:138` (hasControlChars pattern)
- Terminal style pre-detection fix: `docs/brainstorms/2026-03-04-slow-initial-load-brainstorm.md`
- Completed Go plan: `docs/plans/2026-03-04-feat-liham-markdown-preview-tui-plan.md`
- Dev tooling configs: `~/Documents/code/personal/2026/home-jarvis/eslint.config.base.ts`, `~/Documents/code/personal/2026/home-jarvis/biome.json`

### External References

- [OpenTUI](https://github.com/anomalyco/opentui) v0.1.86: TS TUI framework, Zig backend, React reconciler, `<scrollbox>`, Bun-exclusive
- [@opentui/react README](https://github.com/sst/opentui/blob/main/packages/react/README.md): hooks, intrinsic elements, setup
- [unified.js](https://github.com/unifiedjs/unified): plugin pipeline, custom compiler API, `CompileResultMap`
- [hast-util-to-jsx-runtime](https://github.com/syntax-tree/hast-util-to-jsx-runtime): reference for hast -> React conversion (recursive dispatch, ancestor tracking, component mapping)
- [rehype-react](https://github.com/rehypejs/rehype-react): reference for custom rehype compiler producing React elements
- [hast specification](https://github.com/syntax-tree/hast): node types (root, element, text, comment, doctype)
- [Kitty Graphics Protocol spec](https://sw.kovidgoyal.net/kitty/graphics-protocol/): escape sequences, virtual placements, chunked transfer
- [terminal-image](https://github.com/sindresorhus/terminal-image): reference for Kitty/iTerm2 detection via environment variables
- [tmux native Kitty graphics (March 2026)](http://www.mail-archive.com/tmux-git@googlegroups.com/msg02861.html): no DCS wrapping for tmux 3.5+
- Ink scrolling issues: https://github.com/vadimdemedes/ink/issues/222
- [OpenTUI Kitty graphics issue #92](https://github.com/anomalyco/opentui/issues/92): native image support tracked
- [awesome-opentui](https://github.com/msmps/awesome-opentui): community projects and adoption
