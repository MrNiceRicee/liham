# Heading 1

A paragraph with **bold**, *italic*, ~~strikethrough~~, and `inline code`.

## Code Block

```typescript
interface Theme {
  heading: { color: string; bold: boolean }
  code: { background: string; border: string }
}

function createTheme(mode: 'dark' | 'light'): Theme {
  return mode === 'dark'
    ? { heading: { color: '#7aa2f7', bold: true }, code: { background: '#1a1b26', border: '#414868' } }
    : { heading: { color: '#0550ae', bold: true }, code: { background: '#f6f8fa', border: '#d0d7de' } }
}
```

## Lists

- Item one
- Item two with **bold**
  - Nested item
  - Another nested
    - Deep nested
- Item three

1. First ordered
2. Second ordered
3. Third ordered

## Blockquote

> This is a blockquote with *emphasis*.
>
> It has multiple paragraphs.

## Table

| Feature | Go/Glamour | TS/OpenTUI |
|---------|-----------|------------|
| Rendering | String-based | Component-based |
| Images | None | Kitty protocol |
| Plugins | Manual | unified.js |
| Scrolling | Viewport | ScrollBox |

## Links and Images

Here is a [link to something](https://example.com) and an image:

![alt text for image](./test-image.png)

---

### Heading 3

#### Heading 4

##### Heading 5

###### Heading 6

Final paragraph with a mix of inline elements: **bold `code`** and *italic [link](https://example.com)*.
