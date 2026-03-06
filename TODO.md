# Liham — Next Work Session

## Task: Phase 2a Commit + Phase 2c IR Refactor

### What to do

1. **Commit Phase 2a** (already done, uncommitted on `feat/typescript-opentui-rewrite`)
2. **Implement Phase 2c** — Renderer Abstraction (IR Layer)
3. **Commit Phase 2c** when done

### Prompt

```
/ce:work docs/plans/2026-03-05-refactor-renderer-abstraction-ir-layer-plan.md

Before starting Phase 2c implementation, commit the current uncommitted Phase 2a work
on branch feat/typescript-opentui-rewrite (git diff shows the full changeset — all tests
pass, lint clean). Use a conventional commit message.

Then execute the IR refactor plan phases 1-6. Commit when all tests pass and lint is clean.
```

### Skills to use

- `/ce:work` — executes the plan with quality gates
- `/opentui` — reference for OpenTUI APIs if needed during renderer work

### Key files

- **Plan:** `docs/plans/2026-03-05-refactor-renderer-abstraction-ir-layer-plan.md`
- **Brainstorm:** `docs/brainstorms/2026-03-05-renderer-abstraction-ir-layer-brainstorm.md`
- **Original plan:** `docs/plans/2026-03-04-feat-liham-typescript-opentui-rewrite-plan.md`

### Phase summary (from plan)

1. IR type definitions (`src/ir/types.ts`)
2. Compiler — `rehype-ir.ts` (hast -> IR, replaces `rehype-terminal.tsx`)
3. OpenTUI renderer (`src/renderer/opentui/`)
4. Pipeline wiring (`processor.ts`, `pipeline.ts`, `index.tsx`)
5. Tests (IR unit tests + integration tests)
6. Cleanup (delete old files)

### After this

Resume remaining Phase 2b items (Table, HorizontalRule, Image, OSC 8 links, light theme)
in the new architecture pattern. Then continue with Phase 3+ per the original plan.
