---
title: "feat: Math & Mermaid Rendering"
type: feat
status: draft
date: 2026-03-07
origin: brainstorm decisions (inline in task)
---

# Math & Mermaid Rendering

## Overview

Add LaTeX math rendering and Mermaid diagram rendering to liham's terminal markdown preview. Math uses Unicode symbol mapping for common LaTeX constructs (Greek letters, operators, superscripts/subscripts), falling back to raw LaTeX for unsupported syntax. Mermaid uses the optional `@mermaid-js/mermaid-cli` package to render diagrams as PNG images displayed via the existing halfblock/Kitty image pipeline, falling back to a styled code block with an install hint when the CLI is unavailable.

Both features integrate through the established pipeline: remark plugins produce typed hast nodes, the rehype-ir compiler converts them to `CustomNode<'math'>` / `CustomNode<'mermaid'>` IR nodes, and renderer components handle display.

## Problem Statement

Markdown documents commonly contain LaTeX math (`$x^2$`, `$$\sum_{i=0}^n$$`) and Mermaid diagrams (` ```mermaid ... ``` `). Liham currently renders math dollar signs as literal text (remark-parse doesn't recognize them) and Mermaid blocks as plain code blocks with no visualization. Both are essential content types for technical documentation.

## Proposed Solution

### Architecture

```
pipeline (remark):
  remark-parse → remark-math → remark-gfm → remark-rehype → rehype-highlight → rehype-ir

remark-math output (after remark-rehype):
  inline: <code class="language-math math-inline">x^2</code>
  display: <pre><code class="language-math math-display">\sum_{i=0}^n</code></pre>

rehype-ir interception:
  - code.language-math.math-inline  → CustomNode<'math'> { data: { latex, display: false } }
  - pre > code.language-math.math-display → CustomNode<'math'> { data: { latex, display: true } }
  - pre > code.language-mermaid → CustomNode<'mermaid'> { data: { source, rendered?: ImageResult } }

src/
  math/
    unicode.ts            # LaTeX → Unicode translator (pure, no deps)
    unicode.test.ts       # translation table tests
  mermaid/
    detect.ts             # mmdc binary detection (which/where)
    render.ts             # spawn mmdc, produce PNG buffer
    render.test.ts        # render tests (mocked + integration)
  pipeline/
    processor.ts          # add remark-math to pipeline
    rehype-ir.ts          # register customHandlers for math + mermaid
    compile-math.ts       # math custom handler
    compile-mermaid.ts    # mermaid custom handler
  renderer/opentui/
    math.tsx              # inline + display math components
    mermaid.tsx           # mermaid image or fallback component
    index.tsx             # wire CustomNode<'math'> and CustomNode<'mermaid'> into renderNode
    fallback.tsx          # (no changes — custom nodes already dispatch here)
  ir/types.ts             # add MathNode, MermaidNode interfaces (extend CustomNode)
  theme/types.ts          # add MathTokens, MermaidTokens
  theme/dark.ts           # math + mermaid colors
  theme/light.ts          # math + mermaid colors
```

### Key Architectural Decisions

1. **remark-math for parsing, NOT regex** — remark-math handles all edge cases around dollar sign disambiguation (currency, escaped dollars, nested). It produces proper mdast `math` and `inlineMath` nodes that remark-rehype converts to `<code class="language-math math-inline">` and `<pre><code class="language-math math-display">` hast elements. We intercept these in rehype-ir via the existing `customHandlers` mechanism.

2. **Unicode translation, NOT KaTeX HTML** — KaTeX/MathJax produce HTML DOM trees intended for browsers. Terminal rendering needs character sequences. A purpose-built Unicode translator maps common LaTeX to Unicode symbols (Greek letters, operators, super/subscripts, common math). Unsupported constructs pass through as raw LaTeX — still readable, just not pretty.

3. **CustomNode<'math'> and CustomNode<'mermaid'>** — both use the existing `CustomNode<T>` extension point in the IR type system. This avoids expanding the core `CoreIRNode` union with niche types and follows the established pattern for extension nodes.

4. **Mermaid via CLI spawning, NOT in-process** — mermaid-cli (`mmdc`) uses Puppeteer/Chromium under the hood. Importing mermaid as a library would pull in the entire browser engine as a dependency. Spawning `mmdc` as a subprocess keeps the dependency optional and isolated. The PNG output feeds directly into the existing image decode/halfblock pipeline.

5. **Mermaid is fully optional** — if `mmdc` is not on `$PATH`, mermaid blocks render as styled code blocks with a dim hint: `[install @mermaid-js/mermaid-cli for diagram rendering]`. No runtime error, no broken layout.

6. **Mermaid rendering is async with caching** — diagrams are rendered on first view and cached by content hash. Re-renders on file change only re-render if the mermaid source changed. The existing LRU cache (`src/media/cache.ts`) stores decoded image results.

7. **Math interception via pre/code class detection** — remark-math + remark-rehype produces `<code class="language-math math-inline">` for inline and `<pre><code class="language-math math-display">` for display blocks. The rehype-ir compiler already has `compilePre` and `compileCode` as entry points. We add class-based detection at the top of these functions to intercept math nodes before they reach the normal code block path.

### File Map

New files:
- `src/math/unicode.ts` — LaTeX-to-Unicode translator
- `src/math/unicode.test.ts` — translator tests
- `src/mermaid/detect.ts` — mmdc binary detection
- `src/mermaid/render.ts` — mmdc spawning + PNG output
- `src/mermaid/render.test.ts` — render tests
- `src/pipeline/compile-math.ts` — math custom handler for rehype-ir
- `src/pipeline/compile-mermaid.ts` — mermaid custom handler for rehype-ir
- `src/renderer/opentui/math.tsx` — math renderer components
- `src/renderer/opentui/mermaid.tsx` — mermaid renderer component

Modified files:
- `src/pipeline/processor.ts` — add `remark-math` to unified chain
- `src/pipeline/rehype-ir.ts` — register math/mermaid custom handlers, add class detection in compilePre/compileCode
- `src/ir/types.ts` — add `MathNode`, `MermaidNode` type aliases
- `src/renderer/opentui/index.tsx` — dispatch math/mermaid custom nodes to their renderers
- `src/theme/types.ts` — add `MathTokens`, `MermaidTokens`
- `src/theme/dark.ts` — math/mermaid theme values
- `src/theme/light.ts` — math/mermaid theme values
- `package.json` — add `remark-math` dependency

---

## Phase 1: Math — Unicode Translation Engine

Pure utility module with zero framework dependencies. Maps common LaTeX constructs to Unicode equivalents.

### 1a: Unicode translation table

- [ ] create `src/math/unicode.ts`
- [ ] implement `translateLatex(latex: string): string` — main entry point
- [ ] Greek letter map: `\alpha` → `α`, `\beta` → `β`, `\gamma` → `γ`, `\delta` → `δ`, `\epsilon` → `ε`, `\zeta` → `ζ`, `\eta` → `η`, `\theta` → `θ`, `\lambda` → `λ`, `\mu` → `μ`, `\pi` → `π`, `\sigma` → `σ`, `\tau` → `τ`, `\phi` → `φ`, `\omega` → `ω`, and uppercase variants (`\Gamma` → `Γ`, `\Delta` → `Δ`, `\Sigma` → `Σ`, `\Omega` → `Ω`, etc.)
- [ ] operator map: `\sum` → `∑`, `\prod` → `∏`, `\int` → `∫`, `\partial` → `∂`, `\infty` → `∞`, `\nabla` → `∇`, `\forall` → `∀`, `\exists` → `∃`, `\in` → `∈`, `\notin` → `∉`, `\subset` → `⊂`, `\supset` → `⊃`, `\cup` → `∪`, `\cap` → `∩`, `\emptyset` → `∅`, `\pm` → `±`, `\times` → `×`, `\div` → `÷`, `\neq` → `≠`, `\leq` → `≤`, `\geq` → `≥`, `\approx` → `≈`, `\equiv` → `≡`, `\sim` → `∼`, `\propto` → `∝`
- [ ] arrow map: `\to` / `\rightarrow` → `→`, `\leftarrow` → `←`, `\Rightarrow` → `⇒`, `\Leftarrow` → `⇐`, `\leftrightarrow` → `↔`, `\Leftrightarrow` → `⇔`, `\mapsto` → `↦`, `\uparrow` → `↑`, `\downarrow` → `↓`
- [ ] misc symbols: `\cdot` → `·`, `\ldots` → `…`, `\cdots` → `⋯`, `\vdots` → `⋮`, `\ddots` → `⋱`, `\star` → `⋆`, `\circ` → `∘`, `\bullet` → `∙`, `\sqrt{}` → `√`, `\angle` → `∠`, `\perp` → `⊥`, `\parallel` → `∥`, `\neg` → `¬`, `\wedge` / `\land` → `∧`, `\vee` / `\lor` → `∨`

### 1b: Superscript and subscript translation

- [ ] superscript digits: `^0` → `⁰`, `^1` → `¹`, `^2` → `²`, ... `^9` → `⁹`
- [ ] superscript letters: `^n` → `ⁿ`, `^i` → `ⁱ` (limited Unicode coverage — only map what Unicode provides)
- [ ] superscript operators: `^+` → `⁺`, `^-` → `⁻`, `^=` → `⁼`, `^(` → `⁽`, `^)` → `⁾`
- [ ] subscript digits: `_0` → `₀`, `_1` → `₁`, ... `_9` → `₉`
- [ ] subscript letters: `_a` → `ₐ`, `_e` → `ₑ`, `_i` → `ᵢ`, `_o` → `ₒ`, `_n` → `ₙ`, etc. (only available Unicode subscript letters)
- [ ] subscript operators: `_+` → `₊`, `_-` → `₋`, `_=` → `₌`, `_(` → `₍`, `_)` → `₎`
- [ ] brace groups: `^{2n}` → `²ⁿ`, `_{ij}` → `ᵢⱼ` — parse `{}` delimiters, translate each char inside
- [ ] unsupported super/subscripts: pass through as-is (e.g., `^{abc}` where `b`,`c` have no Unicode superscript)

### 1c: Fraction and special construct handling

- [ ] simple fractions: `\frac{a}{b}` → `a/b` (strip `\frac{}{}`, insert `/`)
- [ ] common fractions: `\frac{1}{2}` → `½`, `\frac{1}{3}` → `⅓`, `\frac{1}{4}` → `¼`, `\frac{3}{4}` → `¾` (Unicode vulgar fractions where available)
- [ ] `\sqrt{x}` → `√x`, `\sqrt[3]{x}` → `∛x`, `\sqrt[4]{x}` → `∜x`
- [ ] braces/delimiters: `\left(`, `\right)` → strip `\left`/`\right` prefix, keep delimiter
- [ ] `\text{...}` → strip wrapper, keep content as-is
- [ ] `\mathbb{R}` → `ℝ`, `\mathbb{N}` → `ℕ`, `\mathbb{Z}` → `ℤ`, `\mathbb{Q}` → `ℚ`, `\mathbb{C}` → `ℂ`
- [ ] `\hat{x}` → `x̂`, `\bar{x}` → `x̄`, `\tilde{x}` → `x̃`, `\dot{x}` → `ẋ`, `\vec{x}` → `x⃗` (combining diacritical marks)
- [ ] unsupported constructs: pass through the raw LaTeX (e.g., `\begin{matrix}...\end{matrix}` stays as-is)

### 1d: Translation pipeline

- [ ] step 1: strip `\displaystyle`, `\textstyle`, other mode commands
- [ ] step 2: replace named commands (`\alpha`, `\sum`, etc.) with Unicode via lookup table
- [ ] step 3: process `\frac{}{}`, `\sqrt{}`, `\mathbb{}`, `\hat{}`, `\text{}` structural commands
- [ ] step 4: process `^{}` and `_{}` super/subscript groups
- [ ] step 5: strip remaining `\left`/`\right`/`\bigg`/`\Big` sizing commands, keep delimiters
- [ ] step 6: collapse remaining `{}`  braces that are just grouping (not part of commands)
- [ ] step 7: trim whitespace, collapse multiple spaces

### Tests (Phase 1)

- [ ] `src/math/unicode.test.ts`
- [ ] Greek letters: all lowercase + uppercase map correctly
- [ ] operators: each operator maps correctly
- [ ] arrows: each arrow maps correctly
- [ ] superscript digits: `x^2` → `x²`, `x^{10}` → `x¹⁰`
- [ ] subscript digits: `x_0` → `x₀`, `a_{ij}` → `aᵢⱼ`
- [ ] mixed super/sub: `x_i^2` → `xᵢ²`
- [ ] fractions: `\frac{1}{2}` → `½`, `\frac{a}{b}` → `a/b`
- [ ] sqrt: `\sqrt{x}` → `√x`, `\sqrt[3]{8}` → `∛8`
- [ ] blackboard bold: `\mathbb{R}` → `ℝ`
- [ ] combining marks: `\hat{x}` → `x̂`
- [ ] passthrough: unsupported LaTeX like `\begin{pmatrix}` preserved as-is
- [ ] empty input: `""` → `""`
- [ ] nested constructs: `\sum_{i=0}^{n} x_i^2` → `∑ᵢ₌₀ⁿ xᵢ²`
- [ ] real-world: `E = mc^2` → `E = mc²`, `\int_0^\infty e^{-x} dx` → `∫₀∞ e⁻ˣ dx`

---

## Phase 2: Math — Pipeline Integration

Wire remark-math into the unified pipeline and compile math hast nodes to IR.

### 2a: Add remark-math to pipeline

- [ ] `bun add remark-math` — add as a dependency
- [ ] modify `src/pipeline/processor.ts`: add `.use(remarkMath)` after `remarkParse` and before `remarkGfm`
- [ ] verify remark-math + remark-rehype produces `<code class="language-math math-inline">` and `<pre><code class="language-math math-display">` in hast

### 2b: Math custom handler in rehype-ir

- [ ] create `src/pipeline/compile-math.ts`
- [ ] implement `compileMathInline(node, theme, compileChildren)`: detect `<code>` with class `language-math math-inline`, extract text content, return `CustomNode<'math'>` with `{ latex, display: false }`
- [ ] implement `compileMathDisplay(node, theme, compileChildren)`: detect `<pre>` containing `<code>` with class `language-math math-display`, extract text content, return `CustomNode<'math'>` with `{ latex, display: true }`
- [ ] the interception approach: add class detection at the top of the existing `compileCode` and `compilePre` functions in rehype-ir — if the code element has `language-math` class, delegate to compile-math instead of normal code block compilation. this avoids the customHandlers mechanism (which dispatches by tagName, not class) and keeps detection precise

### 2c: IR type definitions

- [ ] add to `src/ir/types.ts`:
  ```ts
  export interface MathNode {
    type: 'math'
    data: { latex: string; display: boolean }
    style: InlineStyle
  }
  ```
- [ ] add `MathNode` to `isBlockNode` — display math is block-level, inline math is not. use `'data' in node && node.data?.display === true` check
- [ ] do NOT add to `CoreIRNode` union — math stays as `CustomNode<'math'>` in the union. `MathNode` is a type alias for documentation/casting in renderer code

### 2d: Theme tokens

- [ ] add to `src/theme/types.ts`:
  ```ts
  export interface MathTokens {
    textColor: string       // rendered math text color
    bracketColor: string    // delimiters, fractions bars
  }
  ```
- [ ] add `math: MathTokens` to `ThemeTokens`
- [ ] dark theme: `textColor: '#c0caf5'` (matches paragraph), `bracketColor: '#7aa2f7'` (blue accent)
- [ ] light theme: matching light-appropriate values

### Tests (Phase 2)

- [ ] pipeline test: `$x^2$` produces IR with `CustomNode<'math'>` containing `{ latex: 'x^2', display: false }`
- [ ] pipeline test: `$$\sum_{i=0}^n$$` produces IR with `CustomNode<'math'>` containing display: true
- [ ] pipeline test: regular code blocks (`\`\`\`js ... \`\`\``) still produce `CodeBlockNode` (no false positive)
- [ ] pipeline test: inline code (`` `code` ``) still produces `InlineCodeNode` (no false positive)
- [ ] edge case: `$` used as currency in non-math context (remark-math handles this, but verify pipeline doesn't crash)

---

## Phase 3: Math — OpenTUI Renderer

Render math IR nodes as styled terminal text using the Unicode translator.

### 3a: Inline math component

- [ ] create `src/renderer/opentui/math.tsx`
- [ ] `renderInlineMath(node: MathNode, key: string)`: call `translateLatex(node.data.latex)`, render as `<span>` with math theme color
- [ ] style: fg from `theme.math.textColor`, no bg (inline with surrounding text)

### 3b: Display math component

- [ ] `renderDisplayMath(node: MathNode, key: string)`: call `translateLatex(node.data.latex)`, render as centered `<text>` inside a `<box>` with `marginBottom: 1`
- [ ] centering approach: pad left with spaces to center within available width. the `RenderContext.maxWidth` provides the container width. if unavailable, left-align
- [ ] add a dim `$` or `$$` delimiter indicator? decision: no — the Unicode rendering IS the content, delimiters are markdown syntax not shown in preview

### 3c: Wire into renderNode

- [ ] modify `src/renderer/opentui/index.tsx`: in `renderNode`, before the existing `if (!isCoreNode(node)) return renderCustom(node, key)` fallback, add a check for `node.type === 'math'`
- [ ] dispatch to `renderDisplayMath` when `node.data.display === true`, else `renderInlineMath`
- [ ] for inline math appearing at block level (wrapped by renderChildren's inline grouping), the `<text>` wrapper from `renderChildrenInternal.flushInline()` handles it

### Tests (Phase 3)

- [ ] snapshot/visual: inline math `$\alpha + \beta$` renders as `α + β` with correct color
- [ ] snapshot/visual: display math `$$\sum_{i=0}^n x_i$$` renders centered as `∑ᵢ₌₀ⁿ xᵢ`
- [ ] inline math inside paragraph: surrounding text preserved, math inline
- [ ] display math between paragraphs: block-level, margin separation
- [ ] complex formula: `$$E = mc^2$$` → `E = mc²` centered
- [ ] unsupported: `$$\begin{pmatrix} a \\ b \end{pmatrix}$$` shows raw LaTeX

---

## Phase 4: Mermaid — Detection & Rendering Engine

Optional mermaid-cli integration for diagram rendering.

### 4a: mmdc detection

- [ ] create `src/mermaid/detect.ts`
- [ ] `detectMmdc(): Promise<string | null>` — check `$PATH` for `mmdc` binary using `which mmdc` (or `Bun.which('mmdc')`)
- [ ] cache the result for the process lifetime (detect once, use everywhere)
- [ ] return the absolute path to mmdc, or null if not found

### 4b: Mermaid renderer

- [ ] create `src/mermaid/render.ts`
- [ ] `renderMermaid(source: string, mmdcPath: string): Promise<Buffer>` — spawn mmdc as subprocess
- [ ] write mermaid source to a temp file (Bun temp dir), output to a temp PNG file
- [ ] command: `mmdc -i input.mmd -o output.png -t dark -b transparent -w 800 -s 2 -q`
- [ ] theme selection: use `-t dark` or `-t default` based on the active liham theme
- [ ] read the output PNG buffer, clean up temp files
- [ ] timeout: 15 seconds (mermaid rendering can be slow, especially first run when puppeteer launches)
- [ ] error handling: if mmdc fails, return a descriptive error (not a crash)

### 4c: Mermaid result caching

- [ ] cache rendered PNG buffers by content hash of the mermaid source
- [ ] use a separate cache from image cache — mermaid renders are larger and less frequently invalidated
- [ ] simple `Map<string, Buffer>` with a 20MB budget (mermaid diagrams are typically small PNGs)
- [ ] invalidation: clear on file change (mermaid source may have changed)

### Tests (Phase 4)

- [ ] detect.test.ts: mock `which` to test detection with/without mmdc
- [ ] render.test.ts: integration test with real mmdc (skip if not installed: `describe.skipIf`)
- [ ] render.test.ts: mock subprocess for unit tests — verify correct args passed to mmdc
- [ ] render.test.ts: timeout test — verify 15s timeout kills subprocess
- [ ] cache: verify same source returns cached result, different source triggers re-render

---

## Phase 5: Mermaid — Pipeline & Renderer Integration

Wire mermaid detection into the pipeline and render diagrams (or fallback) in OpenTUI.

### 5a: Mermaid custom handler in rehype-ir

- [ ] create `src/pipeline/compile-mermaid.ts`
- [ ] interception point: inside `compilePre` in rehype-ir, after extracting the language, check if `language === 'mermaid'`. if so, delegate to compile-mermaid
- [ ] `compileMermaidBlock(node, theme)`: extract the raw mermaid source text, return `CustomNode<'mermaid'>` with `{ source }` in data
- [ ] the mermaid source is the raw text content of the code block (same extraction as `extractCode`)

### 5b: IR type definitions

- [ ] add to `src/ir/types.ts`:
  ```ts
  export interface MermaidNode {
    type: 'mermaid'
    data: { source: string }
    style: BlockStyle
  }
  ```
- [ ] mermaid nodes are always block-level — add `'mermaid'` to `BLOCK_TYPES` set in `isBlockNode`

### 5c: Theme tokens

- [ ] add to `src/theme/types.ts`:
  ```ts
  export interface MermaidTokens {
    borderColor: string      // box border around rendered diagram
    hintColor: string        // dim "install mermaid-cli" hint text
    labelColor: string       // "mermaid" label color
  }
  ```
- [ ] add `mermaid: MermaidTokens` to `ThemeTokens`
- [ ] dark: `borderColor: '#414868'`, `hintColor: '#565f89'`, `labelColor: '#7aa2f7'`
- [ ] light: matching light values

### 5d: Mermaid renderer component

- [ ] create `src/renderer/opentui/mermaid.tsx`
- [ ] `MermaidBlock` — stateful component (hooks like image.tsx)
- [ ] on mount: check if mmdc is available (cached detection)
- [ ] if mmdc available: render mermaid source → PNG → decode via sharp → halfblock grid → display
- [ ] if mmdc unavailable: render as styled code block with title "mermaid" and a dim hint line below: `[install @mermaid-js/mermaid-cli for diagram rendering]`
- [ ] loading state: show `[rendering mermaid diagram...]` placeholder while mmdc runs
- [ ] error state: show `[mermaid error: <message>]` in dim text, with the source as a code block fallback
- [ ] the rendered image goes through the existing image pipeline: `decoder.ts` decodes the PNG, `halfblock.ts` renders the character grid

### 5e: Wire into renderNode

- [ ] modify `src/renderer/opentui/index.tsx`: add `'mermaid'` case before the `renderCustom` fallback
- [ ] dispatch to `MermaidBlock` component

### Tests (Phase 5)

- [ ] pipeline test: ` ```mermaid\ngraph TD\n  A-->B\n``` ` produces `CustomNode<'mermaid'>` with source
- [ ] pipeline test: ` ```javascript\ncode\n``` ` still produces `CodeBlockNode` (no false positive)
- [ ] renderer test (mmdc unavailable): renders code block with hint
- [ ] renderer test (mmdc available, mocked): shows loading → image transition
- [ ] renderer test (mmdc error): shows error message + source fallback
- [ ] e2e: full pipeline with test fixture containing mermaid blocks

---

## Phase 6: Test Fixtures & Polish

### 6a: Test fixture

- [ ] create `test/fixtures/math-mermaid.md` — comprehensive test document with:
  - inline math: `$x^2$`, `$\alpha + \beta$`, `$E = mc^2$`
  - display math: `$$\sum_{i=0}^n x_i^2$$`, `$$\int_0^\infty e^{-x} dx$$`
  - complex display: `$$\frac{-b \pm \sqrt{b^2 - 4ac}}{2a}$$`
  - unsupported: `$$\begin{pmatrix} a & b \\ c & d \end{pmatrix}$$`
  - mermaid flowchart: ` ```mermaid\ngraph TD\n  A[Start] --> B{Decision}\n  B -->|Yes| C[End]\n``` `
  - mermaid sequence diagram
  - mixed content: math and mermaid in the same document with regular markdown

### 6b: Rezi renderer stubs

- [ ] add math/mermaid text fallback to `src/renderer/rezi/blocks.ts` (if rezi branch is active)
- [ ] math: render translated Unicode text as a RichSpan
- [ ] mermaid: render `[mermaid: <first line>]` placeholder (same pattern as video/audio)

### 6c: Edge cases

- [ ] dollar sign in non-math context: `the price is $5` — remark-math with `singleDollarTextMath: true` may falsely match this. decision: keep `singleDollarTextMath: true` (default) for now — it's the remark-math default and matches most users' expectations. if users report false positives, add a `--no-math` CLI flag in a future phase
- [ ] empty math: `$$$$` — produce empty CustomNode, renderer shows nothing
- [ ] mermaid with syntax errors: mmdc returns non-zero exit, show error + source
- [ ] very long mermaid source: truncate at 10,000 characters before sending to mmdc (DoS prevention)
- [ ] concurrent mermaid renders: limit to 1 concurrent mmdc process (semaphore from `src/media/semaphore.ts`)

---

## Acceptance Criteria

### Math
- [ ] `$x^2$` renders inline as `x²` with theme-appropriate color
- [ ] `$$\sum_{i=0}^n x_i$$` renders as a centered block: `∑ᵢ₌₀ⁿ xᵢ`
- [ ] Greek letters, operators, arrows render as Unicode symbols
- [ ] Unsupported LaTeX passes through as raw text (no crash, no blank)
- [ ] Regular inline code and code blocks are unaffected
- [ ] Math works in both dark and light themes

### Mermaid
- [ ] Mermaid code blocks render as images when mmdc is installed
- [ ] Mermaid code blocks render as styled code with install hint when mmdc is not installed
- [ ] Rendering errors show error message + source code fallback
- [ ] Mermaid rendering is cached (same source doesn't re-render)
- [ ] Non-mermaid code blocks are unaffected
- [ ] No runtime crash if mmdc is missing

### General
- [ ] All existing tests pass (no regressions)
- [ ] New tests cover math translation, pipeline integration, and renderer output
- [ ] ESLint + Biome pass with no new violations
- [ ] `bun:test` runs clean

---

## Risk Analysis

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|------------|
| remark-math false positives on `$` currency | Medium | Medium | Accept default behavior; add `--no-math` flag if users report issues |
| Unicode super/subscript coverage gaps | Low | High | Expected — unsupported chars pass through as raw LaTeX. Document known gaps |
| mmdc first-run latency (Puppeteer cold start) | Medium | High | Show loading indicator; cache aggressively; consider pre-warming on app start |
| mmdc not installed on most systems | Low | High | Graceful fallback is the primary path; diagram rendering is bonus |
| mermaid source injection via temp files | Low | Low | Temp files in OS temp dir with random names; cleaned up immediately |
| Large mermaid diagrams cause mmdc OOM | Medium | Low | 10,000 char limit + 15s timeout |
| remark-math version conflict with unified 11 | Medium | Low | remark-math 6.x supports unified 11; pin in package.json |

## Dependencies

### New
- `remark-math` (^6.0.0) — required, added to `dependencies`

### Optional (not added to package.json)
- `@mermaid-js/mermaid-cli` — user-installed globally, detected at runtime via `$PATH`

### Existing (reused)
- `sharp` (optional) — decodes mermaid PNG output to RGBA for halfblock rendering
- `src/media/cache.ts` — LRU cache for rendered mermaid images
- `src/media/halfblock.ts` — character grid rendering for mermaid diagrams
- `src/media/decoder.ts` — PNG decode + resize
- `src/media/semaphore.ts` — concurrency limiter for mmdc subprocess
