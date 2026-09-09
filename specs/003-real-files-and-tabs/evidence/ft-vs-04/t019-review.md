# T019 review — revision-bound external recovery

## Outcome

T019 is implemented on `feature/v1-implementation--003-t019-conflict-state`.
The backend now performs foreground-only stable disk checks before path-backed
writes and activation, queues one revision/version-bound conflict per document,
projects waiting documents with `conflictBlocked`, and exposes typed reload,
Keep-mine, Skip, and read-only Cancel commands through the Wails handler.

## Contract evidence

| Case                                     | Evidence                                                                                                                                               | Result |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| Same raw bytes, changed metadata version | `TestStableRereadMetadataEqualResumesWrite` changes only mtime, verifies stable reread, baseline refresh, and one successful write                     | pass   |
| Changed external content                 | `TestExternalConflictDecision` and `TestWaitingDocumentsProjectBlockedByConflict`                                                                      | pass   |
| Unstable reread                          | `TestUnstableRereadWritesNothing` injects an unstable stable-read result and verifies disk bytes are unchanged                                         | pass   |
| Deleted backing file                     | `TestMissingBackingFileDetaches` preserves path/source, projects detached + dirty, and recreates with explicit Save                                    | pass   |
| Read-only conflict                       | `TestReadOnlyConflictOffersReloadAndCancelOnly` rejects Skip and accepts structural Cancel; reload remains the only source decision                    | pass   |
| Second disk change                       | `TestKeepMineSecondDiskChangeRefuses` changes the file after authorization and verifies atomic replacement refuses without overwriting the newer bytes | pass   |
| Serialized queue                         | `TestConflictQueueOneModalInTabOrder` retains the active modal and selects the next pending entry in supplied tab order                                | pass   |
| Waiting projection                       | `TestWaitingDocumentsProjectBlockedByConflict` verifies every queued document is visibly blocked and Skip clears only its own entry                    | pass   |
| Authorization invalidation               | `TestKeepMineAuthorizationInvalidation` verifies an accepted edit consumes no stale Keep-mine token                                                    | pass   |
| No watcher/polling                       | `TestNoWatcherOrPollingTimerIsRegistered` observes no disk check until an explicit foreground command                                                  | pass   |

External writers are represented by real host filesystem replacements in the
backend tests; a second-process current-host walkthrough remains T021 evidence.

## Verification

- `GOCACHE=/private/tmp/gomarkedit-gocache go test -race ./internal/appmodel ./internal/file ./internal/apperr -count=1` — pass
- `npm --prefix frontend test -- --runInBand` — 62 suites, 316 tests passed
- `npm --prefix frontend run lint` — pass
- `npm --prefix frontend run typecheck` — pass
- `npm --prefix frontend run format:check` — pass
- `GOCACHE=/private/tmp/gomarkedit-gocache just archtest` — pass; cgo-free check emitted the known restricted module-cache warning but returned zero findings
- `GOCACHE=/private/tmp/gomarkedit-gocache just check` — pass; all local gate steps completed, including race tests
- `GOCACHE=/private/tmp/gomarkedit-gocache just frontend-build` — pass
- `wails build -clean` — pass on current host; packaged and self-signed `build/bin/GoMarkEdit.app`

Generated Wails output was refreshed with `just gen`. The existing feature
baseline remains unchanged and was not recaptured.
