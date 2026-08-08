# FT-VS-02 Save UI outcomes — T015

Date: 2026-08-08
Branch: `feature/v1-implementation--003-t015-save-ui-proof`
Host: `darwin/arm64`

## Verified commands

- `npm --prefix frontend test -- --runInBand` — passed: 58 suites, 302 tests.
- `npm --prefix frontend run verify:ui -- e2e/real-files-and-tabs.test.ts --grep 'FT-VS-02'` — passed: one Chromium test.
- `GOCACHE=/private/tmp/gomarkedit-gocache just build` — passed the real Wails `darwin/arm64` production build/package/self-sign; output was `build/bin/GoMarkEdit.app/Contents/MacOS/GoMarkEdit` (`Mach-O 64-bit executable arm64`).
- `GOCACHE=/private/tmp/gomarkedit-gocache GOLANGCI_LINT_CACHE=/private/tmp/gomarkedit-lint-cache just check` — passed: generator drift, frontend build/format/lint/typecheck/tests, Go vet, architecture/CGO-free, migration immutability, and full Go race tests.
- `GOCACHE=/private/tmp/gomarkedit-gocache GOLANGCI_LINT_CACHE=/private/tmp/gomarkedit-lint-cache just verify 003-real-files-and-tabs` — passed M1–M6 against the feature baseline.

## Contract evidence

- The adapter exposes guarded three-argument `Save` and `SaveAs` bindings and normalizes typed `apperr.WriteResult` outcomes. Save and Save As are available document actions, while the dispatcher and File menu refuse read-only or identity-mismatched writes before invoking the bridge.
- Explicit Save flushes the identity-bound content/view lifecycle first, reads the authoritative active-buffer revision, and then invokes the requested write kind. A committed result reconciles through the existing bounded projection recovery path and emits one localized success toast containing only the safe filename, encoding, and LF/CRLF outcome. Automatic success remains suppressed by the existing notification policy; repeated failures deduplicate by subject and increment one notification count.
- `NormalizationPrompt` is titled `Normalize line endings?`, names the basename only, states the proposed LF/CRLF result and whole-file conversion, orders `Normalize and save` before `Cancel`, focuses Cancel initially, treats Escape/backdrop as Cancel, and offers no persistent suppression option. Confirmation reuses the suspended Save/Save As kind, decision token, and exact document revision without invoking a second user Save command.
- StatusBar renders the authoritative five-value save status. The mock bridge updates dirty/status projection only on accepted committed writes, and the focused FT-VS-02 browser proof typed in the real editor, saved through File → Save, and observed exactly one `save-success` notification plus the Saved status.

## Scope note

The implementation also updates `frontend/src/App.tsx`, `frontend/src/App.test.tsx`, `frontend/src/logic/store/appModelTypes.ts`, `frontend/src/logic/adapter/index.ts`, and `frontend/src/ui/widgets/EditorView.tsx` to connect the task-owned adapter/action/UI seams. No generated Wails file was hand-edited; `just gen-check` passed.
