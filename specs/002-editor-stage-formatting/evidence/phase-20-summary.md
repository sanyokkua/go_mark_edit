# Phase 20 verification summary

Captured 2026-08-06 on macOS arm64. Historical Phase 16–19 evidence remains
unchanged.

| Evidence | Result |
| --- | --- |
| focused appearance journey | Passed strictly after waiting for Monaco's rendered palette token rather than only the root attributes. |
| unrestricted browser matrix | Passed: 148/148 across 1280, 768, and 375 logical-pixel viewports. The unabridged direct runner and required official-wrapper command streams are `phase-20-e2e.raw.log` and `phase-20-e2e-official.raw.log`. |
| `just fmt-check` | Passed. |
| `just lint` | Passed after a normal-cache rerun: golangci-lint analyzed the Go packages and ESLint reported 0 issues. |
| `just typecheck` | Passed. |
| `just test` | Passed: Go race tests, 54 Jest suites, and 258 Jest tests. |
| `just archtest` | Passed: backend handler/boundary checks, CGO-free build, migrations, frontend boundaries, token colours, and offline sources. |
| `just verify 002-editor-stage-formatting` | Passed M1–M6 against the reliable baseline. The unabridged command stream is `phase-20-verify.raw.log`. |
| `just build` | Passed: Wails v2.12.0 built and self-signed the production `darwin/arm64` bundle. |

The fresh packaged application opened with the OS-managed native frame and the
corrected shell hierarchy: text File/Settings/View/About labels, menu-row
sidebar and disabled Assistant controls, grouped toolbar islands, and the
textual Split arrangement control. The captured current-host visual record is
`phase-20-packaged-current-host.png`.

The browser evidence exercises the popup-owner, keyboard, pointer-coordinate,
Glass/Material/Minimal, responsive-overflow, deferred-control, and
local-request paths. macOS denied this environment's synthetic native input
while the packaged app was open, so this record does not claim an additional
native click trace beyond the fresh current-host visual inspection. It makes no
claim about Windows/Linux behavior or package-minimum-size limits.
