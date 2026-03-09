---
title: "feat: Math & Mermaid Rendering"
type: feat
status: completed
date: 2026-03-08
deepened: 2026-03-08
origin: docs/brainstorms/2026-03-07-next-features-roadmap-brainstorm.md
supersedes: docs/plans/2026-03-07-feat-math-mermaid-plan.md
---

# Math & Mermaid Rendering

## Enhancement Summary

**Deepened on:** 2026-03-08
**Research agents used:** OpenTUI skill, TypeScript reviewer, architecture strategist, pattern recognition, spec-flow analyzer, performance oracle, code simplicity reviewer, context7 (remark-math docs)

### Key Improvements from Research
1. **Type-safe `CustomNodeDataMap`** — eliminates all `as MathNodeData` casts via conditional type on `CustomNode<T>.data`
2. **Split `mathInline`/`mathDisplay` types** — cleaner than runtime `data.display` check; direct switch dispatch, proper `BLOCK_TYPES` membership
3. **Themed mermaid output** — `beautiful-mermaid` supports `AsciiRenderOptions` with `colorMode: 'truecolor'` and `AsciiTheme` — diagrams match dark/light themes
4. **OpenTUI API corrections** — `titleColor` doesn't exist; `borderColor` colors the title; use `style` record pattern from `code-block.tsx`
5. **Thread `theme` into `RenderContext`** — mermaid renderer needs theme; currently not on `RenderContext`
6. **CRITICAL: Inline math in `renderInlineNode`** — inline math inside paragraphs flows through `inline.tsx`, not `index.tsx`. Without handling there, inline math silently disappears
7. **`extractText` for math in TOC** — math nodes in headings must be handled by `extractText` so TOC shows readable text
8. **try/catch on `unicodeit.replace()`** — defensive; falls back to raw LaTeX on unexpected errors

---

## Overview

Render LaTeX math as Unicode symbols and Mermaid diagrams as ASCII art in liham's terminal preview.

**Libraries chosen** (tested in prior session):
- **`unicodeit`** — LaTeX → Unicode. Exports `replace(f: string): string`. Handles Greek letters, super/subscripts, operators, arrows. Fails gracefully on unsupported constructs (fractions, matrices pass through as raw LaTeX). Already installed.
- **`beautiful-mermaid`** — Mermaid → ASCII box-drawing art. Exports `renderMermaidASCII(text: string, options?: AsciiRenderOptions): string`. Supports flowchart, sequence, class, state diagrams. Synchronous, no external dependencies. Supports truecolor ANSI output with themed colors. Already installed.
- **`remark-math`** — parses `$...$` and `$$...$$` in markdown into proper mdast nodes. Needs to be added.

(see brainstorm: `docs/brainstorms/2026-03-07-next-features-roadmap-brainstorm.md`, section 5)

## Why This Approach (vs. Draft Plan)

The [draft plan](docs/plans/2026-03-07-feat-math-mermaid-plan.md) proposed:
1. A custom Unicode translation engine (~200 lines)
2. `@mermaid-js/mermaid-cli` (Puppeteer/Chromium, ~200MB, async PNG rendering)

**What changed:**
- `unicodeit` replaces the custom translator — battle-tested, covers more symbols, zero maintenance
- `beautiful-mermaid` replaces mermaid-cli — synchronous ASCII output, no Puppeteer, no image pipeline needed, always available (no "install mmdc" fallback needed), themed ANSI color support

**Result:** ~60% less code. No async rendering pipeline for mermaid. No optional dependency detection. No image decode/halfblock path for diagrams.

## Architecture

```
pipeline:
  remark-parse → remark-math → remark-gfm → remark-rehype → rehype-highlight → rehype-ir

remark-math + remark-rehype output (hast):
  inline: <code class="language-math math-inline">x^2</code>
  display: <pre><code class="language-math math-display">\sum_{i=0}^n</code></pre>

rehype-ir interception:
  compileCode: detect class "math-inline" → CustomNode<'mathInline'> { data: { latex } }
  compilePre:  detect language "math"     → CustomNode<'mathDisplay'> { data: { latex } }
  compilePre:  detect language "mermaid"  → CustomNode<'mermaid'> { data: { source } }

renderer:
  mathInline:   unicodeit.replace(latex) → <span fg={fg}>...</span> (inside <text>)
  mathDisplay:  unicodeit.replace(latex) → <box marginBottom=1><text>...</text></box>
  mermaid:      renderMermaidASCII(source, { colorMode, theme }) → <box border title="mermaid">...</box>
  mermaid err:  catch → styled code block with source + error hint
```

### Research Insight: Type-safe custom node data

Instead of `data: Record<string, unknown>` with unsafe casts, use a conditional type map:

```ts
interface CustomNodeDataMap {
  mathInline: { latex: string; fg: string }
  mathDisplay: { latex: string; fg: string }
  mermaid: { source: string }
}

export interface CustomNode<T extends string = string> {
  type: T
  children?: IRNode[]
  data: T extends keyof CustomNodeDataMap ? CustomNodeDataMap[T] : Record<string, unknown>
  style?: Record<string, unknown>
}
```

This gives `CustomNode<'mathInline'>` a properly typed `data.latex` without casting. Existing `CustomNode<string>` retains backward compatibility.

### Research Insight: Split mathInline/mathDisplay types

Instead of a single `'math'` type with `data.display` boolean:
- `'mathInline'` — inline node, NOT in `BLOCK_TYPES`
- `'mathDisplay'` — block node, added to `BLOCK_TYPES`

Benefits: no runtime `data.display` check in `isBlockNode`, direct switch dispatch in `renderNode`, cleaner type narrowing.

### Critical: Inline math rendering path

Inline math inside paragraphs flows through `renderInlineNode` (inline.tsx:51), NOT `renderNode` (index.tsx). The `default` case in `renderInlineNode` returns `null`, so inline math would silently disappear unless we add handling there too. Phase 2d addresses this.

### Critical: extractText for math nodes

`extractText` (text-utils.ts:10) skips nodes it can't match. A `mathInline` CustomNode inside a heading (`## The $\alpha$ Algorithm`) would be silently lost from TOC text. Phase 2d adds `mathInline` handling to `extractText`.

### File Map

**New files:**
- `src/renderer/opentui/math.tsx` — math inline + display renderer components
- `src/renderer/opentui/mermaid.tsx` — mermaid ASCII renderer component
- `src/pipeline/compile-math.ts` — math interception for rehype-ir
- `src/pipeline/compile-mermaid.ts` — mermaid interception for rehype-ir
- `src/pipeline/compile-math.test.ts` — math pipeline integration tests
- `src/pipeline/compile-mermaid.test.ts` — mermaid pipeline integration tests
- `test/fixtures/math-mermaid.md` — test fixture document

**Modified files:**
- `src/pipeline/processor.ts:19` — add `.use(remarkMath)` between `remarkParse` and `remarkGfm`
- `src/pipeline/rehype-ir.ts:252,465` — call math/mermaid compile handlers from `compilePre` and `compileCode`
- `src/ir/types.ts:185-190,228-244` — add `CustomNodeDataMap`, `'mathDisplay'` and `'mermaid'` to `BLOCK_TYPES`
- `src/renderer/opentui/index.tsx:36-42,49-50` — add `theme` to `RenderContext`, dispatch `mathInline`/`mathDisplay`/`mermaid`
- `src/theme/types.ts:91-107` — add `MathTokens`, `MermaidTokens` to `ThemeTokens`
- `src/theme/dark.ts` — add math/mermaid token values
- `src/theme/light.ts` — add math/mermaid token values
- `package.json` — add `remark-math` dependency

---

## Phase 1: Foundation — Types, Theme, Pipeline Setup

Scaffolding: IR types, theme tokens, remark-math in the pipeline. No rendering yet.

### 1a: Add remark-math to pipeline

- [ ] `bun add remark-math`
- [ ] modify `src/pipeline/processor.ts:19`: insert `.use(remarkMath)` after `.use(remarkParse)` and before `.use(remarkGfm)`
- [ ] verify: process a markdown string with `$x^2$` and inspect the hast output to confirm `<code class="language-math math-inline">` is produced

Reference: `src/pipeline/processor.ts:17-27` — current pipeline chain

**Research insight (remark-math docs):** `singleDollarTextMath: true` is the default — single `$` delimiters work out of the box. The option can be set to `false` if dollar-sign false positives become an issue. remark-math requires matching `$...$` pairs on the same line for inline, and `$$...$$` on separate lines for display.

### 1b: IR type helpers

- [ ] add `CustomNodeDataMap` to `src/ir/types.ts`:
  ```ts
  // type-safe data map for custom nodes — eliminates unsafe casts
  export interface CustomNodeDataMap {
    mathInline: { latex: string; unicode: string; fg: string }
    mathDisplay: { latex: string; unicode: string; fg: string }
    mermaid: { source: string; rendered: string | null; error: string | null }
  }
  ```
- [ ] update `CustomNode` to use conditional data type:
  ```ts
  export interface CustomNode<T extends string = string> {
    type: T
    children?: IRNode[]
    data: T extends keyof CustomNodeDataMap ? CustomNodeDataMap[T] : Record<string, unknown>
    style?: Record<string, unknown>
  }
  ```
- [ ] add `'mathDisplay'` and `'mermaid'` to the `BLOCK_TYPES` set (both are block-level). `'mathInline'` is NOT added (it's inline)

Reference: `src/ir/types.ts:185-190` — `CustomNode<T>` definition; lines 228-248 — `BLOCK_TYPES` and `isBlockNode`

### 1c: Theme tokens

- [ ] add to `src/theme/types.ts`:
  ```ts
  export interface MathTokens {
    textColor: string
  }

  export interface MermaidTokens {
    borderColor: string
    textColor: string
    labelColor: string
    errorColor: string
  }
  ```
- [ ] add `math: MathTokens` and `mermaid: MermaidTokens` to `ThemeTokens` interface

- [ ] add to `src/theme/dark.ts`:
  ```ts
  math: {
    textColor: '#c0caf5',      // matches paragraph text
  },
  mermaid: {
    borderColor: '#414868',    // matches code block border
    textColor: '#c0caf5',      // matches paragraph text
    labelColor: '#7aa2f7',     // blue accent (matches code block language label)
    errorColor: '#565f89',     // dim hint text
  },
  ```

- [ ] add to `src/theme/light.ts`:
  ```ts
  math: {
    textColor: '#343b59',
  },
  mermaid: {
    borderColor: '#9699a3',
    textColor: '#343b59',
    labelColor: '#34548a',
    errorColor: '#8c8fa1',
  },
  ```

Reference: `src/theme/types.ts:91-107` — `ThemeTokens`; `src/theme/dark.ts:3-80`; `src/theme/light.ts:4-81`

### 1d: Thread theme into RenderContext

- [ ] add `theme: ThemeTokens` to `RenderContext` interface in `src/renderer/opentui/index.tsx:36-42`
- [ ] pass `theme` when constructing `RenderContext` in `renderToOpenTUI` (the top-level entry)
- [ ] needed by mermaid renderer which takes `ThemeTokens` for both box styling and `AsciiRenderOptions`

### 1e: Verify setup

- [ ] `bun run check` passes (types compile, lint clean)

---

## Phase 2: Math — Compile + Render

### 2a: Math compile handler

- [ ] create `src/pipeline/compile-math.ts`:
  ```ts
  // compile math hast nodes to IR CustomNode<'mathInline'> / CustomNode<'mathDisplay'>
  // unicodeit.replace() runs here at compile-time, not in the renderer
  import type { Element, Text } from 'hast'
  import { replace } from 'unicodeit'

  import type { CustomNode } from '../ir/types.ts'
  import type { ThemeTokens } from '../theme/types.ts'

  // inline text extraction from hast element (avoids importing rehype-ir internals)
  function textContent(node: Element): string {
    let text = ''
    for (const child of node.children) {
      if (child.type === 'text') text += (child as Text).value
      else if (child.type === 'element') text += textContent(child as Element)
    }
    return text
  }

  function safeReplace(latex: string): string {
    try {
      return replace(latex)
    } catch {
      return latex
    }
  }

  export function compileMathInline(node: Element, theme: ThemeTokens): CustomNode<'mathInline'> {
    const latex = textContent(node)
    return {
      type: 'mathInline',
      data: { latex, unicode: safeReplace(latex), fg: theme.math.textColor },
    }
  }

  export function compileMathDisplay(node: Element, theme: ThemeTokens): CustomNode<'mathDisplay'> {
    // display math: <pre><code class="language-math math-display">latex</code></pre>
    const codeEl = node.children.find(
      (c): c is Element => c.type === 'element' && c.tagName === 'code',
    )
    const latex = codeEl != null ? textContent(codeEl) : textContent(node)
    return {
      type: 'mathDisplay',
      data: { latex, unicode: safeReplace(latex), fg: theme.math.textColor },
    }
  }
  ```

**Performance insight:** `unicodeit.replace()` runs at compile-time (in the pipeline), not during React render. The function iterates ~4,400 substitution entries per call (~600-800μs each). Moving it to compile-time means it runs once per pipeline pass, not on every re-render/resize. The `safeReplace` wrapper catches unexpected errors and falls back to raw LaTeX.

**Research insight:** `fg` is folded into `data` instead of `style` — avoids `style: Record<string, unknown>` casting entirely. The compile handler knows the color; the renderer reads `node.data.fg` directly (type-safe via `CustomNodeDataMap`).

### 2b: Wire math into rehype-ir

- [ ] add a helper in `rehype-ir.ts`:
  ```ts
  function hasClass(node: Element, className: string): boolean {
    const classes = node.properties?.['className']
    return Array.isArray(classes) && classes.includes(className)
  }
  ```

- [ ] modify `compileCode` (line 465): before the `isInsidePre` check, add:
  ```ts
  if (hasClass(node, 'math-inline')) {
    return compileMathInline(node, state.theme)
  }
  ```

- [ ] modify `compilePre` (line 252): at the top, add:
  ```ts
  const language = extractLanguage(node)
  if (language === 'math') {
    return compileMathDisplay(node, state.theme)
  }
  ```

- [ ] add imports at top of `rehype-ir.ts`:
  ```ts
  import { compileMathInline, compileMathDisplay } from './compile-math.ts'
  ```

Reference: `src/pipeline/rehype-ir.ts:465-477` — `compileCode`; lines 252-267 — `compilePre`; line 11 — existing compile-media import pattern

### 2c: Math renderer component

- [ ] create `src/renderer/opentui/math.tsx`:
  ```ts
  // math renderer — reads pre-computed unicode from compile-time IR data
  import type { ReactNode } from 'react'

  import type { CustomNode } from '../../ir/types.ts'

  export function renderMathInline(node: CustomNode<'mathInline'>, key: string): ReactNode {
    return <span key={key} fg={node.data.fg}>{node.data.unicode}</span>
  }

  export function renderMathDisplay(node: CustomNode<'mathDisplay'>, key: string): ReactNode {
    return (
      <box key={key} style={{ marginBottom: 1 }}>
        <text><span fg={node.data.fg}>{node.data.unicode}</span></text>
      </box>
    )
  }
  ```

**Performance note:** No `unicodeit` import here — `replace()` runs at compile-time in `compile-math.ts`. The renderer just reads `node.data.unicode`. Zero render-time cost.

**OpenTUI correctness notes:**
- `<span fg={...}>` must be inside `<text>` — display math wraps in `<box><text><span>`, inline math returns a `<span>` that will be wrapped by the parent `<text>` from `renderChildren.flushInline()`
- `marginBottom` in `style={}` is supported by OpenTUI `<box>`
- No `key` on inner `<span>`/`<text>` — only the outermost element needs a key

### 2d: Wire math into renderNode + renderInlineNode + extractText

**renderNode (index.tsx):**
- [ ] modify `src/renderer/opentui/index.tsx:49-50`: before the `if (!isCoreNode(node))` check, add:
  ```ts
  if (node.type === 'mathInline') {
    return renderMathInline(node as CustomNode<'mathInline'>, key)
  }
  if (node.type === 'mathDisplay') {
    return renderMathDisplay(node as CustomNode<'mathDisplay'>, key)
  }
  ```

No runtime `data.display` check needed — the type discriminant handles dispatch directly.

**CRITICAL — renderInlineNode (inline.tsx):**
- [ ] modify `src/renderer/opentui/inline.tsx:51`: add `mathInline` handling in `renderInlineNode`. Inline math inside paragraphs flows through `renderInlineChildren` → `renderInlineNode`, NOT through `renderNode`. Without this, inline math silently returns `null` (the `default` case at line 96).

  Add before the `default` case in the switch:
  ```ts
  // in renderInlineNode switch — handle custom math nodes in inline context
  default: {
    if (node.type === 'mathInline') {
      return renderMathInline(node as CustomNode<'mathInline'>, key)
    }
    return null
  }
  ```
  Add import: `import { renderMathInline } from './math.tsx'` and `import type { CustomNode } from '../../ir/types.ts'`

**extractText (text-utils.ts):**
- [ ] modify `src/ir/text-utils.ts:10`: add `mathInline` handling so TOC headings with math (e.g., `## The $\alpha$ Algorithm`) show readable text. After the `break` check:
  ```ts
  } else if (child.type === 'mathInline' && 'data' in child) {
    result += (child as { data: { latex: string } }).data.latex
  }
  ```

**estimateHeightInternal (scroll-utils.ts):**
- [ ] note: `mathDisplay` and `mermaid` as CustomNodes fall through to `default: return 1` in `estimateHeightInternal`. This is acceptable — `mathDisplay` is ~2 rows and `mermaid` varies, but the height estimation is approximate anyway and only used for search scroll-to-match.

### 2e: Math tests

Test files: `src/pipeline/compile-math.test.ts` (co-located with source)

- [ ] pipeline test: `$x^2$` → produces node with `type === 'mathInline'` and `data.latex === 'x^2'`
- [ ] pipeline test: `$$\sum_{i=0}^n$$` → produces node with `type === 'mathDisplay'` and `data.latex === '\\sum_{i=0}^n'`
- [ ] pipeline test: regular inline code `` `code` `` still produces `inlineCode` node (no false positive)
- [ ] pipeline test: regular code block ` ```js ... ``` ` still produces `codeBlock` node (no false positive)
- [ ] unit test: `replace('x^2')` → `'x²'` (verify unicodeit works as expected)
- [ ] unit test: `replace('\\alpha + \\beta')` → `'α + β'`
- [ ] unit test: unsupported constructs pass through without crash
- [ ] pipeline test: `isBlockNode` returns `true` for `mathDisplay`, `false` for `mathInline`
- [ ] integration test: `extractText` on heading with math returns latex string (TOC correctness)

---

## Phase 3: Mermaid — Compile + Render

### 3a: Mermaid compile handler

- [ ] create `src/pipeline/compile-mermaid.ts`:
  ```ts
  // compile mermaid code blocks to IR CustomNode<'mermaid'>
  // renderMermaidASCII runs here at compile-time, not in the renderer
  import type { AsciiRenderOptions } from 'beautiful-mermaid'
  import { renderMermaidASCII } from 'beautiful-mermaid'
  import type { Element, Text } from 'hast'

  import type { CustomNode } from '../ir/types.ts'
  import type { ThemeTokens } from '../theme/types.ts'

  function textContent(node: Element): string {
    let text = ''
    for (const child of node.children) {
      if (child.type === 'text') text += (child as Text).value
      else if (child.type === 'element') text += textContent(child as Element)
    }
    return text
  }

  export function compileMermaidBlock(node: Element, theme: ThemeTokens): CustomNode<'mermaid'> {
    const codeEl = node.children.find(
      (c): c is Element => c.type === 'element' && c.tagName === 'code',
    )
    const source = codeEl != null ? textContent(codeEl) : textContent(node)

    let rendered: string | null = null
    let error: string | null = null
    try {
      const options: AsciiRenderOptions = {
        colorMode: 'truecolor',
        theme: {
          fg: theme.mermaid.textColor,
          border: theme.mermaid.borderColor,
          line: theme.mermaid.borderColor,
          arrow: theme.mermaid.labelColor,
        },
      }
      rendered = renderMermaidASCII(source, options)
    } catch (e) {
      error = e instanceof Error ? e.message : 'unsupported diagram type'
    }

    return {
      type: 'mermaid',
      data: { source, rendered, error },
    }
  }
  ```

**Performance insight:** `renderMermaidASCII` runs at compile-time (pipeline), not during React render. Its A* pathfinder can take ~4ms for 20-node diagrams. Moving it out of the render path prevents blocking on re-render/resize.

**Research insight:** The `textContent` helper is duplicated from `compile-math.ts`. Consider extracting to a shared `src/pipeline/hast-utils.ts` if it bothers you — but two small inline helpers is also fine (simplicity reviewer says keep it simple).

### 3b: Wire mermaid into rehype-ir

- [ ] modify `compilePre` (line 252): after the math check, add:
  ```ts
  if (language === 'mermaid') {
    return compileMermaidBlock(node, state.theme)
  }
  ```
  (before the normal `codeBlock` return)

- [ ] add import: `import { compileMermaidBlock } from './compile-mermaid.ts'`

### 3c: Mermaid renderer component

- [ ] create `src/renderer/opentui/mermaid.tsx`:
  ```ts
  // mermaid renderer — displays pre-computed ASCII from compile-time
  import type { ReactNode } from 'react'

  import type { CustomNode } from '../../ir/types.ts'
  import type { ThemeTokens } from '../../theme/types.ts'

  export function renderMermaidBlock(
    node: CustomNode<'mermaid'>,
    key: string,
    theme: ThemeTokens,
  ): ReactNode {
    const boxStyle: Record<string, unknown> = {
      flexDirection: 'column',
      marginBottom: 1,
      borderColor: theme.mermaid.borderColor,
      borderStyle: 'single',
    }

    // error case: fallback to source with hint
    if (node.data.rendered == null) {
      return (
        <box key={key} style={boxStyle} border title="mermaid">
          <text fg={theme.mermaid.errorColor}>{node.data.source}</text>
          <text fg={theme.mermaid.errorColor}>[{node.data.error ?? 'unsupported diagram type'}]</text>
        </box>
      )
    }

    return (
      <box key={key} style={boxStyle} border title="mermaid">
        <text>{node.data.rendered}</text>
      </box>
    )
  }
  ```

**Performance note:** No `beautiful-mermaid` import here — `renderMermaidASCII()` runs at compile-time in `compile-mermaid.ts`. The renderer reads `node.data.rendered` (pre-computed ASCII string) or falls back to `node.data.source` + `node.data.error` on failure. Zero render-time cost.

**OpenTUI API corrections (from skill review):**
- `title` is a **direct prop** on `<box>`, not inside `style={}`
- `titleColor` does NOT exist — `borderColor` controls both border and title color
- `borderStyle: 'single'` goes inside `style={}` — valid values: `single | double | rounded | bold | none`
- Use the `style` record pattern from `code-block.tsx` (line 8-17) for consistency
- Multi-line `\n` in `<text>` works — `ascii` string with embedded newlines renders correctly

**Note on ANSI colors:** When `colorMode: 'truecolor'` is set, the rendered string contains ANSI escape sequences. OpenTUI's `<text>` should pass these through to the terminal as-is. If it strips them, change `compile-mermaid.ts` to use `colorMode: 'none'` and add `fg={theme.mermaid.textColor}` to the `<text>` wrapper.

### 3d: Wire mermaid into renderNode

- [ ] modify `src/renderer/opentui/index.tsx`: add mermaid dispatch alongside math (before `isCoreNode` check):
  ```ts
  if (node.type === 'mermaid') {
    return renderMermaidBlock(node as CustomNode<'mermaid'>, key, ctx.theme)
  }
  ```

### 3e: Mermaid tests

Test files: `src/pipeline/compile-mermaid.test.ts` (co-located with source)

- [ ] pipeline test: ` ```mermaid\ngraph TD\n  A-->B\n``` ` → produces `CustomNode<'mermaid'>` with `data.source`
- [ ] pipeline test: ` ```javascript\ncode\n``` ` still produces `codeBlock` (no false positive)
- [ ] unit test: `renderMermaidASCII('graph TD\n  A-->B')` returns a string containing box-drawing characters
- [ ] unit test: unsupported diagram type (e.g., `pie title X`) throws — verify fallback renders

---

## Phase 4: Test Fixture & Polish

### 4a: Test fixture document

- [ ] create `test/fixtures/math-mermaid.md` with:
  - inline math: `The equation $x^2 + y^2 = z^2$ is well known.`
  - display math: `$$\sum_{i=0}^n x_i^2$$`
  - complex display: `$$\int_0^\infty e^{-x} dx = 1$$`
  - unsupported: `$$\begin{pmatrix} a & b \\ c & d \end{pmatrix}$$`
  - mermaid flowchart with ` ```mermaid ` fence
  - mermaid sequence diagram
  - regular code block (verify no interference)
  - mixed content: math inline within paragraphs, mermaid between paragraphs
  - math in heading: `## The $\alpha$ Algorithm` — verify TOC extracts text correctly

### 4b: Edge cases

- [ ] dollar sign in non-math context: `the price is $5` — verify remark-math handles this correctly (single `$` with no closing `$` on the same line should not trigger math mode)
- [ ] empty math: `$$$$` — should produce empty math node, renderer shows nothing or empty string
- [ ] mermaid with syntax errors: `renderMermaidASCII` throws → fallback shows source with hint
- [ ] math inside other elements: `**$\alpha$**` — math inside bold text
- [ ] adjacent math: `$a$ and $b$` — two separate inline math nodes
- [ ] math in headings: `## $E = mc^2$` — verify TOC `extractText` handles `mathInline` nodes (returns the latex string so TOC shows readable text)
- [ ] wide mermaid diagrams: verify ASCII art doesn't wrap mid-line and break alignment. If parent container is narrower than diagram, lines may clip or wrap
- [ ] ANSI escape passthrough: verify OpenTUI `<text>` renders beautiful-mermaid's truecolor ANSI output correctly. If not, fall back to `colorMode: 'none'`

### 4c: Quality gates

- [ ] `bun run check` passes clean (typecheck + lint)
- [ ] `bun test` — all existing tests still pass, new tests pass
- [ ] manual test: open `test/fixtures/math-mermaid.md` in liham, verify math renders as Unicode, mermaid renders as themed ASCII art

---

## Acceptance Criteria

### Math
- [ ] `$x^2$` renders inline as `x²` with theme text color
- [ ] `$$\sum_{i=0}^n x_i$$` renders as a block: `∑ᵢ₌₀ⁿ xᵢ`
- [ ] Greek letters, operators, arrows render as Unicode symbols
- [ ] Unsupported LaTeX passes through as raw text (no crash)
- [ ] Regular inline code and code blocks are unaffected
- [ ] Math in headings works and TOC shows readable text

### Mermaid
- [ ] ` ```mermaid ` blocks render as themed ASCII art in a bordered box with "mermaid" title
- [ ] Diagram colors match the active theme (dark/light)
- [ ] Unsupported diagram types fall back to source code with hint
- [ ] Non-mermaid code blocks are unaffected
- [ ] No crash on malformed mermaid input

### General
- [ ] All existing 501+ tests pass (no regressions)
- [ ] `bun run check` clean
- [ ] Works in both dark and light themes
- [ ] No unsafe type casts (`as` keyword) for custom node data access

---

## Risk Analysis

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|------------|
| remark-math false positives on `$` currency | Medium | Low | remark-math handles this well by default (needs matching `$...$` pair on same line) |
| unicodeit gaps on complex LaTeX | Low | High | Expected — unsupported constructs pass through as raw LaTeX |
| beautiful-mermaid unsupported diagrams | Low | Medium | try/catch with code block fallback |
| remark-math version conflict with unified | Medium | Low | Check compatibility before adding |
| Box-drawing chars misaligned in some terminals | Low | Medium | beautiful-mermaid output uses standard Unicode box-drawing |
| ANSI escape codes in text not rendered by OpenTUI | Medium | Medium | Test truecolor mode; fall back to `colorMode: 'none'` if needed |
| Wide mermaid diagrams overflow container | Low | Medium | Accept clipping; no easy fix without diagram size constraints |
| Math in headings breaks TOC text extraction | Medium | Low | `extractText` in index.tsx must handle `mathInline` nodes |

## Dependencies

### New
- `remark-math` — required, parse `$...$` and `$$...$$`

### Already Installed
- `unicodeit` — LaTeX → Unicode (`replace(f: string): string`)
- `beautiful-mermaid` — Mermaid → ASCII art (`renderMermaidASCII(text, options?)`)

### Existing (reused)
- `src/pipeline/rehype-ir.ts` — compile interception points
- `src/renderer/opentui/code-block.tsx` — box styling pattern for mermaid

## Sources

- **Origin brainstorm:** [docs/brainstorms/2026-03-07-next-features-roadmap-brainstorm.md](docs/brainstorms/2026-03-07-next-features-roadmap-brainstorm.md) — section 5, Math/Mermaid key decisions
- **Superseded plan:** [docs/plans/2026-03-07-feat-math-mermaid-plan.md](docs/plans/2026-03-07-feat-math-mermaid-plan.md) — original draft with custom translator + mermaid-cli approach
- **remark-math docs (context7):** confirmed hast output format `<code class="language-math math-inline">` / `<pre><code class="language-math math-display">`
- **beautiful-mermaid types:** `AsciiRenderOptions` with `colorMode`, `AsciiTheme` with `fg/border/line/arrow`
- **unicodeit types:** `export function replace(f: string): string` at `ts_dist/js/index.d.ts`
- **OpenTUI skill review:** `title` is a direct prop, `titleColor` doesn't exist, `borderColor` colors both border and title
- **TypeScript review:** `CustomNodeDataMap` conditional type pattern, split `mathInline`/`mathDisplay` types
- Pipeline integration: `src/pipeline/processor.ts:17-27`, `src/pipeline/rehype-ir.ts:252-267,465-477`
- IR types: `src/ir/types.ts:185-190,228-248`
- Renderer dispatch: `src/renderer/opentui/index.tsx:49-50`
- Code block pattern: `src/renderer/opentui/code-block.tsx`
- Theme pattern: `src/theme/types.ts:91-107`, `src/theme/dark.ts`, `src/theme/light.ts`
