# Brainstorm: Renderer Abstraction (IR Layer)

**Date:** 2026-03-05
**Status:** Complete
**Context:** Phase 2a is functionally complete. `rehype-terminal.tsx` currently produces OpenTUI JSX directly — components and inline handlers are coupled to OpenTUI intrinsics. We want renderers (OpenTUI, Ink, Rezi TUI) to be swappable.

## What We're Building

An intermediate representation (IR) layer that sits between the hast compiler and framework-specific renderers. The pipeline becomes:

```
markdown → unified (remark/rehype) → hast → [compiler] → IR nodes → [renderer] → framework JSX
```

The compiler (`rehype-ir`) transforms hast into renderer-agnostic IR nodes with pre-resolved styles. Each renderer (`renderer/opentui/`, future `renderer/ink/`) consumes IR nodes and produces framework-specific JSX.

## Why This Approach

Current coupling points in `rehype-terminal.tsx`:
- Block elements produce `<box>`, `<text>`, `<scrollbox>` (OpenTUI intrinsics)
- Inline handlers produce `<span>`, `<strong>`, `<em>`, `<u>`, `<a>`, `<br>`
- Components (Heading, Paragraph, etc.) return OpenTUI JSX directly
- `createChildrenWrapped` groups inlines into `<text>` wrappers (OpenTUI-specific)

Swapping renderer today = rewriting `rehype-terminal` + all 6 component files. With the IR, swapping = writing a new renderer directory.

## Key Decisions

### 1. Pre-resolved styles (not semantic-only)
IR nodes carry fully resolved style data (colors, bold flags, etc.) from the theme. Renderers don't need theme access — they just map styles to their primitives.

**Rationale:** Theme is an upstream concern. Once resolved, renderers stay thin and style-agnostic. All liham renderers target terminal TUIs with color support, so renderer-specific theming is unnecessary.

```typescript
// heading IR node — style already resolved from theme
{ type: 'heading', level: 1, style: { fg: '#ff9e64', bold: true }, children: [...] }

// renderer just maps
<text style={{ fg: node.style.fg, attributes: bold }}>{children}</text>
```

### 2. Semantic inline nodes for markdown, styled text for syntax highlighting
Markdown constructs (strong, emphasis, link, inlineCode, etc.) are distinct IR node types — they carry behavioral meaning across renderers. Syntax highlighting spans are just styled text nodes with no semantic identity.

```typescript
// markdown: semantic nodes
{ type: 'strong', style: { bold: true }, children: [{ type: 'text', value: 'bold' }] }
{ type: 'link', url: 'https://...', style: { fg: '#2ac3de', underline: true }, children: [...] }

// syntax highlighting: styled text
{ type: 'text', value: 'const', style: { fg: '#bb9af7' } }
```

### 3. Inline `<text>` wrapping in renderer, not IR
The IR stays flat — blocks contain a mix of inline nodes and nested blocks. Each renderer handles grouping inlines into text containers as needed (OpenTUI needs `<text>` wrappers, other frameworks may not).

```typescript
// IR: heading contains inline children directly
{ type: 'heading', level: 1, style: {...},
  children: [
    { type: 'strong', style: {...}, children: [{ type: 'text', value: 'Bold' }] },
    { type: 'text', value: ' and normal' }
  ] }

// OpenTUI renderer wraps in <text>
<box><text><strong>Bold</strong> and normal</text></box>
```

### 4. Renderer as a directory under `renderer/`
Existing components (Heading.tsx, CodeBlock.tsx, etc.) move into `renderer/opentui/` and are refactored to accept IR nodes instead of hast `Element`. The renderer IS the component layer.

```
src/
  pipeline/
    rehype-ir.ts              # compiler: hast → IR nodes
  ir/
    types.ts                  # IR node type definitions
  renderer/
    opentui/                  # OpenTUI renderer: IR → OpenTUI JSX
      index.tsx
      heading.tsx
      code-block.tsx
      ...
    # future: ink/, rezi/
```

### 5. Custom node handlers for extensibility
The compiler accepts an optional `customHandlers` map keyed by tagName. Each handler receives the hast `Element`, theme, and a `compileChildren` helper, and returns an IR node or `undefined` (fall through to default). This lets devs handle custom remark plugin output without forking the compiler.

```typescript
rehypeIR({
  theme,
  customHandlers: {
    'div': (node, theme, compileChildren) => {
      if (node.properties?.className?.includes('callout'))
        return { type: 'callout', style: {...}, children: compileChildren(node) }
      return undefined // fall through
    }
  }
})
```

### 6. CustomNode<T> generic in the union for extensibility DX
The base `IRNode` union includes a `CustomNode<T>` type so custom handlers return properly typed nodes. Renderers can narrow on `node.type` for known custom types.

```typescript
interface CustomNode<T extends string = string> {
  type: T
  style?: Record<string, unknown>
  children?: IRNode[]
  data?: Record<string, unknown>
}

type IRNode = HeadingNode | ParagraphNode | TextNode | ... | CustomNode<string>
```

### 7. Syntax highlight color resolution in compiler
HLJS class → color mapping happens during hast → IR compilation. IR text nodes for code blocks already carry their resolved `fg` color. Consistent with the pre-resolved styles decision.

## IR Node Types (Discriminated Union)

Only nodes for currently implemented components are included. New node types (thematicBreak, table, etc.) are added when those components are built.

### Block Nodes

| Type | Data Fields | Style Fields |
|------|-------------|-------------|
| `root` | children | — |
| `heading` | level (1-6), children | fg, bold, dim |
| `paragraph` | children | fg |
| `codeBlock` | code (string), language? | fg, bg, borderColor, gutterColor |
| `blockquote` | children | borderColor, bg, fg |
| `list` | ordered, start?, children | — |
| `listItem` | bullet (string), children | bulletColor, fg |
| `unknown` | tagName, children | fg |

### Inline Nodes

| Type | Data Fields | Style Fields |
|------|-------------|-------------|
| `text` | value | fg?, bg?, bold?, italic?, dim?, underline?, strikethrough? |
| `strong` | children | bold |
| `emphasis` | children | italic |
| `strikethrough` | children | strikethrough |
| `inlineCode` | value | fg, bg |
| `link` | url, children | fg, underline |
| `image` | alt | fg |
| `break` | — | — |
| `checkbox` | checked | — |

## Resolved Questions

- **Theme location?** → Compiler resolves theme. Renderers receive pre-styled IR.
- **Inline depth?** → Semantic nodes for markdown constructs, styled text for presentation-only (hljs).
- **Text wrapping?** → Renderer concern, not IR.
- **Component fate?** → Move into `renderer/opentui/`, refactor to accept IR nodes.
- **Syntax colors?** → Resolved in compiler from HLJS_COLORS map.
- **Extensibility?** → Custom handlers map keyed by tagName. Handler returns IR node or undefined (fall through).
- **Custom node typing?** → `CustomNode<T>` generic in the base union. Good DX — type narrowing and autocomplete work.

## Open Questions

None — all key decisions resolved.
