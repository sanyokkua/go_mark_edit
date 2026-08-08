# FT-VS-02 lifecycle barrier foundation — T010

Date: 2026-08-08

## Verified commands

- `npm --prefix frontend test -- --runInBand` — 57 suites, 286 tests passed.
- `GOCACHE=/private/tmp/gomarkedit-gocache GOLANGCI_LINT_CACHE=/private/tmp/gomarkedit-lint-cache just archtest` — Go architecture, CGO-free, migration, and frontend boundary checks passed.

## Contract evidence

- `createLifecycleBarrier` validates both document identity and activation token before queueing.
- The barrier captures one content/view pair, queues both, drains content before view, and returns the capture only after both drains succeed.
- A queue or content-drain failure rejects before a later view drain, so callers can leave the current identity installed.
- `useSyncedBuffer` exposes the activation-scoped imperative flush and uses it for blur; pane arrangement commands use the adapter's sequential combined drain when the barrier is not mounted.
