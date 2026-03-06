---
title: "Table Rendering — Character-Aligned Grid"
type: brainstorm
date: 2026-03-05
origin: Phase B table implementation feedback
---

# Table Rendering — Character-Aligned Grid

## What We're Building

A character-precise table renderer that produces properly aligned grids using box-drawing characters. The current flexbox approach fails because each row is an independent flex container — column widths vary between rows and separator lines don't align.

**Target output:**
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

## Why This Approach

**Measure-then-render** — the only reliable way to align columns in a monospace terminal.

1. Walk all cells in the IR, compute the display width of each cell's text content
2. For each column, take the max display width across all rows
3. Render each cell as a `<box>` with explicit character `width`
4. Separator lines use exact column widths for `─` repeats

This is how every terminal table library works (cli-table3, columnify, etc.).

## Key Decisions

- **Content-fitted sizing** — each column is as wide as its widest cell + padding (1 left + 1 right). Table only takes the space it needs.
- **Preserve inline formatting** — bold, code, italic, links rendered inside cells. Cells are `<box width={n}>` containing `<text>` with inline children.
- **Measure at render time, not IR time** — column widths are a renderer concern (plan already specifies this). The IR stores content; the renderer measures and lays out.
- **`measureIRText()` helper** — walks IR node children, sums text/inlineCode `.value.length`, recurses into children of strong/emphasis/link/etc. Returns character count.
- **Box-drawing borders** — `┌┬┐│├┼┤└┴┘─` characters for the grid. Single style matches codeBlock borders.
- **Separator lines rendered as `<text>`** — each segment is a `<text>` with exact character count of `─`, no flexGrow. Guarantees alignment.

## Implementation Shape

```
renderTable(node):
  1. colWidths = measureColumnWidths(node)  // max content width per column
  2. render top border:    ┌─────┬─────┐  (widths from colWidths)
  3. for each row:
     a. render row:        │ cell │ cell │  (each cell box has width = colWidths[i] + 2)
     b. if header row:     ├─────┼─────┤  (header separator)
  4. render bottom border: └─────┴─────┘

measureColumnWidths(table):
  for each row → for each cell:
    width = measureIRText(cell.children)
    colWidths[colIndex] = max(colWidths[colIndex], width)
  return colWidths

measureIRText(nodes):
  sum of:
    text → value.length
    inlineCode → value.length
    strong/emphasis/link/strikethrough → measureIRText(children)
    image → "[image: {alt}]".length
    checkbox → 4  ("[x] " or "[ ] ")
    break → 1
```

## Open Questions

None — approach is straightforward. Proceed to implementation.
