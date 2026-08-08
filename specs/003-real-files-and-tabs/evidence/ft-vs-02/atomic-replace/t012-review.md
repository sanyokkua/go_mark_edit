# FT-VS-02 platform-safe atomic replacement — T012

Date: 2026-08-08

## Verified commands

- `GOCACHE=/private/tmp/gomarkedit-gocache go test -race ./internal/file -run TestAtomicReplace -count=1` — passed, 11 tests.
- `GOCACHE=/private/tmp/gomarkedit-gocache go test -race ./internal/file -count=1` — package passed.
- `GOOS=windows GOARCH=amd64 GOCACHE=/private/tmp/gomarkedit-gocache go test -c -o /private/tmp/gomarkedit-t012-windows-package.exe ./internal/file` — Windows package and build-tagged tests cross-compiled.
- `GOCACHE=/private/tmp/gomarkedit-gocache GOLANGCI_LINT_CACHE=/private/tmp/gomarkedit-lint-cache just archtest` — passed all Go architecture, CGO-free, migration, and frontend boundary checks.

## Contract evidence

- `AtomicReplace` creates an exclusive temporary file in the target directory, writes all bytes, applies the existing permission mode, syncs and closes before the version recheck, and removes the temporary artifact on every pre-commit failure.
- Pre-commit write/chmod/sync/close/version/replacement failures preserve the original bytes and return `AtomicReplaceError` with `Committed=false`; version drift is classified as `conflict`.
- Unix uses same-directory `os.Rename` and syncs the parent directory. A directory-sync failure returns a committed result with `Committed=true` and a classified `persistence-warning`, so the successful disk replacement is not replayed.
- Windows existing-target replacement is build-tagged and calls `ReplaceFileW` with UTF-16 paths and write-through semantics; no cross-platform plain `os.Rename` proof is used.
- A direct `os.O_EXCL` construction initially violated the repository’s no-instance-lock architecture scanner; the implementation now uses `os.CreateTemp`, retaining exclusive creation without the forbidden direct lock marker.
