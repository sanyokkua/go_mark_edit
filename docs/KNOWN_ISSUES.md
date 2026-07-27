# Known issues

Real defects found by reading the code on 2026-07-25. None is urgent today; each becomes a problem
the moment the named phase starts. Fold each into the story that touches it rather than fixing them
as a batch.

## 1. A second `state:patch` subscriber is silently discarded

`frontend/src/logic/adapter/appModelAdapter.ts:374` — when a subscription already exists,
`subscribeStatePatches` returns the *existing* dispose function and throws the new callback away.

Harmless today because there is exactly one consumer. The files phase adds two more (tab/save state,
external-change detection), and they will simply never receive events. Needs a registered-listener
set with independent disposal.

## 2. The empty tab set will panic

`internal/appmodel/service.go:72` and `:82` dereference `activeDocument` unconditionally. Safe only
because Phase 01 guarantees exactly one document always exists.

ADR-0021 requires a genuine zero-document state with `activeDocument` and `activeBuffer` absent
rather than empty placeholders. Closing the last tab hits this.

## 3. The dev bridge mock disagrees with the Go backend about "dirty"

`frontend/src/dev/bridge-mock/go/appmodel/AppModelHandler.ts` computes dirty as `content.length > 0`.
Go computes `content != baseline` (`internal/appmodel/document.go:64`). There is no parity test.

This matters more than it looks: `frontend/playwright.config.ts:19` launches `npm run dev`, which
aliases `wailsjs/*` to the mock — so **every** Playwright run and every visual snapshot exercises the
mock, not the real backend. The divergence grows with each feature the files phase adds.

## 4. The three-region shell is tested against a mock of itself

`frontend/src/App.test.tsx:13` installs `jest.mock('./ui/widgets/AppShell')` returning a hand-written
stub. The assertions at `:181` and `:214` — which claim to prove the reserved Stage-3 region stays
empty — run against that stub. The real `AppShell` is never rendered by any test, and there is no
`AppShell.test.tsx`.

A regression in the real shell (a lost region, content leaking into the reserved slot) passes today.

## 5. Line-ending and encoding labels fall back to raw catalog keys

`frontend/src/ui/components/StatusBar.tsx:14` derives its key as
`status.lineEnding.${value.toLowerCase()}`. `frontend/src/i18n/locales/en.json` contains only
`utf-8` and `lf`.

Open a CRLF file — which the files phase makes possible — and the status bar displays the literal
string `status.lineEnding.crlf`.

## 6. The visual layer does not exist

`frontend/src/ui/styles/tokens.css` has 62 tokens and not one colour; the six colour-named entries
are `currentColor` or `inherit`. The app renders in default browser colours while
`specification/mockups/gomarkedit-mockup.html` shows three finished themes.

This is not a bug so much as a scheduling mistake — theming sat at phase 8 of 16. It is why the app
does not look like the mockup, and it is being moved to position 2.

## 7. A database test is flaky under CPU contention

`internal/db/database_test.go:180` — `TestOpenRejectsCorruptOrUnsupportedSchemaSafely`, the
`EC-SET-2 concurrent processes converge` subtest. It spawns helper processes that race to open a
corrupt database; under load one of them can lose the race and get `database is locked (SQLITE_BUSY)`
instead of the expected convergence.

Green single-shot, and it reproduces about 3 times in 60 iterations under contention:

```bash
go test -count=60 -run TestOpenRejectsCorruptOrUnsupportedSchemaSafely ./internal/db/
```

Pre-existing, unrelated to any current change. A shared CI runner is exactly the environment that
trips it, so it will surface as an intermittent red build before it surfaces anywhere else. The fix is
probably a bounded retry in the helper rather than a longer timeout.

## 8. `internal/apperr` will become the shared-DTO dumping ground

**Not yet a defect — a trajectory, recorded so it is noticed at the point it starts costing.**

The rule "`internal/apperr` imports no other internal package" is correct and enforced by
`internal/apperr/architecture_test.go`. Its side effect is that every type needing to cross a package
boundary gets pushed *into* `apperr` to dodge an import cycle, because `apperr` is the only package
everything may already import.

The reference application this architecture came from shows where that ends: its `apperr` owns not just
`AppError`/`WireError` but a provider-preset type, an action-metadata type, a history-entry type, a
prompt-preview request, and twenty-four `*Result` envelopes — plus two functions in its composition root
whose entire job is copying a `db.ProviderPreset` into an `apperr.ProviderPreset` so the persistence
package can stay free of `apperr` imports.

GoMarkEdit is on the same path: `02_BACKEND_GO.md` and `01_MODULE_INVENTORY.md` both describe
`internal/apperr` as owning *"all `*Result` + DTOs"*, and the assistant phases add a large number of
payload types.

**The fix, when it is worth doing:** split into `internal/apperr` (`AppError`, `ErrorCode`, `WireError`,
`ToWire` — errors only) and a second leaf package (`internal/wire`) for the `*Result` envelopes and
cross-package DTOs. Both stay at the bottom of the import graph; neither becomes a dumping ground.

**The trigger:** the first time a *non-error* type is added to `apperr` purely to break an import cycle
between two packages that are not `apperr`. Doing it before then is churn; doing it during the assistant
phases is a painful refactor across a much larger surface.

This is a refactor, not a specification change, which is why it lives here rather than in an ADR.
