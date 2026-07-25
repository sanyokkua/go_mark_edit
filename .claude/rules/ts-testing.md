---
paths:
  - "frontend/src/**/*.test.ts"
  - "frontend/src/**/*.test.tsx"
---

# TypeScript testing

**Authority:** `docs/stories/README.md` (the story format and the `Proves:` convention),
`specification/02_Architecture/01_MODULE_INVENTORY.md`.

Frontend unit/component tests use **Jest + React Testing Library**. They prove application
behaviour — never the contents of a repository document.

## DO

- Name the acceptance criterion in the test name, so a failure names the requirement that broke:

  ```ts
  it('STORY-031-AC-1 renders a GFM table in the preview', () => { ... });
  ```

  A convention for humans; nothing regenerates from it and nothing validates it.

- **Never mock the component under test.** `jest.mock('./ui/widgets/AppShell')` inside a suite that
  claims to prove `AppShell`'s layout proves nothing — that mistake is live in this repo today
  (`docs/KNOWN_ISSUES.md` §4). Mock collaborators; render the subject.

- **Write adversarial tests, not happy paths.** Cover remount and session identity, retry after
  failure, out-of-order async completion, and consumption through the public seam.

- **Reject a test that proves only** that a symbol exists, that source text contains a string, or a
  precondition-free happy path — without asserting the final user-visible postcondition.

- Test **behaviour**, from the user's vantage point. Query by **accessible roles/labels/text**
  (`getByRole`, `getByLabelText`, `findByText`), not by class name, test id, or DOM structure.
- Mock the **adapter layer** (`logic/adapter`) -- never `wailsjs/` -- so tests exercise the same seam the
  app uses. Assert on dispatched state / rendered output.
- Use `findBy*`/`waitFor` for async (debounced preview, async MermaidBlock) instead of fixed timers.

## DON'T

- Don't reach into `wailsjs/`, internal component state, or private module symbols.
- Don't assert on exact class names or snapshot huge DOM trees as the primary assertion.
- Don't delete/skip a failing test to go green; fix the code or the test.
- **Don't write a test that validates a document**, and don't mock the thing you are testing.

## Authoring checklist

- [ ] Test name carries `STORY-NNN-AC-N`.
- [ ] The component under test is rendered, not mocked.
- [ ] Queries are accessibility-first (`getByRole`/`getByLabelText`/text).
- [ ] Backend seam mocked at `logic/adapter`, not `wailsjs/`.
- [ ] Async handled with `findBy*`/`waitFor`; every AC has a proving test.
- [ ] The test asserts a user-visible outcome, not that a function was called.
