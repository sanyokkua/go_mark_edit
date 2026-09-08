# T016 review — revision-safe backend tab state

Branch: `feature/v1-implementation--003-t016-tab-state`

Implemented backend-owned tab activation, one-position reorder, adjacent/final close, bounded recently-closed
path metadata, typed active-buffer acknowledgements, and injected clipboard/reveal ports. Stale and edge no-op
commands do not publish or bump the tab-set revision. Copy Path retains detached canonical paths; Reveal performs
the existence check in appmodel, avoids the port for known-missing files, and classifies invocation-time
disappearance separately from host-command failure.

Evidence:

- `GOCACHE=/private/tmp/gomarkedit-gocache go test -race ./internal/appmodel ./internal/file` — pass.
- `GOCACHE=/private/tmp/gomarkedit-gocache go test -race ./internal/appmodel ./internal/file -run 'TestTabSessionOrderRevision|TestActivateDocumentAcknowledgement|TestStaleTabCommands|TestAdjacentAndFinalClose|TestMoveTabOnePositionRequiresConfirmation|TestMoveTabPastEdgeIsNoOpWithoutRevisionBump|TestCopyPathResolvesCanonicalPathAndClassifiesClipboardFailure|TestCopyPathSucceedsForDetachedDocument|TestRevealInFileManagerRevalidatesExistenceAndClassifiesFailure'` — pass.
- `GOCACHE=/private/tmp/gomarkedit-gocache GOOS=windows GOARCH=amd64 go test -c -o /private/tmp/gomarkedit-t016-windows.test.exe ./internal/file` — compile pass.
- `GOCACHE=/private/tmp/gomarkedit-gocache GOOS=darwin GOARCH=arm64 go test -c -o /private/tmp/gomarkedit-t016-darwin.test ./internal/file` — compile pass.
- `GOCACHE=/private/tmp/gomarkedit-gocache just gen` followed by `GOCACHE=/private/tmp/gomarkedit-gocache just archtest` — pass, including CGO-free and frontend architecture checks.

The full `just check` gate is run after the task commit so generator drift is evaluated against committed generated
bindings.
