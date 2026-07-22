---
paths:
  - "frontend/src/**/*.test.ts"
  - "frontend/src/**/*.test.tsx"
---

# TypeScript testing

**Authority:** `specification/06_Process_and_Traceability/03_TRACEABILITY.md` (the `Proves:`
convention), `02_STORY_FORMAT.md` (Definition of done), `01_MODULE_INVENTORY.md`.

Frontend unit/component tests use **Jest + React Testing Library**.

## DO

- Name the AC in the test name (and/or a leading comment) so `just trace` can collect it:

  ```ts
  // Proves: STORY-031-AC-1
  it('STORY-031-AC-1 renders a GFM table in the preview', () => { ... });
  ```

- Put every proved `EC-AREA-N` id in the actual Jest test name. An incidental id in a fixture, assertion,
  or body comment is not exact edge-case evidence.

- Test **behaviour**, from the user's vantage point. Query by **accessible roles/labels/text**
  (`getByRole`, `getByLabelText`, `findByText`), not by class name, test id, or DOM structure.
- Mock the **adapter layer** (`logic/adapter`) -- never `wailsjs/` -- so tests exercise the same seam the
  app uses. Assert on dispatched state / rendered output.
- Use `findBy*`/`waitFor` for async (debounced preview, async MermaidBlock) instead of fixed timers.

## DON'T

- Don't reach into `wailsjs/`, internal component state, or private module symbols.
- Don't assert on exact class names or snapshot huge DOM trees as the primary assertion.
- Don't delete/skip a failing test to go green; fix the code or the test.

## Authoring checklist

- [ ] Test name/comment carries `Proves: STORY-NNN-AC-N`.
- [ ] Any edge-case proof names its `EC-AREA-N` in the actual test title.
- [ ] Queries are accessibility-first (`getByRole`/`getByLabelText`/text).
- [ ] Backend seam mocked at `logic/adapter`, not `wailsjs/`.
- [ ] Async handled with `findBy*`/`waitFor`; every AC has a proving test.
