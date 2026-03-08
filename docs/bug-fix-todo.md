# bug fix todo

pre-existing issues found during media modal work. address before merge to main.

## lint

- [ ] `src/media/decoder.ts:196` — sonarjs/no-nested-conditional (nested ternary)
- [ ] `src/media/fetcher.ts:28` — sonarjs/cognitive-complexity 18 (limit 15)

## typecheck (`bun run check`)

### stale imports

- [ ] `src/cli/index.ts:294` — stale import `../image/decoder.ts` (should be `../media/decoder.ts`)

### test type mismatches

- [ ] `src/media/decoder.test.ts:120` — `Uint8Array | undefined` not assignable
- [ ] `src/media/fetcher.test.ts` — `preconnect` missing on mock fetch type, `Uint8Array` body type mismatch (bun type update)
- [ ] `src/renderer/opentui/index.test.ts` — `url`/`src` fields typed `string | undefined` but IR types require `string` (exactOptionalPropertyTypes)

### `color` prop → `fg` (OpenTUI API change)

- [ ] `src/renderer/opentui/browser-pane.tsx` — 12 instances of `color` prop on `<text>`, should be `fg`
- [ ] `src/renderer/opentui/browser-preview.tsx` — 4 instances of `color` prop on `<text>`
- [ ] `src/renderer/opentui/source-pane.tsx:58` — `color` prop on `<text>`
- [ ] `src/renderer/opentui/status-bar.tsx` — 3 instances of `color` prop on `<text>`
- [ ] `src/renderer/opentui/layout.tsx:56` — `color` prop on `<text>`

### `rootOptions` does not exist on box style

- [ ] `src/renderer/opentui/browser-pane.tsx:116` — `rootOptions` in style object
- [ ] `src/renderer/opentui/browser-pane.tsx:171` — `rootOptions` in style object

### `dim` does not exist on text style

- [ ] `src/renderer/opentui/index.tsx:80` — `dim` in text style
- [ ] `src/renderer/opentui/index.tsx:90` — `dim` in text style

### `HeadingTokens.color` missing

- [ ] `src/renderer/opentui/status-bar.tsx:50` — `HeadingTokens.color` does not exist on theme type

### `width: string` type

- [ ] `src/renderer/opentui/status-bar.tsx:45` — `width` is `string` but expects `number | 'auto' | percent`

### exactOptionalPropertyTypes violations

These all follow the pattern: a value of type `T | undefined` is passed where `T` is expected (no `undefined` allowed).

- [ ] `src/renderer/opentui/app.tsx:375` — `renderTimeMs: number | undefined` vs `number`
- [ ] `src/renderer/opentui/use-image-loader.ts:153` — `maxRows: number | undefined` vs `number`
- [ ] `src/renderer/opentui/image.tsx:168,186,203` — `border: true | undefined` vs `boolean | BorderSides[]`
- [ ] `src/renderer/opentui/image.tsx:278` — `href: string | undefined` vs `string`
- [ ] `src/renderer/opentui/image.tsx:321` — `mediaIndex: number | undefined` vs `number`
- [ ] `src/renderer/opentui/image.tsx:109` — `ImageContextValue | undefined` not assignable to `ImageContextValue | null`
- [ ] `src/renderer/opentui/image.tsx:277` — `bgColor` does not exist on `Context<ImageContextValue | undefined>`
- [ ] `src/renderer/opentui/index.tsx:163,168,174` — `maxWidth: number | undefined` vs `number`
- [ ] `src/renderer/opentui/layout.tsx:92,102` — `width`/`height: number | undefined` vs `number`
- [ ] `src/renderer/opentui/list.tsx:17` — `fg: string | undefined` vs `string | RGBA`
- [ ] `src/renderer/opentui/browser-pane.tsx:183` — `onMouseDown: (() => void) | undefined` vs handler
- [ ] `src/renderer/opentui/preview-pane.tsx:36` — `onMouseDown`/`onMouseScroll` exactOptionalPropertyTypes
- [ ] `src/renderer/opentui/source-pane.tsx:47` — `onMouseDown`/`onMouseScroll` exactOptionalPropertyTypes

## summary

- 58 TypeScript errors across 15 files
- 2 lint issues across 2 files
- most are systematic: `color` → `fg` migration (20+ instances), `exactOptionalPropertyTypes` guards
- none are in files modified during media modal work (except app.tsx:375 which is pre-existing)
