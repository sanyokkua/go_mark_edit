---
paths:
  - "internal/**/*_test.go"
  - "main_test.go"
---

# Go testing

**Authority:** `specification/06_Process_and_Traceability/03_TRACEABILITY.md` (the `Proves:`
convention), `02_STORY_FORMAT.md` (Definition of done). Tests live alongside their packages in `internal/**/*_test.go`.

## DO

- Put the AC id on the **first leading comment line** of the proving test so `just trace` can collect it:

  ```go
  // Proves: STORY-018-AC-2
  // Save writes UTF-8 and preserves the file's original CRLF line endings.
  func TestSavePreservesCRLF(t *testing.T) { ... }
  ```

- For an edge case, add `// Evidence: EC-AREA-N` in the same leading comment block. Mentioning an EC id
  in test-body data or an assertion string does not count as exact evidence.

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
- Don't leave an AC without a test that names its story id (traceability fails).

## Authoring checklist

- [ ] Each proving test has `// Proves: STORY-NNN-AC-N` as its first comment line.
- [ ] Table-driven where multiple cases apply; runs clean under `-race`.
- [ ] Dependencies faked via the defining package's interface; no real DB/network in unit tests.
- [ ] Every AC and every cited `EC-` id has a passing test.
