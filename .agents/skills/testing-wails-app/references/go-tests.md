# Go tests — table-driven, `-race`, fakes only

Authority: `.claude/rules/go-testing.md`; envelope contract patterns from
`specification/02_Architecture/06_ERROR_HANDLING.md` and P3 in `05_ACCEPTANCE_CRITERIA_PATTERNS.md`.

## Fakes only, `-race` always

The app is **offline**, so there is nothing real to reach. Construct the service with a fake that
satisfies the package's own interface; use a temp SQLite file (never a shared global) for integration
tests; always run under `-race`.

```go
// Proves: STORY-018-AC-2
// Save writes UTF-8 and preserves the file's original CRLF line endings (P1, EC-DOCS-…).
func TestSavePreservesCRLF(t *testing.T) {
    cases := []struct{ name, in, want string }{
        {"crlf kept", "a\r\nb\r\n", "a\r\nb\r\n"},
        {"lf kept",   "a\nb\n",     "a\nb\n"},
    }
    for _, tt := range cases {
        t.Run(tt.name, func(t *testing.T) {
            svc := docs.NewService(&fakeFS{}) // fake satisfies the package interface — no real disk/network
            got := svc.NormalizeForWrite(tt.in)
            if got != tt.want {
                t.Fatalf("got %q want %q", got, tt.want)
            }
        })
    }
}
```

## Integration tests use a temp SQLite file

For a DB-backed repository (`internal/db/`, `internal/settings`, `internal/recent`), open a temp file
under `t.TempDir()` with the real WAL + `busy_timeout` DSN (see `sqlite-kv-persistence`), never a
shared or in-memory global that other tests could observe. Each test owns its DB so the suite stays
order-independent and race-free.

## Envelope-contract tests (P3)

Assert the `apperr.*Result` **shape** and `ErrorCode` — never log output, never a private field. A
contract test proves that a given failure maps to the right code and that exactly one of `Data`/`Error`
is set:

```go
// Proves: STORY-020-AC-3
// A missing file surfaces as a not_found envelope, not a panic or a partial Data.
func TestOpenMissingFileReturnsNotFound(t *testing.T) {
    h := docs.NewHandler(docs.NewService(&fakeFS{missing: true}), testLogger())
    res := h.OpenDocument(docs.OpenReq{Path: "/nope.md"})
    if res.Data != nil {
        t.Fatalf("expected no data, got %+v", res.Data)
    }
    if res.Error == nil || res.Error.Code != apperr.CodeNotFound {
        t.Fatalf("expected not_found, got %+v", res.Error)
    }
}
```

## Rules of thumb

- Never write an order-dependent test or share mutable state between tests.
- Never make a real network call — the app is offline; fake the package interface or use an in-memory
  stub.
- Never delete or skip a failing test to make the suite pass — fix the code (or the test) and report
  the bug.
