# Liham v2 Benchmark Document

This document is a stress test for the rendering pipeline. It exercises every GFM element type at scale to validate performance under realistic conditions.

## Section 1: Feature Overview

Paragraph with **bold text**, *italic text*, ~~strikethrough~~, and `inline code` spanning multiple formatting styles. This tests how the pipeline handles inline element composition across many repeated blocks.

### Subsection 1.1: Code Examples

```typescript
// section 1 — pipeline processor
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)

export async function render(markdown: string) {
  const file = await processor.process(markdown)
  return file.result
}
```

### Subsection 1.2: Data Table

| Column A | Column B | Column C | Column D |
|----------|----------|----------|----------|
| Row 1-1 | Data | `code` | **bold** |
| Row 1-2 | More data | `value` | *italic* |
| Row 1-3 | Even more | `test` | ~~strike~~ |

### Subsection 1.3: Mixed Content

> Blockquote in section 1 with **bold** and a [link](https://example.com/1).
>
> Second paragraph in the blockquote.

- List item one in section 1
- List item two with `code` and **bold**
  - Nested item with *italic*
  - Another nested item
- List item three

1. Ordered item one
2. Ordered item two
3. Ordered item three

---

## Section 2: Feature Overview

Paragraph with **bold text**, *italic text*, ~~strikethrough~~, and `inline code` spanning multiple formatting styles. This tests how the pipeline handles inline element composition across many repeated blocks.

### Subsection 2.1: Code Examples

```typescript
// section 2 — pipeline processor
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)

export async function render(markdown: string) {
  const file = await processor.process(markdown)
  return file.result
}
```

### Subsection 2.2: Data Table

| Column A | Column B | Column C | Column D |
|----------|----------|----------|----------|
| Row 2-1 | Data | `code` | **bold** |
| Row 2-2 | More data | `value` | *italic* |
| Row 2-3 | Even more | `test` | ~~strike~~ |

### Subsection 2.3: Mixed Content

> Blockquote in section 2 with **bold** and a [link](https://example.com/2).
>
> Second paragraph in the blockquote.

- List item one in section 2
- List item two with `code` and **bold**
  - Nested item with *italic*
  - Another nested item
- List item three

1. Ordered item one
2. Ordered item two
3. Ordered item three

---

## Section 3: Feature Overview

Paragraph with **bold text**, *italic text*, ~~strikethrough~~, and `inline code` spanning multiple formatting styles. This tests how the pipeline handles inline element composition across many repeated blocks.

### Subsection 3.1: Code Examples

```typescript
// section 3 — pipeline processor
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)

export async function render(markdown: string) {
  const file = await processor.process(markdown)
  return file.result
}
```

### Subsection 3.2: Data Table

| Column A | Column B | Column C | Column D |
|----------|----------|----------|----------|
| Row 3-1 | Data | `code` | **bold** |
| Row 3-2 | More data | `value` | *italic* |
| Row 3-3 | Even more | `test` | ~~strike~~ |

### Subsection 3.3: Mixed Content

> Blockquote in section 3 with **bold** and a [link](https://example.com/3).
>
> Second paragraph in the blockquote.

- List item one in section 3
- List item two with `code` and **bold**
  - Nested item with *italic*
  - Another nested item
- List item three

1. Ordered item one
2. Ordered item two
3. Ordered item three

---

## Section 4: Feature Overview

Paragraph with **bold text**, *italic text*, ~~strikethrough~~, and `inline code` spanning multiple formatting styles. This tests how the pipeline handles inline element composition across many repeated blocks.

### Subsection 4.1: Code Examples

```typescript
// section 4 — pipeline processor
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)

export async function render(markdown: string) {
  const file = await processor.process(markdown)
  return file.result
}
```

### Subsection 4.2: Data Table

| Column A | Column B | Column C | Column D |
|----------|----------|----------|----------|
| Row 4-1 | Data | `code` | **bold** |
| Row 4-2 | More data | `value` | *italic* |
| Row 4-3 | Even more | `test` | ~~strike~~ |

### Subsection 4.3: Mixed Content

> Blockquote in section 4 with **bold** and a [link](https://example.com/4).
>
> Second paragraph in the blockquote.

- List item one in section 4
- List item two with `code` and **bold**
  - Nested item with *italic*
  - Another nested item
- List item three

1. Ordered item one
2. Ordered item two
3. Ordered item three

---

## Section 5: Feature Overview

Paragraph with **bold text**, *italic text*, ~~strikethrough~~, and `inline code` spanning multiple formatting styles. This tests how the pipeline handles inline element composition across many repeated blocks.

### Subsection 5.1: Code Examples

```typescript
// section 5 — pipeline processor
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)

export async function render(markdown: string) {
  const file = await processor.process(markdown)
  return file.result
}
```

### Subsection 5.2: Data Table

| Column A | Column B | Column C | Column D |
|----------|----------|----------|----------|
| Row 5-1 | Data | `code` | **bold** |
| Row 5-2 | More data | `value` | *italic* |
| Row 5-3 | Even more | `test` | ~~strike~~ |

### Subsection 5.3: Mixed Content

> Blockquote in section 5 with **bold** and a [link](https://example.com/5).
>
> Second paragraph in the blockquote.

- List item one in section 5
- List item two with `code` and **bold**
  - Nested item with *italic*
  - Another nested item
- List item three

1. Ordered item one
2. Ordered item two
3. Ordered item three

---

## Section 6: Feature Overview

Paragraph with **bold text**, *italic text*, ~~strikethrough~~, and `inline code` spanning multiple formatting styles. This tests how the pipeline handles inline element composition across many repeated blocks.

### Subsection 6.1: Code Examples

```typescript
// section 6 — pipeline processor
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)

export async function render(markdown: string) {
  const file = await processor.process(markdown)
  return file.result
}
```

### Subsection 6.2: Data Table

| Column A | Column B | Column C | Column D |
|----------|----------|----------|----------|
| Row 6-1 | Data | `code` | **bold** |
| Row 6-2 | More data | `value` | *italic* |
| Row 6-3 | Even more | `test` | ~~strike~~ |

### Subsection 6.3: Mixed Content

> Blockquote in section 6 with **bold** and a [link](https://example.com/6).
>
> Second paragraph in the blockquote.

- List item one in section 6
- List item two with `code` and **bold**
  - Nested item with *italic*
  - Another nested item
- List item three

1. Ordered item one
2. Ordered item two
3. Ordered item three

---

## Section 7: Feature Overview

Paragraph with **bold text**, *italic text*, ~~strikethrough~~, and `inline code` spanning multiple formatting styles. This tests how the pipeline handles inline element composition across many repeated blocks.

### Subsection 7.1: Code Examples

```typescript
// section 7 — pipeline processor
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)

export async function render(markdown: string) {
  const file = await processor.process(markdown)
  return file.result
}
```

### Subsection 7.2: Data Table

| Column A | Column B | Column C | Column D |
|----------|----------|----------|----------|
| Row 7-1 | Data | `code` | **bold** |
| Row 7-2 | More data | `value` | *italic* |
| Row 7-3 | Even more | `test` | ~~strike~~ |

### Subsection 7.3: Mixed Content

> Blockquote in section 7 with **bold** and a [link](https://example.com/7).
>
> Second paragraph in the blockquote.

- List item one in section 7
- List item two with `code` and **bold**
  - Nested item with *italic*
  - Another nested item
- List item three

1. Ordered item one
2. Ordered item two
3. Ordered item three

---

## Section 8: Feature Overview

Paragraph with **bold text**, *italic text*, ~~strikethrough~~, and `inline code` spanning multiple formatting styles. This tests how the pipeline handles inline element composition across many repeated blocks.

### Subsection 8.1: Code Examples

```typescript
// section 8 — pipeline processor
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)

export async function render(markdown: string) {
  const file = await processor.process(markdown)
  return file.result
}
```

### Subsection 8.2: Data Table

| Column A | Column B | Column C | Column D |
|----------|----------|----------|----------|
| Row 8-1 | Data | `code` | **bold** |
| Row 8-2 | More data | `value` | *italic* |
| Row 8-3 | Even more | `test` | ~~strike~~ |

### Subsection 8.3: Mixed Content

> Blockquote in section 8 with **bold** and a [link](https://example.com/8).
>
> Second paragraph in the blockquote.

- List item one in section 8
- List item two with `code` and **bold**
  - Nested item with *italic*
  - Another nested item
- List item three

1. Ordered item one
2. Ordered item two
3. Ordered item three

---

## Section 9: Feature Overview

Paragraph with **bold text**, *italic text*, ~~strikethrough~~, and `inline code` spanning multiple formatting styles. This tests how the pipeline handles inline element composition across many repeated blocks.

### Subsection 9.1: Code Examples

```typescript
// section 9 — pipeline processor
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)

export async function render(markdown: string) {
  const file = await processor.process(markdown)
  return file.result
}
```

### Subsection 9.2: Data Table

| Column A | Column B | Column C | Column D |
|----------|----------|----------|----------|
| Row 9-1 | Data | `code` | **bold** |
| Row 9-2 | More data | `value` | *italic* |
| Row 9-3 | Even more | `test` | ~~strike~~ |

### Subsection 9.3: Mixed Content

> Blockquote in section 9 with **bold** and a [link](https://example.com/9).
>
> Second paragraph in the blockquote.

- List item one in section 9
- List item two with `code` and **bold**
  - Nested item with *italic*
  - Another nested item
- List item three

1. Ordered item one
2. Ordered item two
3. Ordered item three

---

## Section 10: Feature Overview

Paragraph with **bold text**, *italic text*, ~~strikethrough~~, and `inline code` spanning multiple formatting styles. This tests how the pipeline handles inline element composition across many repeated blocks.

### Subsection 10.1: Code Examples

```typescript
// section 10 — pipeline processor
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)

export async function render(markdown: string) {
  const file = await processor.process(markdown)
  return file.result
}
```

### Subsection 10.2: Data Table

| Column A | Column B | Column C | Column D |
|----------|----------|----------|----------|
| Row 10-1 | Data | `code` | **bold** |
| Row 10-2 | More data | `value` | *italic* |
| Row 10-3 | Even more | `test` | ~~strike~~ |

### Subsection 10.3: Mixed Content

> Blockquote in section 10 with **bold** and a [link](https://example.com/10).
>
> Second paragraph in the blockquote.

- List item one in section 10
- List item two with `code` and **bold**
  - Nested item with *italic*
  - Another nested item
- List item three

1. Ordered item one
2. Ordered item two
3. Ordered item three

---

## Section 11: Feature Overview

Paragraph with **bold text**, *italic text*, ~~strikethrough~~, and `inline code` spanning multiple formatting styles. This tests how the pipeline handles inline element composition across many repeated blocks.

### Subsection 11.1: Code Examples

```typescript
// section 11 — pipeline processor
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)

export async function render(markdown: string) {
  const file = await processor.process(markdown)
  return file.result
}
```

### Subsection 11.2: Data Table

| Column A | Column B | Column C | Column D |
|----------|----------|----------|----------|
| Row 11-1 | Data | `code` | **bold** |
| Row 11-2 | More data | `value` | *italic* |
| Row 11-3 | Even more | `test` | ~~strike~~ |

### Subsection 11.3: Mixed Content

> Blockquote in section 11 with **bold** and a [link](https://example.com/11).
>
> Second paragraph in the blockquote.

- List item one in section 11
- List item two with `code` and **bold**
  - Nested item with *italic*
  - Another nested item
- List item three

1. Ordered item one
2. Ordered item two
3. Ordered item three

---

## Section 12: Feature Overview

Paragraph with **bold text**, *italic text*, ~~strikethrough~~, and `inline code` spanning multiple formatting styles. This tests how the pipeline handles inline element composition across many repeated blocks.

### Subsection 12.1: Code Examples

```typescript
// section 12 — pipeline processor
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)

export async function render(markdown: string) {
  const file = await processor.process(markdown)
  return file.result
}
```

### Subsection 12.2: Data Table

| Column A | Column B | Column C | Column D |
|----------|----------|----------|----------|
| Row 12-1 | Data | `code` | **bold** |
| Row 12-2 | More data | `value` | *italic* |
| Row 12-3 | Even more | `test` | ~~strike~~ |

### Subsection 12.3: Mixed Content

> Blockquote in section 12 with **bold** and a [link](https://example.com/12).
>
> Second paragraph in the blockquote.

- List item one in section 12
- List item two with `code` and **bold**
  - Nested item with *italic*
  - Another nested item
- List item three

1. Ordered item one
2. Ordered item two
3. Ordered item three

---

## Section 13: Feature Overview

Paragraph with **bold text**, *italic text*, ~~strikethrough~~, and `inline code` spanning multiple formatting styles. This tests how the pipeline handles inline element composition across many repeated blocks.

### Subsection 13.1: Code Examples

```typescript
// section 13 — pipeline processor
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)

export async function render(markdown: string) {
  const file = await processor.process(markdown)
  return file.result
}
```

### Subsection 13.2: Data Table

| Column A | Column B | Column C | Column D |
|----------|----------|----------|----------|
| Row 13-1 | Data | `code` | **bold** |
| Row 13-2 | More data | `value` | *italic* |
| Row 13-3 | Even more | `test` | ~~strike~~ |

### Subsection 13.3: Mixed Content

> Blockquote in section 13 with **bold** and a [link](https://example.com/13).
>
> Second paragraph in the blockquote.

- List item one in section 13
- List item two with `code` and **bold**
  - Nested item with *italic*
  - Another nested item
- List item three

1. Ordered item one
2. Ordered item two
3. Ordered item three

---

## Section 14: Feature Overview

Paragraph with **bold text**, *italic text*, ~~strikethrough~~, and `inline code` spanning multiple formatting styles. This tests how the pipeline handles inline element composition across many repeated blocks.

### Subsection 14.1: Code Examples

```typescript
// section 14 — pipeline processor
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)

export async function render(markdown: string) {
  const file = await processor.process(markdown)
  return file.result
}
```

### Subsection 14.2: Data Table

| Column A | Column B | Column C | Column D |
|----------|----------|----------|----------|
| Row 14-1 | Data | `code` | **bold** |
| Row 14-2 | More data | `value` | *italic* |
| Row 14-3 | Even more | `test` | ~~strike~~ |

### Subsection 14.3: Mixed Content

> Blockquote in section 14 with **bold** and a [link](https://example.com/14).
>
> Second paragraph in the blockquote.

- List item one in section 14
- List item two with `code` and **bold**
  - Nested item with *italic*
  - Another nested item
- List item three

1. Ordered item one
2. Ordered item two
3. Ordered item three

---

## Section 15: Feature Overview

Paragraph with **bold text**, *italic text*, ~~strikethrough~~, and `inline code` spanning multiple formatting styles. This tests how the pipeline handles inline element composition across many repeated blocks.

### Subsection 15.1: Code Examples

```typescript
// section 15 — pipeline processor
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)

export async function render(markdown: string) {
  const file = await processor.process(markdown)
  return file.result
}
```

### Subsection 15.2: Data Table

| Column A | Column B | Column C | Column D |
|----------|----------|----------|----------|
| Row 15-1 | Data | `code` | **bold** |
| Row 15-2 | More data | `value` | *italic* |
| Row 15-3 | Even more | `test` | ~~strike~~ |

### Subsection 15.3: Mixed Content

> Blockquote in section 15 with **bold** and a [link](https://example.com/15).
>
> Second paragraph in the blockquote.

- List item one in section 15
- List item two with `code` and **bold**
  - Nested item with *italic*
  - Another nested item
- List item three

1. Ordered item one
2. Ordered item two
3. Ordered item three

---

## Section 16: Feature Overview

Paragraph with **bold text**, *italic text*, ~~strikethrough~~, and `inline code` spanning multiple formatting styles. This tests how the pipeline handles inline element composition across many repeated blocks.

### Subsection 16.1: Code Examples

```typescript
// section 16 — pipeline processor
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)

export async function render(markdown: string) {
  const file = await processor.process(markdown)
  return file.result
}
```

### Subsection 16.2: Data Table

| Column A | Column B | Column C | Column D |
|----------|----------|----------|----------|
| Row 16-1 | Data | `code` | **bold** |
| Row 16-2 | More data | `value` | *italic* |
| Row 16-3 | Even more | `test` | ~~strike~~ |

### Subsection 16.3: Mixed Content

> Blockquote in section 16 with **bold** and a [link](https://example.com/16).
>
> Second paragraph in the blockquote.

- List item one in section 16
- List item two with `code` and **bold**
  - Nested item with *italic*
  - Another nested item
- List item three

1. Ordered item one
2. Ordered item two
3. Ordered item three

---

## Section 17: Feature Overview

Paragraph with **bold text**, *italic text*, ~~strikethrough~~, and `inline code` spanning multiple formatting styles. This tests how the pipeline handles inline element composition across many repeated blocks.

### Subsection 17.1: Code Examples

```typescript
// section 17 — pipeline processor
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)

export async function render(markdown: string) {
  const file = await processor.process(markdown)
  return file.result
}
```

### Subsection 17.2: Data Table

| Column A | Column B | Column C | Column D |
|----------|----------|----------|----------|
| Row 17-1 | Data | `code` | **bold** |
| Row 17-2 | More data | `value` | *italic* |
| Row 17-3 | Even more | `test` | ~~strike~~ |

### Subsection 17.3: Mixed Content

> Blockquote in section 17 with **bold** and a [link](https://example.com/17).
>
> Second paragraph in the blockquote.

- List item one in section 17
- List item two with `code` and **bold**
  - Nested item with *italic*
  - Another nested item
- List item three

1. Ordered item one
2. Ordered item two
3. Ordered item three

---

## Section 18: Feature Overview

Paragraph with **bold text**, *italic text*, ~~strikethrough~~, and `inline code` spanning multiple formatting styles. This tests how the pipeline handles inline element composition across many repeated blocks.

### Subsection 18.1: Code Examples

```typescript
// section 18 — pipeline processor
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)

export async function render(markdown: string) {
  const file = await processor.process(markdown)
  return file.result
}
```

### Subsection 18.2: Data Table

| Column A | Column B | Column C | Column D |
|----------|----------|----------|----------|
| Row 18-1 | Data | `code` | **bold** |
| Row 18-2 | More data | `value` | *italic* |
| Row 18-3 | Even more | `test` | ~~strike~~ |

### Subsection 18.3: Mixed Content

> Blockquote in section 18 with **bold** and a [link](https://example.com/18).
>
> Second paragraph in the blockquote.

- List item one in section 18
- List item two with `code` and **bold**
  - Nested item with *italic*
  - Another nested item
- List item three

1. Ordered item one
2. Ordered item two
3. Ordered item three

---

## Section 19: Feature Overview

Paragraph with **bold text**, *italic text*, ~~strikethrough~~, and `inline code` spanning multiple formatting styles. This tests how the pipeline handles inline element composition across many repeated blocks.

### Subsection 19.1: Code Examples

```typescript
// section 19 — pipeline processor
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)

export async function render(markdown: string) {
  const file = await processor.process(markdown)
  return file.result
}
```

### Subsection 19.2: Data Table

| Column A | Column B | Column C | Column D |
|----------|----------|----------|----------|
| Row 19-1 | Data | `code` | **bold** |
| Row 19-2 | More data | `value` | *italic* |
| Row 19-3 | Even more | `test` | ~~strike~~ |

### Subsection 19.3: Mixed Content

> Blockquote in section 19 with **bold** and a [link](https://example.com/19).
>
> Second paragraph in the blockquote.

- List item one in section 19
- List item two with `code` and **bold**
  - Nested item with *italic*
  - Another nested item
- List item three

1. Ordered item one
2. Ordered item two
3. Ordered item three

---

## Section 20: Feature Overview

Paragraph with **bold text**, *italic text*, ~~strikethrough~~, and `inline code` spanning multiple formatting styles. This tests how the pipeline handles inline element composition across many repeated blocks.

### Subsection 20.1: Code Examples

```typescript
// section 20 — pipeline processor
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)

export async function render(markdown: string) {
  const file = await processor.process(markdown)
  return file.result
}
```

### Subsection 20.2: Data Table

| Column A | Column B | Column C | Column D |
|----------|----------|----------|----------|
| Row 20-1 | Data | `code` | **bold** |
| Row 20-2 | More data | `value` | *italic* |
| Row 20-3 | Even more | `test` | ~~strike~~ |

### Subsection 20.3: Mixed Content

> Blockquote in section 20 with **bold** and a [link](https://example.com/20).
>
> Second paragraph in the blockquote.

- List item one in section 20
- List item two with `code` and **bold**
  - Nested item with *italic*
  - Another nested item
- List item three

1. Ordered item one
2. Ordered item two
3. Ordered item three

---

## Final Section: Edge Cases

### Empty Elements

-
-
-

### Deeply Nested Lists

- Level 1
  - Level 2
    - Level 3
      - Level 4
        - Level 5

### Adjacent Code Blocks

```javascript
const a = 1
```

```python
b = 2
```

```go
c := 3
```

### Long Inline Content

This is a very long paragraph that contains **bold text** mixed with *italic text* and `inline code` and [links](https://example.com) and ~~strikethrough~~ all in one line to test how the renderer handles long inline content that may need to wrap across multiple terminal columns without breaking the formatting or losing any styled spans along the way.

### Special Characters

Ampersand & less-than < greater-than > quotes "double" and 'single' and backslash \ and pipe | and tilde ~ and caret ^ and brackets [square] and {curly} and (parens).

### Unicode

Emoji: 🎉 🚀 ✅ ❌ 🔥 💻
CJK: 你好世界
Arabic: مرحبا
Thai: สวัสดี
Math: ∑ ∏ ∫ ∂ ∇ ∞ √ ≈ ≠ ≤ ≥

### Image References

![Screenshot 1](./screenshots/shot1.png)
![Screenshot 2](./screenshots/shot2.png)
![Screenshot 3](./screenshots/shot3.png)

### Multiple Headings in Sequence

# H1
## H2
### H3
#### H4
##### H5
###### H6

End of benchmark document.
