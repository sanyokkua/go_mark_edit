# Known issues

Real defects found by reading the code — items 1–8 on 2026-07-25, items 9–13 on 2026-07-28. None is
urgent today; each becomes a problem the moment the named phase starts. Fold each into the story that
touches it rather than fixing them as a batch.

Some entries record a **trajectory** rather than a defect, and say what would turn it into one.

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
`../spec/surface/mockup.html` shows three finished themes.

This is not a bug so much as a scheduling mistake — theming sat at phase 8 of 16. It is why the app
does not look like the mockup, and it is being moved to position 2.

Now that a colour-literal scan is part of `just archtest`, the scan passes trivially: there is nothing
to find because there is no colour anywhere. Phase 02 is where it starts doing work.

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

This is a refactor, not a specification change, which is why it lives here rather than in a decision
record.

## 9. CI only runs on a version tag — `just check` is a local-only gate

`.github/workflows/main.yml:3` triggers on `push` to tags matching `v*.*.*`, plus a manual
`workflow_dispatch`. **There is no pull-request trigger and no branch trigger.**

So the entire gate set — bindings drift, format check, lint, typecheck, frontend tests, `go vet`, race
tests — runs for the first time when someone cuts a release. Between releases the only thing standing
between a broken commit and the main branch is the developer remembering to run `just check`, and the
lefthook pre-push hook, which a `--no-verify` skips.

The fix is three lines: add `pull_request` and a branch `push` to the `on:` block. It is not done here
because it changes when work is blocked, which is the user's call rather than a documentation change.

## 10. `internal/gate` has no production caller

`internal/gate/gate.go` exists, is tested, and is imported by nothing outside its own test. It was
built in Phase 00 as a reserved seam.

That is deliberate, and it is recorded because an unused package with a passing test looks like working
infrastructure. Nothing has ever acquired it, so nothing has exercised the paths that matter — the
refusal when it is held, and the release on a failure or a cancellation. Its first real consumer is
whichever of Phase 10 or Phase 11 is built first, and that story is where those paths get their tests.

## 11. `settingsAdapter` has no consumer

`frontend/src/logic/adapter/` exposes the settings adapter methods, and nothing in `frontend/src/`
calls them. The four bound settings methods on the Go side are reachable only from a test.

Same shape as the entry above: the seam works as far as anything has asked it to. The settings dialog
arrives in Phase 03, and it is the first thing to find out whether the round trip is right.

## 12. `just package` does not exist

The specification's command vocabulary includes `package` — produce the distributable artifact — and
the `justfile` has no such recipe, because packaging is Phase 08.

Recorded because the gap is deliberate. A recipe that shells out to `wails build` and calls the result
"packaged" would let a Definition of Done certify something that has never been produced. `just package`
prints what phase introduces it and exits non-zero until Phase 08 replaces it.

## 13. Wails does not give a frameless window usable resize edges

**Not a defect in our code — an upstream limitation the specification now works around. Recorded so the
workaround is not mistaken for over-engineering and deleted.**

GoMarkEdit's window is frameless: `../spec/product/the-app-window.md#frameless-window`. Two open Wails
issues mean the platform's own resize borders cannot be relied on.

| Issue | What it does to a frameless window |
|---|---|
| [wails#1062](https://github.com/wailsapp/wails/issues/1062) | On Windows, a frameless window can have **no resize controls at all**. The user cannot resize it by any edge or corner. |
| [wails#1087](https://github.com/wailsapp/wails/issues/1087) | Where resize borders do exist, the resize cursor appears **too far inside** the window. The hit area overlaps controls near the edge and **swallows their clicks** — the button looks enabled and does nothing. |

Between them, relying on the platform gives three different broken behaviours on three platforms, and
the second failure mode is the nastier one because it presents as "this button is broken" rather than as
"resizing is broken".

**The mitigation, which is specified rather than optional:**
`../spec/product/the-app-window.md#the-window-has-its-own-resize-zones` — the app draws its own eight
zones, a 6-pixel band per edge and a 12-pixel corner square, with the matching cursor, above the content
and below every overlay, inert while maximised or full screen. The same reasoning covers
`#the-title-bar-is-the-drag-region` and `#double-clicking-the-title-bar-toggles-maximise`: a frameless
window gets none of those for free either.

`0028-window-chrome-and-native-menu.md` named this cost when it chose frameless — *"we own window
dragging, double-click-to-zoom, snap behaviour and the resize edges"* — and the specification did not
follow through until 2026-07-28.

**Do not delete the zones as redundant with the OS.** They are not redundant; on Windows there may be
nothing underneath them. Phase 03 builds them and **Phase 08 verifies them on all three platforms** —
verifying only on the development machine is what would let #1062 ship.
