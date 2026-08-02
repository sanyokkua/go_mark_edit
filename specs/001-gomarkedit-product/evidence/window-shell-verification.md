# Native window shell verification

## T032 — production-network safeguard (2026-08-02)

| Command                                                                                 | Exit | Verdict                                                                                                                                  |
| --------------------------------------------------------------------------------------- | ---: | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `npm --prefix frontend test -- --runInBand src/ui/components/CodeEditor.bundle.test.ts` |    0 | PASS — remote request fixtures fail; inert vendor diagnostic strings, bundled Monaco injection, and same-origin preload conditions pass. |
| `just frontend-archtest`                                                                |    0 | PASS — existing stale allowlist notices only.                                                                                            |
| `npm --prefix frontend run build`                                                       |    0 | PASS — source scan and built-bundle safeguard pass. Vite reports existing dynamic-import and chunk-size warnings.                        |
| `just gen`                                                                              |    0 | PASS — generated bindings are current.                                                                                                   |
| `go test ./internal/application ./internal/appmodel ./internal/settings ./internal/db`  |    0 | PASS — 171 tests.                                                                                                                        |

The original syntax-only scan reported Monaco's dependency-default CDN URL and Vite's generated
same-origin module-preload fetch. The safeguard now rejects executable request APIs and remote source assets,
while requiring the application to inject bundled Monaco before the loader returns and Vite to use relative
asset URLs. Vendor diagnostic/default strings alone are not executable request paths. The retained
request-instrumented browser journey remains the runtime proof that every actual request is local.

## T033 — in-app-browser repair and automated shell evidence (2026-08-02)

The mock-backed interface was started with `just dev-ui` at `http://localhost:5175/` and exercised in
the Codex in-app browser. At desktop width, Settings changed and reset Appearance, Escape restored
focus to Settings, View hid and restored the workspace, About showed `Version dev`, and F11 produced no
console error. At 768 px the workspace was a 46 px rail; at 375 px it was a 230 px overlay, the editor
and preview stacked, the menu row moved to the working Settings/View/About overflow, and the page had no
horizontal overflow. File, tab strip, launcher/recents, and Assistant surfaces were absent.

| Command                                                                | Exit | Verdict                                                                                                                        |
| ---------------------------------------------------------------------- | ---: | ------------------------------------------------------------------------------------------------------------------------------ |
| `npm exec -- playwright test e2e/window-shell.test.ts --reporter=list` |    0 | PASS — 22 tests: 18 viewport/palette cases plus actions/focus, local-only requests, and 20 resize + 20 divider timing samples. |

The screenshot assertion has **no pixel-difference tolerance**. It hides only Monaco's cursor and
`decorationsOverviewRuler` canvas, which are transient editor-position artifacts outside the native-shell
contract; every retained full-page visual baseline is otherwise strict. The request log retains all 151
observed requests rather than a representative subset. Raw resize and divider samples record the visible
update, largest animation-frame gap, and the appmodel acknowledgement after input stopped; all 40 visible
updates met the 100 ms target, with acknowledgement remaining below 500 ms. Divider acknowledgement is
counted only when a new matching appmodel patch is emitted after pointer release. Retained machine-readable
matrix, request, and timing evidence is [`window-shell-browser.json`](window-shell-browser.json).

## T034 — final gates and baseline comparison (2026-08-02)

T001 baseline inspected: `docs/delivery/work/baselines/feature-001-gomarkedit-product.md` and its
retained gate logs. Verification also inspected the immutable alias baseline
`docs/delivery/work/baselines/story-063.md`, because `just verify 001-gomarkedit-product` is wired to that
pre-edit baseline rather than the feature-named T001 capture.

| Command | Exit | Reliability | Findings | Comparison | Verdict |
| ------- | ---: | ----------- | -------- | ---------- | ------- |
| `just fmt-check` | 0 | clean | none | Matches T001 clean baseline; no new format drift remains. | PASS |
| `just typecheck` | 0 | clean | none | Matches T001 clean baseline; no new type errors. | PASS |
| `just lint` | 0 | clean | none | Matches T001 clean baseline; no new static-analysis findings. The first sandboxed rerun was `UNRELIABLE` (`no go files to analyze`), so the authoritative result is the host-cache rerun. | PASS |
| `just test` | 0 | clean | none | Matches T001 clean baseline; no new test failures. Final run passed 42 suites / 174 tests. | PASS |
| `just archtest` | 0 | clean | no blocking findings; frontend archtest reports stale reserve notices for `ViewModeToggle.tsx`, `AppShell.tsx`, and `EditorView.tsx` after their known allowed callsites disappeared | Matches T001 clean baseline at the gate level: architecture stayed green. Output is greener than T001 at the string-violation callsites, but the allowlist now over-reserves those files. | PASS |
| `just frontend-build` | 0 | clean | no blocking findings; Vite retained dynamic-import and chunk-size warnings, and the production-network guard passed | Matches T001 clean baseline; no new failing frontend-build findings. | PASS |
| `just build` | 0 | clean | none | T001 did not retain a `just build` row, so there is no direct T001 comparison. This is the additional current-host native-build gate required by T034, and it succeeded on `darwin/arm64`. | PASS |
| `just verify 001-gomarkedit-product` | 0 | clean | none | Compared against the immutable `story-063` verification baseline by contract, not the feature-named T001 row set. `M1` through `M6` all passed. | PASS |

Minimal repairs required before the final clean sweep were: formatting `internal/appmodel/service.go` and
`frontend/src/logic/adapter/appModelAdapter.ts`, removing the unused
`internal/appmodel/layout_repository_sqlite.go::layoutIdentityWins`, fixing the close-failure cleanup in
`main_test.go`, and updating stale frontend test fixtures/expectations so the current shell contract is what
the retained suites actually assert.

Retained raw outputs for the authoritative final T034 runs are bundled in
[`t034-final-gates/manifest.md`](t034-final-gates/manifest.md). The dirty-checkout patch audit is retained in
[`t034-scope-manifest.md`](t034-scope-manifest.md). The archtest raw log in that bundle intentionally keeps
the honest stale reserve notices for `ViewModeToggle.tsx`, `AppShell.tsx`, and `EditorView.tsx`.
