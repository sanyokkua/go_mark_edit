# FT-VS-01 — T009 real surfaces

Date: 2026-08-08

## Verified commands

- `npm --prefix frontend test -- --runInBand` — 56 suites, 279 tests passed.
- `npm --prefix frontend run verify:ui -- e2e/real-files-and-tabs.test.ts --grep 'FT-VS-01'` — 1 Chromium test passed.
- `GOCACHE=/private/tmp/gomarkedit-gocache GOLANGCI_LINT_CACHE=/private/tmp/gomarkedit-lint-cache just archtest` — architecture, CGO-free, migration, and frontend boundary checks passed.

## Observations

- The mock/production adapter contract carries typed New/Open outcomes, including the ordinary Open cancellation result, without placing document source in the projection.
- File-menu New/Open controls are enabled, accessible, and routed through the registry and focused application dispatcher; downstream File actions remain unavailable.
- Accepted preview content is measured as UTF-8 bytes: 2,097,152 bytes remains rendered, larger accepted content pauses, Refresh Preview coalesces duplicate runs, stale revisions are rejected, and failed refresh remains paused with `io-failure` and Retry.
- Native dialog cancellation and the raw-byte ingress boundaries are covered by the T008 composition evidence and T005 file-reader tests; T009 consumes those authoritative results through the generated bridge.
