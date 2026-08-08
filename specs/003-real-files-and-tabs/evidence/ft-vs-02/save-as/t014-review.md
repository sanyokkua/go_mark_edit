# FT-VS-02 Save and Save As — T014

Date: 2026-08-08
Branch: `feature/v1-implementation--003-t014-save-as`
Host: `darwin/arm64`

## Verified commands

- `GOCACHE=/private/tmp/gomarkedit-gocache go test -race ./internal/appmodel ./internal/application . -run 'TestSaveAndSaveAs|TestMixedEndingAuthorization|TestSaveAsCollisionAndTargetDrift|TestSaveAsRawByteHashRecheck|TestSaveAsTargetReservationReleasedOnEveryTerminalOutcome|TestAppModelHandlerIsBoundAndGenerated' -count=1` — passed.
- `GOCACHE=/private/tmp/gomarkedit-gocache just gen` — passed.
- `GOCACHE=/private/tmp/gomarkedit-gocache just gen-check` — passed with generator output staged.
- `GOCACHE=/private/tmp/gomarkedit-gocache GOLANGCI_LINT_CACHE=/private/tmp/gomarkedit-lint-cache just check` — passed: generator drift, frontend build/lint/typecheck/tests (57 suites, 289 tests), Go vet, architecture, CGO-free, migration immutability, and the full Go race suite.
- `GOCACHE=/private/tmp/gomarkedit-gocache GOLANGCI_LINT_CACHE=/private/tmp/gomarkedit-lint-cache just verify 003-real-files-and-tabs` — passed M1–M6 against the feature baseline.
- `GOCACHE=/private/tmp/gomarkedit-gocache just build` — passed the real Wails `darwin/arm64` production build and packaging; output was `build/bin/GoMarkEdit.app/Contents/MacOS/GoMarkEdit` (`Mach-O 64-bit executable arm64`).

## Contract evidence

- Save on an untitled document enters Save As, appends `.md` to a suffixless selection, accepts the four supported suffixes case-insensitively, and adopts the canonical target path only after atomic commit.
- Existing targets use one native overwrite confirmation. The post-confirmation disk version and stable raw-byte hash are captured once and rechecked immediately before the coordinator invokes atomic replacement; drift returns classified conflict without a second prompt or model/path mutation.
- Save As reservations are process-local and released by deferred cleanup on cancellation, refusal, conflict, commit, and injected failure. A target held by another open document is refused before disk I/O.
- Mixed endings use a dominant LF/CRLF choice with first-ending tie break, a revision/document-bound single-use authorization, and no write before authorization. Edits invalidate pending authorizations; successful normalization updates the committed line-ending characteristic.
- Bound `Save` and `SaveAs` methods return `apperr.WriteResult`, recover panics into classified refusals, and are present in regenerated Wails bindings. Native picker and overwrite ports are wired only at the composition root.

