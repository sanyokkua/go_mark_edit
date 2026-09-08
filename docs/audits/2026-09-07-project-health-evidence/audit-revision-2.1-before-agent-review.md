# GoMarkEdit project health audit and refactoring brief

**Revision:** 2.1 (preview-link/startup/quit investigation), 8 September 2026. The owner-reviewed Revision 2 is preserved
unchanged as [audit-revision-2-owner-reviewed.md](2026-09-07-project-health-evidence/audit-revision-2-owner-reviewed.md).
Revision 1 remains preserved as [audit-revision-1-unverified.md](2026-09-07-project-health-evidence/audit-revision-1-unverified.md).
**Audited source:** `883fd053b9b30911248a304cf5f57d8cebe81795` on `feature/v1-implementation` (clean tree except three
mode-only changes under `frontend/wailsjs/runtime/` left by `just build`).
**Purpose:** a complete, evidence-backed statement of what is wrong in the project and why, written so that it can be
handed to `/speckit-specify` as the input for a refactoring feature. It proposes scope; it does not change code or specs.
**Original product intent:** `docs/delivery/spec/` (converted 2026-07-28 from the owner's initial specification, archived
in `docs/_archive-2026-07-28-specification/` and at commit `50d692d`). Active Spec Kit features: `specs/001…003`.

**Contents.** §0 How this revision differs · §1 Verdict on the owner's thesis · §2 The owner's vision as acceptance
criteria (V1–V7) · §3 What was verified and the fact-check of revision 1 · §4 Root causes (RC-1…RC-9) · §5 Findings
catalogue (5.0 index; 5.1 popup border reproduced; 5.2 UI composition and reuse; 5.3 Go backend; 5.4 tests; 5.5
documentation and naming; 5.6 tooling; 5.7 agent instructions and authority; 5.8 repository hygiene; 5.9 history and
spec drift; 5.10 preview-link/startup/quit incident) · §6 Refactoring scope for `/speckit-specify` (epics A–F, non-goals,
owner decisions D1–D12, sequence) ·
§7 Evidence index · Appendices A–D (retained revision-1 evidence: C1–C8, tooling 1–10 and script inventory, H01–H15,
R1–R20).

## 0. How this revision differs from revision 1

Revision 1 was produced by a previous agent session. Revision 2:

1. **Re-verified every material claim** of revision 1 against the source at `883fd05`, the evidence bundle and git
   history. Corrections and confirmations are listed in §3.2; no revision-1 finding was found to be fabricated, but
   several were incomplete, and the document as a whole was hard to use as a specification input.
2. **Reproduced the owner's popup-border defect (U1)** in Chromium and identified its mechanism (§5.1, evidence
   `focus-ring-probe.json`). Revision 1 left it as a hypothesis.
3. **Traced the owner's principles back to the initial specification** and shows where each was dropped (§4): the
   reusable component library, the offline/bundling requirement, and the test conventions.
4. **Adds four new deep investigations** (UI composition, test suite, tooling and agent instructions, Go backend,
   history and spec drift) with quantified findings, and re-grounds the root-cause analysis in them.
5. **Restructures the material** into: verdict on the owner's thesis → owner's vision as acceptance criteria →
   root causes → findings catalogue by domain → refactoring scope and open decisions → appendices with the retained
   revision-1 evidence.

**8 September extension.** Revision 2.1 preserves the owner's revised diagnosis and adds §5.10, APP-1…APP-5, and
related refactoring acceptance. The owner reports that activating a file link in preview stranded the development
app on its startup-failure screen and prevented closing it. The investigation separates the navigation trigger,
renderer bootstrap, Retry and native shutdown; the screenshot alone cannot establish a database failure or a deadlock.
The owner confirmed `just dev` / `wails dev`; the exact clicked target and failed termination method remain uncaptured.
New evidence and its limits are recorded in §3.3. No application implementation was changed.

## 1. Verdict on the owner's thesis

The owner's statement was: *the project drifted in ideas and architecture during AI implementation; my principles
were broken; no reuse of common components; copy-paste and duplicated code; stubs mixed with implementation; tests
mixed with production code; incorrect structures; tests that verify bureaucracy; the current basis will fail future
features.* Each part was checked.

| Owner's statement | Verdict | Decisive evidence |
| --- | --- | --- |
| Ideas and architecture drifted during implementation | **Confirmed.** The initial specification (`50d692d`, `02_Architecture/03_FRONTEND_REACT.md`) prescribed a three-layer UI library (`primitives` → `components` such as Button, IconButton, TabBar, Toolbar, MenuBar, StatusBar → `widgets`). None of TabBar, Toolbar, MenuBar, Button, IconButton, ContextMenu, Popover or Tooltip exists; the widgets became monoliths (`App.tsx` 2,179 lines, `DocumentTabs.tsx` 1,355, `ShellMenuRow.tsx` 1,041). The 2026-07-28 conversion replaced the prescription with a description of "what exists today" (`docs/delivery/architecture/structure.md`). | §4.1, §5.2 |
| Principles were broken | **Confirmed for reuse, offline-scope, documentation and test conventions.** Held for: Go-owned state, handler envelopes, adapter-only `wailsjs/` imports, token-only colours, CGO-free SQLite. | §4, §5 |
| No reuse of common components; copy-paste; duplicated code | **Confirmed.** Five popup style owners, six dismissal/placement implementations, four modal lifecycles, two segmented-radio algorithms, three shortcut listeners, two formatting-command builders (Appendix D R1–R20 plus §5.2 new findings). | §5.2 |
| Stubs mixed with implementation | **Confirmed, in three forms.** (a) Production widgets branch on a `?parity-case` URL parameter to fake states for screenshots; (b) production Go services expose test-only hooks (`SetBeforeSaveAsRecheck`, `SetWriteCommitObserver`, injected clocks); (c) a 2,024-line TypeScript re-implementation of the Go backend (`frontend/src/dev/bridge-mock`) is the backend that every "E2E" test runs against; (d) a test file is shipped inside the binary (`frontend/public/theme-bootstrap.test.mjs` → `dist` → `//go:embed`). | §5.3, §5.4, §5.5 |
| Tests mixed with production code | **Confirmed.** All 66 Go test files sit beside production code in the production package; 72 Jest files sit under `frontend/src`; one test lives in `frontend/public`. Note: this colocation was encoded in the very first agent configuration (`50d692d:CLAUDE.md` rule globs `internal/**/*_test.go`, `frontend/src/**/*.test.ts(x)`) and restated on 2026-07-28 (`structure.md` "A Go test sits beside the code it tests"), so it is a convention the agents inherited and never questioned rather than one they invented late. | §5.4 |
| Incorrect structures | **Confirmed.** `ui/primitives/ViewMenu.tsx` is a feature menu that imports the action registry, dispatcher and store types (violates `rules.md#components-take-props`); `frontend/src/dev` is compiled into the E2E truth; `cmd/native-evidence` is a second Wails composition for evidence capture; `test-results/.last-run.json` is tracked at repo root; 42 MB of `specs/**/evidence` is committed. | §5.4, §5.6, §5.8 |
| Tests verify bureaucracy | **Confirmed.** `spec_clause_count_test.go` counts `- Q:` lines in `spec.md` and compares them with a phrase in `plan.md`; `native_evidence_safeguards_test.go` runs two `go build`s inside `go test`; component tests read CSS files as text and assert declarations; ~73 % of frontend test titles start with a task or requirement ID. The project's own rule file forbids exactly this (`docs/delivery/architecture/rules.md:686–705`, "A test proves behaviour, not a document"). | §5.4 |
| The current basis will fail future features | **Supported.** Eight reproduced product defects in the first real-file feature (Appendix A), a Save that destroys Undo, an E2E suite that cannot see the Go backend, and a lifecycle model spread over many per-document maps make each new capability (Phase 06 rendering, Phase 07 folders, Phase 08 OS integration, AI phases) more expensive than the last. The refactoring is justified; a rewrite of the stack is not. | §4, §6 |

Two nuances matter for the refactoring specification. First, several architectural boundaries **did hold** and are worth
keeping (Go-owned model, adapter isolation, envelopes, tokens, CGO-free SQLite, additive migrations). Second, some of the
drift was **approved at the time** through Spec Kit clarifications (e.g. native window frame instead of frameless;
toolbar overflow instead of scrolling; component-level parity instead of whole-screen). The refactoring spec must state
the owner's current decision on those explicitly rather than treat them as bugs (§6.4).

## 2. The owner's vision, stated as acceptance criteria for the refactoring

These are the requirements the owner has stated across the audit conversation, the component-design PDF
(`owner-reuse-principles.pdf`) and the original specification. They are the yardstick used in §5.

**V1 — Offline by construction.** The built application starts and works with no network: all frontend code, styles,
fonts, Monaco and its workers, and rendering assets are compiled into the binary. Network is used only by the future,
user-invoked AI integration. Proof is a cold start of the packaged app with networking disabled, not a scan for the
string `fetch(`. (Origin: `50d692d:specification/03_NonFunctional/04_OFFLINE.md`; `docs/delivery/spec/constraints.md#every-asset-is-bundled`.)

**V2 — One implementation per common behaviour.** A common behaviour or style has exactly one implementation that every
applicable consumer uses; changing it is a one-place change; selecting a theme changes appearance, never behaviour.
Concretely: one Popup/Menu (content supplied) used by menubar menus, tab context menu, editor context menu and toolbar
overflow; one horizontal Bar frame used by menubar, tab bar and formatting toolbar; one Tab, one Tool button (icon and
text variants), one Island/group; one Pane frame for editor and viewer; one Status item; one Sidebar frame (content and
side supplied); one Modal shell. (Origin: `50d692d:specification/02_Architecture/03_FRONTEND_REACT.md` layering and
component list; owner PDF.)

**V3 — Six stages, five shared scripts, thin `just` aliases.** Build; Test (unit); Test (integration); E2E against the
real Go backend; Lint (static analysis of Go and frontend); Format (all project files). Local hooks and GitHub Actions
call the same scripts; no step list is maintained twice. Plus a Baseline capture (commit, dirty state, lint and test
results) taken before an agent starts.

**V4 — Tests live apart from production code and prove behaviour.** Separate test roots per category; no test files under
`frontend/src`, `frontend/public` or beside Go production files; no tests of DTO shape, source text, CSS declarations
or specification documents; no test that would fail because a spec or story file was archived.

**V5 — Self-describing names and documentation.** A test title is a sentence describing the behaviour; an ID may appear
only in an adjacent comment. Source comments explain public behaviour and non-obvious invariants, not task numbers,
requirement IDs, measurements or history.

**V6 — One authority, current instructions.** One place says what is normative; agent instructions reference only
commands and files that exist; historical narrative lives in decision records, not in `AGENTS.md`, `justfile` or CSS.

**V7 — The product promises of the original specification survive.** Native, offline, cross-platform Markdown editor
and viewer; three themes × light/dark/auto; files, tabs, workspaces; rich rendering; later an optional local-first AI
assistant. Backend-owned state, envelopes and CGO-free SQLite remain.

## 3. What this revision verified, and how

### 3.1 Fresh checks in this revision

| Check | Result | What it establishes |
| --- | --- | --- |
| Working tree at start | Clean except three mode-only (`755`→`644`) diffs under `frontend/wailsjs/runtime/` | The tree is the audited commit; `just build` dirties generated files (a tooling defect, §5.6). |
| Owner popup-border defect (U1) in Chromium via the ordinary Vite route | **Reproduced.** Pointer-opened About/View/File menus become `document.activeElement`, match `:focus-visible`, and their computed `box-shadow` is the two-layer focus ring with the drop shadow gone. Keyboard-opened menus keep the drop shadow. Screenshot matches the owner's. | The cause is the global `*:focus-visible { box-shadow: var(--focus-ring) }` rule in `base.css:104–107` replacing the popup surface shadow; it is not a theme-initialisation bug (§5.1). |
| Origin of the reuse principle | Present in the initial spec: `50d692d:specification/02_Architecture/03_FRONTEND_REACT.md` lines 36 and 69–71 prescribe `ui/widgets → ui/components → ui/primitives → ui/styles` with Button, IconButton, TabBar, Toolbar, MenuBar, ContextMenu, Popover, Tooltip, Tabs, Switch. | The agents dropped a prescribed component library; they did not lack the instruction. |
| Origin of the mockup-parity escalation | `50d692d:specification/mockups/README.md`: mockup is "the visual acceptance reference". `3af7c58` (2026-07-28 conversion): "Tier A binding … a visible difference … is a defect" (`docs/delivery/spec/surface/README.md:10–18`). `specs/003` then required zero-tolerance pixel parity (546 cases / 1,638 executions). | The pixel-parity programme is an escalation introduced by agents in two steps, not an owner requirement. |
| Origin of ID-in-title test names | `50d692d:specification/06_Process_and_Traceability/03_TRACEABILITY.md:47–50` gives `it('STORY-031-AC-1 renders a GFM table…')` as the model; carried through `Proves: <feature>#<anchor>` (2026-07-28) and `// Proves: FR-…` + "a task id may lead the title" (`AGENTS.md`). | The convention was designed for a traceability generator that was deleted on 2026-07-25 (`927d15f`); the naming outlived its only consumer. |
| Origin of colocated tests | `50d692d:CLAUDE.md` rule globs; `docs/delivery/architecture/structure.md` "Naming and file layout". | Inherited convention; contradicts the owner's stated vision (V4). |
| `just` recipe and comment counts | 34 recipes, 32 comment lines, 167 lines | Confirms revision-1 count. |
| Test-file inventory | 66 Go test files (all in production packages), 95 frontend test files (72 under `src`, 20 under `e2e`, 1 under `public`, 1 under `scripts`, 1 copy in `dist`) | Confirms revision-1 inventory. |
| Test titles containing IDs | 520 of 711 `describe/it/test` titles in `frontend/src` and `frontend/e2e` (73 %); most frequent leading tokens: `T045` ×18, `T157` ×15, `T084` ×14, `T142` ×12, `T030` ×12 | Confirms and quantifies U2. |
| Requirement/task IDs in production (non-test) source | 489 occurrences across `frontend/src`, `internal`, `cmd`, `main.go`; top files `App.tsx` (43), `DocumentTabs.tsx` (38), `AppModelHandler.ts` mock (22) | Confirms U2 at scale. |
| `ui/primitives` and `ui/components` importing `logic/` | `ViewMenu.tsx` imports `actionRegistry`, `actionDispatcher`, store types; `Banner`, `StatusBar`, `ViewModeToggle` import store types only | A "primitive" that dispatches actions violates the project's own layering rule (`rules.md:494–498`). |
| Theme-conditional CSS | `[data-theme]`/`[data-mode]` selectors: `tokens.css` 19, `DocumentTabs.module.css` 12, `EditorView.module.css` 11, `EditorChrome.module.css` 7, `SettingsMenu.module.css` 3, `AppShell` 2, `StatusBar` 2; plus 12 parity-only `[data-parity-shell]` rules in `DocumentTabs.module.css` | Theme skins leak into widget stylesheets instead of tokens; parity-capture rules live in production CSS. |
| Repository weight | `specs/` 42 MB (mostly `evidence/`), `docs/` 15 MB, `frontend/src` 2.0 MB, `internal` 1.1 MB; `test-results/.last-run.json` tracked at root | Evidence artefacts outweigh the product by an order of magnitude. |
| Branch state | `master` at `85205ba` (2026-07-20), 363 commits behind; `origin/feature/v1-implementation` at `544372d` (2026-08-19); local audit/retrospective branches point at the same commit as the feature branch; zero merge commits in 367 | The prescribed task-branch/squash protocol did not leave a trace; integration is one long linear branch never merged. |

Limits: no native (WebKit) screenshots could be taken in either revision; the native walkthrough evidence is revision 1's
accessibility journal. No Windows or Linux run. No full gate rerun in this revision (revision 1's host logs stand).

### 3.2 Fact-check of revision 1

| Revision-1 claim | Status after re-verification |
| --- | --- |
| C1–C8 backend defects (Save As/autosave ordering, unlocked map read, retained write buffers, silent autosave failure, Darwin hard-link identity, Save remounts editor, Open shows Not saved, non-transactional settings update) | **Confirmed by source re-inspection** at the cited files; the independent review in the evidence folder already validated the probes. Line numbers in Appendix A are those of `883fd05` and remain valid. |
| U1 cause "source-supported hypothesis" | **Upgraded to reproduced (Chromium)**; mechanism confirmed, see §5.1. |
| B1 verify.sh false PASS, B2 network-scanner same-line bypass | **Confirmed** by the preserved fixtures; B2 remains a fact about the checker, not proof the app phones home, which matches the owner's clarification. |
| "34 recipes", "66 Go test files all in production package", "1,909-byte test file embedded in dist" | **Confirmed.** |
| "About three quarters of frontend static titles embed identifiers" | **Confirmed** (520/711 including `describe`). |
| H01 retrospective errors (validators "never written", traceability.yaml as FR join, sanitizer as future work) | **Confirmed** by git (`a240936`, `fc785fe`, `857636a` add; `53af8e4` deletes; `927d15f` deletes `docs/traceability.yaml` five days before Spec Kit; `59b379a` adds `rehype-sanitize`). |
| R1–R20 reuse findings | **Confirmed**, with the additions in §5.2 (a systematic inventory shows the split is wider than R1–R20 lists). |
| "`frontend/src/dev` and `cmd` are legitimate" | **Partly revised.** Their existence has a reason, but both are symptoms of the missing real-backend E2E harness; the refactoring should replace, not preserve, the mock-as-E2E-truth arrangement (§5.5, §5.6). |
| "Do not delete the entire test suite" | **Kept**, sharpened: §5.4 gives a file-level keep/rewrite/delete mapping. |
| Revision 1's own structure | Findings were interleaved with process caveats and ~40 % of the text was defensive qualification; this revision keeps the qualifications where they change the decision and moves the rest to the appendices. |

### 3.3 Additional evidence for the 8 September incident (Revision 2.1)

The owner-reviewed Revision 2 was read before editing and preserved byte-for-byte. Source remains `883fd05`, now
reviewed on `feature/v1-implementation--project-audit`; the three preexisting generated-runtime mode diffs remain.
This extension changes audit documents/evidence only and does not rerun or replace the earlier full-gate results.

| Check | Result | Scope |
| --- | --- | --- |
| Owner incident and launch clarification | Screenshot shows StartupFailure; owner confirms development launch through `just dev` / `wails dev`. Exact href, Retry response and termination method are still missing. | Owner observation; no claim of a newly reproduced native hang. |
| Actual Wails development asset pipeline with Vite `--mode wails` | HTTP probe exit 0: `/` returns React index with Wails runtime/IPC scripts; `/audit-next.md` returns React index without either script, identical to Vite's fallback. | Executes pinned Wails public asset-server APIs and real Vite; no renderer JavaScript, native window or application bindings. Confirms the response mechanism in APP-1, not the full incident. |
| Exact Go CloseCoordinator in a temporary stdlib-only module | Exit 0: first request without a receiver vetoes/emits once; receiver restored, repeat still vetoes with no delivery. Cancel then a fresh close delivers; Authorize permits the simulated native callback. | Reproduces APP-2's coordinator state defect with a substituted receiver/Quit callback; does not execute Wails or macOS close. |
| Exact settingsProjection.ts transpiled with installed TypeScript | Node exit 0: first rejection and subsequent Retry share the same rejected promise, read count 1; explicit disposal then retry succeeds, read count 2. | Reproduces APP-3's cache defect; only store/action imports substituted. No React App, real settings I/O or native bridge. |
| Available application logs | Production log directory empty; development snapshot has four asset-server startup messages through 8 September 09:18:25 +02:00 and no failure cause. | Limited retained log evidence; not proof that no error occurred. |
| Exact native incident / force-close failure | Not reproduced; no stack sample or confirmed signal delivery. | Required follow-up matrix in §5.10.6; no platform-wide termination conclusion. |

The two lifecycle probes intentionally assert the observed defective behavior, so their exit 0 is successful
diagnosis, **not** a passing regression for desired behavior. Both ran under external 30-second limits with no timeout;
their source copies match the audited commit. The HTTP probe retained its initial sandbox loopback failure separately
from the successful permitted run. No user profile or native app was started for these probes. Raw sources, outputs,
commands, source hashes and limitations are linked from §7 and the evidence README.

## 4. Root causes — why it went wrong

Each cause below is tied to evidence in §5. They are ordered by how much of the current state they explain.

**RC-1 The prescribed component library was never built, and the rule that replaced it rewarded local copies.** The
initial specification named the primitives and components (`Button`, `IconButton`, `TabBar`, `Toolbar`, `MenuBar`,
`ContextMenu`, `Popover`, `Tooltip`, `Dialog` wrapper) and the layering `widgets → components → primitives → tokens`
(`50d692d:…/03_FRONTEND_REACT.md:36,69–71`). The 2026-07-28 conversion (`3af7c58`) replaced that prescription with an
inventory of what existed and the rule *"a shared helper with one caller: nowhere — inline it until there is a second
caller"* (`docs/delivery/architecture/structure.md`). Agents implementing one task at a time each had "one caller", so
every family grew a private copy: six popup surfaces, ten popup lifecycles, four modal lifecycles, eleven button styles
(§5.2). The owner's screenshots (border ring, misplaced tab menu, inconsistent menus) are the visible result.

**RC-2 The verification instrument was optimised instead of the product.** The mockup went from "visual acceptance
reference" (`50d692d`) to "Tier A binding: a visible difference is a defect" (`3af7c58`) to a zero-tolerance pixel harness
of 546 cases (`7744cc8`, 2026-08-09) whose first run scored 0 of 1,620 (`specs/003/evidence/ft-vs-08/phase-18/t035-run.md`).
Week 33 (Aug 10–16) holds 196 of 367 commits, 70 of them fixes, before the contract was withdrawn (`23ba4b5`). The
harness left parity selectors and URL branches in production code (UI-12), 9,901 lines of test code (T-2), and a
dependency of every browser test on `mockup.html` (T-3). Meanwhile Save destroyed Undo and Save As could report a
destination clean with stale bytes (Appendix A) — defects no pixel comparison can see.

**RC-3 Tests were pointed at a TypeScript imitation of the backend.** Playwright's server is Vite with
`src/dev/bridge-mock` (2,351 lines re-implementing all 24 bindings); `KNOWN_ISSUES.md` #3 recorded the divergence on
2026-07-25 and it was never resolved. "195 of 196 tasks done" and eight reproduced product defects coexist because the
suite that certified the tasks never executed Go (T-1). The one real-backend driver (`cmd/native-evidence`) became a
second host root that nothing runs (TL-8).

**RC-4 Lifecycle ownership in Go was never consolidated.** The service accumulated ten maps and eight counters
(BE-1) as features were appended (Aug 8: 29 commits in six hours adding the entire file/tab vertical). Each new concern
added a map and a cleanup line; C1, C3 and C7 are what happens when the lines are not all present.

**RC-5 Process regimes changed ten times in seven weeks, and each change deleted the previous instrument.** Claude
agent pipeline (07-17) → CODEX dual config (07-20) → phase/story + traceability (07-20…23) → "changing the approach"
cleanup deleting 29,924 lines (`927d15f`, 07-25) → `docs/delivery` conversion (`3af7c58`, 07-28) → Python validators
(`a240936`, 07-29) → Spec Kit + constitution (`b9d8a05`, 07-30) and validators deleted inside a `feat` commit
(`53af8e4`, same day) → evidence regime (08-07) → pixel parity (08-09) → Spec Kit extensions +14,716 lines (`cf8cff1`,
08-15). Process configuration received +46,807/−21,222 lines across 755 file touches — more than all product code
(+39,900). `AGENTS.md` was rewritten 15 times; the constitution was never amended. Instructions that outlived their
tooling are why `just story-check` is still required by live command files (PR-2).

**RC-6 Conventions designed for a deleted generator kept governing names and comments.** ID-led test titles and
`Proves:` anchors served `just trace` and `docs/traceability.yaml`, both deleted on 2026-07-25; the naming survived three
regimes and was re-imposed on 38 test files on 2026-08-15 (`cb48e68`). Task IDs then migrated into production comments
(489 occurrences) because the same instructions told agents to "name the rule". The owner's initial configuration did
ask for tests "naming the story id" (`50d692d:CLAUDE.md`), so this is an inherited convention the owner now rejects,
not a pure invention — but the `T###`/`FR-` escalation and the comment diaries are.

**RC-7 Task bookkeeping replaced review.** `tasks.md` for feature 003 was touched by 192 of 367 commits, grew from 39
tasks to 196 (80 % appended in thirteen "convergence" phases) and to 2,475 lines with 910 lines longer than 300
characters. Zero merge commits, zero tags, the prescribed task-branch/squash protocol never executed, the one squash
ever made discarded (`branch-divergence-resolution.md`). Commits 1–5 minutes apart (41 pairs in Aug 13–17) show that
"one task = one commit" was bookkeeping, not a checkpoint where someone looked at the running app.

**RC-8 Authority forked and nobody owned the map.** Four documents give four answers to "what is normative" (PR-1);
`master` still carries the July instructions; ADR-0028 (custom title bar) is contradicted by `main.go:166` with no
superseding record; decisions are scattered across `spec.md` markers, `decisions-phase-21.md` and memory notes. A new
agent cannot determine the current contract by reading, so it re-derives it — differently each time.

**RC-9 Evidence displaced engineering.** 189,593 inserted lines under `specs/*/evidence` versus 39,900 of product code
(4.8×); 42 MB of committed evidence; scripts whose job is to compare evidence files (`verify.sh`, `evidence_id.sh`,
`release-stack.sh`) with their own false-PASS defects (B1). Tests that read documents came back after 4,200 lines of
them were deleted on 2026-07-25 (`rules.md:686–705`).

## 5. Findings catalogue

### 5.0 Index

Severity: **P1** fix before any new capability; **P2** part of the refactoring; **P3** cleanup once replacements exist.
"Reproduced" means observed by execution in this or the previous revision; "source" means confirmed by reading the code.

| ID | P | Finding | Status | § |
| --- | --- | --- | --- | --- |
| APP-1 | P1 | Preview links can navigate the application page; development fallback can reload the app without its bridge | source + HTTP pipeline reproduction; exact incident target pending | 5.10.1 |
| APP-2 | P1 | A close request before renderer readiness can be lost while native close remains vetoed | source; isolated coordinator probe | 5.10.2 |
| APP-3, APP-4 | P2 | Retry caches an isolated settings failure; unrelated bootstrap failures are all labelled settings errors | projection probe / source | 5.10.3, 5.10.4 |
| APP-5 | P2 | Bridge-loss and cancellation paths lack bounded completion and shutdown-state reconciliation | source; incident contribution unconfirmed | 5.10.5 |
| UI-1 | P1 | Popup loses its shadow and shows the focus ring when opened by pointer | reproduced (Chromium) | 5.1 |
| C1 | P1 | Save As and autosave publish out of order; destination reported clean with stale bytes | reproduced | App. A |
| C2 | P1 | Refusal label reads the document map without the lock | reproduced (race detector) | App. A |
| C6 | P1 | Explicit Save remounts the editor; Undo and focus lost | reproduced (native) | App. A |
| B1 | P1 | `verify.sh` reports PASS with missing baseline inputs | reproduced | App. B |
| C3, C4, C5, C7, C8 | P2 | Retained write buffers; silent autosave failure; hard-link identity; Open shows Not saved; non-transactional settings | reproduced | App. A |
| UI-2…UI-18 | P2 | Six popup surfaces, ten lifecycles, no Button/Bar/Tab/Pane/Sidebar primitives, God components, theme geometry in widget CSS, parity residue, dead tokens | source | 5.2 |
| R14–R16, R19 | P2 | Tab menu anchor, invisible shortcuts, clipped menus at 400 px, Details omits word count | reproduced (browser) | App. D |
| BE-1…BE-8 | P2 | Lifecycle across ten maps; test seams on the production API; six copy-paste families; layering leaks; dropped errors; concurrency risks; diary comments; dead exports | source | 5.3 |
| T-1…T-5 | P2 | E2E never reaches Go; 20 % of test code is pixel parity; tests coupled to `specs/`/`docs/`; 19 % infrastructure; redundant suites | source | 5.4 |
| DOC-1…DOC-6 | P2/P3 | Diary comments; ID titles; missing contracts; contradictory authority; README; spec inconsistencies | source | 5.5 |
| TL-1…TL-10 | P2 | Six gate lists; 34 recipes; format covers half; build dirties tree; CI by hand; heuristic lint; no owner scripts; second host root; TS backend; hygiene | source | 5.6, 5.8 |
| PR-1…PR-5 | P2 | Four authorities; dead command references; `AGENTS.md` war stories; mandatory hooks one side cannot run; two live workflows | source | 5.7 |
| H-1…H-9 | context | Ten process regimes; evidence 4.8× product; tasks-as-diary; retrospective errors; branch protocol never executed; docs clutter | git | 5.9 |
| B2–B10, H01–H15, R1–R20 | P2/P3 | Revision-1 tooling, history and reuse findings, all re-verified | source | App. B–D |

### 5.1 UI-1 — Popup border at startup (owner's screenshots): reproduced, cause identified

**Severity: P1 (user-visible on every pointer-opened menu; also an accessibility contract problem).**

- **What the owner saw.** About/View popups with a blue double ring and no drop shadow after launch
  ([about](2026-09-07-project-health-evidence/owner-popup-about.png),
  [view before](2026-09-07-project-health-evidence/owner-popup-view-before.png)); the ordinary shadow and no ring after a
  theme change ([view after](2026-09-07-project-health-evidence/owner-popup-view-after.png)).
- **Reproduced in Chromium** on the ordinary route with the mock bridge
  ([focus-ring-probe.json](2026-09-07-project-health-evidence/focus-ring-probe.json),
  [screenshot](2026-09-07-project-health-evidence/focus-ring-probe-fresh-about-chromium.png)). On a fresh load, a pointer click
  on About/View/File makes the Radix menu content `document.activeElement`; it matches `:focus-visible`; its computed
  `box-shadow` is `0 0 0 2px var(--app-bg), 0 0 0 4px var(--accent)` and the `--win-shadow` is gone. Opening the same menu
  with the keyboard focuses the first item instead, and the container keeps its intended shadow.
- **Mechanism (confirmed in source).** `frontend/src/ui/styles/base.css:104–107` declares
  `*:focus-visible { box-shadow: var(--focus-ring); outline: 0; }`. Every popup surface also expresses its elevation with
  `box-shadow` (`ShellMenuRow.module.css:99`, `MenuSurface.module.css:69`, `EditorContextMenu.module.css:15`,
  `DocumentTabs.module.css:223`, `EditorChrome.module.css:385`), so the focus rule **replaces** the shadow instead of
  composing with it. `main.tsx` imports `App` (and thereby every CSS module) before `base.css`, so the global rule wins
  ties. Radix focuses the content element on open (`@radix-ui/react-menu` `dist/index.mjs:268`) and prevents pointer
  focus on the trigger, so the container is what carries focus. No popup opts out; there is no `.surface:focus-visible`.
- **Why it "disappears after a theme change".** In Chromium the ring is present on every pointer open, before and after
  theme changes. The owner's native WebKit observation is consistent with WebKit's input-modality heuristic for
  script-focused elements: at startup no pointer interaction has happened, so script focus is treated as keyboard focus
  and shows the ring; the first pointer interaction (choosing a theme swatch happens to be it) flips the modality and the
  ring stops matching. The theme is incidental. This part was not reproduced natively because native screenshots were
  unavailable in both revisions.
- **Why this is a reuse finding as well as a CSS bug.** There is no single popup surface to fix: the focus-ring rule
  interacts with six independent surface owners (§5.2, table "popup surfaces"), so a correct fix today needs six edits and
  a test per family. The refactoring should make the fix in one shared Popup component and prove it with a computed-style
  assertion for pointer- and keyboard-opened menus in every family.
- **Fix direction (not a design decision).** Scope the focus indicator to interactive controls (`button, [role=menuitem],
  input, …`) or express it as `outline`/`outline-offset` so it composes with elevation; keep a visible keyboard focus
  indicator on items; assert the container's shadow is unchanged when it receives programmatic focus.

### 5.2 UI composition and reuse

Revision 1's R1–R20 (Appendix D) were all confirmed. The systematic inventory below extends them; item numbers `UI-n`
are the ones the refactoring spec should cite. Line numbers are at `883fd05`.

#### 5.2.1 The prescribed component library was never built

The initial specification (`50d692d:specification/02_Architecture/03_FRONTEND_REACT.md:36,69–71`) required:

```
ui/widgets → ui/components → ui/primitives → ui/styles(tokens)
primitives/  Radix wrappers: Dialog, DropdownMenu, ContextMenu, Tabs, Switch, Segmented, Select, Popover, Toast, Tooltip
components/  Button, IconButton, Icon, Chip, TreeItem, TabBar, Toolbar, StatusBar, MenuBar, Banner, MarkdownView, …
widgets/     EditorView, PreviewView, …, AppMenuBar — compose components; read/dispatch store
```

What exists at `883fd05`: `primitives/` = AppBrand, Banner, Icon, LiveRegion, MenuSurface (CSS only), MenuTrigger,
ModalShell, Segmented, Toast, **ViewMenu** (a feature menu, not a primitive); `components/` = CodeEditor, MarkdownView,
StatusBar, ViewModeToggle (unused). **No Button, IconButton, TabBar, Toolbar, MenuBar, ContextMenu, Popover, Tooltip, Tabs,
Switch, Dialog wrapper.** The behaviour those would have owned is implemented inside `ShellMenuRow.tsx` (1,041 lines),
`DocumentTabs.tsx` (1,355), `EditorChrome.tsx` (591), `SettingsMenu.tsx` (610), `EditorContextMenu.tsx` (286),
`TabContextMenu.tsx` (273) and `App.tsx` (2,179). The 2026-07-28 conversion replaced the prescription with an inventory
of "what exists today" (`docs/delivery/architecture/structure.md`) and added the rule *"a shared helper with one caller:
nowhere — inline it until there is a second caller"*, which, applied by agents one task at a time, produced the second,
third and sixth copies documented below.

#### 5.2.2 Popups: six surface owners, ten lifecycle implementations

**UI-2 Popup surface styling has six owners** (R1 said five). Values differ in ways a user can see:

| Owner | Surface: bg / border / radius / shadow / min-width / padding | Row: padding / radius / hover / disabled |
| --- | --- | --- |
| `primitives/MenuSurface.module.css:64–118` (Settings, View) | `--elevated` / `--stroke` / 12px / `--win-shadow` / 250px / 6px | 7px 10px / 8px / `--hover` / .48 |
| `widgets/ShellMenuRow.module.css:86–101,202–266` (File, About, narrow overflow) | `--surface-raised` / `--border` / 12px / `--win-shadow` / 250px / 6px | 7px 10px / 7px then patched to 8px by `.fileMenu .item` (`:150–166`) / `--surface` + border / .48 |
| `widgets/DocumentTabs.module.css:219–232,280–284` (tab context) | `--surface-raised` / `--border` / 12px / **`--context-menu-shadow`** (Material redefines it, `tokens.css:231`) / 250px / 6px | 7px 10px / **none** / **no hover rule** / .48 |
| `widgets/EditorContextMenu.module.css:10–53` (editor context) | `--surface-raised` / `--border` / **8px** / `--win-shadow` / **14rem** / **4px** | **6px 10px** / 8px / `--surface` + border / .48 |
| `widgets/EditorChrome.module.css:380–442` (toolbar overflow) | `--surface-raised` / `--border` / 12px (11px narrow rule is dead: overridden by inline `borderRadius:'12px'` at `EditorChrome.tsx:500`) / `--win-shadow` / 250px / 6px | 7px 10px + `min-height 29/32px` / 8px / `--hover` / — |
| `components/StatusBar.module.css:101–120` (Document details) | `--surface-raised` / `--border` / **0.5rem** / **none** / 250px / `--control-padding` | n/a |

`ShellMenuRow.module.css:202–266` re-declares `.item/.groupLabel/.separator` that `MenuSurface.module.css:81–183` already
owns, with group-label padding `5px 10px 3px` versus `7px 10px 3px` — the drift the MenuSurface header comment says was
fixed. The editor context menu is a third visual design (radius 8px, 14rem, 4px padding, 6px rows, no accelerator text).
This is exactly what the owner perceived as "menubar popups and editor popups use different approaches".

**UI-3 Popup lifecycle is implemented ten times** (open, Escape, outside-pointer, focus restore, arrow navigation,
geometry clamp):

| Site | Escape | Outside pointer | Focus restore | Arrow nav | Clamp |
| --- | --- | --- | --- | --- | --- |
| File/About desktop, Radix (`ShellMenuRow.tsx:686–782,815–869`) | Radix + own document listener `:494–504` | Radix | own `:283–287` | Radix | disabled by CSS; token inset |
| Narrow overflow, Radix (`:622–683`) | Radix | Radix | — | Radix | Radix |
| Narrow File/About, raw `role=menu` (`:908–1003`) | document listener | **none** | `:283–287` | **none** | own `:303–330` |
| Narrow View (`:289–301,606–613`) | Radix | own listener (queries by aria-label) | `:283–287` | Radix | 1×1 anchor span |
| SettingsMenu (`SettingsMenu.tsx:399–506`) | document listener **and** onKeyDown | own `:487–494` | `:480–484` | **none** | own clamp + `maxBlockSize`, hardcoded `{left:150, top:42}` `:438` |
| ViewMenu desktop (`ViewMenu.tsx:150–166`) | Radix | Radix | via ShellMenuRow | Radix | disabled; token inset |
| TabContextMenu (`:160–180,233–247`) | document listener | document listener | DocumentTabs `:1325–1339` | own cycling | **none** (CSS `right: var(--app-gap); top: 3rem`) |
| EditorContextMenu (`:91–125`) | document listener (gated) | document listener (**ungated**, runs while closed, `:102–110`) | `openerRef`, never cleared | **none** | own clamp |
| Toolbar overflow (`EditorChrome.tsx:292–367`) | document listener | document listener | `:292–296` | **none** | own clamp with magic −18/−19 (`:347,351`) |
| Status Details (`StatusBar.tsx:112–147`) | **none** | **none** | — | — | CSS |

The 8px clamp margin and below/above flip are copied four times (`SettingsMenu.tsx:406–468`, `EditorContextMenu.tsx:74–85`,
`EditorChrome.tsx:324–352`, `ShellMenuRow.tsx:315–329`); `document.querySelector('.application-frame')` appears seven
times; `formatShortcut(...currentPlatform())` is called at eight sites and presented five different ways (`data-shortcut::after`,
a real `<span>`, `aria-keyshortcuts`, `title`, `<kbd>`). Thirteen `document`-level `keydown` listeners exist in the UI tree.

**UI-4 Tab context menu ignores where it was invoked (owner's "menu on the right side").** `DocumentTabs.tsx:1217–1220`
stores only the document id; the menu's nearest positioned ancestor is `.shell` (`AppShell.module.css:18`), and
`DocumentTabs.module.css:228–230` positions it `right: var(--app-gap); top: 3rem` — shell-relative, hence far right. The
tests pin parity-capture coordinates (`left:210px; top:106px`) instead (`DocumentTabs.module.css:234–251`;
`DocumentTabs.test.tsx:158–175`). R14/R15/R16 in Appendix D carry the measured browser evidence.

**UI-5 Second-click behaviour differs per menu.** File/About handlers always set open=true (`ShellMenuRow.tsx:694–701,
823–830`); Settings toggles (`SettingsMenu.tsx:588`); View writes open state from two paths. Browser-observed in
revision 1: File/About/View stay open on second click, Settings closes.

**UI-6 EditorContextMenu steals focus while closed.** Its `pointerdown` listener has `[]` deps, runs while closed and
calls `openerRef.current.focus()` on every pointerdown after first use (`EditorContextMenu.tsx:102–110,121,210`).
Code path confirmed; visible consequence not runtime-verified.

#### 5.2.3 Bars, tabs, tools: no shared frame, no shared button

**UI-7 The menubar is rendered as a child prop of the appearance controller.** `AppearanceControls` owns theme state and
renders `settingsMenuRenderer` (`AppearanceControls.tsx:182–188`); production passes the whole `ApplicationShellMenu` →
`<ShellMenuRow>` through it (`App.tsx:237–405,1990`). The top bar therefore depends on a settings widget's lifecycle,
and `AppearanceControls.module.css:1–6` carries an unused fixed-position fallback for it.

**UI-8 ShellMenuRow contains two full copies of every menu.** Desktop (Radix) and ≤376px (raw portals) branches
duplicate File (`:720–779` vs `:920–972`), About (`:849–866` vs `:987–999`), Settings/View mounts (`:783–813` vs
`:1004–1034`) and four identical trigger handlers (`:694–708,823–837`): about 150 duplicated JSX lines whose element types
differ, so keyboard behaviour differs by window width.

**UI-9 No Button/Tool primitive.** Eleven button-like controls each own their metrics: menubar trigger 28px/6px 10px/7px
(`MenuSurface.module.css:33–61`); row action 28px (`ShellMenuRow.module.css:43–62`); tab 7px 12px/9px with theme
geometry overrides (`DocumentTabs.module.css:74–147,295–321`); tab close glyph 14px (`:149–172`); tab add 28×28 (`:153–177`);
toolbar tool 30px/0 8px/7px (`EditorChrome.module.css:9–111`); arrangement segment 5px 12px (`:120–130`); dialog
Segmented 0.375rem/0.25rem with `outline` focus (`Segmented.module.css`); status pill 2px 9px/16px; dialog buttons in two
CSS modules (`ModalShell.module.css:71–93`, `SettingsDialog.module.css:66–82`, only one with focus-visible); toast,
shortcuts-close, about-close and launcher buttons each separate. The formatting toolbar's private `ActionButton`
(`EditorChrome.tsx:107–166`) is the closest thing to the owner's "tool button" and is not exported.

**UI-10 Toolbar cannot be composed without tabs.** `EditorChrome` mounts `<DocumentTabs>` (`EditorChrome.tsx:416–422`),
owns the overflow popup engine, the arrangement radio (duplicating `Segmented`, `:391–406` ≡ `Segmented.tsx:17–35`),
the editor keyboard shortcuts (`:252–278`) and application-menu overflow items. Group order and placement are spelled
out twice (`:429–452` vs `:508–535`); text-vs-icon appearance is decided twice (`textualControlIds` `:62–66` and CSS by
action id `EditorChrome.module.css:88–92,157–168`).

**UI-11 Theme selectors change geometry, not only colour, inside widget CSS.** Material tabs get radius 18px and padding
8px 15px, Minimal a 2px underline and 8px 12px (`DocumentTabs.module.css:295–321`, literals bypassing `--tab-padding` /
`--tab-radius`); row heights per theme in `tokens.css:410–413,464–468`; Minimal removes toolbar group padding
(`EditorChrome.module.css:471–476`) and pane border/radius/gap (`EditorView.module.css:147–175`); Glass toggles
`backdrop-filter` in three widget files. These are `:global(:root[data-theme])` selectors in widget stylesheets rather than
token swaps, so a theme skin is spread over seven files. (Distinct skins are allowed by the spec; the placement is the
defect.)

**UI-12 Parity capture rules live in production CSS and code.** `data-parity-shell` selectors: EditorChrome 34,
CodeEditor 10, DocumentTabs 8, base 4, AppShell 3, with literal pixel positions and Arial glyph fallbacks
(`DocumentTabs.module.css:234–278`); `EditorView.tsx:270–278` and `CodeEditor.tsx:156–160,396–400` branch on `?parity-case`.

#### 5.2.4 Panes, status bar, sidebar, dialogs

**UI-13 No Pane component.** Editor and preview are two hand-written `<section className={styles.pane}><header …>`
blocks (`EditorView.tsx:307–311` vs `:489–502`) sharing CSS classes only; the paused-preview layout reaches through
renderer internals with `display:contents` and `:has()` (`EditorView.module.css:31–66`, Appendix D R17).

**UI-14 No Sidebar component.** The only sidebar is an empty `<aside>` (`AppShell.tsx:239–243`) whose width/resize logic is
embedded in `AppShell.tsx:111–225` and reconciles pending width by inspecting notification text
(`details.operation === 'update layout'`, `:109–120,179–191`); the assistant region is a grid track
(`--shell-assistant-collapsed-width: 0`).

**UI-15 Status bar has two fact inventories** (row and Details) and Details omits word count (R19); the Details popup is a
sixth popup surface with no Escape/outside dismissal (UI-2, UI-3).

**UI-16 Dialogs: four modal lifecycles, four overlay stylesheets, four focusable-selector strings.** `ModalShell` is used by
ClosePrompt, ExternalChangePrompt and the recovery quit only; `SettingsDialog.tsx:53–107`, `AboutDialog.tsx:19–55`,
`ShortcutsDialog.tsx:36–69`, `NormalizationPrompt.tsx:24–28,53–58` (no trap, no restore, no portal) re-implement it.
Overlay/content CSS is copied in four modules with max-widths 42/32/32/38rem; the focusable selector string exists in
four variants (`ModalShell.tsx:12–19`, `ShortcutsDialog.tsx:23`, `SettingsDialog.tsx:35`, `AboutDialog.tsx:39`).
`ExternalChangePrompt` is mounted in three places (`DocumentTabs.tsx:1345–1350`, `App.tsx:2091–2104`) with the conflict
decision logic duplicated (`DocumentTabs.tsx:455–527`, `App.tsx:1713`).

#### 5.2.5 Residue and tokens

**UI-17 Dead and undefined design tokens.** 34 tokens in `tokens.css` are referenced by no `var()` (among them
`--icon-stroke`, `--editor-pane-*` ×6, `--tab-row-height`, `--hl-*` ×8, `--md-*` ×5, `--parity-overlay`); two tokens are
used but never defined (`--menu-trigger-line-height` in `MenuSurface.module.css:43` and `ShellMenuRow.module.css:49`;
`--font-size-sm` in `ShortcutsDialog.module.css:64`). Repeated literals where tokens exist: `7px 10px`, `8px` row radius,
`22px` gap, `250px`, `11px`, `size={15}` ×6, `1.75` stroke ×2. Unused files/props: `PreviewView.tsx`, `ViewModeToggle.tsx`,
`AppearanceDialog.tsx` (2-line re-export), `TabContextMenu` `adapter` prop (`void adapter`, `:119`), `SettingsMenu`
editor-settings props never read (`:40–41,345–362`), `StatusBar.readOnly` never passed.

**UI-18 Primitive adoption is the exception.** Consistently adopted: Toast, Banner, LiveRegion, AppBrand,
DocumentIdentity — each with a single call site. Every multi-consumer family has a primitive that most consumers bypass:
MenuSurface (bypassed by File/About/overflow/tab-context/editor-context/toolbar-overflow), ModalShell (bypassed by four
dialogs), Segmented (bypassed by toolbar arrangement and Settings mode radiogroup), Icon (bypassed by PreviewPane and the
tab `×`/`+` glyphs), MenuTrigger (bypassed by the toolbar-overflow `<summary>` and the Details button).

#### 5.2.6 God components

| File | Lines | Concerns held together |
| --- | ---: | --- |
| `App.tsx` | 2,179 | bootstrap/retry; menu-request routing; four dialog open states; two normalization flows; two external-conflict flows; close plans incl. native close/quit/recovery; the write pipeline; New/Open/Recent/Reopen/Activate entry commands; remediation, toasts and live region; shell-menu prop assembly (`:237–405`); editor session install. 19 `useState`, 7 `useRef`, 36 `useCallback`, 11 selectors, 29 adapter call sites across six adapters. |
| `DocumentTabs.tsx` | 1,355 | tab strip; drag-reorder engine (`:775–1022`); foreground external-change sweep and prompt (`:382–527,1345`); tab shortcut listener (`:1039–1107`); remediation slot; live-region announcer; context-menu host and focus restore. |
| `ShellMenuRow.tsx` | 1,041 | four menus × two layouts; `useShellShortcuts` installation (`:452–492`); narrow popup geometry; menu-request handling; File availability rules; window-row actions. |
| `EditorChrome.tsx` | 591 | toolbar; overflow popup engine; arrangement radio; editor shortcuts; application-menu overflow; tabs mount. |
| `SettingsMenu.tsx` | 610 | quick-theme swatches; mode radiogroup; popup lifecycle and clamp; settings entry points. |

### 5.3 Go backend

The layering intent largely held (no import cycles; `apperr` imports nothing internal; handlers call only services;
disk I/O happens outside the model mutex). The problems are concentration, hand-synchronised lifecycle state, test seams on
the production API, and copy-paste of the same six patterns. Line numbers are at `883fd05`.

| Package | Size | Note |
| --- | --- | --- |
| `internal/appmodel` | ≈6,700 lines in 26 files; `service.go` 1,040, `save.go` 719, `close_plan.go` 716, `conflict.go` 631, `file_lifecycle.go` 451 | Model, save/autosave/conflict/close machinery, three SQLite repositories and the bound handler in one package |
| `internal/apperr` | `results.go` 567 (55 type declarations, 13 hand-written `*Result` envelopes), `classified_error.go` 288 | The DTO dumping ground `KNOWN_ISSUES.md` item 8 predicted |
| `internal/application` | 6 files, 769 lines | Composition root, lifecycle handler, native close/window |
| `internal/settings` | 894 lines | Typed groups over one KV table, sqlc used here only |
| `internal/file` | ≈1,200 lines | Paths, classified reads, atomic replace, clipboard/reveal ports — the cleanest package |
| `internal/gate` | 30 lines | Stage-3 seam, no production importer |
| `cmd/native-evidence` | ≈1,600 lines (build-tagged) | Second host root (§5.6 TL-8) |

**BE-1 Document lifecycle state is spread over ten maps and eight counters, synchronised by hand.** `AppModelService`
(`service.go:23–64`) has 40 fields: one `RWMutex`; five maps keyed by document id (`documents`, `autosaveTimers`,
`autosaveInFlight`, `writeCoordinators`, `conflicts`); five keyed by minted tokens whose values carry a document id
(`reservations`, `saveReservations`, `normalizations`, `keepMine`, `closePlans`); two timer families; eight monotonic
counters (`state.revision`, `tabSetRevision`, per-document `ContentRevision` and `committedRevision`, `autosaveGeneration`,
`pending.generation`, layout `sequence` + `writerID`). Closing a document (`close_plan.go:544–558`) must remember five
cleanups and forgets `writeCoordinators` (C3), `normalizations` and `saveReservations`; `UpdateBuffer`
(`document.go:66–73`) has its own partial sweep. There is no single `forgetDocumentLocked`. This is the structural cause
behind C1, C3 and C7 in Appendix A.

**BE-2 Test seams are part of the production API.** Zero production callers: `SetConflictReadersForTesting`
(`service.go:192`), `SetBeforeSaveAsRecheck` (`:281`, invoked in the Save As hot path through a recover-wrapped
`callSaveHook`, `save.go:196–202,632–640`), `SetWriteExecutorForTesting` (`:289`), `SetLayoutTimer` and
`NewAppModelServiceWithLayoutRepositoryAndTimer` (`:68,117,157`; doc comment "production never calls this"),
`NewAppModelServiceWithAutosaveTimer` (`autosave.go:60`). Five of the six service constructors are test-only; only
`NewAppModelServiceForHost` (`service.go:99`) is used by the root. `SetWriteCommitObserver` (`:297`) has one caller: the
evidence driver. Unexported race injectors live inside production repository structs (`afterReadDecision`,
`layout_repository_sqlite.go:20,51–52`; `recent_files_repository_sqlite.go:20,105–108`). `main.go:29–35` exposes package
variables so `main_test.go` can swap them. Two runtime type assertions exist so that "older test doubles can continue"
(`appmodel/handler.go:48–56,134,149,164`; `application/handler.go:27–29,99,124`), and `SetCloseCoordinator` keeps a
"legacy flush" branch only tests reach (`application_context_holder.go:230–251`). No environment or flag branches exist,
and `native_evidence` tags are confined to `cmd/` — the leakage is through the API, not build tags.

**BE-3 Six copy-paste families.**

| Pattern | Copies | Evidence |
| --- | ---: | --- |
| Handler `defer/recover` envelope | 35 blocks, ≈216 lines, 24 distinct panic messages; `context()`/`zlog()` helpers ×3; panic format constant ×2 | `appmodel/handler.go` (26 methods), `settings/handler.go` (9), `application/handler.go` (6). No shared guard helper. `SettingsHandler` takes a concrete `*SettingsService` while `AppModelHandler` takes an interface. |
| Lock → snapshot → mutate → publish → unlock | 21 sites (`snapshotLocked()` ×21, `publishLocked(` ×21); 80 `Lock()` vs 127 `Unlock()`, 31 `RLock()` vs 52 `RUnlock()` because unlocking is manual per branch | Two divergent emit paths: `publishLocked` (`service.go:924–940`, rolls back on failure) versus inline `defer recover(); EmitStatePatch` copies in `save.go:397–406,441–446` that do not. `snapshotLocked` deep-copies the whole state on every mutation, including each `UpdateBuffer` (`document.go:57`). |
| KV repository code | four repositories on the same `settings` table | sqlc (`sqlc.yaml`, 2 queries) is used by one consumer (`settings/repository_sqlite.go:213–283`) and even there `ResetAppearance` inlines the upsert literal (`:155–172`). Raw `SELECT value FROM settings WHERE key = ?` at `layout_repository_sqlite.go:29`, `file_metadata_repository_sqlite.go:26`, `recent_files_repository_sqlite.go:136`; upsert literal ×3; versioned-JSON envelope decode ×3; two SQLite-busy classifiers (`recent…:211` vs `db/db.go:252`); `sameRecentFiles` ≡ `sameStringSlice` in one package. The settings repository unrolls 5 `Get*` and 5 `Update*` by hand; `UpdateAppearance/Markdown/Editor` have no transaction (C8) while `ResetAppearance` does. |
| Classified error construction | 5 per-domain wrappers + 10 result-wrapping helpers + 22 direct calls, all of shape (category, subject, message, remediation, id) → Result | `file_lifecycle.go:448`, `save.go:656–678`, `close_plan.go:503,703`, `conflict.go:619`, `copy_path.go:102,107` (byte-identical bodies differing in return type), `tab_session.go:64`, `tab_reorder.go:69` |
| `*Result` envelopes | 13 hand-written structs, two error vocabularies (`*WireError` ×5, `*ClassifiedError` ×8), 3 pure-synonym aliases | `apperr/results.go` |
| Host wiring | ≈60 verbatim lines between `main.go:160–234` and `cmd/native-evidence/main_native_evidence.go:150–306` (options, close coordinator, native-window adapter, menu wrapper, Bind/EnumBind) | The driver's own comment (`:122–130`) records the drift this caused |

**BE-4 Layering leaks.** `appmodel` imports the Wails runtime (`runtime_emitter.go:8`) and `bootstrap` (for `Version()`,
`service.go:15,375`); it hosts three repositories and `database/sql`, so the "Repository" layer lives inside the service
package. `NativeWindowService` holds `*appmodel.AppModelService` (`native_window.go:31`). `main.go` is not pure wiring: ≈90
of 234 lines generate GTK case-insensitive globs (`:104–149`) and adapt the native window (`:206–227`). `holder.Init` opens
the DB, migrates and reads settings twice while holding `holder.mu`, and every handler's `contextProvider` takes the same
mutex (`application_context_holder.go:104–150`).

**BE-5 Errors are dropped on paths users care about.** `autosave.go:227` `_ = service.executeWrite(...)` (C4) and `:209–211`
(a detected conflict dropped); `service.go:758` passes a layout-persistence failure through `ToWire` with `zerolog.Nop()` so
it is logged nowhere, then discards the emit error; publication failures silently rolled back at `tab_session.go:146`,
`conflict.go:200,482`, `recent_files.go:34`, `copy_path.go:99`; `settings/service.go:187–190` returns success when the
read-back after `ResetAppearance` fails; `file_lifecycle.go:352` ignores `SetDocView` on reopen. `appmodel` never logs — its
only zerolog use is `zerolog.Nop()`.

**BE-6 Concurrency risks beyond C1–C3 (source-level, not reproduced).** Emitter invoked while holding the write lock
(`publishLocked`, `service.go:924–940`) — any future Go-side event listener that calls back deadlocks, and the invariant is
undocumented. `file_lifecycle.go:245–316` mutates tab state, releases the lock for recent-file promotion, re-locks and
publishes; a later rollback can erase a concurrent command's changes. `conflict.go:255–295` captures an `*openDocument`
under `RLock`, drops the lock, then mutates under a fresh `Lock` without re-lookup. `close_plan.go:304–375` can leave a plan
`Executing` forever if `closeDocuments` fails. Layout `AfterFunc` handles are not retained (`service.go:587–591`).
`GetState` performs a DB read plus one `os.Stat` per recent entry and a possible write-back on every hydration
(`recent_files.go:11–25`, `recent_files_repository_sqlite.go:34–56`).

**BE-7 Comments narrate history.** 1,174 production comment lines; 23 cite `T###`, 32 `FR-…`, 12 `SC-`. The eight longest
blocks are mostly war stories: `close_drain.go:7–40` ("Until T134 shutdown drained one of the three…"),
`classified_error.go:62–84` (T116/T159 narrative), `service.go:120–139` (justifying a test-only setter),
`file_lifecycle.go:206–223` (history of a function that no longer exists), the T117 `doc-0000000000000003` story told three
times (`save.go:642–655,683–699`; `classified_error.go:207–220`). `main.go:104–120` (GTK globs) is the counter-example: a
current invariant, well stated.

**BE-8 Dead exported surface.** Zero production callers (heuristic): `apperr.Busy/Cancelled/Permission/Timeout/
AllowedRemediations/DeduplicationKey/Validate/StringResult`; `application.StartupReady`, `NewDocumentDialogsWithSave`,
`ShowWhenFrontendReady`; `appmodel.LayoutRepository()`, `AutosaveEnabled()`, `WriteCoordinator` alias, `WritePublisher`
(always nil in production, `save.go:470`), `conflictQueue.BlockedDocumentIDs/Len/Current`; `file.ClipboardWriterFunc`,
`RevealPortFunc`, `ReadClassified`, `ReadOutcome`, `AtomicReplacePhase`; `logging.Reconfigure`; the whole `internal/gate`
package. `ContentAccessor`/`DocumentCommands` (F2/F3 seams) are intentionally unused and should stay.

**What to preserve.** The import direction; `apperr` as a leaf; handler → service → repository calls; disk I/O outside
`service.mu`; per-document write coordinators and `waitForIdle`; `SettingsService` releasing its lock before observers;
`internal/file`'s bounded reads, same-directory atomic replace, BOM/CRLF/permission preservation and post-commit
distinction; WAL + busy timeout + additive goose migrations + corruption quarantine in `internal/db`.

### 5.4 Tests: what they prove, where they live, how they are named

Inventory at `883fd05`: 66 Go test files (14,944 lines) and 94 frontend test files (33,980 lines; Jest 79, Playwright 11,
`node --test` 2, one fixture test), against 12,171 lines of Go and 20,785 lines of frontend production code. The
categories below were assigned per file by reading each file; counts marked *est.* are heuristic.

#### 5.4.1 Classification

| Go test kind | Files | Examples |
| --- | ---: | --- |
| Behaviour through exported API, real files or real SQLite | 27 | `internal/file/codec_test.go`, `internal/settings/repository_sqlite_test.go`, `internal/db/*`, `internal/application/*` |
| Behaviour through unexported state or helpers | 22 | `internal/appmodel/{save,service,close_plan,conflict,autosave,…}_test.go`, `internal/file/atomic_replace*_test.go` |
| DTO shape / reflection | 4 | `internal/apperr/results_test.go:12–75` (key sets), `internal/application/host_ports_wiring_test.go` (reflect over unexported fields), `internal/appmodel/document_consumer_test.go:31–58` (two dummy consumers that only `_ = snapshot.X`) |
| Source-text / repository-file assertions | 1 | `main_test.go`: walks `frontend/src` for substrings (`:197–226`), reads `go.mod`/`justfile`/`wails.json` for `CGO_ENABLED=1` (`:590–640`), fails if `".md"` appears twice in `main.go` (`:784`), reads `wailsjs/*.d.ts` (`:430,449`), shells `git ls-files` (`:546`) |
| Paperwork (reads specification documents) | 2 | `spec_clause_count_test.go:33–43` (counts `- Q:` bullets in `specs/003/spec.md` and compares with a phrase in `plan.md` and an evidence ledger); `internal/apperr/contract_table_test.go:23` (parses a markdown table out of `specs/003/spec.md`) |
| Architecture lint (AST) | 2 | `architecture_test.go` (9 gates), `internal/apperr/architecture_test.go` |
| Build pipeline inside `go test` | 4 | `native_evidence_safeguards_test.go:16–55` (two full `go build`s of the desktop app, `go tool nm`, `node …check-boundaries.mjs` twice); `cmd/native-evidence/*_test.go` ×3 (build-tagged, never run by `just go-test`) |
| Mock asserting the mock | 2 | `internal/file/clipboard_test.go`, `reveal_test.go` (adapter forwards an argument; test asserts the closure got it) |
| Helper-only files | 2 | `internal/appmodel/layout_test_helpers_test.go` (with a `var _ = …` list to silence unused-helper lint), `internal/file/document_fixtures_test.go` |

All 66 Go test files are white-box (`package <prod>`, zero `_test` packages); an estimated 32 reference unexported
identifiers. `save_test.go` calls `flushAutosave`, `inspectDocument`, `mintDocumentID`, `openDocument`, `prepareWriteDisk`,
`refusedWrite`, `snapshotForWrite`; `layout_repository_sqlite_test.go` touches unexported fields 45 times. Moving these
tests out of the package is therefore an API-boundary change, not a file move (V4).

| Frontend test kind | Files | Notes |
| --- | ---: | --- |
| Behaviour (RTL, hooks, reducers, adapter over a mocked bridge) | ~55 | `logic/**` (25 files), primitives (7), and widgets such as `ClosePrompt`, `TabContextMenu`, `EditorContextMenu`, `PreviewPane`, `AppearanceControls`, `SettingsDialog`, `Launcher` |
| Behaviour mixed with source-text assertions | 15 | 197 `expect()`s against file text out of 2,228 (*est.* 9 %): `AppShell.test.tsx` 41, `ShellMenuRow.test.tsx` 35 (reads four CSS files and two `.tsx`), `DocumentTabs.test.tsx` 25 (eight `readFileSync`), `EditorView.test.tsx` 17, `EditorChrome.test.tsx` 16, `App.test.tsx` 10 (asserts `AppShell.tsx` contains no `fetch` by regex, `:402–410`; asserts `source.toContain('settingsOpen \|\|')`, `:363–370`) |
| Pure source-text | 3 | `ui/styles/tokens.test.ts` (528 lines grepping CSS), `CodeEditor.bundle.test.ts` (reads `package.json`, spawns the network scanner), `public/theme-bootstrap.test.mjs` |
| Architecture lint via the TypeScript compiler API | 1 | `useDocumentCommands.test.ts:200–215` |
| Tests of the mock bridge itself | 3 | `src/dev/bridge-mock/*.test.ts`: 681 lines testing a 2,351-line fake |
| Pixel-parity harness unit tests (Jest under `e2e/parity`) | 9 | 1,982 lines; e.g. `manifest.test.ts` "contains exactly 306 primary keys"; `accounting.test.ts:28` reads `playwright.config.ts` as text |
| Playwright pixel parity | 3 | `targeted-parity` 1,667, `real-files-parity` 1,222, `interactive-states` 185 = 3,074 lines |
| Playwright behavioural journeys | 8 | 5,087 lines (`real-files-and-tabs` 1,216, `window-shell` 920, `narrow-width` 806, `core-editor` 740, `editor-stage` 681, `offline-and-controls` 358, `launcher-binding` 184, `appearance` 182) |

CSS modules are mapped to an identity proxy in Jest (`src/test/styleMock.ts`), so no Jest test can observe real styling;
that is why fifteen files grep stylesheets instead. `App.test.tsx` (3,292 lines, 50 tests) mocks `AppShell`, `EditorView`,
`StartupFailure`, `i18n` and the whole adapter: the application suite renders an application whose shell and editor are
fakes. `jest.config.mjs` maps `../../i18n` to `src/test/i18nShim.ts` for every widget test, so widget tests never see the
real catalogue.

**T-1 The suite named E2E never reaches the Go backend.** `playwright.config.ts:81–92` starts `npm run dev` (Vite with
`src/dev/bridge-mock`) and a reference server that serves `docs/delivery/spec/surface/mockup.html`. No test under
`frontend/e2e` references `wails dev`, `build/bin` or the Wails port. The only real-backend UI exercise in the repository
is the build-tagged `cmd/native-evidence` driver, which no recipe runs (§5.6).

**T-2 One fifth of all test code verifies pixels against a static mockup.** Parity infrastructure 4,845 lines +
harness tests 1,982 + pixel journeys 3,074 = 9,901 of ~49,000 test lines; it depends on `docs/delivery` and on
production `?parity-case` branches (UI-12). The Playwright `webServer` needs `mockup.html`, so **all eleven Playwright
suites fail to start** if `docs/delivery/spec/surface/` is removed.

**T-3 Tests that fail if `specs/` or `docs/` are archived** (V4 violation): `spec_clause_count_test.go`,
`internal/apperr/contract_table_test.go`, `e2e/parity/reference-adapter.test.ts` (six reads of the mockup),
`reference-server.ts:59` (and therefore every Playwright run), `accounting-io.ts:45` and the global teardown (write into
`specs/003/evidence/…`), `attributed-residuals.ts:16–22` (reads `specs/003/evidence/ft-vs-08/phase-17|18/*.md`),
`native_evidence_safeguards_test.go:54,73` (needs `frontend/evidence/check-boundaries.mjs` + `boundaries.json`).

**T-4 Test infrastructure is ~19 % of test code**: `e2e/parity/*.ts` 4,322, `targeted-manifest.ts`+`painted.ts` 523,
`e2e/helpers` 287, bridge mock 2,351, `frontend/evidence` 774, `frontend/scripts` 710, Go helpers 323 ≈ 9,290 lines.

**T-5 Redundant coverage.** EditorView is tested three ways (`EditorView.test.tsx` mocking CodeEditor,
`EditorView.integration.test.tsx` 2,144 lines, `editorSession.integration.test.tsx` mocking CodeEditor again) plus
Playwright `narrow-width`/`window-shell`. `DocumentTabs.test.tsx` (2,005 lines, 51 tests, 8 of them CSS greps) overlaps
`TabContextMenu.test.tsx`, `tabLabel.test.ts`, `appModelAdapter.test.ts` and 25 Playwright tests. Settings is covered by
five files. The bridge mock is tested three times (its own tests, every Playwright suite, and `App.test.tsx` mocking the
adapter above it).

#### 5.4.2 Naming and anchors

| Metric | Count |
| --- | ---: |
| Frontend `it`/`test` titles | 715 |
| …containing a task/requirement ID | **520 (73 %)**, 519 of them starting with it |
| ID mentions in frontend tests: `T###` / `FR-FT` / `STORY` / `FR-WS` / `SC-FT` | 626 / 278 / 119 / 55 / 20 |
| Go `func Test…` names containing an ID | 2 of 293 |
| `// Proves:` comments in Go / TS | 182 (46 files) / 223 |

Representative titles: `STORY-001-AC-2 renders the blank application root`; `T058 includes the Shortcuts dialog in the
shared modal suppression state` (asserts source text); `T033 applies the contained tab-strip metrics and fixed add-control
size` (greps CSS); `STORY-028-AC-4 (EC-DOCS-12) preserves newer local view values and focused Monaco content …`;
`manifest contains exactly 306 primary keys`. Good ones exist and show the target style: `immediate Save waits for pending
keystroke`; `committed result rehydrates without duplicate Save`; `TestSaveRefusesMixedEndingsBeforeTouchingTheDisk`.

The convention is traceable: the initial specification's traceability generator asked for
`it('STORY-031-AC-1 …')` (`50d692d:…/03_TRACEABILITY.md:47–50`); the generator and `docs/traceability.yaml` were deleted on
2026-07-25 (`927d15f`); the naming survived two further regimes (`Proves: <feature>#<anchor>` on 2026-07-28, `// Proves:
FR-…` plus "a task id may lead the title" in `AGENTS.md`). The project's own rule forbids the practice the tests embody
(`docs/delivery/architecture/rules.md:686–705`: "A test proves behaviour, not a document … does not assert on the contents
of a Markdown file, the `justfile`, a CI workflow"), and cites 4,200 lines of such tests deleted on 2026-07-25 — they grew
back.

#### 5.4.3 Production ↔ test entanglement

| Location | Entanglement |
| --- | --- |
| `frontend/public/theme-bootstrap.test.mjs` → `frontend/dist/theme-bootstrap.test.mjs` → `main.go:26` `//go:embed all:frontend/dist` | A Node test file is embedded in the release binary (1,909 bytes; byte-identical copies). |
| `frontend/src/test/{setup,i18nShim,styleMock}.ts` | Test shims under `src/`; `i18nShim` replaces the real catalogue for widget tests. |
| `frontend/src/logic/fixtures/real-file-fixtures.test.ts` | A "fixtures" directory containing only a test that imports `e2e/helpers`. |
| `frontend/src/logic/adapter/nativeEvidenceRuntime.ts` | Evidence-harness adapter in the production adapter directory; `frontend/evidence/check-boundaries.mjs:69,88` exists solely to police that production never imports it. |
| `AppShell.tsx:54–63`, `EditorView.tsx:270–279`, `CodeEditor.tsx:156–160,218` | `?parity-case` URL branches alter production rendering for screenshot capture; `scripts/archtest-allowlist.json` formally allows exactly these three. |
| `internal/appmodel/service.go:192 SetConflictReadersForTesting`, `:266 SetClipboardWriter`, `:273 SetRevealPort`, `:281 SetBeforeSaveAsRecheck`, `:289 SetWriteExecutorForTesting` | Exported on the production service with zero production callers. `:297 SetWriteCommitObserver` has one caller: the evidence driver. |
| `frontend/src/dev/bridge-mock` | 3,032 lines (2,351 non-test) re-implementing all 24 `AppModelHandler` bindings plus seven `setMock*` controls and parity fixtures (`AppModelHandler.ts:246–333`); it is the backend of every browser test. |

#### 5.4.4 File-level disposition (input for the refactoring spec)

- **Unit, Go.** Keep `internal/apperr/{classified_error,wire,results}`, `internal/file/*` (except the two mock-self files),
  `internal/db/*`, `internal/settings/*`, `internal/gate`, `internal/logging`, `internal/bootstrap`, and the `appmodel`
  behaviour files. Rewrite `save_test.go`, `service_test.go`, `layout_repository_sqlite_test.go`, `recent_files_test.go`
  through the handler/exported service API, replacing the five test-only `Set*` seams with constructor options. Delete
  `document_consumer_test.go`, `identity_reservation_test.go` (fold into `open_lifecycle`), `clipboard_test.go`,
  `reveal_test.go`, `clipboard_platform_test.go`.
- **Unit, frontend** (to `frontend/tests/unit/`, titles rewritten): all `src/logic/**` tests except the TS-AST scan in
  `useDocumentCommands.test.ts:200–260` (→ Lint); primitives; `AppearanceControls`, `ClosePrompt`, `ExternalChangePrompt`,
  `TabContextMenu`, `EditorContextMenu`, `PreviewPane`, `SettingsDialog`, `Launcher`, `DocumentIdentity`,
  `NormalizationPrompt`, `StatusBar` (minus 9 CSS asserts), `MarkdownView`, `CodeEditor.test.tsx` (minus 4),
  `i18n/catalog`, `markdown/renderer` (minus 5), `format/formatting`, `scripts/generate-editor-themes.test.mjs`. Remove the
  `i18nShim` mapping so widgets use the real catalogue.
- **Integration, frontend** (real store, mocked bridge only): merge the three EditorView suites; merge `SettingsMenu.test.tsx`
  into `ShellMenuRow.test.tsx` minus its 35 text asserts; slim `DocumentTabs.test.tsx` to behaviour; rewrite `App.test.tsx`
  without mocking `AppShell`/`EditorView`, keeping startup/hydration/notification journeys (≤ 15 tests). **Integration,
  Go:** `internal/application/*` (real composition root + SQLite) and the Wails-options tests in `main_test.go:25–190,
  241–540`.
- **E2E with the real Go backend (new).** Port the eight behavioural Playwright journeys to a harness that launches the real
  composition (the `cmd/native-evidence` driver is the seed); strip `parity-case` from `narrow-width`/`real-files-and-tabs`.
  Delete the pixel-parity stack (`targeted-parity`, `real-files-parity`, `interactive-states`, `targeted-manifest.ts`,
  `painted.ts`, all of `e2e/parity/**`, the `parity` Playwright project, the three `?parity-case` branches and the
  allowlist). Delete `frontend/evidence/**`, `nativeEvidenceRuntime.ts`, `cmd/native-evidence/**` and
  `native_evidence_safeguards_test.go` once the real-backend E2E exists. Delete `src/dev/bridge-mock/*.test.ts`; keep the
  mock only for `just dev-ui` if that convenience is still wanted.
- **Lint.** Keep the AST gates in `architecture_test.go` and `internal/apperr/architecture_test.go` (with the heuristics
  fixed, §5.6); move `main_test.go:170–240, 545–660, 776–787` there or replace them with linter rules; keep one network/asset
  check; move the TS-AST scan; delete `spec_clause_count_test.go`, `contract_table_test.go` (express the remediation table
  as a Go table if it matters) and `tokens.test.ts` (replace with a stylelint rule).
- **Titles:** rewrite the 520 ID-led titles as behaviour sentences; drop or keep the 405 `Proves:` comments only where an
  accurate mapping is still wanted.


### 5.5 Documentation, comments and naming

**DOC-1 Source comments are development diaries.** The owner's example is representative. `MarkdownView.tsx:15–28` spends
fourteen lines on parent-component history, a requirement ID (`FR-FT-005`), a host-specific timing (1.5 s for 2 MiB under
WebKit) and a past-bug narrative to say: *"Reuse the rendered Markdown while `source` is unchanged; unrelated parent
updates must not rerun the parser."* The same pattern in Go: `close_drain.go:7–40`, `classified_error.go:62–84`,
`file_lifecycle.go:206–223` (history of a deleted function), the same T117 story told three times (BE-7). In CSS:
`DocumentTabs.module.css:42,381–383`, `playwright.config.ts:19–70` (a 50-line rasterisation essay), `justfile:104–137`,
`lefthook.yml:1–6`, `main.yml:3–12`. Counts: 489 task/requirement IDs in non-test production source; 23 `T###` and 32
`FR-` citations in Go comments alone. The reader of the code cannot resolve `T117` or `FR-FT-005` without the Spec Kit
tree, and the tree is planned to be archived.

**DOC-2 Test titles are identifiers.** 520 of 715 frontend titles begin with a task or requirement ID (§5.4.2). The
convention traces to the initial traceability generator (`50d692d:…/03_TRACEABILITY.md:47–50`), which no longer exists;
`AGENTS.md:64–75` still prescribes "a task id may lead the title".

**DOC-3 Public-surface documentation is absent where it matters.** Components have no prop contracts beyond TypeScript
types (e.g. `ShellMenuRow` accepts ~40 props assembled in `App.tsx:237–405`); `internal/appmodel` has no package doc
describing the lifecycle, lock order or event contract, while individual functions carry twenty-line histories.

**DOC-4 Authority documents contradict each other** (PR-1) and the current architecture map (`docs/delivery/architecture/
structure.md`) describes July's tree ("Nine Go packages … `ui/primitives/`: `Segmented`, `Toast`, `ViewMenu`"; `logic/format`
"planned — Phase 04"), so it is neither the prescription the initial spec gave nor an accurate description.

**DOC-5 `README.md` sends a newcomer to the wrong tree** (`:24–39` "everything … is in `docs/delivery/`") and advertises
`just check` as "everything CI runs" while CI also runs Playwright.

**DOC-6 The specification texts are not consistent with each other.** `docs/delivery/spec/constraints.md:134–154` ("Nothing
leaves the device", five-minute network monitor) sits next to `:158–166` ("Every rendering asset is bundled"); the
first was turned into request-API policing, the second — the owner's actual requirement — into nothing executable.
`docs/delivery/spec/surface/README.md:10–18` declares the mockup "Tier A binding … a visible difference is a defect", a
sentence the initial spec did not contain (`50d692d:specification/mockups/README.md`: "visual acceptance reference").
`docs/delivery/plan/phase-06-rich-and-safe.md:54` says "Nothing blocking" and then lists unresolved choices (revision-1 H14).


### 5.6 Tooling: commands, scripts, CI, hooks

**TL-1 The gate list is defined six times in executable form and five times in prose.** Executable: `justfile:155–164`
(`check`), CI `test` job steps (`main.yml:48–69`), `scripts/hooks/pre-push-*.sh`, `baseline.sh:117–123`,
`verify.sh:93–98`, `release-stack.sh` (~`:106–118`). Prose copies: `DOD_TEMPLATE.md:25–32`, `AGENTS.md:183–185`,
`WORKFLOW.md:214–226`, `main.yml:3–12` header, `lefthook.yml:1–6` header. The pre-push list omits `archtest` entirely
while `lefthook.yml:1` calls `just check` "the authoritative gate".

| Tool | Runs in one `scripts/release-stack.sh` | Where |
| --- | ---: | --- |
| `go test -race` full suite | 3 | check, direct, verify |
| `go test -run TestArchitecture` | 3 | archtest, check, verify |
| full Wails `go build` | **6** | `native_evidence_safeguards_test.go:22,30` builds two binaries inside every full Go test run |
| Jest | 3 | check, `npm test`, verify |
| `tsc --noEmit` | 5 | `frontend-build` ×2, `typecheck` ×2, `wails build` |
| ESLint | 5 | style ×2, architecture config ×3 via `archtest.mjs` |
| `archtest.mjs` (incl. network scan) | 3 (+3 more scans in `postbuild`) | |
| `wails generate module` | 3 | gen-check ×2, trailing cleanup |
| golangci-lint / gofmt / prettier | 2 each | |
| `CGO_ENABLED=0 go build ./...` | 3 | each archtest |

**TL-2 `justfile`: 34 recipes, 167 lines, 32 comment lines.** Wanted roles: `setup`, `build`, `fmt` (incomplete),
`baseline`, `verify`. Fourteen one-line aliases. Redundant: `go-format-check` (golangci already enables the gofmt formatter,
`.golangci.yml:20–22`), `go-vet` (`govet` enabled, `:6`), `e2e-test` (alias of `verify-ui` "named for the verb the
specification uses"), `cgo-free-check` (duplicated by `main_test.go:590–624`), `migration-immutability-check` (10 lines of
inline bash; `git diff HEAD` is always empty on a clean checkout so it is CI-blind; overlaps `TestArchitectureMigrationsOnlyAdd`).
Dead: `package` (exits 1 by design), `sqlc-check`, `vuln` (never called anywhere). Narrative comments recount T096/T132
and CI history.

**TL-3 `just fmt` formats less than half the repository.** Covered: tracked `*.go`, and `prettier --write .` rooted at
`frontend/` (minus `.prettierignore`). Not covered: `AGENTS.md`, `README.md`, `docs/**` (15 MB), `specs/**`, `scripts/*.sh`
(no shfmt/shellcheck), `justfile` (no `just --fmt`), `wails.json`, `sqlc.yaml`, `.golangci.yml`, `lefthook.yml`,
`.github/workflows/*.yml`, `.agents/**`, `.specify/**`. No root or frontend Prettier config (defaults). The pre-commit hook
formats only staged `*.ts,*.tsx,*.css` while `format:check` at push covers json/md/mjs, so a commit can pass and the
push fail.

**TL-4 Build dirties the tree.** `just build` leaves `frontend/wailsjs/runtime/{package.json,runtime.d.ts,runtime.js}` at
mode 644 with zero content change (observed at audit start); `just gen-check` and `main_test.go:545–589`
(`TestWailsBindingsRemainTracked`) then fail on the mode bit alone. Three paragraphs of `AGENTS.md:229–246` explain how to
live with this instead of fixing it once (`.gitattributes`/`core.fileMode`, or not committing generated bindings).

**TL-5 CI repeats the list by hand and cannot see the product.** `main.yml:48–69` restates the nine steps; Node 22 in CI vs
24 locally with no `.nvmrc`/`engines`; no `wails build`, no OS matrix, no real-backend E2E; the `interface` job runs
Playwright against the mock; `release-skeleton` is an `echo`. `native_evidence_safeguards_test.go` builds with
`-tags desktop,production` inside `go test`, which on `ubuntu-24.04` needs GTK/WebKit headers the workflow never installs
(likely red in CI; not run here).

**TL-6 Architecture "lint" is scattered and partly name-based.**

| Rule | Where | Assessment |
| --- | --- | --- |
| Bound handlers return `*Result`, no `context`, recover first | `architecture_test.go:124,154,179` | Genuine; but discovery is "type name ends in `Handler`" (`:101–114`), so a renamed type escapes. Derive the set from `main.go` `Bind:`. |
| Only the composition root calls `New*` | `:224` | Regex on selector names; `Make…` or a func value bypasses. The real rule is import direction → `depguard`. |
| Migrations add-only | `:264` (+ `justfile:91–101` twin) | Keep the cheap SQL lint; drop the CI-blind twin. |
| No `net`/flock imports | `:301–364` | Aliased import or `net.Dialer{}` bypasses → `depguard`/`forbidigo`. |
| Document struct has identity + content accessor | `:365` | Forward-compatibility paperwork. |
| Only `UpdateBuffer` has a param named content/text/value | `:434` | Rename the parameter and it passes. |
| Remediation × category table | `:506` | A unit test misfiled as architecture. |
| CGO-free by grepping `go.mod`/`main.go`/`justfile`/`wails.json` | `main_test.go:590–624` | Duplicates `cgo-free-check`; a test that reads the `justfile`. |
| wailsjs files tracked at 100755 | `main_test.go:545–589` | Encodes the mode-bit saga; failing on this checkout. |
| adapter-only `wailsjs` import | `eslint.architecture.config.js:25` **and** `check-boundaries.mjs:19–65` | Keep once, in the main ESLint config. |
| Colour literals only in `tokens.css` | `archtest.mjs:89–130` | Useful intent; template strings bypass → stylelint. |
| `?parity-case` branch budget | `archtest.mjs:151–190` | Harness paperwork. |
| Prohibited network calls | `archtest.mjs:194`, `package.json` `postbuild`, `architecture_test.go:301` | Keep one per language, reframed as asset-bundling (V1). |
| Evidence-driver import lists, marker strings | `check-boundaries.mjs:19–199`, `native_evidence_safeguards_test.go` | Builds two binaries and greps `go tool nm` for a substring. |
| Spec markdown files agree on "44" | `spec_clause_count_test.go` | Paperwork. |
| Removed recipes/scripts stay removed | `baseline_verify_test.sh:146–160` | Paperwork; no caller. |

**TL-7 `scripts/` does not contain the owner's five scripts.** It contains `baseline.sh` (257 lines), `verify.sh` (197),
`evidence_id.sh` (76), `release-stack.sh` (178), `baseline_verify_test.sh` (163, no caller, and a cleanup trap that can
delete a pre-existing fixture directory), and three hook wrappers. `verify.sh` can report PASS with missing baseline inputs
(revision-1 B1, reproduced); baseline identity parsing is lossy (B6). There is no Build script, no Test script with
categories, no Format script, and no E2E.

**TL-8 `cmd/native-evidence` is a second composition root that nothing runs.** 2,169 build-tagged lines; it constructs the
same `NewApplicationContextHolder` (`main_native_evidence.go:48` vs `main.go:57`) but then declares **its own
`options.App` literal** re-stating title, size, menu, `Bind`, `EnumBind` and `OnBeforeClose` (`:148–212`) instead of
reusing `newAppOptions`. `host_ports_wiring_test.go:20–30` records that this parallel wiring once silently dropped
correctly wired services. No recipe builds its frontend bundle (`frontend/evidence/vite.config.ts` →
`dist-native-evidence/<scenario>`) or runs the binary; `release-stack.sh:121` runs only its Go unit tests, and
`native_evidence_safeguards_test.go` builds it solely to prove it is excluded. It is the seed of the real-backend E2E the
project lacks, guarded by ~300 lines of paperwork.

**TL-9 `frontend/src/dev/bridge-mock` is a TypeScript backend.** Selected by `vite.config.ts:34–39` for every mode except
`wails`/`production`; implements 24/24 `AppModelHandler` bindings plus fixture controls; documented as diverging from Go
(`KNOWN_ISSUES.md` #3, #4). Legitimate as a `just dev-ui` convenience; wrong as the E2E backend.

**TL-10 Repository hygiene.** `test-results/.last-run.json` at repo root is tracked (`.gitignore:35` covers only
`frontend/test-results/`); four root Go test files, two of them paperwork; `specs/**/evidence` 42 MB tracked (21 MB under
002); `sqlc.yaml` at root while `sqlc-check` is never called; `lefthook.yml` header is a CI history essay; `.specify/feature.json`
— the pointer to "the authority" — is gitignored (`.specify/.gitignore:6`), so a fresh clone has no active feature.

### 5.7 Agent instructions, skills and process authority

**PR-1 Four different answers to "what is normative".** `README.md:24–26`: everything is in `docs/delivery/`.
`docs/delivery/README.md:3–4`: nothing outside `docs/delivery/` is normative. `AGENTS.md:10–16,258–260`: authority is
`specs/<feature>/` named by `.specify/feature.json`; `docs/delivery/` is reference-only. `constitution.md` §I:
`docs/delivery/spec|architecture` are authority "until migrated". `WORKFLOW.md:189–213` still routes work through
`/plan-story` on `docs/delivery/work/`. Evidence is split between `specs/<feature>/evidence/baseline` and
`docs/delivery/work/baselines/` with a hard-coded exception table (`evidence_id.sh:33–40`). `master`'s `CLAUDE.md` (the
one this session's harness loaded) still describes the July regime (`specification/`, `docs/stories/`, `just trace`).

**PR-2 Instructions reference commands and files that do not exist.**

| Reference | Where | Exists |
| --- | --- | --- |
| `just story-check` | `WORKFLOW.md:88,109,169,221,226,260,270–271`; `.agents/commands/build-story.md:28`; `plan-story.md:86` | No — and `baseline_verify_test.sh:151–155` asserts it must not exist |
| `just spec-check` | `WORKFLOW.md:144,222,226`; `plan-story.md:167`, `reconcile.md:20`, `finish-phase.md:20` | No |
| `scripts/check_story.py`, `scripts/check_proves.py` | `build-story.md:28,118`; `plan-story.md:86` | No (deleted `53af8e4`) |
| `sync-agent-files.py --apply` | `AGENTS.md:268` | No |
| `.claude/commands` "mirrors `.agents/commands`" | `AGENTS.md:262` | No — `.claude/` holds only `skills/` |
| `jest.config.js` | `AGENTS.md:193`; `playwright.config.ts:6` | No — it is `jest.config.mjs` |
| `justfile:145` for `check` | `AGENTS.md:184` | Wrong line (`:145` is `sqlc diff`; `check` is `:155`) |
| "the 10 `speckit-*` skills" | `AGENTS.md:265` | `.agents/skills` has 17; seven extension skills exist only on the Codex side and in neither integration manifest |
| KNOWN_ISSUES #9 "CI only on a tag", #15 "archtest in no CI job" | `KNOWN_ISSUES.md:127–139,256–273` | Stale since 2026-08-16 (`main.yml:15–23,66–67`) |

**PR-3 `AGENTS.md` is one third war stories.** Of 269 lines, `:183–254` (72 lines, 34 % of the "what will bite you"
section) are dated incidents: 2026-08-13/14 failures, T034/T173, `619px`, `~332 antialiasing pixels`, `2,554 vs 709
pixels`, three separate paragraphs on the wailsjs mode bit, Wails source line numbers. Of the eight "non-negotiables"
(`:130–141`), the table itself marks six as "(advisory)"; the one attributed to lefthook ("never `--no-verify`") cannot be
enforced by the hook it bypasses. Mechanically enforced today: handler shape, adapter-only `wailsjs` import, colour
literals, no-network grep, migrations add-only, CGO-free, gen-check drift, UNRELIABLE-baseline refusal. Everything else is
advisory.

**PR-4 Spec Kit extensions declare mandatory hooks that one agent side cannot run.** `.specify/extensions.yml` installs
`memory-loader`, `ralph` (an autonomous "loop until tasks.md is done" runner) and `speckit-superpowers-bridge` (hands a
feature to a third-party skill set and blocks `/speckit-implement` while handed off), with `auto_execute_hooks: true` and
`optional: false` on specify/plan/tasks/implement/clarify/checklist/analyze. The seven extension skills exist only under
`.agents/skills`; `.claude/skills` and both integration manifests know nothing of them. Nothing in `justfile`, CI or
`AGENTS.md` references them; `docs/superpowers/` holds one handoff plan from 2026-08-11. The five legacy skills are
symlinks; the ten `speckit-*` pairs differ by ~6 frontmatter lines, not by "different bytes per agent" in any material
sense.

**PR-5 Two incompatible workflows are both live.** `AGENTS.md:34–36` routes unmigrated phases through
`/plan-phase → /plan-story → /build-story → /finish-phase → /reconcile`, whose command files require `just story-check` and
`just spec-check` (PR-2), while the Spec Kit loop runs everything else. A new agent following the instructions literally
cannot complete either the legacy loop (missing validators) or the Spec Kit loop on the Claude side (missing extension
skills for mandatory hooks).

### 5.8 Repository hygiene

| Item | Evidence |
| --- | --- |
| Committed evidence outweighs the product | `specs/` 42 MB (21 MB under `specs/002/evidence`), `docs/` 15 MB; `frontend/src` 2.0 MB, `internal` 1.1 MB |
| Playwright artefact tracked at repo root | `test-results/.last-run.json`; `.gitignore:35` covers only `frontend/test-results/` |
| Generated bindings dirtied by the build | `frontend/wailsjs/runtime/*` mode 755→644 after `just build` (observed); `main_test.go:545–589` then fails |
| Four root Go test files | `main_test.go` 28.8 KB, `architecture_test.go` 19.3 KB, `native_evidence_safeguards_test.go`, `spec_clause_count_test.go` |
| Authority pointer not in the repository | `.specify/feature.json` is gitignored (`.specify/.gitignore:6`) |
| `master` is dead | `85205ba` (2026-07-20), 363 commits behind; its `CLAUDE.md` describes the `specification/` + `just trace` regime; `origin/feature/v1-implementation` is 19 days behind local |
| Duplicate/parallel documentation trees | `docs/_archive-2026-07-28-specification/` (214 files at `50d692d`), `docs/delivery/` (spec + architecture + plan + work + 27 ADRs), `specs/001–003` (spec/plan/tasks/research/data-model/quickstart/checklists/contracts/evidence), `docs/superpowers/plans`, `docs/reference/wails-dev`, `.specify/memory` |
| Untracked audit output | `docs/audits/` 13 MB (this audit; to be committed deliberately) |
| Node version unpinned | CI Node 22 (`main.yml:37,83`), host Node 24.19; no `.nvmrc`/`engines` |

### 5.9 History and specification drift

All numbers from `git log --numstat` over the 367 reachable commits (one author, 2026-07-17 → 2026-09-07, zero merges,
zero tags). Full tables are in
[investigation-history.md](2026-09-07-project-health-evidence/investigation-history.md).

**H-1 Ten process regimes in seven weeks.**

| Date | Commit | Regime | Size |
| --- | --- | --- | --- |
| 07-17 | `50d692d` | Claude agent pipeline, `specification/`, `docs/traceability.yaml` | 118 files, +11,566 |
| 07-20 | `c90c088`, `85205ba` | CODEX dual config (`.codex/agents`, 93 `.agents/skills`, `AGENTS.md`) | 101 files, +10,287 |
| 07-20…23 | STORY-001…032 | Phase/story + traceability in use; tracking rewrite `6aa7abc` | 81 files, +7,517/−1,546 |
| 07-25 | `927d15f` | "Changing the approach": traceability, 81 skills, 27 stories, 6 ADRs, 16 phase files deleted | 327 files, +2,640/**−29,924** |
| 07-28 | `3af7c58` | `docs/delivery` conversion; `.claude/agents` and `.codex/agents` deleted; `baseline.sh`, `verify.sh`, `archtest.mjs` added | 324 files, +9,915/−10,276 |
| 07-29 | `a240936` | Python validators (`check_proves.py`, `check_story.py`, `validate_spec.py`, `upgrade_check.py`) | 135 files, +4,000/−760 |
| 07-30 | `b9d8a05`, `53af8e4` | Spec Kit + constitution; the validators deleted the same day inside a `feat:` commit | +7,288; +4,226/−1,505 |
| 08-07 | `3ddb781`… | Evidence regime (baselines into `specs/*/evidence`, coverage logs in VCS) | small |
| 08-09…11 | `7744cc8`, `e95a081` | Pixel-parity harness; checkpoint commit of the parity worktree | `e95a081`: 88 files, **+39,828** |
| 08-15 | `cb48e68`, `cf8cff1` | "Proves:" rule applied to 38 test files; Spec Kit extensions (ralph, superpowers bridge, memory loader) | +14,716 |
| 08-16…21 | `559cec7`, `4f39195`, `35de8f2` | CI parity gate; `release-stack.sh`; retrospective | |

`AGENTS.md` rewritten 15 times, `justfile` 13, `CLAUDE.md` 6; the constitution has one commit. Process configuration:
+46,807/−21,222 lines over 755 file touches.

**H-2 What the commits were spent on.** fix 90 (24.5 %), docs 72 (19.6 %; `docs(evidence)` 35), test 54 (14.7 %;
`test(parity)` 15, `test(evidence)` 13), feat 54 (14.7 %), unprefixed process/spec/plan 35 (9.5 %), STORY 34 (9.3 %),
refactor 15, chore 5 (one of them +39,828 lines), other 8. Product feature work = 88 commits (24 %); paperwork = 115
(31 %). Week 33 (Aug 10–16) holds 196 commits (53 %); Aug 14 alone 55. On Aug 8, 29 commits in six hours built the whole
files/tabs vertical (≈12 minutes per "task").

**H-3 Where the lines went.**

| Area | Inserted | Ratio to product |
| --- | ---: | ---: |
| `specs/*/evidence/**` | 189,593 | 4.8× |
| Process configs (`.claude`, `.agents`, `.codex`, `.specify`, `AGENTS.md`, `CLAUDE.md`, `justfile`) | 46,807 | 1.2× |
| Product (`frontend/src` non-test + `internal` non-test + root Go) | ≈39,900 | 1× (≈8.6 % of all insertions) |
| Frontend tests / Go tests | 24,313 / 17,768 | |
| Pixel parity (`e2e/parity` + targeted/real-files parity) | 12,660 | |
| `scripts/` | 4,583 (3,693 deleted) | |
| `specs/*/tasks.md` | 4,100 | |
| Bridge mock | 3,156 | |

**H-4 `tasks.md` is a laboratory notebook.** `specs/003-real-files-and-tabs/tasks.md` was touched by 192 of 367 commits
(52 %; next most-churned file `App.tsx` 52). It grew from 683 lines / 39 tasks (`3fcde38`, Aug 7) to 2,475 lines / 196
tasks (`544372d`, Aug 19): 170 dated lines, 163 Closed/Superseded/Deferred/Decision markers, 910 lines longer than 300
characters (longest 5,452), thirteen appended "Convergence — Session …" phases (`tasks.md:688–2128`).

**H-5 Specification drift (original intent → current).**

| Original clause | Current state | Classification |
| --- | --- | --- |
| Frameless window with own title bar (`the-app-window.md#frameless-window`; ADR-0028 accepted) | `main.go:166 Frameless: false` since `011d2b5`; `specs/001/spec.md:58–62` clarification 2026-08-01; ADR-0028 never superseded | Owner-approved change, unrecorded as a decision |
| Mockup as "visual acceptance reference" (`50d692d:…/mockups/README.md`) | "Tier A binding … a visible difference is a defect" (`3af7c58`); zero-tolerance 546-case harness (`7744cc8`); withdrawn (`23ba4b5`); 9 `Superseded` + 6 `Amended` markers and 44 `- Q:` clarifications in `specs/003/spec.md` | Agent-invented contract, later retracted |
| Offline: bundle every asset (`constraints.md:158–166`); "nothing leaves the device" verified by a five-minute monitor (`:134–154`) | Request-API regex scanner + five-minute browser test on the mock; no packaged-app offline test | Over-reading of the monitor sentence; the bundling requirement has no executable proof |
| Toolbar folds into `»` overflow at 768 px (`formatting-text.md:163–174`) | Implemented as overflow; owner now wants horizontal scrolling | Design decision pending (D1) |
| Tab context menu "is about the tab" (`working-in-tabs.md:106–111`) | Rendered at the shell's right edge (UI-4) | Defect |
| Layout write-through persistence (ADR-0013) | `specs/003/spec.md:711` "launches with no restored tab set" | Narrowed, undocumented |
| Tests "naming the story id" (`50d692d:CLAUDE.md`; `03_TRACEABILITY.md`) | `Proves:` + task-id prefixes re-imposed by `cb48e68` after the generator was deleted; 47 of 315 `Proves:` tags cite retired STORY anchors (`KNOWN_ISSUES` #17) | Inherited convention, escalated, now unpoliced |
| Authority: `docs/delivery/spec` "remains authoritative" (`constitution.md:24,169`) | `AGENTS.md:10,138,260`: `specs/<feature>/` authoritative, `docs/delivery` "legacy reference-only" | Contradiction between live process documents |
| Component library prescribed (`03_FRONTEND_REACT.md:69–71`) | Not built; `structure.md` documents the absence | Silent drop (RC-1) |

**H-6 Retrospective-003 re-check.** Supported: `traceability.yaml` churn and deletion date; 26 ADRs with none during Spec
Kit; `tasks.md` touched in 192 commits; 195/196 tasks checked; first parity run 0/1,620 in 30.6 min. Not supported:
"the Spec Kit migration was never finished and that omission is why…" (the deletion predates Spec Kit by five days);
"`check_proves.py` … never written" (written `a240936`, extended `fc785fe`/`857636a`, deleted `53af8e4`); "Phase 06
introduces the sanitiser" (`rehype-sanitize` in `renderer.ts` since STORY-014/031, July 21–23); T173/T191 commit counts
overstated (8 and 6, not 14 and 13); "13,036 parity capture files" not in git (173 tracked; per-case captures ignored).
Its "architecture sound, do not restructure" conclusion is unsupported by its own method (revision-1 H04).

**H-7 Branch protocol.** `AGENTS.md:94–104` prescribes `feature/<slug>--<task>` branches, one commit each, squash-merged.
History is strictly linear: 367 first-parent commits, no merges, no tags (T114 required `archive/v1-implementation-pre-t114`).
The one documented attempt (`specs/003/evidence/ft-vs-08/phase-20/branch-divergence-resolution.md`, 2026-08-14) shows a
122-commit chain against a parent holding one squash `f1fa1916` — an object that no longer exists; the parent was reset
onto the chain. `master` (`85205ba`) is 363 commits behind; the remote is 19 days behind local.

**H-8 Documentation trees.** 1,108 tracked files, 400 of them Markdown; pack 42 MiB. Dead or contested: `docs/_archive-…`
(48 files, kept so three ADR links resolve), `docs/delivery/work` (103 files of old-format stories and retired baselines),
`docs/delivery/WORKFLOW.md` (describes the July 25 flow), `docs/delivery/plan/roadmap.md:8–21` ("Phase 02 in progress"),
`docs/reference/wails-dev` (13 files, unreferenced), `docs/superpowers`, ADR-0028 (contradicted), ~9 forward-looking ADRs
unbuilt, 8 process ADRs already deleted. `specs/002/evidence` alone is 21 MB of PNGs.

**H-9 Known issues still open** (`KNOWN_ISSUES.md`, `decisions-phase-21.md`): #3 Playwright runs against the mock; #7 flaky
`TestOpenRejectsCorruptOrUnsupportedSchemaSafely`; #8 `apperr` became the DTO dumping ground the item predicted; #10
`internal/gate` unused; #12 `just package` stub; #17 `Proves:` tags unpoliced; T130 drag ghost/edge auto-scroll partial;
T157 FR-FT-057 traceability skipped; T114 rollback tag never created.

### 5.10 Preview-link → startup failure → app cannot close (8 September incident)

The owner reports clicking a file link in an already open Markdown preview, seeing the application replaced by
“GoMarkEdit could not start” / “could not initialize its local settings”, and being unable to close it by the methods
tried, including macOS force close; terminating the process through htop eventually worked. The owner subsequently
confirmed the app was launched through **`just dev` / `wails dev`**. The unchanged screenshot is
[owner-preview-link-startup-failure.png](2026-09-07-project-health-evidence/owner-preview-link-startup-failure.png).

**Treat this as a P1 application-stranding incident before further feature development.** The screenshot establishes
the displayed failure state, and the owner establishes the interaction and impact. The exact href, Retry response,
process/thread state and termination operation have not been captured. The findings below explain independently
verifiable weaknesses in this path; they do not label the complete reported sequence as reproduced or claim SQLite
corruption, a native deadlock, or immunity to an OS kill signal.

#### 5.10.1 APP-1 — Preview anchors can replace the application page

**P1; source-confirmed missing navigation boundary.** `MarkdownView.tsx:11–13,33–41` receives only `source`.
`logic/markdown/renderer.ts:39–53` overrides images but leaves anchors to the default renderer. Preview hosts provide
neither the document's filesystem base nor a link-activation command. An ordinary relative link therefore resolves
against the webview's page URL, not the directory of the Markdown file, and its activation is left to default
document navigation. A root-relative filesystem-looking path is likewise an application-origin URL. Rendering a
valid anchor is only half of the feature: clicking it needs a defined outcome that preserves the application shell.

For the **confirmed development launch mode**, the source reveals this specific candidate chain:

1. A relative target such as `./next.md` becomes a request to an application page path such as `/next.md`.
2. Vite's SPA fallback returns the React index for a missing HTML-navigation target.
3. Wails v2.15.0 injects its runtime and IPC scripts only when the **requested path** ends in `/` or `/index.html`.
   Returning index HTML at `/next.md` does not make that path eligible.
4. React can start again without `window.runtime` / `window.go`. Bootstrap fails and shows the settings-labelled
   failure screen. Retry calls `RetryStartup` through the same missing binding, so it cannot restore that capability.

An isolated HTTP probe **reproduced steps 2–3** using real Vite and the pinned Wails asset-server APIs: `/` included
both bridge scripts, while `/audit-next.md` returned the React index with neither. It did not execute the renderer or
native application. See [investigation-navigation-probe.md](2026-09-07-project-health-evidence/investigation-navigation-probe.md).

The pinned dependency evidence is `pkg/assetserver/assetserver.go:140–183,200–205,248–254`,
`assethandler_external.go:25–32,64–69`, and installed Vite's `config.js:22092–22134`. The full path, sanitizer and
history trace is in [investigation-preview-links.md](2026-09-07-project-health-evidence/investigation-preview-links.md).
This confirms the development response defect; associating it with the owner's particular link still requires
the href and navigation/runtime capture.

The **packaged app differs**: its embedded asset handler returns 404 for an absent `.md` asset; it does not implement
Vite's arbitrary-path fallback (`pkg/assetserver/assethandler.go:81–97`). Its unhandled navigation remains a problem,
but the development failure screen must not be asserted as its observed result. The ordinary mock-backed `dev-ui`
can bootstrap again through fake bindings, concealing bridge loss. This is another precise reason it cannot certify
native E2E (T-1).

“File link” does not establish a literal `file:` URL. The current sanitizer strips that scheme; relative paths,
fragments and HTTPS survive. Preserve sanitization. Define one link policy at the shared rendering/command boundary:
fragment/footnote behavior, document-relative resolution, supported local-file dispatch, external destinations, and
unsupported targets. The original/current specifications require rendered links and sanitization but do not fully
specify activation routing; D11 records that missing decision. This is application navigation and local usability,
not a reason to expand the network scanner or reinterpret V1 as a ban on every request API.

#### 5.10.2 APP-2 — Shutdown assumes the renderer that failed is available to approve shutdown

**P1; source-confirmed close trap, independently exercised at the coordinator boundary.**
`CloseCoordinator.BeforeClose` sets `pending`, emits `application-close-requested` once, and vetoes native close.
While pending, every later request is vetoed **without re-emission** (`internal/application/close_coordinator.go:37–55`).
Only explicit Cancel or Authorize clears that state (`:61–84`). The frontend subscribes only when
`bootstrapStatus === 'ready'` (`App.tsx:1962–1969`); loading and StartupFailure have no listener. Wails events are not
replayed for a listener installed later. A first close during failed/loading startup can therefore be lost, while
subsequent attempts remain inert even after a successful Retry installs the listener.

The isolated exact-source coordinator probe returned `veto=true`, `emissions=1`, `deliveries=0` both before and after
the receiver was restored. Cancel/Authorize positive controls worked. This confirms missing redelivery in the
coordinator; the frontend readiness and native-host connections above are source traces.

`RetryStartup` does not reset or reconcile this pending close (`application_context_holder.go:187–192`). StartupFailure
has only Retry, and the normal application controls are hidden. Backend ability to authorize a recovery quit is not
an accessible recovery path if this screen cannot reach it. Deduplicating close requests is useful during a healthy
save/discard prompt; here it was implemented without delivery acknowledgment, renderer readiness or recovery.

The macOS Wails AppDelegate routes ordinary application termination into a `Q` message and returns
`NSTerminateCancel` (`internal/frontend/desktop/darwin/AppDelegate.m:38–41`); the Go frontend consults OnBeforeClose.
This supports the ordinary-close/quit explanation. It does **not** show that an actual macOS Force Quit or SIGKILL
delivered to the correct process can be vetoed. Retain the owner's force-close observation as a separate unresolved
part of the incident, to be investigated with process identity and the exact method used.

The repair needs a host/renderer shutdown contract that survives a missing or restarted renderer. Clean startup
failure must have a native exit path. Outstanding requests must be discoverable after reconnection, with acknowledged
cancellation/authorization and stale-response rejection. A timeout must not silently discard dirty buffers or bypass
write durability; unrecoverable dirty-session behavior requires the explicit recovery decision in D12.

#### 5.10.3 APP-3 — Retry can repeat a cached failure without retrying the failed operation

**P2; source-confirmed isolated-settings recovery defect.** `bootstrapSettingsProjection` retains its promise even
when `getSettings()` rejects (`logic/store/settingsProjection.ts:5–20`). `disposeSettingsProjection` clears it, but
ordinary Retry does not call that disposer. If model hydration succeeds and settings hydration fails, Retry reuses the
same rejected settings promise and performs no new settings read. A successful backend `RetryStartup` does not repair
that frontend cache. This is separate from the missing-bridge scenario, where invoking RetryStartup itself fails.

The existing App Retry test fails **GetState**; model-bootstrap failure resets settings as a side effect
(`appModelProjection.ts:104–118`), so that test misses isolated settings failure. The projection test covers successful
single hydration only. The exact-source projection probe reproduced the rejected-promise reuse and recovered only
after explicit disposal. Both lifecycle probe sources and outcomes are in
[investigation-lifecycle-probes.md](2026-09-07-project-health-evidence/investigation-lifecycle-probes.md).
Retry should preserve single-flight behavior while allowing a fresh attempt after rejection;
each startup leg must be tested independently, including model-success/settings-failure and a restored bridge.

#### 5.10.4 APP-4 — The failure screen reports a cause the application has not established

**P2; confirmed diagnostic defect.** `startAppModelBootstrap` discards errors from adapter import, RetryStartup,
model hydration, settings hydration and WindowReady (`App.tsx:159–185`). Model bootstrap separately discards subscription,
GetState and version-validation errors. All become the same settings-specific message (`i18n/locales/en.json:69`).
That message cannot identify the failing stage, and it can incorrectly send diagnosis toward SQLite.

The failed state is assigned by the mount/Retry bootstrap flow (`App.tsx:1890–1932`), not by ordinary preview link
handling. Seeing it after a ready preview is consistent with remount/rebootstrap, which makes navigation evidence
especially valuable. The retained development log has four asset-server startup entries and no associated failure;
the production logs directory was empty. Neither absence establishes successful startup nor a healthy host.

Preserve stage and safe error identity through bootstrap, expose an accurate recovery action, and retain the cause in
diagnostic output without document bodies or unnecessary paths. Do not turn every failure into “local settings”, and
do not promise Retry can repair a bridge that is no longer present.

#### 5.10.5 APP-5 — Pending bridge and close operations can remain unresolved or disagree about cancellation

**P2; source-confirmed liveness gaps, contribution to this incident unconfirmed.** Generated Wails calls default to
no timeout (`internal/frontend/runtime/desktop/bindings.js:43`; `calls.js:59–61`). If `WailsInvoke` throws, the runtime
logs the exception without settling its promise (`calls.js:96–99`). App bootstrap and close awaits add no overall
deadline. A never-settling startup leg leaves loading/Retry unresolved; an unresolved close operation leaves Go's
veto pending. Catch handlers help rejections, not promises that never settle.

`cancelNativeClose` also clears the renderer's pending flag **before** awaiting CancelQuit (`App.tsx:833–840`). If the
bridge fails before Go receives cancellation, the frontend considers the request canceled while Go still vetoes close.
There is no acknowledged state reconciliation. Adding a frontend timeout alone would leave already-running Go work
and late authorization active; the request identity, completion, cancellation and recovery policy must agree.

Related wait risks already belong to BE-4/BE-6: initialization holds the holder lock across DB work, and authorized
shutdown drains writes before granting its permit. SQLite has a 5-second busy timeout and bounded migration/open
retries; it is incorrect to claim every database wait is unbounded. Write-mutex/drain waits still need a diagnosable
outcome if I/O stalls. No captured stack establishes a mutex cycle or blocked native thread in this incident. Preserve
the drain and atomic-write guarantees while defining bounded observation and safe recovery.

#### 5.10.6 Why this escaped, and the investigation still required

Tests validate anchor markup/hrefs, sanitized URLs and footnote IDs, but do not activate a preview anchor and assert
that the app page, native bridge and document state survive. Coordinator tests assume a receiver and reward one-shot
deduplication; ready-state App tests mock delivery. Retry tests recover a different failure. Each isolated piece can
pass while their composition strands the application. This extends RC-3, BE-5 and T-1 with an actual reported journey,
not a request for more DTO, source-text or specification-count tests.

The following bounded investigation remains required before closing the incident. Use temporary Markdown fixtures
and a disposable profile with a watchdog for the specifically owned process; keep existing user files untouched.

| Case / capture | Required evidence and eventual regression |
| --- | --- |
| Exact reported link and development launch | Capture Markdown href, document base, resolved target, page URL before/after, document response, runtime/IPC availability and bootstrap failure stage. Confirm or reject APP-1 as this incident's trigger. |
| Valid/missing sibling `.md`, root-relative target and target with fragment | Activate through the real preview in Wails dev and the packaged app separately. Resolve relative to the document; route/refuse without replacing the shell; confirm bridge and editing still work. |
| Existing fragment, footnote/backlink, HTTPS and blocked schemes | Preserve in-document navigation and sanitization; exercise the agreed local/external policy. Passive href assertions alone do not establish activation behavior. |
| Close during loading, StartupFailure, bridge loss, and after a recovered Retry | Drive native close and ordinary Quit through the real host. Confirm no lost request/permanent veto; clean failed startup can exit. Include a first close before listener installation. |
| Startup stages fail or never settle independently | Cover adapter/bridge, GetState, getSettings and WindowReady. Retry actually retries the failed leg; failure copy identifies its stage; an unresolved leg reaches the specified recovery state. |
| Cancellation lost before/after acknowledgment; late completion; dirty buffer or pending write | Confirm request-state reconciliation and stale-response rejection; accepted writes stay safe; cancellation and explicit destructive recovery follow their distinct contracts. |
| Reported macOS force-close failure | If repeated, capture Go/native/WebKit PIDs and stack samples before termination, the exact UI command or signal, selected PID and exit result. Distinguish an ineffective ordinary Quit from an OS force termination actually delivered. |

No full native hang reproduction, process sample or forced-termination experiment is claimed in this extension.
The isolated probes described in §3.3 establish specific state/response defects and do not substitute for that journey.
Add the regressions to the existing unit/integration/real-backend E2E stages; no new permanent audit gate, command,
mock backend or diagnostic framework is needed.

## 6. Refactoring scope — input for `/speckit-specify`

This section is written so that it can be pasted, with the owner's decisions from §6.4 filled in, as the description for
a refactoring feature. It is scope and acceptance, not a task list. Requirement IDs `RF-…` are proposals for the new spec.

### 6.1 Goal statement

Make GoMarkEdit's existing capability set (native window, themes, settings, editor and preview, real files, tabs, autosave,
conflicts, close, recents) trustworthy and maintainable before adding Phase 06+ capabilities, by (a) fixing the reproduced
defects, (b) rebuilding the UI on the reusable component library the original specification prescribed, (c) consolidating
the Go document lifecycle under one owner, (d) replacing the mock-backed "E2E" with tests against the real Go backend,
(e) reducing the command surface to six stages behind five shared scripts, (f) separating and rewriting tests by what they
prove, and (g) leaving one current authority and one set of agent instructions.

### 6.2 Requirements by epic

**Epic A — Product defects (fix first, each with a failing regression test at the owning boundary)**

| ID | Requirement | Source |
| --- | --- | --- |
| RF-A1 | A menu opened by pointer or keyboard keeps its surface shadow; the focus indicator is shown on interactive controls only and composes with elevation. Verified by a computed-style check for every popup family in every theme. | §5.1 |
| RF-A2 | Save As, autosave and explicit Save publish results in commit order for one document; a later commit can never be overwritten by an earlier one's publication; the adopted destination's bytes equal the reported clean content. | C1 |
| RF-A3 | Refusal formatting never reads model state outside the lock (or captures the label with the snapshot); `go test -race` covers concurrent stale Save and NewDocument. | C2 |
| RF-A4 | Closing a document releases every per-document resource (coordinators, timers, tokens, reservations, normalizations, conflicts) through one disposal function; a retained-state test opens/saves/closes N documents and asserts zero retained coordinators. | C3, BE-1 |
| RF-A5 | Autosave failures reach the user through the same classified-error channel as manual Save (category, remediation, dedupe); success stays silent. | C4 |
| RF-A6 | File identity uses typed per-platform stat fields; opening a hard link or the just-saved path focuses the existing tab on macOS and Linux. | C5 |
| RF-A7 | Explicit Save preserves the Monaco model, undo stack, selection and focus; only explicit reload/recovery replaces the buffer. | C6 |
| RF-A8 | Open emits the same effective metadata as GetState; a clean opened file shows "Saved". | C7 |
| RF-A9 | Each settings group update is one transaction; a rejected update leaves the previous group intact across DB reopen. | C8 |
| RF-A10 | Tab context menu opens at the invocation point (pointer) or the focused tab (keyboard), clamped to the frame; shortcuts are rendered; menubar popups fit the frame at every width ≥ minimum; Details lists every dropped status fact. | R14–R16, R19 |
| RF-A11 | Second click on any menubar trigger closes its menu; menu keyboard behaviour is identical in every family. | UI-5, R2 |
| RF-A12 | Activating a preview link preserves the application page, bridge and editing session. A shared link boundary applies the agreed fragment/local/external/unsupported policy (D11), resolves local targets relative to the document, and routes or refuses them visibly. Verify Wails dev and the embedded build separately. | APP-1 |
| RF-A13 | Native close during loading, failed startup or renderer loss cannot become permanently inert. Clean failed startup has an exit path independent of successful renderer bootstrap; restored renderers discover pending close requests. Dirty-session recovery follows D12 and does not silently discard content or bypass a write drain. | APP-2, APP-5 |
| RF-A14 | Retry creates a fresh attempt for a failed startup stage while remaining single-flight. Successful model hydration followed by settings rejection must recover with a new settings read. Missing bridge and never-settling stages have defined recovery outcomes. | APP-3, APP-5 |
| RF-A15 | Bootstrap failure retains its actual stage and safe diagnostic identity; the UI reports an accurate failure and usable recovery action. Adapter/bridge, model, settings and WindowReady failures are distinguished. | APP-4 |

**Epic B — Reusable UI library (the owner's PDF and the original spec's `primitives/components/widgets` layering)**

| ID | Requirement |
| --- | --- |
| RF-B1 | One `Popup` (surface + lifecycle: open/close, Escape, outside pointer, focus restore, arrow navigation, clamp/flip against the application frame, portal policy) used by File, Settings, View, About, narrow overflow, tab context, editor context, toolbar overflow and Document details. Content, anchor (trigger / point / element bounds) and size variant are inputs. Radix may remain the engine underneath. |
| RF-B2 | One `MenuItem` row (label, icon slot, accelerator slot, disabled, checked/radio variants) rendered by every menu; the accelerator derives from the action registry once. |
| RF-B3 | One `Bar` horizontal frame with leading/main/trailing slots used by the menubar, the tab bar and the formatting toolbar; overflow policy (scroll vs `»` menu) is a property decided per bar by the owner (§6.4 D1). |
| RF-B4 | One `Island` group and one `ToolButton` (icon and text variants, selection-preserving mousedown, disabled/pressed/checked states) used by the toolbar and, where applicable, the tab bar and menubar right-side tools; one `Button` for dialogs, toasts and launcher. |
| RF-B5 | One `Tab` and one `TabBar` (horizontal scrolling, drag reorder, add/close controls) with theme skins expressed as tokens, not selectors in the widget stylesheet. |
| RF-B6 | One `Pane` frame (header slots, body, accessory/banner slot) hosting the Monaco editor and the preview renderer as content; paused/failed preview banners are placed from explicit state, not by CSS reaching into renderer descendants. |
| RF-B7 | One `StatusBar` item/pill model: facts are declared once with row/detail/drop priority; Details always exposes hidden facts. |
| RF-B8 | One `Sidebar` frame (side, width, resize, collapse, content) consumed by the workspace panel now and the assistant later; layout policy stays backend-authoritative. |
| RF-B9 | One `ModalShell` used by every dialog and prompt (Settings, About, Shortcuts, Normalization, Close, External change, Recovery). |
| RF-B10 | `Segmented` is the only radio-group implementation (toolbar arrangement, Settings mode, dialog controls). `Icon` is the only glyph source; `--icon-size/--icon-stroke` control it. |
| RF-B11 | Theme skins live in `tokens.css` (values) and, where structure must differ, in the shared component's stylesheet; widget stylesheets contain no `[data-theme]`/`[data-mode]` selectors and no parity selectors. Dead tokens removed; undefined tokens defined or removed. |
| RF-B12 | Command policy has one owner: availability, shortcut admission and aliases come from the action registry for File, toolbar, tab context and keyboard alike; formatting commands are built by one runner; settings writes go through one settings command owner; outcomes are typed and reported once. |
| RF-B13 | `App.tsx`, `DocumentTabs.tsx`, `ShellMenuRow.tsx`, `EditorChrome.tsx` are decomposed so that no file mixes more than one of: composition, command orchestration, drag engine, popup engine, shortcut installation. The menubar is not rendered through the appearance controller. |
| RF-B14 | `ui/primitives` and `ui/components` import neither the store, the adapters nor the action registry (the existing `rules.md#components-take-props`, made mechanical by ESLint). |

**Epic C — Go lifecycle ownership**

| ID | Requirement |
| --- | --- |
| RF-C1 | One per-document lifecycle owner (path identity, buffer revision, write ordering, disk commit, publication epoch, close/disposal); stale publications are rejected by commit identity; I/O stays outside the model lock. |
| RF-C2 | One handler guard helper replaces the 35 recover blocks; one classified-failure constructor replaces the fifteen wrappers; envelopes share embedded failure structs. |
| RF-C3 | One KV repository helper (get/upsert/tx/versioned JSON) used by settings, layout, recents and file metadata; sqlc is either used by all of them or removed. |
| RF-C4 | Test seams (`Set*ForTesting`, `SetBeforeSaveAsRecheck`, extra constructors, package variables in `main.go`) are removed from the production API in favour of constructor options/ports; the composition root is the only place that wires them. |
| RF-C5 | `appmodel` does not import the Wails runtime or `bootstrap`; the event emitter adapter lives in `application`. |
| RF-C6 | Every discarded error on a user-visible path (autosave, layout persistence, publication rollback, reset read-back) is either surfaced or logged with a stated reason. |
| RF-C7 | One shutdown protocol owns request identity, acknowledgment, pending-state discovery, cancellation, authorization and stale-response rejection across host and renderer. Unresolved bridge/I/O work has bounded observation and the recovery policy in D12; timing out the UI alone cannot authorize a stale request or abandon a write silently. |

**Epic D — Tests**

| ID | Requirement |
| --- | --- |
| RF-D1 | Test roots: `tests/go/{unit,integration}` or per-package `_test` packages plus `tests/integration` (owner's choice, §6.4 D3); `frontend/tests/{unit,integration,e2e}`. No test file under `frontend/src`, `frontend/public` or embedded in the binary. |
| RF-D2 | Unit tests run from a cold checkout without `frontend/dist`, without a native toolchain and without network. |
| RF-D3 | E2E drives the real Go composition (built binary or `wails dev`) with a disposable profile and temporary files; it asserts disk bytes and restart state; it includes a cold-start offline acceptance of the packaged app (V1). |
| RF-D4 | No test asserts on source text, CSS declarations, DTO field order, struct field counts, or the content of specification/documentation files. Architecture constraints live in the Lint stage. |
| RF-D5 | Test titles are behaviour sentences; requirement mapping, if kept, lives in a comment or an external ledger. |
| RF-D6 | The pixel-parity harness, the parity URL branches and the evidence driver are removed once RF-D3 exists; the mock bridge, if kept, is a dev-only convenience with no tests of its own. |
| RF-D7 | Every product defect in Epic A has a regression test that fails on `883fd05`. |
| RF-D8 | The real-backend suite covers preview activation → bridge continuity, close before renderer readiness, failed startup → Retry → close, isolated settings rejection, lost cancellation and late completion. Run relevant navigation cases against both development and packaged hosts. Use disposable files/profile and bounded process supervision; preserve bytes and restart state in dirty/write-drain cases. |

**Epic E — Commands and CI**

| ID | Requirement |
| --- | --- |
| RF-E1 | `scripts/build`, `scripts/test <unit|integration|e2e|all>`, `scripts/verify`, `scripts/format [--check]`, `scripts/baseline` are the only entry points; `justfile` recipes are one-line aliases; lefthook and GitHub Actions call the scripts. |
| RF-E2 | Each tool runs at most once per `verify`; frontend is built at most once; no `go build` inside `go test`. |
| RF-E3 | `format` covers every tracked text file type with a documented ignore list; `format --check` is what `verify` and CI run. |
| RF-E4 | `baseline` records commit, dirty diff identity, tool versions, per-stage exit codes and machine-readable failure identities; missing inputs fail closed; comparison never reports green while failures remain. |
| RF-E5 | Generated bindings do not dirty the tree after a build (fix the mode-bit problem once). Node version pinned. Dead recipes (`package`, `sqlc-check`, `vuln`, `release-stack`, hook wrappers) removed or implemented. |
| RF-E6 | CI runs `scripts/verify` and the real-backend E2E on at least the macOS host; the release job is either implemented or removed. |

**Epic F — Authority and agent instructions**

| ID | Requirement |
| --- | --- |
| RF-F1 | One normative tree (owner's choice, §6.4 D5); the other is archived with a pointer; `README.md`, `AGENTS.md`, constitution and `docs/delivery/README.md` agree. |
| RF-F2 | `AGENTS.md` ≤ 100 lines: rules, the five commands, the authority pointer; incident narratives move to a lessons file. Every referenced command and path exists (checked by a smoke test in `verify`). |
| RF-F3 | One workflow (Spec Kit), one set of skills present on both agent sides; unused extensions and the legacy `/plan-*` command files removed. |
| RF-F4 | A short current architecture map (component library, lifecycle owner, command graph) replaces `structure.md`'s inventory; ADRs record the decisions in §6.4. |

### 6.3 Non-goals

No change to the stack (Go, Wails v2, React, Redux projection, Monaco, modernc SQLite). No new product capability
(Phase 06 rendering, folders, OS integration, AI) inside the refactoring. No WYSIWYG, no session restore. No edit to the
original specification text to fit the code; deviations are recorded as decisions.

### 6.4 Decisions the owner must make before specifying

| # | Decision | Options and current state |
| --- | --- | --- |
| D1 | Formatting toolbar overflow policy | Owner's PDF: horizontally scrollable bar. Original spec (`formatting-text.md:163–174`) and `specs/003:1233–1237`: `»` overflow menu at 768 px. Pick one; reuse works with either. |
| D2 | Tool-button geometry | Owner: square icon tools. Active spec: height 30 px, min-width 30 px, inline padding 8 px. |
| D3 | Go test placement | (a) external `_test` packages beside the code, or (b) `tests/go/{unit,integration}`; (b) forces the public-API rewrite of ~32 white-box files. |
| D4 | Fate of the pixel-parity harness | Delete (recommended) vs keep a small visual smoke set. The mockup remains a design reference either way. |
| D5 | Normative tree | Keep Spec Kit `specs/` (recommended; original spec archived as intent) or return to `docs/delivery/`. |
| D6 | Mock bridge | Delete, or keep for `just dev-ui` only. |
| D7 | Remote document images/stylesheets policy (`images-and-remote-content.md`) | Reconcile with "network only for AI". |
| D8 | Deferred controls | Keep visible-but-disabled future items (Assistant, Export, Open Folder) or hide until implemented. |
| D9 | Native window frame | Native frame was an approved change (ADR-0028 superseded); confirm it stands. |
| D10 | `Document details` disclosure, `Toggle Assistant` items and other UI not in the original spec | Keep as amendments or remove. |
| D11 | Preview-link activation policy | Specify fragment/footnote, supported local document, external and unsupported targets. Recommended: preserve in-document anchors; resolve supported local files from the document directory and use the existing tab/file lifecycle; explicitly open permitted external targets through the host; visibly refuse unsupported targets. No preview link replaces the app document. Reconcile external behavior with V1 without weakening sanitization. |
| D12 | Unrecoverable renderer/bridge loss with dirty documents or a pending write | Clean failed startup must be closable. Specify how native recovery protects or explicitly obtains consent to discard dirty work and handles a stuck write; ordinary close must retain save/cancel/refusal guarantees. A timeout is not permission to discard data. This decision does not silently introduce session restore or a new recovery subsystem. |

### 6.5 Suggested sequence

1. Capture the baseline (this commit, gate results, defect list) and settle D1–D12 in ADRs. Capture the missing incident
   details in §5.10.6 without treating an unconfirmed root cause as resolved.
2. Prioritize the application-stranding path RF-A12–A15/RF-C7 and existing data-integrity defects, with regressions at
   their actual boundaries. Continue Epic A with RF-C1, then RF-A1/A10/A11 as the first consumers of the new Popup
   (Epic B starts with the popup family because it is where the owner's visual defects are).
3. Real-backend E2E (RF-D3) early, so Epics B and C are verified against the binary; retire the parity stack once it runs.
4. Component library and decomposition (Epic B), one family at a time, each with its consumer inventory.
5. Commands, scripts, CI (Epic E) and test relocation (Epic D), which move together because runners own directories.
6. Documentation, instructions and authority (Epic F) last, when the working model is stable.
7. Close with a user-facing conformance walk of the built app against the original capability map, then resume Phase 06.

Acceptance is not "fewer lines". It is: the catalogued product defects cannot recur, preview activation and failed
startup cannot strand ordinary shutdown, one common change reaches every consumer, the
E2E suite sees the Go backend, and a new agent following the instructions can run the six stages without discovering a
missing command.

## 7. Evidence index

Everything cited above is preserved under `2026-09-07-project-health-evidence/`. Revision-2 additions:

| File | Content |
| --- | --- |
| `audit-revision-1-unverified.md` | Revision 1 of this document, unchanged. |
| `focus-ring-probe.mjs.txt`, `focus-ring-probe.json`, `focus-ring-probe-fresh-about-chromium.png`, `focus-ring-probe-view-chromium.png` | The Chromium reproduction of UI-1: script, measured results, screenshots. |
| `investigation-ui-reuse.md` | Full UI composition inventory (popup lifecycles, surface values, button styles, theme-conditional CSS, inline literals, primitive adoption, God-component inventory). |
| `investigation-tests.md` | Per-file test classification, naming counts, spec coupling, entanglement list, proposed file mapping. |
| `investigation-tooling.md` | Gate-step matrix, recipe classification, format coverage, dead references, `AGENTS.md` analysis, Spec Kit extensions, `cmd/` and `dev/` analysis, architecture-rule inventory, proposed scripts. |
| `investigation-backend.md` | Package map, service field inventory, test-seam table, duplication counts, import graph, comment analysis, concurrency risks. |
| `investigation-history.md` | Regime timeline, commit classification, effort sinks, spec-drift table, retrospective check, branch analysis, docs clutter. |

Revision-1 evidence (host gate/build/E2E logs, Go probe overlays and logs, SQLite atomicity probe, verify/network
false-pass fixtures, native walkthrough journal, owner screenshots and PDF, history index, the July 25 audit) is unchanged
and listed in the evidence `README.md`. No application code, test, gate configuration or specification was modified to
produce this revision; the temporary Vite server used for the Chromium probe was stopped and the working tree left as
found.

Revision-2.1 additions (8 September, same source commit):

| File | Content |
| --- | --- |
| `audit-revision-2-owner-reviewed.md` | Exact owner-reviewed report before this extension; preserves all earlier conclusions and evidence. |
| `owner-preview-link-startup-failure.png` | Owner's new screenshot, unchanged; observation of the failure screen, not a new native capture. |
| `2026-09-08-incident-journal.md`, `2026-09-08-development-log-snapshot.log` | Owner's confirmed development launch, missing incident details, available log evidence, provenance and limits. |
| `investigation-preview-links.md`, `investigation-startup-close.md` | Source, tests and history for preview navigation, bootstrap, Retry and native shutdown. |
| `investigation-lifecycle-probes.md`, `lifecycle-probes/` | Exact-source Go close coordinator and TypeScript settings-cache probes, raw outcomes, positive controls and source hashes. Both exit 0 because they assert the observed defects. |
| `investigation-navigation-probe.md`, `navigation-probe/` | Actual Wails/Vite HTTP pipeline reproduction of index HTML returned without bridge scripts, raw responses and dependency hashes; no renderer/native execution. |

The evidence README describes reconstruction of neutralized probe source. The manifest covers retained evidence;
raw earlier logs and revision snapshots remain unchanged. This extension does not replace real-backend/native E2E
with these diagnostic probes or claim the original hang/force-close failure has been reproduced.

---

## Appendices A–D — retained revision-1 evidence (re-verified)

The four appendices below are carried over from revision 1 verbatim. Every finding in them was re-checked against the
source at `883fd05` in this revision (§3.2): line references remain valid; the eight backend/frontend defects (C1–C8), the
tooling findings (1–10 and the script inventory), the history findings (H01–H15) and the reuse findings (R1–R20) stand.
Where §5 of this revision extends or reprioritises an item, §5 governs. Two notes: (a) the network-scanner finding (B2)
is a fact about the checker and does not establish that the application makes network calls — the owner's actual
requirement is bundled assets and an offline cold start (V1, RF-D3); (b) revision 1's "`cmd` and `frontend/src/dev` are
legitimate" is qualified in §5.6 TL-8/TL-9.

## Appendix A — Code and architecture evidence

### Confirmed findings

#### C1 — P1: overlapping Save As and autosave can report a new destination clean while its newest text is absent on disk

- `internal/appmodel/save.go:318` finishes the coordinator's commit before the model update beginning at line 353. `DocumentWriteCoordinator.Commit` protects disk execution only (`internal/appmodel/write_coordinator.go:64-101`); the production constructor does not supply its optional publisher (`internal/appmodel/save.go:470`). `SaveAs` does not call the autosave drain used by `Save` (`save.go:83`, `save.go:96-215`).
- Publication unconditionally applies the completed snapshot to the current document (`save.go:377`), without checking that `snapshot.path` still equals the adopted path, or that another commit has already superseded this publication.
- Reproduced through public `SaveAs`, `UpdateBuffer`, a real one-second autosave, and real files. Existing test hooks only control interleaving: Save As captures v1 for new.md; a v2 autosave commits old.md and pauses before publication; Save As commits/adopts new.md=v1; the old-path autosave publishes last.
- Observed final state: current path=new.md; editor/backend content=v2; dirty=false; status=autosaved; old.md=v2; new.md=v1. The clean-close path can then discard v2 from the intended destination without a dirty prompt. This violates FR-FT-014/016/019 (dirty reflects actual committed destination; later revisions remain modified; writes share serialization).
- Probe: `TestAuditAutosavePublicationAfterSaveAs`, log `2026-09-07-project-health-evidence/write-lifecycle-probe.log`. The failing expectation checks actual new-file bytes versus active source and dirty state.
- Refactor direction: one per-document lifecycle transaction should own snapshot capture, path epoch, write ordering, baseline publication, and close barriers. Preserve filesystem I/O outside the global model mutex, but serialize the entire document transition or reject stale publications by commit/path identity.

#### C2 — P1: classified refusal formatting reads the document map without its required lock

- `Save` releases `service.mu` before returning refusal (`internal/appmodel/save.go:51-58`); the refusal calls `safeDocumentLabelLocked` (`save.go:657`), which reads `service.state.documents` without locking (`save.go:701`). The helper's own comment explicitly requires the caller to hold the mutex.
- Other refusal/conflict call sites have the same pattern. Adding a lock inside the existing helper would deadlock locked call sites, so this needs clear locked/unlocked APIs or capture the safe label with the original snapshot.
- Confirmed with `go test -race` using concurrent public `Save` for a stale/missing id and `NewDocument`. Race detector identifies read at `save.go:701` against map write at `internal/appmodel/file_lifecycle.go:66`.
- Implication: async refusal + other lifecycle activity can race and potentially trigger Go's fatal concurrent-map access; Wails panic recovery does not make an unsafe map safe. The probe uses a nonexistent id to deterministically reach the refusal; stale document ids can occur around close/save activity. This is confirmed at the service concurrency boundary, not claimed as a manually observed native crash.
- Probe: `TestAuditRefusalLabelConcurrentDocumentChanges`.

#### C3 — P2: closed documents retain full saved text and bytes indefinitely

- `internal/appmodel/close_plan.go:550-565` cancels timers, removes conflicts, and removes the document, but never deletes its `writeCoordinators` entry.
- `internal/appmodel/save.go:451-472` adds a coordinator for every document ever saved. `internal/appmodel/write_coordinator.go:50,100` retains `lastCommitted`; its snapshot retains both `CanonicalContent` and a cloned `encodedData` byte array (`write_coordinator.go:73-75,126-145`). No `delete(service.writeCoordinators, ...)` exists.
- Confirmed: save a 1 MiB document, close the final tab; GetState reports zero open documents, but the service retains one coordinator with 1,048,576 canonical-content bytes plus 1,048,576 encoded bytes.
- The 40-live-document limit therefore does not bound this memory. Repeatedly opening/saving/closing files increases retained source memory for the lifetime of the process; 100 distinct 10 MiB documents plausibly retain roughly 2 GiB just in these two representations. That estimate is arithmetic, not a measured heap profile.
- This also defeats the intended source-free recently-closed history: the named history record is source-free but another structure still owns the text.
- Frontend `bufferRecords` and `viewRecords` are also never deleted (`frontend/src/logic/adapter/appModelAdapter.ts:272-273,306-319,659-683`), though those usually retain metadata rather than full successfully flushed source. Failed/cancelled close plans similarly remain in `closePlans` after `invalidateClosePlanLocked` (`close_plan.go:508-514`); these are smaller related lifetime-cleanup debts.
- Probe: `TestAuditClosedDocumentWriteBufferRetention`, log `2026-09-07-project-health-evidence/write-lifecycle-probe.log`.
- Refactor direction: document disposal should have one explicit owner that drains work, releases tokens/queues/coordinators, then deletes source. Test opening/closing repeatedly with retained-state assertions rather than only asserting tab removal.

#### C4 — P2: autosave failures are silently discarded instead of reaching the user's failure/recovery flow

- `internal/appmodel/autosave.go:204-205` discards preparation failure; lines 213-225 cancel and discard normalization outcomes; line 227 discards the entire write outcome.
- The async error emitter exists (`internal/appmodel/emitter.go:14-18`, `runtime_emitter.go:25`) but autosave never invokes it. `executeWrite` returns classified failure and does not emit an error itself (`save.go:332-350`). `markFailedWrite` is only exercised by tests, never called from the production write failure path.
- Confirmed injected disk-write failure with the existing fake autosave clock: disk remains `base\n`, document remains modified, but async error events=0. There is no Retry notification explaining why autosave stopped. Preserving the original file and dirty state is good; withholding the failure is the bug.
- FR-FT-015 says classified failures carry category/remediation and repeated errors update a notification; only automatic _success_ is silent. The original `docs/delivery/spec/product/opening-and-saving-files.md` also promises a visible disk-full failure.
- The discarded `ResyncRequired` result is a more serious extension: an autosave whose post-commit state publication fails cannot invoke FR-FT-016's command-blocking rehydration sequence. That branch is source-confirmed but not separately fault-injected here.
- Probe: `TestAuditAutosaveFailureReachesFrontend`, log `2026-09-07-project-health-evidence/autosave-error-probe.log`.
- Refactor direction: one outcome channel for manual and automatic lifecycle work; origin suppresses success toast only. Do not silently throw away conflict, normalization, classified failure, or committed-but-unpublished results.

#### C5 — P2: macOS filesystem identity falls back to path spelling, permitting two tabs for one hard-linked file

- `internal/file/paths.go:115-130` accepts only unsigned `Dev`/`Ino` reflection fields. Darwin's stat device id is signed, so `CanUint` rejects it and the helper returns `path:` identity (`paths.go:122`). `disk_version.go:70-74` repeats this helper pattern.
- Confirmed on this host: create document.md and hard-link alias.md to it, Open both through `OpenPath`; the second result is `opened` with a different document id, rather than `focused`. Returned identities are different `path:/...` values.
- `internal/appmodel/file_lifecycle.go:188-193` trusts the identity result for deduplication; FR-FT-004 explicitly requires filesystem identity and host-aware equality.
- Atomic Save intentionally breaks hard links (documented accepted tradeoff), but that does not justify allowing duplicate identity while both names still refer to the same inode before any save.
- Probe: `TestAuditOpenHardLinkDeduplicates`, log `2026-09-07-project-health-evidence/hardlink-probe.log`.
- Refactor direction: platform-specific typed identity extraction using supported OS APIs, with alias/case/hard-link tests per host. Avoid opaque reflection that quietly loses guarantees.

### Confirmed frontend findings

#### C6 — P1: ordinary Save remounts the editor, loses undo history and focus

- `frontend/src/App.tsx:1283-1300` (finishWrite) reconciles every successful Save, then `replaceActiveBuffer(recovered.activeBuffer)`. `appModelAdapter.ts:706-712` calls GetState even for a healthy, already-published commit.
- `frontend/src/ui/widgets/EditorView.tsx:505` keys `ActiveEditor` on `${activeBuffer.documentId}:${activeBuffer.content}`. A successful Save after editing changes that prop from the activation's seed to the edited text, causing a React remount in the same document. `useSyncedBuffer.ts:121-134` mints a new activation token; `CodeEditor.tsx:163-166,384-388` gives Monaco a new model URI.
- Native observation: opened a temporary Markdown file through the real picker, typed `Undo audit marker`, pressed Cmd+S. Status became Saved; editor accessibility identity changed from 120 to 143 and focus moved to the HTML document. Clicking back into the editor and Cmd+Z did not remove the marker. Positive control: typing `CONTROL` after Save and Cmd+Z removed CONTROL. Thus Save loses the earlier undo history and focus; this is confirmed in the real Wails binary. A Save whose GetState response arrives while newer keystrokes are still within the 200ms queue can additionally reseed stale backend text; cleanup cancels the old pending session (`useSyncedBuffer.ts:157-163`, `appModelAdapter.ts:659-683`). That pending-keystroke data-loss extension remains an untested timing hypothesis.
- A separate reload epoch was introduced to avoid remounting for ordinary revisions, but the content key bypasses that intent. Consolidate source installation into a single explicitly typed activation/reload/recovery protocol; ordinary Save should reconcile metadata and preserve the active editor model/local edits.

#### C7 — P2: a newly opened, clean disk file is projected without its save status and displayed as Not saved

- Native observation: opening `/tmp/gomark-audit-20260907/native-document.md` with the real file picker rendered its preview, but header identity said `Not saved` before editing.
- `internal/appmodel/file_lifecycle.go:303` builds the Open patch from raw `document.metadata`, whose constructor (`file_lifecycle.go:371-379`) leaves Status empty. `GetState` and normal document updates instead use `effectiveDocumentMetadataLocked` (`internal/appmodel/service.go:521-528`), which computes `saved` for a clean opened document.
- The frontend preserves the missing field and `frontend/src/ui/widgets/DocumentIdentity.tsx:42-43` defaults absence to `not-saved`. This is a real discrepancy between snapshot and event projection, not a timestamp setting. Later ordinary patches can make the label correct, masking the initial defect.
- FR-FT-014 requires clean after Open to show saved. Use the same canonical metadata projector for all event/snapshot construction; avoid fallback labels that silently conceal an invalid backend DTO.

#### C8 — P2: rejected Appearance updates partially persist, surviving restart

- Confirmed with real SQLite and the public `SettingsHandler.UpdateAppearance`, using a temporary database opened by production `db.Open`. Existing state was `{theme: glass, mode: dark, defaultOpenMode: viewer}`. The requested update was `{material, light, editor}`.
- A test-only SQLite `BEFORE UPDATE` trigger raises `ABORT` when `appearance.mode` is written, forcing the second scalar's failure. This is a precise database failure injection, not a claim that production installs such a trigger or that real disk-full timing was reproduced.
- The handler correctly returned a classified `io` error. However, a subsequent real GetSettings read returned `{material, dark, viewer}`: theme committed, later fields did not. Closing the DB and reopening it through production `db.Open` returned the same mixed state. The service observer remained at viewer with zero notifications, as expected for a rejected update.
- Cause: `internal/settings/repository_sqlite.go:139-146` performs three independent upserts without a transaction. `SettingsService.UpdateAppearance` reports failure before notifying observers (`service.go:164-170`). Frontend `AppearanceControls.tsx:115-131` applies the new appearance only after a fulfilled result, so the already-displayed appearance stays old while the database's theme has changed; bootstrap reads it on relaunch (`AppearanceControls.tsx:71-86`). This frontend display consequence is source-confirmed, not manually tested with a failing real UI database.
- Positive control in the same probe: public `ResetAppearance` subjected to the identical second-scalar trigger returned `io`, retained the entire original appearance, and retained it after DB close/reopen. Its transaction (`repository_sqlite.go:151-167`) works. This rules out a blanket SQLite/recovery problem and demonstrates the missing transaction in ordinary UpdateAppearance.
- Requirement context: Feature 001 `spec.md:287` says a failed settings write leaves the last acknowledged value active. Independent scalar fallback is for missing/invalid stored values, not authorization to partially commit one rejected group update. Even a single UI theme change sends the complete Appearance group, so failure while redundantly upserting a later sibling can produce the same divergence.
- Probe: `TestAuditAppearanceGroupAtomicityUnderSQLiteFailure`; temporary source `2026-09-07-project-health-evidence/settings-probe.go.txt`, original temporary overlay `/tmp/gomark-audit-settings-overlay.json` (reconstruct it using the evidence README), exact log `2026-09-07-project-health-evidence/settings-probe.log`, captured actual Go exit `2026-09-07-project-health-evidence/settings-probe.exit` = **1**. `update` fails the atomicity assertion; `reset` passes. No repository files or user settings DB changed.
- Refactor direction: make each logical settings group update one SQL transaction and preserve the existing acknowledgement rule. Markdown and Editor use the same sequential-upsert pattern, but were not separately fault-injected in this bounded follow-up.

### Additional risks found, not promoted to reproduced defects

1. On Linux, where `Stat_t.Dev` is unsigned and inode identity works, ordinary atomic Save updates `baselineVersion` but only Save As updates `canonicalIdentity` (`save.go:360-377`). Reopening the just-saved path can fail identity deduplication (`file_lifecycle.go:191`). The ordinary-save reopen probe PASSED on macOS because it already falls back to path identity. A Linux runtime test is needed; do not call this current-host reproduced.
2. `CommitPreparedOpen` mutates the live model, releases the global mutex for recent-file persistence (`file_lifecycle.go:286-291`), then may roll back to a pre-I/O snapshot on emitter failure (`service.go:924-937`). Interleaved legitimate edits/tab mutations could be clobbered by that rollback, and a closed document could be dereferenced on return. Needs a dedicated concurrent-persistence fault probe.
3. Appearance partial persistence has now been reproduced and promoted to C8. Markdown and Editor share the nontransactional group pattern; concurrent mixed writes and those sibling groups remain unprobed.
4. Go UpdateBuffer does not validate writable capability (`internal/appmodel/document.go:56-84`), even though Save does; tests explicitly mutate read-only documents to check autosave eligibility. The UI protects ordinary editing, but backend authority is not structural for this command. Treat as invariant hardening, not proof that normal UI permits typing read-only content.
5. The global service mutex guards event publication and whole-state snapshot copying, so emitter stalls affect all documents; content strings are immutable so snapshots do not copy full content bytes. Worth preserving snapshot economy while shrinking broad critical sections.

### Architecture and maintenance recommendations

#### Preserve

- Wails handlers, typed result envelopes, Go-authoritative document state, and adapter-only Wails imports are sensible boundaries; avoid moving file writes or canonical state into Redux.
- `internal/file` separates codec/classification/path/atomic replacement from application state. Bounded reads, same-directory replacement, permission/BOM/line-ending handling, post-commit distinction, and injected I/O test seams are real strengths.
- Content-free Redux patches and activation acknowledgements are valuable. Fix their lifecycle integration rather than returning to global frontend text state.
- The action registry, tokenized themes, local Monaco setup and sanitization are worth preserving. Remote document content is a separate legacy policy to reconcile with the owner clarification above. `frontend/src/logic/markdown/renderer.ts` deliberately strips image src and sanitizes rendering; no obvious unconditional application network request was found in reviewed paths. The fresh build/offline-gate results and their scope limits are recorded above.
- SQLite's WAL, busy timeout, additive migrations, transactional recent-file read-modify-write, and corruption preservation show serious attention to independent instances.
- Many tests assert actual bytes, fault boundaries, document revisions, and native-host wiring. The reproduced failures demonstrate missing composition coverage, not useless tests.

#### Consolidate first

- App.tsx is 2,179 lines and DocumentTabs.tsx 1,355 lines. Both orchestrate close/conflict/reload state. AppModelService spans a 1,040-line service file plus 719-line save, 716-line close-plan, and 631-line conflict modules, with numerous token maps, timer maps, reservation maps, and test/harness setters sharing one lifecycle.
- Splitting files alone would hide the same coupling. Extract a document lifecycle owner with explicit path/revision/operation state, one close transaction owner, one frontend source installer, and a shared presentation outcome pipeline.
- Reduce optional production dependencies and forgiving fallbacks at the composition root. Required host ports already fixed real nil-wiring bugs; continue that pattern. Avoid converting every helper into an interface. The generic single-purpose lifecycle barrier/alias types add indirection but are not urgent defects.
- Put historical rationale into ADRs linked by short invariant comments. Several source comments recount past task numbers and exact screenshot pixel counts at great length (CodeEditor.tsx:133-155; autosave.go:215-221; close_drain.go:7-45). Some explain valuable constraints, but narrative churn makes it harder to see the current contract and mismatches can survive beside reassuring prose.
- Add invariant/property scenarios spanning public APIs: save while editing, Save As versus autosave/close, simultaneous stale command/refusal, repeated document disposal, real host alias identity. Unit names that mention requirements are useful indexing, not evidence of untested combinations.

### `frontend/src/dev` and `cmd`: legitimate, with a concrete boundary concern

- `frontend/src/dev/bridge-mock` is a deterministic in-browser simulation for Vite dev-ui and Playwright; it is necessary when there is no Wails native bridge. `frontend/vite.config.ts:34-45` enables its resolver only when mode is neither `wails` nor `production`; production resolves committed Wails bindings. It is not inherently accidentally bundled production code.
- The mock handler is 2,024 lines and replicates many backend transitions; drift is an ongoing cost. Prefer small contract fixtures and generated/protocol-parity checks; do not rely on mock success as proof that native handlers/dialogs/persistence work.
- `cmd/native-evidence/main_native_evidence.go:1` is build-tagged `native_evidence`, a legitimate Go convention for another executable. It runs the real backend with scenario-driven ports for timing/evidence. `frontend/src/logic/adapter/nativeEvidenceRuntime.ts` is a separate harness adapter; do not delete cmd because it looks auxiliary.
- There is actual test-condition logic in production widgets: `EditorView.tsx:270-278` parses `?parity-case` and forces Refresh preview to hang/fail; `CodeEditor.tsx:156-160,396-400` alters font metrics on that query. Comments/spec explicitly authorize capture conditions, so this is not concealed mock substitution. But it makes evidence behavior conditional on production URL state and forces source comments/allowlists to defend a measurement concern. Refactor toward a test-only injected capture policy or external harness capability and revalidate immutable visual evidence before removal.

### Documentation quality and authority

- Active authority is `.specify/feature.json` → `specs/003-real-files-and-tabs`. `README.md:26-39` still says everything including what to build next is in docs/delivery. That contradicts the actual migrated workflow and sends a new contributor to stale authority.
- The original product docs are unusually good at plain-language intent and concrete consequences: `opening-and-saving-files.md` explicitly puts disk files first, explains the hard-link/xattr atomic-replace tradeoff, and distinguishes silent autosave success from visible failure. Preserve that clarity.
- Active spec/plan are detailed and contain explicit migration/deferred scope. The 003 plan's “Plan currency” admits it lagged 44 clarifications. The document retains withdrawn 546-screen parity matrix language alongside its replacement. It is a valuable audit trail but a poor everyday current-contract index. Maintain a concise current architecture/requirement map, with superseded rationale linked as history.
- Do not classify absent workspace/rich-rendering/Assistant/session restore as unfinished 003: the active spec explicitly defers them. Do not edit original product spec to make current code appear compliant; create current conformance findings and retain authority decisions.

---

## Appendix B — Tooling and test evidence

### Findings that should drive the refactor

#### 1. Baseline verification can report PASS with missing baseline comparison inputs — high confidence, reproduced

`scripts/verify.sh:41–74` checks the `.md` and `.exit` files but not `.findings` or `.failing-tests`. At `:144` and `:156`, it runs `comm` with stderr discarded and does not check its exit status. Missing inputs therefore produce an empty comparison, and the success branches at `:148–149` / `:166–167` accept newly failing lint/tests when the current output contains at least one parseable finding.

Temporary probe copied the current `verify.sh` and `evidence_id.sh` unchanged to a temporary repository-shaped directory, supplied only `.md` and `.exit`, and replaced `just` in PATH with deterministic fake gate executables. The fake lint reported a new source finding and exited 1; the fake test reported `TestNewFailure` and exited 1. Actual result: **exit 0**, with M3 static analysis PASS and M4 tests PASS. Missing baseline findings files were confirmed absent. Probe directory: `2026-09-07-project-health-evidence/verify-fixture (reconstruction instructions in evidence README)`.

Fix direction: keep baseline capture, but share a structured result format and parser with verify; validate artifact schema/completeness and every child exit, and fail closed on missing/unreadable comparison inputs. Add a behavior test with a deliberately incomplete baseline and new failures. Existing `scripts/baseline_verify_test.sh` tests an explicitly UNRELIABLE row (`:88–109`) but never this missing-input path.

#### 2. Offline bundling intent became an overbroad network guard — owner clarification and reproduced checker defect

The owner's clarified goal is that all frontend assets and rendering dependencies ship with the app so it works without internet, with future AI connectivity isolated from local operation. The existing checker bans request API spellings rather than directly proving that product outcome. Its weakness below remains useful evidence about verification quality, but strengthening a general network prohibition is no longer the recommended task.

`frontend/scripts/check-production-network.mjs:74–94` computes a single `safeVitePreload` flag for an entire line. If that line contains Vite's allowed `fetch(variable.href, variable)` pattern, **all** prohibited request APIs anywhere on that same line are accepted. This matters especially for minified bundles, whose many expressions share one line.

A temporary bundle containing exactly `fetch(a.href,b);fetch('https://example.invalid/outbound');navigator.sendBeacon('https://example.invalid/telemetry');` was scanned with `relativeViteBase: true` and returned **findings: []**. No outbound request was executed; the file was only scanned. Fixture: `2026-09-07-project-health-evidence/network-probe-input.js.txt`.

The source-order proof for local Monaco injection is also only substring order (`:34–49`), and the relative-base proof is exact source text (`:52–64`). Neither proves that the shipped worker and assets actually load offline. The existing negative fixture at `frontend/src/ui/components/CodeEditor.bundle.test.ts:74–117` puts prohibited calls in separate files and does not exercise the demonstrated false negative.

Refactor direction: retire the blanket API ban and its exemption machinery. Keep only build checks that directly help establish that required frontend assets are present and referenced locally, and verify their actual loading in the packaged app without internet. A narrow check for remote application-asset references may support this, but should not expand into policing every use of `fetch`, a local resource loader, or a future AI client. Local editor operation and optional AI network behavior need separate acceptance tests. The current probe establishes that the old checker is unsound; it does not establish that the current packaged application fails offline.

#### 3. The named E2E suite exercises a second backend implemented in TypeScript — high confidence

`frontend/playwright.config.ts:81–92` starts `npm run dev` and the immutable-reference server. `frontend/vite.config.ts:8–31,34–45` rewrites bridge/runtime imports into `src/dev/bridge-mock` for every mode except `wails` and `production`. Thus all 11 top-level browser test files use the mock backend; this is a frontend browser integration/parity suite, not real-backend E2E.

For a concrete example, `frontend/e2e/real-files-and-tabs.test.ts:30–57` types in Monaco, clicks Save, and checks one confirmation plus Saved status. Its Save calls `frontend/src/dev/bridge-mock/go/appmodel/AppModelHandler.ts:1824–1926`, which updates in-memory metadata and returns a synthetic committed result; it performs no disk write. Browser journeys still provide useful evidence about menus, focus, visible error actions, and UI command ordering. They cannot establish actual disk persistence, Go serialization, SQLite, native dialogs, or the Wails process lifecycle.

`frontend/e2e/offline-and-controls.test.ts:47–70,73–192` watches requests made by this browser page for five minutes while allowing its local Vite server. It does not establish that the desktop binary contains and loads every required asset without that server. Under the owner's clarification, replace this as the primary offline proof with the cold-start packaged-app acceptance described above; there is no need to preserve a five-minute timer merely because it appears in older process rules. Retain useful interaction assertions at the appropriate test layer.

Fix direction: reserve E2E for a launched Wails app or a browser transport to the real Go composition root, use temporary real files/SQLite, and assert bytes/state after UI actions and after restart. Label the current mock-backed browser suite as integration/visual evidence until replaced. Keep native smoke coverage because browser transport alone does not cover native window/dialog wiring.

#### 4. Gate composition repeats expensive work and still leaves different surfaces uncovered — high confidence

There are 34 `just` recipes. `justfile:155–164` manually lists nine steps. CI repeats that list at `.github/workflows/main.yml:48–69` and adds browser parity at `:71–111`. The three pre-push scripts duplicate another subset (`scripts/hooks/pre-push-*.sh`), with no explicit architecture/E2E invocation. The Go tests incidentally execute Go architecture tests but not the frontend architecture gate. `baseline.sh:117–123` and `verify.sh:93–98` define yet other lists, omitting generated bindings, explicit Go vet, real native build, native-tagged scenario tests, and browser tests.

On the fully successful path, `release-stack.sh:116–125` invokes standalone generation and architecture, then `just check`, then Go race tests and npm tests again, then tagged native driver tests, browser E2E, `just verify` (which repeats build/format/types/lint/test/architecture), then desktop build. Totals: 3 explicit architecture invocations, 3 Go race-suite invocations, 3 npm/Jest-suite invocations, and generation twice plus trailing cleanup. Go caching may reduce repeated time; these are invocation counts, not measured wall-time multiplication. `go-archtest` uses `-count=1`, so those explicit executions are forced.

`frontend/package.json:12,20` adds another duplicate: frontend build already runs `tsc --noEmit`, and verify/check run the same typecheck separately. `.golangci.yml:5–11` enables govet while `justfile:62–63` invokes it separately. `native_evidence_safeguards_test.go:13–46` launches two native Go builds, lists packages/symbols, and reads binary bytes inside the ordinary Go test suite. The check labeled tests is therefore partly another build pipeline. `main_test.go:66–83` also requires built frontend assets, forcing build-before-test ordering documented in baseline/verify.

Fix direction: one stage graph with results reused within a run. CI and hooks invoke the same scripts; stages can be selected explicitly. Classify native build integrity as Build/Integration, not Unit. Unit must run without dist or native toolchains. Keep compilation, race tests, generated-binding drift checks, and meaningful architecture rules, but run each at its intended layer once.

#### 5. Migration immutability is checked against the wrong Git boundary — high confidence, directly determined by command semantics

`justfile:89–101` executes `git diff --name-only HEAD -- internal/db/migrations/`. On any clean CI checkout this is empty, including a commit that rewrites a historical migration. On a developer branch the same rewrite becomes invisible immediately after commit. It also treats a newly staged migration as a change, without distinguishing addition from modification. `architecture_test.go:261–297` bans destructive SQL patterns but does not compare already-released migration bytes; a changed `CREATE TABLE` column still passes that static ban.

Fix direction: retain migration protection, compare existing migration files against the feature/PR base or a recorded released manifest, permit only new numbered files, and fail if the base cannot be resolved. Validate against a temporary Git repository containing both an added migration and a modified historical migration.

#### 6. Baseline finding identity is lossy and composite gates can leave a language unmeasured — high confidence

`baseline.sh:127–155` and `verify.sh:103–116` duplicate human-output parsing. ESLint's formatter row is `line:column severity message rule`; the awk expression stores `file:rule:$2`, where `$2` is the severity, **not the message**. Multiple errors of the same rule in one file collapse after `sort -u`. One new error can replace an old one without being recognized. Go failures lose the package name and restrictive subtest characters; Jest extraction preserves trailing elapsed timing, causing unstable identities if that output form is emitted. Parsing is coupled to console formatting rather than machine output.

`justfile:55–57` runs Go before frontend tests, and `:45–47` runs Go lint before frontend lint. A known Go failure aborts the aggregate before the frontend runner starts. Baseline can classify the aggregate as `ok-with-findings` and verify can accept the same Go findings, without measuring the frontend at all. In addition, `baseline.sh:123` executes coverage but `:159–169` does not classify/report its exit in the `.exit` gate list. Coverage is an unweighted mean of package percentages, not overall statement coverage.

Fix direction: independent language/stage results, native JSON reports (Go test -json; Jest structured report; ESLint JSON), stable package/file/test identifiers, schema versioning, explicit zero-collected tests failure. Keep coverage only if it answers a decision; do not present an unweighted package mean as total coverage. Avoid `--passWithNoTests` (`justfile:60`) in an authoritative gate.

#### 7. Test code is currently shipped inside production assets — high confidence, observed bytes

`frontend/public/theme-bootstrap.test.mjs:1–6` imports Node testing/filesystem/vm modules. The same file exists in current `frontend/dist/theme-bootstrap.test.mjs`, byte-identical: **1,909 bytes**, SHA-256 `24845e9548d71de341c17077fcdedbfd1c05dfc609a41d31234874ea7abb0df9`. `main.go:26` embeds `all:frontend/dist`, so the test becomes part of desktop embedded assets. No claim that it executes in the user UI; this is unnecessary distribution of test code.

Fix direction: move it outside `public` into tests/tooling or tests/unit, while retaining its valuable execution tests for fallback/current themes (`:15–52`). Add a build-artifact exclusion assertion against the actual output graph; do not solve by excluding the test from the runner.

#### 8. Many tests pin representation and historical paperwork rather than observable behavior — high confidence for examples, not a blanket suite verdict

Examples to replace or relocate:

- `spec_clause_count_test.go:28–70` pins a feature-specific Markdown phrase `N `- Q:` entries` across plan/evidence documents. It explicitly tests counts only. This is documentation bookkeeping embedded in `go test`, not product correctness. Generate such counts in report output or move to optional artifact validation; retire the production gate dependency when old feature paperwork is archived.
- `frontend/src/ui/widgets/EditorChrome.test.tsx:130–190` reads CSS and requires individual declarations, font size text, exact theme selectors, and parity-specific classes. Refactoring equivalent CSS can break these tests without affecting users. Keep accessible control/interaction tests (`:192+`, `:445+`, `:670+`); replace geometry checks with computed bounds/visibility at representative widths, and retain only centralized-token import/boundary checks in Lint.
- `frontend/src/ui/components/CodeEditor.bundle.test.ts:38–71,119–135` requires exact import and source expression strings. Those tests neither launch the editor worker nor prove the resulting bundle executes without network. Move artifact/network behavior to Build/Integration and test worker creation through the module seam.
- `internal/apperr/results_test.go:178–204` asserts exact Go field count/name/order for three DTOs already covered by JSON serialization at `:10–83`. It rejects innocuous internal representation changes; consolidate into the wire contract test. Do preserve intentional JSON presence/absence, scalar encoding, and cross-language compatibility checks.
- `frontend/src/dev/bridge-mock/appModel.test.ts:425–478` configures mock outcomes and then expects those outcomes back. It is useful test-support configuration sanity, not evidence of Go conflict detection or disk safety. Avoid counting this as product requirement coverage.
- `frontend/evidence/check-boundaries.mjs:166–198` calls each scenario PASS merely because names appear anywhere in the combined driver sources. It does not prove those paths execute for that scenario. Keep import/build-exclusion checks but replace scenario string-presence claims with actual scenario execution assertions.

Examples to retain as meaningful functional tests:

- `internal/file/atomic_replace_test.go:43–85,124–199`: verifies real file bytes/permission preservation, temp cleanup, pre-commit failure survival, and distinguishes a post-commit sync warning from data loss.
- `internal/appmodel/save_test.go:98–143,604–757`: actual save refusal before disk access, CRLF/BOM/permission preservation, and intact old bytes plus dirty document after a failed write.
- `internal/appmodel/write_coordinator_test.go:106–152`: failed projection after disk commit records the exact snapshot and retry does not write again. A guard against duplicated destructive work, not a DTO tautology.
- `internal/settings/repository_sqlite_test.go:674–710`: installs a real SQLite trigger to fail a middle settings write and checks complete rollback.
- `internal/apperr/results_test.go:206–245`: exact nanosecond timestamp serialized as text and legacy numeric compatibility; ordinary scalar DTO tests cannot be blanket-deleted because JavaScript number precision is a real wire risk.
- `frontend/src/App.test.tsx:897–927,930–1078,2964–3050`: command ordering, backend error projection/deduplication, and stale acknowledgement handling. These use mocks to isolate frontend responsibility; they are useful integration tests, not real-backend E2E.
- `frontend/scripts/generate-editor-themes.test.mjs:41–76,92–169`: output transformation, alpha conversion, missing/duplicate/unresolved token rejection.
- `frontend/public/theme-bootstrap.test.mjs:15–52`: executes the actual bootstrap in a VM and observes DOM attributes, with bad/old data and OS appearance cases.
- `frontend/e2e/real-files-and-tabs.test.ts:196–252`: visible Retry is painted and a second attempt changes observable UI. Keep that frontend journey, extend a real backend version to assert the file bytes.

Use a replacement matrix with the original requirement, observable outcome, and lower-level/real E2E replacement before retiring any existing test. This audit does not establish that a large percentage of all tests is useless.

#### 9. The architecture intent is worth preserving, but enforcement is scattered and partly name-based — high confidence

Keep a compact architectural Lint stage for: generated bridge isolation; handler signature and panic policy; import graph/composition-root direction; local application-asset references and no instance lock; tokenized colors/localization; migration immutability; release exclusion of test-only drivers. These protect crosscutting properties behavior tests may not cover exhaustively.

Current implementations have different strength:

- `architecture_test.go:103–199`: finds exported methods on names ending Handler, then enforces result/context/deferred-recover shape. Valuable, but binds-by-name heuristic should be resolved against actual Wails Bind types, and the recover AST check only finds any nested recover call, not successful error projection.
- `architecture_test.go:223–258`: identifies cross-package constructors by method-name regex. Preserve direction policy with a resolved import/dependency rule, not arbitrary constructor suffixes.
- `architecture_test.go:364–413`: any struct containing DocumentID and Content plus any Snapshot-returning interface passes; unused declarations could satisfy it while no consumer uses the seam. Replace presence proof with actual content-access behavior and an explicit compile/import contract.
- `architecture_test.go:434–486`: document-content boundary recognizes six parameter names. A differently named payload could bypass it. Preserve the Save/flush contract with actual typed method signatures and behavior, not parameter spelling.
- `architecture_test.go:506–587`: illegal literal category/remediation pairings are a useful static lint rule complementing runtime validation. Keep in Lint if retained; do not duplicate the rule as an entire product test category.
- `frontend/eslint.architecture.config.js:16–81` applies real AST import/JSX rules; retain and consolidate. `frontend/scripts/archtest.mjs:31–66` counts all boundary messages against a strings allowance, but current string/color maps are empty. `archtest-allowlist.json:3–10` only permits 4 parity-route source matches across 3 files. Those explicit allowances are not general permission to suppress failures.
- Native driver checker duplicates frontend Wails-boundary checking in `frontend/evidence/check-boundaries.mjs:19–65`, invoked twice by `native_evidence_safeguards_test.go:50–81`. Consolidate into one check; keep actual release-binary exclusion at the build stage.

#### 10. Tool tests and release helpers have unsafe/fragile lifecycle edges — high confidence

`scripts/baseline_verify_test.sh:90–98` installs an EXIT trap that recursively deletes `specs/999-evidence-contract` **before** checking that the directory did not already exist. If that guard fires, `fail` exits and cleanup removes the preexisting directory it claimed to protect. Do not run that script against preexisting fixture data. Move fixtures into a unique temporary repo and install cleanup only after exclusive ownership is acquired. No destructive reproduction was performed.

The same script has no caller in justfile, package.json, hooks, CI, or Go tests: repository search finds only its own definition/references. Therefore meaningful refusal/routing tests are not part of the advertised gate. Its source-order test at `:111–122` and retired-command text tests at `:145–160` should become behavior tests of the final shared runner, not fossilize the current implementation.

`release-stack.sh:105–112` kills every process found on ports 4173/4174 with SIGKILL regardless of ownership. `:127–129` swallows trailing generated-binding cleanup failure, and `:133–160` replaces the exit-codes artifact including human Notes with instructions to rewrite those Notes. Fix lifecycle management by owning per-run child servers, using unique ports or explicit provenance, and writing machine results separately from human interpretation.

### Complete script inventory and disposition

Counts include tracked files, including support JSON/tests, not just executables. Inventory is complete for `scripts/` and `frontend/scripts/`; the extra native-evidence checker is included because Go tests invoke it.

| File (lines)                                           | Current role / caller                                                          | Disposition for requested slim tooling                                                                                                              |
| ------------------------------------------------------ | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| scripts/baseline.sh (257)                              | Seven captures, log parser, feature evidence writer; just baseline             | Keep purpose, consolidate execution/result schema with verify. Fix reliability/identity coverage above.                                             |
| scripts/verify.sh (197)                                | Six stage reruns and baseline comparison; just verify                          | Keep as shared verifier, replace duplicated parser/runner and missing-input false green.                                                            |
| scripts/evidence_id.sh (76)                            | Safe evidence-name parsing and two legacy aliases; baseline/verify/release     | Keep private evidence adapter while old evidence remains readable; no public entrypoint needed.                                                     |
| scripts/release-stack.sh (178)                         | Repeats full gates, kills ports, writes release report                         | Retire separate execution graph; fold single-run report generation into verify. Preserve provenance and raw results.                                |
| scripts/baseline_verify_test.sh (163)                  | Routing/refusal/provenance/retired-command tests; not automatically called     | Move to tests/tooling, replace source-string assertions with temp-repository behavior tests, add to Integration. Fix cleanup ownership first.       |
| scripts/hooks/pre-push-bindings.sh (4)                 | just gen-check wrapper                                                         | Retire wrapper once hook invokes shared verify/build stage.                                                                                         |
| scripts/hooks/pre-push-frontend.sh (8)                 | Five frontend recipes                                                          | Retire parallel hand-maintained stage list.                                                                                                         |
| scripts/hooks/pre-push-go.sh (7)                       | Four Go recipes                                                                | Retire parallel hand-maintained stage list.                                                                                                         |
| frontend/scripts/generate-editor-themes.mjs (248)      | Token CSS to Monaco TS/highlight CSS                                           | Keep generator; consolidate under Build generation stage and preserve deterministic outputs.                                                        |
| frontend/scripts/check-editor-themes.mjs (39)          | Temp regeneration and byte comparison; prebuild + pretest                      | Keep drift check as generator --check or shared Build check; avoid invoking redundantly in a single verify run.                                     |
| frontend/scripts/generate-editor-themes.test.mjs (185) | Node functional generator tests; npm test                                      | Keep meaningful tests, relocate to tests/unit/tooling and use one explicit runner owner.                                                            |
| frontend/scripts/ensure-dist-placeholder.mjs (9)       | Restores .gitkeep after Vite clears dist; postbuild                            | Consolidate into Build lifecycle; preserve cold-checkout embedding until asset layout is deliberately changed.                                      |
| frontend/scripts/check-production-network.mjs (174)    | Source/bundle regex network guard; postbuild + archtest + Jest fixture         | Replace blanket request-API policing with focused asset-bundling checks and offline packaged-app acceptance; retire redundant scanner machinery.    |
| frontend/scripts/archtest.mjs (229)                    | Import/strings lint, colors, parity route budget, network                      | Consolidate into Lint stage; retain useful architectural constraints with one parser/config authority.                                              |
| frontend/scripts/archtest-allowlist.json (11)          | Empty strings/colors allowances; four explicit parity matches                  | Keep historical exception evidence until those capture conditions are relocated; retire count mechanism after exceptions disappear. Do not grow it. |
| frontend/evidence/check-boundaries.mjs (199)           | Native driver imports/build tag/source-signal checks; called twice in Go suite | Consolidate genuine dependency graph checks into Lint/Build. Retire scenario-presence PASS claims when execution tests exist.                       |

### Ancillary script ownership and further source findings

The complete inventory above covers the requested root `scripts/` and `frontend/scripts/` directories. A bounded ancillary pass also examined build, generated workflow and legacy manual-test helpers. These are distinct from the application quality gate; they should not all become extra public recipes.

| Ancillary area                                    | Disposition and verified issue/limit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `build/icon/process_icon.py`                      | Keep as optional build-asset tooling. Its example at line 18 and `build/icon/README.md:19` give `../../../build/appicon.png` when running from `build/icon`, which targets a directory outside this repository. The intended relative output is `../appicon.png`. This is a concrete documentation defect, not an application runtime failure.                                                                                                                                                                                                                                                            |
| `build/windows/installer/`                        | Future packaging scaffolding. `wails_tools.nsh:1` declares generator ownership, so unresolved template expressions are expected. At line 175 the WebView2 bootstrapper execution does not capture/check its result before continuing: a prerequisite-install failure can leave an apparently installed product without its runtime. This is a source-supported release risk; no Windows installer was executed. Association-template concerns are also deferred because current `wails.json` declares no file associations. Fix through the owned template/generation path when packaging is implemented. |
| `.specify/scripts/bash/`                          | Six generated files matched the hashes in `.specify/integrations/speckit.manifest.json` for Spec Kit 1.0.4. Preserve generator ownership; do not hand-edit or duplicate them into application tooling. Ralph/bridge Bash and PowerShell scripts belong to separately versioned extensions. This pass inventoried structure/ownership, not every extension execution path.                                                                                                                                                                                                                                 |
| Agent-file synchronization                        | `AGENTS.md:268` names `sync-agent-files.py`, but no such script exists in the repository. `.agentsync.json` contains only `codex: false` and supplies no implementation. Resolve this missing command's owner while retiring dead workflow instructions; do not invent a new mirror of the generated Spec Kit skill files.                                                                                                                                                                                                                                                                                |
| `docs/delivery/plan/testing/tools/fault_proxy.py` | Keep classified as a legacy manual AI-failure fixture, outside ordinary product verification. At line 151 it reads the complete upstream response before forwarding it. Its passthrough description therefore does not preserve streaming timing or cancellation semantics. It cannot prove later streaming-AI behavior; no new AI feature is inferred from its presence.                                                                                                                                                                                                                                 |

### Why cmd and frontend/src/dev exist

`cmd/native-evidence` is not a second shipping product command. All three implementation files and three test files are native_evidence-build-tagged. Its `main_native_evidence.go:37–61` creates the real ApplicationContextHolder and launches Wails; `:64–95` accepts scenario/assets/database parameters; `:98–146` substitutes approved clocks/dialogs/observers for reproducible scenarios. It exists to collect real desktop evidence that mock Playwright cannot provide. The comments at `:121–145` document a previous bug: replacing the root's model silently lost clipboard/reveal and settings observer wiring; it now uses the existing model. Retain the useful real-backend runner, move its test/evidence role into a clear E2E harness, and reuse production composition. Tagged scenario tests run only in release-stack, not normal Go test/CI (`justfile:65–66`, `release-stack.sh:121`; also `cmd/native-evidence/host_ports_wiring_test.go:32–35`).

`frontend/src/dev/bridge-mock` is a development/testing transport replacement selected by Vite. It is 7 files / 3,032 raw lines including 3 test files. The appmodel implementation is ~2,000 lines and recreates document/revision/close/conflict/save state machines in browser memory. Its own comments document prior divergent behavior: capability values (`appModel.test.ts:88–99`), projection content revisions (`go/appmodel/AppModelHandler.ts:699–711`), and path identity (`:1058–1078`). It is excluded from normal production-mode resolution, but it is exactly the backend used by browser verification. Keep only minimal deterministic stubs/fixtures where a frontend unit test needs a controlled response, under test-support; do not keep a second evolving product model as E2E truth. A frontend-only playground can remain explicitly optional.

### Reproducible inventory and organization cost

Measured from `git ls-files`, UTF-8 raw line counts (comments/blanks included), excluding untracked build output:

| Surface                             | Files | Raw lines |
| ----------------------------------- | ----: | --------: |
| Go tests (*_test.go)                |    66 |    14,944 |
| Go non-test .go                     |    68 |    12,171 |
| frontend/src *.test.ts(x)           |    72 |    23,593 |
| frontend/src non-test TS/TSX        |    97 |    20,785 |
| frontend/e2e *.test.ts, recursive   |    20 |    10,143 |
| scripts/ tracked artifacts          |     8 |       890 |
| frontend/scripts/ tracked artifacts |     7 |       895 |
| cmd/native-evidence .go             |     6 |     2,169 |
| frontend/e2e/parity TS files        |    22 |     6,304 |

Every one of the 66 Go test files declares the production package, not an external `_test` package. Frontend tests sit under src; Jest maps all `src/**/*.test.ts(x)` plus `e2e/parity/**/*.test.ts` and uses jsdom (`frontend/jest.config.mjs:3–9`). Pure model/format/parser tests and full component integrations therefore share one label/environment. There are 11 browser files and 9 Jest files under e2e. A previous runner-ownership collision was real: commit `a17c49f` (2026-08-14) changed Playwright to the top-level-only glob; preserve explicit ownership during moves.

A TypeScript AST walk over tracked frontend `.test.ts`, `.test.tsx`, `.test.mjs` found these static string-titled it/test declarations (not expanded runtime cases):

| Group                   | Declarations | Titles containing task/spec IDs |
| ----------------------- | -----------: | ------------------------------: |
| src Jest tests          |          564 |                             427 |
| e2e/parity Jest tests   |           66 |                              34 |
| top-level browser tests |           59 |                              56 |
| Node tests              |           10 |                               0 |

The Go scan found 293 named `func Test...(t *testing.T)` declarations, with only one containing a spec identifier (`TestExplicitSaveWalkthroughTimesBothSCFT002Fixtures`). This is not a total runtime case count: table/subtests, loops, parameterized declarations, and three parity repetitions expand further. About three quarters of frontend static titles embed identifiers. Move task/requirement IDs into `// Proves:` comments and use sentence-style behavior names; never rename away the requirement mapping until it is copied accurately. Some existing tests use camelCase sentence strings (`tokens.test.ts:93,101,108`), which should also become natural sentences.

Moving all Go tests outside production directories is a structural change because these tests currently access private implementation types/helpers. Do not export private fields merely to keep every assertion working after a mechanical move. Rewrite at stable package/application boundaries, retain good fault-injection ports, and use a migration matrix to ensure byte safety, rollback, ordering, and race guards survive. Move standalone architecture/tooling checks into tests/architecture or the lint runner; the public category can still remain Lint.

### Suggested target for the requested five shared scripts and six stages

This is a refactor direction, not an implementation plan or an assertion that the current spec authorizes behavior changes.

- `scripts/build`: deterministic generated assets/bindings, frontend and desktop build, artifact integrity (no test drivers/assets). Build once; use produced output in later stages.
- `scripts/test unit|integration|e2e`: Unit for deterministic transformations/state decisions; Integration for React plus adapters, actual Go services/repositories and disk failure injection; E2E for the real Go backend through UI plus native smoke lifecycle. Visual parity remains a clearly identified visual sub-suite, with immutable-reference and fail-empty accounting preserved while the approved spec requires it.
- `scripts/format [--check]`: tracked source globs for Go/Prettier, same entrypoint from hook and CI. Keep mutations out of verify mode.
- `scripts/verify [stage...]`: the single stage graph for Build, Unit, Integration, E2E, Lint, Format. Lint includes compiler/standard linters and a compact set of genuine architecture rules. Emit one machine result per stage, with command/tool version/commit/working-tree identity, outcome and collection counts.
- `scripts/baseline`: invoke that same graph/result schema and capture the prior result. Comparison belongs to the shared verification library, with complete-input validation and stable report IDs. Diagnostic baseline acceptance must not claim an overall green gate when known failures remain.

`just`, npm, hooks and CI may provide thin aliases, but cannot own separate stage lists. Put tests under a single obvious tests tree or deliberate language-specific tests trees, not public or src. Write ordinary run reports under ignored output directories; explicitly promote durable evidence into specs only when wanted, instead of every browser test rewriting historical feature artifacts.

Retire dormant public promises `package` (intentionally exits 1, justfile:129–137), `sqlc-check` and `vuln` if they remain outside the active verification contract; alternatively implement/enable them intentionally. Do not treat their mere existence as covered security/packaging. Setup/dev are useful conveniences and need not be part of the six verification stages.

### Historical evidence

Relevant commits sampled with `git log -- scripts justfile .github/workflows/main.yml frontend/scripts frontend/playwright.config.ts`:

- `216bcf7` (2026-08-07): corrected baseline dirty provenance ordering.
- `9b87718` (2026-08-07): retained coverage logs in version control.
- `7744cc8` (2026-08-09): introduced immutable zero-tolerance UI parity harness.
- `a17c49f` (2026-08-14): fixed cross-runner collection collision.
- `de37102` (2026-08-14): supplied actual three-run parity mechanism.
- `29739ce` (2026-08-14): produced accounting instead of only testing accounting helpers.
- `559cec7` (2026-08-16): added day-to-day CI parity/architecture and empty-run rejection.
- `4f39195` (2026-08-17): generated release-stack evidence to counter stale hand-written records.
- `4bd8ee7`, `bfb103d`, `31c6676` (2026-08-18): swept parity-only production branches.

The pattern is understandable: each evidence failure added another guard/entrypoint. Consolidation should preserve the successfully identified failure modes while replacing repeated pipelines, source-string assertions, and the fake backend with fewer, stronger boundaries.

---

## Appendix C — History, specification and workflow evidence

### Chronology that changes the diagnosis

| Date and commit                                          | What the record establishes                                                                                                                                                   | Why it matters                                                                                                            |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| July 17 `50d692d`                                        | Initial spec already promises local Markdown editor/viewer, three stages, cross-platform native webviews, offline operation, files/tabs/workspaces, rich rendering, later AI. | This is a broad product, not a request merely for parity machinery or a UI prototype.                                     |
| July 20–23 `21346f8`…`f811652`                           | Scaffold, model, editor, rendering, settings; growing trace/story/phase validators and dedicated completion evidence.                                                         | Many later failure patterns predate Spec Kit.                                                                             |
| July 22 `6aa7abc`, `12f4b64`                             | Tracking/spec revisions and audits already add gap repair stories.                                                                                                            | Append-and-repair was an established process, not a new phenomenon in 003.                                                |
| July 25 `927d15f`                                        | Audit of `39efb7a`; intentional process cleanup: 327 files changed, 2,640 insertions, 29,924 deletions; deletes traceability and completion machinery.                        | This was a response to evidence machinery costing too much and proving the wrong thing.                                   |
| July 28 `3af7c58`                                        | Specification converted into `docs/delivery/`, 324 files changed, 9,915 insertions, 10,276 deletions. Historical July 25 audit itself removed from live tree.                 | A later auditor cannot understand the process by reading only the current tree.                                           |
| July 28–30 `c8d88fe`, `a240936`, `fc785fe`, `857636a`    | STORY-058 ships partial token rules; copy/anchor/upgrade validators added and corrected; baseline reliability becomes explicit.                                               | The project already experimented with the exact anchor-checker remedy now presented as new.                               |
| July 30 `b9d8a05`…`53af8e4`                              | Constitution and Spec Kit adopted; user-approved removal of non-Spec-Kit workflow validators; appearance work completed.                                                      | Removed validators were deliberately retired, not “never written.”                                                        |
| July 31–Aug 3 `e537caa`, `f70bf3f`, `011d2b5`, `c74fc22` | Only native-shell slice of whole-product 001 is approved; frameless design replaced by native OS framing following feasibility failure.                                       | Whole-product FR count is not the denominator for this shell task set.                                                    |
| Aug 3–7 `cebb11d`…`15080ee`                              | Editor formatting/chrome slice, including explicitly deferred visual controls.                                                                                                | Several original Phase 04 behaviors remain deferred; phase completion is not identical to feature completion.             |
| Aug 7–9 `3fcde38`…`7744cc8`                              | Real file/tab lifecycle; zero-tolerance parity harness.                                                                                                                       | First real filesystem workflows arrive after considerable shell/chrome effort.                                            |
| Aug 12–14 many `fix(ui)`/`docs(evidence)` commits        | Parity convergence, stale captures, disabled controls, zero-document close traps, e2e collection failure.                                                                     | Measurement validity and real interaction had not been established before large-scale verification.                       |
| Aug 14 `23ba4b5`                                         | Whole-screen parity contract explicitly retargeted to components.                                                                                                             | It was an approved course correction, not evidence that all previous “drift” was a product bug.                           |
| Aug 14 `3befc43`; Aug 16 `621fc3c`                       | Authority artifacts diverged between a parent squash and task chain; owner resolves, later resets parent onto chain.                                                          | A linear retained history does not demonstrate the task-branch protocol worked.                                           |
| Aug 16–19                                                | Broad wiring/availability/close/save/reload fixes; parity-only production branches removed; native evidence improves.                                                         | The authority boundary existed in code while end-to-end semantics still failed.                                           |
| Aug 19 `544372d`                                         | Memoizes preview; cancels CI-host test by owner instruction; closes native stall unexplained with limitations recorded.                                                       | Checked boxes include cancellation and accepted unknowns, not just verified fixes.                                        |
| Aug 21 `35de8f2`                                         | Retrospective explicitly excludes hunting owner-observed runtime defects.                                                                                                     | Its unconditional architecture/process health claims outrun its method.                                                   |
| Sept 7 `883fd05`                                         | Skills and dependencies updated.                                                                                                                                              | Current build results must be associated with this later dependency set, not automatically inherited from Aug19 evidence. |

### Findings

#### H01 — The retrospective's causal foundation is materially inaccurate

**Evidence.** `docs/delivery/retrospective-003.md:98–108` claims `docs/traceability.yaml` held the join between legacy `STORY-*` and Spec Kit `FR-*` and its deletion left migration unfinished. `git show 927d15f^:docs/traceability.yaml` instead shows a generated legacy map of `PH00-R01`, `STORY-001-AC-1`, legacy spec clauses, and test locations. It was deleted July 25, five days **before** Spec Kit/FR adoption (`b9d8a05`, July 30). It could not have contained that future join.

`retrospective-003.md:291–296, 387–394` says `check_proves.py`, `check_story.py`, and `upgrade_check.py` “do not exist,” the anchor mandate “has never been machine-checked,” and the checker was “specified but never written.” Git history finds creation/update in `a240936`, `fc785fe`, `857636a` and deletion in `53af8e4`. `git show a240936:scripts/check_proves.py` contains a real anchor resolver and advisory unproven-rule report.

The deletion follows an explicit recorded user decision: `specs/001-gomarkedit-product/spec.md:21–23` removes all non-Spec-Kit workflow/traceability validators while retaining product/quality/live gates. `specs/001-gomarkedit-product/contracts/migration-readiness.md:17–24` repeats it. `scripts/baseline_verify_test.sh:145–160` **asserts the retired recipes/scripts stay absent**.

**Impact.** Restoring an allegedly never-built checker would repeat an earlier experiment, conflict with the recorded migration decision, and trip a current test. This is not a sound P0 action without a fresh design decision.

**Recommendation.** Correct the retrospective before deriving work from it. If restoring a compact requirement/evidence inventory, state what it fixes that both previous systems failed to fix, and explicitly supersede the retirement contract. Distinguish syntactic anchor resolution from semantic evidence. **Confidence: high, verified git contents.**

#### H02 — The July 25 audit already diagnosed the principal “new” failures

**Evidence.** Historical `927d15f:docs/audits/2026-07-25-phase-00-02-audit.md`:

- §3: App tests mock the actual `AppShell`, then assert their own fake shell; token-only proof passes when there are no color tokens.
- §5: mere next-phase planning revokes previous phase approval because evidence freshness is an exact path allowlist; completion validator checks recipe/test-name presence without executing them.
- §6.3: Playwright uses a hand-written bridge with different dirty semantics and no parity test.
- §6.4: CI only runs for tags/manual dispatch; branch quality is a local ritual.
- §8: a nominally complete requirement/task coverage graph still lacks the issuer of normalization authorizations and the backend Open composition; some tests exercise only a seam whose real consumers do not exist.
- §9: zero-document DTO support and switch/close/save flush ownership are assumed by downstream stories rather than built.

Historical AGENTS in the same commit explicitly says completion/trace machinery “cost more than the application code it governed” and was removed July 25.

**Impact.** The defect is not absence of prose, awareness, anchors, or another audit. Findings did not turn into durable constraints on real integration, ownership, and usable slices. Some remedies were retired before proving they reduced failures.

**Recommendation.** For each recurring failure family, one smallest guard close to the production seam, one real consumer, and one owner. Preserve a small “why past remedy failed” decision record so workflow rewrites do not erase this lesson. **Confidence: high on recurrence; causal inference explicitly from repeated records.**

#### H03 — Completion statistics use incompatible scopes

**Evidence.** `specs/001-gomarkedit-product/spec.md:7–12` says it is a whole-product consolidation approved for progressive migration. Its plan at lines 5–8 plans **only FR-WS-001..020**, after appearance; files, launcher, rendering, packaging, editor expansion, Assistant remain downstream. Migration-readiness lines 36–49 repeats that boundary. The retrospective at lines 65–79 juxtaposes 43/43 checked shell tasks with 14/100 whole-product FRs found by its proving-anchor scan and calls that 14% proving coverage, then infers Feature 001 was not verified.

Similarly, `specs/002-editor-stage-formatting/tasks.md:10–16` explicitly defers image/file paste and TSV/CSV; its spec migration rows at470,486–487 mark original Phase 04 clipboard work deferred. But original `docs/delivery/plan/phase-04-write-markdown.md:25–37` promises image actions and pasted spreadsheet tables. `specs/003-real-files-and-tabs/spec.md:22–24` says even the complete original launcher contract remains unfinished until Open Folder/recent folders exist. Thus the retrospective's “six of fourteen phases delivered” is not literal completion of those original phase contracts.

**Impact.** Undercoverage, task overrun, and percent product complete are all distorted. A rule may be future, consumed, amended, retired, mapped under a legacy anchor, manually proved, or unproved; grep cannot distinguish these.

**Recommendation.** Report user-capability status with four independent fields: owned scope, implementation state, evidence state, and explicit deferral/decision. Do not present anchor occurrence as “proven.” A small ledger is enough; it need not reproduce the deleted multi-validator system. **Confidence: high.**

#### H04 — The retrospective's “architecture sound” conclusion is stronger than its evidence

**Evidence.** Retrospective lines 19–23 deliberately excludes runtime defect hunting, yet §§4,9,10 assert the architecture held and should not be restructured. Its principal proof is empty Redux `reducers: {}`, adapter imports, token discipline, no TODO text, and zero reverts. These demonstrate specific static properties; they do not prove event ordering, buffer/install semantics, default wiring, successful error recovery or performance.

Concrete later integration repairs while those invariants remained present include `4a7b259` (inject host clipboard/reveal), `beeb59b` (drain autosave/editor work before close), `48bfd8c` (null tab order discarded neighboring layout patch), and `68cd2f2` / `f53787c` / `808d1f3` (reload revision, editor session restart, guarded content install). The reload sequence includes repeated identical visible failures despite individually passing fixes.

**Impact.** “Preserve backend authority” is sensible; “no restructuring necessary” is unproved. A single canonical model can still require too many independently coordinated acknowledgements and caches, creating expensive synchronization obligations.

**Recommendation.** Retain the product boundaries unless evidence argues otherwise, but permit focused refactoring of the document transaction/session protocol and UI command orchestration. Review actual user transitions, not only layer shapes. Distinguish static invariant conformance from operational architecture fitness. **Confidence: high that conclusion is unsupported; current refactor priorities are supported by Appendix A and the fresh native observations above.**

#### H05 — The visual reference was promoted to executable truth before compatibility was established

**Evidence.** `docs/delivery/spec/surface/README.md:10–18` asserts that HTML/CSS mockup and native-webview application have no translation boundary, so every visible difference is a defect. The initial product explicitly targets three native webview stacks. The source is a static whole-product design including controls whose behavior is deferred. `specs/003-real-files-and-tabs/spec.md:51–57` records exact shape/style and zero unexplained drift; later clarification expands to 546 logical cases / 1,638 executions (around129–138). `7744cc8` adds the immutable zero-tolerance harness before its first whole matrix is established as feasible. `23ba4b5` withdraws the whole-screen target after failed measurement. Frame/viewport, renderer, fonts, hover, clipping and reference readiness all become separate investigations.

**Impact.** The procedure optimized an instrument whose coverage model was wrong for the product state, diverting work while naturally reachable controls remained broken. The user did approve visual fidelity; that is not authorization to silently make fake application states to satisfy a comparison.

**Recommendation.** A spec may govern geometry, content, typography, interaction and selected image regions without requiring universal pixel identity. Before writing a large verification contract, prove one representative reference/production pair, including actual engine, state, fonts and supported exclusions. Reuse production components for design previews where appropriate; do not assume “same language” means “same renderer/state.” **Confidence: high.**

#### H06 — Production included a separate test-only application surface

**Evidence.** `specs/003-real-files-and-tabs/tasks.md:2152–2160` documents T173: seven production sources branched on `?parity-case`; Settings rendered a completely different pane with Export, AI Providers, AI Context, privacy, diagnostics, language controls absent from the app. A test even asserted Material/Light when the actual props were Glass/Dark. Some tests asserted CSS strings. `9f73f62` removes Settings/tab menu substitutions; `4bd8ee7`, `bfb103d`, `31c6676` remove further branches. T193 at2447 onward retains 34 CSS rules as a **collectively measured** capture condition affecting three pixels, not a proof that every rule is necessary.

**Impact.** Passing visual/e2e tests could certify a route users never encounter. This is a structural cause of false confidence, not merely insufficient test quantity or missing anchors.

**Recommendation.** Test setup can seed state and stabilize capture conditions; it cannot swap the component/behavior being certified. Make that rule a tiny direct guard and a review question. Keep current remaining capture-only adjustments documented and separate from actual product behavior. **Confidence: high, task evidence and repair commits.**

#### H07 — Known unavailable controls became a large owned deliverable

**Evidence.** Feature 001 FR-WS-020 and migration-readiness require future surfaces absent. Feature 002 explicitly reverses part of that presentation boundary: `specs/002-editor-stage-formatting/plan.md:10–19` and `spec.md:209,238,285` require visual File/tab/future controls, while `tasks.md:10–16` forbids their real lifecycle. This is an approved staged design, not proof of unauthorized scope. Subsequent Feature 003 work spends effort proving availability states, replacing fixtures, and repairing apparently real controls whose handler or registry path disagrees.

**Impact.** “Complete editor chrome” became an intermediate target distinct from “user can open, edit, save.” This raised integration and parity cost while yielding little usable capability. It also makes “no placeholders” ambiguous: unavailable future UI is explicitly permitted while production no-ops are prohibited.

**Recommendation.** For future delivery, prefer controls arriving with their real action. If a visible deferred control is deliberately required, list it as product presentation debt with a target consumer and do not count it as implemented capability. **Confidence: high; recommendation is a product/process choice, not retroactive rejection of approval.**

#### H08 — Planning described vertical slices, but executable work units remained layer-oriented and large

**Evidence.** Initial July 25 audit finds separately owned authorization consumers with no producer and Open/dialog/UI wiring gaps. Feature 003's early commits still proceed model → classifier → backend New → backend Open → Wails wiring → UI (`decb647`, `7bf7448`, `33c3958`, `d5d6e81`, `4b88616`, `67de090`), with actual user observation deferred until group completion. Constitution II requires a “self-contained vertical slice” and named evidence per rule, but tasks are often individual cross-layer parts and very long compound sentences. The plan's own `Plan currency` at15–30 admits nineteen convergence phases and 44 clarifications while plan remained untouched for a week, then asserts functional plan was delivered as written.

**Impact.** Boundary omissions can remain invisible across many green local tasks. “One task / one commit” conflicts with realistic debugging (T173/T191 need many commits); task prose absorbs failure diaries instead of a current work graph.

**Recommendation.** Treat a usable scenario as the acceptance unit; permit a few ordered implementation commits underneath it. Explicitly own default wiring and negative outcomes in the same scenario. Keep historical attempts separate from current task status. Do not use commit count or task count as productivity/coverage metrics. **Confidence: high on evidence; causal interpretation medium-high.**

#### H09 — The branch protocol did not prevent split authority

**Evidence.** `specs/003-real-files-and-tabs/evidence/ft-vs-08/phase-20/branch-divergence-resolution.md:5–29` records the common ancestor `7744cc8`, chain 122 unique commits vs parent 1, different highest task IDs and missing approved supersession markers on the parent. `3befc43` records owner-approved chain preference. `621fc3c` later says there are 48 conflicts, parent 158 commits behind,84 production files differing, and the owner's intended “fast-forward” is actually a reset; an archive tag was reportedly made. That archive tag and old squash object are not present in this clone.

**Impact.** The retrospective's “zero merges/reverts means git protocol worked” is invalid. Squashing a task chain and continuing from the unsquashed chain created two versions of normative artifacts, then required an expensive authority reconciliation.

**Recommendation.** Simplify integration: either short tasks merged and deleted promptly, or one durable development branch with small commits. After any squash, all subsequent work must start from the updated parent. Authority status must identify a commit, not just a task label. Preserve necessary archival refs remotely before deleting them. **Confidence: high on recorded divergence, limited on unavailable old objects.**

#### H10 — Current legacy workflows require commands that were intentionally removed

**Evidence.** `.agents/commands/plan-story.md:86,167,212–217` requires `just story-check`, `just spec-check`, checker output and source-copy row counts. `build-story.md:28,118`, `finish-phase.md:20`, `reconcile.md:20–21` require the same removed validators. Current `AGENTS.md:34–36` still routes exclusively legacy work through those skills. The validators were removed per H01, and the baseline script test asserts their absence.

**Impact.** Starting an unmigrated phase through the prescribed legacy loop is mechanically impossible without choosing which governing instruction to disregard. The only live appearance of “found by checker” in KNOWN_ISSUES is historical evidence, not proof the checker should currently exist.

**Recommendation.** Retire the unusable alternate workflow or adapt it deliberately. Keep one supported invocation path with a smoke check of referenced commands and paths. Do not reinstall old machinery by implication. **Confidence: high.**

#### H11 — Generic Spec Kit mechanics need a project adapter, not blame or blind obedience

**Evidence.** `.agents/skills/speckit-converge/SKILL.md:63–82` treats spec/plan/tasks as sole intent, says no git/history and permits only appending new convergence phases. Its requirements inventory and static scope scan can expose missing code, but by design cannot determine whether a source requirement was lost in migration or whether an approval was superseded. It appends rather than repairing the historical task list; duplicated phases and stale claims therefore persist. `speckit-tasks/SKILL.md:142` says tests OPTIONAL unless explicitly required; this project's constitution explicitly requires them, and current feature tasks correctly override this default.

**Impact.** These tools are useful artifact mechanics, not an independent guarantee of delivery. The current app instructions join “analyze → converge → check” as VERIFY even though the native/binary acceptance work remains a separate obligation. Adding more MUST sentences will not make a static convergence pass observe the real app.

**Recommendation.** Keep compatible Spec Kit commands for intent/design/task mechanics, but one small project adapter must supply: scope/authority mapping, mandatory real acceptance seam, command ownership, and honest status. Give convergence a finite current-slice input and evidence references; route historical/spec migration audit elsewhere. **Confidence: high.**

#### H12 — “Done” needs to distinguish implemented, verified, waived and unexplained

**Evidence.** T180 is `[~]` canceled by owner (tasks2278); T194 is `[x]` closed on owner's instruction while the multi-minute native stall is “not fixed, and not claimed” and remains unexplained (2457–2462); T196's platform feasibility conclusion is based on the current WebKit host (2464–2469). T173 has extensive intermediate “still open” prose but later closure. The retrospective uses stale intermediate wording to suggest the final marker itself is false.

**Impact.** A checked historical work item is being asked to mean several different things. Auditors scanning open boxes or grep hits get mutually contradictory summaries, and accepted risks disappear from product status.

**Recommendation.** Separate task disposition from behavior/evidence status. Keep open risks in a short current ledger even when work is owner-canceled or investigation closed. Reopen only on evidence or user direction, not because the marker style is imperfect. **Confidence: high.**

#### H13 — Current-host evidence is repeatedly generalized beyond its scope

**Evidence.** Feature 001 plan target is macOS/Windows/Linux; spec SC018/platform rule explicitly defers other native runtime checks until whole-product completion (spec825–851). T196 calls Chromium “not the shipping engine” after measuring WebKit 1,557 ms and V8 14,300 ms for2 MiB short-line prose (tasks2464–2469). That is true only for the measured macOS host; the original product uses WebView2 on Windows. T180 canceled Ubuntu CI evidence before a real remote run, and task1604 explicitly said the workflow had never run.

**Impact.** Nothing here proves a current Windows failure, but the recorded broad exoneration is unjustified. “Deferred platform risk” must not become “platform proven” merely because macOS passed.

**Recommendation.** Name OS, webview engine, fixture and native/driver/browser route in every evidence claim. Preserve Windows/Linux follow-up as release requirements with a real owner. A platform-matrix feasibility sample should precede commitments dependent on engine performance. **Confidence: high on evidence scope; Windows defect unproven.**

#### H14 — The old roadmap is not a build-ready plan for the remaining product

**Evidence.** Phase 06 at `docs/delivery/plan/phase-06-rich-and-safe.md:54` says “Nothing blocking,” then68–76 lists unresolved choices. Lines73–74 say a configurable preview threshold is required with no default, while original `writing-in-the-editor.md:78–84` already fixes a nonconfigurable >2MB threshold and Feature 003 clarifies binary MiB. Lines60–64 claim `images-and-remote-content.md` contains CSP enumeration, bypass renderer rules and an adversarial corpus; its current rule file does not contain that claimed detail. Reading-mode source at45 points to the editor file, while the substantive ownership is `reading-a-document.md`. Original `opening-and-saving-files.md` recent-list rule advertises Ctrl/Cmd+Shift+T, conflicting with original formatting/keyboard tables assigning it to Table; migrated003 correctly preserves Table and uses Shift+Alt+T for reopen.

**Impact.** An AI following “spec authority” by first matching file will get different answers; a phase generator will ask already-settled questions or resurrect obsolete rules. This is real specification maintenance debt; automatically rebuilding all old documents would create another migration.

**Recommendation.** Before each remaining capability, make a compact accepted source map and resolve only its live contradictions against existing approved decisions. Do not resume Phase 06 literally or call it ready merely because the heading says so. **Confidence: high.**

#### H15 — Two previous-retrospective corrections materially affect next work

**Authority pointer.** Constitution I at24–26 explicitly says legacy authority lasts **until migrated into approved Spec Kit artifacts**; governance166–169 repeats lossless approved transfer. The retrospective's “constitution points at the wrong tree” misses these qualifications. There is discoverability fragmentation (legacy README says nothing outside delivery is normative; old ADR0028 still accepted despite new framed-window decision), but not a need to rewrite Constitution I to invent support for Spec Kit.

**Security boundary.** Retrospective45 and425 says Phase 06 introduces the first sanitizer/security boundary. `frontend/src/logic/markdown/renderer.ts:3,27–31` already runs `rehype-sanitize` last; `renderer.test.ts:178` has malicious-footnote behavior tests from STORY031 (`59b379a`, July 23). Phase 06 expands the threat surface with raw HTML/plugins/assets/CSP; it does not start from no sanitizer. Mechanizing import presence is weaker than executing malicious render fixtures.

**Recommendation.** Preserve the distinction between missing future work and an existing unsafe path. Base added gates on meaningful behavior, not named-symbol counts. **Confidence: high.**

### Original intended product: what remains, versus what is a defect

This is a requirements/status inventory, not a fresh implementation verification. Exact current bugs are documented in Appendix A and the native observations above.

| Capability                                                                                                                          | Original source                                                                                                         | Current classification supported by artifacts                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native shell, themes, settings, basic source editing and formatting, real New/Open/Save/SaveAs/tabs/autosave/conflict/close/recents | window/themes/editor/format/files/tabs product files; migrated001–003                                                   | Implemented slices with fresh checks and reproduced defects documented above; remaining platform/acceptance limits prevent a whole-product completion claim.    |
| Pasted TSV/CSV becomes table; image links and bitmap paste                                                                          | `formatting-text.md:81–108`; Phase 04 steps2/5                                                                          | Explicitly deferred by002 at470,486–487, not a regression in003; needs a named future owner.                                                                    |
| Rich renderer levels, code highlighting, Mermaid/KaTeX, diagram expansion, asset sandbox/remote policy, reading mode/size/width     | `choosing-a-markdown-standard`, `rendering-rich-documents`, `images-and-remote-content`, `reading-a-document`; Phase 06 | Intended remaining feature work. Existing base GFM/sanitizer should be consumed, not rebuilt.                                                                   |
| Folder tree, create file/folder, refresh, folder recents; no rename/move/delete, no watcher                                         | `a-folder-of-notes`; Phase 07                                                                                           | Intended remaining work; do not add destructive file-manager features.                                                                                          |
| OS open routing, startup queue, file associations, packages/icons, full cross-platform native release checks                        | `opening-files-from-the-desktop`, `dragging-files-in`; Phase 08                                                         | Intended remaining work, with current cross-platform risk. Unsigned/no auto-update is intentional.                                                              |
| Full Monaco find exposure, quick-open filenames, command palette, outline and heading-based scroll sync                             | `finding-things`, `writing-in-the-editor`; Phase 09                                                                     | Intended remaining work. No cross-file search/replace is requested.                                                                                             |
| Format/Compact/Lint, markers, problems list, explicit-save hooks, PDF                                                               | `tidying-markdown`, `exporting-a-document`; Phase 10                                                                    | Intended remaining work. Format/Lint absence is currently an approved deferred state. No HTML export, runtime Prettier, paragraph reflow or format-on-autosave. |
| Provider configuration/tests, token budgets, action proposals, per-document session chat                                            | provider/context/quick-actions/chat product files; Phases11–13                                                          | Intended later optional AI. No model download, cloud sync, direct model file writes, shell tools or persistent transcript.                                      |

Two product principles must survive: no automatic session restore/crash recovery was requested for v1, and no WYSIWYG surface was requested. A future refactor should not add them under the guise of fixing “incompleteness.”

### Recommended direction for the future instruction/skill refactor

1. **Start with current real user journeys and an honest capability/defect list.** Do not approve the previous retrospective's P0 program as-is.
2. **One live process entry point, one source map per active capability.** Retire dead legacy command routes. Keep archived decisions discoverable with supersession pointers; no wholesale spec rewrite needed.
3. **Define the unit as a usable behavior with default wiring and failure recovery.** Allow a few implementation commits; do not force every layer fragment into a claimed vertical slice.
4. **Keep minimal high-value evidence.** One production consumer test, one real-app acceptance where mocks cannot prove it, finite UI comparison scope; logs/captures are artifacts, not normative task prose.
5. **No test-only alternate UI.** Fixture seed and capture stabilization are allowed; production component/semantics must stay the subject.
6. **Version the proof as well as the code.** Commit/artifact identity, exact route/host, command exit plus collection count, and current unresolved limits. A baseline can be dirty if its exact state is reconstructable; “dirty” is not intrinsically a failure, but an unrecorded diff makes provenance incomplete.
7. **Separate status fields and stopping decisions.** Implemented, verified, deferred, canceled and accepted unknowns must not share one checkbox. A finite investigation ends in an explicit code fix, a scoped accepted amendment, or a preserved unresolved issue.
8. **Measure candidate tools before extending them.** A checker must catch a deliberately introduced defect that matters to users; test-name/anchor existence alone is not behavioral coverage. Do not recreate the July 25 validator suite with new names.
9. **Preserve useful Spec Kit mechanics while adapting delivery locally.** The history does not isolate Spec Kit as the cause; pre-Spec-Kit failures were the same. The failure is treating artifact conformity as a substitute for connected behavior and maintaining multiple obsolete process authorities.

## Appendix D — Reusability and common behavior

This appendix applies the owner's PDF and accompanying request to the audited code. These are source-confirmed ownership findings and refactoring gaps unless explicitly linked to an earlier reproduction. The twenty entries are not twenty newly reproduced runtime defects; the expanded ordinary-route observations are identified explicitly. Source references use the same `883fd05` commit as the rest of the report; no application code changed during this extension.

### R1 — P2: shared popup styling has at least five independent owners

`frontend/src/ui/primitives/MenuSurface.module.css:64–118` defines common surface, row, hover and disabled styling. Settings imports it at `ui/widgets/SettingsMenu.tsx:23` and applies its surface at `:520`; View does so at `ViewMenu.tsx:12,163`. File/About/overflow instead use `ShellMenuRow.module.css:86–109,150–166,202–266`; tab context uses `DocumentTabs.module.css:219–284`; editor context uses `EditorContextMenu.module.css:10–58`. The local stylesheets contain no CSS Modules `composes` or import tying these rules to `MenuSurface`. This is actual separate ownership, not an inference from a missing TypeScript import.

The copies already differ. Shared row hover/focus/highlight uses `--hover` (`MenuSurface.module.css:102–105`); File/About and editor context use `--surface` (`ShellMenuRow.module.css:255–259`; `EditorContextMenu.module.css:44–47`). Within Material/light those are different colors: `tokens.css:363,380` defines white surface and `#eceaf6` hover. Editor context also uses control radius/padding instead of the popup tokens. By contrast, `--surface-raised`/`--elevated` and `--border`/`--stroke` are compatibility aliases (`tokens.css:519–522`); different names alone are not evidence of different colors.

**Why change it:** a common row-hover, radius, disabled-state or shortcut-decoration change cannot be made once in `MenuSurface` and reach all menu families. Adopt a common surface/row owner, with explicit variants for real content/size differences. Common tokens already provide useful value reuse; keep them. This finding does not establish U1's startup-border cause.

**R1 inventory correction from the expanded review:** formatting-toolbar overflow is a fifth independent popup surface (`EditorChrome.module.css:380–404`) with its own application rows (`:413–442`). It bypasses MenuSurface; `EditorChrome.tsx:500` applies inline radius 12px, overriding both the common token and local narrow radius 11px. Its content genuinely mixes groups, icons and selection controls, but that does not require a separate surface, focus or placement policy. Tab-context rows additionally lack ordinary hover-background styling, and their blur exists only in the parity override (`DocumentTabs.module.css:234–245`); preserve the separately specified context-shadow variant instead of treating every intentional shadow difference as a defect. R15 shows the missing accelerator consequence of the same shared-row bypass.

### R2 — P2: shared menu triggers lead to different interaction lifecycles

`ui/primitives/MenuTrigger.tsx:33–64` genuinely centralizes button semantics, expanded state, styling and ArrowDown/Enter/Space opening. All four menubar buttons and narrow overflow use it. Desktop File/About and View also reuse Radix dropdown behavior (`ShellMenuRow.tsx:686–782,815–869`; `ViewMenu.tsx:149–166`). These are foundations to preserve.

Below those triggers, common behavior splits into separate implementations:

- Settings implements its own outside-pointer/Escape dismissal and opener restoration (`SettingsMenu.tsx:476–506`); its popup key handler only handles Escape (`:522–528`), with no local initial-focus transfer or arrow traversal.
- Tab context explicitly focuses an item and implements ArrowUp/ArrowDown cycling (`TabContextMenu.tsx:160–180,233–246`). Editor context focuses its container and has no corresponding arrow handler (`EditorContextMenu.tsx:102–125,229–278`).
- At minimum width, File/About render raw portalled `role="menu"` elements instead of their desktop Radix content (`ShellMenuRow.tsx:908–1002`). Those branches have no menu key handler or focus-on-open path. The shell's document Escape handler remains, but its custom outside-pointer handler is conditional on narrow View (`:289–301,494–503`), leaving no equivalent File/About outside-dismissal implementation there.

**Why change it:** adopting one opening/focus/dismissal policy currently requires separate changes to Radix integration, Settings, tab context, editor context and narrow File/About. Share the applicable lifecycle and navigation behavior; rich settings controls can retain their own internal interaction. Verify first available item focus, arrows, Escape restoration, outside-pointer dismissal and transition between sibling menus at ordinary/minimum widths. The handler differences are source-confirmed; this extension did not execute those native cases.

The expanded review adds specific consequences to R2:

- **Second-click behavior differs in the ordinary browser:** File/About/View remain expanded, while Settings closes. File/About handlers explicitly request true (`ShellMenuRow.tsx:694–707,823–836`). View uses both Radix's `onOpenChange` and a separate click toggle (`:803–807`), so more than one path writes its open state. An outside dismissal followed by the click reopening it is consistent with the observed outcome; the event sequence was not traced. Test toggling and sibling transitions, not only opening followed by Escape.
- **Quick Theme selection lacks a keyboard path to another theme:** only the current swatch has `tabIndex=0`, all others have −1, and the handler only recognizes Enter/Space (`SettingsMenu.tsx:211–237`). There is no radiogroup arrow traversal. The existing keyboard test sends Enter directly to the All settings menuitem (`SettingsMenu.test.tsx:209–217`); it does not exercise theme selection or prove another theme is reachable from the trigger. This is source-confirmed and was not exercised as a theme change in the browser follow-up. Reuse the selection behavior already provided by Segmented.
- **Editor-context dismissal remains active while closed:** its document pointer listener has no open-state guard and retains the previous opener (`EditorContextMenu.tsx:102–110`); subsequent outside pointerdowns still call that stale element's `focus()`. The opener is `event.target` (`:221`), potentially a nonfocusable Monaco descendant. The unsolicited calls are source-confirmed; visible focus loss is unprobed because default pointer behavior may subsequently focus the clicked control. Scope listeners to the open lifetime and restore through a valid editor focus target.
- **Narrow File advertises an enabled no-op when recents exist:** `ShellMenuRow.tsx:925–935` renders an Open Recent menuitem with `aria-haspopup` but no click/key action, followed by an always-rendered subgroup. The empty-history test does not exercise this enabled case. Use a group label for an inline list or implement a real shared submenu contract; do not present an inert trigger.
- **Toolbar overflow owns another lifecycle:** dismissal, restoration, geometry and portal choice live in `EditorChrome.tsx:287–367,559–563`. Its summary trigger differs from MenuTrigger, and a `role="menu"` wraps ordinary buttons/radios without menu traversal or initial focus. This richer popup needs an appropriate accessible contract; sharing its surface does not require pretending every child is a text menuitem.

### R3 — P2: popup placement and portal policy must be maintained in several places

The `applicationFrame()` query is repeated in `ShellMenuRow.tsx:147–149` and `ViewMenu.tsx:22–24`; Settings queries it separately (`SettingsMenu.tsx:572–573`). Desktop File/About and View override Radix's placement wrapper in CSS (`ShellMenuRow.module.css:124–147`; `ViewMenu.module.css:15–25`). Settings maintains its own measured frame clamp, height bounds and resize/scroll listeners (`SettingsMenu.tsx:390–474`). Narrow File/About implement a different viewport clamp and portal to body (`ShellMenuRow.tsx:303–341,974,1001`). Editor context independently clamps and portals to body (`EditorContextMenu.tsx:70–100,280`); tab context renders inside DocumentTabs with absolute positioning (`DocumentTabs.tsx:1319–1341`; its CSS `:219–251`).

**Why change it:** the safety margin, containing block, resize/scroll behavior and focus/portal policy have multiple owners. Anchor and content differences are legitimate inputs to a common mechanism. Consolidate the shared geometry/lifecycle policy and make those inputs explicit. The application's frame and browser viewport are not interchangeable, particularly in the existing parity harness; migration must preserve that distinction. This finding does not claim every current placement is wrong.

R14 and R16 establish particular failures within R3's ownership split: a discarded tab invocation anchor and clipped menubar popups between breakpoints. The toolbar overflow's separate coordinate/portal implementation also belongs in the placement inventory. Common policy must accept an invocation point, control bounds, or focused-tab bounds as different inputs; it must not erase those distinctions.

### R4 — P2: most dialog families bypass the existing shared modal lifecycle

`ui/primitives/ModalShell.tsx` owns opener capture/restoration (`:56–79`), Tab traversal (`:81–110`), document Escape (`:120–134`), focus containment (`:136–156`) and body portal/accessibility structure (`:176–203`). ClosePrompt and ExternalChangePrompt consume it (`ui/widgets/ClosePrompt.tsx:51`; `ExternalChangePrompt.tsx:53`). SettingsDialog instead duplicates the lifecycle and portal (`SettingsDialog.tsx:32–107,121–172`); AboutDialog and ShortcutsDialog carry further copies and render inline (`AboutDialog.tsx:19–80`; `ShortcutsDialog.tsx:20–90`). NormalizationPrompt has initial Cancel focus and section-only Escape handling, with no local Tab trap or restoration (`NormalizationPrompt.tsx:24–28,40–60`). These are current production consumers, not abandoned samples.

The implementations already differ. ModalShell has a document `focusin` containment listener; Settings/About/Shortcuts do not. About/Shortcuts initially focus their section, but their Shift+Tab guards only recognize focus already on the first control; Settings additionally handles the dialog container (`AboutDialog.tsx:29–50`; `ShortcutsDialog.tsx:47–64`; `SettingsDialog.tsx:81–86`). Base modal visual rules also recur in ModalShell, SettingsDialog, AppearanceDialog and Shortcuts stylesheets.

**Why change it:** a shared focus or portal correction reaches only two prompt families. Adopt a common modal lifecycle and visual frame, parameterizing width, initial focus, backdrop/Escape decisions and content. Confirm Tab/Shift+Tab, focus restoration, backdrop interaction and asynchronous refusal in real consumers. These source differences justify targeted checks; this appendix does not claim a fresh native focus-escape reproduction. Applying the reuse principle to dialogs is a reasoned extension of the owner's request, not a literal component API mandated by the PDF.

### R5 — P2: arrangement selection duplicates `Segmented` and has different Tab behavior

`ui/primitives/Segmented.tsx:17–32,43–68` owns Arrow/Home/End selection and focus transfer after the selected value is acknowledged. At `:78`, only the selected radio receives `tabIndex=0`; the others receive `-1`. SettingsDialog uses it (`:140,149`). EditorChrome separately implements refs, acknowledgement focus and the same key arithmetic (`EditorChrome.tsx:184,280–291,369–410`); its radio buttons omit `tabIndex`, making all three visible buttons ordinary Tab stops. The existing `ui/components/ViewModeToggle.tsx:20` wraps Segmented, but has no production consumer in the reviewed tree.

**Why change it:** a common radio-group keyboard/focus change needs two implementations and can preserve two different answers. Have the toolbar consume the shared selection behavior with its own visual variant. Verify the agreed Tab entry policy, arrows/Home/End and acknowledgement-driven focus in both normal and overflow locations. Different CSS does not require a second interaction algorithm. The DOM difference is source-confirmed; no separate specification violation or theme-dependent action bug is claimed here.

### R6 — P2: advertised icon tokens do not control default icon rendering

`ui/styles/tokens.css:97–98` defines `--icon-size: 15px` and `--icon-stroke: 1.75`, but `ui/primitives/Icon.tsx:151,160–162` separately defaults and sets SVG size to 15, and `Icon.module.css:9` hardcodes stroke width 1.75. No production consumer of `--icon-stroke` was found. The only production use of `--icon-size` sets toolbar minimum inline size (`EditorChrome.module.css:27`), rather than SVG dimensions. Several shell/toolbar callers also explicitly pass `size={15}`.

The preview defines its own file SVG (`PreviewPane.tsx:106–115`), duplicating the paths already present in `Icon.tsx:57–61`, with separate size/stroke CSS (`PreviewPane.module.css:14–23`).

**Why change it:** editing the declared common stroke token has no rendering effect. Changing the default icon size/stroke or file glyph requires multiple edits. Give default SVG styling one effective owner and reuse the glyph primitive. Preserve intentional, explicit per-surface size overrides. Verify computed SVG dimensions/stroke and representative preview/toolbar/shell rendering, rather than checking that a token declaration exists.

### R7 — P3: toolbar grouping is partly reused, but responsive composition is repeated

EditorChrome has useful private action groups and `ActionButton`/`actionButtons` helpers (`EditorChrome.tsx:46–65,107–166`). It is not a wholly copied toolbar. However, group placement is spelled out again in the main toolbar and overflow (`:429–452,508–525`), including two arrangement-group locations (`:478–486,527–535`). Island-like appearance is owned within this widget (`EditorChrome.module.css:71,113`); there is no exported grouping/editor-bar seam in the production UI inventory.

**Why change it:** reordering a group or changing its responsive placement can require changes to both render paths and their classes. Describe groups, order and placement once and render from that model; use reusable grouping/control primitives where another real consumer shares the contract. A shared action-button fix already reaches its occurrences and should remain shared. Keep business availability in the command owner, not a generic Button. Resolve the PDF's scrolling-versus-active-overflow discrepancy separately; extraction alone should preserve behavior.

The fuller bar review extends R7 beyond repeated responsive JSX. `ShellMenuRow.tsx:615–1039`, `DocumentTabs.tsx:1111–1320` and `EditorChrome.tsx:414–569` each own horizontal framing, while their CSS repeats alignment, gap, padding and overflow decisions. Every real tab already shares one template and label helper; there is no per-document implementation to deduplicate. EditorChrome nevertheless combines tab-strip mounting, formatting shortcuts, toolbar composition, overflow and arrangement controls, so its formatting toolbar cannot be composed independently of tabs.

A small horizontal frame with leading/main/trailing slots can share presentation without merging menubar, tablist and toolbar semantics. Extract a children-based group/island and an explicit icon/text tool appearance where the same contract is used. The private formatting ActionButton already preserves editor selection on mousedown and shares disabled/naming behavior; compose it on that visual primitive rather than moving command policy into a universal Button. Sidebar/Assistant tools (`ShellMenuRow.tsx:883–904`), tab close/add controls (`DocumentTabs.module.css:100–179,207–225`) and formatting tools currently need separate changes for shared hit-area/focus treatment. Tab activation, close, menu opening and radio selection still require their distinct semantics.

Toolbar text appearance is selected twice by action identity: `textualControlIds` (`EditorChrome.tsx:64–68`) and action-ID CSS (`EditorChrome.module.css:88–92`). An explicit visual variant would remove that duplicate classification. Strict squares would be a new geometry decision: the active contract requires height 30px, minimum width 30px and inline padding 8px (`spec.md:867`), not equal width/height for every icon tool. The original formatting spec also requires narrow overflow (`docs/delivery/spec/product/formatting-text.md:163–174`). Keep the owner's scrolling/square-tool preference in the refactoring decision list rather than certifying both contradictory directions.

**Additional measurement risk:** tab overflow observes only the strip's box and recomputes on document-list changes (`DocumentTabs.tsx:289–301`). Theme-dependent child padding can change scroll width without changing that observed box or list. This was not reproduced as a stale scrollbar; test a mounted strip near the fit boundary across themes, label changes and resize in both fit/overflow directions. Keep real horizontal tab scrolling and drag-edge behavior. Existing fixed-width action inventories and palette remount tests do not prove continuity when a focused control relocates or child widths change live.

### R8 — P2: the action registry is shared, but availability and shortcut admission are not

`logic/actions/actionRegistry.ts:490–629` centrally resolves deferred/modal/barrier state, tab capacity, save capability and path/tab-edge availability. TabContextMenu supplies context and consumes that answer for both display and dispatch (`TabContextMenu.tsx:134–158,184`). File instead maintains `fileActionDisabled` (`ShellMenuRow.tsx:396–405`) plus a local action/invoker set (`:71–79,352–377`). Its click and shortcut dispatch contexts omit projected state/tab count (`:463–472,560–567`).

A concrete divergence follows: the canonical resolver marks New unavailable at 40 tabs (`actionRegistry.ts:468–475,518–519`), while File's predicate leaves New available when its callback is present. Calling the dispatcher afterward does not recover context that the caller omitted. This is a source-confirmed frontend policy gap; backend capacity enforcement still exists, and this review did not reproduce an over-capacity native state.

There are also three shortcut admission/execution owners: `logic/actions/useShellShortcuts.ts:34–64`, `EditorChrome.tsx:251–276`, and `DocumentTabs.tsx:1039–1099`. The shared hook supports aliases; EditorChrome's listener checks only the primary shortcut. DocumentTabs applies local minimum-tab-count and edge rules and invokes handlers directly, bypassing `dispatchAction`. Registry and dispatcher additionally repeat the seven tab-action identities (`actionRegistry.ts:424–432`; `actionDispatcher.ts:50–58`). Actual binding values and shortcut display are already shared; this is not a claim that every shortcut is hardcoded twice.

**Why change it:** changing an admission, alias, context or outcome policy needs several edits, despite the “canonical” registry. Bind each action to its context and command once; surfaces should consume the same enabled state and invocation. Keep scope arbitration and intentional tab-edge key consumption explicit. Preserve native App/Edit roles delegated to Wails (`internal/application/native_menu.go:9–15`). Test both advertised availability and actual invocation through File, toolbar, tab context and keyboard routes.

### R9 — P2: formatting reuses the algorithm but duplicates command construction

`logic/format/formatting.ts:64–88` already owns reading source/selection, computing an edit and applying one replacement. Toolbar and editor context correctly reuse it. However, `EditorChrome.tsx:198–244` and `EditorContextMenu.tsx:176–206` independently normalize bullet/emphasis preferences, set heading style, construct the same request and assemble dispatch context. Both supply empty source and a `(1,1)` selection that the shared formatter overwrites. `useEditingProjection` is a useful shared foundation (`logic/hooks/useEditingProjection.ts:27–49`), but it does not own the complete command.

**Why change it:** preference normalization or request-policy changes require two production wrappers serving three entry routes, because the toolbar also handles formatting shortcuts. Extract a small format-command runner accepting action, command API/selection source and acknowledged preferences. Narrow the request to the inputs actually needed. Preserve the context menu's captured selection (`EditorContextMenu.tsx:131–140`), which is an intentional input difference. No duplicate formatting engine or newly incorrect heading behavior is claimed.

### R10 — P2: outcome classification and reporting have competing owners

The dispatcher accepts an invocation returning `unknown` (`logic/actions/actionDispatcher.ts:42–44`). It recognizes document mismatch, unavailable and refused; all other results become `mutated` (`:124–188`). Real write results also include cancellation, normalization prompts, conflict and committed outcomes (`logic/store/appModelTypes.ts:78–90`); Open includes cancelled/focused/opened/refused (`:300`). Consequently `mutated` does not reliably mean that a mutation completed. Some consumers already depend on that broad meaning: tab-context reveal uses it to decide focus restoration (`TabContextMenu.tsx:211–221`). This is a source-confirmed contract mismatch, not proof that cancellation currently writes a file.

`App.tsx:114–117,318–328` separately lists Save/Save As as self-reporting actions so generic result handling does not report their failures twice. The nearby comment explains an earlier duplicate report that overwrote remediation. Four entry handlers repeat flush → begin activation → invoke → acknowledge → report (`App.tsx:566–626`). Direct external-conflict choice mapping also appears in both DocumentTabs and App (`DocumentTabs.tsx:455–492`; `App.tsx:1713–1760`), with different surrounding generation/flush/refresh handling. The close-plan conflict transaction is a distinct context and should not be flattened blindly.

**Why change it:** a shared notification formatter does not establish who reports an operation, owns its retry target, or completes its editor transition. Introduce typed outcomes and one operation-level delivery point; preserve detailed per-operation payloads and cancellation/prompt distinctions. Extract common entry/conflict sequences with explicit transaction-specific inputs. Test one refusal notification per operation, retained remediation, cancellation handling and editor continuity. This supports the ownership diagnosis behind C6 without counting it as another reproduced defect.

### R11 — P2: settings groups share values but differ in write ordering and failure handling

`logic/settings/editorSettings.ts:25–69` shares acknowledged settings and update callbacks. Its three group commands repeat merge-current → send-full-group → acknowledge (`logic/settings/settingsCommands.ts:21–53`). Appearance separately maintains desired state and a serialized promise chain (`AppearanceControls.tsx:111–151`), with its necessary DOM/theme-mirror effects.

Consumer failure handling differs too: App's Settings callbacks catch and discard Editor/File failures (`App.tsx:343,347`); View's line-number/wrap callbacks discard the promise without a catch (`:377,383`); Appearance catches and discards persistence/Markdown failures (`AppearanceControls.tsx:131,152,179`). These are void UI callbacks, so menu dispatch does not await the actual settings write. The common action-result path therefore cannot consistently represent persistence failure.

**Why change it:** common ordering, acknowledgement and error-delivery changes must reach three similar settings functions, Appearance's separate implementation, and multiple consumers. Put per-group write ordering and outcome delivery in one small settings owner, parameterized by serializer/acknowledgement effects; let controls submit patches and receive the same outcome. Theme application remains a legitimate Appearance-specific effect. Concurrent stale-full-group overwrites are a risk needing a probe, not a newly reproduced defect. C8 separately proves a backend transaction problem; sharing frontend settings code alone will not fix it.

### R12 — P3: small choice and label tables still have duplicate owners

SettingsMenu and SettingsDialog independently enumerate theme values/translation keys (`SettingsMenu.tsx:59–63`; `SettingsDialog.tsx:22–26`) and mode values (`:71–77`; `:28–32`). Compact/full-dialog mode wording intentionally differs. SettingsMenu's Autosave/Format-on-save/Lint-on-save labels use separate translation keys (`:96–100`) despite identical action labels already present in the catalog (`i18n/locales/en.json:93,104–105,230–232`). The registry supports explicit surface label variants (`actionRegistry.ts:109,177–179`).

**Why change it:** changing one shared choice or identical wording still requires two consumer/catalog edits. Share choice identities and common action labels; retain explicit labels for real surface differences. Preserve the existing translation/interpolation and shortcut formatter. Repeated one-line calls to a shared formatter are legitimate usage and do not justify another framework. No multilingual runtime failure was reproduced.

### R13 — P3: sidebar behavior is embedded in AppShell rather than exposed as a reusable frame

`AppShell.tsx:111–225` combines projected width, pending resize intent, refusal reconciliation, pointer listeners and persistence commands. It directly renders the empty workspace aside and pointer/keyboard separator (`:236–278`), while `AppShell.module.css:10–23,49–73,87–129` owns the grid/divider/responsive behavior. The current production inventory contains no side/content-configurable Sidebar or shared resize wrapper.

**Why change it:** the PDF's intended reusable panel boundary is missing. Extract a bounded frame/resize behavior that accepts content and side, preserving backend-authoritative visibility/width, refused-write rollback, pointer/keyboard interaction and minimum-width presentation. There is currently only one implemented workspace frame: this is not proof of duplicated left/right production behavior. The active scope explicitly permits an empty workspace frame and defers Assistant behavior/content (`specs/003-real-files-and-tabs/spec.md:1244–1248`). Do not build the Assistant or folder tree merely to satisfy an abstraction diagram.

The sidebar review also extends R13's boundary: AppShell watches global notification queues for the string `details.operation === 'update layout'` to reconcile pending width (`AppShell.tsx:109–120,179–191`), while the request's own rejection path separately clears it (`:137–151`). A reusable panel should receive acknowledged/pending/refused state from an application layout owner, not interpret global notification text. Preserve show-at-zero restoration and width-zero collapse in `logic/store/uiLayoutCommands.ts:29–60` as Workspace policy. The grid and divider already share the same width; keep that owner. No editor/viewer split-resize separator or second Assistant resize implementation exists, so there are not several implemented sidebar resize handlers to deduplicate.

### R14 — P2: tab-context placement discards the invocation anchor

**Confirmed in source and reproduced on the ordinary browser route.** `DocumentTabs.tsx:1217–1220` prevents the context-menu default and stores only the target document ID. Its state (`:189–191`), TabContextMenu props (`TabContextMenu.tsx:60–72`) and render (`DocumentTabs.tsx:1319–1342`) carry neither pointer coordinates nor tab bounds. Ordinary CSS instead sets `position:absolute; right:var(--app-gap); top:3rem` (`DocumentTabs.module.css:228–230`). The menu is a sibling of the scrollable tablist, not anchored to the clicked tab. Changing the target changes the commands' document, but cannot change the placement.

The supplied screenshot shows that consequence. Independent browser measurement at 750px width put the clicked tab at x72…132.375 and its menu at x488…738. Native CUA confirmed opening Tab actions but supplied no native geometry. This is a direct explanation for the reported far-right popup; it is separate from the unresolved startup-ring issue.

**Why existing checks missed it:** `frontend/e2e/real-files-and-tabs.test.ts:60–95` checks paint, command availability/result and announcement after right-click, but not the relationship between tab/pointer and popup bounds. `DocumentTabs.test.tsx:158–175,194–202` instead pins parity-only left/top coordinates—210/106 and narrow 172/−116—implemented in `DocumentTabs.module.css:234–251`. Those are capture positions, not ordinary invocation geometry. A tab-strip screenshot is not an anchor test for its popup.

**Refactoring acceptance:** carry target identity and invocation anchor together. Pointer invocation supplies its point; keyboard invocation uses the focused tab's bounds. Apply the shared frame clamp/flip policy without activating a different document. Verify left/middle/right tabs, different click points, scrolled tab strips, keyboard opening, tall popup content and focus restoration. Assert both proximity and usable bounds, not just a nonzero popup rectangle.

### R15 — P2: tab-menu shortcuts exist as attributes but are never displayed

**Confirmed in source and browser.** `TabContextMenu.tsx:253–266` assigns `data-shortcut` but renders only the action label. Its CSS has no attribute-to-visible-text rule. Only the independently scoped MenuSurface row and ShellMenuRow item styles render an accelerator (`MenuSurface.module.css:145–155`; `ShellMenuRow.module.css:224–235`), and tab-context buttons consume neither. The ordinary browser showed `⌘W` and move bindings in attributes, but `::after` was `none` and no shortcut text appeared.

The platform tests only assert the attribute (`TabContextMenu.test.tsx:311–340`). The completed task's explanation incorrectly says an existing DocumentTabs `::after` renders it (`specs/003-real-files-and-tabs/tasks.md:2381–2383`). This is another example of a shared presentation mechanism being presumed rather than actually consumed.

**Refactoring acceptance:** use a shared row/accelerator slot, with the registry still deciding which actions have a shortcut. Verify rendered and painted glyphs across supported platform formatting, and no empty decoration for unbound actions. Preserve attribute tests as narrow metadata checks if useful; they do not prove that a shortcut is advertised to the reader.

### R16 — P2: fixed popup offsets clip menus just above the narrow breakpoint

**Confirmed in source and browser.** The narrow menubar branch begins at width ≤376 (`ui/widgets/minimumWindow.ts:10,19–23`). Above that, Settings uses frame-left 150, View 196 and About 240, each with minimum popup width 250px (`SettingsMenu.tsx:437–439`; `tokens.css:83–85,99`; `ViewMenu.module.css:15–18`; `ShellMenuRow.module.css:134–140`). The application frame clips overflow (`base.css:23–30`), while menu CSS neutralizes Radix collision placement (`ShellMenuRow.module.css:124–147`; `ViewMenu.module.css:21–25`).

At 400×720, the measured right edges were File 346, Settings 400, View 446 and About 490. About was visibly cut off by the 400px frame. Settings had no safety margin; View and About exceeded it by 46px and 90px. The source also predicts Settings exceeds the frame immediately above 376px, although that width was not independently measured here.

**Why existing checks missed it:** tests assert fixed positioning text (`ShellMenuRow.test.tsx:590–617`), and the principal visual/responsive checkpoints use 375/768/1280 widths. They skip the interval where desktop positioning is still used but no longer fits. Passing those checkpoints is not continuous responsive conformance.

**Refactoring acceptance:** preserve the approved anchor when it fits and constrain/flip it when it does not. Shared placement should handle 376/377, 400, 450 and 500px, long labels and resize while open; check full painted content and the agreed 8px margin. Fixing the clamping policy does not require inventing a new menubar breakpoint or changing toolbar scrolling.

### R17 — P2: common pane styling is coupled to separate JSX and renderer internals

Editor and viewer already share `.pane`, `.paneHeader` and `.paneMeta` (`EditorView.module.css:89–124`), so a common header border/padding change reaches both. Their section/header/body markup is still assembled separately (`EditorView.tsx:307–318,489–515`), without a reusable frame/header contract. Different header content—filename/encoding versus preview state/flavour—is appropriate; separate framing is unnecessary.

The deeper coupling is paused preview. `EditorView.module.css:31–66` detects a nested paused-bar attribute, converts the stage from flex to a two-column grid, positions `first-child`, turns `last-child` and its descendants into `display:contents`, hides its header, and hoists a renderer-owned bar across both panes. `PreviewPane.tsx:95–137` owns the descendant structure on which this depends. Adding a body wrapper or changing pane order can therefore change pause layout without changing any pause logic.

**Refactoring acceptance:** share an outer frame with header/content/accessory slots, explicit pane identity and a min-size/clip contract. Let the document stage place its spanning banner from explicit state rather than discover and rearrange renderer descendants. Keep the generic frame independent of Redux, document IDs, Monaco and Markdown parsing. Exercise Editor/Split/Preview and paused/refreshing/failed preview at ordinary/minimum widths. Distinct renderer/editor padding and body engines remain legitimate inputs; a generic content-management framework is unnecessary.

### R18 — P2: view-transition preparation differs by route, with incomplete continuity evidence

**Source-confirmed ownership difference; new runtime consequences remain unprobed.** Before switching to Preview, the toolbar path captures Monaco view state through the mounted editor ref (`EditorView.tsx:387–393`). View-menu arrangement/visibility callbacks dispatch directly (`App.tsx:365–369,379–380`). The common thunks flush pending content before hiding (`logic/store/docViewCommands.ts:65–72,90–97,123–135`), but that does not perform the same local Monaco view-state capture (`CodeEditor.tsx:239–249`). The command module also repeats active-document resolution, visibility construction and copying cursor/selection/scroll for its three inputs (`docViewCommands.ts:13–53,74–173`).

A common preparation change can thus reach the toolbar and miss View, or reach arrangement changes and miss one visibility path. Share the resolve/prepare/apply transition while retaining typed arrangement/visibility intents, last-pane protection, acknowledgement and refusal handling. This extends the command-ownership findings R8/R10; it does not warrant another command framework.

Pane lifetimes are intentionally different today: Monaco remains mounted while hidden and restores engine view state/relayout; LivePreview returns null for its rendered pane when hidden (`EditorView.tsx:302–304,489–515`; `CodeEditor.tsx:278–303`). A shared frame must not force identical engine teardown. The active spec says the hidden minimum-width pane is removed from the tree (`spec.md:263`), while a test explicitly accepts retained hidden Monaco (`EditorView.test.tsx:274–282`). Clarify rendered/accessibility surface versus engine/model lifetime in the refactoring contract; do not destroy editor continuity to satisfy an ambiguous removal phrase.

**Specific preview-scroll risk:** the restore effect (`EditorView.tsx:295–300`) depends on document, claim callback and saved offset, but not visibility, although hide/show recreates its scroll element. Restoring an already-claimed same-document position needs a defined lifecycle, not merely another effect dependency. The current content-update test sets the user's offset to 10 and only asserts it is not the old 240 (`EditorView.integration.test.tsx:2000–2016`); an incorrect reset to 0 passes.

**Refactoring acceptance:** each route preserves agreed caret/selection, Undo/model, editor scroll and preview scroll. Test same-document hide/show with nonzero offsets, activation with saved scroll, metadata/content updates and responsive collapse without changing stored arrangement. Assert the intended retained offset, not only inequality. Use actual Monaco for its continuity. C6 already records the reproduced remount/Undo defect; this source review does not recount it as a new runtime finding.

### R19 — P2: the status row and Details maintain different fact inventories

**Confirmed in source and browser.** `StatusBar.tsx:69–120` renders the row; `:126–146` separately enumerates Details. At ≤376px, CSS hides word count, encoding, EOL and autosave (`StatusBar.module.css:137–143`). Details repeats the latter three plus save state/read-only information, but omits word count. At 375×720, the browser confirmed the count was `display:none` and the disclosure contained UTF-8, LF, Not saved and Autosave on only.

The current responsive-details unit test checks Mixed/Autosave/Read-only (`StatusBar.test.tsx:153–180`), while narrow E2E checks drop order (`frontend/e2e/narrow-width.test.ts:445–494`). Neither proves recovery of every dropped item. The active requirement says dropped status items remain available through an accessible detail surface (`spec.md:1223–1225`); its preceding sentence enumerates file facts. At minimum, hiding another displayed fact without a recovery route is a confirmed completeness gap; explicitly include the owner-desired fact set in the refactoring contract.

**Refactoring acceptance:** define formatted facts and their row/detail/drop policy once; render shared item/pill pieces from that small representation. Verify every dropped fact's current value in Details, including count, across capability, write-in-flight, mixed endings, autosave and long values. The main save identity and transient Saving have intentionally different placements; preserve them. Details is a disclosure region, not an action menu, and its outer dock prevents clipping; common visual framing must not impose menu keyboard behavior on it.

Word count currently uses localized number formatting while cursor coordinates interpolate bare numbers (`StatusBar.tsx:79–86`; `i18n/catalog.ts:18–25,59–64`). That can legitimately produce `1,200 words` beside `Ln1200`. Record the intended number-formatting policy rather than declaring different coordinate formatting a defect or adding a generic formatting subsystem.

### R20 — P3: unused contracts and ineffective styling preserve complexity without behavior

The expanded production-consumer search found concrete residue. Removing it is different from deleting deferred feature requirements or useful injection seams.

| Residue                                            | Evidence and consequence                                                                                                                                                                                                                                         | Disposition                                                                                                                                                                                                      |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unused tab-container class satisfies a metric test | `.tabs` defines `gap:var(--tabs-gap)` (`DocumentTabs.module.css:55–62`), but no production consumer applies it. The real `.tabStrip` uses literal 5px (`:33`; `DocumentTabs.tsx:1117`). The test finds the unused declaration (`DocumentTabs.test.tsx:128–156`). | Put intended spacing ownership on the real strip and verify computed adjacent-tab spacing changes with its token. Current 5px matches the binding; no present spacing mismatch is claimed.                       |
| Orphan toolbar tab selector                        | Glass `.tabItem` remains in `EditorChrome.module.css:479`; real tabs use DocumentTabs' CSS module and its own Glass rule (`DocumentTabs.module.css:336`).                                                                                                        | Remove the selector that has no target; preserve the actual tab skin.                                                                                                                                            |
| Nine unused pane/preview tokens                    | `tokens.css:155–163,174,177`: editor-pane header block/inline padding, meta font size, min height/width, radius, editor-view padding, preview inline spacing and preview-pane padding have no production consumer. Real styles use other pane tokens.            | Remove or consolidate ineffective controls. Do not apply the obsolete 20rem minimum just to give a dead token a use. `EditorView.test.tsx:209` asserting its declaration cannot prove minimum width.             |
| Unused pane wrappers and style                     | `PreviewView.tsx:1–11` is an unconsumed MarkdownView pass-through; `AppearanceDialog.tsx:1–2` is an unconsumed SettingsDialog re-export; `EditorView.module.css:12–19` exports unused `.toolbar`. R5 already records unused ViewModeToggle.                      | Remove unsupported wrappers/rules after consumer review. AppearanceDialog's CSS is still used by AboutDialog; do not delete it merely because the similarly named TS wrapper is unused.                          |
| Repeated/overridden preview typography             | `MarkdownView.module.css:9–35,50–74` repeats heading/list/paragraph margins. The common block-spacing declaration is then overridden for prose/lists/quotes/code (`:58–74,124`).                                                                                 | Keep one effective rule per family, with explicit intentional variation. Verify rendered prose/lists/code/tables; a broad token that controls only a subset should not imply more.                               |
| Required but discarded context adapter             | `TabContextMenu.tsx:25–38,61,119` requires an adapter then executes `void adapter`; commands use `onAction`. DocumentTabs constructs/passes the unused dependency (`:1109,1326`).                                                                                | Remove inert prop/type/plumbing; retain DocumentTabs' own adapter, which still has real callers.                                                                                                                 |
| Unread Settings-menu props                         | `SettingsMenu.tsx:40–41` declares editor settings/change props; App constructs them (`App.tsx:341–344`), but the component never reads them. View owns the actual controls.                                                                                      | Remove inert API/plumbing; do not add new settings UI just to justify unused props.                                                                                                                              |
| Production-unselected View fallback                | The checkbox-pane branch (`ViewMenu.tsx:201–237`) runs only without arrangement callbacks; current App always supplies them (`App.tsx:360–367`).                                                                                                                 | Decide whether this standalone legacy API remains supported. It is callable and tested, so this is not proof of unreachable code under every conceivable caller. Retire it if only obsolete fixtures require it. |
| Redundant status override                          | `StatusBarProps.readOnly` can override status/capability, but the sole production caller supplies no override (`StatusBar.tsx:17,40`; `AppShell.tsx:306–319`); explicit users are isolated tests.                                                                | Prefer one documented status projection unless another real contract needs the override. Preserve the shared large/unsafe read-only reason mapping.                                                              |

Some of these are verification failures as well as cleanup: a test can pass on a class that never renders, while editing the advertised token has no effect. This is the same mechanism as the unused icon tokens in R6. Replace declaration-presence claims with effective rendered-consumer checks; do not add an import-count or duplication gate as another layer of paperwork.

### What already follows the principle

The project has reusable foundations worth retaining: root theme application (`logic/theme/theme.ts:50–55`), token-derived Monaco themes and generated syntax styling (`frontend/scripts/generate-editor-themes.mjs:208–245`), MenuTrigger, Radix, MenuSurface in Settings/View, ModalShell in two prompts, Segmented, Icon, action/shortcut metadata, formatting algorithms, settings projection, adapters and classified error formatting. Generated theme artifacts are derived outputs, not independent handwritten copies.

Reviewed production command/availability paths do not branch on Glass/Material/Minimal. `EditorChrome.test.tsx:359–399` compares rendered action identity, names, checked and disabled state across six palettes; that is useful existing component evidence, not a fresh native theme certification. Theme-specific structural CSS implements the active visual requirement. Some scalar values could move into theme tokens, but the correct target is common behavior with explicit skins, not deleting theme selectors or forcing identical geometry.

The same distinction matters in Go. Save, Save As, autosave and close Save As already share `snapshotForWrite`/`executeWrite` (`internal/appmodel/save.go:88–92,189–215`; `autosave.go:213–227`; `close_plan.go:377–384`). C1 occurs because the shared lock ends before model publication, not because four independent disk writers exist. `effectiveDocumentMetadataLocked` already centralizes derived status (`service.go:521–541`); Open bypasses it when emitting raw metadata (`file_lifecycle.go:303–308`), producing C7. Ordinary close and replacement of the initial empty tab independently remove documents (`close_plan.go:546–558`; `file_lifecycle.go:253–257`), without one exhaustive disposal contract, consistent with C3. Make existing ownership complete and consistently consumed; do not add a second lifecycle framework.

### Why the checks did not establish reuse

`ShellMenuRow.test.tsx:71–95` claims popup rules are owned once, but asserts stylesheet substrings in both the shared and local files. Its comment declares any surviving per-menu rule menu-specific “by definition”; that assumption bypasses the review question. The test can pass while File/About do not consume the shared popup rules. `EditorChrome.test.tsx:159–161` also pins theme selectors to the widget stylesheet, so moving equivalent scalar styling into tokens can fail a test without changing the UI.

Other existing tests demonstrate better checks. ShellMenuRow's trigger test actually renders four triggers and compares their shared classes (`:134–155`). TabContextMenu tests vary the canonical availability answer and verify the consumer follows it (`TabContextMenu.test.tsx:185–214`), then inspect real tab arrangements (`:221–280`). Toolbar/context formatting tests invoke commands with actual preferences and assert the resulting text (`EditorChrome.test.tsx:481–539`; `EditorContextMenu.test.tsx:238–305`). Preserve useful behavior evidence while moving it into the agreed test roots.

The source supports a specific process diagnosis: shared files were added, but consumer adoption and the boundary of the shared responsibility were not consistently verified. A shared trigger leaves popup focus handling split across consumers; a shared token leaves competing hover rules; a shared registry leaves local admission policy; a shared formatter leaves copied command construction. Tests that certify declarations cannot close those gaps. This explains maintenance drift without assuming an author's motive or claiming the PDF was present when each change was written.

### Refactoring acceptance: one common change reaches all applicable consumers

| Common change                                    | Current edits required                                                                                   | Desired owner and proof                                                                                                                |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Popup hover/disabled/shortcut styling            | MenuSurface plus shell, tab-context, editor-context and toolbar-overflow CSS                             | One applicable row/surface implementation with explicit variants; compare rendered states in representative consumers and palettes.    |
| Menu focus, dismissal and placement policy       | Radix integration plus Settings, tab context, editor context, toolbar overflow and narrow shell branches | Shared lifecycle/geometry integration; exercise ordinary/minimum widths, pointer/keyboard opening, arrows, Escape and outside pointer. |
| Modal focus/portal behavior                      | ModalShell plus four dialog/prompt implementations                                                       | Shared modal lifecycle consumed by all applicable dialogs; content and dismissal choices remain inputs.                                |
| Segmented keyboard policy and default icon style | Segmented plus toolbar; Icon plus preview glyph/local defaults                                           | One selection algorithm and one effective default SVG/glyph owner; verify both consumer rendering and interaction.                     |
| Action admission, aliases and outcomes           | Registry plus File predicate, several listeners and reporting exceptions                                 | A shared command/context/outcome owner; one changed policy reaches UI availability and execution from each route.                      |
| Formatting preferences and settings-write policy | Two format wrappers and multiple settings groups/consumers                                               | Shared command runners with explicit inputs/effects; retain text-result and refused-write behavior coverage.                           |
| Toolbar group order or panel resize behavior     | Multiple toolbar render locations; shell-specific panel implementation                                   | One composition definition and bounded reusable panel interaction; no deferred content required.                                       |
| Pane/header framing and stage-wide banner        | Two frame JSX sites and parent CSS reaching through preview internals                                    | Shared frame slots and explicit stage state; common changes reach both engines without altering their lifetime.                        |
| View arrangement/visibility preparation          | Toolbar ref preparation plus menu dispatch and repeated view-command construction                        | One transition owner; verify actual editor and preview continuity through every entry route.                                           |
| Status fact or responsive drop priority          | Row JSX, Details JSX and CSS inventories                                                                 | One formatted fact/drop model; every hidden fact stays available through the disclosure.                                               |
| Common dimensions and typography                 | Live rules plus dead tokens/classes and overriding declarations                                          | One effective styling contract; verify computed consumer outcomes, remove ineffective declarations.                                    |

Document these ownership boundaries in a short current architecture map and in concise component contracts. During review, inspect the real call sites whenever common policy changes. Keep focused tests of the shared contract plus thin consumer tests that show correct wiring and user-visible outcomes; retain a small independent oracle for approved shortcuts and visual requirements. Do not make every expected result a value calculated by the implementation under test.

This should not become another import-count gate, blanket duplicate-code ban or requirement for one universal Button/Menu component. Similar-looking controls can have different semantics; legitimate differences should be explicit inputs or separate content. The acceptance criterion is that a common fix propagates through actual production consumers, preserves intended theme skins, and is verified through the built application where browser mocks cannot establish it.
