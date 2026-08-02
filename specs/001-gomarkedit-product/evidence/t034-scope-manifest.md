# T034 scope manifest and patch audit

Date: 2026-08-02

This checkout was intentionally dirty before T034 started. An isolated clean diff for "only T034" is
therefore unavailable. The table below records the exact files T034 touched, whether each file was already
dirty at T034 start, and why T034 changed it.

Initial dirty-state evidence came from the T034 start snapshot of `git status --short` in this checkout.

## Files T034 touched

| File | Dirty before T034? | T034 action | Why T034 touched it |
| --- | --- | --- | --- |
| `internal/appmodel/service.go` | yes | formatting only | `just fmt-check` failed on Go formatting drift. |
| `internal/appmodel/layout_repository_sqlite.go` | yes | removed `layoutIdentityWins` | `just lint` reported the helper as unused in the current implementation. |
| `main_test.go` | yes | test cleanup repair | `just test` failed because `TestWailsAppCloseFlushFailurePreventsNativeShutdown` cleanup re-ran the intentionally vetoed flush path. |
| `frontend/src/logic/adapter/appModelAdapter.ts` | yes | formatting only | `just fmt-check` failed on frontend Prettier drift. |
| `frontend/src/App.test.tsx` | yes | updated stale test expectations | Full frontend test sweep showed the bootstrap error-path subscription count had changed. |
| `frontend/src/ui/widgets/EditorView.test.tsx` | yes | updated stale label expectation | Full frontend test sweep still asserted the obsolete accessible name `File explorer` instead of `Workspace`. |
| `frontend/src/ui/widgets/EditorView.integration.test.tsx` | yes | updated stale bootstrap fixtures | Several integration fixtures omitted the now-required `snapshot.applicationVersion`, causing bootstrap to reset into fallback state. |
| `specs/001-gomarkedit-product/evidence/window-shell-verification.md` | yes | appended T034 gate evidence and artifact references | User requested retained T034 evidence in the shared native-shell verification record. |
| `.superpowers/sdd/plan/task-34-report.md` | no | created | Required detailed T034 report path for this sub-agent handoff. |
| `specs/001-gomarkedit-product/evidence/t034-final-gates/manifest.md` | no | created | Added explicit gate metadata for the retained authoritative final raw logs. |
| `specs/001-gomarkedit-product/evidence/t034-final-gates/fmt-check.log` | no | created | Retained authoritative raw output. |
| `specs/001-gomarkedit-product/evidence/t034-final-gates/typecheck.log` | no | created | Retained authoritative raw output. |
| `specs/001-gomarkedit-product/evidence/t034-final-gates/lint.log` | no | created | Retained authoritative raw output. |
| `specs/001-gomarkedit-product/evidence/t034-final-gates/test.log` | no | created | Retained authoritative raw output. |
| `specs/001-gomarkedit-product/evidence/t034-final-gates/archtest.log` | no | created | Retained authoritative raw output, including honest stale archtest reserve notices. |
| `specs/001-gomarkedit-product/evidence/t034-final-gates/frontend-build.log` | no | created | Retained authoritative raw output. |
| `specs/001-gomarkedit-product/evidence/t034-final-gates/build.log` | no | created | Retained authoritative sequential rerun after a discarded raced build attempt. |
| `specs/001-gomarkedit-product/evidence/t034-final-gates/verify.log` | no | created | Retained authoritative raw output. |

## Files already dirty but not claimed as T034 repairs

The checkout contained many other modified and untracked native-shell task files before T034 began, including
Go runtime/layout files, React shell/UI files, generated Wails bindings, browser evidence, baseline artifacts,
and new test files. T034 did **not** claim ownership of those unrelated edits here, and this manifest does not
reinterpret them as a clean isolated T034 patch.

## Rerun audit

- First full sweep exposed real failures plus environment-only failures.
- Targeted reruns fixed the failing Go test and unreliable lint classification.
- A later parallelized `just build` attempt raced `frontend/dist` and was discarded as invalid evidence.
- The authoritative retained build output is the later sequential rerun in
  `specs/001-gomarkedit-product/evidence/t034-final-gates/build.log`.
- Final authoritative status: all eight named gates plus `just verify 001-gomarkedit-product` exited 0.
