# T013 review — write convergence and recovery

Date: 2026-08-08
Branch: `feature/v1-implementation--003-t013-write-convergence`

## Implemented contracts

- `DocumentWriteCoordinator` serializes each document's immutable revision snapshot and returns a committed disk result without replaying a write when projection publication fails.
- Document metadata derives one authoritative five-value save status from capability, untitled state, disk baseline, detached state, failed writes, revision ordering, and baseline origin.
- Stale committed revisions advance disk truth without clearing newer working-copy edits; failed writes leave the existing baseline and status unchanged.
- Frontend committed-write reconciliation hydrates once, coalesces recovery attempts, retries immediately/250 ms/1 s, exposes a persistent saved-on-disk recovery surface after exhaustion, and blocks later document commands.
- Recovery quit/discard requires a second confirmation and carries the affected document names.

## Named evidence

```text
GOCACHE=/private/tmp/gomarkedit-gocache go test -race ./internal/appmodel -run 'TestWriteCoordinator|TestSaveStatusPrecedenceTable|TestBaselineOriginRestoresCleanLabel|TestFailedWriteLeavesStatusUnchanged|TestStaleRevisionWriteDoesNotProjectClean|TestCommittedWriteProjectionFailure|TestResyncRetriesAt250msAndOneSecond|TestResyncExhaustionShowsPersistentRecoverySurface|TestQuitAndDiscardRequiresSecondConfirmation|TestNewerEditRemainsDirty' -count=1
PASS

npm --prefix frontend test -- --runInBand
57 suites passed; 289 tests passed

GOCACHE=/private/tmp/gomarkedit-gocache go test -race ./internal/... . -count=1
PASS

GOCACHE=/private/tmp/gomarkedit-gocache GOPROXY=off GOSUMDB=off GOLANGCI_LINT_CACHE=/private/tmp/gomarkedit-golangci-cache just check
PASS: gen-check, frontend-build, fmt-check, lint, typecheck, frontend-test,
      go-vet, archtest, go-test
```

Additional contract tests cover committed-result JSON shape, the retry cycle, generated-state status normalization, and command blocking after recovery exhaustion. A small inherited lint cleanup was required in `internal/file/atomic_replace.go`, `internal/file/disk_version.go`, `frontend/src/App.test.tsx`, `frontend/src/logic/adapter/services.test.ts`, `frontend/src/logic/adapter/index.ts`, and `frontend/src/logic/hooks/useSyncedBuffer.ts`; no quality rule or test threshold was changed.
