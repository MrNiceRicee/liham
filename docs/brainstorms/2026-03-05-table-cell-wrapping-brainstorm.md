---
title: "Table Cell Text Wrapping via Column Width Distribution"
type: brainstorm
date: 2026-03-05
origin: Phase B table rendering feedback — overflow behavior
---

# Table Cell Text Wrapping via Column Width Distribution

## What We're Building

When a content-fitted table exceeds terminal width, distribute available space across columns proportionally and let OpenTUI's layout engine wrap text within cells. Row height auto-equalizes via flex row.

## Why This Approach

OpenTUI already handles text wrapping when a `<box>` has a fixed `width` and `<text>` overflows. Flex rows already equalize height to the tallest child. We just need to calculate the right column widths — the framework does the rest.

**Two modes:**
- Table fits → content-fitted widths (current behavior, no wrapping)
- Table overflows → proportional distribution within terminal width, text wraps

## Key Decisions

- **Proportional distribution**: columns shrink in proportion to their content width. A column with 80 chars of content gets 4x the space of one with 20 chars. Preserves relative sizing.
- **Minimum column width = header text width**: no column shrinks below its header's text length. Headers never wrap. This is a natural minimum since headers are typically short.
- **Terminal width from `process.stdout.columns`**: standard Node.js API, available in Bun. Fallback to 80 if not available (piped output, non-TTY).
- **Threshold check**: if `sum(contentWidths) + borders + padding ≤ terminalWidth`, use content-fitted widths (no change from current). Only distribute when overflow occurs.
- **Account for scrollbox padding**: the app shell has `padding: 1` on the content box, so available width = `terminalWidth - 2` (left + right padding).

## Algorithm

```
distributeColumnWidths(contentWidths, headerWidths, terminalWidth):
  borders = numColumns + 1          // │ between and at edges
  cellPadding = numColumns * 2      // 1 left + 1 right per cell
  overhead = borders + cellPadding
  availableContent = terminalWidth - overhead - 2  // -2 for scrollbox padding

  totalContent = sum(contentWidths)

  // fits? use content-fitted
  if totalContent ≤ availableContent:
    return contentWidths

  // distribute proportionally, respecting header minimums
  minWidths = headerWidths  // each column at least as wide as its header
  totalMin = sum(minWidths)

  // if even minimums don't fit, just use minimums (table will overflow, scrollbox handles it)
  if totalMin ≥ availableContent:
    return minWidths

  // distributable space beyond minimums
  distributable = availableContent - totalMin
  excessWidths = contentWidths.map((w, i) => max(0, w - minWidths[i]))
  totalExcess = sum(excessWidths)

  // allocate proportionally
  return contentWidths.map((w, i) =>
    minWidths[i] + floor(excessWidths[i] / totalExcess * distributable)
  )
```

## Open Questions

None — proceed to implementation.
