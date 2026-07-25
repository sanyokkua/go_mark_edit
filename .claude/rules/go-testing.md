---
paths:
  - "internal/**/*_test.go"
  - "main_test.go"
---

# Go testing

**Authority:** `docs/stories/README.md` (the story format and the `Proves:` convention). Tests live
alongside their packages in `internal/**/*_test.go`.

**Tests prove application behaviour.** A test that reads a repository document, greps a config file,
or asserts on the contents of `justfile` / CI / `.claude/` is not a test — that experiment was run
here and removed. The only exceptions are the genuine architecture invariants that can only be
checked by scanning source: no network or lock imports, no `import "C"`, bindings stay tracked.

## DO

- Put the AC id on the **first leading comment line** of the proving test, so a failure names the
  requirement that broke:

  ```go
  // Proves: STORY-018-AC-2
  // Save writes UTF-8 and preserves the file's original CRLF line endings.
  func TestSavePreservesCRLF(t *testing.T) { ... }
  ```

  This is a convention for humans. Nothing regenerates from it and nothing validates it.

- **Write adversarial tests, not happy paths.** Where the behaviour allows it, cover:
  mutate-before-transition, deferred-completion ordering, remount / session identity, retry after
  failure, and consumption through the public seam by a sibling.

- **Reject a test that proves only** that a symbol exists, that source text contains a string, a
  precondition-free happy path, or that a command was invoked — without asserting the final
  user-visible postcondition.

- Prefer **table-driven** subtests (`tt := range cases` / `t.Run(tt.name, ...)`).
- Always run with the race detector: `go test -race ./...` (this is the `just test` gate).
- Test through **fakes/stubs that satisfy the package's own interface** (e.g. a fake
  `SettingsRepositoryAPI`); construct the service with the fake. No real DB in a unit test -- put
  DB-backed tests behind the `integration` test target named in the module inventory.
- Cover every reported bug or edge case with a new or extended test (add the `EC-` id where one applies).

## DON'T

- Don't assert on log output or on private fields -- assert on behaviour and returned values/envelopes.
- Don't skip `-race`, and don't delete/comment a failing test to make the suite green.
- Don't hit the network or a live LLM/provider -- GoMarkEdit is offline; there is nothing to reach.
- Don't leave an acceptance criterion without a test that names it.
- **Don't write a test that validates a document.** Story text, phase text, ADR contents, the
  justfile, CI config and `.claude/` are not test subjects.

## Authoring checklist

- [ ] Each proving test has `// Proves: STORY-NNN-AC-N` as its first comment line.
- [ ] Table-driven where multiple cases apply; runs clean under `-race`.
- [ ] Dependencies faked via the defining package's interface; no real DB/network in unit tests.
- [ ] Every acceptance criterion has a passing test.
- [ ] The test asserts a user-visible outcome, not that a function was called.
