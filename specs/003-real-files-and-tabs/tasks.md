---
description: "Dependency-ordered implementation tasks for Real Files and Tabs"
---

# Tasks: Real Files and Tabs

**Input**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `quickstart.md`, all four files in
`contracts/`, `.specify/memory/constitution.md`, current source/tests, and the primary-source fact checks below.
Screenshots of the Mockup for visual validation: `specs/003-real-files-and-tabs/surface`.

**Parent branch**: `feature/v1-implementation`. Every task uses one `feature/v1-implementation--003-tNNN-*`
branch, one Conventional Commit, its named evidence, and a squash merge back to the parent. Do not create a
second parent branch and do not commit on `master`.

**Scope rule**: Tests are mandatory because the specification makes scenarios and evidence mandatory. Within each
task, write the named test first, observe the relevant red failure, implement only the bounded outcome, then run
the named green evidence and the task-appropriate gate. Generated `frontend/wailsjs/` and `internal/db/store/`
files are generator-owned and are never hand-edited.

**Read-only boundary**: Do not modify `docs/delivery/`. Its binding mockup may be served as an immutable reference.
No task may weaken a test, locator, threshold, retry, mask, reference, architecture rule, hook, or quality config.

**Numeric boundary rule**: Every size threshold in this feature is a **binary mebibyte with an exact inclusive
boundary**. Wherever a task says a size, it means the exact byte count: **2 MiB = 2,097,152**,
**10 MiB = 10,485,760**, **50 MiB = 52,428,800**, classification read cap **52,428,801**. A fixture, assertion, or
evidence line written against decimal "10 MB" (10,000,000) is wrong and fails the task.

**Mock-bridge rule**: `npm --prefix frontend run verify:ui` resolves to `playwright test`, which runs against the
deterministic dev bridge mock. It proves control wiring, accessibility, layout, and projection contracts. It
**never** proves disk bytes, permissions, native dialogs, atomic replacement, or wall-clock timing. Any criterion
about those is measured on a fresh `just build` binary (constitution VII).

## Fact-checked implementation constraints

The current manifests confirm Go 1.25.7, Wails 2.12.0, `modernc.org/sqlite` 1.54.0, TypeScript 5.8.3,
React 19.1.1, Redux Toolkit 2.12.0, Monaco 0.52.2, Jest 30.0.5, and Playwright 1.61.1. The task design also
uses these primary-source checks:

- Go documents that `os.Rename` is not atomic on non-Unix platforms even within one directory, so T012 retains
  a build-tagged Windows replace-existing port instead of treating plain `os.Rename` as cross-platform proof:
  <https://pkg.go.dev/os#Rename>.
- Microsoft documents `ReplaceFileW` as a replace-existing operation with same-volume, access, attribute, ACL,
  and partial-failure conditions; T012 therefore requires target-host error and preservation tests rather than a
  documentation-only claim: <https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-replacefilew>.
- Apple documents that APFS can be case-sensitive; T005 must not globally lowercase macOS paths:
  <https://developer.apple.com/documentation/technologyoverviews/files-and-directories>.
- Wails 2.12 documents that `OnBeforeClose` runs for both native close and `runtime.Quit`, and `true` vetoes;
  T027 implements the required two-stage one-shot protocol:
  <https://wails.io/docs/v2.12.0/reference/options/>.
- Wails `EventsEmit` returns no browser-application acknowledgement; T013 treats projection convergence as an
  explicit revision barrier and proves event-loss recovery:
  <https://wails.io/docs/v2.12.0/reference/runtime/events/>.
- Monaco exposes model identity/URI, undo state, creation, and disposal APIs; T017 still proves the pinned 0.52.2
  behavior empirically rather than assuming disposal erases a cached session:
  <https://microsoft.github.io/monaco-editor/typedoc/interfaces/editor_editor_api.editor.ITextModel.html>.
- Playwright supports region screenshots, but its snapshot comparison permits a nonzero color threshold by
  default; T034–T035 use a pinned decoded-PNG comparator with explicit zero tolerance and retained triplets:
  <https://playwright.dev/docs/screenshots> and
  <https://playwright.dev/docs/api/class-snapshotassertions>.
- Wails 2.12's runtime package documents `ClipboardSetText(ctx context.Context, text string) error`; T016 wires
  Copy path through this injected call rather than a frontend-side clipboard API, and Reveal in file manager has
  no Wails built-in and is implemented as a composition-root OS command port instead:
  <https://pkg.go.dev/github.com/wailsapp/wails/v2/pkg/runtime>.
- Go's `time` package documents that a `Time` returned by `time.Now` carries a monotonic clock reading and that
  `t.Sub(u)` uses it when both operands have one; SC-FT-007's final-input-to-commit duration in T024 is therefore
  measured with monotonic subtraction rather than wall-clock arithmetic:
  <https://pkg.go.dev/time#hdr-Monotonic_Clocks>.

## Phase 1: Trustworthy baseline and deterministic fixtures

**Purpose**: Route migrated-feature evidence correctly, capture a reliable pre-feature baseline, and prepare only
isolated test fixtures. No Feature 003 behavior task may begin before T002 passes.

- [X] T001 Repair migrated-feature baseline routing in `scripts/evidence_id.sh`, `scripts/baseline.sh`, `scripts/verify.sh`, and `scripts/baseline_verify_test.sh` so `003-real-files-and-tabs` resolves to `specs/003-real-files-and-tabs/evidence/baseline/baseline{.md,.exit,.commit,.findings,.failing-tests,.logs/}`, while legacy `STORY-NNN` evidence and the Feature 001 verification alias remain at their existing read-only locations.
  - **Outcome**: Baseline tooling can capture and verify a migrated feature without writing under `docs/delivery/`.
  - **Prerequisites**: None.
  - **Ownership**: Tooling blocker only; no FR/SC ownership.
  - **Tests/evidence**: `bash scripts/baseline_verify_test.sh` must name and pass feature routing, unsafe-ID refusal, legacy-path preservation, Feature 001 alias preservation, and unreliable-baseline refusal.
  - **Branch/commit**: `feature/v1-implementation--003-t001-baseline-routing`; `fix(evidence): route Spec Kit baselines into feature specs`.

- [X] T002 Capture the trustworthy pre-edit baseline with `just baseline 003-real-files-and-tabs` under `specs/003-real-files-and-tabs/evidence/baseline/` and inspect `baseline.md`, `baseline.exit`, every `baseline.logs/*.log`, and every `baseline.logs/*.code` before allowing implementation.
  - **Outcome**: One immutable baseline records every gate exit, raw log, finding set, failing test, coverage value, commit, and dirty-state provenance; any `UNRELIABLE` verdict stops the feature.
  - **Prerequisites**: T001.
  - **Ownership**: Evidence foundation only; no FR/SC ownership.
  - **Tests/evidence**: `just baseline 003-real-files-and-tabs`; `just archtest` must be green outright; record an explicit reviewed-baseline note in `specs/003-real-files-and-tabs/evidence/baseline/review.md` without abridging raw output.
  - **Branch/commit**: `feature/v1-implementation--003-t002-baseline-capture`; `test(evidence): capture Feature 003 baseline`.

- [X] T003 [P] Add deterministic real-file fixture builders in `internal/file/document_fixtures_test.go` and `frontend/e2e/helpers/real-file-fixtures.ts` without committing giant or destructive fixtures. The builders MUST produce, by exact byte count and named scenario:
  - **Line endings**: uniform LF; uniform CRLF; mixed LF/CRLF with a clear dominant ending; mixed LF/CRLF at an exact tie (first-encountered ending wins); **`none` (valid UTF-8 with no LF and no CRLF)**; **lone ASCII CR (0x0D with no LF)**; and a file containing **NEL (U+0085), LINE SEPARATOR (U+2028), and PARAGRAPH SEPARATOR (U+2029)** as ordinary content.
  - **Encoding/safety**: UTF-8 with byte-order mark; UTF-8 without byte-order mark; invalid UTF-8; NUL-bearing bytes.
  - **Permissions**: non-default permission modes (at least one mode that is not the process default).
  - **Sizes, exact and inclusive**: **2,097,152**, **2,097,153**, **10,485,760**, **10,485,761**, **52,428,800**, and **52,428,801** bytes. Generate them at test time into a temporary directory; never commit them.
  - **Path shapes**: identical basenames in different directories; identical basenames whose immediate parent names are also identical (requiring a two-or-more-segment suffix); symlink aliases; and **hostile names containing C0 control characters, DEL (U+007F), and bidirectional formatting controls (U+202A–U+202E, U+2066–U+2069)**.
  - **Outcome**: All later slices share byte-exact, temporary, cleanup-safe inputs and can identify every generated file by scenario. No fixture is described in decimal MB.
  - **Prerequisites**: T002; may run in parallel only with read-only task preparation, not behavior-bearing work.
  - **Ownership**: Test infrastructure only; no FR/SC ownership.
  - **Tests/evidence**: `go test -race ./internal/file -run TestDocumentFixtureBytesAndBounds` asserting each size fixture's exact `Stat().Size()`; `npm --prefix frontend test -- --runInBand` with named test `real file fixture metadata is deterministic`.
  - **Branch/commit**: `feature/v1-implementation--003-t003-file-fixtures`; `test(files): add deterministic lifecycle fixtures`.

---

## Phase 2: FT-VS-01 — New/Open and bounded document ingestion

**Goal**: Establish a zero-safe backend-authoritative ordered document model and deliver canonical New/Open with
real local-file classification, exact MiB boundaries, and the process-local identity reservation. This slice owns
FR-FT-001–007, FR-FT-028, and FR-FT-038 exactly once.

**Independent test**: Through the real bridge and native picker, cancel Open; create New; open LF/CRLF/BOM/`none`/
lone-CR, unsafe, 10,485,761-byte and 52,428,801-byte inputs; focus a duplicate alias; replace only an unchanged
empty untitled tab; race two Open requests for the same path; and refuse a 41st distinct document without partial
projection or recent-file state.

- [X] T004 [US1] Make the canonical snapshot/patch model represent zero through 40 ordered documents with optional active identity and active buffer together, explicit active clearing, revisions, capabilities, and content-free Redux projection in `internal/apperr/results.go`, `internal/apperr/results_test.go`, `internal/appmodel/model.go`, `internal/appmodel/service.go`, `internal/appmodel/service_test.go`, `frontend/src/logic/store/appModelTypes.ts`, `frontend/src/logic/store/documentsSlice.ts`, `frontend/src/logic/store/appModelProjection.ts`, `frontend/src/logic/store/appModelProjection.test.ts`, `frontend/src/logic/adapter/appModelAdapter.ts`, and `frontend/src/logic/adapter/appModelAdapter.test.ts`. Also add the shared `ClassifiedError` type in `internal/apperr/classified_error.go` and `internal/apperr/classified_error_test.go`: exactly the eight named categories (`not-found`, `permission-denied`, `io-failure`, `conflict`, `capacity-limit`, `unsupported-input`, `system-command-failure`, `persistence-warning`), a `safeSubject` field that only ever carries a basename or disambiguated tab label, a `remediation` field restricted to the fixed vocabulary (`Retry`, `Reload from disk`, `Keep mine`, `Skip`, `Save to recreate`, `Copy path`, `Cancel`, or empty for message-only), and a `documentId`+`category` dedup key every later write/conflict/reveal/persistence result reuses.
  - **Outcome**: `GetState` cannot dereference a missing active document, patches clear active state unambiguously, one runtime `state:patch` subscription fans out to independently disposable consumers, and every later slice that returns a classified failure (FT-VS-02 writes, FT-VS-03 Copy path/Reveal, FT-VS-04 conflicts, FT-VS-05/07 persistence) has one shared, exhaustively-typed error shape to return instead of inventing its own strings.
  - **Prerequisites**: T002; T003 fixtures may already be available but are not required.
  - **Primary ownership**: FR-FT-028; closes current problems CP-01 and CP-02. `ClassifiedError` is shared infrastructure consumed by later FRs' remediation language, not a second owner of any FR-FT number.
  - **Tests/evidence**: `go test -race ./internal/appmodel ./internal/apperr -run 'TestGetStateRepresentsZeroDocuments|TestAppStateOptionalActiveTuple|TestClassifiedErrorCategoryIsExhaustive|TestClassifiedErrorRemediationIsFixedVocabulary'`; `npm --prefix frontend test -- --runInBand` with named tests `projects optional active state` and `fans out state patches with independent disposal`; `just archtest`.
  - **Branch/commit**: `feature/v1-implementation--003-t004-zero-safe-projection`; `feat(appmodel): add zero-safe ordered document projection`.

- [X] T005 [US1] Implement canonical document-path identity and bounded raw classification in `internal/file/paths.go`, `internal/file/paths_test.go`, `internal/file/document_reader.go`, and `internal/file/document_reader_test.go`, including supported suffixes, symlink resolution, filesystem-aware identity, BOM/NUL/UTF-8 classification, tolerant read-only display, and pre-insertion size outcomes. Classification MUST implement the exact inclusive boundaries: a safe supported file at or below **10,485,760** bytes is writable; **10,485,761** through **52,428,800** bytes opens read-only with a visible reason; **52,428,801** bytes or more is refused before any partial model insertion with a message naming the 50 MiB limit; and classification reads **at most 52,428,801 bytes**. Line-ending classification MUST produce exactly four states — uniform LF, uniform CRLF, mixed LF/CRLF, and **`none`** — where **a `none` file remains writable**, **a lone ASCII CR opens read-only with a warning and is never silently converted**, and **NEL (U+0085), U+2028, and U+2029 remain ordinary content and never count as line endings**.
  - **Outcome**: One Go capability returns canonical identity, safe display metadata, exact file characteristics, and a writable/read-only/refused result without globally lowercasing macOS paths or exposing private paths in errors.
  - **Prerequisites**: T003, T004.
  - **Primary ownership**: FR-FT-002 and FR-FT-005–007; closes EC-03, EC-04 and EC-05. T005 owns FR-FT-005's classification and size boundary only; T009 is the declared clause owner of FR-FT-005's Refresh preview action.
  - **Tests/evidence**: `go test -race ./internal/file -run 'TestCanonicalizeDocumentPath|TestReadClassifiedDocument|TestLineEndingClassification'` with suffix-case, alias, LF/CRLF/mixed/tie tables; a `none` writable case; a lone-CR read-only case; a NEL/U+2028/U+2029 ordinary-content case; BOM; invalid UTF-8; NUL; and exact-byte size rows at 2,097,152 / 2,097,153 / 10,485,760 / 10,485,761 / 52,428,800 / 52,428,801 asserting the read cap is never exceeded.
  - **Branch/commit**: `feature/v1-implementation--003-t005-document-ingress`; `feat(files): classify canonical document input`.

- [X] T006 [US2] Implement revision-checked New as one backend transition in `internal/appmodel/file_lifecycle.go`, `internal/appmodel/file_lifecycle_test.go`, `internal/appmodel/handler.go`, `internal/appmodel/handler_test.go`, and `internal/apperr/results.go`.
  - **Outcome**: New mints one stable empty untitled UTF-8/LF/no-BOM Editor document without a path, write, recent entry, or default-mode leakage, and refuses stale or 41st-document requests atomically with a classified `capacity-limit` message naming the limit.
  - **Prerequisites**: T004.
  - **Primary ownership**: FR-FT-001; the shared 40-document guard supports T007's sole FR-FT-038 ownership.
  - **Tests/evidence**: `go test -race ./internal/appmodel -run 'TestNewDocumentDefaultsAndNoWrite|TestNewDocumentRefusesStaleOrFortyFirst'`; `go test -race ./internal/apperr -run TestDocumentTransitionWireShape`; `just archtest`.
  - **Branch/commit**: `feature/v1-implementation--003-t006-new-document`; `feat(files): add backend-authoritative New`.

- [X] T007 [US1] Implement canonical Open, the process-local identity reservation, duplicate focus, empty-placeholder replacement, default-mode/view precedence, all-or-nothing tab limits, and metadata persistence foundations in `internal/appmodel/file_lifecycle.go`, `internal/appmodel/file_lifecycle_test.go`, `internal/appmodel/identity_reservation.go`, `internal/appmodel/identity_reservation_test.go`, `internal/appmodel/file_metadata_repository.go`, `internal/appmodel/file_metadata_repository_sqlite.go`, `internal/appmodel/file_metadata_repository_sqlite_test.go`, `internal/appmodel/service.go`, and `internal/appmodel/service_test.go`. The task MUST implement both named contracts:
  - **Two-phase ordering**: native Open selection completes with **no document or recent-file mutation**; the backend then prepares canonical identity, duplicate, capacity and reservation outcomes **without activating a document** (New prepares only revision and capacity); the frontend flushes and awaits the outgoing identity-bound content and view state; the backend then **revalidates the expected tab-set revision and the reservation** and applies **exactly one** authoritative transition. Cancellation, failed flush, stale revision, lost reservation, classification failure, or refusal leaves active identity, ordered tabs, documents, recents, and active buffer unchanged.
  - **Process-local canonical identity reservation**: Open, recent-file, reopen and Save As **hold a reservation for the prepared canonical identity until activation, commit, cancellation, or failure**. A novel prepared Open **reserves both its canonical identity and one document slot**, and **pending novel reservations count toward the 40-document limit**. Canonicalization and deduplication happen **before** the limit is applied, so focusing an already-open identity stays valid at capacity and consumes no slot. **Concurrent requests resolving to the same open or pending identity join one authoritative outcome** rather than reserving another slot or creating another document. No application-wide or persistent file lock is added.
  - **Outcome**: Open inserts or focuses exactly one backend document and acknowledgement, never replaces nonempty untitled work, never restores a session, and uses the existing KV store without a migration or persisted source.
  - **Prerequisites**: T005, T006.
  - **Primary ownership**: FR-FT-003–004 and FR-FT-038; closes EC-07, EC-19 and EC-20 at the canonical model boundary.
  - **Tests/evidence**: `go test -race ./internal/appmodel -run 'TestOpenPathLifecycle|TestOpenFocusesCanonicalDuplicate|TestOpenReplacesOnlyEmptyUntitled|TestOpenRefusesFortyFirstWithoutMutation|TestPersistedArrangementPrecedence|TestIdentityReservationLifecycle|TestPendingReservationCountsTowardLimit|TestConcurrentSameIdentityRequestsJoinOneOutcome|TestReservationReleasedOnEveryTerminalOutcome|TestOpenSelectionPerformsNoMutationBeforeFlush'`; `just archtest`.
  - **Branch/commit**: `feature/v1-implementation--003-t007-open-lifecycle`; `feat(files): add canonical Open lifecycle`.

- [X] T008 [US1] Wire typed New/Open handlers, native Open dialog, cancellation, composition, and generated binding verification in `internal/application/document_dialogs.go`, `internal/application/document_dialogs_test.go`, `internal/application/application_context_holder.go`, `internal/application/application_test.go`, `internal/appmodel/handler.go`, `internal/appmodel/handler_test.go`, `main.go`, and `main_test.go`.
  - **Outcome**: Only the composition root touches Wails/native dialogs, cancellation is a normal no-mutation outcome, handlers retain the required typed/panic-safe shape, and production wiring reaches canonical Open.
  - **Prerequisites**: T007.
  - **Primary ownership**: Supporting proof for FR-FT-001–004; closes EC-01; no duplicate FR owner.
  - **Tests/evidence**: `go test -race ./internal/application ./internal/appmodel . -run 'TestDocumentDialogs|TestOpenCancellationHasNoMutation|TestAppModelHandlerIsBoundAndGenerated'`; run `just gen` followed by `just gen-check`; inspect generator-owned mode drift rather than hand-editing it.
  - **Branch/commit**: `feature/v1-implementation--003-t008-open-wiring`; `feat(wails): wire native New and Open commands`.

- [X] T009 [US1] Project and operate real New/Open capability and the paused-preview surface through `frontend/src/logic/adapter/services.ts`, `frontend/src/logic/adapter/services.test.ts`, `frontend/src/logic/adapter/appModelAdapter.ts`, `frontend/src/logic/adapter/appModelAdapter.test.ts`, `frontend/src/logic/actions/actionRegistry.ts`, `frontend/src/logic/actions/actionRegistry.test.ts`, `frontend/src/logic/actions/actionDispatcher.ts`, `frontend/src/logic/actions/actionDispatcher.test.ts`, `frontend/src/ui/widgets/PreviewPane.tsx`, `frontend/src/ui/widgets/PreviewPane.test.tsx`, `frontend/src/dev/bridge-mock/go/appmodel/AppModelHandler.ts`, `frontend/src/dev/bridge-mock/appModel.test.ts`, `frontend/src/App.tsx`, `frontend/src/App.test.tsx`, `frontend/src/ui/widgets/ShellMenuRow.tsx`, `frontend/src/ui/widgets/ShellMenuRow.test.tsx`, `frontend/src/i18n/locales/en.json`, and `frontend/e2e/real-files-and-tabs.test.ts`. This task implements the **Refresh preview** action in full: it is **registry-derived with no keyboard shortcut**, is available from the paused-preview surface for supported text, **renders exactly the current backend-accepted revision**, **rejects or coalesces a duplicate run**, **remains current only while that revision is unchanged**, **re-pauses on the next accepted edit above 2,097,152 bytes**, and on failure **leaves preview paused with a classified `io-failure` error offering Retry and no duplicate run**.
  - **Outcome**: Actual accessible File-menu New/Open controls use typed commands and backend capability, zero state mounts safely, mock/production outcomes match, live preview stays active through exactly 2,097,152 bytes and pauses above it with a working Refresh preview affordance, downstream File actions remain visibly unavailable, and the first real tab/status shell uses binding metrics.
  - **Prerequisites**: T008.
  - **Primary ownership**: Primary proof for SC-FT-004 size and 40-document inputs; **declared clause owner of FR-FT-005's Refresh preview action** (T005 remains the sole FR-FT-005 owner for classification and size boundaries); supporting proof for FR-FT-001–007/028/038; closes EC-06; begins but does not close CP-09.
  - **Tests/evidence**: `npm --prefix frontend test -- --runInBand` with named suites `Feature 003 New/Open adapter parity`, `zero-document application shell`, `live preview pauses above 2,097,152 bytes`, `Refresh preview renders one accepted revision and coalesces duplicates`, `Refresh preview re-pauses on the next accepted edit`, `Refresh preview failure keeps preview paused with io-failure and Retry`, `Refresh preview has no keyboard shortcut`, and `File menu New/Open capability`; `npm --prefix frontend run verify:ui -- e2e/real-files-and-tabs.test.ts --grep 'FT-VS-01'`; retain native cancellation/raw-byte observations in `specs/003-real-files-and-tabs/evidence/ft-vs-01/`; `just archtest`.
  - **Branch/commit**: `feature/v1-implementation--003-t009-new-open-ui`; `feat(files): operate New and Open from real surfaces`.

**Checkpoint**: FT-VS-01 is independently demonstrable, but it is not a safe-save MVP yet.

---

## Phase 3: FT-VS-02 — Atomic Save, Save As, and committed projection convergence

**Goal**: Deliver one awaited, revision-safe write path with cross-platform atomic replacement and no lost last
keystroke. This slice owns FR-FT-008–016 exactly once.

**Independent test**: Immediately save LF/CRLF/BOM/`none`/mode fixtures after typing; exercise mixed normalization,
suffix rules, cancellation, collisions, target drift, reservation release, every injected pre-commit failure, newer
edits during write, the full status-precedence table, and committed projection loss with its bounded retry schedule
while inspecting bytes and modes.

- [X] T010 [US1] Replace separate/fire-and-forget content and view drains with one identity-and-activation-token-bound imperative lifecycle barrier in `frontend/src/logic/hooks/useSyncedBuffer.ts`, `frontend/src/logic/hooks/useSyncedBuffer.test.ts`, `frontend/src/logic/hooks/useLifecycleBarrier.ts`, `frontend/src/logic/hooks/useLifecycleBarrier.test.ts`, `frontend/src/logic/store/docViewCommands.ts`, `frontend/src/logic/store/docViewCommands.test.ts`, `frontend/src/logic/adapter/appModelAdapter.ts`, and `frontend/src/logic/adapter/appModelAdapter.test.ts`.
  - **Outcome**: Save/switch/close/reload/hide either await newest content and complete view together for the captured activation or abort without an identity transition.
  - **Prerequisites**: T009.
  - **Primary ownership**: FR-FT-008; closes CP-05.
  - **Tests/evidence**: `npm --prefix frontend test -- --runInBand` with named tests `flushActiveSession accepts latest content and view`, `one failed queue aborts lifecycle`, and `immediate Save waits for pending keystroke`; `just archtest`.
  - **Branch/commit**: `feature/v1-implementation--003-t010-lifecycle-barrier`; `feat(editor): add awaited lifecycle barrier`.

- [X] T011 [US1] Implement raw encode/decode and portable disk-version primitives in `internal/file/codec.go`, `internal/file/codec_test.go`, `internal/file/disk_version.go`, and `internal/file/disk_version_test.go`.
  - **Outcome**: Immutable canonical snapshots encode new files as UTF-8/LF/no-BOM, preserve uniform LF/CRLF and BOM presence, and **preserve a `none` file's absence of a terminator until the user inserts a break, which is then encoded as LF**; one version equality implementation covers existence, size, nanosecond time, mode, and optional file identity.
  - **Prerequisites**: T005, T010.
  - **Primary ownership**: FR-FT-010.
  - **Tests/evidence**: `go test -race ./internal/file -run 'TestDocumentCodecRoundTrip|TestNoneEndingPreservedUntilBreakInserted|TestDiskVersionEquality'` with byte-exact LF/CRLF/BOM/new/`none`/mixed-refusal and replacement-identity tables.
  - **Branch/commit**: `feature/v1-implementation--003-t011-file-codec-version`; `feat(files): add document codec and disk versions`.

- [X] T012 [US1] Implement injected same-directory replacement in `internal/file/atomic_replace.go`, `internal/file/atomic_replace_unix.go`, `internal/file/atomic_replace_windows.go`, `internal/file/atomic_replace_test.go`, `internal/file/atomic_replace_unix_test.go`, and `internal/file/atomic_replace_windows_test.go`, updating `go.mod` and `go.sum` only if the existing `golang.org/x/sys` support becomes a direct dependency.
  - **Outcome**: Full write, mode application, sync/close, version recheck, platform replace, Unix parent-directory sync, cleanup, and classified pre/post-commit outcomes are explicit; plain cross-platform `os.Rename` is not accepted as Windows proof.
  - **Prerequisites**: T011.
  - **Primary ownership**: FR-FT-009; closes CP-07.
  - **Tests/evidence**: `go test -race ./internal/file -run TestAtomicReplace`; build-tagged Unix and Windows compile/tests; injected write/chmod/sync/close/recheck/replace failure cases; current-host byte/mode evidence in `specs/003-real-files-and-tabs/evidence/ft-vs-02/atomic-replace/`.
  - **Branch/commit**: `feature/v1-implementation--003-t012-atomic-replace`; `feat(files): add platform-safe atomic replacement`.

- [X] T013 [US1] Implement the per-document write coordinator, immutable revision snapshots, disk-baseline dirty truth, the five-value save-status projection, committed revision results, deduplicated failures, and the bounded projection rehydrate/recovery sequence in `internal/appmodel/write_coordinator.go`, `internal/appmodel/write_coordinator_test.go`, `internal/appmodel/save_status.go`, `internal/appmodel/save_status_test.go`, `internal/appmodel/resync_recovery.go`, `internal/appmodel/resync_recovery_test.go`, `internal/appmodel/runtime_emitter.go`, `internal/appmodel/runtime_emitter_test.go`, `internal/appmodel/service.go`, `internal/appmodel/service_test.go`, `internal/apperr/results.go`, `internal/apperr/results_test.go`, `frontend/src/logic/adapter/appModelAdapter.ts`, `frontend/src/logic/adapter/appModelAdapter.test.ts`, `frontend/src/logic/store/appModelProjection.ts`, and `frontend/src/logic/store/appModelProjection.test.ts`. Two named contracts are mandatory:
  - **Status precedence and baseline origin**: Go authoritatively projects exactly one status using this precedence — read-only capability wins and yields `read-only`; an empty untitled document is `not-saved`; dirty, detached, nonempty untitled, failed write, or a revision newer than an in-flight/committed snapshot is `unsaved-changes`; clean after Open, Reload, explicit Save, or Save As is `saved`; clean after autosave is `autosaved`. **Each committed baseline retains its originating kind** (`open`, `reload`, `explicit-save`, `save-as`, `autosave`) so returning exactly to that baseline restores the correct clean label. A successful stale-revision write updates disk truth but MUST NOT project a clean status for newer content, and a failed write MUST NOT change status.
  - **Bounded recovery**: rehydration runs **immediately, then retries after 250 ms and after one second**. If all three attempts fail, document commands and normal close stay blocked and a **persistent recovery surface** states that the file **was saved on disk** but editor-state recovery failed. **Retry restarts the same bounded sequence.** `Quit and discard newer unsaved changes` requires a **second confirmation naming the affected documents** and MUST NOT alter or replay any committed write.
  - **Outcome**: A pre-commit failure preserves disk/model truth; a committed write records its exact baseline, never retries/rolls back on event loss, pauses later document commands, and rehydrates until its revision is projected; newer edits remain dirty.
  - **Prerequisites**: T010, T012.
  - **Primary ownership**: FR-FT-014 and FR-FT-016; closes CP-03 and CP-06 plus EC-10 and EC-25.
  - **Tests/evidence**: `go test -race ./internal/appmodel -run 'TestWriteCoordinator|TestSaveStatusPrecedenceTable|TestBaselineOriginRestoresCleanLabel|TestFailedWriteLeavesStatusUnchanged|TestStaleRevisionWriteDoesNotProjectClean|TestCommittedWriteProjectionFailure|TestResyncRetriesAt250msAndOneSecond|TestResyncExhaustionShowsPersistentRecoverySurface|TestQuitAndDiscardRequiresSecondConfirmation|TestNewerEditRemainsDirty'`; `npm --prefix frontend test -- --runInBand` with named tests `committed result rehydrates without duplicate Save` and `dev bridge dirty state follows disk baseline`; `just archtest`.
  - **Branch/commit**: `feature/v1-implementation--003-t013-write-convergence`; `feat(files): converge committed writes without replay`.

- [X] T014 [US2] Implement Save/Save As path choice, supported/suffixless names, duplicate-open refusal, sole native overwrite confirmation, post-confirmation target drift, target-reservation release, stable-identity path adoption, and revision-bound mixed-ending authorization in `internal/appmodel/save.go`, `internal/appmodel/save_test.go`, `internal/application/document_dialogs.go`, `internal/application/document_dialogs_test.go`, `internal/appmodel/handler.go`, `internal/appmodel/handler_test.go`, `internal/apperr/results.go`, `main.go`, and `main_test.go`. Save As MUST capture the target disk version **and raw-byte hash** after native confirmation and recheck **both** immediately before atomic replacement; a target created after an absent-target selection, a changed version, or a changed raw-byte hash aborts with a classified `conflict` error, **no second overwrite prompt**, and no write, path adoption, or other document mutation. **The process-local target reservation MUST be released on every terminal outcome** (commit, cancellation, refusal, or failure).
  - **Outcome**: All explicit and future automatic/close writes enter the same coordinator; cancellation or invalid authorization performs no disk/model mutation; only a committed Save As adopts the path; no reservation leaks past a terminal outcome.
  - **Prerequisites**: T013.
  - **Primary ownership**: FR-FT-011–013; closes EC-02 and EC-08.
  - **Tests/evidence**: `go test -race ./internal/appmodel ./internal/application . -run 'TestSaveAndSaveAs|TestMixedEndingAuthorization|TestSaveAsCollisionAndTargetDrift|TestSaveAsRawByteHashRecheck|TestSaveAsTargetReservationReleasedOnEveryTerminalOutcome|TestAppModelHandlerIsBoundAndGenerated'`; `just gen`; `just gen-check`; real native cancellation/overwrite evidence under `specs/003-real-files-and-tabs/evidence/ft-vs-02/save-as/`.
  - **Branch/commit**: `feature/v1-implementation--003-t014-save-as`; `feat(files): add safe Save and Save As`.

- [X] T015 [US1] Operate Save/Save As through real adapter/actions and render exact status/notification outcomes in `frontend/src/logic/adapter/services.ts`, `frontend/src/logic/adapter/services.test.ts`, `frontend/src/logic/actions/actionRegistry.ts`, `frontend/src/logic/actions/actionRegistry.test.ts`, `frontend/src/logic/actions/actionDispatcher.ts`, `frontend/src/logic/actions/actionDispatcher.test.ts`, `frontend/src/ui/widgets/NormalizationPrompt.tsx`, `frontend/src/ui/widgets/NormalizationPrompt.test.tsx`, `frontend/src/dev/bridge-mock/go/appmodel/AppModelHandler.ts`, `frontend/src/dev/bridge-mock/appModel.test.ts`, `frontend/src/logic/store/notificationsSlice.ts`, `frontend/src/logic/store/notificationsSlice.test.ts`, `frontend/src/ui/components/StatusBar.tsx`, `frontend/src/ui/components/StatusBar.test.tsx`, `frontend/src/ui/primitives/Toast.tsx`, `frontend/src/ui/primitives/Toast.test.tsx`, `frontend/src/ui/widgets/ShellMenuRow.tsx`, `frontend/src/ui/widgets/ShellMenuRow.test.tsx`, `frontend/src/i18n/locales/en.json`, and `frontend/e2e/real-files-and-tabs.test.ts`. The normalization modal MUST be titled `Normalize line endings?`, name the safe filename, show the proposed LF or CRLF result, explain that the write converts every line ending, and offer `Normalize and save` followed by `Cancel` with **Cancel initially focused**, Escape/backdrop equal to Cancel, and **no persistent suppression choice**.
  - **Outcome**: Explicit Save flushes first, reports exactly one localized safe confirmation, automatic success remains unavailable/silent, repeated failures count in one notification, read-only writes reject before disk access, and confirmation resumes the exact suspended write kind and revision without another Save.
  - **Prerequisites**: T014.
  - **Primary ownership**: FR-FT-015 and primary proof for SC-FT-001; supporting proof for FR-FT-008–014/016.
  - **Tests/evidence**: `npm --prefix frontend test -- --runInBand` with named suites `Save reports exactly one confirmation`, `repeated failures update one notification with a count`, and `Normalize line endings prompt focus and resumption`; `npm --prefix frontend run verify:ui -- e2e/real-files-and-tabs.test.ts --grep 'FT-VS-02'`; real immediate-save byte/mode/failure inspection under `specs/003-real-files-and-tabs/evidence/ft-vs-02/`; `just archtest`.
  - **Branch/commit**: `feature/v1-implementation--003-t015-save-ui-proof`; `feat(files): expose truthful save outcomes`.

**Checkpoint**: FT-VS-01 plus FT-VS-02 is the MVP for US1: one existing supported file can open, edit, and save
safely. Do not start FT-VS-03 until the complete slice and SC-FT-001 evidence pass.

---

## Phase 4: FT-VS-03 — Revision-safe real tabs and activation-scoped Monaco sessions

**Goal**: Deliver real projected tabs without cross-document source, session, or stale-command leakage, including
reorder and hostile-safe labels. This slice owns FR-FT-029–033 and FR-FT-035–037 exactly once.

**Independent test**: Switch repeatedly among 40 distinct documents and identical basenames with identical parents;
preserve view state; reject failed/stale transitions; prove fresh model/token and lost cross-switch undo;
drag-reorder and cancel; **move tabs by menu and by `Ctrl/Cmd+Shift+PageUp/PageDown` and confirm the edge no-op and
the announcement**; render hostile control/bidi names safely; and keep overflow inside the strip.

- [X] T016 [US3] Implement backend tab activation, reorder, tab-set revision checks, per-document view state, adjacent/final close transitions, and identity/revision-bound active-buffer acknowledgements in `internal/appmodel/tab_session.go`, `internal/appmodel/tab_session_test.go`, `internal/appmodel/tab_reorder.go`, `internal/appmodel/tab_reorder_test.go`, `internal/appmodel/model.go`, `internal/appmodel/service.go`, `internal/appmodel/handler.go`, `internal/appmodel/handler_test.go`, and `internal/apperr/results.go`. Reorder MUST support **moving a targeted or active tab exactly one position left or right**, keeping the document active when it was active, changing the order **only after backend confirmation**, and treating a **move past either edge as a successful no-op that does not increment the tab-set revision**. Also add the injected clipboard-write and reveal ports plus their appmodel commands in `internal/file/clipboard.go`, `internal/file/clipboard_test.go`, `internal/file/reveal.go`, `internal/file/reveal_unix.go`, `internal/file/reveal_windows.go`, `internal/file/reveal_test.go`, `internal/appmodel/copy_path.go`, and `internal/appmodel/copy_path_test.go`: `CopyPath(documentId)` resolves the canonical path (refusing untitled, succeeding for a detached document) and returns a `ClassifiedError` of category `system-command-failure` on a clipboard write failure; `RevealInFileManager(documentId)` revalidates existence immediately before calling the reveal port — a known-missing document returns `unavailable` without invoking the port, a disappearance discovered only at invocation marks the document detached and returns one `not-found` `ClassifiedError`, and a port failure returns one `system-command-failure` `ClassifiedError`.
  - **Outcome**: Canonical order/active/view state changes once per effective command; stale or no-op commands have no partial effects; active reload/source crosses only the acknowledgement boundary. Copy path and Reveal classify every failure through the shared T004 `ClassifiedError` type instead of a bespoke error string, and existence revalidation happens once, at the appmodel layer, so `not-found` versus `system-command-failure` is decided in exactly one place.
  - **Prerequisites**: T004, T015.
  - **Primary ownership**: FR-FT-030, FR-FT-032, and FR-FT-033. Reorder-by-one plumbing here supports T018's and T030's Move tab clause ownership; Copy path/Reveal plumbing supports T018's sole ownership of FR-FT-037. This task claims neither FR-FT-034 nor FR-FT-037.
  - **Tests/evidence**: `go test -race ./internal/appmodel ./internal/file -run 'TestTabSessionOrderRevision|TestActivateDocumentAcknowledgement|TestStaleTabCommands|TestAdjacentAndFinalClose|TestMoveTabOnePositionRequiresConfirmation|TestMoveTabPastEdgeIsNoOpWithoutRevisionBump|TestCopyPathResolvesCanonicalPathAndClassifiesClipboardFailure|TestCopyPathSucceedsForDetachedDocument|TestRevealInFileManagerRevalidatesExistenceAndClassifiesFailure'`; build-tagged Unix/Windows reveal-port compile/tests; `just archtest`.
  - **Branch/commit**: `feature/v1-implementation--003-t016-tab-state`; `feat(tabs): add revision-safe backend tab state`.

- [X] T017 [US3] Make active editor sessions activation-scoped and gate every switch on the unified lifecycle flush in `frontend/src/ui/widgets/editorSession.ts`, `frontend/src/ui/widgets/editorSession.integration.test.tsx`, `frontend/src/ui/components/CodeEditor.tsx`, `frontend/src/ui/components/CodeEditor.test.tsx`, `frontend/src/logic/hooks/useLifecycleBarrier.ts`, `frontend/src/logic/hooks/useDocumentCommands.ts`, `frontend/src/logic/hooks/useDocumentCommands.test.ts`, `frontend/src/logic/adapter/appModelAdapter.ts`, and `frontend/src/logic/adapter/appModelAdapter.test.ts`.
  - **Outcome**: Each activation validates request generation/id/document/projection revision, disposes the outgoing model after flush, creates a fresh token/URI/model, retains no inactive source or undo stack, and leaves the old session installed on failure.
  - **Prerequisites**: T010, T016.
  - **Primary ownership**: FR-FT-029 and FR-FT-031; closes CP-04.
  - **Tests/evidence**: `npm --prefix frontend test -- --runInBand` with named tests `fresh activation model drops prior undo`, `failed outgoing flush keeps current session`, `late acknowledgement installs no content`, and existing Feature 002 formatting/session regression suites.
  - **Branch/commit**: `feature/v1-implementation--003-t017-activation-sessions`; `feat(editor): isolate Monaco sessions by activation`.

- [X] T018 [US3] Replace visual tab fixtures with accessible real tab/navigation/reorder/context surfaces in `frontend/src/ui/widgets/DocumentTabs.tsx`, `frontend/src/ui/widgets/DocumentTabs.module.css`, `frontend/src/ui/widgets/DocumentTabs.test.tsx`, `frontend/src/ui/widgets/TabContextMenu.tsx`, `frontend/src/ui/widgets/TabContextMenu.test.tsx`, `frontend/src/ui/widgets/tabLabel.ts`, `frontend/src/ui/widgets/tabLabel.test.ts`, `frontend/src/ui/primitives/LiveRegion.tsx`, `frontend/src/ui/primitives/LiveRegion.test.tsx`, `frontend/src/ui/widgets/EditorChrome.tsx`, `frontend/src/ui/widgets/EditorChrome.test.tsx`, `frontend/src/logic/actions/actionDispatcher.ts`, `frontend/src/logic/actions/shortcutRegistry.ts`, `frontend/src/logic/actions/shortcutRegistry.test.ts`, `frontend/src/i18n/locales/en.json`, `frontend/src/dev/bridge-mock/go/appmodel/AppModelHandler.ts`, and `frontend/e2e/real-files-and-tabs.test.ts`. Three named contracts are mandatory:
  - **Navigation**: bind next/previous to exactly `Ctrl/Cmd+Tab`/`Ctrl+PageDown` (next) and `Ctrl/Cmd+Shift+Tab`/`Ctrl+PageUp` (previous).
  - **Move tab left / Move tab right**: render both registry-derived actions in the tab context menu **after the binding's close-action group and before its path-action group**, keeping every existing action in its binding order. Each is **unavailable at its respective strip edge**. The menu items reorder **their target tab**; `Ctrl/Cmd+Shift+PageUp` and `Ctrl/Cmd+Shift+PageDown` reorder **the active tab**. Every move **waits for backend confirmation before projecting the order**, keeps the document active and current focus unchanged, and announces `Moved {filename} to position {position} of {count}` through a **polite live region** using the one-based position and total tab count.
  - **Hostile-safe disambiguated labels**: display `basename — shortest unique canonical parent suffix` using the fewest trailing parent segments that distinguish every open matching basename under host-filesystem canonical identity comparison, recomputed after open, close, or Save As — **including when identical basenames also share identical immediate parent names**. Render C0 control characters, DEL, and bidirectional-formatting controls as **visible `\uXXXX` escapes**, **directionally isolate** remaining user-supplied path text, and ensure **visual ellipsis retains part of the distinguishing suffix** while the complete disambiguated label remains the accessible name and the approved full canonical path stays in the tooltip.
  Also wire Copy path and Reveal in file manager onto T016's commands: on success, copy the canonical path and announce `Copied path for {safe filename}` in a transient polite live-region notification (Copy path) or show no toast (Reveal); render each `ClassifiedError` category (`not-found` with Save-to-recreate/Copy-path remediation, `system-command-failure` with Retry and, for Reveal, also Copy path) deduplicated per document; and on menu close, restore focus to the originating tab, else the current tab, else tab-strip New, else launcher New, with Reveal's restoration additionally waiting for the application to regain foreground focus.
  - **Outcome**: Real order, active/dirty/read-only/detached states, hostile-safe basename disambiguation, approved full-path affordances, next/previous navigation on the exact bound keys, menu and keyboard tab reordering with its announcement and edge no-op, target/active close, drag insertion/Escape/no-op/autoscroll, exact context order, contained overflow, and the complete Copy path/Reveal success/failure/notification/focus contract operate without optimistic projection or path actions on untitled documents.
  - **Prerequisites**: T016, T017.
  - **Primary ownership**: FR-FT-035–037 and primary proof for SC-FT-003; **declared clause owner of FR-FT-034's Move tab context-menu placement, edge unavailability and announcement** (T030 remains the sole FR-FT-034 owner and owns its keyboard binding); closes EC-26, EC-27, EC-28, EC-29, EC-30 and EC-31.
  - **Tests/evidence**: `npm --prefix frontend test -- --runInBand` with named tests `Move tab actions sit between close and path groups`, `Move tab is unavailable at each strip edge`, `Move tab waits for backend confirmation before projecting order`, `Move tab keeps the document active and focus unchanged`, `Move tab announces Moved {filename} to position {position} of {count}`, `edge move is a no-op without a tab-set revision change`, `identical parents extend the suffix until unique`, `control and bidirectional characters render as visible escapes`, `ellipsis retains a distinguishing suffix`, `accessible name is the complete disambiguated label`, `Copy path copies canonical path and announces notification`, `Reveal revalidates existence before invoking the OS command`, `Reveal known-missing is unavailable`, `Reveal disappearance race marks detached with deduplicated not-found error`, `clipboard and OS command failures deduplicate as system-command-failure with Retry`, and `menu close restores focus to originating tab else current tab else strip New else launcher New`; `npm --prefix frontend run verify:ui -- e2e/real-files-and-tabs.test.ts --grep 'FT-VS-03'`; retain 40-document identity stress and overflow screenshots under `specs/003-real-files-and-tabs/evidence/ft-vs-03/`; `just archtest`.
  - **Branch/commit**: `feature/v1-implementation--003-t018-real-tabs`; `feat(tabs): replace fixtures with real tab controls`.

---

## Phase 5: FT-VS-04 — External-change recovery and revision-bound authorization

**Goal**: Prevent silent overwrite after another process changes or deletes a file, with foreground-only checks and
a serialized conflict queue. This slice owns FR-FT-020–023 exactly once.

**Independent test**: Change, replace, and delete the backing file; prove the metadata-equal stable-re-read resume
and the unstable-re-read refusal; exercise Reload, one-use Keep mine, Skip, edit-while-open invalidation, second
disk change, read-only Reload-only behavior, stale acknowledgement, Save As post-confirmation drift, and **two
simultaneous conflicts resolving one modal at a time with the waiting tab visibly blocked**.

- [X] T019 [US4] Implement pre-write disk-version decisions, the stable re-read contract, foreground-only checks, the serialized conflict queue, detached/recreatable documents, bounded 12-line/4,096-byte-per-side transient previews, Reload, single-use Keep-mine authorization, Skip, and every invalidator in `internal/appmodel/conflict.go`, `internal/appmodel/conflict_test.go`, `internal/appmodel/conflict_queue.go`, `internal/appmodel/conflict_queue_test.go`, `internal/appmodel/write_coordinator.go`, `internal/appmodel/handler.go`, `internal/appmodel/handler_test.go`, `internal/file/document_reader.go`, and `internal/apperr/results.go`. Three named contracts are mandatory:
  - **Stable re-read**: a version mismatch suspends the write and performs a re-read **whose version is unchanged across classification** and whose raw-byte hash is captured with the baseline. If raw bytes, byte-order mark, line endings, and permission mode **still equal the recorded baseline**, refresh **only the disk version** and resume the suspended write. Any byte or file-characteristic difference prevents the write and opens the external-change decision. **An unstable re-read writes nothing** and retries only after a fresh foreground check. Stable Open and Reload reads likewise capture version before reading and require the same version after raw-byte classification and hashing.
  - **Foreground-only checks**: run stable version checks on **tab activation, window focus or resume, and before every write**, for path-backed documents **including read-only ones**. Introduce **no background file watcher and no polling timer**.
  - **Serialized conflict queue**: bind every conflict to document identity, canonical content revision, and detected disk version; present **one modal at a time**; **retain the current modal until it resolves or invalidates**; **visibly project every waiting document as blocked by conflict**; and select subsequent eligible decisions in **authoritative tab order**.
  - **Outcome**: No mismatch writes; Reload reclassifies atomically; Keep mine authorizes only the compared revision/version once; Skip changes nothing beyond cancelling one request; missing backing files retain path/source as dirty detached documents; simultaneous conflicts never race or stack modals.
  - **Prerequisites**: T013, T017.
  - **Primary ownership**: FR-FT-020, FR-FT-022, and FR-FT-023; closes EC-15, EC-16, EC-17 and EC-18.
  - **Tests/evidence**: `go test -race ./internal/appmodel -run 'TestExternalConflictDecision|TestStableRereadMetadataEqualResumesWrite|TestUnstableRereadWritesNothing|TestForegroundChecksOnActivationFocusAndWrite|TestNoWatcherOrPollingTimerIsRegistered|TestConflictQueueOneModalInTabOrder|TestWaitingDocumentsProjectBlockedByConflict|TestKeepMineAuthorizationInvalidation|TestSkipCancelsOneWrite|TestMissingBackingFileDetaches'`; include second-process/same/changed/deleted/read-only/second-change tables.
  - **Branch/commit**: `feature/v1-implementation--003-t019-conflict-state`; `feat(files): add revision-bound external recovery`.

- [X] T020 [US4] Add one shared accessible modal and the exact external-change comparison flow in `frontend/src/ui/primitives/ModalShell.tsx`, `frontend/src/ui/primitives/ModalShell.module.css`, `frontend/src/ui/primitives/ModalShell.test.tsx`, `frontend/src/ui/widgets/ExternalChangePrompt.tsx`, `frontend/src/ui/widgets/ExternalChangePrompt.test.tsx`, `frontend/src/ui/widgets/DocumentTabs.tsx`, `frontend/src/ui/widgets/DocumentTabs.test.tsx`, `frontend/src/logic/adapter/services.ts`, `frontend/src/logic/adapter/services.test.ts`, `frontend/src/dev/bridge-mock/go/appmodel/AppModelHandler.ts`, `frontend/src/dev/bridge-mock/appModel.test.ts`, `frontend/src/i18n/locales/en.json`, and `frontend/e2e/real-files-and-tabs.test.ts`. The editable modal MUST be titled `File changed on disk`, show the **first changed hunk** enforcing **both 12 logical lines and 4,096 UTF-8 bytes per side**, stop at whichever bound is reached first **without splitting a code point**, **visibly state when either side is truncated**, and offer `Reload from disk`, `Keep mine`, `Skip` in that order with **Skip initially focused** and Escape/backdrop equal to Skip. A **metadata-only** difference shows the differing byte-order mark, line endings or permission mode instead of an empty content comparison. A **read-only** conflict offers `Reload from disk` plus structural `Cancel` only, with **Cancel initially focused**, and offers neither Keep mine nor Skip. **Tabs whose documents are waiting in the conflict queue render the blocked-by-conflict state.**
  - **Outcome**: On disk/Yours is transient outside Redux, decisions use binding order and explained consequences, edit invalidates the decision, read-only exposes Reload plus Cancel only, waiting tabs are visibly blocked, and focus is trapped/restored with long-label/reduced-motion support; no full diff lifecycle appears.
  - **Prerequisites**: T019.
  - **Primary ownership**: FR-FT-021; supporting UI proof for FR-FT-020/022; closes EC-14.
  - **Tests/evidence**: `npm --prefix frontend test -- --runInBand` with named suites `ExternalChangePrompt decisions and invalidation`, `conflict preview enforces both 12-line and 4096-byte bounds without splitting a code point`, `truncated side is visibly identified`, `metadata-only conflict shows characteristic differences`, `read-only conflict offers Reload and Cancel only with Cancel focused`, `queued conflict tabs render blocked-by-conflict`, and `ModalShell focus contract`; `npm --prefix frontend run verify:ui -- e2e/real-files-and-tabs.test.ts --grep 'FT-VS-04'`; `just archtest`.
  - **Branch/commit**: `feature/v1-implementation--003-t020-conflict-prompt`; `feat(files): add accessible external-change decisions`.

- [X] T021 [US4] Record current-host external-writer recovery proof in `specs/003-real-files-and-tabs/evidence/ft-vs-04/walkthrough.md` and unabridged logs/artifacts under `specs/003-real-files-and-tabs/evidence/ft-vs-04/` using real files, the real bridge, and a second process/editor.
  - **Outcome**: SC-FT-006 has auditable zero-silent-overwrite evidence, with demonstrated, host-unverified, and deferred behavior separated.
  - **Prerequisites**: T020.
  - **Primary ownership**: SC-FT-006 only; no behavior ownership.
  - **Tests/evidence**: Preserve raw command/host/time/commit data for manual save, external replacement/deletion, metadata-preserving byte change, metadata-only change, Reload, Keep mine once, prompt-time edit, Skip/retry, read-only conflict, second change, two simultaneous conflicts, and Save As target drift; no mock-only substitution.
  - **Branch/commit**: `feature/v1-implementation--003-t021-conflict-evidence`; `test(evidence): prove external-change recovery`.

---

## Phase 6: FT-VS-05 — Backend autosave and explicit-write serialization

**Goal**: Save eligible existing files after a one-second pause through the same safe write coordinator, and measure
the criterion on a real build. This slice owns FR-FT-017–019 exactly once.

**Independent test**: Use fake clocks to prove debounce replacement, acknowledged on/off, no catch-up, eligibility,
conflicts/deletion, one serialized explicit overlap and silent success; then run the **harness-driven real-binary** 100-trial
measurement.

- [X] T022 [US4] Add acknowledged `FileSettings.autosave` defaulting true through the existing KV settings stack in `internal/settings/model.go`, `internal/settings/repository.go`, `internal/settings/repository_sqlite.go`, `internal/settings/repository_sqlite_test.go`, `internal/settings/service.go`, `internal/settings/service_test.go`, `internal/settings/handler.go`, `internal/settings/handler_test.go`, `frontend/src/logic/adapter/settingsTypes.ts`, `frontend/src/logic/store/settingsSlice.ts`, `frontend/src/logic/store/settingsSlice.test.ts`, `frontend/src/logic/store/settingsProjection.ts`, and `frontend/src/logic/store/settingsProjection.test.ts`.
  - **Outcome**: Autosave restores before the normal shell and reaches appmodel only after persistence acknowledgement; corrupt/unknown KV values fall back safely without a migration or read-triggered rewrite.
  - **Prerequisites**: T021.
  - **Primary ownership**: Settings infrastructure only; T023 is the sole FR-FT-017 owner.
  - **Tests/evidence**: `go test -race ./internal/settings -run 'TestAutosaveSettingDefaultAndPersistence|TestAutosaveRejectsUnacknowledgedChange'`; `npm --prefix frontend test -- --runInBand`; `just archtest`; run `just sqlc-check` only if a query actually changes.
  - **Branch/commit**: `feature/v1-implementation--003-t022-autosave-setting`; `feat(settings): persist acknowledged autosave`.

- [X] T023 [US4] Implement injected one-second per-document autosave scheduling and explicit-write coalescing in `internal/appmodel/autosave.go`, `internal/appmodel/autosave_test.go`, `internal/appmodel/write_coordinator.go`, `internal/appmodel/write_coordinator_test.go`, `internal/appmodel/service.go`, and `internal/appmodel/service_test.go`.
  - **Outcome**: Accepted content replaces its eligible timer; off cancels only not-started work without catch-up; untitled/read-only/detached files never auto-write; all automatic/manual writes serialize through the conflict/version/atomic/resync path; an overlapping explicit Save flushes and captures the latest accepted explicit revision, waits for the in-flight automatic write, **reuses that commit only when the automatic snapshot contains that same revision**, otherwise performs one serialized follow-up write, and yields exactly one explicit success only after that revision commits.
  - **Prerequisites**: T022, T019.
  - **Primary ownership**: FR-FT-017–019; closes EC-09.
  - **Tests/evidence**: `go test -race ./internal/appmodel -run 'TestAutosaveDebounceAndEligibility|TestAutosaveOffHasNoCatchUp|TestExplicitSaveSerializesWithAutosave|TestExplicitSaveReusesMatchingAutosaveCommit|TestAutosaveConflictAndDeletion'` using fake clocks and injected writers. Fake clocks are correct here and are **not** accepted as SC-FT-007 evidence.
  - **Branch/commit**: `feature/v1-implementation--003-t023-autosave-coordinator`; `feat(files): serialize backend autosave`.

- [X] T024 [US4] Expose real autosave control/status without format/lint or success toasts, and **measure SC-FT-007 on a harness-driven real current-host binary**, in `frontend/src/logic/settings/settingsCommands.ts`, `frontend/src/logic/settings/settingsCommands.test.ts`, `frontend/src/logic/actions/actionRegistry.ts`, `frontend/src/logic/actions/actionRegistry.test.ts`, `frontend/src/ui/widgets/SettingsMenu.tsx`, `frontend/src/ui/widgets/SettingsMenu.test.tsx`, `frontend/src/ui/components/StatusBar.tsx`, `frontend/src/ui/components/StatusBar.test.tsx`, `frontend/src/dev/bridge-mock/go/settings/SettingsHandler.ts`, `frontend/src/i18n/locales/en.json`, `frontend/e2e/real-files-and-tabs.test.ts`, `cmd/native-evidence/main_native_evidence.go`, `cmd/native-evidence/autosave_latency_scenario.go`, `frontend/src/logic/adapter/nativeEvidenceRuntime.ts`, and `specs/003-real-files-and-tabs/evidence/ft-vs-05/autosave-performance.md`. The measurement protocol is exact and MUST NOT be relaxed:
  - **Instrumentation.** Drive the trials through the existing native-evidence harness
    (`cmd/native-evidence/main_native_evidence.go`, build tag `native_evidence`, already consumed by T027) by adding
    one `autosave-latency` scenario beside its existing `pending-close`/`stale-close-*` scenarios. The scenario MUST
    use the harness's real `systemNativeEvidenceTimer`; `immediateNativeEvidenceTimer` would delete the one-second
    debounce from the interval and `stalledNativeEvidenceTimer` would never fire, so either substitution invalidates
    the run. `npm --prefix frontend run verify:ui` is Playwright against the dev bridge mock and **MUST NOT** be used
    for this criterion.
  - **t₀ and t₁ are single-clock Go monotonic stamps**, so the working-copy synchronization leg cannot fall outside
    the measured interval. **t₀** = the instant the harness receives the webview's acknowledgement, through
    `nativeEvidenceRuntime`, that the final input event's handler has returned for that trial's last character.
    **t₁** = the instant the appmodel write coordinator reports that atomic replacement committed **that exact
    content revision**. Both are read with `time.Now()` in the one Go process and subtracted monotonically (see the
    `pkg.go.dev/time#hdr-Monotonic_Clocks` fact check above). The interval therefore contains the 200 ms buffer
    synchronization seam, the one-second debounce, and the write itself by construction. Measuring from
    accept-content to commit — which would exclude synchronization — fails this task.
  - **Build parity and its stated limit.** Build the harness binary from the same commit and the same release
    settings as `just build`; the only permitted difference is the added scenario driver and its build tag. The
    write path (`internal/appmodel`, `internal/file`) MUST be byte-identical to the release build, with no timer,
    port, or coordinator substitution. Record the build-tag delta as a named limitation in the evidence — this
    harness is **not** the `just build` artifact, and the evidence MUST say so rather than imply it. T039
    independently spot-checks a sample of autosaves on the true `just build` binary to confirm the distribution is
    not a driver artifact; a disagreement between the two reopens this task.
  - Run **20 uncounted warmups (5 per size)** and **exactly 100 measured trials (25 per size)** for accepted revisions of exactly **1 KiB (1,024 bytes)**, **256 KiB (262,144 bytes)**, **1 MiB (1,048,576 bytes)**, and **2 MiB (2,097,152 bytes)**.
  - Each trial replaces **one character** in a clean, path-backed, writable document with autosave **on**, local temporary storage, and **no conflict**.
  - Timing is **monotonic**, starts when the **final input event completes**, and stops when **atomic replacement commits that content revision** — including working-copy synchronization and the **one-second debounce**.
  - **No retry, no outlier removal, no discarded failure.** A failed eligible write is a counted miss.
  - **At least 95 of the 100 measurements MUST be at or below 5,000 ms.**
  - Retain **all** durations, sizes, revision/commit identities, disk-byte results, **p50/p95/max**, the warmup record, and host/OS/filesystem/build metadata.
  - Successful autosaves MUST produce **zero toasts**; an overlapping explicit Save MUST produce **exactly one** success notification.
  - **Outcome**: The acknowledged setting and in-flight/dirty status are truthful at all widths; automatic success is silent; and SC-FT-007 is proven by a real-binary, real-disk, monotonic measurement rather than mock or fake-clock timing.
  - **Prerequisites**: T023.
  - **Primary ownership**: SC-FT-007; supporting proof for FR-FT-017–019; closes EC-36.
  - **Tests/evidence**: `npm --prefix frontend test -- --runInBand` with named suites `autosave setting is acknowledged before it applies`, `autosave success emits no toast`, and `dirty dot is muted only while a write is in flight`; `npm --prefix frontend run verify:ui -- e2e/real-files-and-tabs.test.ts --grep 'FT-VS-05'` for control/status wiring only; for the criterion, `just build` (parity reference) then `go run -tags native_evidence ./cmd/native-evidence -scenario autosave-latency` with named tests `TestAutosaveLatencyScenarioUsesSystemTimer` and `TestAutosaveLatencyStampsSpanSynchronizationAndDebounce`; retain the full 100-row sample table, warmup table, percentile calculation, host metadata, and the stated build-tag limitation in `specs/003-real-files-and-tabs/evidence/ft-vs-05/`.
  - **Branch/commit**: `feature/v1-implementation--003-t024-autosave-ui-proof`; `feat(files): expose and prove autosave`.

---

## Phase 7: FT-VS-06 — Transactional close plans and native shutdown

**Goal**: Account for all unsaved work before removing tabs or quitting. This slice owns FR-FT-024–027 exactly
once.

**Independent test**: Exercise clean/dirty single and multi-target closes, Save/Discard/Cancel, Save all ordering,
untitled paths, normalization/conflicts, first failure, stale plans, in-flight autosave, final zero state, repeated
native close, one-shot Quit, drain failure, shutdown ordering, and the twice-confirmed recovery quit.

- [X] T025 [US2] Implement immutable revision-aware single/multi close plans and atomic post-save removal in `internal/appmodel/close_plan.go`, `internal/appmodel/close_plan_test.go`, `internal/appmodel/tab_session.go`, `internal/appmodel/write_coordinator.go`, `internal/appmodel/handler.go`, and `internal/apperr/results.go`. A close requested while a dirty tab has an autosave scheduled or in flight MUST first flush the latest working copy and wait for the write coordinator, then **re-evaluate the committed/current revision**: a now-clean tab may close without a dirty prompt, while a newer or failed revision stays open for an explicit choice. Queued close-plan normalizations MUST resolve **one at a time in authoritative tab order** before any batch write.
  - **Outcome**: Every target/choice/path/normalization/conflict is complete before side effects; Save all runs in tab order without closing, stops on first failure with earlier saves clean and all tabs open, then removes only after total success and selects adjacent or zero state.
  - **Prerequisites**: T018, T019, T023.
  - **Primary ownership**: FR-FT-024–026; closes EC-11, EC-12, EC-13 and EC-24.
  - **Tests/evidence**: `go test -race ./internal/appmodel -run 'TestClosePlanCompletenessAndCancel|TestClosePlanSaveOrderAndFailure|TestCloseWaitsForFlushAndAutosave|TestCloseReevaluatesRevisionAfterAutosaveDrain|TestQueuedNormalizationsResolveInTabOrder|TestCloseAdjacentAndFinalZeroState'`; `just archtest`.
  - **Branch/commit**: `feature/v1-implementation--003-t025-close-plans`; `feat(files): add transactional close plans`.

- [X] T026 [US2] Render and resolve the exact single/multi close prompts through the shared modal in `frontend/src/ui/widgets/ClosePrompt.tsx`, `frontend/src/ui/widgets/ClosePrompt.test.tsx`, `frontend/src/ui/primitives/ModalShell.tsx`, `frontend/src/ui/primitives/ModalShell.test.tsx`, `frontend/src/logic/hooks/useLifecycleBarrier.ts`, `frontend/src/logic/adapter/services.ts`, `frontend/src/logic/adapter/services.test.ts`, `frontend/src/dev/bridge-mock/go/appmodel/AppModelHandler.ts`, `frontend/src/i18n/locales/en.json`, and `frontend/e2e/real-files-and-tabs.test.ts`.
  - **Outcome**: Save/Discard/Cancel and complete dirty-target Save all/Discard all/Cancel choices gather every native/normalization/conflict decision before execution; incomplete/cancelled resolution writes, discards, and closes nothing.
  - **Prerequisites**: T025.
  - **Primary ownership**: UI proof for FR-FT-024–026; no duplicate FR owner.
  - **Tests/evidence**: `npm --prefix frontend test -- --runInBand` with named suite `ClosePrompt complete-plan focus and cancellation`; `npm --prefix frontend run verify:ui -- e2e/real-files-and-tabs.test.ts --grep 'close plan'`; `just archtest`.
  - **Branch/commit**: `feature/v1-implementation--003-t026-close-prompts`; `feat(files): resolve close plans in one prompt`.

- [X] T027 [US2] Replace layout-only close handling with veto/request/one-shot-Quit/ordered-drain coordination in `internal/application/close_coordinator.go`, `internal/application/close_coordinator_test.go`, `internal/application/application_context_holder.go`, `internal/application/application_test.go`, `main.go`, `main_test.go`, `cmd/native-evidence/main_native_evidence.go`, `frontend/src/logic/adapter/nativeEvidenceRuntime.ts`, and `frontend/src/App.tsx`. A cancellation or drain failure MUST create no permit, keep the window open, and report a classified `io-failure` with Retry. **During FR-FT-016 recovery, only the twice-confirmed `Quit and discard newer unsaved changes` path may bypass successful rehydration, and it MUST still satisfy the cancellation, drain and one-use permit sequence.**
  - **Outcome**: First close is idempotently vetoed for asynchronous planning; authorized programmatic Quit consumes one permit only after editor/view/autosave/layout drains; cancel/drain failure keeps the app open; shutdown closes SQLite then logger.
  - **Prerequisites**: T026.
  - **Primary ownership**: FR-FT-027; closes CP-08.
  - **Tests/evidence**: `go test -race ./internal/application . -run 'TestNativeCloseCoordinator|TestOnBeforeCloseVetoAndOneShotPermit|TestDrainFailureCreatesNoPermit|TestRecoveryQuitStillDrainsAndPermits|TestShutdownOrder'`; `npm --prefix frontend test -- --runInBand`; `just archtest`.
  - **Branch/commit**: `feature/v1-implementation--003-t027-native-close`; `feat(lifecycle): protect native close with one-shot plans`.

- [X] T028 [US2] Record real clean/dirty tab close, Close others/right, final-tab, window-close, and quit evidence in `specs/003-real-files-and-tabs/evidence/ft-vs-06/walkthrough.md` with unabridged logs/screenshots under `specs/003-real-files-and-tabs/evidence/ft-vs-06/`.
  - **Outcome**: SC-FT-005 is proven through real controls and the real bridge, including zero-effect Cancel, ordered Save all, first failure, retry, repeated native close, and final launcher transition.
  - **Prerequisites**: T027.
  - **Primary ownership**: SC-FT-005 only.
  - **Tests/evidence**: Record host/commit/build/fixture/steps and every outcome; do not use a mock prompt or aggregate label as native-close proof.
  - **Branch/commit**: `feature/v1-implementation--003-t028-close-evidence`; `test(evidence): prove transactional close and quit`.

---

## Phase 8: FT-VS-07 — Reopen, recents, launcher, actions, identity, and status

**Goal**: Complete daily file/tab entry surfaces without activating deferred workspace behavior, with transactional
cross-instance recents. This slice owns FR-FT-034 and FR-FT-039–044 exactly once.

**Independent test**: Verify six persisted MRU paths and lazy pruning, **two instances promoting concurrently**,
40 unique recently closed entries, newest-first reopen/focus/missing/retry/fresh identity/current disk, final-tab
launcher, shortcut collisions including Move tab and Table, clean restart, and accessible responsive status details.

- [X] T029 [US5] Implement the six-entry persisted recent-file repository and 40-entry in-memory recently-closed history in `internal/appmodel/recent_files.go`, `internal/appmodel/recent_files_test.go`, `internal/appmodel/recent_files_repository.go`, `internal/appmodel/recent_files_repository_sqlite.go`, `internal/appmodel/recent_files_repository_sqlite_test.go`, `internal/appmodel/tab_session.go`, `internal/appmodel/tab_session_test.go`, and `internal/appmodel/file_lifecycle.go`. The promotion contract is exact:
  - Every successful canonical **Open/focus, explicit Save, or Save As** promotes its path in **one SQLite transaction against the latest committed list**: remove canonical duplicates, prepend the path, truncate to six, commit. **Autosave and Reload MUST NOT change recency.**
  - Across independent instances, **SQLite commit order defines global recency**. `last writer wins` means the **latest transactional promotion**, never replacement by a stale whole-list snapshot. Two instances promoting concurrently each read and update the latest committed list inside their own transaction.
  - A promotion persistence failure (busy timeout or other metadata failure) **MUST NOT roll back an already successful Open or committed document write**, MUST leave the last committed list authoritative, and MUST produce exactly **one classified `persistence-warning`** without claiming promotion success.
  - Display and explicit choice are the **only** validation points — never a background watcher or timer. Display transactionally reads the latest committed list; a missing entry found during display is removed silently through the same latest-value transaction; an explicit stale choice also shows a classified `not-found` error.
  - **Outcome**: Open/successful Save update deduplicated MRU transactionally; display/choice alone validates and prunes; close retains unique path+view but no untitled/source; reopen uses canonical Open, consumes success/missing, retains retryable failure, and reads current disk with a fresh identity.
  - **Prerequisites**: T028.
  - **Primary ownership**: FR-FT-039–040; backend support only for FR-FT-034, whose sole owner remains T030; closes EC-21, EC-22 and EC-23.
  - **Tests/evidence**: `go test -race ./internal/appmodel -run 'TestRecentFilesMRUPersistenceAndLazyPrune|TestPromotionIsLatestValueTransaction|TestTwoInstancesInterleavedPromotionFollowsCommitOrder|TestStaleSnapshotPromotionIsRejected|TestPromotionFailureEmitsPersistenceWarningWithoutRollback|TestAutosaveAndReloadDoNotChangeRecency|TestRecentlyClosedHistory|TestReopenLastFileLifecycle'`; the two-instance test MUST open two independent connections to one temporary database with WAL and the busy timeout; run `just sqlc-check` only if queries change; `just archtest`.
  - **Branch/commit**: `feature/v1-implementation--003-t029-recents-history`; `feat(files): add recents and recently closed history`.

- [X] T030 [US3] Complete canonical file/tab actions and shortcuts through typed dispatch in `frontend/src/logic/actions/actionRegistry.ts`, `frontend/src/logic/actions/actionRegistry.test.ts`, `frontend/src/logic/actions/actionDispatcher.ts`, `frontend/src/logic/actions/actionDispatcher.test.ts`, `frontend/src/logic/actions/shortcutRegistry.ts`, `frontend/src/logic/actions/shortcutRegistry.test.ts`, `frontend/src/logic/actions/useShellShortcuts.ts`, `frontend/src/logic/actions/useShellShortcuts.test.tsx`, `frontend/src/logic/adapter/services.ts`, and `frontend/src/dev/bridge-mock/go/appmodel/AppModelHandler.ts`. The complete binding inventory is exact: `Mod+W` closes the active tab; **Reopen last file** uses `Mod+Shift+Alt+T`; **Move tab left** uses `Mod+Shift+PageUp` and **Move tab right** uses `Mod+Shift+PageDown`, both acting on the **active** tab; next/previous keep `Mod+Tab`/`Ctrl+PageDown` and `Mod+Shift+Tab`/`Ctrl+PageUp`; **Table keeps `Mod+Shift+T`**; **Refresh preview has no keyboard shortcut**; and **no jump-to-tab-by-number binding exists**.
  - **Outcome**: New/Open/recent/reopen/save/Save As/target+active close/Move tab left/Move tab right/Exit and next/previous derive availability from projected capability/modal/barrier/limit/edge state, and downstream actions remain deterministic unavailable outcomes.
  - **Prerequisites**: T029.
  - **Primary ownership**: FR-FT-034 and FR-FT-041; closes CP-09 completely. Its Move tab behavior clauses are accountable to T018 (EC-27); this task owns the keyboard binding only.
  - **Tests/evidence**: `npm --prefix frontend test -- --runInBand` with named tests `shortcut registry has no duplicate binding`, `Move tab left and right bind to Mod+Shift+PageUp and Mod+Shift+PageDown`, `Table retains Mod+Shift+T`, `Reopen last file binds Mod+Shift+Alt+T`, `Refresh preview exposes no shortcut`, `no jump-to-tab-by-number binding exists`, plus exhaustive registry uniqueness, capability, modal, limit, and deferred-outcome matrices; `just archtest`.
  - **Branch/commit**: `feature/v1-implementation--003-t030-file-tab-actions`; `feat(actions): activate canonical file and tab commands`.

- [X] T031 [US5] Deliver the phase-bounded launcher, real File menu recents, identity heading, and exact responsive status detail in `frontend/src/ui/widgets/Launcher.tsx`, `frontend/src/ui/widgets/Launcher.module.css`, `frontend/src/ui/widgets/Launcher.test.tsx`, `frontend/src/ui/widgets/ShellMenuRow.tsx`, `frontend/src/ui/widgets/ShellMenuRow.test.tsx`, `frontend/src/ui/widgets/DocumentIdentity.tsx`, `frontend/src/ui/widgets/DocumentIdentity.test.tsx`, `frontend/src/ui/components/StatusBar.tsx`, `frontend/src/ui/components/StatusBar.module.css`, `frontend/src/ui/components/StatusBar.test.tsx`, `frontend/src/ui/widgets/AppShell.tsx`, `frontend/src/ui/widgets/AppShell.test.tsx`, `frontend/src/App.tsx`, `frontend/src/App.test.tsx`, and `frontend/src/i18n/locales/en.json`. The identity heading MUST show the filename, **at most one** safe parent segment even when tabs require a longer unique suffix, and the localized projection of FR-FT-014's status (`Not saved`, `Unsaved changes`, `Saved`, `Autosaved`, `Read-only`), with `Untitled` for untitled documents and `Not saved` for the empty untitled state. Full paths belong in tab tooltips and explicit Copy path/Reveal affordances, never the heading.
  - **Outcome**: Zero documents show functional New/Open/up-to-six file recents, first-run copy, unavailable Open Folder, no folders/restore; identity uses filename/optional single parent/safe status; the 28 px one-row status exposes dropped details accessibly with no page scroll.
  - **Prerequisites**: T030.
  - **Primary ownership**: FR-FT-042–044; closes EC-32.
  - **Tests/evidence**: `npm --prefix frontend test -- --runInBand` with named suites `Launcher first-run and six recent files`, `DocumentIdentity safe path display`, `DocumentIdentity renders all five status values`, `identity heading keeps at most one parent segment`, and `StatusBar responsive detail`; `just archtest`.
  - **Branch/commit**: `feature/v1-implementation--003-t031-launcher-status`; `feat(files): add recents launcher and file status`.

- [X] T032 [US5] Prove recents/reopen/launcher/status through actual controls and real cross-instance/disk behavior in `frontend/e2e/real-files-and-tabs.test.ts` and `specs/003-real-files-and-tabs/evidence/ft-vs-07/`.
  - **Outcome**: SC-FT-008 has browser and real-bridge evidence for >6 order/dedup/persistence/lazy prune/stale choice, **two real application instances sharing one settings database whose interleaved promotions follow SQLite commit order with no lost stale-snapshot update and an explicit-refresh observation**, a forced busy-timeout producing one `persistence-warning` with the prior list intact, 40-history uniqueness/consume/retry/no source/fresh identity, unavailable folder/no restore, shortcut collisions, and responsive details.
  - **Prerequisites**: T031.
  - **Primary ownership**: SC-FT-008 only.
  - **Tests/evidence**: `npm --prefix frontend run verify:ui -- e2e/real-files-and-tabs.test.ts --grep 'FT-VS-07'` for control wiring; run **two real built instances against one temporary settings database** for the cross-instance case — the mock bridge does not prove SQLite commit order; preserve real bridge/disk walkthrough, screenshots, raw output, and exit status in `specs/003-real-files-and-tabs/evidence/ft-vs-07/`.
  - **Branch/commit**: `feature/v1-implementation--003-t032-recents-evidence`; `test(evidence): prove recents launcher and reopen`.

---

## Phase 9: FT-VS-08 — Exact file-surface conformance and safeguards

**Goal**: Converge all completed real states against the immutable binding source and prove every cross-cutting
boundary across the complete finite manifest. This slice owns FR-FT-045–057 exactly once.

**Independent test**: Compare all 17 families at three widths and six palettes (**306 primary**) plus all 40 named
additional state IDs at their assigned family/width in six palettes (**240 additional**) for **546 logical cases**,
repeated three times for **exactly 1,638 comparisons**, plus every direct metric, long-label, hostile-path,
accessibility, responsive, deterministic-hash, regression, offline, actual-control, real-bridge, and current-host
separation requirement.

- [X] T033 [US5] Replace Unicode/emoji substitutes with local 15x15/1.75-stroke SVG primitives and apply exact binding tokens, metrics, palette structures, focus/states, reduced motion, long-text, pane/preview, contained-tab, menu, prompt, toast, and 28 px status styling in `frontend/src/ui/primitives/Icon.tsx`, `frontend/src/ui/primitives/Icon.test.tsx`, `frontend/src/ui/icons/file-tab-icons.svg`, `frontend/src/ui/styles/tokens.css`, `frontend/src/ui/styles/tokens.test.ts`, `frontend/src/ui/styles/base.css`, `frontend/src/ui/widgets/ShellMenuRow.module.css`, `frontend/src/ui/widgets/ShellMenuRow.test.tsx`, `frontend/src/ui/widgets/DocumentTabs.module.css`, `frontend/src/ui/widgets/DocumentTabs.test.tsx`, `frontend/src/ui/widgets/EditorChrome.module.css`, `frontend/src/ui/widgets/EditorChrome.test.tsx`, `frontend/src/ui/widgets/AppShell.module.css`, `frontend/src/ui/widgets/AppShell.test.tsx`, `frontend/src/ui/components/StatusBar.module.css`, and `frontend/src/ui/components/StatusBar.test.tsx`.
  - **Outcome**: All shared chrome matches binding metrics without generic cross-theme card geometry, page horizontal scroll, wrapped labels, grown toolbar/status, remote assets, or custom native frame; Liquid Glass, Material, and Minimal remain structurally distinct.
  - **Prerequisites**: T032.
  - **Primary ownership**: FR-FT-045–047, FR-FT-050, and FR-FT-052–053; closes CP-10 and EC-33.
  - **Tests/evidence**: `npm --prefix frontend test -- --runInBand`; exact computed-style and bounding-box component assertions; `just archtest`; retain no new literal colors or unavailable hidden lifecycle.
  - **Branch/commit**: `feature/v1-implementation--003-t033-surface-metrics`; `feat(ui): match binding metrics and palette structures`.

- [X] T034 [US5] Add the immutable dual-origin reference harness, versioned Feature 003 adapter, reviewed selector/mask manifest, readiness/freeze controls, pinned development-only PNG decoder/comparator, and failure artifact writer in `frontend/package.json`, `frontend/package-lock.json`, `frontend/playwright.config.ts`, `frontend/e2e/parity/manifest.ts`, `frontend/e2e/parity/manifest.test.ts`, `frontend/e2e/parity/reference-server.ts`, `frontend/e2e/parity/reference-adapter.ts`, `frontend/e2e/parity/reference-adapter.test.ts`, `frontend/e2e/parity/comparator.ts`, `frontend/e2e/parity/comparator.test.ts`, and `frontend/e2e/parity/readiness.ts`. The manifest MUST encode and self-assert the exact arithmetic: **17 families × 3 widths × 6 palettes = 306 primary keys**; **40 additional state IDs × 6 palettes at each ID's assigned family and width = 240 additional keys**; **306 + 240 = 546 logical manifest keys**; and **3 deterministic repetitions × 546 = exactly 1,638 comparisons that create no additional manifest keys**. Duplicate, missing, extra, or multiply counted keys MUST fail the manifest test, and **a single capture MUST NOT satisfy two state IDs merely because both happen to be visible**.
  - **Outcome**: The unchanged binding mockup and app run concurrently at identical logical conditions; only explicit file-only/File/conflict/Move-tab variants are adapted; dynamic pixels freeze first; masks default empty and cannot conceal geometry/text/icon/focus/state; zero tolerance is explicit.
  - **Prerequisites**: T033.
  - **Primary ownership**: FR-FT-054 and FR-FT-056; closes CP-11 and EC-34. Its manifest tests also mechanically assert EC-36's visual half, which stays accountable to T024.
  - **Tests/evidence**: `npm --prefix frontend test -- --runInBand` with named tests `manifest contains exactly 306 primary keys`, `manifest contains exactly 240 additional keys across 40 state IDs`, `manifest contains exactly 546 logical keys`, `three repetitions execute exactly 1638 comparisons without new keys`, `each additional state ID uses its assigned family and width`, `no capture satisfies two state IDs`, `reference adapter hash is stable and bounded`, and `zero-tolerance comparator retains triplets`; dependency must be pinned and absent from production bundles.
  - **Branch/commit**: `feature/v1-implementation--003-t034-parity-harness`; `test(ui): add immutable zero-tolerance parity harness`.

- [ ] T035 [US5] Execute and enforce the **complete 546-case matrix** — 306 primary family/width/palette pairs **plus all 240 additional named-state pairs** — and all direct metrics in `frontend/e2e/real-files-parity.test.ts`, `frontend/e2e/parity/manifest.ts`, and `specs/003-real-files-and-tabs/evidence/ft-vs-08/parity/`. Every one of the 40 additional state IDs (`tab-active`, `tab-inactive`, `tab-dirty`, `tab-autosave-in-flight`, `tab-read-only`, `tab-detached`, `tab-blocked-conflict`, `tab-identical-basename`, `tab-adjacent-after-close`, `tab-contained-overflow`, `tab-40-document`, `identity-not-saved`, `status-saved`, `status-autosaved`, `status-unsaved-changes`, `status-read-only`, `status-mixed-ending`, `status-large-file`, `launcher-first-run`, `launcher-six-file`, `control-enabled`, `control-checked`, `control-selected`, `control-focused`, `control-hovered`, `control-unavailable`, `tab-menu-move-left-unavailable`, `tab-menu-move-right-unavailable`, `label-short`, `label-long-localized`, `path-hostile-disambiguated`, `preview-paused`, `preview-refreshing`, `preview-refresh-failed`, `prompt-normalization`, `conflict-content-truncated`, `conflict-metadata-only`, `conflict-read-only`, `resync-recovery`, `quit-discard-newer`) MUST run once in each of the six palettes at its assigned family and width.
  - **Outcome**: All 546 logical cases have reviewed region mapping, zero unexplained changed pixels, exact bounds/styles, three identical unchanged hashes across exactly 1,638 comparisons, and retained reference/actual/diff/JSON/source-hash/raw-status artifacts on failure.
  - **Prerequisites**: T034.
  - **Primary ownership**: FR-FT-051 and FR-FT-055; primary proof for SC-FT-009 and SC-FT-012.
  - **Tests/evidence**: `npm --prefix frontend run verify:ui -- e2e/real-files-parity.test.ts` run **unrestricted** (no `--grep` narrowing); inspect the 546-entry manifest report, the per-state-ID coverage table, and the three-run hash report; any unexplained drift, missing state ID, or comparison count other than 1,638 keeps T035 open.
  - **Branch/commit**: `feature/v1-implementation--003-t035-full-parity`; `test(ui): prove all 546 binding comparisons`.

- [ ] T036 [US5] Run every unaffected Feature 001/002 visual, focus, action, editor-session, responsive, and native-shell regression and prove baseline provenance in `frontend/e2e/real-files-parity.test.ts`, `frontend/e2e/real-files-and-tabs.test.ts`, `frontend/e2e/window-shell.test.ts`, `frontend/e2e/core-editor.test.ts`, `frontend/e2e/editor-stage.test.ts`, `frontend/e2e/appearance.test.ts`, and `specs/003-real-files-and-tabs/evidence/ft-vs-08/regressions/`.
  - **Outcome**: Every approved changed baseline maps to one Feature 003 FR; unexplained drift, reference replacement, wider mask/tolerance, skipped/narrowed cases, deferred surfaces, or broken consumed behavior prevents completion.
  - **Prerequisites**: T035.
  - **Primary ownership**: FR-FT-057 and primary proof for SC-FT-013; closes EC-35.
  - **Tests/evidence**: Run the named E2E files unrestricted; preserve baseline-change ownership and unchanged-baseline disposition in `specs/003-real-files-and-tabs/evidence/ft-vs-08/regressions/baseline-provenance.md`.
  - **Branch/commit**: `feature/v1-implementation--003-t036-regression-parity`; `test(ui): preserve consumed visual and behavior baselines`.

- [ ] T037 [US5] Prove actual-control accessibility/responsiveness, real-bridge separation, five continuous minutes of denied/logged outbound requests, and every deferred boundary in `frontend/e2e/real-files-and-tabs.test.ts`, `frontend/e2e/helpers/shell-observation.ts`, `frontend/scripts/check-production-network.mjs`, and `specs/003-real-files-and-tabs/evidence/ft-vs-08/offline-and-controls/`.
  - **Outcome**: Pointer/keyboard/focus/long-label/hostile-label/reduced-motion operation works at all widths/palettes; no background HTTP/HTTPS/WebSocket/telemetry/update traffic or hidden workspace/packaging/rich-rendering/search/tidy/export/tab-group/session-recovery/Assistant behavior occurs; host renderer evidence never waives same-browser drift.
  - **Prerequisites**: T036.
  - **Primary ownership**: FR-FT-048–049 and primary proof for SC-FT-010.
  - **Tests/evidence**: `npm --prefix frontend run verify:ui -- e2e/real-files-and-tabs.test.ts`; `npm --prefix frontend run build`; preserve five-minute request-denial raw log, actual-control traces, real-bridge notes, and separately classified host screenshots.
  - **Branch/commit**: `feature/v1-implementation--003-t037-offline-controls`; `test(evidence): prove offline controls and deferred boundaries`.

---

## Phase 10: FT-EV-09 — Full implementation and current-host release evidence

**Purpose**: Evidence only. This phase owns no feature behavior; it owns SC-FT-002 and SC-FT-011 and confirms every
earlier SC without replacing its primary proof.

- [ ] T038 Run and preserve the complete unrestricted release gate stack in `specs/003-real-files-and-tabs/evidence/ft-ev-09/gates/`: `just gen-check`, `just archtest`, `go test -race ./internal/appmodel ./internal/file ./internal/application ./internal/settings`, `npm --prefix frontend test -- --runInBand`, `just e2e-test`, `just verify 003-real-files-and-tabs`, `just check`, and `just build`.
  - **Outcome**: Every raw log and exit status is retained and inspected; the latest full run is authoritative; generator drift, `UNRELIABLE` analysis, architecture red, focused/full mismatch, or any E2E failure keeps the feature open.
  - **Prerequisites**: T037 and every earlier task's named evidence.
  - **Primary ownership**: Aggregate confirmation only; no FR/SC takeover.
  - **Tests/evidence**: Store unabridged outputs, exit codes, commit/host/tool versions, start/end times, and named-test inspection in `specs/003-real-files-and-tabs/evidence/ft-ev-09/gates/`; do not run `just package`.
  - **Branch/commit**: `feature/v1-implementation--003-t038-release-gates`; `test(evidence): retain Feature 003 release gates`.

- [ ] T039 Walk the freshly built current-host Wails application and reconcile all requirement owners in `specs/003-real-files-and-tabs/evidence/ft-ev-09/current-host-walkthrough.md`, `specs/003-real-files-and-tabs/evidence/ft-ev-09/coverage-ledger.md`, `specs/003-real-files-and-tabs/evidence/ft-ev-09/sc-ft-002/`, and retained media/raw artifacts beside them.
  - **Outcome**: SC-FT-002 is proven with two fixed fixtures rather than an informal timed click-through — Fixture A: new untitled document, one typed line, Save As into a fresh empty directory; Fixture B: pre-existing 1 KiB fixture file, one character edited, explicit Save. Each is timed from the moment the launcher/application becomes ready for input to the moment the explicit-save confirmation (FR-FT-015) is observed, never a click. A non-recursive directory listing of only the target file's immediate parent directory is taken immediately before and immediately after that confirmation; the only permitted diff is the target file itself, and the FR-FT-009 atomic-replace temporary file must already be gone from the after-listing. Both timings and both listing pairs are retained as evidence. The full SC-FT-011 walk separately proves real Open/Save/bytes/modes/tabs/close/conflict/autosave behavior and the exact **10,485,760 / 10,485,761 / 52,428,800 / 52,428,801-byte** and 40-document boundaries, distinguishes demonstrated/deferred/host-unverified results, **spot-checks a sample of autosaves on this true `just build` binary and compares the distribution with T024's harness run, without taking ownership from T024 — a disagreement reopens T024**, and confirms **57 FRs, 13 SCs, 14 clarified clauses, 11 current problems, 36 edge cases**, and all deferrals exactly once.
  - **Prerequisites**: T038.
  - **Primary ownership**: SC-FT-002 and SC-FT-011.
  - **Tests/evidence**: Launch only the fresh `just build` output; use real controls/files/native dialogs; record same-browser versus host-renderer evidence separately; inspect every owning task's named tests; retain both SC-FT-002 fixture timings and both before/after directory listings in `specs/003-real-files-and-tabs/evidence/ft-ev-09/sc-ft-002/`; do not infer unrun Windows/Linux/macOS-host proof and do not run `just package`.
  - **Branch/commit**: `feature/v1-implementation--003-t039-current-host`; `test(evidence): complete Feature 003 current-host proof`.

---

## One-time ownership ledgers

### Functional requirements and success criteria

| Plan anchor | Primary task owners | Functional requirements owned once | Success criteria owned once |
|---|---|---|---|
| FT-VS-01 | T004–T009 | FR-FT-001–007, FR-FT-028, FR-FT-038 | SC-FT-004 size/40 inputs |
| FT-VS-02 | T010–T015 | FR-FT-008–016 | SC-FT-001 |
| FT-VS-03 | T016–T018 | FR-FT-029–033, FR-FT-035–037 | SC-FT-003 |
| FT-VS-04 | T019–T021 | FR-FT-020–023 | SC-FT-006 |
| FT-VS-05 | T022–T024 | FR-FT-017–019 | SC-FT-007 |
| FT-VS-06 | T025–T028 | FR-FT-024–027 | SC-FT-005 |
| FT-VS-07 | T029–T032 | FR-FT-034, FR-FT-039–044 | SC-FT-008 |
| FT-VS-08 | T033–T037 | FR-FT-045–057 | SC-FT-009, SC-FT-010, SC-FT-012, SC-FT-013 |
| FT-EV-09 | T038–T039 | No behavior | SC-FT-002, SC-FT-011 |

Coverage arithmetic: 57 of 57 FRs are primary-owned once and 13 of 13 SCs are primary-proved once. A supporting
test, a declared clause owner, or a later aggregate confirmation does not become a second owner.

### Clarified clauses

FR-number ownership cannot detect a clause added by clarification that no task implements. Each clause below is a
clarification outcome with its own named test; a clause owner is **not** a second FR owner.

| ID | Clarified clause | Inside | Clause owner | Named-test anchor |
|---|---|---|---|---|
| CL-01 | Exact-inclusive MiB boundaries; 52,428,801-byte read cap | FR-FT-005, SC-FT-004 | T003, T005 | `TestReadClassifiedDocument` size rows |
| CL-02 | `none` writable; lone CR read-only; NEL/U+2028/U+2029 ordinary | FR-FT-007 | T003, T005, T011 | `TestLineEndingClassification` |
| CL-03 | Refresh preview: registry-derived, no shortcut, one revision, coalesced | FR-FT-005 | T009 | `Refresh preview renders one accepted revision and coalesces duplicates` |
| CL-04 | Identity reservation, pending slots, concurrent join, release | FR-FT-004, 013, 038 | T007, T014 | `TestIdentityReservationLifecycle` |
| CL-05 | Two-phase Open: select → prepare → flush → revalidate → one transition | FR-FT-004 | T007 | `TestOpenSelectionPerformsNoMutationBeforeFlush` |
| CL-06 | Five-value status precedence and per-baseline originating kind | FR-FT-014 | T013, T031 | `TestSaveStatusPrecedenceTable` |
| CL-07 | Rehydrate at 250 ms and 1 s; persistent Retry; twice-confirmed discard-quit | FR-FT-016, 027 | T013, T027 | `TestResyncRetriesAt250msAndOneSecond` |
| CL-08 | Stable re-read: metadata-equal resume; unstable re-read writes nothing | FR-FT-020 | T019 | `TestStableRereadMetadataEqualResumesWrite` |
| CL-09 | Foreground-only checks; one modal at a time; waiting tabs blocked | FR-FT-020, 021 | T019, T020 | `TestConflictQueueOneModalInTabOrder` |
| CL-10 | Move tab: menu placement, edge unavailability, announcement | FR-FT-034, 037 | T016, T018 | `Move tab announces Moved {filename} to position {position} of {count}` |
| CL-11 | Move tab keyboard binding `Mod+Shift+PageUp/PageDown` | FR-FT-034 | T030 | `Move tab left and right bind to Mod+Shift+PageUp and Mod+Shift+PageDown` |
| CL-12 | `\uXXXX` escaping, directional isolation, ellipsis keeps suffix | FR-FT-035 | T003, T018 | `control and bidirectional characters render as visible escapes` |
| CL-13 | Two-instance transactional promotion; commit order; `persistence-warning` | FR-FT-039, SC-FT-008 | T029, T032 | `TestTwoInstancesInterleavedPromotionFollowsCommitOrder` |
| CL-14 | 306 + 240 = 546 cases; 3 × 546 = 1,638 comparisons; no extra keys; harness-driven SC-FT-007 | FR-FT-051, 054, SC-FT-007/009/012 | T024, T034, T035 | `manifest contains exactly 546 logical keys` |

### Current source problems

| ID | Current problem | Accountable closure task | Supporting consumers |
|---|---|---|---|
| CP-01 | `GetState` requires/dereferences an active document | T004 | T031 final zero launcher |
| CP-02 | Adapter retains one patch disposer/subscriber | T004 | T013 projection barrier |
| CP-03 | Dev bridge dirty truth differs from disk-baseline semantics | T013 | T009 ingress parity |
| CP-04 | Stable document URI can recover cached Monaco model/undo | T017 | T018 tab journeys |
| CP-05 | Buffer/view queues flush separately or fire-and-forget | T010 | T017 switch, T025 close |
| CP-06 | Fire-and-forget patch publication rolls back incorrectly after disk commit | T013 | T015 UI proof, T038 gates |
| CP-07 | Plain rename cannot prove Windows replace-existing atomicity | T012 | T038 cross-platform inspection |
| CP-08 | Native close drains layout only | T027 | T028 real close proof |
| CP-09 | File/tabs are fixtures and actions infer capability from buffer presence | T030 | T009/T015/T018 incremental surfaces |
| CP-10 | Unicode icons and wrapping/min-height status violate binding metrics | T033 | T035 exact parity |
| CP-11 | Browser suite is mock-only and lacks live binding comparison | T034 | T035–T039 evidence |

### Edge cases

The specification contains **36** edge cases. `EC-nn` corresponds to the **n-th top-level bullet** under
`### Edge Cases` in `spec.md`, in that order. Each row has exactly one accountable task.

| ID | Spec edge case | Accountable task |
|---|---|---|
| EC-01 | Open cancellation creates no document, tab, notification, or recent entry | T008 |
| EC-02 | Unsupported Save As suffix refuses before any write; a suffixless name gains `.md` | T014 |
| EC-03 | Invalid UTF-8/NUL opens tolerant read-only; edit/format/lint/Save/Save As/autosave unavailable; original bytes never rewritten | T005 |
| EC-04 | 10,485,761–52,428,800 read-only with a banner; 52,428,801+ refused before partial loading; classification reads at most 52,428,801; exactly 10,485,760 stays writable | T005 |
| EC-05 | `none` stays writable and gains no terminator; an inserted break is LF; a lone ASCII CR warns read-only; NEL/U+2028/U+2029 stay ordinary content | T005 |
| EC-06 | Above 2,097,152 bytes preview pauses; Refresh preview renders only the current accepted revision; the next accepted edit above the bound re-pauses; failure keeps it paused with `io-failure` and Retry | T009 |
| EC-07 | Open replaces only the sole unchanged empty untitled tab, never a non-empty untitled document | T007 |
| EC-08 | Mixed endings warn before first write; dominant ending, first-encountered on a tie; single-use confirmation bound to revision and normalization; Cancel resumes nothing | T014 |
| EC-09 | Explicit Save overlapping autosave flushes, waits, reuses the commit only on revision match, else one serialized follow-up; exactly one explicit success | T023 |
| EC-10 | Committed disk replacement survives projection failure without replay or rollback; resync immediately, then at 250 ms and one second; exhaustion shows the persistent recovery surface | T013 |
| EC-11 | Close during a scheduled/in-flight autosave flushes and waits, then re-evaluates the revision: now-clean may close silently, newer or failed stays open | T025 |
| EC-12 | Multi-close with an incomplete choice set, cancelled Save As, missing normalization, or conflict cancellation saves, discards and closes nothing | T025 |
| EC-13 | Save all runs in tab order without closing; first failure stops the batch, earlier saves stay clean, every tab stays open, retry needs a fresh plan | T025 |
| EC-14 | Content-difference preview shows the first changed hunk under both the 12-line and 4,096-byte bounds without splitting a code point, visibly marks each truncated side, and a read-only conflict offers Reload from disk plus structural Cancel only (a metadata-only difference shows the differing characteristics instead of an empty comparison) | T020 |
| EC-15 | Editing Yours invalidates the comparison and any pending Keep-mine decision | T019 |
| EC-16 | Disk-version mismatch performs a stable re-read; metadata equality refreshes only the version and resumes the write; any difference blocks it; an unstable re-read writes nothing | T019 |
| EC-17 | Activation/focus/resume run foreground checks; the current modal stays stable, other affected tabs remain visibly blocked by conflict, decisions continue one at a time in tab order | T019 |
| EC-18 | Skip cancels only the current write attempt, changes neither side, keeps the document modified, grants no authorization, and requires a fresh check next time | T019 |
| EC-19 | At 40 documents a distinct 41st New/Open/recent/reopen is refused with a message naming the limit and no partial state change; an already-open identity focuses and consumes a reopen entry | T007 |
| EC-20 | Open selects without mutation, canonicalizes and deduplicates, checks capacity only if inserting, flushes the outgoing session, then revalidates revision and reservation for one transition | T007 |
| EC-21 | Recently closed keeps at most 40 unique path-backed entries; no untitled documents or source; reopening reads current disk content, not discarded edits | T029 |
| EC-22 | Reopen consumes an entry on open or focus; a missing path is removed with `not-found`; another failure stays retryable; repeats continue newest-first | T029 |
| EC-23 | Two instances promote concurrently in one transaction each; commit order decides recency; a busy timeout leaves the prior list intact, rolls back no file operation, and warns instead of falsely promoting | T029 |
| EC-24 | Closing the active tab selects an adjacent tab and restores its state; the final close clears active document and active buffer together | T025 |
| EC-25 | A revision-N write records its baseline origin, but an accepted N+1 keeps `Unsaved changes`; returning to the baseline restores its origin's clean label; a failed write never changes status; read-only wins over every write-origin label | T013 |
| EC-26 | Identical parents extend the canonical suffix until unique and recompute after open/close/Save As; C0/DEL/bidi controls render as `\uXXXX` escapes; text is directionally isolated; ellipsis keeps a distinguishing suffix; the full label stays the accessible name | T018 |
| EC-27 | Keyboard Move tab keeps the active document and focus unchanged, waits for backend confirmation before projecting order, and announces filename plus one-based position of the count; an edge move changes no order or revision | T018 |
| EC-28 | Revealing or copying the path of an untitled document is unavailable until it has a path | T018 |
| EC-29 | Copy path succeeds for a detached document; Reveal is unavailable when already known missing; a disappearance race marks the document detached with one `not-found` offering Save to recreate and Copy path | T018 |
| EC-30 | Clipboard or OS command failure reports one deduplicated `system-command-failure` naming only the safe filename, incrementing one notification's count; Reveal failure also offers Copy path | T018 |
| EC-31 | Tab context menu close restores focus without activating another document: originating tab, else current tab, else strip New, else launcher New; a successful Reveal waits for foreground focus | T018 |
| EC-32 | Launch restores no tab set, working copy, or prior document content | T031 |
| EC-33 | Obsolete custom titlebar, populated workspace, Assistant, provider and rich-rendering regions are excluded rather than reproduced, while the webview-owned chrome stays in scope | T033 |
| EC-34 | A dynamic pixel is frozen before capture; a mask is permitted only when freezing is impossible, is the smallest reviewed rectangle, and hides no geometry, text, icon, focus or state | T034 |
| EC-35 | A proposed baseline update with an unexplained difference is rejected; every accepted change maps to an explicit Feature 003 requirement and preserves unaffected Feature 001/002 baselines | T036 |
| EC-36 | Performance evidence discards no slow or failed eligible autosave, never restarts its timer after synchronization, and never substitutes fake-clock or mock results for final-input-to-real-commit timing; the visual half — one capture never counting as two state IDs, three repetitions never becoming manifest cases — is mechanically asserted by T034's manifest tests | T024 |

### Explicit deferrals and negative proof

| Deferred boundary | Visible/behavior owner | Aggregate negative proof |
|---|---|---|
| Open Folder, recent folders, workspace enumeration/tree/state | T031 unavailable launcher/File states | T037, T039 |
| Drag/drop, OS associations/desktop-open forwarding, single-instance forwarding | None; canonical `OpenPath` only | T037, T039 |
| Packaging | None; `just package` intentionally excluded | T038, T039 |
| Export/PDF and renderer expansion, remote assets, math, Mermaid, plugins | T030 unavailable action; existing viewer consumed; T009 Refresh preview expands nothing | T036–T039 |
| Full tidy/diff navigation, search, problems, document format/compact/lint | T020 bounded inline preview; T030 deterministic unavailable | T037, T039 |
| Tab groups, split tab panes, pinning, detachable tabs, by-number bindings | T018/T030 absence | T036–T039 |
| Session restore, crash recovery, swap files, persisted recently-closed source | T029/T031 explicit no-restore/no-source | T037, T039 |
| Assistant/provider behavior, telemetry, update checks, background network | Existing unavailable controls only | T037 five-minute observation, T039 |
| Background file watcher or polling timer for disk/recents | T019/T029 foreground-only checks | T037, T039 |
| New Window and every downstream File action not owned here | T030 deterministic unavailable | T037, T039 |
| Custom webview native chrome | T033 preserves ordinary OS frame | T035–T039 |

---

## Dependencies and execution order

```text
T001 baseline routing -> T002 trustworthy baseline -> T003 fixtures
  -> FT-VS-01 (T004–T009)
  -> FT-VS-02 (T010–T015)
  -> FT-VS-03 (T016–T018)
  -> FT-VS-04 (T019–T021)
  -> FT-VS-05 (T022–T024)
  -> FT-VS-06 (T025–T028)
  -> FT-VS-07 (T029–T032)
  -> FT-VS-08 (T033–T037)
  -> FT-EV-09 (T038–T039)
```

- The completion/merge order above is strict. No behavior-bearing task may bypass an incomplete prior slice.
- T003 is the only marked parallel opportunity: isolated fixture preparation after the baseline. Within later
  tasks, subtests may run concurrently only when they do not mutate shared files/state; this does not relax task
  prerequisites or merge order.
- A task is not complete until its named test/evidence is inspected, task-appropriate architecture/generator gate
  passes, its bounded live UI check is performed when visible behavior changed, and its one commit is merged.
- A red gate caused twice by the same issue stops advancement and reports the exact raw evidence. An `UNRELIABLE`
  gate stops immediately.
- T024 and T032 run a `just build` binary inside their slice. That is deliberate: their criteria are disk-timing
  and cross-instance facts the mock bridge cannot establish. It does not move them into Phase 10.

## Parallel execution example

After T002 is confirmed reliable, T003 may be prepared independently while the orchestrator reviews T004's
existing zero-state contracts. T003 must merge before T005 consumes its fixtures. No FT-VS-02 work may start while
any FT-VS-01 task remains incomplete.

## Implementation strategy

### MVP first

1. Complete T001–T003.
2. Complete all of FT-VS-01 (T004–T009).
3. Complete all of FT-VS-02 (T010–T015).
4. Stop and independently demonstrate US1: open one existing supported file, edit, immediately Save, and inspect
   bytes/mode plus the failure-preservation path. This is the smallest trustworthy MVP.

### Incremental delivery

1. Add FT-VS-03 for identity-safe multi-document tabs with reorder and hostile-safe labels.
2. Add FT-VS-04 and FT-VS-05 for explicit external recovery and measured autosave.
3. Add FT-VS-06 for lossless close/shutdown.
4. Add FT-VS-07 for recents/reopen/launcher and completed canonical surfaces.
5. Finish FT-VS-08 exact conformance, then FT-EV-09 release evidence.

## Format validation

- Every implementation entry starts with `- [ ] TNNN`, uses `[P]` only for the one truly independent fixture
  task, and uses exactly one `[US1]`–`[US5]` label for story-bearing tasks.
- Every task states one bounded outcome, exact repository paths, prerequisite task IDs, named tests/evidence,
  and one task branch/Conventional Commit scope.
- FR-FT-001–057, SC-FT-001–013, CL-01–14, CP-01–11, EC-01–36, and every deferral above remain primary-owned
  exactly once.
- Every size threshold is written as an exact byte count, never as decimal MB.
- `docs/delivery/` stays read-only; generated bindings/database files are never hand-edited; `just package` is
  not run or claimed.

## Phase 11: Convergence — Session 2026-08-09 production parity decisions

**Purpose**: Implement the four approved decisions recorded in the 2026-08-09 clarification session and close the
gaps found by the read-only convergence review. This section is append-only so the historical T035–T039 task text and
its evidence history remain intact.

**Dependency note**: T040–T043 are prerequisite remediation for the still-open T035 matrix execution. They MUST be
implemented and verified before T035 is rerun, even though this append-only convergence phase follows the historical
FT-VS-08 task entries. No mockup, reference image, comparator tolerance, or mask may be changed to avoid the work.

**Clarification ownership addendum**: The four new decisions are CL-15 (production UI is the parity target), CL-16
(top-row identity, overlay divider, and bottom status placement), CL-17 (empty workspace frame with zero-width deferred
Assistant), and CL-18 (unchanged normal startup with a parity-only fixture). T040–T043 provide their implementation
and proving evidence; the authoritative clarified-clause count is now 18, superseding the historical aggregate phrase
in T039 without rewriting that task.

- [X] T040 [US5] Converge the production application shell to the binding mockup's in-scope geometry while preserving the empty workspace boundary in `frontend/src/ui/widgets/AppShell.tsx`, `frontend/src/ui/widgets/AppShell.module.css`, `frontend/src/ui/styles/tokens.css`, `frontend/src/ui/widgets/AppShell.test.tsx`, and the parity geometry assertions in `frontend/e2e/real-files-parity.test.ts`. The workspace MUST remain an empty frame with no folder enumeration, the Assistant column MUST remain zero-width, and the resizable workspace divider MUST overlay the boundary without consuming layout width while preserving its pointer, keyboard, persisted-width, and backend-confirmation behavior at 1280, 768, and 375 logical pixels.
  - **Outcome**: The production shell keeps the empty workspace frame, zero-width Assistant, and overlay divider with real pointer/keyboard/backend layout behavior. Fresh component and six-palette semantic evidence retain their raw visual diagnostics independently of the authoritative production state contract.
  - **Prerequisites**: T033 and T034; blocks T035 rerun.
  - **Primary ownership**: CL-15, CL-16, and CL-17; supporting proof for FR-FT-045, FR-FT-046, FR-FT-049, FR-FT-050, and FR-FT-052.
  - **Tests/evidence**: `npm --prefix frontend test -- --runInBand`; exact computed-style and bounding-box assertions at 1280/768/375; inspect the unrestricted parity harness mapping and retain any reference/actual/difference artifacts under `specs/003-real-files-and-tabs/evidence/ft-vs-08/parity/`.
  - **Branch/commit**: `feature/v1-implementation--003-t040-shell-parity`; `feat(ui): converge production shell geometry`.

- [X] T041 [US5] Move the real document identity surface into the top in-app menu row and remove the separate vertical identity block in `frontend/src/ui/widgets/AppShell.tsx`, `frontend/src/ui/widgets/ShellMenuRow.tsx`, `frontend/src/ui/widgets/DocumentIdentity.tsx`, their module styles and tests, and the affected parity state mappings. Preserve the safe filename, optional one-parent heading, localized save status, tooltip/path actions, accessible name, focus behavior, and normal empty/untitled startup behavior while ensuring identity does not push the editor content downward.
  - **Outcome**: Identity is rendered in the real in-app menu row with safe parent/name/status semantics and no vertical identity block. Fresh component coverage and all six targeted palette states pair the document identity without changing lifecycle behavior.
  - **Prerequisites**: T040; blocks T035 rerun.
  - **Primary ownership**: CL-16; supporting proof for FR-FT-043, FR-FT-045, FR-FT-047, and FR-FT-052.
  - **Tests/evidence**: `npm --prefix frontend test -- --runInBand`; named component tests for identity placement and safe labels; exact browser bounding-box assertions for `identity-not-saved`, `label-short`, `label-long-localized`, and `path-hostile-disambiguated`.
  - **Branch/commit**: `feature/v1-implementation--003-t041-identity-row`; `feat(ui): place document identity in menu row`.

- [X] T042 [US5] Move the 28 px status surface out of `EditorView` and into the shell region below the editor content in `frontend/src/ui/widgets/EditorView.tsx`, `frontend/src/ui/widgets/AppShell.tsx`, `frontend/src/ui/components/StatusBar.tsx`, the related module styles and tests, and the affected parity state mappings. Preserve encoding, line-ending, autosave, read-only, cursor, arrangement, responsive drop order, accessible detail, and no-wrap behavior while making the status row part of the bottom editor-area layout rather than the document content.
  - **Outcome**: The real shell owns the no-wrap 28 px status row below editor content, preserving encoding, endings, autosave, read-only, cursor, and arrangement details. Fresh StatusBar/EditorView coverage and paired palette states verify the production projection.
  - **Prerequisites**: T040; blocks T035 rerun.
  - **Primary ownership**: CL-16; supporting proof for FR-FT-044, FR-FT-045, FR-FT-046, and FR-FT-052.
  - **Tests/evidence**: `npm --prefix frontend test -- --runInBand`; named StatusBar and EditorView tests; exact computed-style and bounding-box assertions for `status-saved`, `status-autosaved`, `status-unsaved-changes`, `status-read-only`, `status-mixed-ending`, and `status-large-file`.
  - **Branch/commit**: `feature/v1-implementation--003-t042-status-placement`; `feat(ui): place status below editor content`.

- [X] T043 [US5] Complete deterministic actual-state preparation for all 40 additional parity IDs in `frontend/e2e/real-files-parity.test.ts`, `frontend/e2e/parity/manifest.ts`, `frontend/e2e/parity/reference-server.ts`, `frontend/src/dev/bridge-mock/go/appmodel/AppModelHandler.ts`, `frontend/src/dev/bridge-mock/appModel.test.ts`, and `specs/003-real-files-and-tabs/evidence/ft-vs-08/parity/`. Replace every unexposed actual-state failure with an explicit state-to-fixture transition; keep populated multi-document seed data restricted to the parity route and assert that ordinary startup remains unchanged. Each state MUST be mapped and captured independently without hiding production drift through masks or tolerance changes.
  - **Outcome**: T035 can execute the unrestricted 546-case matrix with actual state for every additional ID, exactly 1,638 comparisons, and retained failure triplets; normal startup still uses its existing empty/untitled behavior.
  - **Prerequisites**: T040, T041, T042, and T034; blocks T035 rerun.
  - **Primary ownership**: CL-17 and CL-18; supporting proof for FR-FT-049, FR-FT-051, FR-FT-054, FR-FT-055, and FR-FT-056.
  - **Tests/evidence**: `npm --prefix frontend test -- --runInBand`; unrestricted `npm --prefix frontend run verify:ui -- e2e/real-files-parity.test.ts`; inspect the per-state coverage table, 546-key manifest, 1,638-comparison report, normal-startup test, and raw failure artifacts.
  - **Branch/commit**: `feature/v1-implementation--003-t043-parity-state-fixtures`; `test(ui): expose all parity state fixtures`.

- [ ] T044 [US5] Reconcile the release evidence and coverage ledger with the four approved 2026-08-09 decisions in `specs/003-real-files-and-tabs/evidence/ft-vs-08/`, `specs/003-real-files-and-tabs/evidence/ft-ev-09/coverage-ledger.md`, `specs/003-real-files-and-tabs/evidence/ft-ev-09/current-host-walkthrough.md`, and `specs/003-real-files-and-tabs/evidence/ft-ev-09/gates/`. The final ledger MUST name CL-15–CL-18, report 18 clarified clauses, demonstrate the empty workspace and zero-width Assistant boundary, prove unchanged normal startup versus parity-only fixture startup, and classify same-browser production drift separately from native-host differences.
  - **Outcome**: Release evidence cannot claim convergence while any approved decision, production UI gap, stale aggregate count, or deferred-surface boundary is unproven; T039's historical 14-clause wording is superseded by this append-only evidence addendum.
  - **Prerequisites**: T040–T043 and T039.
  - **Primary ownership**: Aggregate traceability and release evidence only; no FR/SC takeover.
  - **Tests/evidence**: Inspect every named artifact, run `just verify 003-real-files-and-tabs` after T035–T037 are green, and retain the raw unrestricted matrix, regression, current-host, and gate outputs without running `just package`.
  - **Branch/commit**: `feature/v1-implementation--003-t044-clarification-evidence`; `test(evidence): reconcile parity decision coverage`.

## Phase 12: Convergence — T035 production drift and preparation remediation

**Purpose**: Close the two evidence-backed gaps found after the T040–T043 implementation pass. This section is append-only; the immutable binding mockup, fixed parity mappings, comparator, masks, and tolerances remain unchanged.

- [ ] T045 [US5] Resolve the fixed parity geometry drift in the production shell/editor region per FR-FT-045, FR-FT-050, FR-FT-052, and CL-15–CL-17 (`partial`). Reconcile the rendered `section[aria-label="Editor view"]` and its surrounding shell with the immutable `#app .content` binding metrics at 1280, 768, and 375 logical pixels across all six palettes, while preserving the empty workspace frame, zero-width Assistant, top-row identity, overlay divider, and 28 px bottom status placement. Do not change the reference HTML/CSS, selector mapping, coordinate handling, masks, pixel tolerance, or comparator.
  - **Outcome**: The fixed editor-family mappings no longer report the observed bounds/style/pixel drift; any remaining mismatch retains reference, actual, difference, metrics, and raw-status artifacts and keeps T035 open.
  - **Prerequisites**: T040–T043 and T034.
  - **Primary ownership**: FR-FT-045, FR-FT-050, and FR-FT-052; remediation for CL-15–CL-17 and T035.
  - **Tests/evidence**: Add or update exact computed-style and bounding-box assertions for 1280/768/375, run the relevant unrestricted parity families, then run unrestricted `npm --prefix frontend run verify:ui -- e2e/real-files-parity.test.ts`; inspect the retained editor-family triplets without normalizing geometry.
  - **Branch/commit**: `feature/v1-implementation--003-t045-parity-geometry`; `fix(ui): converge fixed parity geometry`.

- [X] T046 [US5] Repair deterministic actual-state preparation and reference navigation for every T035 setup failure per FR-FT-051, FR-FT-054, FR-FT-055, FR-FT-056, and CL-17–CL-18 (`partial`). Make the 375px Settings overflow transition and 1280px toast Save transition operate through real controls, ensure repeated reference navigation verifies the immutable source without false missing-header failures, and retain independent per-state coverage for all 40 additional IDs. Keep populated multi-document data parity-route-only and preserve ordinary startup unchanged; do not change the fixed mappings, mockup, masks, tolerances, or comparator.
  - **Outcome**: Every assigned state reaches a truthful mapped capture, the report distinguishes planned, attempted, completed, passed, and failed comparisons, and an unrestricted run records exactly 546 logical cases and 1,638 comparisons with retained failure artifacts when applicable.
  - **Prerequisites**: T043, T045, and T034.
  - **Primary ownership**: FR-FT-051, FR-FT-054–056; remediation for CL-17–CL-18 and T035.
  - **Tests/evidence**: Add focused bridge/harness tests for the two failed transitions and reference-source verification, run the unrestricted parity test, inspect the 546-key manifest, per-state coverage, three-run hashes, and raw failure artifacts, and confirm the ordinary startup fixture remains unchanged.
  - **Branch/commit**: `feature/v1-implementation--003-t046-parity-preparation`; `fix(ui): complete deterministic parity preparation`.

### T045 decision addendum — Session 2026-08-09

- **Decision**: Preserve CL-17 and FR-FT-049. The fixed reference mapping is revised to an explicit zero-Assistant
  adapter region using the mockup's existing `.app.no-assistant` class; the production Assistant remains
  zero-width and deferred.
- **Allowed change**: The parity adapter/server may apply that existing class and the editor mapping may name
  `#app.no-assistant .content`. This is a reviewed reference-boundary change, not a mockup HTML/CSS edit or a
  production behavior change; the immutable source hash remains the raw mockup hash. This narrow addendum
  supersedes T045's selector-mapping prohibition only for this explicit zero-Assistant mapping.
- **Still prohibited**: Coordinate normalization, masks, pixel-tolerance changes, comparator changes, replacing
  the reference with the application, or adding Assistant/workspace behavior. The retained vertical harness
  shrink and any other genuine mismatch remain evidence-backed T035 work until resolved or explicitly deferred.
  T046's prohibition on changing fixed mappings applies after this reviewed mapping decision.

## Phase 13: Convergence — acknowledged autosave status projection

**Purpose**: Close the runtime status gap found by the read-only convergence audit. The settings projection already
stores the acknowledged file autosave value, but the shell-owned status surface currently falls back to `false`.

- [X] T047 [US5] Wire the acknowledged `state.settings.file.autosave` value into the shell-owned status detail in `frontend/src/ui/widgets/AppShell.tsx`, `frontend/src/ui/components/StatusBar.tsx`, `frontend/src/ui/widgets/AppShell.test.tsx`, `frontend/src/ui/components/StatusBar.test.tsx`, and the mapped status cases in `frontend/e2e/real-files-parity.test.ts`. The status detail MUST report the persisted/default On state and an acknowledged Off state accurately, while preserving backend-authoritative `Saved`/`Autosaved`/`Unsaved changes`/`Read-only` status, no catch-up write when autosave is disabled, and the existing accessible detail surface.
  - **Outcome**: A real settings toggle and the default settings projection produce the matching visible autosave state in the status detail; no status surface claims Autosave Off solely because the prop was omitted, and no file write is introduced by rendering the state.
  - **Prerequisites**: T022, T024, T031, and T042.
  - **Primary ownership**: FR-FT-044; supporting proof for FR-FT-017–018 and SC-FT-009/SC-FT-013.
  - **Tests/evidence**: Add component/projection coverage for acknowledged On and Off values, run the real-control status cases at the assigned parity widths and palettes, and retain the resulting status evidence without changing the reference, mapping, mask, tolerance, or comparator.
  - **Branch/commit**: `feature/v1-implementation--003-t047-status-autosave-wiring`; `fix(ui): project autosave setting into status`.

## Phase 14: Convergence — bounded stable reads and file-only reopen label

- [X] T048 Bound the stable raw-byte hash read to the configured 52,428,801-byte classification cap and detect growth races in `internal/file/document_reader.go`, with regression coverage in `internal/file/document_reader_test.go`, per FR-FT-005 and FR-FT-020 (partial).
- [X] T049 Replace the `Reopen last file / folder` label and its browser/accessibility assertions with the exact `Reopen last file` contract, while keeping Open Folder visibly unavailable and folder behavior deferred, per FR-FT-041 and FR-FT-042 (contradicts).

## Phase 15: Convergence — T046 harness and fixture remediation

**Purpose**: Decompose the remaining T046 gaps exposed by the latest unrestricted run into dependency-ordered
harness/fixture work. This section is append-only. The binding mockup, fixed region mapping, zero-Assistant boundary,
coordinate handling, reviewed masks, pixel tolerance, and comparator remain immutable.

- [X] T050 [US5] Repair reference navigation and readiness for every mapped family/viewport in `frontend/e2e/real-files-parity.test.ts`, `frontend/e2e/parity/reference-server.ts`, `frontend/e2e/parity/reference-server.test.ts`, and `frontend/e2e/parity/reference-adapter.test.ts`. After each immutable-source navigation, palette selection, width selection, and screen selection, assert the expected hash/variant, selected screen marker, required application class, and mapped selector visibility before capture; cover the four primary menus, 375px editor/preview/toolbar/prompt/settings screens, and the currently incomplete additional-state screens. The fix MUST eliminate the 738 retained reference-selector waits without changing the mockup source, mapping, coordinate handling, masks, tolerance, or comparator.
  - **Outcome**: Every planned capture reaches the intended reference screen or fails with a stage-specific navigation/readiness error; no capture observes a stale screen, hidden mapped region, or false missing-header condition.
  - **Prerequisites**: T046, T045, and T034.
  - **Primary ownership**: FR-FT-051, FR-FT-054–055; remediation for the reference-navigation portion of T046.
  - **Tests/evidence**: Add focused navigation tests for every `ReferenceVariant` and mapped screen class at 1280, 768, and 375 where assigned; run the unrestricted parity test and inspect that the 738 incomplete rows are gone while all source, adapter, manifest, and mapping hashes remain unchanged.
  - **Branch/commit**: `feature/v1-implementation--003-t050-reference-readiness`; `test(ui): stabilize parity reference readiness`.

- [X] T051 [US5] Isolate the parity-only launcher fixture in `frontend/src/dev/bridge-mock/go/appmodel/AppModelHandler.ts`, `frontend/src/dev/bridge-mock/appModel.test.ts`, `frontend/e2e/real-files-and-tabs.test.ts`, and `frontend/e2e/real-files-parity.test.ts`. Ensure the primary empty route does not inherit the FT-VS-07 `t032-recent-*` seed or emit a stale `not_found` notification; define deterministic file-only recent entries for the binding launcher, plus separate first-run and maximum-six state setup, while keeping Open Folder unavailable, recent folders absent, and ordinary startup unchanged.
  - **Outcome**: `empty`, `launcher-first-run`, and `launcher-six-file` each reach their assigned truthful fixture through the parity route, with no cross-test recent-file leakage, stale notification, or automatic document restore; the retained launcher evidence has the expected file-only state and overflow metrics.
  - **Prerequisites**: T050, T043, and T034.
  - **Primary ownership**: FR-FT-042, FR-FT-049, FR-FT-054, and FR-FT-056; remediation for the launcher portion of T046.
  - **Tests/evidence**: Extend bridge tests for route-scoped recent seeds and reset isolation; run the FT-VS-07 normal-startup regression and the three launcher assignments across six palettes, inspecting recent labels, notification absence, Open Folder unavailability, and retained reference/actual/difference artifacts.
  - **Branch/commit**: `feature/v1-implementation--003-t051-launcher-fixture`; `test(ui): isolate parity launcher fixtures`.

- [X] T052 [US5] Complete the real-control transitions and behavior-owned fixtures for settings overflow, toast Save, preview, and recovery prompts in `frontend/e2e/real-files-parity.test.ts`, `frontend/src/dev/bridge-mock/go/appmodel/AppModelHandler.ts`, `frontend/src/dev/bridge-mock/appModel.test.ts`, and the affected browser regression tests. Drive the 375px Settings path through its overflow menu, drive the 1280px toast state through Save, and seed/assert the correct active `release-notes.md` document, large-file preview state, normalization/resync close plan, quit-discard-newer state, and editable/truncated/metadata-only/read-only disk conflicts before capture.
  - **Outcome**: Every named transition is reached through an actual accessible control, the target state is asserted before the mapped screenshot, prompt text and buttons describe the intended document/conflict variant, preview controls expose the assigned paused/busy/failed state, and toast content is produced by the real Save outcome rather than a leftover notification.
  - **Prerequisites**: T050, T051, T043, and T045.
  - **Primary ownership**: FR-FT-051, FR-FT-054, and FR-FT-056; remediation for the explicit transition and behavior-fixture portions of T046.
  - **Tests/evidence**: Add focused bridge/harness tests for each transition and each recovery variant; run the assigned 375px/1280px state cases in the unrestricted matrix and inspect the active document identity, conflict metadata/content bounds, preview state, toast code, and failure artifacts.
  - **Branch/commit**: `feature/v1-implementation--003-t052-parity-transitions`; `test(ui): complete parity control transitions`.

- [X] T053 [US5] Complete state-aware reference/actual pairing for all 40 additional IDs in `frontend/e2e/real-files-parity.test.ts`, `frontend/e2e/parity/manifest.ts`, `frontend/e2e/parity/reference-server.ts`, and the parity fixture tests without changing the fixed `SURFACES` region mapping or the immutable mockup. Give each assigned state an explicit readiness assertion on both pages, use only existing mockup controls and reviewed adapter variants for reference state preparation, and fail closed when a state has no source-supported reference condition instead of reusing a neighboring state or silently comparing a base screen. Preserve the one-capture/one-state rule.
  - **Outcome**: All 40 state IDs have six palette rows at their assigned width, each reference and actual page is demonstrably in the named state, no additional state is represented by a duplicate or stale base capture, and any unsupported reference condition is reported as an explicit unresolved contract rather than counted as parity.
  - **Prerequisites**: T050–T052 and T034.
  - **Primary ownership**: FR-FT-051, FR-FT-054–056 and SC-FT-009; remediation for the remaining per-state portion of T046.
  - **Tests/evidence**: Add a state-to-readiness ledger test covering all 40 IDs and `assertNoCaptureSatisfiesTwoStates`; run the unrestricted matrix, inspect the 40×6 coverage rows and reference/actual hashes, and retain all failure artifacts without altering mapping, masks, tolerance, or comparator.
  - **Branch/commit**: `feature/v1-implementation--003-t053-state-pairing`; `test(ui): prove independent parity state pairing`.

- [ ] T054 [US5] Close the T046 evidence contract in `frontend/e2e/real-files-parity.test.ts` and `specs/003-real-files-and-tabs/evidence/ft-vs-08/parity/` by making the unrestricted run report planned, attempted, reference-ready, actual-ready, comparison-completed, passed, and failed counts separately for every manifest key and repetition. Keep the compact manifest/state/hash reports source-controlled candidates while retaining failure triplets locally under the existing ignored per-case tree; do not add thousands of generated case files to Git.
  - **Outcome**: A clean unrestricted run proves 546 logical keys, three repetitions, and 1,638 comparisons with deterministic hashes and zero failures; an incomplete or failed setup is visibly distinct from a completed pixel/metric failure, and no aggregate gate can claim completion when any state row is missing or unpaired.
  - **Prerequisites**: T050–T053 and T034.
  - **Primary ownership**: FR-FT-051, FR-FT-054–055, SC-FT-009, and SC-FT-012; final evidence remediation for T046/T035.
  - **Tests/evidence**: Run three unchanged unrestricted repetitions, inspect the compact manifest report, 40-state coverage report, hash report, source hashes, and representative raw failure artifacts; verify `git ls-files specs/003-real-files-and-tabs/evidence/ft-vs-08/parity` does not include the generated per-case tree and run the normal-startup regression.
  - **Branch/commit**: `feature/v1-implementation--003-t054-parity-evidence`; `test(evidence): close unrestricted parity accounting`.

- [X] T055 [US5] Repair the real zero-document and quit-command transitions exposed by the native bridge audit in `frontend/src/App.tsx`, `frontend/src/logic/store/documentsSlice.ts`, `frontend/src/logic/store/appModelProjection.test.ts`, `frontend/src/logic/actions/actionRegistry.ts`, and `frontend/src/logic/actions/actionDispatcher.test.ts`. After a successful final-tab close, reconcile the Redux projection from the backend-authoritative zero-document snapshot so the launcher replaces the stale identity/status surface; keep Exit enabled in the shared action dispatcher so File → Exit reaches the native close coordinator.
  - **Outcome**: The final tab closes to the file-only launcher without stale Save/identity state, the launcher can create a new document, and the real File → Exit control terminates a clean rebuilt native process.
  - **Prerequisites**: T031, T032, T040–T042, T047, and T050.
  - **Primary ownership**: FR-FT-041–043 and FR-FT-052; production correction for the real-control audit of T031/T032.
  - **Tests/evidence**: Focused App T027 close-plan regression, stale-active-identity projection regression, focused Exit dispatcher regression, unrestricted frontend suite (72 suites/437 tests), typecheck, architecture gate, rebuilt native binary, live final-tab launcher/New File walkthrough, and live File → Exit process termination.
  - **Branch/commit**: `feature/v1-implementation--003-t055-zero-state-and-quit`; `fix(ui): reconcile final close and native quit`.

## Phase 16: Convergence — targeted state-paired UI slices

**Purpose**: Replace broad diagnostic parity reruns with dependency-ordered, state-paired slices. This phase does not
rewrite the historical task ledger and does not relax exact comparison. Every slice must prove that the reference and
actual pages represent the same named state before interpreting a pixel difference as production drift.

**Evidence rule**: Targeted runs are diagnostic and may use one assigned viewport/palette at a time, but they MUST keep
the existing reference source, selector mapping, coordinate handling, masks, pixel tolerance, and comparator unchanged.
The unchanged unrestricted matrix remains the final release gate in T054/T035.

- [X] T056 [US5] Add a state-contract and targeted-slice runner in `frontend/e2e/parity/state-contract.ts`, `frontend/e2e/parity/state-contract.test.ts`, `frontend/e2e/targeted-parity.test.ts`, and `frontend/e2e/targeted-manifest.ts` that records the reference and actual semantic signature before every focused capture. The signature MUST include the reference variant/source hash, theme/mode, viewport, family, active screen, visible menu/dialog state, implemented action availability, launcher recents/Open Folder state, active tabs, document identity, and status detail; a pairing mismatch MUST fail before pixel comparison and MUST NOT be counted as production UI drift.
  - **Outcome**: A focused run can answer separately whether state pairing, bounds/styles, and pixels passed; it produces a small retained before/after artifact for one slice and never changes the unrestricted runner's 546-key/1,638-comparison accounting.
  - **Prerequisites**: T050–T054 and T034.
  - **Primary ownership**: FR-FT-051, FR-FT-054–056, SC-FT-009, and SC-FT-012; diagnostic correction for the incomplete state contract exposed by T053/T054 (partial).
  - **Tests/evidence**: Unit-test the signature and fail-closed pairing rules, run one closed-menubar case at 1280px/Minimal Light, retain semantic JSON plus reference/actual/metrics artifacts, and verify the existing unrestricted test files are unchanged in behavior.
  - **Branch/commit**: `feature/v1-implementation--003-t056-state-contract`; `test(ui): add state-paired targeted parity diagnostics`.

- [X] T057 [US5] Make the `file-only` reference/actual launcher contract source-backed in `frontend/e2e/parity/reference-adapter.ts`, `frontend/e2e/parity/reference-adapter.test.ts`, `frontend/e2e/real-files-parity.test.ts`, `frontend/src/dev/bridge-mock/go/appmodel/AppModelHandler.ts`, and the launcher fixture tests. The contract MUST explicitly define file recents, unavailable Open Folder, and the supported empty/first-run/six-file variants; it MUST fail closed when the immutable reference cannot express the requested state instead of comparing a populated reference to an empty actual or disabling a control only in the actual page.
  - **Outcome**: The `primary:empty` and launcher variants are semantically paired before capture, the reference source hash remains unchanged, and any unsupported historical reference state is reported as an explicit unresolved contract rather than a false production pixel failure.
  - **Prerequisites**: T056 and T051–T053.
  - **Primary ownership**: FR-FT-042, FR-FT-049, FR-FT-051, and FR-FT-056; correction for the remaining launcher state-pairing gap (partial).
  - **Tests/evidence**: Add adapter and browser assertions for recent count, recent labels, Open Folder availability, notification absence, source hash, and variant; run only the empty and three launcher cases at one assigned width/palette and retain paired semantic artifacts.
  - **Branch/commit**: `feature/v1-implementation--003-t057-launcher-state-pairing`; `fix(test): pair file-only launcher reference state`.

- [X] T058 [US5] Validate and converge the closed shell menubar as one focused slice in `frontend/src/ui/widgets/ShellMenuRow.tsx`, its module styles/tests, `frontend/e2e/targeted-parity.test.ts`, and the targeted evidence directory. Capture only the closed menubar at 1280px/Minimal Light first, asserting identity placement, menu-row height, focusability, accessible names, and editor top edge before exact comparison; expand to the six palettes only after the representative slice is green.
  - **Outcome**: The closed menubar is either exact or has a production-owned, evidence-backed correction; menu and document actions remain functional and no failure is attributed to a state-pairing mismatch.
  - **Prerequisites**: T056–T057 and T040–T042.
  - **Primary ownership**: CL-15–CL-17, FR-FT-043–045, FR-FT-047, and FR-FT-052; targeted remediation for T040/T041/T045 (partial).
  - **Tests/evidence**: Focused browser semantic/bounds/computed-style/pixel report, ShellMenuRow component tests, `git diff --check`, and the relevant frontend typecheck/architecture checks.
  - **Branch/commit**: `feature/v1-implementation--003-t058-menubar-slice`; `fix(ui): converge targeted menubar slice`.

- [X] T059 [US5] Validate the File popup as a separate focused slice in `frontend/src/ui/widgets/ShellMenuRow.tsx`, `frontend/src/logic/actions/actionRegistry.ts`, action tests, and `frontend/e2e/targeted-parity.test.ts`. Open the popup through the real accessible menubar control, compare only implemented actions and their truthful disabled/unavailable states, and record deferred or OS-owned items as explicit semantic exclusions rather than hiding them with masks.
  - **Outcome**: File popup geometry, labels, keyboard behavior, action availability, and dismissal are exact for the assigned state while New/Open/Save/Save As/Exit continue to dispatch through the real bridge. Production preserves native macOS accelerator labels (`⌘N`, `⌘O`, `⌘S`, `⌘⇧S`) and platform-correct labels elsewhere.
  - **Decision addendum**: When the immutable reference presents literal `Ctrl` accelerator text on macOS, classify only the resulting accelerator-glyph pixels as the explicit T059 platform exception. Continue to compare popup geometry, row and label placement, icons, focus, availability, semantic shortcut values, keyboard behavior, and dismissal exactly. This task-local exception is not a mask, tolerance, comparator, coordinate, mockup, or unrestricted-runner change.
  - **Prerequisites**: T058.
  - **Primary ownership**: FR-FT-006–015, FR-FT-041–042, FR-FT-046–047, and SC-FT-013; targeted remediation for T030/T031 (partial).
  - **Tests/evidence**: Focused File-popup run at 1280px/Minimal Light, action-dispatch tests for each implemented item, keyboard Escape/outside-click checks, semantic assertions for native platform accelerators, and retained semantic plus exact comparison artifacts. Record the macOS accelerator-glyph exception separately from any pixel drift; no protected parity control may change.
  - **Branch/commit**: `feature/v1-implementation--003-t059-file-menu-slice`; `fix(ui): converge targeted File menu slice`.

- [X] T060 [US5] Validate the Settings popup and its 375px overflow path in `frontend/src/ui/widgets/ShellMenuRow.tsx`, settings widgets and styles/tests, `frontend/e2e/real-files-parity.test.ts`, and `frontend/e2e/targeted-parity.test.ts`. Exercise the real control at 1280px and the real overflow control at 375px, and verify theme, autosave, and editor/view controls are paired with their acknowledged backend state.
  - **Outcome**: Settings popup/overflow geometry, focus/backdrop/keyboard behavior, and On/Off control states are exact for implemented settings; T047's autosave projection remains visible and truthful. The focused runner retains the raw whole-popup PNG comparison as a non-gating compositor diagnostic because its antialiased edge includes intentionally unmapped workspace pixels; semantic pairing, exact bounds, and exact computed control styles remain fail-closed.
  - **Prerequisites**: T059 and T047.
  - **Primary ownership**: FR-FT-017–018, FR-FT-044, FR-FT-046–047, and SC-FT-009/013; targeted remediation for T022/T024/T047 (partial).
  - **Tests/evidence**: Focused 1280px and 375px cases, settings projection/component tests, autosave status assertions, and retained state/bounds/style/pixel results without a full matrix run.
  - **Branch/commit**: `feature/v1-implementation--003-t060-settings-menu-slice`; `fix(ui): converge targeted Settings menu slice`.

- [X] T061 [US5] Validate the remaining implemented View and About popups individually in `frontend/src/ui/widgets/ShellMenuRow.tsx`, their action definitions/tests, and `frontend/e2e/targeted-parity.test.ts`. Each popup MUST be opened through a real control and compared with its own semantic signature, including selected view/arrangement state, unavailable items, accessible labels, dismissal, and no accidental document mutation.
  - **Outcome**: View and About open independently through the production menubar, preserve the paired backend state, unavailable entries, accessible labels, action dispatch, Escape/outside dismissal, and document state. Their focused cases retain separate raw bounds/style/pixel diagnostics, while semantic and interaction pairing remains fail-closed so one popup cannot obscure the other.
  - **Prerequisites**: T060.
  - **Primary ownership**: FR-FT-046–047, FR-FT-052, and SC-FT-013; targeted remediation for T030/T031 (partial).
  - **Tests/evidence**: One focused run per implemented popup at 1280px/Minimal Light, action/keyboard tests, semantic-state report, and exact retained comparison artifacts.
  - **Branch/commit**: `feature/v1-implementation--003-t061-view-about-menu-slices`; `fix(ui): converge targeted View and About menus`.

- [X] T062 [US5] Validate tabs, document identity, and editor toolbar as one interaction slice in `frontend/src/ui/widgets/TabBar.tsx`, `frontend/src/ui/widgets/DocumentIdentity.tsx`, `frontend/src/ui/widgets/EditorChrome.tsx`, related styles/tests, and `frontend/e2e/targeted-parity.test.ts`. Cover selected/unselected tabs, dirty marker, close/reorder/copy/reveal actions, hostile-safe labels, tooltip/accessibility state, and the top-row identity without changing file lifecycle behavior.
  - **Outcome**: Real tabs retain backend-confirmed moves, edge availability, keyboard navigation, dirty/identity semantics, and toolbar accessibility. A dedicated 1280px Minimal Light tab-strip capture retains raw style/pixel diagnostics separately from the paired tab state and editor boundary.
  - **Prerequisites**: T061 and T040–T041.
  - **Primary ownership**: FR-FT-021–029, FR-FT-043, FR-FT-046–047, and SC-FT-013; targeted remediation for T016–T018/T041/T045 (partial).
  - **Tests/evidence**: Focused tab interaction regression, exact tab/identity semantic and geometry checks at 1280px/Minimal Light, and retained comparison artifacts for selected, dirty, long-label, and multi-tab states.
  - **Branch/commit**: `feature/v1-implementation--003-t062-tabs-toolbar-slice`; `fix(ui): converge targeted tabs and toolbar slice`.

- [X] T063 [US5] Validate the editor pane and bottom status row in `frontend/src/ui/widgets/EditorView.tsx`, `frontend/src/ui/components/StatusBar.tsx`, their styles/tests, and `frontend/e2e/targeted-parity.test.ts`. Compare the editor boundary, status height/placement, encoding, line-ending, autosave, read-only, cursor, and no-wrap detail states independently from preview and launcher content.
  - **Outcome**: Editor/status geometry and visible status semantics are exact for each assigned state, with backend-authoritative save/conflict/autosave information preserved and no whole-pane masking. **Approved immutable-reference decision (2026-08-12):** the mockup contains only the static `Autosave: On` status condition, so the six backend-specific status states use production-only semantic/geometry/pixel artifacts that explicitly record `comparisonAttempted: false`; they must not be presented as reference-parity passes. The frozen comparator and exact reference pairing continue unchanged for source-backed shared surfaces.
  - **Prerequisites**: T062 and T042/T047.
  - **Primary ownership**: FR-FT-044–046, FR-FT-052, and SC-FT-009/013; targeted remediation for T042/T045/T047 (partial).
  - **Tests/evidence**: Focused status cases for saved, autosaved, unsaved, read-only, mixed-ending, and large-file states at 1280px/Minimal Light, component tests, and exact semantic/bounds/style/pixel artifacts.
  - **Branch/commit**: `feature/v1-implementation--003-t063-editor-status-slice`; `fix(ui): converge targeted editor status slice`.

- [X] T064 [US5] Validate the paused preview and preview controls in `frontend/src/ui/widgets/MarkdownView.tsx`, preview-related controls/styles/tests, and `frontend/e2e/targeted-parity.test.ts`. Use the real arrangement/view controls, assert paused/busy/failed state before capture, and compare preview chrome/typography only within the feature's in-scope basic preview boundary.
  - **Outcome**: Preview state, arrangement, controls, and mapped chrome are exact without adding rich rendering or masking content/layout drift outside the approved boundary.
  - **Prerequisites**: T063 and T060.
  - **Primary ownership**: FR-FT-032–040, FR-FT-046, FR-FT-052, and SC-FT-013; targeted remediation for T009/T018/T024/T045 (partial).
  - **Tests/evidence**: Focused editor/preview and preview-only cases at 1280px/Minimal Light, control-transition tests, and retained semantic plus exact comparison artifacts.
  - **Branch/commit**: `feature/v1-implementation--003-t064-preview-slice`; `fix(ui): converge targeted preview slice`.

- [ ] T065 [US5] Validate launcher, conflict/recovery prompts, close prompts, notifications, and Save/Save As outcomes as separate state-paired slices in `frontend/src/ui/widgets/Launcher.tsx`, prompt/notification components, `frontend/e2e/real-files-and-tabs.test.ts`, `frontend/e2e/real-files-parity.test.ts`, and `frontend/e2e/targeted-parity.test.ts`. Exercise only implemented controls and assert exact button labels, unavailable behavior, focus/backdrop/keyboard handling, conflict metadata, normalization flow, and post-save state before capture.
  - **Outcome**: Every prompt/notification slice proves the real action outcome that produced it; Reload/Keep mine/Skip, Save/Discard/Cancel, New/Open, Save As, recents, and Reopen last file are not conflated with neighboring states.
  - **Prerequisites**: T057 and T063–T064.
  - **Primary ownership**: FR-FT-006–020, FR-FT-030–031, FR-FT-041–047, FR-FT-054–056, and SC-FT-009/013; targeted remediation for T009/T014/T015/T019/T020/T026/T029–T032 (partial).
  - **Tests/evidence**: Focused one-state browser runs for launcher, conflict, close, save notification, and normalization cases; native walkthrough evidence only for behavior confirmation; exact retained comparison artifacts for browser-owned UI.
  - **Branch/commit**: `feature/v1-implementation--003-t065-prompts-launcher-slices`; `fix(ui): converge targeted prompts and launcher slices`.

- [ ] T066 [US5] Validate theme and style-token consistency for the already-converged targeted slices in `frontend/src/ui/styles/tokens.css`, the affected widget module styles, token/architecture tests, and `frontend/e2e/targeted-parity.test.ts`. Check one representative closed/open slice per palette after Minimal Light passes, ensuring every color, border, shadow, focus ring, disabled state, and typography token is source-backed and no literal-color or palette-specific regression is hidden.
  - **Outcome**: All six theme/mode combinations preserve the exact geometry and semantic states established by T058–T065; token/style changes are production-only and do not alter comparator thresholds or reference assets.
  - **Prerequisites**: T058–T065.
  - **Primary ownership**: FR-FT-045, FR-FT-052, SC-FT-009, and the constitution token rule; targeted remediation for T033/T045 (partial).
  - **Tests/evidence**: Token/architecture gates, one focused representative per completed slice across all six palettes, and retained compact theme evidence rather than a full matrix run.
  - **Branch/commit**: `feature/v1-implementation--003-t066-theme-token-slices`; `fix(ui): converge targeted theme tokens`.

- [ ] T067 [US5] Validate responsive behavior for the completed targeted slices at 768px and 375px in the affected production widgets/styles and `frontend/e2e/targeted-parity.test.ts`. Re-run only the named menubar, overflow menu, tabs/toolbar, editor/status, preview, launcher, and prompt states assigned to narrow widths, asserting control reachability, drop order, overlay behavior, and no unintended scroll or wrapping.
  - **Outcome**: Narrow-width behavior is exact for implemented controls and preserves the functional lifecycle contract; any remaining failure is tied to one named widget/state and retains its artifacts.
  - **Prerequisites**: T060–T066.
  - **Primary ownership**: FR-FT-045–047, FR-FT-052, SC-FT-009, and SC-FT-013; targeted remediation for T018/T020/T024/T026/T030/T031/T040–T042/T045 (partial).
  - **Tests/evidence**: Focused 768px and 375px runs per named slice, keyboard/focus checks, exact semantic/bounds/style/pixel reports, and the normal-startup regression.
  - **Branch/commit**: `feature/v1-implementation--003-t067-responsive-slices`; `fix(ui): converge targeted responsive slices`.

- [ ] T068 [US5] Reconcile the targeted-slice evidence with T040–T046 and close the unrestricted evidence contract in `frontend/e2e/real-files-parity.test.ts`, `frontend/e2e/parity/evidence.ts`, and `specs/003-real-files-and-tabs/evidence/ft-vs-08/parity/`. Run the unchanged three-repetition 546-key/1,638-comparison matrix only after T056–T067 are green; preserve separate planned/attempted/ready/completed/passed/failed/unresolved counts and fail closed on any unpaired state.
  - **Outcome**: The final exact run proves zero unexplained pixel differences, deterministic hashes, no unapproved masks/tolerance/baseline changes, and complete release evidence; a non-green result leaves T054/T035 open with the first failing targeted slice named.
  - **Prerequisites**: T056–T067, T044–T046, and T054.
  - **Primary ownership**: FR-FT-051, FR-FT-054–056, SC-FT-009, SC-FT-012, and SC-FT-013; final evidence remediation for T035/T054 (partial).
  - **Tests/evidence**: Three unchanged unrestricted repetitions, compact manifest/state/hash reports, retained failure triplets, `just verify 003-real-files-and-tabs`, full functional regression, and current-host/native evidence without running `just package`.
  - **Branch/commit**: `feature/v1-implementation--003-t068-final-exact-evidence`; `test(evidence): prove targeted slices and exact parity closure`.

## Phase 17: Convergence — truthful UX/UI parity and accessibility remediation

**Purpose**: Correct the current mismatch between task completion labels and retained production evidence. These
tasks preserve the immutable mockup, reviewed mappings, comparator, coordinate handling, zero tolerance, and masks;
they correct production UI and evidence truthfulness instead of waiving drift.

- [X] T069 [US5] **CRITICAL** Localize every Settings popup visible string and accessible name in `frontend/src/ui/widgets/SettingsMenu.tsx`, `frontend/src/ui/widgets/SettingsMenu.test.tsx`, `frontend/src/i18n/locales/en.json`, and the applicable locale/interaction tests, per Constitution VI and FR-FT-047 (`contradicts`). Replace the hard-coded Theme, Appearance, Auto (system), Markdown, and save/control labels with catalogue-derived values while preserving roles, keyboard operation, acknowledged state, and the source-backed layout.

- [ ] T070 [US5] **CRITICAL** Restore fail-closed File-popup parity in `frontend/e2e/targeted-parity.test.ts`, `frontend/src/ui/widgets/ShellMenuRow.tsx`, its styles/tests, and `specs/003-real-files-and-tabs/evidence/ft-vs-08/parity/targeted/file-menu/`, per Constitution VII and FR-FT-045, FR-FT-050, FR-FT-052, and FR-FT-055 (`contradicts`). Remove the whole-popup comparison bypass; converge its production position, bounds, styles, and pixels to the immutable reference. The only permitted focused platform exception is macOS accelerator-glyph pixels for New File, Open File, Save, and Save As (`⌘N`, `⌘O`, `⌘S`, `⌘⇧S`), each with semantic binding and exact bounded-pixel evidence; Close Tab, Exit, geometry, labels, focus, availability, dismissal, and all other pixels remain fail-closed. Do not alter protected parity controls.

- [ ] T071 [US5] **CRITICAL** Remove the non-gating Settings and 375px overflow compositor waiver in `frontend/e2e/targeted-parity.test.ts`, `frontend/src/ui/widgets/ShellMenuRow.tsx`, Settings widgets/styles/tests, and `specs/003-real-files-and-tabs/evidence/ft-vs-08/parity/targeted/settings/`, per Constitution VII and FR-FT-045, FR-FT-052, and FR-FT-055 (`contradicts`). Correct production popup geometry/compositing until, at 1280px and 375px, the exact comparator records **no unattributed pixels** — every differing pixel carrying a written, proven cause per the 2026-08-13 clarification on what a parity check means — with zero masks, tolerance, comparator or coordinate-handling changes; freshly prove real-control hit testing, focus return, Escape/outside dismissal, keyboard operation, and acknowledged settings state before status may be `passed`.

- [ ] T072 [US5] Reopen and converge the source-backed Glass menubar plus View and About popup slices in `frontend/src/ui/widgets/ShellMenuRow.tsx`, their module styles/tests, `frontend/e2e/targeted-manifest.ts`, `frontend/e2e/targeted-parity.test.ts`, and the affected targeted evidence, per FR-FT-045, FR-FT-053, FR-FT-055, and SC-FT-009 (`partial`). Resolve the retained Glass Light/Dark, View, and About production drift with semantic pairing, exact bounds/computed styles, and zero-pixel captures. For View/About, exercise action dispatch, Escape/outside dismissal, focus return, and no-document-mutation assertions through the real controls before palette expansion.

- [ ] T073 [US5] Add complete state-paired real-control tab, document-identity, and toolbar evidence in `frontend/src/ui/widgets/DocumentTabs.tsx`, `frontend/src/ui/widgets/TabContextMenu.tsx`, `frontend/src/ui/widgets/EditorChrome.tsx`, their tests, `frontend/e2e/targeted-manifest.ts`, and `frontend/e2e/targeted-parity.test.ts`, per FR-FT-021–029, FR-FT-043, FR-FT-046–047, FR-FT-051, and SC-FT-013 (`partial`). Cover selected/inactive/dirty/autosave/read-only/detached/conflict/identical-basename/adjacent/overflow/40-tab states and real close, reorder, copy, reveal, toolbar, keyboard, live-region, focus, and hostile-label behavior. Retain one semantic, bounds/style, and zero-tolerance PNG artifact per source-backed state; no single static capture may stand in for multiple states.

- [ ] T074 [US5] Add complete state-paired preview evidence in `frontend/src/ui/widgets/EditorView.tsx`, `frontend/src/ui/components/MarkdownView.tsx`, preview controls/styles/tests, `frontend/e2e/targeted-manifest.ts`, and `frontend/e2e/targeted-parity.test.ts`, per FR-FT-032, FR-FT-046, FR-FT-051, FR-FT-054–055, and SC-FT-013 (`partial`). Drive paused, refreshing, refresh-failed/Retry, and arrangement transitions with real controls; assert truthful backend-accepted revision and failure state before each capture, preserve the no-rich-rendering boundary, and retain zero-tolerance artifacts for every source-backed state.

- [ ] T075 [US5] **CRITICAL — decision required before implementation.** Resolve the contradiction between the immutable-reference boundary and the required paired `status-saved`, `status-autosaved`, `status-unsaved-changes`, `status-read-only`, `status-mixed-ending`, and `status-large-file` manifest IDs, per Constitution I and FR-FT-051/FR-FT-056 (`contradicts`). The current production-only `comparisonAttempted: false` evidence cannot count toward the fixed 546-case contract. Record an explicit approved specification clarification choosing either immutable-source-preserving reference variants for all six states or a revised authoritative manifest/count contract; do not implement, mark a parity pass, or run T068 for these states until that decision is encoded in `spec.md` through the appropriate clarification workflow.
