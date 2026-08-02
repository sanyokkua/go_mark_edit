# T034 authoritative final gate bundle

Date: 2026-08-02

This bundle retains the raw outputs for the authoritative final T034 runs. Each log below is the exact
stdout/stderr captured for the retained run named in the table. The build log is the sequential rerun used
for evidence after one earlier parallelized build attempt raced `frontend/dist` and was discarded.

| Gate | Command | Exit | Reliability | Findings | Raw output |
| --- | --- | ---: | --- | --- | --- |
| fmt-check | `just fmt-check` | 0 | clean | none | [`fmt-check.log`](fmt-check.log) |
| typecheck | `just typecheck` | 0 | clean | none | [`typecheck.log`](typecheck.log) |
| lint | `just lint` | 0 | clean | none | [`lint.log`](lint.log) |
| test | `just test` | 0 | clean | none | [`test.log`](test.log) |
| archtest | `just archtest` | 0 | clean | stale frontend archtest reserve notices only for `src/ui/components/ViewModeToggle.tsx`, `src/ui/widgets/AppShell.tsx`, and `src/ui/widgets/EditorView.tsx`; gate remained green | [`archtest.log`](archtest.log) |
| frontend-build | `just frontend-build` | 0 | clean | non-failing Vite dynamic-import and chunk-size warnings; production-network guard passed | [`frontend-build.log`](frontend-build.log) |
| build | `just build` | 0 | clean | none | [`build.log`](build.log) |
| verify | `just verify 001-gomarkedit-product` | 0 | clean | none; `M1` through `M6` passed against the immutable `story-063` verification alias | [`verify.log`](verify.log) |

Notes:

- T001 retained-baseline comparison source: `docs/delivery/work/baselines/feature-001-gomarkedit-product.md`
- Verification alias source: `docs/delivery/work/baselines/story-063.md`
- A sandbox-only lint attempt earlier in T034 was `UNRELIABLE` with `no go files to analyze`; it is not
  retained here because this bundle is limited to the authoritative final runs.
