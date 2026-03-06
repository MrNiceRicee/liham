# Liham v2: TS Rewrite with unified.js Rendering Pipeline

**Date:** 2026-03-04
**Status:** Ready for planning

## What We're Building

Rewrite liham from Go/Bubbletea to TypeScript/OpenTUI, replacing glamour with a unified.js (remark/rehype) rendering pipeline. The core idea: use the same markdown → AST → transform → render pipeline that powers react-markdown, but render to a live terminal component tree instead of HTML.

This is a full vision shift from "glow replacement" to "VSCode Markdown Preview Enhanced as a TUI" — with an extensible plugin architecture, terminal image rendering, and a path toward rich editing.

## Why This Approach

**The plugin pipeline IS the product.** Every rendering capability (headings, code blocks, images, math, mermaid) is just a plugin that slots into the pipeline. Build the pipeline right, and everything else is incremental.

**unified.js gives us the pipeline for free.** Instead of rebuilding remark/rehype in Go (goldmark is capable but has no ecosystem), we use unified.js directly:

```
remark-parse → remark plugins (transform mdast) → remark-rehype → rehype plugins (transform hast) → rehype-terminal (custom)
```

Every existing remark and rehype plugin works unchanged. Only the final step (`rehype-terminal`) is custom — it walks the hast tree and produces a live OpenTUI component tree instead of HTML.

**Rejected alternatives:**
- **Stay with Go + goldmark custom renderer**: Would require building every renderer from scratch, no plugin ecosystem to leverage
- **Go TUI + TS renderer subprocess**: Two languages, IPC complexity, debugging across runtimes
- **Go + external tools only**: Doesn't solve the fundamental architecture gap
- **Ink (React for CLIs)**: No built-in scrolling (issues #222, #432 open for years), community scroll solutions are fragile. Scrolling is core UX for a markdown previewer — can't depend on third-party workarounds

## Key Decisions

1. **TypeScript + OpenTUI** for the TUI framework — native Zig rendering backend with TS bindings, built-in scrolling + mouse support, React-compatible reconciler, sub-millisecond frame times. Chosen over Ink because Ink lacks built-in scrolling (critical for a markdown previewer) and has weaker performance with large content.
2. **unified.js** as the core pipeline — use remark-parse, remark-rehype, and rehype plugins directly
3. **Custom `rehype-terminal` component renderer** as the diversion point — walks hast → OpenTUI React component tree instead of HTML string. Each AST node becomes a live component that owns its own terminal rendering (not an intermediate ANSI string). This enables images, interactive elements, and future editing without post-processing hacks.
4. **Kitty Graphics Protocol** for terminal images (best quality, modern terminal support — Kitty, WezTerm, Ghostty)
5. **Replace in-place** — rewrite in this repo, replace Go with TS. Go code (`cmd/`, `internal/`, `go.mod`, `go.sum`) removed once TS version reaches feature parity.
6. **Plugin-first architecture** — the rendering pipeline is designed before any specific renderer; visual fidelity and rich content are plugins
7. **Core + new capabilities for v1** — file browser, split pane, live reload, scroll sync, plus new rendering (images, better code blocks, callouts). Must replace current daily workflow.
8. **bun** as package manager and runtime — also enables `bun compile` for single-binary distribution
9. **Dual distribution** — npm package + compiled binary via `bun compile`
10. **rehype-terminal internal first** — build inside liham, extract later if demand exists
11. **Strict dev tooling** — ESLint (ts-eslint + sonarjs + perfectionist) + Biome (formatting). Reference configs from home-jarvis. No swallowed catches — empty catch blocks are errors (override home-jarvis's `allowEmptyCatch: true`). Strictness is a feature.

## Architecture Vision

### Pipeline

```
markdown string
  → remark-parse (mdast)
  → remark-gfm, remark-math, remark-frontmatter, etc. (transform mdast)
  → remark-rehype (hast)
  → rehype-highlight, rehype-katex, etc. (transform hast)
  → rehype-terminal (custom: hast → OpenTUI React component tree)
  → OpenTUI renders components directly (display + scroll)
```

**Component-based, not string-based.** Unlike glamour (which produces one big ANSI string), rehype-terminal maps each hast node to a live OpenTUI component. The AST becomes the UI — no intermediate string. This means an `<Image>` component owns its Kitty protocol lifecycle, a `<CodeBlock>` can handle its own highlighting and copy, and future editing is a mode switch on existing components rather than a separate system.

### Component Model

With OpenTUI's React-compatible reconciler, each hast node maps to a component:
- `<Heading level={2}>` → styled terminal heading with decorations
- `<CodeBlock lang="ts">` → syntax-highlighted code with borders
- `<Image src="...">` → Kitty graphics protocol inline image
- `<Table>` → formatted terminal table
- `<Callout type="warning">` → styled admonition box

### Theme System

Themes are style objects applied to hast nodes (like CSS for the terminal). Users can create/share themes as JSON/TS files. The hast → terminal rendering respects theme tokens for colors, borders, spacing.

### Future: Rich Editing

The same component tree that renders markdown can also accept input. Each AST node component has a "view" and "edit" mode. This is a natural extension of the architecture, not a bolt-on.

## Scope for v1

### Must have
- File browser with fuzzy filtering
- Split pane (source + preview) with focus toggle
- Live reload (file watcher)
- Scroll sync
- unified.js pipeline with rehype-terminal
- Syntax-highlighted code blocks
- Beautiful headings, blockquotes, lists, tables
- Kitty Graphics Protocol image rendering

### Nice to have (v1.x)
- Math/LaTeX rendering (rehype-katex → terminal)
- Mermaid diagrams (shell out to mmdc → Kitty image)
- Callout/admonition blocks
- Table of contents sidebar
- Custom themes
- Plugin documentation for third-party extensions

### Future (v2+)
- Rich markdown editor mode
- Sixel fallback for older terminals
- WASM plugin support

## Open Questions

None — all questions resolved.

## Resolved Questions

1. **Package manager**: bun — fastest, built-in bundler/runner, enables `bun compile` for distribution
2. **Distribution**: both — npm package for developers (`bun add -g liham`), compiled binary via `bun compile` for releases/homebrew
3. **rehype-terminal scope**: internal first — build inside liham, extract to standalone package later if there's community demand
4. **TUI framework**: OpenTUI over Ink — Ink has no built-in scrolling (issues #222, #432), which is a dealbreaker for a markdown previewer. OpenTUI provides native scrolling, mouse support, and sub-millisecond rendering via Zig backend, with a React-compatible reconciler
5. **Rendering model**: component-based (not string-based) — hast → React component tree, not hast → ANSI string. Each node owns its rendering. Enables images, interactivity, and future editing naturally.
6. **Dev tooling**: ESLint (ts-eslint + sonarjs + perfectionist) + Biome (formatting), based on home-jarvis configs. No swallowed catches — empty catch blocks are errors.

## Sources

- unified.js ecosystem: remark (mdast), rehype (hast), unified pipeline
- [OpenTUI](https://github.com/anomalyco/opentui): TS TUI framework with Zig rendering backend, React reconciler
- [Ink scrolling issues](https://github.com/vadimdemedes/ink/issues/222): long-standing open issue, no built-in solution
- Kitty Graphics Protocol: terminal image rendering
- Current liham Go architecture: `internal/preview/model.go` (single swap point for renderer)
- VSCode Markdown Preview Enhanced: reference for feature set and rendering quality
- Dev tooling reference configs: `~/Documents/code/personal/2026/home-jarvis/eslint.config.base.ts`, `~/Documents/code/personal/2026/home-jarvis/biome.json`
