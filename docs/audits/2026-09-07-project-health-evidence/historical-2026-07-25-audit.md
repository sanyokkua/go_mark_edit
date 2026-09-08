# Audit — Phase 00 / Phase 01 completion vs. Phase 02 ticket coverage

**Date:** 2026-07-25
**Branch:** `feature/v1-implementation`
**Revision audited:** `39efb7aef099042a37f70925fca8cf42e282d103` ("Phase 02 planned")
**Author:** architect
**Scope:** read-only audit. Everything below was measured on the branch, not inferred from story prose.

---

## 1. Summary

The product code for Phase 00 and Phase 01 is genuinely built and genuinely tested. Every permanent
requirement in both phase ledgers maps to real implementing code, a `done` story, and named passing
tests.

Two things are nevertheless not true today:

1. **The branch is red.** `go test ./...` fails two tests, so `just check` fails, and three blocking
   Phase 00 exit-evidence rows name `just check` as their proof.
2. **Phase 01 no longer passes its own completion gate.** `just phase-complete-check 01` exits 1
   because planning Phase 02 invalidated Phase 01's two human-signed evidence records.

The Phase 02 ticket set (stories 033–051) has complete requirement and edge-case coverage — no
orphans — but contains a set of ownership holes, missing acceptance criteria, and dependency gaps,
and nothing in it repairs the broken Phase 01 gate.

---

## 2. Measured gate status

| Gate | Command | Result |
|---|---|---|
| Traceability | `node scripts/trace-check.mjs` | PASS (exit 0) |
| Phase structure | `node scripts/phase-check.mjs` | PASS — 16 phase documents valid |
| Phase 00 completion | `node scripts/phase-complete-check.mjs 00` | PASS |
| Phase 01 completion | `node scripts/phase-complete-check.mjs 01` | **FAIL (exit 1)** |
| Phase 01 preview checkpoint | `… 01 --checkpoint preview` | PASS |
| Phase 01 editing checkpoint | `… 01 --checkpoint editing` | PASS |
| Phase 02 completion | `node scripts/phase-complete-check.mjs 02` | FAIL (expected — phase unstarted) |
| Go tests | `go test ./...` | **302 pass, 2 FAIL** |
| Frontend tests | `jest` | PASS — 27 suites / 100 tests |
| Typecheck | `tsc --noEmit` | PASS |
| `go vet` / `gofmt -l` | — | clean |

Phase 01 failure output:

```
phase-complete-check: PH01-E06 current-host exception revision is stale
phase-complete-check: PH01-E07 visual approval revision is stale
```

---

## 3. Phase 00 — requirement coverage

All 12 requirements have real code, a proving test, and a `done` story.

| ID | Plain meaning | Implemented | Code | Story |
|---|---|---|---|---|
| PH00-R01 | Native process boots a blank embedded React app through one composition root | yes | `main.go:19`, `main.go:48`, `internal/application/application_context_holder.go:36` | STORY-001 |
| PH00-R02 | Concrete Result envelopes; no error cause crosses the bridge | yes | `internal/apperr/results.go`, `internal/apperr/wire.go:20`, `internal/settings/handler.go:27` | STORY-002, 005 |
| PH00-R03 | Two-phase DI, pre-DB logging, dev-isolated paths, terminal init failure → dialog + non-zero exit | yes | `main.go:28`, `main.go:87`, `application_context_holder.go:67` | STORY-003, 005, 009 |
| PH00-R04 | Pure-Go SQLite, additive migrations, WAL + busy timeout, no single-instance lock | yes | `internal/db/db.go:20`, `:137`, `:215`, `:261` | STORY-004 |
| PH00-R05 | Typed settings registry, growable, per-scalar fallback | yes | `internal/settings/model.go:39`, `repository_sqlite.go`, `handler.go` | STORY-005, 009 |
| PH00-R06 | Frontend talks only through adapter singletons | yes | `frontend/src/logic/adapter/index.ts:1`, `envelope.ts:10`, `bridgeGuard.ts` | STORY-006 |
| PH00-R07 | Shell reserves the Stage-3 right region; token-only styling | **partial** | `ui/widgets/AppShell.tsx:16`, `ui/styles/tokens.css` | STORY-007 |
| PH00-R08 | Dev works with the real bridge or the backend-free mock | yes | `frontend/vite.config.ts:8`, `src/dev/bridge-mock/**` | STORY-006 |
| PH00-R09 | Reproducible fmt/lint/type/test/build/gen/trace gates | yes | `justfile`, `.github/workflows/main.yml`, `lefthook.yml` | STORY-008, 010 |
| PH00-R10 | ADR-0001…0006 accepted, indexed, not duplicated | yes | `specification/08_Decisions/`, `docs/adr/README.md` | STORY-008, 010 |
| PH00-R11 | Dependency-free generic single-flight gate, no consumer yet | yes | `internal/gate/gate.go:10` | STORY-003 |
| PH00-R12 | Story/trace/phase validators enforce schema and completion | **partial** | `scripts/*.mjs` | STORY-024, 033 |

### PH00-R07 is proven against a mock of itself

`frontend/src/App.test.tsx:13` installs `jest.mock('./ui/widgets/AppShell')` returning a hand-written
three-`aside`/`main` stub. The import at line 133 resolves to that stub, so the assertions at
`App.test.tsx:181` (STORY-007-AC-1, collapsed three-region shell) and `:214` (STORY-007-AC-3, reserved
region stays empty) never render the real `AppShell`. There is no `AppShell.test.tsx`. The only genuine
non-mocked proof of R07 is the token file-read check in `ui/styles/tokens.test.ts:13`.

The same applies to `App.test.tsx:170` (STORY-001-AC-2, "renders the blank application root"): it
asserts `getByRole('main')` is empty on the stub. The real shell always renders `<EditorView />` inside
`<main>`; it happens to return `null` with no active buffer, so the claim is incidentally true but is
not what the test measures.

Note also that `tokens.css` currently defines **no colour tokens at all** — only layout, spacing and
font values — so the "no hardcoded colour" assertion passes vacuously. This is in-scope for Phase 00
(production theme values are explicitly out of scope), but it means "token-only styling" is proven for
four `--shell-*` layout tokens only.

### PH00-R12 is proven by a failing test

`internal/application/phase_validation_test.go:531`
(`TestRepositoryPhaseMigrationIsCompleteAndTruthful`, proving STORY-024-AC-6) is the **only** done-story
proof of PH00-R12, and it fails — see §5.

---

## 4. Phase 01 — requirement coverage

All 16 requirements have real code, a proving test, and a `done` story. Both implementation checkpoints
pass. Partial requirements:

| ID | Plain meaning | Status | Detail |
|---|---|---|---|
| PH01-R04 | Flush pending buffer before blur/switch/close; buffer + view before hiding the editor | **partial** | Blur (`frontend/src/logic/hooks/useSyncedBuffer.ts:151`) and hide (`frontend/src/logic/store/docViewCommands.ts:65`) exist. Switch / close / save flushes do not — there are no tabs or saves in Phase 01. Phase 02's `PH02-C01` contract assumes the seam already exists. |
| PH01-R10 | A non-editor sibling can consume the document-command seam | **partial** | `frontend/src/ui/widgets/editorSession.ts:47` provides the context and it is wired in `App.tsx:74`, but no production sibling consumes it — only test siblings. Acceptable for Stage 1/2; PH05/PH12 are the first real consumers. |
| PH01-R12 | Preview debounced; stale completions discarded; very large input may pause | **partial** | Debounce (`appModelAdapter.ts:249`) and generation guard (`useLivePreview.ts:36`) exist. `editor.pauseLivePreview` and any large-file threshold do not exist anywhere in the repository. |
| PH01-R16 | Core status strings resolve through the bundled i18n catalog | **partial** | The catalog and active → en → key fallback work (`i18n/catalog.ts:70`). Hardcoded English remains in `ui/components/ViewModeToggle.tsx:5`, `ui/widgets/EditorView.tsx:166`, and `ui/widgets/AppShell.tsx:18`. |

The remaining twelve requirements (R01, R02, R03, R05, R06, R07, R08, R09, R11, R13, R14, R15) are
fully implemented with substantial test coverage — R01 has 18 collected tests, R08 has 19.

---

## 5. Why the branch is red — one root cause, two symptoms

`docs/phase-evidence/PH01-wails-runtime.md:6` and `docs/phase-evidence/PH01-visual-approval.md:6` both
pin revision `2b20decffb0686d70d3f41fb6c9c5e4b456ce25c`.

`scripts/phase-complete-check.mjs:32-50` accepts an ancestor revision only when **every** file changed
since it is on this allowlist:

- `docs/phase-evidence/**`
- `docs/stories/README.md`
- `docs/stories/story-032-produce-phase01-completion-evidence.md`
- `docs/traceability.yaml`

Commit `39efb7a` added 19 story files (`story-033` … `story-051`) and 6 ADRs (`0020`…`0025`). None are
on the list. **Planning Phase 02 revoked Phase 01's completion claim**, and it will do so again on the
next commit that touches anything else.

The second symptom is the Go test. `phase_validation_test.go:538-546` hardcodes the blocker list Phase
01 was expected to emit:

```
"PH01-E06 current-host exception revision is stale"
"PH01-E07 visual approval must be explicitly approved"
"acceptance criterion is not proven by a done story"
```

The last two were resolved by STORY-032. The checker now emits the two *stale-revision* blockers
instead, so the assertion fails. The test is factually out of date as well as failing.

Knock-on effect: `PH00-E02`, `PH00-E05` and `PH00-E06` all name `just check` as their blocking proof
(`specification/07_Phases/PHASE_00_SCAFFOLD.md:101,104,105`), and `just check` runs `just go-test`.
`phase-complete-check 00` does not notice, because for automated evidence it only verifies that the
recipe exists and that the named test string is present in the file (`phase-complete-check.mjs:338-362`)
— it never executes anything.

---

## 6. Evidence-quality findings

### 6.1 Phase 00 runtime evidence is stale and under-specified

`docs/phase-evidence/PH00-runtime.md` is the artifact for both blocking real-runtime rows PH00-E01 and
PH00-E09, whose freshness cell reads `current HEAD`.

- Line 3 records `**Revision:** feature/v1-implementation@c7771c8 plus unstaged process remediation` —
  not a resolvable revision, and it explicitly includes uncommitted work. `c7771c8` is 19 commits behind
  HEAD, with 157 files changed since, including `justfile`, `internal/appmodel/document.go`,
  `frontend/src/App.tsx` and `tokens.css`.
- It does not name its own evidence ids (`PH00-E01` / `PH00-E09`), which `docs/phase-evidence/README.md:7`
  requires, and it carries no `Limitations` or deferred-platform note despite being macOS-only.
- Contrast `docs/phase-evidence/PH01-wails-runtime.md:1-16`, which does all of this correctly.
- The staleness check exists but is wired only to PH01-E06 and PH01-E07
  (`phase-complete-check.mjs:71,98`). For Phase 00 the validator asks only for a `Status`, a non-empty
  `Owner`, *any* non-empty `Revision`, and a well-formed `Date`. The `current HEAD` obligation is
  documentation-only.
- There is no accepted ADR deferring Windows/Linux runtime proof for Phase 00 — ADR-0016 is scoped to
  Phase 01.

### 6.2 PH01-E08 has no artifact

The dedicated clean-host packet capture was removed from the completion gate by ADR-0018. Offline
behaviour is proven only at the jsdom level (`logic/markdown/renderer.test.ts:59,194`,
`ui/components/MarkdownView.test.tsx:93`) plus the Go import scan in
`internal/application/architecture_test.go:16`. This is a deliberate, recorded trade-off, not a defect.

### 6.3 Playwright runs against a mock, not the Go backend

`frontend/playwright.config.ts:19` launches `npm run dev`, which aliases `wailsjs/*` to
`frontend/src/dev/bridge-mock/**` (`vite.config.ts:10-26`).
`frontend/src/dev/bridge-mock/go/appmodel/AppModelHandler.ts` is a hand-written TypeScript
reimplementation with divergent semantics — its dirty rule is `content.length > 0`, while the Go rule is
`content != baseline` (`internal/appmodel/document.go:64`). There is no parity test.

Consequence: PH01-E02, PH01-E03 and the PH01-E07 screenshot never exercise `internal/appmodel`. This
degrades fastest in Phase 02, which adds tabs, saves, autosave and external-change detection to the
mock's surface.

### 6.4 CI does not gate branches

`.github/workflows/main.yml` triggers only on `v*.*.*` tags and `workflow_dispatch`. It runs
`gen-check → frontend-build → fmt-check → lint → typecheck → frontend-test → go-vet → go-test →
trace-check` — never `phase-check`, never `phase-complete-check`, never `verify-ui`. `just check`
locally does include `phase-check`, so the local composite and CI have diverged by one gate. Every
phase gate is effectively a local, manual ritual.

---

## 7. Phase 02 ticket set — coverage is complete

Verified by inverse-coverage matrix over `specification/07_Phases/PHASE_02_FILE_IO_TABS.md`:

- **All 13 requirements** `PH02-R01` … `PH02-R13` are claimed by at least one story.
- **All 18 primary edge cases** (`EC-DOCS-2/3/5/6/7/8/9/10/11/13`, `EC-TABS-1`…`EC-TABS-7`, `EC-SET-4`)
  plus the precursor `EC-DOCS-1` are owned and have a named proving test in a story test plan.
- **All 8 transitions** `PH02-T01`…`T08` and **all 5 contracts** `PH02-C01`…`C05` have at least one
  implementing story.
- **All 9 exit-evidence rows** `PH02-E01`…`E09` are claimed by STORY-051.
- The `depends_on` graph is acyclic and correctly ordered; every prerequisite in stories 001–032 is
  `done`.
- Every story is estimated M with 4–6 acceptance criteria. Every spec-clause anchor resolves; every
  `modules:` entry exists in the module inventory; every AC carries a `Satisfies:` marker; the
  `phase_requirements` list equals the AC-`Satisfies:` union in all 19 files; body section order matches
  the story format everywhere.

This is a well-built backlog. The findings below are refinements, not a rewrite.

---

## 8. Phase 02 ticket set — defects

### 8.1 Blocking / structural

**D-1 — Nothing repairs the red Phase 01 gate.**
STORY-033-AC-4 instead freezes today's outcomes ("Phase 01 resolution, checkpoint, exception, and
completion fixtures retain their existing accepted outcomes"), and its Definition of Done asserts
"Phase 01 checkpoint and completion validation remains green" — which is false at HEAD.

**D-2 — ADR-0025 fixes evidence-revision staleness for Phase 02 only.**
The identical Phase 01 defect that is failing right now is unaddressed. ADR-0019's path allowlist was
never widened.

**D-3 — Phase 02 cannot be completed on a macOS-only machine.**
`PH02-E07` demands real macOS + Windows + Linux runtime proof, and
`docs/stories/story-051-produce-phase02-completion-evidence.md:100,137,178` explicitly forbids a
current-host waiver. Phase 01 had one via ADR-0016; Phase 02 has none. Only macOS is available during
development.

**D-4 — The normalization-authorization issuer is unowned.**
ADR-0024:49-51 says the backend issues a single-use authorization bound to document identity, canonical
content revision, and the chosen normalization. Three stories *consume* it — STORY-037-AC-5 (validates),
STORY-040-AC-4 (obtains), STORY-044-AC-5 (gathers) — and none creates it. Each of 037 and 044 has
committed to exactly one aggregate exported seam (`ApplySave`, `ApplyClose`) that excludes issuance.

**D-5 — The backend Open composition is unowned.**
STORY-034 owns the native dialog primitive; STORY-035 scopes itself to a path-based command and pushes
"native UI command wiring" to STORY-039 (`story-035:64`); STORY-039 is `logic/adapter/`, `logic/store/`,
`ui/widgets/`. The Go handler that runs the dialog and then calls the open command falls between all
three.

### 8.2 Missing acceptance criteria

**D-6 — "New files use UTF-8" (PH02-R03) has no AC anywhere.**
STORY-035-AC-1 creates "one empty, never-saved Editor document" and says nothing about encoding, BOM, or
line ending. STORY-034 handles read classification only. ADR-0024 defines suffix and round-trip policy
but never the default for a document that has never touched disk. The first Save As of a new document is
therefore undefined.

**D-7 — PH02-R07's definition of dirty is never asserted.**
The phase text says dirty is *computed* from canonical backend content versus disk content. Every story
treats dirty as a stored flag. No AC states the equality rule or proves that editing back to the on-disk
bytes clears dirty.

**D-8 — PH02-R12's four-route precedence matrix is proven at one route.**
`PH02-E06` demands a matrix over dialog, OS, drop and tree. Only STORY-035-AC-5 claims it, reduced to
"one path-based service command is reusable by dialog, OS, drop, and tree producers". Three of the four
producers do not exist in Phase 02 (OS association → PH07, tree → PH03, drop unbuilt). This is an honest
limit of the phase, but the evidence row will be signed off on a shared-function test.

**D-9 — PH02-C05 (metadata/content accessors for the PH04 reader and PH06 export) has no producing AC.**
Only STORY-051-AC-6 sweeps it up as evidence.

### 8.3 Dependency and ownership

**D-10 —** STORY-040 claims PH02-R08 and asserts autosave ineligibility for read-only and
normalization-pending documents (AC-2, AC-3), which is the same rule STORY-048-AC-3 asserts. Neither
story depends on the other; 040's `depends_on` omits both 047 and 048.

**D-11 —** STORY-040-AC-4 hands a normalization authorization to STORY-037's canonical save command
without depending on STORY-037. The story format explicitly requires a UI story to depend on the backend
story supplying its bound methods.

**D-12 —** STORY-048 relies on STORY-042's pre-save external check (042-AC-1 owns the check "immediately
before a manual or autosave write proceeds") but 042 is missing from its `depends_on`.

**D-13 —** STORY-039-AC-5 and STORY-041-AC-5 both assert the zero-document state. They are in different
test files — 039 proves the projection in `logic/store/appModelProjection.test.ts`, 041 proves the render
in `ui/widgets/EditorView.integration.test.tsx` — so this is layered coverage rather than duplication, and
ordering is safe because 041 depends on 039. What is missing is only the stated boundary: `EC-TABS-5` is
declared by 036 and 041 but not 039, so 039 makes an untagged claim on adjacent behaviour. Low severity.

### 8.4 Hygiene

**D-14 — Superseded ADR-0020 still cited in prose** at `story-042:67`, `story-045:73`, `story-046:68`
(`ADR-0014/0020`). Front-matter is correct everywhere — all cite ADR-0024. ADR-0023 is correctly absent.

**D-15 — Composition-root module not declared.** STORY-034/035/036/037/038/044 all state that bound
handler wiring "remains in `internal/application`" but none lists `internal/application/` in `modules:`.
Only 033, 046 and 051 declare it.

**D-16 — Go edge-case markers will not register.** Go-side test plans encode edge ids in the test
function name (`…_EC_DOCS_10`). The tracer only recognises the hyphenated form `EC-DOCS-10` inside a
`// Evidence:` comment or a Jest test name (`scripts/trace-common.mjs:17,176`). Only STORY-034's
Definition of Done mentions the marker. `just trace-check` will catch this, but it is avoidable rework in
035, 037, 044 and 046.

**D-17 — Frozen phase evidence paths diverge from story test plans** for EC-DOCS-2, EC-DOCS-3,
EC-DOCS-11, EC-TABS-3, EC-TABS-4, EC-TABS-5 and EC-TABS-6. Example: the phase names
`internal/docs/service_test.go::TestExternalModification` for EC-DOCS-2; STORY-038 puts it in
`internal/appmodel/external_change_test.go`. The tracer does not compare against the phase Evidence
column, so this drifts silently — but STORY-033-AC-2 will bake the story paths into the resolution
record and leave the frozen ledger permanently wrong.

**D-18 — Sizing.** STORY-041 is really two stories: the tab bar (AC-1…AC-5) and new app-chrome
New/Open/Save/Save As controls (AC-6). STORY-051 depends on 18 stories, covers 9 evidence rows, and needs
real native runs plus human approval — it is a phase gate, not an M coding session.

**D-19 — STORY-040-AC-2 asserts that Format and Lint are unavailable.** Those features arrive in Phase
05. The assertion is vacuous today and will not detect a regression when they land.

**D-20 — STORY-033 does not say that `checkpoints` becomes optional.** `scripts/phase-resolution.mjs:394`
requires an exact `checkpoints` key with `preview`/`editing` and hardcodes the Phase-01 required ids.
Phase 02 has no checkpoints. The generalization is implied by AC-4 but never specified.

### 8.5 Consistency with the corrected lifecycle policy

Stories 034–051 are consistent with **ADR-0024**, not the superseded ADR-0020, on substance. Every
0024-specific correction appears: suffixless Save As appends `.md` (034-AC-5), single-use normalization
authorization (037-AC-5, 040-AC-4, 044-AC-5), read-only documents get Reload-only with no Keep-mine token
(038-AC-4, 043-AC-1), the seven-way Keep-mine invalidation set (038-AC-5), close plans include clean tabs
(044-AC-2), and a fresh plan is required after partial failure (045-AC-4). Only the prose citations in
042/045/046 are stale (D-14).

Note that the frozen phase document still says PH02-R04 "is not implemented", multi-dirty close "remains
blocked", and R12/R13 are blocked, while stories 040/043/044/045/046 implement all of it. This is the
sanctioned unblocking mechanism (an accepted ADR plus a resolution record), but nothing in the story
bodies flags the contradiction for a reader who opens only the frozen phase document.

---

## 9. Phase 01 gaps that Phase 02 inherits

1. **DTOs are not zero-document-capable.** ADR-0021 requires `activeDocument` / `activeBuffer` to become
   optional so a true zero-document state exists with no phantom Untitled. Today `apperr.ActiveBuffer`
   (`internal/apperr/results.go:119`) and `AppStateSnapshot` (`:111`) are non-optional, and
   `internal/appmodel/service.go:72,82` dereferences `activeDocument` unconditionally — it will panic on
   an empty tab set. Stories 035/036/039/041 assume the change; no story owns the DTO edit.
2. **`subscribeStatePatches` silently drops a second subscriber.**
   `frontend/src/logic/adapter/appModelAdapter.ts:374` returns the *existing* dispose function and
   discards the new `onPatch` callback when a subscription already exists. Harmless with one consumer;
   Phase 02 adds tab, save and external-change listeners.
3. **Line-ending and encoding i18n keys are missing.** `ui/components/StatusBar.tsx:14` derives
   `status.lineEnding.${value.toLowerCase()}`; `en.json` has only `utf-8` and `lf`. A CRLF or UTF-16
   document will render the raw key string. Phase 02 introduces exactly those documents.
4. **PH01-R04's switch/close/save flush half is unbuilt** while `PH02-C01` assumes it exists.
5. **Windows/Linux runtime debt from PH01-E06 has no tracking item.** It expires
   `before-phase15-release-or-platform-claim` and is referenced by no story and by no Phase 15 material.
6. **`editor.pauseLivePreview` / large-file auto-pause does not exist.** `EC-RENDER-4` is a precursor in
   Phase 01 and primary in Phase 04; nothing in the backlog currently carries it.

---

## 10. Remediation

Recorded as tickets, highest priority first. See `docs/stories/` for the authored stories.

| Item | Owner |
|---|---|
| Restore Phase 01 completion validation (red test + descendant-freshness rule) | STORY-052, ADR-0027 |
| Bring Phase 00 runtime evidence to the evidence schema and validate its freshness | STORY-053 |
| Prove the three-region shell against the real component | STORY-054 |
| Keep the dev bridge mock in parity with the Go appmodel | STORY-055 |
| App-chrome file commands (split from STORY-041-AC-6) | STORY-056 |
| Phase 02 current-host runtime evidence exception | ADR-0026, STORY-033, STORY-051 |
| D-4 issuer ownership, D-6 new-document encoding | STORY-037, STORY-035 |
| D-5 open composition, zero-document DTOs | STORY-035 |
| D-7 dirty definition | STORY-038 |
| D-10 … D-13 dependency and ownership edges | STORY-040, 041, 048 |
| D-14 … D-16 hygiene | STORY-034…046 |

Deliberately not ticketed: `editor.pauseLivePreview` (Phase 04), CI branch gating and `verify-ui` in CI
(Phase 15), the PH01-E08 network trace (removed by ADR-0018).
