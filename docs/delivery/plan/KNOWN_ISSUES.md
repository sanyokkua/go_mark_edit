# Known issues

Real defects found by reading the code — items 1–8 on 2026-07-25, items 9–13 on 2026-07-28, items
14–17 on 2026-07-28 during the r1 → r2 specification upgrade. Each becomes a problem the moment the
named phase starts. Fold each into the story that touches it rather than fixing them as a batch.

**Item 14 is the exception: it is urgent, because it describes a shipped gap and a gate that could
not fail.**

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

## 6. The visual layer was empty — partly built by STORY-058, still incomplete

**Recorded 2026-07-25 as "the visual layer does not exist"; updated 2026-07-28 after STORY-058
shipped in `c8d88fe`.**

As found: `frontend/src/ui/styles/tokens.css` had 62 tokens and not one colour; the six colour-named
entries were `currentColor` or `inherit`. The app rendered in default browser colours while
`../spec/surface/mockup.html` showed three finished themes. That was a scheduling mistake — theming
sat at phase 8 of 16 — and it is why the app did not look like the mockup. It was moved to position 2.

As it stands now: `tokens.css` declares **108 distinct tokens** across **8 palette blocks** (`:root`,
which is Material light, plus `[data-theme='glass']`, `[data-theme='minimal']`, `[data-mode='dark']`
and the four theme×mode combinations), carrying **71 colour literals**.

The colour-literal scan in `just archtest` no longer passes trivially — it has 71 literals to check,
each of which must sit inside exactly one palette block. That entry meant "the gate cannot fail
because there is nothing to find"; it now means "the gate is doing work".

**Still incomplete.** Ten tokens the mockup uses have zero occurrences in `tokens.css`: `--canvas`,
`--elevated`, `--surface-2`, `--surface-3`, `--stroke`, `--stroke-soft`, `--muted`, `--faint`,
`--hover` and `--user-bubble`. They are exactly the ten rows missing from STORY-058's copy of
`../spec/product/themes-and-appearance.md#theme-identity-is-stable` — see item 14. STORY-062 closes
this.

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

## 12. `just package` is a deliberate exit-1 stub until Phase 08

The specification's command vocabulary includes `package` — produce the distributable artifact — and
there is nothing behind it, because packaging is Phase 08.

Recorded because the gap is deliberate. A recipe that shells out to `wails build` and calls the result
"packaged" would let a Definition of Done certify something that has never been produced. So
`justfile:141` defines `package` as a recipe that prints the phase introducing it and **exits 1**.

An honest stub is not the same as an absent recipe: `just package` fails loudly and says why, rather
than failing with `error: Justfile does not contain recipe 'package'`, which reads as a typo.

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

## 14. STORY-058 was built from a truncated rule copy, against a static-analysis gate that never ran

**Two failures that hid each other. Found 2026-07-28 by `scripts/check_story.py` and
`scripts/upgrade_check.py`, which did not exist when the story was built.**

**The copy.** `docs/delivery/work/story-058-choose-and-persist-six-app-palettes.md` copied
`../spec/product/themes-and-appearance.md#theme-identity-is-stable` with **11 of the rule's 24 table
rows**. The implementer built exactly what was in front of them. The ten tokens named only in the
missing rows have **zero occurrences** in the shipped `frontend/src/ui/styles/tokens.css`:

Counted as `var(--token)` references in `../spec/surface/mockup.html`, and as any occurrence at all in
`frontend/src/`. Each of the ten is declared six times in the mockup — once per palette.

| Token | Anywhere in `frontend/src/` | `var()` uses in the Tier-A mockup |
|---|---|---|
| `--canvas` | 0 | 2 |
| `--elevated` | 0 | 9 |
| `--surface-2` | 0 | 16 |
| `--surface-3` | 0 | 9 |
| `--stroke` | 0 | 40 |
| `--stroke-soft` | 0 | 43 |
| `--muted` | 0 | 46 |
| `--faint` | 0 | 54 |
| `--hover` | 0 | 9 |
| `--user-bubble` | 0 | 1 |

The eleven rows that *were* copied are all present, 2–3 occurrences each. `check_story.py` finds
truncation in eight further rules in the same story, and flags the story as oversized: **9 rules
against a ceiling of 5**.

**The gate.** `docs/delivery/work/baselines/story-058.md` recorded `just lint` → **exit 5** with
**0 findings**. That combination means the gate crashed or parsed nothing — it did not run clean. It
was recorded as "0 static-analysis findings at baseline", so every later `comm -13` diffed empty
against empty and printed PASS. M3 of the Definition of Done was never satisfied for that story; it
could not have failed.

Nothing downstream could see either problem, because nothing counted table rows and nothing checked
exit codes.

**What was done about it, 2026-07-28:**

- `scripts/baseline.sh` now records every gate's exit code and classifies it; a non-zero exit with
  zero findings is marked `UNRELIABLE` and the script exits 3.
- `scripts/verify.sh` refuses outright to verify against an `UNRELIABLE` baseline, and against any
  baseline captured before exit codes were recorded.
- `just lint` exits 0 today (`0 issues.`), so STORY-058's baseline was re-captured with the new script.
- `scripts/check_story.py` is wired into `/plan-story` and `/build-story` as a hard stop.

**What is still owed:** the ten tokens. **STORY-058 is not re-planned** — a built story is the honest
record of what was built, and rewriting it to look correct after the fact destroys that record. The
gap is **STORY-062**, which ships the ten tokens across all eight palette blocks and is built before
STORY-059. STORY-059 generates editor themes from the surface palette; building it on an incomplete
palette would repeat this failure one layer up.

## 15. `just archtest` runs in no CI job

`.github/workflows/main.yml:31-46` lists eight `just` steps — `gen-check`, `frontend-build`,
`fmt-check`, `lint`, `typecheck`, `frontend-test`, `go-vet`, `go-test`. **`just archtest` is not
among them.**

That is M5 of the Definition of Done: the one item never diffed against a baseline, because it is the
only mechanical thing standing between an implementer and a design decision nobody approved. It is
enforced by `just check` and by `verify.sh` locally, and by nothing at all in CI.

Combined with item 9 — CI triggers only on a version tag — the architecture rules are checked only on
a developer's machine, by a developer who chose to run the command. The four checks it bundles
(`go-archtest`, `cgo-free-check`, `migration-immutability-check`, `frontend-archtest`) include the
CGO-free guarantee that every non-host build depends on.

The fix is one step in the `test` job. It is not done here because adding a step changes when work is
blocked, which is the user's call rather than a documentation change — the same argument as item 9.

## 16. A user-visible string disagrees between the specification and the code

| Where | Text |
|---|---|
| `../spec/product/the-app-window.md` (When things go wrong) | `GoMarkEdit could not start` · `GoMarkEdit could not initialize its local settings. Please try again.` |
| `../spec/product/settings.md` (When things go wrong) | the same two strings |
| `frontend/src/i18n/locales/en.json:14` (`startup.failure.message`) | `The application could not start. Try again.` |

The shipped screen says "The application", not "GoMarkEdit", and drops the sentence naming what
failed — which is the part that tells a user where to look.

`spec/` is normative, so **the code is the defect.** It is recorded rather than fixed because the
standard is that a disagreement is raised and approved, not resolved by a commit — and because
`en.json` is nobody's story right now. **Neither side was changed on 2026-07-28.**

It belongs to the phase that touches bootstrap and the startup-failure screen: **Phase 03**, which
also builds the settings dialog and redraws `StartupFailure.tsx`. Resolve it there, in one direction,
with the reason recorded.

## 17. 114 `Proves:` tags name rules that do not exist

**Found 2026-07-28 by `scripts/check_proves.py`, which did not exist before the r2 upgrade.** It is
now M12 of the Definition of Done and it fails `just verify` today.

Every test's first comment line is supposed to carry `// Proves: <feature>#<anchor>`, and the anchor
is supposed to exist in `../spec/`. **114 tags across 25 files resolve to nothing**, in three groups:

| Shape | Count of distinct tags | Example | Why it resolves nowhere |
|---|---|---|---|
| `STORY-NNN-AC-#N` | most of them | `STORY-011-AC-#3` in `internal/appmodel/service_test.go:72` | The retired story format numbered acceptance criteria per story. Those stories are archived and the numbering scheme is gone. |
| `EC-<AREA>-#N` | 2 | `EC-I18N-#1` | The retired edge-case registry, removed with the design-decision registry on 2026-07-25. |
| `all#end-to-end` | 1 | `frontend/src/ui/widgets/AppearanceControls.test.tsx:61` | Never an anchor at all. STORY-058's Definition of Done had a literal `all, end to end` row and it was transcribed into the tag. |

Only **19 rules** in the whole specification are claimed by any tag.

**Why it matters, and why it is not urgent.** The tests themselves pass and test real behaviour; the
tag is a comment. What is lost is the ability to answer *"which test proves this rule?"* — which is the
question `/finish-phase` step 2 asks for every rule in every story, and the question that catches a
rule nobody tested. A tag pointing at nothing reads as coverage and is not.

**Why it is not fixed here.** Each tag needs a decision about which rule the test actually proves, and
some tests will turn out to prove no rule that survived the conversion. That is `/reconcile` work with
the code in front of you, not a mechanical rename — and mechanically rewriting a tag to the
nearest-looking anchor would produce exactly the false coverage this check exists to detect.

**Where it goes.** `/reconcile 02`, for the tests Phase 02 touched. Earlier phases' tags are resolved
by the phase that next changes the file. Until then M12 fails, and that is the correct reading: the
tags do not resolve.
