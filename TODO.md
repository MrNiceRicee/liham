# hey! you reached the todo file

Nice this is cool

## Phase 6 — Tier 2 (deferred from MVP)

- [ ] Remote image fetching (Phase F) — fetch `https://` images with loading state, SSRF mitigation
- [ ] 24-bit image ID encoding for documents with >255 images
- [ ] `--no-images` flag (workaround: `LIHAM_IMAGE_PROTOCOL=text`)
- [ ] U+10EEEE validation inside OpenTUI scrollbox (decision gate for Kitty vs half-block-only)

## Phase 6 — Tier 3 (deferred)

- [ ] Animated GIF: decode frames, cycle on timer interval
- [ ] Image links: `[![img](src)](href)` — wrap image component in `<a>`
- [ ] tmux DCS passthrough for pre-3.5 versions
- [ ] HEIC support (if sharp prebuilt ever includes libheif)
- [ ] Progressive/lazy loading for very large documents
- [ ] Sixel protocol support (for terminals without Kitty)
- [ ] iTerm2 inline image protocol
- [ ] SVG support (requires librsvg)
- [ ] `file:` URI support
- [ ] `data:` URI support (decompression bomb risk)
- [ ] BMP support