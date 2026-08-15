# Implementation Plan: Real Files and Tabs

**Feature**: 003-real-files-and-tabs | **Date**: 2026-08-07 | **Spec**: [spec.md](spec.md)

**Parent branch**: `feature/v1-implementation` | **Task branches**: `feature/v1-implementation--003-tNNN-*`
(artifacts for this feature were authored on `feature/v1-implementation--003-real-files-and-tabs-specify`;
no second parent branch is created and `master` is never committed to)

**Input**: Feature specification from `specs/003-real-files-and-tabs/spec.md`, the project
constitution, consumed Feature 001/002 contracts, accepted file/document ADRs, and the specification's
Owned/Consumed/Deferred source matrix.

## Plan currency — brought up to date 2026-08-14

**This plan was written on 2026-08-07 and not touched again until 2026-08-14**, while the specification
accumulated 42 clarifications across five sessions and the work went through nineteen convergence phases.
A cross-artifact check found it stating a contract the specification had withdrawn, so it is corrected here.
What changed, and where the authority for each lives:

| Area                              | Was                                                                                | Now                                                                                                                       | Authority                                                                                 |
| --------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Visual-parity contract            | 546 logical cases (306 primary + 240 additional), 1,638 comparisons, whole screens | **14 pixel-compared component keys + 36 behaviour-verified keys**; whole-screen comparison withdrawn                      | `spec.md` Clarifications → Session 2026-08-14; FR-FT-051, FR-FT-054, SC-FT-009, SC-FT-012 |
| Editor pane interior              | compared as part of the editor families                                            | **named region exclusion owned by Feature 002**                                                                           | Session 2026-08-13; FR-FT-055                                                             |
| Six `status-*` states             | six paired reference comparisons                                                   | **behaviour-verified** against `data-status-state` and the title bar                                                      | Session 2026-08-14; FR-FT-056                                                             |
| Minimum window (≤376px)           | not planned                                                                        | **one pane matching the selected mode, Split collapsing to the editor, workspace panel not rendered, collapse view-only** | Session 2026-08-14; FR-FT-051, FR-FT-055                                                  |
| Whole-window screenshot baselines | 25 committed images                                                                | **deleted**; visual regression rests on the component keys, the token gate and structural assertions                      | Session 2026-08-14; SC-FT-012, SC-FT-013                                                  |

The functional plan below — slices FT-VS-01 to FT-VS-07, the Go and adapter architecture, the data and
storage decisions, and the requirement ownership — is unchanged and was delivered as written.

## Summary

Deliver a trustworthy local-file editor lifecycle through the existing Go/Wails, adapter, Redux
projection, identity-bound Monaco, and React surface seams. The Go backend gains bounded New/Open,
cross-platform atomic Save/Save As, revision-aware real tabs, per-document autosave, external-change
recovery, transactional close/shutdown, six persisted recent files, a 40-entry per-window recently
closed history, and a genuine zero-document launcher.

Feature 002's canonical action registry and formatting/editor behavior remain intact while its File/tab
fixtures become real. The binding mockup remains exact shape/style authority **for what each component
looks like** — it is not compared as whole screens, because it depicts the product's final state while this
feature delivers a subset. Final visual proof covers **14 pixel-compared component keys** and **36
behaviour-verified keys**, each compared in its own region across three deterministic repetitions, plus
actual controls, real files, the real Wails bridge, and a fresh current-host release build. Workspace,
folder, file-association, packaging, rich-rendering expansion, search/tidy/export, session recovery, and
Assistant behavior remain deferred — and it is precisely those deferrals that make a whole screen
unmatchable, since the mockup's own sidebar, Assistant and provider readout displace everything inside it.

## Technical Context

**Language/Version**: Go 1.25.7; TypeScript 5.8.3; React 19.1.1

**Primary Dependencies**: Wails v2.12.0; Monaco Editor 0.52.2; Redux Toolkit 2.12.0; Radix dropdown/toast
primitives; pure-Go `modernc.org/sqlite` 1.54.0 with goose/sqlc; existing `golang.org/x/sys` platform
support; Jest 30; Playwright 1.61; a development-only pinned PNG decoder/comparator for zero-tolerance
live image comparison

**Storage**: Real document bytes remain file-first on local filesystems. Canonical open-document and tab
state is in-memory in Go. The existing SQLite KV table stores typed autosave state, a versioned
at-most-six recent-file list, and per-path persisted arrangement; WAL, five-second busy timeout, and
additive-key evolution remain consumed. **Recent-file promotion is a latest-committed-value transaction,
not stale whole-value last-writer-wins**: each promotion reads the latest committed list, removes canonical
duplicates, prepends, truncates to six, and commits in one transaction, so SQLite commit order defines
global recency across independent instances (FR-FT-039). Recently closed history is memory-only and
contains no source text. No schema migration, session restore, swap file, or document database is added.

**Testing**: Go unit/service/handler/repository tests with temporary real files, injected clocks/timers,
pre/post-commit failure ports, and platform replacement tests; Jest/Testing Library adapter, projection,
session, prompt, registry, component, and dev-bridge parity tests; Playwright actual-control journeys and
the component parity contract (14 pixel-compared keys, 36 behaviour-verified);
architecture/offline/binding/sqlc gates; real bridge and fresh
current-host Wails walkthrough with retained raw evidence. **Mock-bridge Playwright (`verify:ui`) never
substitutes for disk, timing, or native evidence** (constitution VII).

**Target Platform**: macOS, Windows, and Linux desktop. The ordinary OS-managed framed Wails window remains
consumed. Native Open/Save dialogs and platform-specific atomic replacement are implemented behind injected
Go ports. Cross-platform proof is required where platform behavior differs; current-host evidence cannot
claim unrun hosts.

**Project Type**: Single-process, offline Wails v2 desktop application with a Go backend and embedded
React/TypeScript webview; multiple independent processes may run without a single-instance or file lock

**Performance Goals**: Preserve the 200 ms working-copy synchronization seam; schedule autosave exactly one
second after the backend accepts the latest content revision. SC-FT-007 is measured on a **real current-host
binary driven by the native-evidence harness** — never the dev bridge mock and never a fake clock — built from the
same commit and release settings as `just build`, with a write path byte-identical to it and the build-tag
difference recorded as a stated limitation and spot-checked on the true `just build` binary in FT-EV-09:
20 uncounted warmups (5 per size) and
**exactly 100 measured autosaves** (25 each at **1 KiB, 256 KiB, 1 MiB, and 2 MiB** accepted revisions),
each replacing one character in a clean path-backed writable document with autosave on, local temporary
storage, and no conflict. Timing is monotonic from completion of the final input event through atomic
replacement committing that revision, **including working-copy synchronization and the one-second
debounce**. No retry, outlier removal, or discarded failure is allowed; a failed eligible write is a counted
miss. **At least 95 of the 100 measurements MUST be at or below 5,000 ms.** Retain all durations, sizes,
revision/commit identities, disk-byte results, p50/p95/max, warmups, and host/OS/filesystem/build metadata.
Successful autosaves produce zero toasts; an overlapping explicit Save produces exactly one success
notification. Retain responsive interaction at 1280/768/375 logical pixels.

**Constraints**: At most 40 open-or-reserved documents per window; six persisted recent files; 40 unique
recently closed paths per window. **All size thresholds are binary mebibytes with exact inclusive
boundaries**: live preview stays active through exactly **2 MiB = 2,097,152 bytes** and pauses above it; a
safe supported file at exactly **10 MiB = 10,485,760 bytes** remains writable; files from 10,485,761 through
**50 MiB = 52,428,800 bytes** open read-only; files of 52,428,801 bytes or more are refused before partial
model insertion; classification reads at most **52,428,801 bytes**. Conflict preview is bounded by both 12
logical lines and 4,096 UTF-8 bytes per side without splitting a code point. LF/CRLF/BOM/permission
preservation; `none` line-ending files stay writable with no added terminator; same-directory atomic
replacement; process-local canonical identity reservations with no application-wide or persistent file
lock; no background watcher, polling timer, network, or telemetry; no private full paths in errors;
content-free Redux patches; adapter-only Wails imports; fresh activation-scoped Monaco models; one canonical
registry; localized strings; token-only colors; exact mockup metrics; zero unexplained screenshot pixels;
and no production placeholder, stub, no-op, custom native frame, or deferred behavior.

**Scale/Scope**: 57 functional requirements; 13 success criteria; five user stories; 36 specification edge
cases; 11 current source problems; **14 pixel-compared component keys and 36 behaviour-verified keys**
(superseding the withdrawn 306 + 240 = 546 whole-screen expansion); four supported suffixes; three widths; six palettes;
real manual/automatic writes, native close, and independent-window conflicts

## Constitution Check

_GATE: PASS before Phase 0 research. Re-checked and PASS after Phase 1 design._

| Principle                                      | Planning application                                                                                                                                                                                                                                                                                                                  | Result |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| I. Normative specification is the authority    | The active `spec.md` owns behavior and explicit Feature 003 variants; the binding HTML/CSS owns mapped webview shape/style; Feature 001/002 and accepted ADRs are consumed without editing `docs/delivery/`. No threshold, count, or gate is weakened by this plan.                                                                   | PASS   |
| II. Self-contained vertical slices             | Eight ordered functional/conformance slices name exact dependencies, requirement owners, paths, and proving evidence. The clarified-clause ledger (below, and expanded in `tasks.md`) assigns every clarification clause an owner so none defers to cleanup.                                                                          | PASS   |
| III. Backend authority and explicit boundaries | `internal/appmodel` remains canonical; filesystem/dialog/clipboard/reveal/persistence dependencies are injected ports; Redux stays content-free; Monaco is active-only; Wails results remain typed and imports adapter-only.                                                                                                          | PASS   |
| IV. Offline, private, and safe                 | All file operations are local and bounded; paths/errors are separated by the eight-category classified contract; unsafe bytes are read-only; request guards and a five-minute observation prove zero outbound behavior.                                                                                                               | PASS   |
| V. Data and cross-platform operation           | Same-directory atomic replacement, permission/encoding preservation, external-version checks, multi-instance WAL with transactional latest-value promotion, process-local identity reservations, single-use authorizations, dirty-close protection, numeric MiB bounds, and build-tagged Windows replacement are explicit.            | PASS   |
| VI. Accessible, tokenized, coherent interfaces | Registry-derived actions (including Move tab left/right and Refresh preview), localized copy, polite live-region announcements, focus containment, keyboard/pointer parity, hostile/long-label fixtures, reduced motion, SVG icons, six palettes, and exact 1280/768/375 behavior are owned requirements.                             | PASS   |
| VII. Evidence before completion                | Implementation begins from a reliable baseline; named focused tests, architecture, the component parity contract, actual controls, real files/bridge, five-minute offline observation, and a **harness-driven real-binary** SC-FT-007 measurement remain separate gates. Mock-bridge results never stand in for disk or timing proof. | PASS   |

No constitutional exception or unresolved clarification remains. Plain `os.Rename` is not accepted as
cross-platform proof; the Windows platform port is a required part of the atomic-write slice. SC-FT-007 is
not accepted from the mock bridge or a fake clock; it is measured on a real current-host binary driven by the
native-evidence harness, with the build-tag delta stated and spot-checked against `just build` in FT-EV-09.

## Project Structure

### Documentation (this feature)

```text
specs/003-real-files-and-tabs/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── file-lifecycle.md
│   ├── tab-session.md
│   ├── save-conflict-close.md
│   └── file-surfaces-and-parity.md
├── checklists/
│   └── requirements.md
├── tasks.md
└── evidence/                        # retained baseline, raw gate, parity, live and native evidence
```

### Source code (repository root)

```text
internal/apperr/                     # nullable snapshot/patch DTOs, document command inputs/results,
                                     # active-buffer acknowledgements, plans, and the one shared
                                     # ClassifiedError shape (8 named categories, safe subject, fixed
                                     # remediation vocabulary) every classified outcome uses
internal/appmodel/                   # sole canonical documents/tabs/file lifecycle owner; split file,
                                     # tab, autosave, conflict, close-plan and persistence modules/tests;
                                     # process-local canonical identity reservation table; conflict queue;
                                     # CopyPath/RevealInFileManager commands resolve canonical path and
                                     # classify port failures, revalidating existence before Reveal
internal/file/                       # existing local-path package plus injected native-dialog, canonical
                                     # path, raw codec/disk-version, atomic-replace, clipboard-write, and
                                     # reveal platform ports/tests
internal/settings/                   # typed FileSettings.autosave validation and existing KV persistence
internal/application/                # composition, close coordinator, one-shot native quit and shutdown order
internal/db/                         # existing settings KV only; no Feature 003 schema migration
main.go                              # concrete Wails dialog/quit/clipboard/platform wiring and bound handlers

frontend/src/logic/actions/          # promote only owned File/tab actions, including Move tab left/right
                                     # and Refresh preview; preserve all bindings/deferrals
frontend/src/logic/adapter/          # lifecycle commands, patch fan-out, projection barrier, Wails-only access
frontend/src/logic/hooks/            # awaited lifecycle flush and active document/tab command coordination
frontend/src/logic/store/            # content-free ordered tab/document/recents projection and rehydration
frontend/src/logic/settings/         # acknowledged autosave setting consumer
frontend/src/ui/components/          # activation-scoped Monaco identity/model and exact status components
frontend/src/ui/primitives/          # accessible modal/menu/icon/live-region primitives from binding source
frontend/src/ui/widgets/             # real File menu/tabs/context menu/launcher/prompts/editor chrome
frontend/src/ui/styles/              # exact palette-specific binding tokens/metrics/responsive structures
frontend/src/i18n/locales/           # every file/tab/status/prompt/error/announcement/unavailable string
frontend/src/dev/bridge-mock/        # deterministic lifecycle, disk/conflict and close-plan contract parity
frontend/e2e/                        # real-files journeys, component parity slices, reference adapter
frontend/playwright.config.ts        # concurrent app + read-only mockup servers and deterministic conditions
```

**Structure Decision**: Extend the existing vertical seams and keep one appmodel. `internal/file` owns
operating-system/file capabilities but no canonical document state. Small recent/view/autosave values use the
existing SQLite KV repository. UI widgets may be split for focus and testability, but they consume the one
action registry and one projection. Generated Wails/sqlc output is regenerated, never hand-edited.

## Phase 0: Research Decisions

Research is consolidated in [research.md](research.md). The resolved decisions are:

1. Extend `internal/appmodel` and make active identity/buffer optional together; repair real event fan-out.
2. Canonicalize existing paths with resolved aliases in Go and canonicalize Save As through its existing
   parent; keep identity, display path, and safe error subject separate.
3. Classify raw bytes independently, normalize writable canonical editor text to LF, and make unsafe/large
   documents structurally incapable of writing. Size decisions use binary MiB with exact inclusive byte
   boundaries (2,097,152 / 10,485,760 / 52,428,800; read at most 52,428,801).
4. Use a same-directory atomic-replacement port with permission preservation, Unix directory sync, and a
   build-tagged Windows replace-existing implementation.
5. Use one portable `DiskVersion`; retain the specified timestamp-tick limitation; transport only a bounded
   transient 12-line/4,096-byte-per-side conflict preview outside Redux.
6. Persist autosave, six recents, and per-path arrangement as versioned values in the existing SQLite KV;
   keep the 40-entry closed stack in memory only.
7. Start backend autosave one second after accepted content and serialize every write per document.
8. Await content+view flushes before lifecycle commands and create/dispose one fresh Monaco model/token per
   activation, deliberately dropping cross-switch undo history.
9. Return committed revisions from writes and use a frontend command barrier/full rehydration when projection
   convergence is not observed; never repeat an already committed write. Rehydration runs immediately, then
   retries at 250 ms and one second before the persistent recovery surface appears.
10. Veto first native close, collect/execute one backend close plan, then consume a one-shot permit on the
    programmatic second close before ordered shutdown.
11. Promote existing registry actions only, keep downstream actions unavailable, and compare the live immutable
    mockup and app **component by component** through a finite zero-tolerance contract — never as whole screens,
    which the deferrals above make unmatchable.
12. Preserve reliable baseline, focused, browser, real-bridge, offline-duration, and current-host evidence as
    distinct proof layers; run SC-FT-002's two fixed fixtures with launcher-ready-to-save-confirmed timing and a
    bounded before/after parent-directory inventory as part of that evidence.
13. Classify every user-facing failure into one of eight named categories on the shared `apperr.*Result`
    envelope (safe subject, fixed remediation vocabulary, repeated-failure dedup), replacing ad hoc
    "actionable error" strings.
14. Add injected clipboard-write and reveal-in-file-manager ports; resolve Copy path/Reveal at the appmodel
    level with existence revalidation, detached-race classification, and menu-close focus restoration.
15. **Hold a process-local canonical identity reservation** for every prepared Open, recent-file, reopen, and
    Save As target until activation, commit, cancellation, or failure. A novel prepared Open reserves both its
    canonical identity and one document slot, pending novel reservations count toward the 40-document limit,
    and concurrent requests resolving to the same open-or-pending identity join one authoritative outcome
    rather than reserving another slot. No application-wide or persistent file lock is added.
16. **Run external-change checks only in the foreground** — tab activation, window focus or resume, and before
    every write — with no watcher and no polling timer, and serialize simultaneous conflicts through one
    modal at a time in authoritative tab order while every waiting document is visibly projected as blocked
    by conflict.
17. **Make Move tab left/right registry-derived reorder actions** bound to `Ctrl/Cmd+Shift+PageUp` and
    `Ctrl/Cmd+Shift+PageDown` for the active tab and to the targeted tab from its context menu, waiting for
    backend confirmation before projecting order and announcing the result through a polite live region.
18. **Make Refresh preview a registry-derived action with no keyboard shortcut**, owned by the frontend
    action/preview layer rather than the Go classification package, rendering exactly one backend-accepted
    revision and coalescing duplicate runs.
19. **Measure SC-FT-007 through the existing native-evidence harness** with the exact 20-warmup/100-trial protocol
    across 1 KiB, 256 KiB, 1 MiB, and 2 MiB, rejecting fake-clock and mock-bridge timing as substitutes. t₀ and t₁
    are single-clock Go monotonic stamps spanning the final input event's webview acknowledgement through the
    atomic commit of that revision, so the 200 ms synchronization seam and the one-second debounce are inside the
    interval by construction. The harness must use its real system timer and a write path byte-identical to
    `just build`; the build-tag difference is recorded as a stated limitation and spot-checked on the true release
    binary in FT-EV-09.

## Phase 1: Dependency-ordered vertical-slice plan

The implementation sequence is:

```text
FT-VS-01 New/Open foundation
       |
       v
FT-VS-02 Atomic Save/Save As
       |
       v
FT-VS-03 Real tabs/sessions
       |
       v
FT-VS-04 External recovery
       |
       v
FT-VS-05 Autosave
       |
       v
FT-VS-06 Close/shutdown
       |
       v
FT-VS-07 Recents/launcher/actions
       |
       v
FT-VS-08 Exact surface conformance
       |
       v
FT-EV-09 Release evidence
```

The completion order is strict. The tab slice consumes the save slice's awaited content-and-view lifecycle barrier
and committed-projection convergence path, so no FT-VS-03 implementation task may be completed or merged before
FT-VS-02. External recovery then requires both safe writes and active-buffer acknowledgements. Autosave requires
that recovery path and the shared save/conflict coordinator. Complete close requires save, tabs, conflict recovery,
and autosave drain behavior. Reopen/recents require canonical Open, successful Save, close history, and activation.
Exact final surface parity uses only completed real states. A later task ledger may mark only non-mutating research
or isolated test-fixture preparation parallel; no behavior-bearing task may bypass this chain.

### FT-VS-01 — New/Open and bounded document ingestion

**Depends on**: consumed Feature 001 appmodel/projection/settings/native-frame contracts; Feature 002 action
identity inventory; existing file path, SQLite KV, handler, and composition seams.

**Primary owner**: FR-FT-001–007, FR-FT-028, FR-FT-038; primary proof for SC-FT-004's size and 40-document
boundaries.

**Build**:

- Extend typed snapshots/patches and Go/TypeScript projection with ordered identities, `tabSetRevision`,
  document/content revisions, capabilities/save status, optional active identity/buffer, and no source in Redux.
- Expand appmodel state without a second owner; make zero documents safe; replace the startup-only active-buffer
  assumption; repair `state:patch` fan-out and bootstrap/rehydration ordering.
- Add canonical path and raw classification ports, case-insensitive supported suffix checks, native Open dialog,
  **exact-inclusive MiB size outcomes (writable through 10,485,760; read-only 10,485,761–52,428,800; refused at
  52,428,801 or more; classification reads at most 52,428,801 bytes)**, unsafe-byte handling, default-mode
  precedence, per-path arrangement lookup, duplicate focus, atomic empty-untitled replacement, and all-or-nothing
  40-document refusal.
- **Classify all four line-ending states**: uniform LF, uniform CRLF, mixed LF/CRLF, and `none`. A `none` file
  stays writable and gains no terminator until the user inserts a break, which is then encoded as LF. A lone
  ASCII CR opens read-only with a warning and is never silently converted. NEL (U+0085), U+2028, and U+2029
  remain ordinary content and never count as file line endings.
- **Add the process-local canonical identity reservation table** (Decision 15): every prepared Open, recent-file,
  reopen, and Save As target holds a reservation until activation, commit, cancellation, or failure; a novel
  prepared Open reserves identity plus one document slot; pending novel reservations count toward the limit;
  concurrent same-identity requests join one authoritative outcome; every terminal outcome releases the
  reservation.
- Implement the two-phase Open ordering: native selection completes with no document or recent-file mutation;
  the backend prepares canonical identity, duplicate, capacity, and reservation outcomes without activating;
  the frontend flushes and awaits the outgoing identity-bound content and view state; the backend then
  revalidates the expected tab-set revision and reservation and applies exactly one authoritative transition.
- Add the versioned KV repositories needed for later recent-file and per-path view behavior, but do not render
  later recent/launcher behavior yet.
- Promote New/Open actions through the existing registry and deterministic dev bridge; keep New Window/Open
  Folder/export and every downstream behavior unavailable.
- **Add the registry-derived Refresh preview action** (Decision 18) with no keyboard shortcut, available from the
  paused-preview surface for supported text: it renders exactly the current backend-accepted revision, rejects or
  coalesces a duplicate run, stays current only while that revision is unchanged, re-pauses on the next accepted
  edit above 2,097,152 bytes, and on failure leaves preview paused with a classified `io-failure` error offering
  Retry.
- Converge the File entry and initial real-tab/status shape touched by this slice against the binding metrics.

**Concrete paths**: `internal/apperr/results.go`, `classified_error.go`; `internal/appmodel/model.go`,
`document.go`, `file_lifecycle.go`, `identity_reservation.go`, `service.go`, `handler.go`, new focused
document/recent-view repository files and tests; `internal/file/`; `internal/settings/`;
`internal/application/application_context_holder.go`; `main.go`; `frontend/src/logic/adapter/appModelAdapter.ts`;
`frontend/src/logic/store/`; `frontend/src/logic/actions/`; `frontend/src/dev/bridge-mock/`; `frontend/src/App.tsx`;
File/tab/status/preview widgets and named tests.

**Proof**: Go path/classification/limits/duplicate/placeholder/nullable-state tables; exact-boundary byte fixtures
at 2,097,152 / 10,485,760 / 10,485,761 / 52,428,800 / 52,428,801; `none`, lone-CR, and NEL/U+2028/U+2029 fixtures;
reservation lifecycle, pending-slot counting and concurrent-join tables; typed handler and composition tests;
projection fan-out and zero-state tests; dev-bridge parity; accessible New/Open File menu browser journey; Refresh
preview render/coalesce/re-pause/failure tests; native Open cancellation and real LF/CRLF/BOM/unsafe fixtures. No
mock result proves disk behavior.

### FT-VS-02 — Atomic Save, Save As, and committed projection convergence

**Depends on**: FT-VS-01 document identity, canonical paths, raw characteristics, content revisions, active
working-copy flush seam, reservation table, and native dialog port.

**Primary owner**: FR-FT-008–016; primary proof for SC-FT-001.

**Build**:

- Add one awaited frontend lifecycle flush that captures the current activation and drains newest content and
  view queues before Save/Save As; never read Monaco content inside the disk command.
- Add same-directory encoding/temporary-write/sync/permission/version/replacement ports, including build-tagged
  Windows replacement and injected pre/post-commit failures.
- Implement new-file UTF-8/LF/no-BOM writes; uniform LF/CRLF/BOM preservation; **`none` terminator preservation**;
  mixed-ending authorization through the shared `Normalize line endings?` modal (safe filename, proposed LF/CRLF
  result, whole-file consequence, `Normalize and save` then `Cancel`, Cancel initially focused, Escape/backdrop
  equal Cancel, no persistent suppression); suffixless `.md`; unsupported-suffix refusal; duplicate-open Save As
  refusal; sole native overwrite confirmation; post-confirmation target version-and-raw-byte-hash recheck;
  **target reservation released on every terminal outcome**; stable identity/path adoption only after commit.
- Serialize snapshots by document/content revision. **Project the five-value save status with the exact
  precedence** — read-only capability wins; empty untitled is `not-saved`; dirty, detached, nonempty untitled,
  failed write, or a revision newer than an in-flight/committed snapshot is `unsaved-changes`; clean after
  Open/Reload/explicit Save/Save As is `saved`; clean after autosave is `autosaved`. **Each committed baseline
  retains its originating kind** (`open`, `reload`, `explicit-save`, `save-as`, `autosave`) so returning exactly
  to that baseline restores the correct clean label; a successful stale-revision write updates disk truth without
  projecting clean for newer content, and a failed write never changes status.
- Return committed revisions and enforce the projection convergence barrier/full rehydration before another
  document command. **Rehydration runs immediately, then retries at 250 ms and one second**; if all three fail,
  document commands and normal close stay blocked behind a persistent surface that truthfully states the file was
  saved on disk but editor-state recovery failed, Retry restarts the same bounded sequence, and
  `Quit and discard newer unsaved changes` requires a second confirmation naming the affected documents and never
  alters or replays the committed write. Add explicit save confirmation and deduplicated
  `io-failure`/`permission-denied`/`conflict` classified failures; autosave success remains unavailable until
  FT-VS-05 and never shares the explicit toast path.
- Converge save status/toasts and File menu Save/Save As states against binding primitives.

**Concrete paths**: new focused `internal/file/` codec/disk-version/atomic-replace files; appmodel save/write-
coordinator/recovery files; typed results/handler; application Wails dialog ports; frontend lifecycle adapter/hook;
action dispatcher/registry; notification/status/File menu consumers; i18n and tests.

**Proof**: byte-for-byte LF/CRLF/BOM/`none` and permission fixtures; new/suffix/cancel/collision/target-change
tables; status-precedence and baseline-origin round-trip tables; immediate-save flush; disk-full/permission/temp/
sync/replace failures; committed-write/emitter failure with the 250 ms/1 s retry schedule and twice-confirmed quit;
newer-edit-during-write; unsafe/read-only rejection before disk access; explicit notification exactly once; real
native Save As and disk inspection.

### FT-VS-03 — Revision-safe real tabs and activation-scoped Monaco sessions

**Depends on**: completed FT-VS-01 ordered model/active-buffer acknowledgement and completed FT-VS-02 awaited
lifecycle flush/projection barrier. The slice does not merge ahead of either dependency.

**Primary owner**: FR-FT-029–033 and FR-FT-035–037; primary proof for SC-FT-003.

**Build**:

- Add backend activation/reorder commands carrying tab-set and document revisions, content-free patches, and
  identity/content/projection-bound active-buffer acknowledgements. Reject every stale command without partial
  order or active state.
- Replace visual fixtures with projected real tabs. Restore per-document arrangement/Reading state/caret/
  selection/scroll, disambiguate equal basenames, expose full paths only in approved affordances, and preserve
  adjacent activation after close.
- **Implement the disambiguated tab label contract in full** (FR-FT-035): `basename — shortest unique canonical
parent suffix`, using the fewest trailing parent segments that distinguish every open matching basename under
  host-filesystem canonical identity comparison, recomputed after open, close, or Save As — including the case
  where identical basenames also share identical immediate parent names. **C0 control characters, DEL, and
  bidirectional-formatting controls render as visible `\uXXXX` escapes**, remaining user-supplied path text is
  **directionally isolated**, **visual ellipsis MUST retain part of the distinguishing suffix**, the complete
  disambiguated label remains the accessible name, and the approved full canonical path stays in the tooltip and
  explicit path actions. Overflow scrolls without shrinking labels to unreadable widths or creating page-level
  overflow.
- Capture and await the outgoing content+view, then activate. Create a fresh Monaco URI/model/session/token for
  each activation and dispose it after flush; never cache inactive source or undo history.
- Implement click and canonical next/previous navigation (`Ctrl/Cmd+Tab`/`Ctrl+PageDown` next,
  `Ctrl/Cmd+Shift+Tab`/`Ctrl+PageUp` previous), pointer/keyboard focus, contained overflow, drag
  insertion/Escape/same-position no-op/edge autoscroll, and the exact tab-specific context menu. Do not add folder
  or by-number behavior.
- **Implement Move tab left and Move tab right** (Decision 17) as registry-derived reorder actions: they appear in
  the tab context menu **after the binding's close-action group and before its path-action group**, are
  **unavailable at their respective strip edges**, reorder the targeted tab from the menu and the active tab on
  **`Ctrl/Cmd+Shift+PageUp` / `Ctrl/Cmd+Shift+PageDown`**, **wait for backend confirmation before projecting
  order**, keep the document active and focus unchanged, announce `Moved {filename} to position {position} of
{count}` through a polite live region, and treat a move past an edge as a **successful no-op that does not
  increment the tab-set revision**.
- Implement Copy path and Reveal in file manager as appmodel-level commands over the injected clipboard-write and
  reveal ports (Decision 14): resolve the canonical path, refuse untitled documents, revalidate existence before
  Reveal, and classify port failures as `not-found` (known-missing or disappearance-race) or
  `system-command-failure` (clipboard/OS command failure), each deduplicated per document. Close the menu and
  restore focus to the originating tab, else current tab, else tab-strip New, else launcher New; Reveal's
  restoration additionally waits for the application to regain foreground focus.
- Keep Feature 002 formatting, editor-size, view arrangement, toolbar relocation, focus, and one-active-session
  behavior intact within an activation.

**Concrete paths**: focused appmodel tab/activation/reorder state and tests; apperr results; handler/adapter/mock/
projection; new `internal/file/` clipboard-write and reveal ports and `internal/appmodel/` Copy path/Reveal command
files; `frontend/src/ui/widgets/editorSession.ts`; `frontend/src/logic/hooks/useSyncedBuffer.ts` and
`useDocumentCommands.ts`; `CodeEditor.tsx`; real tab/context widgets split from `EditorChrome.tsx`; live-region
primitive; styles/i18n/tests.

**Proof**: backend stale switch/reorder/close matrices; edge-move no-op without revision bump; failed outgoing
buffer/view flush; acknowledgement request-generation rejection; 40-document repeated switch identity stress;
model/session disposal and no undo retention; identical-basename and identical-parent labels/tooltips; hostile
control/bidi escaping, directional isolation and ellipsis-suffix retention; Move tab menu placement, edge
unavailability, backend-confirmed order, unchanged focus and announcement text; drag cancel/no-op/autoscroll;
contained overflow/no page scroll; Feature 002 formatting/session regression tests; Copy path clipboard content/
notification/focus, Reveal success/known-missing/disappearance-race/OS-failure with Copy-path fallback, and
repeated-failure dedup fixtures.

### FT-VS-04 — External-change recovery and revision-bound write authorizations

**Depends on**: FT-VS-02 atomic write/disk version and FT-VS-03 active acknowledgement/identity handling.

**Primary owner**: FR-FT-020–023; primary proof for SC-FT-006.

**Build**:

- Check the recorded `DiskVersion` before every manual/automatic replacement and handle missing files as detached,
  dirty, recreatable documents without closing or losing source.
- **Perform the stable re-read decision exactly as specified**: a version mismatch suspends the write and performs
  a re-read whose version is unchanged across classification and whose raw-byte hash is captured with the baseline.
  If raw bytes, byte-order mark, line endings, and permission mode still equal the recorded baseline, refresh only
  the disk version and resume the suspended write. Any byte or file-characteristic difference prevents the write
  and opens the external-change decision. An unstable re-read writes nothing and retries only after a fresh
  foreground check.
- **Run foreground-only checks** (Decision 16) on tab activation, window focus or resume, and before writes, for
  path-backed documents including read-only ones. Feature 003 introduces no background file watcher or polling
  timer.
- **Serialize simultaneous conflicts**: conflicts stay bound to document identity, canonical content revision, and
  detected disk version; the application shows **one modal at a time**, retains the current modal until it resolves
  or invalidates, **visibly projects every waiting document as blocked by conflict**, and selects subsequent
  decisions in authoritative tab order.
- Produce one bounded transient On disk/Yours preview outside Redux enforcing **both 12 logical lines and 4,096
  UTF-8 bytes per side**, stopping at whichever bound is reached first without splitting a code point and visibly
  identifying each truncated side, and the binding-shaped `File changed on disk` prompt with Reload from disk,
  Keep mine, and Skip in that order with Skip initially focused and Escape/backdrop equal to Skip. Read-only
  conflicts expose Reload from disk plus structural Cancel only, with Cancel initially focused.
- Implement Reload as one raw re-read/reclassification/backend transition plus active acknowledgement only when
  identity/revision still match; inactive reload retains no webview source.
- Issue a single-use Keep-mine authorization bound to identity/path/content revision/disk version; invalidate on
  edit, reload, save, Save As, path change, close, use, or second disk change. Skip cancels one write only and grants
  nothing.
- Treat Save As post-confirmation target drift as its distinct classified `conflict` error with no second prompt.

**Concrete paths**: appmodel disk/conflict/authorization/conflict-queue files; file disk-version/read ports; typed
transient result; adapter lifecycle controller; prompt/modal primitive and conflict widget; blocked-conflict tab
projection; mock bridge; i18n/status/tests.

**Proof**: manual save, second process, same/changed/deleted disk, metadata-equal resume, unstable re-read, Reload,
Keep mine once, second change, edit-while-prompt-open, Skip then retry, read-only reload, stale acknowledgement, and
Save As target drift tests; multi-conflict queue ordering with blocked-tab projection; current-host external-editor
walkthrough with zero silent overwrite.

### FT-VS-05 — Backend autosave and explicit-write serialization

**Depends on**: FT-VS-02 write coordinator and projection barrier; FT-VS-04 conflict/missing-file outcomes; typed
settings persistence from FT-VS-01.

**Primary owner**: FR-FT-017–019; primary proof for SC-FT-007.

**Build**:

- Add acknowledged `FileSettings.autosave = true`, restore it before the normal shell, and apply changes to the
  appmodel controller only after persistence succeeds.
- Schedule/replace a one-second backend timer after accepted canonical content for path-backed writable documents.
  Cancel not-started timers when disabled; perform no catch-up save; never autosave untitled/read-only documents.
- Route autosave through the same disk-version, authorization, atomic write, baseline, resync, and per-document
  serializer as explicit Save. Never format/lint or emit success toast.
- Make explicit Save during autosave wait/subsume correctly and produce exactly one explicit success outcome for
  the content reaching disk. Keep the dirty dot muted only while a write is actually in flight.
- Expose the real setting/status through registry-derived surfaces without activating Format/Lint-on-save.
- **Measure SC-FT-007 through the native-evidence harness on a real current-host binary** (Decision 19), never the
  dev bridge mock and never a fake clock. Fake clocks
  remain correct for debounce/eligibility unit tables; they are not accepted as the criterion's evidence.

**Concrete paths**: settings model/repository/service/handler/adapter/projection; appmodel autosave timer and write
coordinator; status/settings widgets; action registry; mock bridge; i18n and tests;
`cmd/native-evidence/main_native_evidence.go` plus a new `cmd/native-evidence/autosave_latency_scenario.go` and
`frontend/src/logic/adapter/nativeEvidenceRuntime.ts` for the measurement driver; and the FT-VS-05 evidence tree.

**Proof**: fake-clock debounce/replacement/cancel/no-catch-up tables; saved/untitled/read-only eligibility; explicit-
during-auto serialization; conflict/deletion path; no format/lint; no success toast; in-flight dirty state; and the
real-binary SC-FT-007 run of 20 warmups plus exactly 100 measured trials (25 each at 1 KiB, 256 KiB, 1 MiB,
2 MiB) with at least 95 at or below 5,000 ms, no discarded failure, and full retained metadata.

### FT-VS-06 — Transactional close plans and native shutdown

**Depends on**: FT-VS-02 safe saves, FT-VS-03 tab revisions/activation, FT-VS-04 complete conflict decisions, and
FT-VS-05 in-flight autosave drain behavior.

**Primary owner**: FR-FT-024–027; primary proof for SC-FT-005.

**Build**:

- Add immutable, revision-aware single/multi-document close plans in authoritative tab order. Flush active content/
  view and await in-flight writes before removing a clean document. A close requested while a dirty tab has an
  autosave scheduled or in flight first flushes the latest working copy and waits for the write coordinator, then
  re-evaluates the committed/current revision: a now-clean tab may close without a dirty prompt, while a newer or
  failed revision stays open for an explicit choice.
- Render one Save/Discard/Cancel or dirty-target-list Save all/Discard all/Cancel webview dialog. Gather every
  Save As path, normalization authorization, and external-conflict decision before any batch write/discard/close;
  queued close-plan normalizations resolve one at a time in authoritative tab order.
- Execute Save all without closing tabs; stop on first failure; keep earlier successful saves clean and every tab
  open; apply no discard; invalidate the plan and require fresh decisions for retry. Close only after all saves
  succeed.
- Use the two-stage native-close coordinator: veto/idempotent close request, prepare/resolve/execute plan, one-shot
  programmatic Quit, then run cancellation and editor/autosave/layout drains before DB/logger closure. A
  cancellation or drain failure creates no permit, keeps the window open, and reports a classified `io-failure`
  with Retry. **During FR-FT-016 recovery, only the twice-confirmed `Quit and discard newer unsaved changes` path
  may bypass successful rehydration, and it still satisfies the cancellation, drain, and one-use permit sequence.**
- Preserve adjacent active selection and project active identity/buffer absent together on final close.

**Concrete paths**: appmodel close-plan state machine and handler results; application close coordinator/context/
main lifecycle ports; adapter close event and lifecycle barrier; save/quit prompt widgets and modal state; tabs,
notifications, i18n, mock bridge and tests.

**Proof**: exhaustive clean/dirty/untitled/mixed/conflict/incomplete/cancel/failure plan matrices; no side effect before
complete plan; save order/first failure/fresh retry; close during autosave; stale tab revision; final zero state;
OnBeforeClose veto/idempotency/one-shot permit/shutdown order; twice-confirmed recovery quit; real clean/dirty
window close and quit.

### FT-VS-07 — Reopen, recents, launcher, canonical actions, identity/status surfaces

**Depends on**: FT-VS-01 canonical Open/persistence, FT-VS-02 successful Save, FT-VS-03 activation/tabs, and
FT-VS-06 recently closed/zero-document state.

**Primary owner**: FR-FT-034 and FR-FT-039–044; primary proof for SC-FT-008.

**Build**:

- Complete canonical tab commands/shortcuts: target close, active `Ctrl/Cmd+W`, next/previous variants, **Move tab
  left/right on `Ctrl/Cmd+Shift+PageUp`/`Ctrl/Cmd+Shift+PageDown`**, and Reopen last file on
  `Ctrl/Cmd+Shift+Alt/Option+T`; preserve Table on `Ctrl/Cmd+Shift+T` and no by-number binding.
- **Maintain six persisted canonical MRU paths transactionally** (FR-FT-039): every successful canonical
  Open/focus, explicit Save, or Save As promotes in **one SQLite transaction against the latest committed list** —
  remove canonical duplicates, prepend the path, truncate to six, commit. Autosave and Reload never change recency.
  **SQLite commit order defines global recency across independent instances**; `last writer wins` means the latest
  transactional promotion, never replacement by a stale whole-list snapshot. A promotion persistence failure
  (busy timeout or other metadata failure) **never rolls back the already successful Open or committed write**,
  leaves the last committed list authoritative, and produces exactly one classified `persistence-warning` without
  claiming promotion success.
- Check the recent list only on display or explicit choice — never a background watcher or timer. Display reads the
  latest committed list transactionally, so an instance observes other instances only on explicit display/choice
  refresh; a missing entry found during display is removed silently through the same latest-value transaction, and
  an explicit stale choice also shows a classified `not-found` error.
- Maintain/consume the 40-entry unique path-backed closed history, reading fresh disk content through canonical Open,
  restoring retained view metadata with a fresh identity, focusing already-open paths, dropping missing entries,
  and retaining other failures for retry.
- Activate the zero-document launcher with New/Open/file recents, first-run state, and unavailable Open Folder; add
  no recent folders or auto-restore. Make file/tab actions registry-derived and capability-aware.
- Complete filename/optional-parent/save-state identity and exact 28 px status surfaces with accessible details for
  responsive dropped encoding/line-ending/autosave/read-only information. The heading retains **at most one** safe
  parent segment even when tabs require a longer unique suffix.

**Concrete paths**: appmodel recent/closed history and KV repository; action/shortcut/dispatcher; adapter/projection;
File menu, DocumentTabs, Launcher, identity/status widgets; styles/i18n/mock/browser tests.

**Proof**: >6 MRU ordering/dedup/persistence/lazy prune; **two-instance interleaved promotion proving SQLite commit
order and no lost stale-snapshot update, plus busy-timeout `persistence-warning` with no false promotion**;
40-history uniqueness/consume/missing/retry/untitled exclusion/fresh identity/no source; launcher first-run/six
entries/unavailable folder/no restore; binding/shortcut collisions including Move tab and Table; all status values
and responsive detail access; real reopen reads current disk after discarded edits.

### FT-VS-08 — Exact file-surface conformance and cross-cutting safeguards

**Depends on**: FT-VS-01–07 completed functional states. Exact styling is folded into each earlier slice as its
surfaces land; this slice owns the complete finite matrix and cross-surface convergence, not a late redesign.

**Primary owner**: FR-FT-045–057; primary proof for SC-FT-009, SC-FT-010, SC-FT-012, and SC-FT-013.

**Build**:

- Split sensitive large widgets only where needed; preserve the single registry, popup/focus owner, arrangement,
  formatting, sidebar/off-canvas and one-row toolbar behavior. Replace Unicode/emoji icon substitutes with local
  15×15, 1.75-stroke binding-derived SVGs.
- Apply exact binding metrics, tokens, font stacks, palette-specific structure, states, focus, reduced motion,
  long text, and contained-only tab scrolling to all 17 families. Preserve Liquid Glass continuous canvas,
  Material filled/pill hierarchy, and Minimal flat/separator/underline structure.
- Add the immutable mockup server, hashed Feature 003 reference-variant adapter, reviewed selector/region/mask
  manifest, deterministic readiness, metric/bounding-box assertions, zero-tolerance PNG comparison, and retained
  reference/actual/diff/JSON/raw-status artifacts.
- **Execute the finite component contract** (**revised 2026-08-14**; the whole-screen expansion of 306 primary +
  240 additional = 546 logical cases and 1,638 comparisons is withdrawn): **exactly 14 pixel-compared component
  keys** — the closed menubar in all six palettes, plus the File, Settings, View and About popups, the 375
  Settings overflow, the tab strip, the toolbar and the paused preview at their assigned width and palette —
  each compared **in its own region**, asserting exact bounds and every compared computed style before comparing
  pixels at zero tolerance. Plus **exactly 36 behaviour-verified keys**: the six `status-*` states across six
  palettes, proven against the authoritative `data-status-state` attribute and the title bar, because the
  binding's status row carries a Problems badge, an AI-provider readout and a Reading pill while production
  carries a Document details disclosure, and FR-FT-049 forbids production the provider readout. Every remaining
  state is verified by behaviour assertion, and a state with no covering assertion fails closed. A capture MUST
  NOT satisfy two state IDs merely because both happen to be visible; duplicate, missing, extra or multiply
  counted keys fail. **A capture is taken only once the region has stopped changing** — three consecutive
  identical hashes as a precondition — and the frozen conditions include a caret, which must cover an editor
  drawing its own cursor element rather than a native one. Any unavoidable mask is minimal and reviewed.
- **The Monaco editor pane interior is a named region exclusion owned by Feature 002.** Its bounds and computed
  styles are still asserted; its raster is not this feature's to match.
- **At the ≤376px minimum window** the application shows exactly one pane matching the selected mode, Split
  collapses to the editor, the workspace panel is not rendered at all, and the collapse is view-only — widening
  restores Split without writing the stored preference. This diverges from the binding, which stacks both panes
  there, and is covered by a reviewed reference variant.
- Preserve every unaffected Feature 001/002 baseline and map each approved change to one FR-FT requirement. Run
  actual-control browser journeys, real bridge interaction, a five-minute zero-outbound observation, and separate
  host-renderer/native-frame evidence without waiving same-browser drift.

**Concrete paths**: binding-derived widget/style/token/icon files; `frontend/e2e/real-files-and-tabs.test.ts`,
`real-files-parity.test.ts`, parity manifest/helpers/reference adapter; Playwright config; existing Feature 001/002
E2E/snapshots; production-network guards; Feature 003 evidence directory.

**Proof**: manifest uniqueness/count tests asserting the 14 pixel-compared and 36 behaviour-verified keys with no
extra keys; all 14 exact component pairs and all 36 behaviour verifications; named state/long-label/hostile-path/
control fixtures; direct metrics; three-run hashes; no unexplained pixels/masks/tolerance/reference replacement; no
page overflow/custom frame; unaffected regression suites; actual controls; five-minute request observation; real
Wails screenshots recorded separately.

### FT-EV-09 — Full implementation and current-host release evidence

**Depends on**: all functional/conformance slices complete and their named focused evidence inspected.

**Primary proof owner**: SC-FT-002 and SC-FT-011; aggregate confirmation of every earlier SC without taking over
its requirement ownership. **Spot-checks SC-FT-007 on the final `just build` binary** without taking ownership from
FT-VS-05, which measures the full 100-trial protocol through the native-evidence harness; a disagreement
between the two distributions reopens T024.

**Record**:

- Preserve the reliable pre-edit baseline, every raw exit status/log, focused result, parity manifest/artifact,
  actual-control journey, real-bridge observation, and current-host limitation under the feature evidence tree.
- Run `just gen-check`, `just archtest`, focused tests, full `just e2e-test`, `just verify
003-real-files-and-tabs`, `just check`, and a fresh `just build`; inspect named tests rather than trusting labels.
- Walk the freshly built Wails application through real Open/Save/permissions/tabs/close/conflict/autosave and the
  exact **10 MiB (10,485,760 bytes)**, **50 MiB (52,428,800 bytes)**, and 40-document boundaries; record
  demonstrated/deferred/unverified behavior and same-browser versus host-renderer comparison separately.
- Run SC-FT-002's two fixed fixtures in that same fresh build: Fixture A (new untitled document, one typed line,
  Save As into a fresh empty directory) and Fixture B (pre-existing 1 KiB file, one character edited, explicit
  Save). Time each from launcher/application-ready to the explicit-save confirmation, not a click. Take one
  non-recursive directory listing of the target's immediate parent directory immediately before and immediately
  after that confirmation; the only permitted diff is the target file, and the FR-FT-009 atomic-replace temporary
  file must already be gone. Retain both timings, both listing pairs, and any diff as evidence.
- **Spot-check SC-FT-007 on this true `just build` binary** and compare the sample against T024's native-evidence
  harness run (20 warmups, exactly 100 trials, 25 each at 1 KiB / 256 KiB / 1 MiB / 2 MiB, ≥95 at or below
  5,000 ms, no discarded failure). Retain every duration, size, revision/commit identity, disk-byte result,
  p50/p95/max, warmup record, host/OS/filesystem/build metadata, and the stated build-tag limitation. Criterion
  ownership remains with T024; a disagreement between the two distributions reopens it.
- Do not run or claim `just package`; packaging remains intentionally unavailable.

## Requirement ownership matrix

Each functional requirement has exactly one primary completion owner. Supporting slices may provide a
dependency or regression test without claiming duplicate ownership.

| Owner    | Functional requirements             | Primary success/evidence ownership          |
| -------- | ----------------------------------- | ------------------------------------------- |
| FT-VS-01 | FR-FT-001–007, FR-FT-028, FR-FT-038 | SC-FT-004 size/limit inputs                 |
| FT-VS-02 | FR-FT-008–016                       | SC-FT-001                                   |
| FT-VS-03 | FR-FT-029–033, FR-FT-035–037        | SC-FT-003                                   |
| FT-VS-04 | FR-FT-020–023                       | SC-FT-006                                   |
| FT-VS-05 | FR-FT-017–019                       | SC-FT-007 (harness-driven real binary)      |
| FT-VS-06 | FR-FT-024–027                       | SC-FT-005                                   |
| FT-VS-07 | FR-FT-034, FR-FT-039–044            | SC-FT-008                                   |
| FT-VS-08 | FR-FT-045–057                       | SC-FT-009, SC-FT-010, SC-FT-012, SC-FT-013  |
| FT-EV-09 | No feature behavior; evidence only  | SC-FT-002, SC-FT-011 and aggregate closeout |

Coverage arithmetic: 57 of 57 FRs are owned once; 13 of 13 SCs have one primary proof owner.

## Clarified-clause ownership

FR-number ownership alone cannot detect a clause added by clarification that no slice implements. Every clause
below is a clarification outcome that must reach `tasks.md` with a named test; `tasks.md` carries the
authoritative task-level version of this table.

| Clarified clause                                                                            | Inside FR                     | Owning slice      |
| ------------------------------------------------------------------------------------------- | ----------------------------- | ----------------- |
| Exact-inclusive binary MiB boundaries and 52,428,801-byte read cap                          | FR-FT-005, SC-FT-004          | FT-VS-01          |
| `none` writable / lone-CR read-only / NEL, U+2028, U+2029 ordinary content                  | FR-FT-007                     | FT-VS-01          |
| Refresh preview: registry-derived, no shortcut, one revision, coalesced, re-pauses          | FR-FT-005                     | FT-VS-01          |
| Process-local canonical identity reservation, pending slots, concurrent join, release       | FR-FT-004, 013, 038           | FT-VS-01/02       |
| Two-phase Open ordering: select → prepare → flush → revalidate → one transition             | FR-FT-004                     | FT-VS-01          |
| Five-value status precedence and per-baseline originating kind                              | FR-FT-014                     | FT-VS-02          |
| Rehydration at 250 ms and 1 s, persistent Retry surface, twice-confirmed discard-quit       | FR-FT-016, 027                | FT-VS-02/06       |
| Stable re-read: metadata-equal resume, unstable re-read writes nothing                      | FR-FT-020                     | FT-VS-04          |
| Foreground-only checks; one modal at a time; waiting tabs visibly blocked by conflict       | FR-FT-020, 021                | FT-VS-04          |
| Move tab left/right: menu placement, edge unavailability, `Mod+Shift+PageUp/Down`, announce | FR-FT-034, 037                | FT-VS-03/07       |
| `\uXXXX` escaping, directional isolation, ellipsis retains distinguishing suffix            | FR-FT-035                     | FT-VS-03          |
| Two-instance transactional promotion, commit order, `persistence-warning` on failure        | FR-FT-039, SC-FT-008          | FT-VS-07          |
| 14 pixel-compared + 36 behaviour-verified keys; no extra keys (supersedes 306 + 240 = 546)  | FR-FT-051, 054, SC-FT-009/012 | FT-VS-08          |
| SC-FT-007: 20 warmups, 100 trials, 4 sizes, ≥95 ≤ 5,000 ms, harness-driven real binary      | SC-FT-007                     | FT-VS-05/FT-EV-09 |

## Current problem ledger folded into dependency order

| Current source problem                                                                         | Required owner | Resolution rule                                                                              |
| ---------------------------------------------------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------- |
| `GetState` dereferences a mandatory active document and cannot represent zero tabs             | FT-VS-01       | Make active identity/buffer optional together before any launcher/final-close work.          |
| Adapter stores only one `state:patch` disposer/subscriber                                      | FT-VS-01       | One runtime subscription fans out to independent listeners with independent disposal.        |
| Dev bridge dirty state diverges from disk-baseline semantics                                   | FT-VS-01/02    | Model baseline/content revisions and pin production/mock parity before browser reliance.     |
| One document-bound Monaco path can recover a cached model/undo history                         | FT-VS-03       | Fresh activation URI/model/token; dispose after awaited flush.                               |
| Buffer and view queues can be flushed separately/fire-and-forget                               | FT-VS-02/03    | One lifecycle barrier captures and awaits both or aborts without identity change.            |
| Runtime patch emission is fire-and-forget; current service rollback is wrong after disk commit | FT-VS-02       | Committed revision result + projection barrier/full rehydrate; no file retry/rollback.       |
| Plain cross-platform rename cannot prove Windows replace-existing atomicity                    | FT-VS-02       | Build-tagged platform replacement port and target-host proof.                                |
| Current native-close hook flushes layout only                                                  | FT-VS-06       | Veto/close-plan/one-shot-quit protocol and ordered drains.                                   |
| File/tabs are disabled fixtures and actions infer writability from buffer presence             | FT-VS-01–07    | Registry actions use projected backend capability and real typed commands.                   |
| Unicode icon substitutes and status wrapping/min-height contradict binding metrics             | FT-VS-08       | Binding-derived local SVGs and exact 28 px one-row status with accessible overflow.          |
| Current browser suite is mock-bridge only and no live mockup comparator exists                 | FT-VS-08/EV-09 | Concurrent immutable reference + app parity, then separate real bridge/files/build evidence. |

## Edge-case disposition

The specification contains **36** edge cases. `tasks.md` carries the authoritative EC-01–36 ledger with one
accountable task each. They attach to the first slice that can exercise their complete behavior: ingress, size,
line-ending and placeholder bounds in FT-VS-01; format, authorization, serialization and resync in FT-VS-02/05;
stale identity, hostile labels and reorder in FT-VS-03; stable re-read, conflict queue and Skip semantics in
FT-VS-04; all-or-nothing close in FT-VS-06; recents, two-instance promotion and zero state in FT-VS-07; and visual
exclusions, mask discipline, provenance and evidence integrity in FT-VS-08/FT-EV-09.

## Owned/Consumed/Deferred source traceability

| Source                                                                                                                                                                   | Disposition in this plan                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Active `spec.md`, including clarified Skip/reopen/reorder/reservation/manifest/performance requirements                                                                  | Owned exactly by FT-VS-01–08 and FT-EV-09 as mapped above.                                                                                   |
| `docs/delivery/plan/phase-05-real-files.md` and opening/saving/tab product files                                                                                         | Read-only migrated reference; file/tab lifecycle and named debt are fully represented, while newer active-spec values win.                   |
| Binding `docs/delivery/spec/surface/mockup.html` and README                                                                                                              | Read-only exact shape/style authority; served live and adapted only through versioned Feature 003 test variants.                             |
| Feature 001 application-state, command-boundary, shell and persistence contracts                                                                                         | Consumed: backend authority, typed handlers, adapter-only bridge, optional zero state, offline/native frame/multi-instance rules.            |
| Feature 002 action/formatting/editor-session implementation and artifacts                                                                                                | Consumed and visually converged: promote File/tab actions only; preserve formatting, Table binding, arrangements and every deferred outcome. |
| ADR-0004/0006/0014/0021/0022/0024/0032                                                                                                                                   | Consumed; Skip narrowly follows active spec over ADR-0024's historical two-action prompt.                                                    |
| Workspace, OS entry, drag/drop, packaging, renderer expansion, search/tidy/export, tab groups/panes/pinning/detach, session/recovery/swap and Assistant/provider sources | Explicitly deferred; no hidden state, I/O, network, provider, fake success, or placeholder is introduced.                                    |

## Downstream entry gates preserved

- Workspace tree, drag-and-drop, and operating-system association work must call the canonical `OpenPath`
  lifecycle introduced here; none is implemented now.
- Rich rendering consumes canonical snapshots and existing viewer behavior; file opening does not expand syntax,
  remote assets, math, Mermaid, plugins, or export. Refresh preview renders only the already-supported basic
  preview for one accepted revision and expands nothing.
- Search/tidy/diff may consume document identities and bounded conflict metadata later; this feature does not add
  full diff navigation, problems, whole-document format/compact/lint, or their gates.
- Packaging remains Phase 08 and Assistant/provider behavior remains later. No control gains network or hidden
  lifecycle merely because its final shape is visible.
- Session restore/crash recovery/swap files remain absent. Recents and recently closed entries never retain source.

## Verification sequence for implementation handoff

1. Before the first code edit, run `just baseline 003-real-files-and-tabs`; inspect every exit/status/raw log and
   stop on `UNRELIABLE`.
2. For each task, run its exact Go or frontend red/green focused test and inspect the named failure/recovery cases.
3. After DTO/query changes, run generated-binding drift and sqlc checks; generated outputs are never hand-edited.
4. Run `just archtest` green outright, including adapter-only imports, handler shape, identity, CGO-free, offline,
   migration immutability, localization and token constraints.
5. Run adapter/dev-bridge parity, component integration, actual-control browser journeys, and the full component
   parity contract; retain failures rather than changing tolerance/reference/masks. **`just check` never runs
   Playwright — run `just e2e-test` explicitly and diff it before calling any interface work done.**
6. Run real bridge/disk/native-dialog/close observation, the five-minute zero-outbound case, and target-host
   platform replacement tests.
7. Run full `just e2e-test`, `just verify 003-real-files-and-tabs`, and `just check`; a later isolated pass does not
   supersede a newer full failure.
8. Run fresh `just build`, spot-check SC-FT-007 against T024's 100-trial harness run, execute SC-FT-002's two fixtures,
   walk SC-FT-011 in the real binary, and record demonstrated, deferred, and host-unverified behavior plus
   same-browser/host-renderer evidence separately.

## Complexity Tracking

No constitution violation requires an exception. Platform-specific atomic replacement, a transient projection
barrier, the process-local identity reservation table, the single-modal conflict queue, and the two-stage close
coordinator are required by existing cross-platform/data-loss contracts, not new state owners or speculative
abstractions. The only new image-comparison libraries are pinned development tools; no production dependency or
outbound capability is added.

## Post-design Constitution Check

_PASS after Phase 1 design._

- [file-lifecycle.md](contracts/file-lifecycle.md) fixes canonical Open/New, raw classification with exact MiB
  boundaries, the identity reservation lifecycle, typed command, optional-active and persistence boundaries, the
  injected clipboard-write port, and the eight-category classified error and remediation contract.
- [tab-session.md](contracts/tab-session.md) fixes ordered tabs, flush/activation acknowledgements, fresh Monaco
  identity, stale refusal, the Move tab left/right menu placement and reorder contract, disambiguated hostile-safe
  labels, closed-history behavior, and the complete Copy path/Reveal in file manager contract.
- [save-conflict-close.md](contracts/save-conflict-close.md) fixes atomic replacement, disk versions, stable
  re-read, single-use authorizations, the single-modal conflict queue, autosave serialization, projection
  convergence with its 250 ms/1 s retry schedule, close planning, and native shutdown.
- [file-surfaces-and-parity.md](contracts/file-surfaces-and-parity.md) fixes registry/surface ownership, responsive
  metrics, the finite component comparison (14 pixel-compared + 36 behaviour-verified keys), and evidence provenance.
- [data-model.md](data-model.md) assigns every field and transition to one authority without putting source in Redux.
- [quickstart.md](quickstart.md) names runnable focused, aggregate, exact-browser, real-bridge and real-build proof.

All 57 FRs, 13 SCs, 42 clarified clauses, user scenarios, 36 edge cases, 11 current source debts, explicit
exclusions, and source dispositions have a dependency-ordered owner. `tasks.md` carries the task-level expansion.

The clause count is **measured**, not carried forward: 42 `- Q:` entries across five Clarifications
sessions (2026-08-07: 21, 2026-08-09: 5, 2026-08-12: 1, 2026-08-13: 5, 2026-08-14: 10). It read `14`
here and `18` in T044 until 2026-08-15, and neither figure ever matched the document — the spec held
26 when the `18` was written. Re-measure it when a session is added rather than incrementing it by
hand; `evidence/ft-ev-09/coverage-ledger.md` records how the two stale figures were found.
