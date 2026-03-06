---
title: "fix: Character-aligned table grid rendering"
type: fix
status: completed
date: 2026-03-05
origin: docs/brainstorms/2026-03-05-table-rendering-character-aligned-brainstorm.md
---

# fix: Character-aligned table grid rendering

## Overview

Replace the flexbox-based table renderer with a measure-then-render approach that produces character-precise column alignment using box-drawing characters. The current implementation fails because each row is an independent flex container — column widths vary between rows and separator lines don't align with column boundaries.

(see brainstorm: `docs/brainstorms/2026-03-05-table-rendering-character-aligned-brainstorm.md`)

## Problem Statement

The table renderer uses `flexGrow: 1` on cells and `fill.repeat(80)` on separators. This produces:
- Misaligned column separators between rows
- Columns that shift based on terminal width
- Too many visible `│` characters at wrong positions

The root cause: **flexbox can't produce character-aligned grids** because column widths are computed independently per row.

## Proposed Solution

**Measure-then-render algorithm:**

1. Walk all cells, extract plain text width → find max width per column
2. Set explicit character `width` on each cell `<box>` — no flexGrow
3. Separator lines repeat `─` exactly `colWidth` times per column

### New utility: `measureIRText()`

Location: `src/renderer/opentui/table.tsx` (local to table renderer — only consumer)

```typescript
function measureIRText(nodes: IRNode[]): number {
  let width = 0
  for (const node of nodes) {
    const core = node as CoreIRNode
    switch (core.type) {
      case 'text':
      case 'inlineCode':
        width += core.value.length
        break
      case 'strong':
      case 'emphasis':
      case 'link':
      case 'strikethrough':
        width += measureIRText(core.children)
        break
      case 'image':
        width += `[image: ${core.alt}]`.length
        break
      case 'checkbox':
        width += 4 // "[x] " or "[ ] "
        break
      case 'break':
        width += 1
        break
    }
  }
  return width
}
```

Why `.length` is correct: monospace terminals render 1 character = 1 column for ASCII/Latin text. Inline formatting (bold, italic) uses zero-width ANSI escapes — `**bold**` in IR is just `TextNode("bold")` with 4 chars. No special handling needed.

Future: swap `.length` for `string-width` if CJK/emoji support is needed.

### Column width calculation

```typescript
function measureColumnWidths(node: TableNode): number[] {
  const colWidths: number[] = []
  for (const row of node.children) {
    if (row.type !== 'tableRow') continue
    const cells = row.children.filter(c => c.type === 'tableCell')
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i]!
      if (cell.type !== 'tableCell') continue
      const w = measureIRText(cell.children)
      colWidths[i] = Math.max(colWidths[i] ?? 0, w)
    }
  }
  return colWidths
}
```

### Render with explicit widths

Each cell `<box>` gets `width: colWidths[i] + 2` (1 padding left + 1 padding right).

Separator segments: `'─'.repeat(colWidths[i] + 2)` — exact character count.

Row: `│` + cell + `│` + cell + `│` — separators are single `<text>` elements.

Expected output:
```
┌──────────────┬──────────┐
│ Feature      │ Status   │
├──────────────┼──────────┤
│ Headings     │ Done     │
│ Paragraphs   │ Done     │
│ Code Blocks  │ Done     │
│ Lists        │ Done     │
└──────────────┴──────────┘
```

## Technical Considerations

- **Padding**: 1 char left + 1 char right per cell. Cell box `width = contentWidth + 2`.
- **Alignment**: `TableNode.alignments` is compiled but currently unused. Left-align all content for now (pad right). Center/right alignment = future enhancement.
- **Empty cells**: measure as 0 width, but column still gets width from other rows.
- **Inline formatting preserved**: cells still use `renderInlineChildren()` inside `<text>`. The measurement only reads `.value.length` from text nodes — formatting wrappers add zero display width.
- **No terminal width dependency**: content-fitted tables don't need to know terminal width. If a table is wider than the terminal, the scrollbox handles horizontal overflow.

## Acceptance Criteria

- [x] Columns align perfectly across all rows at any terminal width
- [x] Box-drawing borders form a clean grid: `┌┬┐│├┼┤└┴┘─`
- [x] Header row separated by `├─┼─┤` junction line
- [x] Header cells render bold with `headerColor`
- [x] Inline formatting (bold, code, italic) works inside cells
- [x] Empty cells render correctly without breaking alignment
- [x] Column widths fit content (no wasted space)
- [x] Existing table tests pass (update assertions as needed)

## Files Changed

- `src/renderer/opentui/table.tsx` — rewrite: add `measureIRText()`, `measureColumnWidths()`, update render functions to use explicit widths
- `src/renderer/opentui/index.tsx` — update `renderTableRow`/`renderTableCell` call signatures if changed
- `src/pipeline/processor.test.ts` — update integration test assertions for new output structure
- `src/pipeline/rehype-ir.test.ts` — no changes (IR tests are renderer-independent)

## Sources & References

- **Origin brainstorm:** [docs/brainstorms/2026-03-05-table-rendering-character-aligned-brainstorm.md](docs/brainstorms/2026-03-05-table-rendering-character-aligned-brainstorm.md) — measure-then-render approach, content-fitted sizing, preserve inline formatting
- Current table renderer: `src/renderer/opentui/table.tsx`
- IR types: `src/ir/types.ts:73-93` (TableNode, TableRowNode, TableCellNode)
