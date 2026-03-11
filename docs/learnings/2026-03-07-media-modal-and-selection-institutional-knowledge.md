# Learnings: Media, Modal, Selection & Image Pipeline

**Date:** 2026-03-07
**Covers:** Selection/clipboard, modal overlay, GIF animation, video/audio, image pipeline

---

## Pre-Render Frames to Avoid Allocation Storms

Calling `renderHalfBlockMerged()` per frame at 10-20fps creates ~40K short-lived allocations per frame (pixel blending, hex strings, span objects). At 5 GIFs, that's 200K+ allocations/second — GC jank.

Fix: pre-compute all frames when image loads, not on each tick. Frame cycling becomes an O(1) index swap.

```typescript
const renderedFramesRef = useRef<MergedSpan[][][] | null>(null)

useEffect(() => {
    if (image?.frames == null) { renderedFramesRef.current = null; return }
    renderedFramesRef.current = image.frames.map(rgba => {
        const frameImg: LoadedImage = { ...image, rgba }
        return renderHalfBlockMerged(frameImg, bgColor)
    })
}, [image, bgColor])
```

---

## Frame Timer Drift Correction

GIF frames have variable per-frame delays. `setInterval` accumulates drift. Use `setTimeout` per frame with drift adjustment:

```typescript
const targetDelay = image.delays[frameIndex] ?? 100
const elapsed = performance.now() - frameStartRef.current
const adjustedDelay = Math.max(0, targetDelay - elapsed)
```

Also clamp delays ≤10ms to 100ms (browser convention — GIF delay=0 means "unspecified").

---

## React Hooks Must Be Unconditional

Early returns before hooks violate React's rules. If a value transitions between null and non-null, React throws.

```typescript
// wrong — early return before useEffect
if (ctx == null) return renderTextFallback(...)
useEffect(() => { ... })

// correct — all hooks first, conditional rendering after
const [state, setState] = useState(...)
useEffect(() => {
    if (ctx == null) return
    // ...
}, [...])
if (ctx == null) return renderTextFallback(...)
```

---

## Stale Async: Invocation Counter, Not Boolean

Use a monotonically increasing counter to detect superseded async callbacks:

```typescript
const loadIdRef = useRef(0)

useEffect(() => {
    const thisLoadId = ++loadIdRef.current
    loadImageFile(node.url).then(file => {
        if (loadIdRef.current !== thisLoadId) return // superseded
    })
}, [node.url])
```

A boolean flag fails on rapid changes (1 → 2 → 1) where the stale flag doesn't capture which version is "current."

---

## Semaphore Abort Handling (Slot Leak Prevention)

When a component unmounts while waiting in a semaphore queue, the slot must be released:

```typescript
const entry = { resolve, rejected: false }
queue.push(entry)
signal?.addEventListener('abort', () => {
    const idx = queue.indexOf(entry)
    if (idx !== -1) {
        queue.splice(idx, 1)
        entry.rejected = true // prevent slot leak
        reject(signal.reason)
    }
}, { once: true })
```

---

## AbortSignal Guard Before Composing

When composing abort signals, guard optional signal against null:

```typescript
const combined = signal != null
    ? AbortSignal.any([timeoutSignal, signal])
    : timeoutSignal
```

`AbortSignal.any([timeoutSignal, null])` fails silently.

---

## Kitty Image Cleanup on Process Exit

`renderer.destroy()` calls `process.exit(0)` synchronously — React useEffect cleanup never runs. Use `process.on('exit')` for Kitty image cleanup:

```typescript
process.on('exit', () => {
    const commands = activeImageIds.map(id => `\x1b_Ga=d,d=I,i=${id}\x1b\\`)
    process.stdout.write(commands.join(''))
})
```

---

## `exactOptionalPropertyTypes` — Use Spread for Optional Fields

With this strict mode flag, optional fields must be omitted entirely, not set to `undefined`:

```typescript
// correct — conditional spread
if (frames.length > 1) {
    return { ...staticFields, frames, delays }
} else {
    return staticFields // no frames/delays keys at all
}
```

---

## Animated GIF Always Uses Half-Block

Even on Kitty terminals, animated GIFs use half-block rendering. Re-transmitting Kitty images per frame is too expensive. Protocol degradation:

```typescript
if (image.frames != null) effectiveProtocol = 'halfblock'
```

---

## Modal Overlay Pattern

`position: "absolute"` + `zIndex` on a `<box>` layers correctly over scrollbox content. Full-screen modal: `width: "100%"`, `height: "100%"`.

---

## Factory Functions Over Classes

Codebase convention: `createFileWatcher()`, `createImageCache()`, `createSemaphore()` — not `new`. Easier testing, avoids module-level singletons.

---

## hex() Lookup Table

Pre-computed table avoids 7 string allocations per `toHex()` call:

```typescript
const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'))
function toHex(r: number, g: number, b: number): string {
    return `#${HEX[r]}${HEX[g]}${HEX[b]}`
}
```

~50% reduction in string allocations within halfblock rendering. Matters for pre-rendering all GIF frames.
