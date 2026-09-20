---
description: 'Task list for Feature 005 — Folder Workspace Sidebar'
---

# Tasks: Folder Workspace Sidebar

**Input**: Design documents from `/specs/005-folder-workspace/`

**Prerequisites**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md),
[data-model.md](data-model.md), [quickstart.md](quickstart.md),
[contracts/workspace-lifecycle.md](contracts/workspace-lifecycle.md),
[contracts/workspace-tree-ui.md](contracts/workspace-tree-ui.md).
Repository-wide authority: [docs/architecture.md](../../docs/architecture.md).
Principles: [.specify/memory/constitution.md](../../.specify/memory/constitution.md).
Working rules: [AGENTS.md](../../AGENTS.md).

**Tests**: Required. Constitution VII and AGENTS.md's Definition of Done make named passing tests
part of every task's completion evidence, so each task below names the test files it owns and the
cases they must cover.

## How to run these tasks

Each task is executed in its **own agent session**, in plan mode, with that task's briefing as the
only context. A task therefore carries everything needed to plan it: the story it serves, the
requirement ids it satisfies, the documents and sections to read first, the existing code that owns
the behaviour being extended, the files to create or modify, the tests to write, and the explicit
boundary of what it must not touch.

A task briefing is **not** an implementation plan. It states scope and references; the session
plans the implementation itself, after reading the named material and the real code.

Before the first implementation edit of the feature, T001 must have recorded the baseline. Before
calling any task complete, run the verification command named in the task, then re-read the task's
**Definition of done**.

Two lint rules shape every task. The identifiers used in this file (task ids, `FR-`/`SC-` ids) must
never appear in production sources, test files or `docs/architecture.md` — repository rule L22
(`tools/lint/repo-rules.mjs`) rejects them, and Constitution II forbids them in test titles. And
every exported Go symbol needs a production use in the same task that adds it — rule L6
(`tools/archlint/main.go`) fails Lint on a callerless export (methods on the Wails-bound handlers
and methods that satisfy a same-package interface are exempt), which is why wire types and bound
methods are introduced by the task that first consumes them rather than ahead of time.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: `[US1]`…`[US5]`, mapping the task to one user story in `spec.md`. Setup,
  Foundational and Polish tasks carry no story label.
- Each task names exact file paths.

## Path conventions

Desktop application, one Wails v2 binary. Go backend under `internal/` with the composition root at
`main.go`; React/TypeScript frontend under `frontend/src/`. Backend tests live in `tests/go/unit/`
and `tests/go/integration/` as external `package <x>_test` packages; frontend tests live in
`frontend/tests/{unit,integration,e2e}/`. No in-package `_test.go` is planned for this feature
(plan.md, "In-package `_test.go` exceptions": none).

---

## Phase 1: Setup

**Purpose**: Establish the verification record every later task compares against.

- [ ] T001 Record the feature baseline at `.local_tmp_files/baseline/005-folder-workspace.json`

    **Story / Priority**: Setup (blocks every implementation task)

    **Requirements**: AGENTS.md "Development loop" step 2; Constitution VII (Evidence Before
    Completion); quickstart.md §10.

    **Read first**: AGENTS.md §"Development loop" (steps 2 and 4, and the six-stage table);
    quickstart.md §9 "Automated stages" and §10 "Baseline comparison".

    **Existing code to use**: `scripts/baseline`, `scripts/build`, `scripts/verify`,
    `scripts/lib/stages.sh`. Optional aliases in `justfile`.

    **Create / modify**: `.local_tmp_files/baseline/005-folder-workspace.json` (generated — Git
    ignores `.local_tmp_files/`). No production file changes.

    **Steps of substance**: run `scripts/build setup` if the toolchain is not yet prepared, then
    `scripts/baseline`. Confirm every one of the six stages (Lint, Format, Build, Unit, Integration,
    E2E) actually ran and collected results. A stage that exited non-zero having collected nothing,
    or a required test count that is unavailable, is unreliable — not clean. `scripts/baseline`
    refuses to write an unreliable record; if it refuses, fix the runner before continuing rather
    than working around it.

    **Tests**: none written. This task consumes the existing suites.

    **Out of scope**: no production code, no spec edits, no dependency changes.

    **Definition of done**: the baseline file exists, all six stages are recorded as reliable, and
    the task's completion note states each stage's result and any pre-existing failures so later
    tasks are not blamed for them.

    **Verify**: `scripts/baseline` then `scripts/baseline --compare` (the second must report no drift
    against the record just written).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The backend and frontend pieces that three or more user stories depend on. Isolating
them here is what lets every `[USn]` task below stay inside exactly one story.

**⚠️ CRITICAL**: No user-story task may begin until T002–T006 are complete.

- [ ] T002 Add the missing icons and apply the sidebar terminology rename in `frontend/src/ui/primitives/Icon/Icon.tsx` and `frontend/src/i18n/locales/en.json`

    **Story / Priority**: Foundational (the tree, the recent menu and the prompts all need these).
    First in the phase — T003's Launcher test renders the `folder` icon added here.

    **Requirements**: Constitution VI (accessible, tokenized, coherent; one action registry; i18n
    catalogue) · spec.md **Terminology note** ("workspace" never appears in the interface) ·
    contracts/workspace-tree-ui.md §"User-facing wording"

    **Read first**:
    - contracts/workspace-tree-ui.md §"User-facing wording" — a user-visible "workspace" is a defect,
      not a variation.
    - plan.md's Constitution VI row, which names the three catalogue strings to rename:
      `view.menu.showWorkspace`, `shell.workspace`, `shell.workspace.resize`.
    - spec.md's **Terminology note** at the top.

    **Existing code to extend**:
    - `frontend/src/ui/primitives/Icon/Icon.tsx` — an `IconName` union of 25 names with shapes and
      viewBoxes below it. `file`, `add` and `close` exist; there is **no** `folder`, `chevron`,
      `warning` or `refresh` icon today, and the tree rows, the unreadable badge, the recent-item kind
      icons and the header's Refresh control need them. ESLint bans inline `<svg>` outside `Icon`, so
      they must be added here.
    - `frontend/src/i18n/locales/en.json` — a flat, dot-namespaced catalogue; the three keys sit at
      the `view.menu.*` and `shell.*` blocks. `frontend/src/i18n/catalog.ts` treats a blank value as
      missing.
    - Consumers of those keys: `frontend/src/ui/widgets/WorkspaceLayout.tsx` (`ariaLabel`,
      `resizeAriaLabel`) and `frontend/src/ui/widgets/Menubar/ViewMenu.tsx`.

    **Create / modify**: `Icon.tsx`, `en.json`, `WorkspaceLayout.tsx`, `ViewMenu.tsx`.

    **Tests** (modify — these are the suites that assert the old strings today):
    - `frontend/tests/integration/appShell.legacy.test.tsx` — the `'Workspace'` and
      `'Resize workspace'` accessible names throughout, and the assertion near `:453` that pins the
      `shell.workspace` key by name;
    - `frontend/tests/integration/appShell.test.tsx` (`'Workspace'`, near `:48`);
    - `frontend/tests/integration/editorStage.legacy.test.tsx` (`'Workspace'`, near `:166`).

    `frontend/tests/unit/components/Sidebar/Sidebar.test.tsx` passes its own `ariaLabel` props and
    needs no change; no E2E suite asserts any of the three strings. Add a unit assertion that every
    new `IconName` renders a shape.

    **Out of scope**: no new feature strings — each story task adds its own keys. No component
    behaviour changes beyond the label swap. The `shell.workspace` **state field**, Go package,
    component and action-id names stay "workspace"; only user-visible text changes.

    **Definition of done**: no user-visible string in `en.json` contains "Workspace", the three
    renamed keys have no stale references, and the new icons render.

    **Verify**: `scripts/verify --skip e2e`.

- [ ] T003 Generalize the recent-files MRU to Recent Items (v2) across `internal/appmodel/recent_files_repository*.go` and the frontend

    **Story / Priority**: Foundational (US1 promotes folders into it; US2 presents it). Needs T002
    (the `folder` icon the Launcher's folder entries render).

    **Requirements**: FR-008 (cap of 10, combined files+folders) · Constitution V (additive,
    forward-only migration, no data loss) · Constitution VIII (one MRU repository, not two)

    **Read first**:
    - data-model.md §"Entity: RecentItem" in full — especially the **Field replacements** table,
      which enumerates every call site exhaustively so none is missed, the **SQLite persistence**
      bullets (v1→v2 lazy read-time upgrade), and the **Promotion call sites** table.
    - research.md **R5** (why one combined list, not a second parallel one; cap and menu decisions).
    - contracts/workspace-lifecycle.md §"Snapshot and patch shape" (`recentItems` replaces
      `recentFiles`) and §ClearRecentItems.

    **Existing code to extend**:
    - `internal/apperr/results.go` — `AppStateSnapshot.RecentFiles` (`:163`) and
      `AppStatePatch.RecentFiles` (`:570`) become `RecentItems []RecentItem`; add the `RecentItem`
      type here. `frontend/src/logic/store/appModelTypes.ts` (`:162`, `:186`) gets the structural
      mirror plus `RecentItemKind`. Both swaps land in this task because every consumer below
      changes with them.
    - `internal/appmodel/recent_files_repository.go` — `RecentFilesRepository` port,
      `recentFilesSettingKey = "recent.files"`, `recentFilesSettingType = "recent.files.v1"`,
      `maxRecentFiles = 6`, and the doc comment explaining why there is deliberately no `Remove`.
    - `internal/appmodel/recent_files_repository_sqlite.go` — `recentFilesValue`, `List` (lazy
      prune-on-read), `Promote`, `withEntries` (4 attempts, `Tx` then `TxImmediate`),
      `readRecentFilesTx`/`writeRecentFilesTx`.
    - `internal/kv/versioned_json.go` — `EncodeVersionedJSON` / `DecodeVersionedJSON`. Note that a
      well-formed object whose stored `version` differs from the expected one returns
      `(false, nil)` — _absent without error_. That is the migration seam: read v2 first, then
      retry as v1 and map each string entry to `RecentItem{Path: e, Kind: "file"}`.
    - `internal/appmodel/recent_files.go` — `refreshRecentFiles` / `publishRecentFiles`.
    - `internal/appmodel/file_lifecycle.go` — `CommitPreparedOpen`'s promotion block (note the
      in-memory fallback used when no repository is wired, and its hard-coded cap of 6 in
      `promoteRecentFile`, which must follow the new cap), and `recentFilesChanged`.
    - `internal/appmodel/service.go` — `GetState`'s `RecentFiles` member and `documentPatchLocked`.
    - `internal/appmodel/recent_files_repository_sqlite.go`'s path normalization falls back to the raw
      path when `file.CanonicalizeCandidateDocumentPath` rejects it, which it does for every
      directory; `OpenWorkspace` (T004) promotes an already-canonical root, so that fallback is what
      keeps a folder entry and what makes re-promoting the same folder deduplicate. `List`'s prune is
      a bare `os.Stat`, so an existing directory survives it. Cover both with a test. The doc comment
      explaining why there is no `Remove` is garbled in the source — rewrite it while generalizing.
    - Frontend, per data-model.md's replacement table: `frontend/src/logic/adapter/appModelAdapter.ts`
      (the `'recentFiles'` member of `absentWhenNull`), `frontend/src/logic/store/documentsSlice.ts`
      (state field plus both the hydrate and patch reducers),
      `frontend/src/logic/actions/actionRegistry.ts` (`ProjectedActionState.recentFiles` and its
      `open-recent`/`reopen` availability reads), `frontend/src/ui/widgets/Menubar/Menubar.tsx` and
      `Menubar/ApplicationMenubar.tsx` (`MenubarProps`, the projected-state memo, the recent-row
      rendering), `frontend/src/ui/widgets/AppShell.tsx` (the selector and `showLauncher` check), and
      `frontend/src/ui/widgets/Launcher.tsx` (`safeRecentLabel` keeps its `path: string` signature;
      callers now read `.path` and choose an icon from `.kind`).

    **Create / modify**: the files listed above. Backend and frontend must land in the same task —
    splitting them leaves the Build stage red.

    **Tests**:
    - `tests/go/integration/appmodel/recent_files_repository_sqlite_test.go` (modify) — a database
      seeded with a v1 `{"version":1,"entries":[...]}` value reads back as `RecentItem`s all of kind
      `"file"` with order preserved; the next `Promote` re-persists as `recent.files.v2`; a corrupt
      or unknown-version value still falls back to empty without an error (the existing behaviour);
      the cap is 10; `Clear` persists an empty list; folder and file entries interleave by recency.
    - `tests/go/integration/appmodel/recent_files_test.go` (modify) — MRU order and prune-missing
      still hold for a mixed list.
    - `frontend/tests/unit/widgets/Launcher.test.tsx` (modify) — `RecentItem[]` props, and a folder
      entry rendering with a folder icon.
    - `frontend/tests/integration/app.test.tsx`, `frontend/tests/integration/appShell.test.tsx`,
      `frontend/tests/e2e/launcher.test.ts`, `frontend/tests/unit/adapter/appModelAdapter.test.ts`
      and any other fixture carrying `recentFiles` (modify).

    **Out of scope**: the `RefreshRecentItems` and `ClearRecentItems` **bound methods**, the
    `RecentItemsResult` envelope and the Open Recent submenu's new rows belong to US2 (T012, T013).
    Here the repository, the wire type, the projection field and the mechanical rename change; the
    menu keeps its current shape, and a folder entry is not yet routed anywhere (T013).

    **Definition of done**: a database written by the shipped v1 build opens with its full history
    intact under the new shape, the cap is 10, `Clear` works, and no `recentFiles` identifier remains
    anywhere in `internal/` or `frontend/src/`.

    **Verify**: `scripts/verify --skip e2e`, then `scripts/test e2e` (the launcher E2E reads recents).

- [ ] T004 Add the workspace tree builder and session lifecycle commands in `internal/workspace/tree.go` and `internal/appmodel/workspace.go`

    **Story / Priority**: Foundational (US1, US2, US3, US4 and US5 all depend on it). Needs T003.

    **Requirements**: FR-003, FR-007, FR-020, FR-021, FR-022 (the tree is never persisted), FR-030,
    and the backend half of FR-001, FR-005's precondition and FR-045 · US1 AC1, AC2 · SC-003, SC-007 ·
    spec.md Edge Cases (symlink cycle; more entries than can be shown; unreadable subfolder; folder
    moved/renamed/deleted while open; opening the folder that is already open)

    **Read first**:
    - data-model.md §"Entity: internal/workspace.Node / Snapshot (pure builder output,
      pre-projection)" — the `Node`/`Snapshot` shapes, the `Build` signature and every inclusion
      rule; §"Entity: Workspace" — both code blocks, the whole **Validation / invariants** list and
      the **State transitions** table (`Unavailable` retains the last-known tree;
      `TotalEntries`/`Truncated`; no loading flag on the snapshot).
    - contracts/workspace-lifecycle.md §"Ownership", §"Snapshot and patch shape" (present-with-null
      vs. omitted; `root.path === rootPath`), §"Child ordering", §OpenWorkspace (all 7 numbered
      points — points 5–7 are explicitly the **frontend's** responsibility and must not be
      implemented here), §RefreshWorkspace, §CloseWorkspace.
    - research.md **R3** (symlinks never listed, never followed), **R4** (`os.ReadDir` over
      `filepath.WalkDir`; traversal order vs presentation order), **R9** (suffix list reused),
      **R10** (whole nested snapshot, never incrementally patched), **R14** (dot-folders vs
      dot-files), **R15** (the 20,000 bound lives in the caller, not the builder).
    - Constitution III; docs/architecture.md §"Backend and bridge owners".

    **Existing code to extend / reuse**:
    - `internal/file/paths.go:114` `IsSupportedDocumentSuffix` — the single suffix authority
      (`.md`, `.markdown`, `.mdown`, `.txt`, case-insensitive). Do not re-declare the list.
    - `internal/file/paths.go` — **note the gap**: `CanonicalizeDocumentPath` (`:57`) rejects anything
      that is not a regular file and `CanonicalizeCandidateDocumentPath` (`:81`) is built for document
      leaves. No directory canonicalization helper exists; decide where it belongs (a small exported
      helper in `internal/file/` keeps path identity with its owner) and record the decision in the
      completion note. It resolves symlinks like its document siblings (`filepath.EvalSymlinks`), and
      T007's picker result and T015's `folders` bucket reuse it, so every folder path the frontend
      holds equals `rootPath` by plain comparison.
    - `internal/apperr/results.go` — every envelope embeds `apperr.Failure` with an optional `Status`
      and `Error`. Mirror `OpenResult` (`:531`) / `OpenOutcome` (`:541`) for the outcome-alias
      convention and `AppStateSnapshot` (`:155`) / `AppStatePatch` (`:563`) for the projection
      members. `internal/apperr/classified_error.go` already has every category this task refuses
      with — add none.
    - `internal/appmodel/model.go` — `applicationState`; add the workspace field here.
    - `internal/appmodel/service.go` — `GetState` (snapshot assembly), `documentPatchLocked` (the
      patch factory to parallel), `snapshotLocked` (the rollback `before`), and the port fields on
      `AppModelService`.
    - `internal/appmodel/publish.go` — `publishLocked` / `publishPreparedLocked`; note the documented
      lock order in `internal/appmodel/doc.go` (`service.mu` → release → `publicationMu`).
    - `internal/appmodel/handler.go` — the bound-method shape (`defer bridge.Guard(&res)` +
      `bridge.Once(handler.outcomes, request, …)`, a leading `bridge.Request`, no `context.Context`
      argument, a named result) and the `AppModelServiceAPI` interface. `ClosePlanServiceAPI` is the
      precedent if an optional capability interface is preferred.
    - `internal/appmodel/file_lifecycle.go` — `CommitPreparedOpen`'s recent-promotion block, for how
      to promote with `mu` released and how a persistence failure is downgraded to a
      `ClassifiedPersistenceWarning`. Promote the opened root through T003's `RecentItemsRepository`
      with `kind: "folder"`.

    **Create / modify**:
    - `internal/workspace/tree.go` (new) — the only file in the new package: `Build`, `Node`,
      `Snapshot`. No state, no locks, no import of `internal/apperr` or `internal/appmodel`.
    - `internal/apperr/results.go` — `WorkspaceSnapshot`, `WorkspaceNode`,
      `WorkspaceResult`/`WorkspaceOutcome`, and the `Workspace` member on `AppStateSnapshot` and
      `AppStatePatch`. Only these; the other envelopes arrive with their own commands.
    - `internal/appmodel/workspace.go` (new) — `OpenWorkspace`, `RefreshWorkspace`,
      `CloseWorkspace`, the `workspace.Snapshot` → `apperr.WorkspaceSnapshot` mapping, the 20,000
      constant. Pass `showHiddenFolders = false` to `Build` for now; the persisted setting is wired
      by T007.
    - `model.go`, `service.go`, `handler.go` (modified); `internal/file/paths.go` for the directory
      helper.

    **Tests**:
    - `tests/go/unit/workspace/tree_test.go` (new), on `t.TempDir()` fixtures: a supported file with
      an uppercase suffix (`NOTES.MD`) is included and an unsupported one (`readme.png`) is not; a
      dot-file is excluded with `showHiddenFolders` both false and true, even with a supported suffix
      (`.draft.md`); a dot-folder is neither listed nor walked when false, and is listed _and_ walked
      when true; a symlink to a file and a symlink to a directory are both absent, and a symlink
      cycle terminates; within each directory folders precede files, each group A→Z
      case-insensitively with a stable tie-break; an unreadable subdirectory yields
      `Unreadable: true` with no `Children`, is **not** returned as a Go `error`, and the rest of the
      tree still builds; an unreadable _root_ returns a non-nil `error`; exactly `maxEntries`
      includable entries reports `Truncated: false`, and `maxEntries + 1` reports `Truncated: true`
      and stops counting there.
    - `tests/go/unit/apperr/` (extend) — the wire behaviour the adapter depends on: a file node
      serializes neither `unreadable` nor `children`, and the `workspace` patch member distinguishes
      omitted from explicit `null`.
    - `tests/go/integration/appmodel/workspace_test.go` (new), using `support_test.go`'s
      `recordingEmitter` / `statePatchRecorder` and a real SQLite database from `t.TempDir()` the way
      `layout_repository_test.go` does. Cases, from data-model.md's state-transition table: open
      succeeds → snapshot published, `Unavailable` false, root promoted into Recent Items with kind
      `folder`; opening the same canonical root again → `unchanged`, no reload, no second promotion;
      a path that is not a directory → `unsupported-input`, missing → `not-found`, unreadable →
      `permission-denied`; refresh reflects a file created and a file deleted since the open; refresh
      when the root is gone → `Unavailable: true`, previous tree **retained**, refusal `not-found`;
      refresh after the root is restored → `Unavailable: false`; refresh with no workspace open →
      `not-found`; close clears state and publishes an explicit `workspace: null`, and close with
      nothing open is a safe no-op; the 20,000 bound is passed to `Build` and `Truncated` reaches the
      snapshot.

    **Out of scope**: the replace-vs-new-window decision, the tab-close sequence and any knowledge of
    tabs (frontend, T008). `SetWorkspaceHiddenFolders` and the folder picker are T007. Create,
    reveal and copy-path are T020. `ClassifyDroppedPaths` is T015. The TypeScript mirrors are T006.

    **Definition of done**: `Build` satisfies every inclusion rule in data-model.md; the three
    commands behave exactly as the state-transition table says; the workspace is never written to
    disk; `OpenWorkspace` contains no tab-related precondition; `internal/workspace/` imports nothing
    from `internal/appmodel` or `internal/apperr`; Lint reports no callerless export.

    **Verify**: `scripts/test unit`, `scripts/test integration`, then `scripts/verify --skip e2e`.

- [ ] T005 Add the new-window launcher and startup folder argument in `internal/application/new_window.go` and `main.go`

    **Story / Priority**: Foundational (US1's replace prompt, US3's multi-folder prompt and US4's
    menu row are all call sites)

    **Requirements**: FR-016, FR-017, FR-022 · US4 AC1–AC3

    **Read first**:
    - contracts/workspace-lifecycle.md §"Native and filesystem ports" — the `NewWindowLauncher`
      shape, the `OpenNewWindow(folderPath)` bound method on **`ApplicationHandler`** (not
      `AppModelHandler`), the production implementation sketch, and the explicit warning that the
      startup-argument path fires **only** when a parent process passed a folder path and must never
      become the forbidden auto-restore behaviour.
    - research.md **R1** (why a process per window; ADR-0006 precedent; the macOS residual risk
      handed to quickstart §4).
    - spec.md FR-016, FR-017, FR-022 and the Assumptions bullet on "New Window".
    - docs/architecture.md ADR-0004 and ADR-0006.

    **Existing code to extend**:
    - `internal/application/handler.go` — `ApplicationHandler`, `ApplicationServiceAPI`, the optional
      `NativeCloseServiceAPI` precedent, and the `WindowReady`/`RetryStartup` bound-method shape.
      `ApplicationHandler` is already in `main.go`'s `Bind` list, so no binding registration changes.
    - `internal/application/application_context_holder.go` — `NewApplicationContextHolderWithOptions`
      (where host ports are injected) and `Init(ctx)` (phase-two DI, where repositories are wired).
    - `main.go` — `main()`, `newAppOptionsWithLogger`, and the existing `OnStartup` callback that
      calls `SetContext` → `Init` → `RestoreNativeWindow`. **There is no CLI-argument handling in
      `main.go` today** and no `flag` usage anywhere in the module.
    - `internal/appmodel` `OpenWorkspace` from T004, for the startup open.

    **Create / modify**: `internal/application/new_window.go` (new); `internal/application/handler.go`
    and `main.go` (modified).

    **Tests**: `tests/go/integration/application/new_window_test.go` (new):
    - the handler calls the injected launcher with the given path and with an empty path, returning
      `VoidResult` success;
    - a launcher error refuses with `system-command-failure` and `RemediationRetry`;
    - the bound method keeps the `bridge.Guard` + `bridge.Once` envelope (a duplicate request id runs
      the launcher once) — follow `tests/go/integration/appmodel/handler_test.go`;
    - startup-argument parsing: a single directory argument yields a pending open; no argument yields
      none; a non-directory argument is ignored rather than opening anything. Keep the parsing in a
      small testable function rather than inline in the `OnStartup` closure.

    **Out of scope**: no UI, no menu row, no action-registry change (US4/T018), no adapter wrapper
    beyond what T006 adds. The real OS spawn is reached only through the port, so it needs no
    in-package test (plan.md's exceptions list).

    **Definition of done**: `OpenNewWindow` is bound and guarded, the launcher is injected at the
    composition root, the startup path opens a folder only from an explicitly passed argument, and a
    test proves nothing is opened when no argument is present.

    **Verify**: `scripts/test integration` then `scripts/verify --skip e2e`.

- [ ] T006 Add the workspace projection and adapter surface in `frontend/src/logic/store/workspaceSlice.ts` and `frontend/src/logic/adapter/`

    **Story / Priority**: Foundational (every story's UI reads this projection)

    **Requirements**: Constitution III (Redux is a disposable projection; only
    `frontend/src/logic/adapter/` touches generated bindings) · contracts/workspace-lifecycle.md's
    patch conventions

    **Read first**:
    - contracts/workspace-lifecycle.md §"Snapshot and patch shape" — in particular that the adapter's
      `absentWhenNull` normalization list gains `'workspace'` (`'recentItems'` is already there,
      renamed by T003), and that **no loading flag exists on the snapshot**: the sidebar's loading
      state is frontend-local.
    - data-model.md §"Entity: Workspace" — the `reading: boolean` note.
    - docs/architecture.md §"Frontend composition and command owners".

    **Existing code to extend**:
    - `frontend/src/logic/store/index.ts` — the four-slice `configureStore`; register the new one.
    - `frontend/src/logic/store/documentsSlice.ts` — the canonical slice shape for this codebase:
      no local reducers, everything through `extraReducers` on `hydrateProjection`,
      `applyStatePatch` and `resetProjection`, with a `payload.revision <= state.revision` guard and
      an explicit field-by-field normalizer.
    - `frontend/src/logic/store/appModelProjectionActions.ts` — the three shared actions.
    - `frontend/src/logic/adapter/appModelAdapter.ts` — `AppModelBindings`, `AppModelAdapter`, and
      the `absentWhenNull` list with the long comment explaining why wire nulls are deleted.
    - `frontend/src/logic/adapter/index.ts` — the `commandArities` table (name → argument count,
      excluding the leading `bridge.Request`), the `command()` wrapper, the per-`apperr`-type
      `normalize*` helpers, and `createAppModelAdapter(generatedAppModelBindings, wailsRuntime)`.
    - `frontend/src/logic/adapter/bridgeGuard.ts` — `guardArity`.
    - **`OpenNewWindow` is on `ApplicationHandler`, which has no bindings object.** Its existing
      methods are bound one by one in `adapter/index.ts` (`commandInvokerRetryStartup`,
      `…WindowReady`, `…AuthorizeQuit`, `…CancelQuit`, around `:354-357`) and handed to
      `createWindowAdapter` (`windowAdapter.ts`, `WindowBindings`) and `nativeLifecycleAdapter`.
      `openNewWindow` follows that route, not `AppModelBindings`; choose the surface that exposes it
      and record why.
    - `frontend/src/logic/store/appModelTypes.ts:141-189` — `UILayout`, `AppStateSnapshot`,
      `AppStatePatch`.

    **Create / modify**: `frontend/src/logic/store/workspaceSlice.ts` (new) — the projected
    `workspace` plus a local `reading` flag that commands hold while an
    open/refresh/hidden-folders/create call is in flight; `store/appModelTypes.ts` — the structural
    mirrors of T004's `WorkspaceSnapshot`/`WorkspaceNode`/`WorkspaceResult` and the `workspace`
    snapshot/patch members; `store/index.ts`, `adapter/appModelAdapter.ts`, `adapter/index.ts`
    (modified).

    Wrap the bound methods that exist after T004/T005: `openWorkspace`, `refreshWorkspace`,
    `closeWorkspace`, `openNewWindow`. Add their `commandArities` entries. Each of the remaining nine
    bound methods is wrapped, with its TypeScript result mirror, by the **frontend** story task that
    first calls it (T008, T009, T013, T016, T021).

    **Tests**:
    - `frontend/tests/unit/store/workspaceSlice.test.ts` (new) — hydrate, patch with a snapshot,
      patch with explicit `null` clearing the workspace, patch omitting `workspace` leaving it
      unchanged, the revision guard, `resetProjection`, and the `reading` flag's lifecycle.
    - `frontend/tests/unit/adapter/appModelAdapter.test.ts` (modify) — `'workspace'` participates in
      `absentWhenNull` normalization; arity guards reject wrong argument counts. Use `frontend/tests/support/statePatches.ts`'s
      `createStatePatchDriver()` for the fake runtime.

    **Out of scope**: no components, no hooks, no action-registry change. Rendering is T009/T010.

    **Definition of done**: the slice is registered, the omitted-vs-null convention is proven by
    test, and no module outside `frontend/src/logic/adapter/` imports `wailsjs/` (the ESLint rule in
    `frontend/eslint.config.js` enforces this — a violation fails Lint).

    **Verify**: `scripts/verify --skip e2e`.

**Checkpoint**: Foundation complete. User-story work can begin.

---

## Phase 3: User Story 1 — Open a folder and browse it (Priority: P1) 🎯 MVP

**Goal**: A user opens a folder and browses its markdown/text files and subfolders in a sidebar
tree; selecting a file opens it in a tab exactly as opening a single file does today.

**Independent test**: Choose "Open Folder", pick a directory holding a mix of markdown, text and
unrelated files, and confirm the sidebar shows only the matching files and its subfolders and that
clicking a file opens it in a tab (or focuses the existing tab). Detailed walkthrough:
quickstart.md §1, §6, §7 and §8.

- [ ] T007 [US1] Add the folder picker and the hidden-folders setting in `internal/application/document_dialogs.go` and `internal/appmodel/workspace.go`

    **Story / Priority**: US1 (P1)

    **Requirements**: FR-031, FR-044 · US1 AC7 · SC-003

    **Read first**:
    - contracts/workspace-lifecycle.md §ChooseWorkspaceFolder (opens nothing; returns the canonical
      path, and why that matters) and
      §SetWorkspaceHiddenFolders (all 4 numbered points, and the filtering rules restated beneath).
    - data-model.md §"Entity: Workspace" — the `ShowHiddenFolders` invariant, and the state-transition
      rows for `SetWorkspaceHiddenFolders` with and without a workspace open.
    - research.md **R14** in full (the `.git` driver; app-wide persistence; only the flipping window
      re-reads).
    - spec.md FR-031, FR-044, US1 AC7.

    **Existing code to extend**:
    - `internal/application/document_dialogs.go` — `DocumentDialogs` holds `openFilePicker`,
      `saveFilePicker` and `overwriteConfirmer` func types with setters. **There is no directory
      picker today**; add one following the same injected-func pattern.
    - `main.go` — where `runtime.OpenFileDialog` / `runtime.SaveFileDialog` / `runtime.MessageDialog`
      are injected; inject `runtime.OpenDirectoryDialog` the same way, with the default directory set
      to the user's home folder (FR-044).
    - `internal/appmodel/layout_repository.go` — the field-constant block already holds
      `LayoutWorkspaceVisible = "workspace.visible"` and `LayoutWorkspaceWidth = "workspace.width"`;
      add `LayoutWorkspaceHiddenFolders = "workspace.showHiddenFolders"` beside them.
    - `internal/appmodel/layout_repository_sqlite.go` — `validateVersionedLayoutValue` whitelists
      layout fields and rejects unknown ones at write time. **The new field must be added there as a
      bool or every write is refused.** `LayoutWorkspaceVisible`'s bool case is the template.
    - `LayoutRepositoryAPI` reads and writes one field at a time. Read the setting from the
      repository **at every build** (open, refresh, flip, create), never from a value cached at
      startup: the contract's point 4 and FR-031 have an already-open window pick up another window's
      change the next time it reads its folder. Do **not** add the field to `RestoreUILayout`'s list
      in `internal/appmodel/service.go` or to `apperr.UILayout` — the snapshot's `showHiddenFolders`
      is its only projection.
    - `internal/appmodel/workspace.go` (from T004) — `SetWorkspaceHiddenFolders` rebuilds this
      window's snapshot with the new value.

    **Create / modify**: `document_dialogs.go`, `main.go`, `layout_repository.go`,
    `layout_repository_sqlite.go`, `workspace.go`, `handler.go`, and `internal/apperr/results.go` for
    the `FolderChoiceResult`/`FolderChoiceOutcome` envelope (`chosen { path }` / `cancelled` /
    `refused`) that `ChooseWorkspaceFolder` returns. `OpenWorkspace` and `RefreshWorkspace` (T004)
    stop passing a constant `false` and build with the persisted value.

    **Tests**:
    - `tests/go/integration/appmodel/layout_repository_test.go` (modify) — the new field round-trips
      as a bool, defaults to `false`, and a non-bool value is refused.
    - `tests/go/integration/appmodel/workspace_test.go` (modify) — flipping the switch on re-reads the
      folder so a dot-folder's supported documents appear while dot-files stay hidden; flipping it off
      re-reads again; `SetWorkspaceHiddenFolders` with no workspace open is refused `not-found` and
      persists nothing; `OpenWorkspace` builds with the persisted value.
    - `tests/go/integration/application/dialogs_test.go` (modify) — the folder picker returns the
      chosen path, reports cancellation as `cancelled`, and opens nothing.
    - `tests/go/integration/appmodel/workspace_test.go` — `ChooseWorkspaceFolder` answers the
      **canonical** path: a folder picked through a symlinked parent equals the `rootPath`
      `OpenWorkspace` reports for it. A window whose stored setting was changed by another writer
      builds with the new value on its next `RefreshWorkspace`.

    **Out of scope**: the sidebar switch control and the Open Folder button are T009; the open
    orchestration that consumes a chosen path is T008. No change to the fixed document-type filter
    (FR-004) — the switch governs dot-folders only.

    **Definition of done**: the setting survives a relaunch, applies to windows opened afterwards,
    and re-reads only in the window that flipped it; the picker starts at the home folder and opens
    nothing by itself.

    **Verify**: `scripts/test integration` then `scripts/verify --skip e2e`.

- [ ] T008 [US1] Build the folder open/close orchestration and its prompts in `frontend/src/app/useCommands.ts` and `frontend/src/ui/widgets/dialogs/`

    **Story / Priority**: US1 (P1)

    **Requirements**: FR-001, FR-023, FR-024, FR-025, FR-026, FR-027 · US1 AC3 (the folder itself
    opens no files) · spec.md Edge Cases (same folder already open; cancelling a save part-way
    through a replacement)

    **Read first**:
    - contracts/workspace-lifecycle.md §OpenWorkspace **points 5, 6 and 7** — the frontend owns the
      replace decision and the tab-close ordering; `OpenWorkspace` is never called speculatively or
      in parallel with the close sequence — and §CloseWorkspace's second paragraph.
    - contracts/workspace-tree-ui.md §WorkspaceReplacePrompt and §CloseFolderPrompt (exact choice
      sets and semantics; one component per decision, every call site).
    - research.md **R7** (one prompt, four call sites), **R12** (Close Folder, two affordances, three
      choices), **R13** (tabs close first; a cancel abandons the whole switch — stated there as a
      call-order constraint, not just behaviour).
    - spec.md FR-023 through FR-027; quickstart.md §7.

    **Existing code to extend**:
    - `frontend/src/app/useCommands.ts` — the uniform command pattern (`flushActiveDocument()` →
      `activation.begin()` → adapter call → `activation.acknowledge(...)` → `reportEntryError(...)`)
      and the `EntryCommandOutcome` shape.
    - `frontend/src/app/useCloseWorkflow.ts` and `frontend/src/app/closeWorkflow.ts` — the existing
      per-document save-or-discard close flow. **Reuse it verbatim**; this feature adds no second
      close path. `onCloseDocument(documentId, expectedTabSetRevision, kind, targetDocumentIds)`
      already accepts the close-plan kind `'window'` (every document in this window), which the
      backend supports end to end but no frontend caller uses yet — that is the close-all entry point,
      not a loop of single closes. `useWorkflowPrompts.ts` owns prompt priority.
    - `frontend/src/ui/widgets/dialogs/ClosePrompt.tsx` — the `ModalShell` dialog skeleton both new
      prompts copy (`dismiss`, focus management, busy-guarded buttons).
    - `frontend/src/app/useAppPresentation.ts` — `menuState` is built by spreading `...commands`, so a
      new command reaches the menubar through there.
    - `frontend/src/logic/actions/actionRegistry.ts` — `'open-folder'` is currently declared with
      `availability: fileDeferred`; flip it to available. Note `fileDeferred` is shared, so change the
      entry, not the helper.
    - `frontend/src/ui/widgets/Menubar/Menubar.tsx` — `FILE_ACTIONS_WITH_INVOKERS` deliberately omits
      `open-folder` and `new-window`; `actionsForSurface('file-menu')`, `fileActionDisabled` and
      `dispatchFileAction` are the rows' plumbing. Add a `close-folder` action id (in
      `actionRegistry.ts`, beside `open-folder`) and its row.
    - `frontend/src/ui/widgets/Launcher.tsx:60-62` — the Launcher's **Open Folder** button is
      hard-coded `disabled` with the "unavailable" title. Once the action is available it must
      dispatch the same `'open-folder'` registry action as the File-menu row, or the two surfaces
      disagree about one action (Constitution VI).
    - `frontend/src/logic/adapter/appModelAdapter.ts` and `adapter/index.ts` — wrap
      `chooseWorkspaceFolder` (T007) with its `commandArities` entry, and mirror `FolderChoiceResult`
      in `appModelTypes.ts`.
    - `frontend/src/logic/store/workspaceSlice.ts` (T006) — hold its `reading` flag around the
      `openWorkspace` call so the sidebar shows its loading state (FR-033).
    - `frontend/src/logic/store/uiLayoutCommands.ts` — `setWorkspaceVisible`; FR-027's "the sidebar
      becomes visible whenever a folder opens" dispatches this **existing** command, not a second
      visibility mechanism. Dispatch it from **one** place, in reaction to the projected
      `workspace.rootPath` appearing or changing — that covers the menu, Open Recent, Reopen Last, a
      drop, and a window that hydrates with a folder already open — rather than once per entry point.
    - The same-folder test is plain string equality between the path in hand and
      `workspace.rootPath`: every folder path the backend returns is canonical
      (contracts/workspace-lifecycle.md §ChooseWorkspaceFolder). Do not normalize paths in the
      frontend.
    - `frontend/src/logic/store/notificationsSlice.ts` — add the `'open-folder'`
      `NotificationRemediationIntent` member, per data-model.md.

    **Create / modify**: `frontend/src/ui/widgets/dialogs/WorkspaceReplacePrompt.tsx` (new),
    `frontend/src/ui/widgets/dialogs/CloseFolderPrompt.tsx` (new); `frontend/src/app/useCommands.ts`,
    `frontend/src/app/useAppPresentation.ts`, `frontend/src/app/AppDialogs.tsx`, `actionRegistry.ts`,
    `notificationsSlice.ts`, `Menubar.tsx`, `Launcher.tsx`, the two adapter files,
    `appModelTypes.ts`, `en.json`.

    **Tests**:
    - `frontend/tests/unit/widgets/dialogs/WorkspaceReplacePrompt.test.tsx` (new) and
      `CloseFolderPrompt.test.tsx` (new) — all three choices, busy guarding, Escape dismissal.
    - `frontend/tests/unit/actions/registryCatalogue.test.ts` (modify) — this suite asserts the
      **exact ordered list of every action id**, so `close-folder` (and any other new id) must be
      added there or Unit fails.
    - The suites that pin Open Folder as deferred today, all of which this task must update because
      this is the task that makes it available: `frontend/tests/unit/actions/actionRegistry.test.ts`
      (the deferred loop near `:152` — move `'open-folder'` to the available loop and leave
      `'new-window'` deferred for T018), `frontend/tests/unit/widgets/Launcher.test.tsx` (`:16`,
      `:37`), `frontend/tests/e2e/deferred-controls.test.ts` (title and `:23`) and
      `frontend/tests/e2e/launcher.test.ts` (`:26`).
    - The two suites that pin the File menu's exact row list, which the new Close Folder row changes:
      `frontend/tests/integration/menubar.legacy.test.tsx` (the label list near `:199-212`) and the
      ordered `file-menu` id list in `frontend/tests/unit/actions/actionRegistry.test.ts` (near
      `:136-148`).
    - `frontend/tests/integration/workspace.test.tsx` (new, extended later by T011) — the
      orchestration cases: opening the folder already open is a no-op with no prompt; opening a
      different folder raises the prompt; choosing replace closes every tab **before**
      `openWorkspace` is called; **cancelling any save prompt leaves `openWorkspace` uncalled, the
      old folder open and every not-yet-closed tab open**; Close Folder's three choices behave per
      the contract, and with no document open it closes the folder without raising the prompt; the
      sidebar becomes visible on every successful open — **including a window that
      hydrates with a `workspace` already present**, which is how a window launched by T005 with a
      folder argument starts (contracts/workspace-tree-ui.md §Sidebar lists that route under FR-027).

    **Out of scope**: the tree itself, the sidebar header `×` button and the Refresh and
    hidden-folders commands (T009). Recent-entry and
    drop call sites are US2 (T013) and US3 (T016) — they will reuse these two components; do not
    build a second copy. The `'new-window'` menu row is US4 (T018), but the prompt's "Open in New
    Window" choice must already call T005's `openNewWindow` command.

    **Definition of done**: one replace prompt component and one close prompt component exist; the
    cancel-abandons-the-switch ordering is proven by a test that asserts `openWorkspace` was never
    called; the File menu's Open Folder row and the Launcher's Open Folder button are both live and
    dispatch the same action; no suite still pins Open Folder as deferred.

    **Verify**: `scripts/verify` (all six stages — two E2E suites pin the deferred state).

- [ ] T009 [US1] Build the sidebar tree container and its states in `frontend/src/ui/widgets/WorkspaceTree/WorkspaceTree.tsx`

    **Story / Priority**: US1 (P1)

    **Requirements**: FR-002, FR-004, FR-006, FR-007, FR-021, FR-028, FR-032, FR-033 · US1 AC4, AC5,
    AC6, AC8 · SC-002 · spec.md Edge Cases (folder unavailable; truncation)

    **Read first**:
    - contracts/workspace-lifecycle.md §RefreshWorkspace and §SetWorkspaceHiddenFolders (point 1: the
      switch exists only while a folder is open).
    - contracts/workspace-tree-ui.md §Sidebar, §WorkspaceTree in full — the header's five controls,
      all five body states, the truncation indicator's exact character (a plain, non-dismissible
      inline row, not a banner or toast), the filter-chip footer and the explicit reason **not** to
      build it on `Segmented`, and the expansion/selection rules (local `useState`, never Redux,
      never persisted; root expanded initially; expansion and selection survive a refresh).
    - data-model.md §"Entity: Workspace" — `filterSuffixes`, `truncated`, `unavailable`,
      `totalEntries`, and the note that the loading state is frontend-local.
    - research.md **R11** (no new popup/modal/menu primitive), **R15** (loading state replaces the
      timing promise), **R19** (no search box — an absence by decision, not an oversight).
    - spec.md FR-002, FR-004, FR-006, FR-007, FR-021, FR-028, FR-032, FR-033; quickstart.md §1.

    **Existing code to extend**:
    - `frontend/src/ui/widgets/WorkspaceLayout.tsx` — renders `<Sidebar>` with **no children today**;
      pass `<WorkspaceTree />`. Width and visibility keep flowing from `uiLayoutCommands`; do not
      touch sidebar chrome.
    - `frontend/src/ui/components/Sidebar/Sidebar.tsx` — the component contract is unchanged.
    - `frontend/src/ui/primitives/ToolButton/ToolButton.tsx` — `variant` `'icon' | 'text'`; the
      hidden-folders switch is a `ToolButton` in its toggle form with `aria-pressed`.
    - `frontend/src/ui/primitives/Banner.tsx` — the unavailable state.
    - `frontend/src/ui/primitives/Button/Button.tsx` — the empty state's Open Folder button, which
      dispatches the **same** `'open-folder'` registry action the File-menu row does.
    - `frontend/src/ui/primitives/Icon/Icon.tsx` — the icons added in T002.
    - `frontend/src/logic/store/workspaceSlice.ts` (T006) — read via `useAppSelector`. Note the
      ESLint boundary: `ui/components/**` and `ui/primitives/**` may not import the store, so all of
      this belongs under `ui/widgets/`.
    - `frontend/src/app/useCommands.ts` — this task adds the two commands the header dispatches,
      `onRefreshWorkspace` and the hidden-folders command, in the file's uniform command pattern, each
      holding `workspaceSlice`'s `reading` flag while its call is in flight. Wrap
      `setWorkspaceHiddenFolders` (T007) in `adapter/appModelAdapter.ts` and `adapter/index.ts` with
      its `commandArities` entry, and add the `'refresh-workspace'` `NotificationRemediationIntent`
      member (data-model.md). Close and Open Folder dispatch the actions T008 built.
    - `frontend/src/ui/styles/tokens.css` and any co-located `*.module.css` — stylelint forbids raw
      colour literals anywhere.

    **Create / modify**: `WorkspaceTree/WorkspaceTree.tsx`, `WorkspaceTree/WorkspaceEmptyState.tsx`,
    `WorkspaceTree/HiddenFoldersToggle.tsx`, `WorkspaceTree/WorkspaceTree.module.css`, and a minimal
    `WorkspaceTree/WorkspaceTreeNode.tsx` (all new); `WorkspaceLayout.tsx`, `useCommands.ts`,
    `useAppPresentation.ts`, the two adapter files, `notificationsSlice.ts` and `en.json` (modified).

    `WorkspaceTree.tsx` owns the `expandedPaths` set and the selected path (local `useState`): root
    expanded initially, Collapse all, and survival across a snapshot swap are this task's. The node
    component here renders only a label and its children according to `expandedPaths`, enough to
    prove those behaviours; T010 replaces it with the real row.

    **Tests**: `frontend/tests/unit/widgets/WorkspaceTree/WorkspaceTree.test.tsx` (new) —
    no folder open renders the "No folder open" message and a working Open Folder button; a read in
    flight renders the loading state instead of the tree; with no folder open the header's controls
    are absent; `unavailable` renders the banner with Close and Retry; `totalEntries === 0` renders the root row plus the empty-result message; `truncated`
    renders the persistent truncation row and no true total; the filter chips render
    `workspace.filterSuffixes` and are non-interactive; the header exposes Refresh, the hidden-folders
    toggle with correct `aria-pressed`, Collapse all, and Close; Collapse all returns the tree to the
    just-opened shape; expansion and selection survive a snapshot swap.

    **Out of scope**: row icons, marks, click and keyboard interaction are T010. The header **"+"
    button is deliberately deferred to US5 (T021)**; do not add it here. No search or filter box,
    ever (R19).

    **Definition of done**: every body state in the contract renders, the truncation row is persistent
    and non-dismissible, the filter chips are read-only, and nothing in this component re-sorts the
    snapshot's children.

    **Verify**: `scripts/verify --skip e2e`.

- [ ] T010 [US1] Build the tree rows, their interaction and the keyboard model in `frontend/src/ui/widgets/WorkspaceTree/WorkspaceTreeNode.tsx`

    **Story / Priority**: US1 (P1)

    **Requirements**: FR-005, FR-020, FR-029, FR-030, FR-034, FR-042, FR-043, FR-045 · US1 AC1, AC2,
    AC3, AC9 · SC-001, SC-007

    **Read first**:
    - contracts/workspace-tree-ui.md §WorkspaceTreeNode (props, interaction rules, the three
      independent row marks) and §"Keyboard model (agreed scope: basic)" — including what is
      explicitly **out** of scope by decision: arrow-key expand/collapse, type-ahead, and any
      keyboard route to the context menu.
    - research.md **R18** (row marks are computed in the frontend from already-projected document
      state; putting them on the snapshot would be actively wrong), **R17** (a single open at the
      limit is refused, unlike a batch drop).
    - data-model.md §"New `ClassifiedError` / notification vocabulary" — the rows for a tree file that
      no longer exists (`not-found`) and for the 40-document limit (`capacity-limit`).
    - spec.md FR-005, FR-020, FR-029, FR-030, FR-034, FR-042, FR-043, FR-045; US1 AC9;
      quickstart.md §1 ("a row whose file is gone") and §6.

    **Existing code to extend**:
    - `frontend/src/app/useCommands.ts` — `onOpenRecentFile(path, expectedTabSetRevision)` is the
      existing path-keyed open command backed by `OpenPath`; the tree opens files through the same
      canonical lifecycle rather than a new one.
    - `internal/appmodel/file_lifecycle.go` — `maxOpenDocuments = 40` and the existing capacity
      refusal wording; this task surfaces that refusal, it does not change the limit.
    - `frontend/src/logic/store/documentsSlice.ts` — `byId` metadata (paths, dirty state) is the
      source for the open-highlight and unsaved-dot marks.
    - `frontend/src/ui/widgets/DocumentTabs/DocumentTabs.tsx` — precedent for reading projected
      document state in a widget.
    - `frontend/src/ui/primitives/Icon/Icon.tsx` — the existing `file` icon, and `folder`, `chevron`
      and `warning` from T002.
    - `frontend/src/app/useCommands.ts` — `onRefreshWorkspace` from T009, for the automatic re-read
      after a stale-row open.

    **Create / modify**: `WorkspaceTree/WorkspaceTreeNode.tsx` (replace T009's minimal node with the
    contract's full row); `WorkspaceTree.tsx` and `WorkspaceTree.module.css` (modified) for the
    keyboard handler, the focused row and the row wiring. The `expandedPaths`/selection state already
    exists from T009 — extend it, do not re-create it.

    **Tests**: `frontend/tests/unit/widgets/WorkspaceTree/WorkspaceTreeNode.test.tsx` (new) —
    the root row renders at depth 0, is collapsible and behaves as an ordinary folder row; children
    render in the received order and are never re-sorted; clicking a file row opens it, clicking it
    again focuses the existing tab; clicking a readable folder row toggles expansion; clicking an
    `unreadable` folder row selects it and does **not** attempt to expand; the unreadable badge
    renders; the selection, open-highlight and unsaved-dot marks are independent and can coexist;
    opening at the 40-document limit is refused with a message naming the remedy and opens no tab;
    selecting a row whose file is gone opens no tab, reports it, and triggers a refresh. Keyboard:
    Tab reaches the tree as one tab stop, Up/Down move between **visible** rows only, Enter opens a
    focused file row and toggles a focused folder row, and Left/Right do nothing.

    **Out of scope**: the right-click menu is US5 (T021) — wire an `onContextMenu` prop but render no
    menu here. No rename, move or delete affordance may exist in any form (FR-019, ADR-0033).

    **Definition of done**: every interaction in the contract's table behaves as written, the
    keyboard model matches the agreed scope exactly (neither less nor more), and the row marks come
    from projected state with no new backend query.

    **Verify**: `scripts/verify --skip e2e`.

- [ ] T011 [US1] Verify User Story 1 end to end in `frontend/tests/integration/workspace.test.tsx` and `frontend/tests/e2e/workspace-tree.test.ts`

    **Story / Priority**: US1 (P1)

    **Requirements**: all US1 acceptance scenarios AC1–AC9 · SC-001, SC-002, SC-003, SC-007 ·
    FR-001–FR-007, FR-020, FR-021, FR-023–FR-034, FR-042–FR-045

    **Read first**: quickstart.md §0 (the fixture), §1 (User Story 1 in full), §6 (keyboard),
    §7 (closing and replacing), §8 (edge cases), §9 (automated stages). spec.md §"User Story 1" and
    §"Edge Cases". AGENTS.md "Development loop" step 4 — a green stage is necessary but not
    sufficient; trace each acceptance criterion to the code path that implements it and exercise the
    real application.

    **Existing code to extend**:
    - `frontend/tests/support/harness.ts` — the real-backend E2E harness (`E2EAppHarness`:
      `writeDocument`, `seedRecents`, `launch`, `relaunch`, `teardown`; spawns `wails dev` against an
      isolated temp HOME). The harness cannot drive native dialogs. `real-files.test.ts` gets round
      that for files by seeding recents and clicking the real Recents UI; a folder has no such route
      until US2 routes folder entries, so add **one** harness helper that opens a folder against the
      real backend — the `OpenWorkspace(path)` binding called from the page with a proper request
      envelope, or a launch with T005's startup folder argument — and record which and why
      (contracts/workspace-lifecycle.md §ChooseWorkspaceFolder).
    - `frontend/tests/integration/appShell.test.tsx` — the local `renderWithProviders` convention
      (mock the adapter module, dispatch `hydrateProjection` on the real store, reset in
      `beforeEach`/`afterEach`).

    **Create / modify**: `frontend/tests/integration/workspace.test.tsx` (extend what T008 started),
    `frontend/tests/e2e/workspace-tree.test.ts` (new).

    **Tests**: E2E must cover, against a real fixture folder created by the test: the filtered tree's
    content and ordering; the root row as the first row; subfolders starting collapsed; opening a
    file and re-focusing its tab; the empty-result message; the "no folder open" empty state and its
    Open Folder button; Refresh picking up a created and a deleted file while preserving expansion
    and selection; the hidden-folders switch revealing a dot-folder's document while a dot-file stays
    hidden, and persisting across a `relaunch()`; the unreadable-subfolder indicator with the rest of
    the tree still browsable; the stale-row path; and the Close Folder and replace prompts from §7
    including the cancel-abandons case.

    **Real-application check** (AGENTS.md step 4): walk quickstart §1, §6, §7 and §8 in the running
    app. Drive it with the session's computer-use tooling if that tooling is available; check
    availability first rather than assuming it. If it is not available, say so plainly and ask the
    user to perform the walkthrough — do not skip it and do not claim it was done.

    **Out of scope**: drag-and-drop (US3), multi-window (US4), the context menu and create flows
    (US5), and the Recent submenu's new shape (US2). Truncation at 20,000 is covered by T004's unit
    tests; do not build a 20,001-file E2E fixture.

    **Definition of done**: every US1 acceptance scenario has a named passing test or a recorded
    walkthrough result; `scripts/verify` is green; `scripts/baseline --compare` shows no regression.

    **Verify**: `scripts/verify` then `scripts/baseline --compare`.

**Checkpoint**: User Story 1 is fully functional and independently testable — this is the MVP.

---

## Phase 4: User Story 2 — Return to recent work (Priority: P2)

**Goal**: A user gets back to previously opened folders and files from "Open Recent", or reopens the
single most recent item with one action.

**Independent test**: Open a folder, close the app or the folder, then confirm the folder appears
under "Open Recent" and that "Reopen Last" reopens it directly. Walkthrough: quickstart.md §2.

- [ ] T012 [US2] Add the recent-items commands and the Reopen Last fallback in `internal/appmodel/recent_files.go` and `internal/appmodel/file_lifecycle.go`

    **Story / Priority**: US2 (P2)

    **Requirements**: FR-008 (the cross-window re-read), FR-009, FR-010 · US2 AC2, AC3, AC6

    **Read first**:
    - contracts/workspace-lifecycle.md §RefreshRecentItems, §ClearRecentItems, and
      §"ReopenLastFile (extends the 003 contract's version)" — all three numbered points, including
      why the backend must **not** call `OpenWorkspace` for a folder target.
    - data-model.md §"Entity: ReopenLast fallback state" — the `canReopenLastFile` formula and the
      `folder-target { path }` status.
    - research.md **R5** (menu surface and refresh timing: read-on-menu-open, no cross-process
      broadcast), **R6** (one command, one row, resolved by session).
    - spec.md FR-008, FR-009, FR-010; US2 AC2, AC3, AC6.

    **Existing code to extend**:
    - `internal/appmodel/recent_files.go` — `refreshRecentFiles` (today called only from `GetState`)
      and `publishRecentFiles`. The contract says to back `RefreshRecentItems` with **these two
      functions**, generalized by T003 — no second read path.
    - `internal/appmodel/file_lifecycle.go` — `ReopenLastFile`: the `recentlyClosed[0]` path,
      the `os.Stat` pre-check, the `OpenPath` re-read and the `DocView` restore. Step 1 is shipped
      behaviour and must stay unchanged; steps 2 and 3 are new.
    - `canReopenLastFile` has exactly two writers today, both computing it from `recentlyClosed`
      alone: `removeClosedEntryLocked` in `internal/appmodel/tab_session.go` (reached by
      `consumeClosedEntry`) and `closeDocuments` in `internal/appmodel/close_plan.go`. Both adopt the
      new formula — and because the formula now reads `recentItems`, the flag must also be recomputed
      wherever that list changes: the file promotion in `CommitPreparedOpen`, the folder promotion in
      `OpenWorkspace` (T004), `RefreshRecentItems` and `ClearRecentItems`.
    - `internal/apperr/results.go` — `OpenStatus` (`:521`) holds lowercase single-word values today;
      add `folder-target`, and make sure `OpenResult` can carry the folder path. Add the
      `RecentItemsResult` envelope here too.
    - `internal/appmodel/handler.go` — bind `RefreshRecentItems` and `ClearRecentItems` in the usual
      guarded shape and extend `AppModelServiceAPI`.
    - The `RecentItemsRepository.Clear` added by T003.

    **Create / modify**: `recent_files.go`, `file_lifecycle.go`, `tab_session.go`, `close_plan.go`,
    `workspace.go`, `handler.go`, `internal/apperr/results.go`, `recent_files_repository*.go` if
    `Clear` needs a service-level wrapper.

    **Tests**: `tests/go/integration/appmodel/recent_items_test.go` (new) plus modifications to
    `recent_files_test.go`:
    - `RefreshRecentItems` re-reads the stored list and publishes a patch **only when it differs**
      from the in-memory copy; a second window's write becomes visible after the call; stale entries
      are pruned on that read;
    - `ClearRecentItems` empties the list, publishes `recentItems: []` and recomputes
      `canReopenLastFile`;
    - `ReopenLastFile` with a non-empty `recentlyClosed` behaves exactly as before (regression);
    - with an empty `recentlyClosed` and a file at the head of Recent Items, it opens that document;
    - with an empty `recentlyClosed` and a **folder** at the head, it opens **nothing** and returns
      `folder-target { path }`;
    - with an empty `recentlyClosed` and a file head whose path is gone, it refuses `not-found` and
      opens nothing;
    - with both sources empty it refuses `not-found`;
    - `canReopenLastFile` is true when either source is non-empty, including straight after the
      first file or folder of a fresh profile is opened.

    **Out of scope**: the submenu's labels, icons, Clear Recent row and confirmation, and the routing
    of `folder-target` into the open-folder orchestration, are all T013.

    **Definition of done**: the shipped undo-close behaviour is provably unchanged, the folder case
    opens nothing in the backend, and `canReopenLastFile` uses the new formula everywhere it is set.

    **Verify**: `scripts/test integration` then `scripts/verify --skip e2e`.

- [ ] T013 [US2] Rebuild the Open Recent submenu and Reopen Last routing in `frontend/src/ui/widgets/Menubar/Menubar.tsx`

    **Story / Priority**: US2 (P2)

    **Requirements**: FR-008, FR-009, FR-010, FR-026 (the recent-folder call site) · US2 AC1, AC4,
    AC5, AC6 · SC-004

    **Read first**:
    - research.md **R5**'s final paragraph — the three settled details: a Clear Recent row at the
      bottom with a short confirmation and no per-entry removal; name-only labels with the full path
      on hover; each window re-reads the stored list when **its own** File menu opens.
    - contracts/workspace-lifecycle.md §RefreshRecentItems, §ClearRecentItems,
      §"ReopenLastFile" point 2 (the frontend routes a `folder-target` through the same open-folder
      orchestration an Open Recent folder entry uses).
    - contracts/workspace-tree-ui.md §WorkspaceReplacePrompt — "One component, every call site".
    - spec.md FR-008, FR-009, FR-010, FR-026; US2 AC1, AC4, AC5; quickstart.md §2.

    **Existing code to extend**:
    - `frontend/src/ui/widgets/Menubar/Menubar.tsx` — `fileMenuSeparators`,
      `FILE_ACTIONS_WITH_INVOKERS`, the `projectedState` memo feeding `getActionAvailability`, the
      recent-row rendering and its empty message, and `dispatchRecentFile`. The file-menu open handler
      is where `RefreshRecentItems` is called. The rows are cut to six by a literal `slice(0, 6)`
      (near `:374`); the projected list is already bounded, so show all of it.
    - `frontend/src/ui/widgets/Menubar/ApplicationMenubar.tsx` — `ApplicationMenuState` and the store
      selectors.
    - `frontend/src/ui/components/MenuItem/MenuItem.tsx` — `icon`, `trailing` and `submenu` props for
      the kind icon; it spreads the remaining button attributes, so the full-path `title` needs no
      component change.
    - `frontend/src/logic/actions/actionRegistry.ts` — the `'open-recent'` and `'reopen'` availability
      checks now read `recentItems` (renamed by T003); add a `'clear-recent'` id.
    - `frontend/src/ui/widgets/dialogs/WorkspaceReplacePrompt.tsx` (T008) — **reuse it** for a recent
      folder entry and for a `folder-target` Reopen Last. Do not add a second decision path.
    - `frontend/src/ui/widgets/Launcher.tsx` — `safeRecentLabel`, already adjusted by T003. The
      Launcher lists the same recents and today sends every entry to `onOpenRecentFile`; a **folder**
      entry there must take the same route as a folder entry in the submenu — one routing by `kind`,
      shared by both surfaces.
    - `frontend/src/logic/adapter/appModelAdapter.ts` and `adapter/index.ts` — wrap
      `refreshRecentItems` and `clearRecentItems` (T012) with their `commandArities` entries; mirror
      `RecentItemsResult` and the `folder-target` status in `appModelTypes.ts`.
    - `frontend/src/logic/store/notificationsSlice.ts` — the remediation intent for an unavailable
      recent entry.

    **Create / modify**: `Menubar.tsx`, `ApplicationMenubar.tsx`, `Launcher.tsx`, `AppShell.tsx` if
    the Launcher's callback changes shape, `actionRegistry.ts`, `useCommands.ts` (the refresh/clear
    commands and the by-kind recent open), the two adapter files, `appModelTypes.ts`, `en.json`.

    **Tests**:
    - `frontend/tests/unit/actions/registryCatalogue.test.ts` (modify) — add `'clear-recent'` to the
      exact ordered id list. If the id is registered on the `'file-menu'` surface, the two suites
      that pin the File menu's row list change too (`menubar.legacy.test.tsx`, and the ordered list
      in `actionRegistry.test.ts`).
    - `frontend/tests/integration/menubar.test.tsx` (modify or add a focused suite) — rows are
      labelled with the name only and expose the full path on hover; file and folder entries render
      distinct icons; the list is most-recent-first and never exceeds 10; opening the File menu calls
      `RefreshRecentItems`; the Clear Recent row raises a confirmation and then empties the submenu;
      selecting a recent **folder** while a different folder is open raises the shared replace prompt;
      selecting an entry whose path is gone reports it and the entry is absent on the next read;
      Reopen Last is enabled while either source is non-empty, and a `folder-target` result is routed
      into the open-folder orchestration rather than opening a tab.
    - `frontend/tests/unit/widgets/Launcher.test.tsx` (modify) — a folder entry opens through the
      folder orchestration, a file entry through the file open.

    **Out of scope**: no per-entry removal (research.md R5). No cross-window messaging — the shared
    SQLite store plus read-on-menu-open is the whole mechanism. Do not change the replace prompt built
    in T008.

    **Definition of done**: the submenu matches R5's three settled details, every folder call site
    goes through the one shared prompt, and Reopen Last never opens a tab for a folder target.

    **Verify**: `scripts/verify --skip e2e`.

- [ ] T014 [US2] Verify User Story 2 end to end in `frontend/tests/e2e/workspace-tree.test.ts` and `frontend/tests/e2e/launcher.test.ts`

    **Story / Priority**: US2 (P2)

    **Requirements**: US2 AC1–AC6 · FR-008, FR-009, FR-010 · SC-004

    **Read first**: quickstart.md §2 in full (all seven numbered checks, including the 11-distinct-
    paths cap check and the cross-window check) and §9. spec.md §"User Story 2".

    **Existing code to extend**: `frontend/tests/support/profile.ts` — `seedRecents` shells out to
    `go run ./tools/e2e-seed <profile> seed-recents <files…>`; check whether it needs a folder-kind
    form and extend `tools/e2e-seed` if so. `frontend/tests/e2e/launcher.test.ts` already asserts the
    recents list (its Open Folder assertion was updated by T008). `tools/e2e-seed/main.go` writes the
    v1 shape (`recent.files.v1`, string entries), which still reads back as file entries through
    T003's migration; seeding a **folder** entry needs the v2 shape.

    **Create / modify**: the two E2E suites above; `tools/e2e-seed/main.go` only if seeding folders
    requires it.

    **Tests**: E2E coverage of the submenu's order, cap, labels and icons; Reopen Last within a
    session (undo-close) and after `relaunch()` (recent head); Clear Recent; an unavailable entry.
    The two-window cross-window check (AC6) belongs to the manual walkthrough, not the harness.

    **Real-application check**: walk quickstart §2 in the running app, including step 4's two-window
    check and step 6's cap check. Use computer-use tooling if available; otherwise state that it is
    not and ask the user to run it.

    **Out of scope**: no new production code. If a gap is found, record it and fix it as an explicit
    follow-up rather than widening this task.

    **Definition of done**: every US2 acceptance scenario has a passing test or a recorded walkthrough
    result; `scripts/verify` green; `scripts/baseline --compare` clean.

    **Verify**: `scripts/verify` then `scripts/baseline --compare`.

**Checkpoint**: User Stories 1 and 2 both work independently.

---

## Phase 5: User Story 3 — Open by dragging files or folders in (Priority: P3)

**Goal**: A user drags files or a folder from the OS file manager onto the window to open them.

**Independent test**: Drag a single markdown file onto the window and confirm it opens as a tab;
drag a folder and confirm it opens as the window's folder. Walkthrough: quickstart.md §3.

- [ ] T015 [US3] Add drop classification and enable native file drop in `internal/appmodel/workspace.go` and `internal/application/options.go`

    **Story / Priority**: US3 (P3)

    **Requirements**: FR-011, FR-015 (the backend half) · the classification rules behind FR-012–FR-014

    **Read first**:
    - contracts/workspace-lifecycle.md §ClassifyDroppedPaths (pure classification, no side effects,
      no state mutation — the frontend is solely responsible for what happens next; the `folders`
      bucket is canonical) and the `DragAndDropOption` block at the end of §"Native and filesystem
      ports" — dropped paths reach the frontend through the generated runtime's `OnFileDrop`, which
      T016 subscribes to; there is **no Go-side drop callback**.
    - data-model.md §"Entity: DropClassificationResult" — the three-way bucketing rules.
    - research.md **R2** (why Go-side involvement is deliberately minimal, and when the `main.go`
      re-emit fallback would apply).
    - spec.md FR-011, FR-015.

    **Existing code to extend**:
    - `internal/application/options.go` — `NewOptions` builds the Wails `options.App`. **No
      `DragAndDrop` option is set anywhere in the module today**; add `EnableFileDrop`.
    - `internal/file/paths.go:114` `IsSupportedDocumentSuffix` — the suffix check for the `Files`
      bucket — and T004's directory canonicalization helper for the `Folders` bucket.
    - `internal/appmodel/handler.go` — bind `ClassifyDroppedPaths` in the usual guarded shape.

    **Create / modify**: `internal/appmodel/workspace.go` (or a small sibling file),
    `internal/apperr/results.go` (the `DropClassificationResult` envelope),
    `internal/application/options.go`, `internal/appmodel/handler.go`.

    **Tests**:
    - `tests/go/integration/appmodel/drop_classification_test.go` (new) — a supported regular file
      lands in `Files`; an unsupported suffix, a missing path, a directory-shaped special file and a
      non-regular file land in `Unsupported`; a directory lands in `Folders`, canonicalized (a
      folder reached through a symlinked parent equals the `rootPath` `OpenWorkspace` reports for
      it); an empty input returns
      three empty buckets; order within each bucket follows the input; **nothing is opened and no
      state changes** (assert against a `recordingEmitter` that no patch was published).
    - `tests/go/integration/application/options_test.go` (modify) — the `DragAndDrop` option is set
      with `EnableFileDrop` true.

    **Out of scope**: no opening, no prompt, no tab-limit logic — all of that is the frontend's
    (T016), as is the drop subscription itself. No `runtime.OnFileDrop` callback in `main.go` unless
    T016 proves the runtime subscription does not deliver on a platform.

    **Definition of done**: `ClassifyDroppedPaths` is provably free of side effects, folder paths come
    back canonical, and native drop is enabled.

    **Verify**: `scripts/test integration` then `scripts/verify --skip e2e`.

- [ ] T016 [US3] Build the window drop target and drop orchestration in `frontend/src/ui/widgets/WindowDropTarget.tsx` and `frontend/src/app/useDropHandler.ts`

    **Story / Priority**: US3 (P3)

    **Requirements**: FR-011, FR-012, FR-013, FR-014, FR-015, FR-039, FR-040, FR-041 ·
    US3 AC1–AC8 · SC-005

    **Read first**:
    - contracts/workspace-tree-ui.md §WindowDropTarget (the **whole window** is the target, inert
      until a drag is in progress, renders nothing and intercepts no pointer event otherwise) and
      §FolderDropPrompt (raised **once for the whole drop**, its three choices, and the fact that
      `'first-only'` then raises the normal single-folder `WorkspaceReplacePrompt` rather than a
      fourth choice inside this dialog).
    - contracts/workspace-lifecycle.md §ClassifyDroppedPaths' closing paragraph — exactly what the
      frontend is responsible for.
    - research.md **R16** (one prompt for the whole drop; n folders must not mean n decisions),
      **R17** (a batch opens what fits and reports the remainder in **one** message; a single open at
      the limit is refused instead).
    - spec.md FR-011–FR-015, FR-039–FR-041; US3 AC1–AC8; quickstart.md §3.

    **Existing code to extend**:
    - `frontend/src/ui/widgets/AppShell.tsx` — mounts the overlay once.
    - `frontend/src/logic/adapter/events.ts` — today only an event-name map. The drop subscription
      wraps the generated runtime's `OnFileDrop(callback, useDropTarget)` / `OnFileDropOff()`
      (`frontend/wailsjs/runtime/runtime.d.ts`, unused today) here, since only `logic/adapter/` may
      import `wailsjs/`. If that subscription does not deliver on a platform, fall back to a
      `runtime.OnFileDrop` callback in `main.go` re-emitting one app event, and record why.
    - `frontend/src/logic/actions/actionRegistry.ts` already carries the one frontend copy of the
      document limit (`tabLimit ?? 40`). **Do not add another**: open the dropped files in order, stop
      at the first `capacity-limit` refusal, and report the count that remains.
    - `frontend/src/ui/widgets/dialogs/WorkspaceReplacePrompt.tsx` (T008) — **reuse**, do not
      reimplement; and `ClosePrompt.tsx` as the `ModalShell` skeleton for the new prompt.
    - `frontend/src/app/useCommands.ts` — `onOpenRecentFile` is the existing `OpenPath`-backed open
      used for each dropped file.
    - T005's `openNewWindow` command for the "each in its own new window" branch.
    - `frontend/src/logic/store/notificationsSlice.ts` — the `'drop-unsupported'` remediation intent.
    - `frontend/src/logic/adapter/appModelAdapter.ts` and `adapter/index.ts` — wrap
      `classifyDroppedPaths` (T015) with its `commandArities` entry and mirror
      `DropClassificationResult` in `appModelTypes.ts`. `frontend/src/app/` may import the adapter and
      the store but never `wailsjs/`, so the drop subscription itself lives in
      `logic/adapter/events.ts`.

    **Create / modify**: `WindowDropTarget.tsx`, `useDropHandler.ts`,
    `ui/widgets/dialogs/FolderDropPrompt.tsx` (all new); `AppShell.tsx`, `frontend/src/app/App.tsx`
    if the hook is composed there, `frontend/src/app/AppDialogs.tsx`, `adapter/events.ts`, the two
    adapter files, `appModelTypes.ts`, `notificationsSlice.ts`, `en.json` (modified).

    **Tests**:
    - `frontend/tests/unit/widgets/dialogs/FolderDropPrompt.test.tsx` (new) — three choices, busy
      guarding, and that it renders once for a list of folders.
    - `frontend/tests/unit/widgets/WindowDropTarget.test.tsx` (new) — the highlight and hint appear
      while a valid drag hovers and clear on drop, leave and cancel; the overlay is otherwise inert.
    - `frontend/tests/integration/drop.test.tsx` (new) — the handler's decision logic, which is fully
      testable without a real OS drag by feeding `ClassifyDroppedPaths` results directly: one folder
      with none open opens it with no prompt; one folder with a different one open raises the shared
      replace prompt; two or more folders raise **one** whole-drop prompt whose `'first-only'` branch
      then follows the single-folder rule; `'all-new-windows'` calls `openNewWindow` once per folder
      and leaves this window untouched; `'cancel'` changes nothing; supported files each open as a
      tab; a mixed drop does both; more files than the 40-document limit opens as many as fit and
      produces **exactly one** message naming how many were not opened and why, closing no existing
      tab; an unsupported item produces one rejection notification and no state change.

    **Out of scope**: the real OS drag gesture (T017). Do not change the 40-document limit — it is
    owned by the 003 contract.

    **Definition of done**: one prompt per drop regardless of folder count, one message per batch
    overflow, the replace decision reused from T008, and the whole window accepting drops.

    **Verify**: `scripts/verify --skip e2e`.

- [ ] T017 [US3] Verify User Story 3 in the running application against quickstart.md §3

    **Story / Priority**: US3 (P3)

    **Requirements**: US3 AC1–AC8 · SC-005 · FR-011–FR-015, FR-039–FR-041

    **Read first**: quickstart.md §3 in full (single file, single folder, folder-while-one-is-open,
    mixed drop, unsupported item, the multi-folder prompt's three branches, and the 45-file overflow
    fixture) and §9's note that the Playwright harness cannot deliver an OS drag-and-drop. spec.md
    §"User Story 3".

    **Method**: build the fixtures from quickstart §0 and §3, run the **packaged application** produced
    by `scripts/build` (Constitution VII accepts a recorded walkthrough of the packaged build as
    acceptance evidence, not one of `scripts/build dev`), and drive the drag-and-drop gestures with
    the session's **computer-use tooling**. Per AGENTS.md's
    "Development loop" step 4, check whether that tooling is available in this session before relying
    on it. Attempt every check the tooling can perform, including the overflow fixture. Only for
    gestures the tooling genuinely cannot produce, state precisely which ones and ask the user to
    perform them — never skip a check silently and never report an unperformed check as passing.

    **Create / modify**: no production code. If the walkthrough exposes a defect, record it and fix
    it in T016 (or a new task) rather than widening this one.

    **Tests**: none written — the automated half of US3 is T016's suites. `specs/*/evidence/`
    directories are Git-ignored generated artifacts and **must not** be created (AGENTS.md); record
    the walkthrough result in the task's completion note.

    **Definition of done**: every check in quickstart §3 has a recorded result, each marked as
    agent-performed or user-performed, with any defect found stated explicitly.

    **Verify**: `scripts/verify` (to confirm the branch is still green after any fix).

**Checkpoint**: User Stories 1, 2 and 3 all work independently.

---

## Phase 6: User Story 4 — Work in more than one folder at once (Priority: P4)

**Goal**: Two or more folders open side by side, each in its own window, fully isolated.

**Independent test**: Open a folder, choose "New Window", open a different folder there, and confirm
both windows keep independent tabs and sidebars. Walkthrough: quickstart.md §4.

- [ ] T018 [US4] Add the New Window command surface in `frontend/src/logic/actions/actionRegistry.ts` and `frontend/src/ui/widgets/Menubar/Menubar.tsx`

    **Story / Priority**: US4 (P4)

    **Requirements**: FR-016 · US4 AC1

    **Read first**: contracts/workspace-lifecycle.md §"Native and filesystem ports" — `OpenNewWindow`
    with an empty path means a fresh window with nothing loaded, and it is "the single call behind
    `'new-window'`". spec.md FR-016, FR-022 (a new window loads nothing automatically), US4 AC1.
    research.md **R1**.

    **Existing code to extend**:
    - `frontend/src/logic/actions/actionRegistry.ts` — `'new-window'` is declared with
      `availability: fileDeferred`; flip that one entry.
    - `frontend/src/ui/widgets/Menubar/Menubar.tsx` — `FILE_ACTIONS_WITH_INVOKERS` deliberately omits
      `new-window`; add it and its invoker.
    - `frontend/src/app/useCommands.ts` — the command wrapping T005/T006's `openNewWindow`.

    **Create / modify**: `actionRegistry.ts`, `Menubar.tsx`, `useCommands.ts`, `en.json` only if the
    existing `action.new-window.label` needs a surface variant.

    **Tests**:
    - `frontend/tests/unit/actions/actionRegistry.test.ts` (modify) — the only suite that pins
      `'new-window'` as deferred (the loop near `:152`, where T008 left it); move it to the available
      loop. `frontend/tests/unit/actions/actionDispatcher.test.ts` (modify) — it dispatches.
    - `frontend/tests/integration/menubar.test.tsx` (modify) — the File menu shows an enabled New
      Window row that calls `openNewWindow` with an empty path.

    No E2E suite references New Window today, and none can observe the second process; the row's
    real effect is T019's walkthrough.

    **Out of scope**: the launcher, the bound method and the startup argument are T005. The "Open in
    New Window" choices inside the replace and multi-folder prompts were wired by T008 and T016;
    verify they still work but do not rebuild them.

    **Definition of done**: the File menu's New Window row is live, opens a window with no folder and
    no tabs, and the test that pinned the deferred state is updated.

    **Verify**: `scripts/verify`.

- [ ] T019 [US4] Verify User Story 4 in the running application against quickstart.md §4

    **Story / Priority**: US4 (P4)

    **Requirements**: US4 AC1–AC3 · FR-016, FR-017, FR-022 · SC-006

    **Read first**: quickstart.md §4 in full — including the **macOS-specific verification**: confirm
    the second window has its own correctly independent Dock/menu-bar presence, since this is the
    first time this codebase self-relaunches via `os.Executable()` from inside a running `.app`
    bundle. research.md **R1**'s residual-risk paragraph. spec.md §"User Story 4", FR-017, SC-006.

    **Method**: run the **packaged application** produced by `scripts/build`, not
    `scripts/build dev` — research.md R1's residual risk is a self-relaunch from inside the `.app`
    bundle, which only the packaged build exercises. Open two windows and confirm independence of
    tabs, folder and content; confirm a new window loads nothing; confirm the folder-drop prompt's
    "Open in New Window" choice opens the dropped folder elsewhere, **with its sidebar visible**
    (FR-027 through the startup-argument route), and leaves this window unchanged. Also run the two
    two-window checks other sections defer here: quickstart §1's hidden-folders check across windows
    and §2 step 4's cross-window Recent check. Drive it with computer-use
    tooling where available — check availability first — and ask the user only for the checks the
    tooling cannot perform, naming them.

    **Create / modify**: no production code.

    **Tests**: none written; the E2E harness observes a single browser page and cannot see a second
    OS process (quickstart §9).

    **Definition of done**: quickstart §4's checks, including the macOS one, have recorded results
    marked agent- or user-performed, and FR-022 is explicitly confirmed — a new window opened with no
    argument loads nothing.

    **Verify**: `scripts/verify`.

**Checkpoint**: User Stories 1–4 all work independently.

---

## Phase 7: User Story 5 — Create and reveal items from the tree (Priority: P5)

**Goal**: Right-click a tree row to create a file or subfolder next to it, reveal it in the OS file
manager, or copy its path.

**Independent test**: Right-click a folder in the tree, create a new file inside it, and confirm it
appears in the tree and opens straight away. Walkthrough: quickstart.md §5.

- [ ] T020 [US5] Add the workspace create and path commands in `internal/appmodel/workspace.go` and `internal/appmodel/copy_path.go`

    **Story / Priority**: US5 (P5)

    **Requirements**: FR-018 (backend half), FR-036, FR-038, FR-046 (the authoritative check) ·
    US5 AC1, AC5, AC8

    **Read first**:
    - contracts/workspace-lifecycle.md §"CreateWorkspaceFile / CreateWorkspaceFolder" (all 6 numbered
      points — note that the dialog, not the backend, resolves the extension, and that the backend
      rebuilds and publishes but **opens nothing**) and §"RevealWorkspacePath / CopyWorkspacePath".
    - data-model.md §"New `ClassifiedError` / notification vocabulary" — the `conflict`,
      `unsupported-input` and containment rows.
    - research.md **R8** (factor the shared logic into `revealPathViaPort` and `copyPathViaWriter`;
      duplicating the OS-command bodies would create exactly the second implementation the
      constitution forbids).
    - docs/architecture.md ADR-0033 (workspace operations are additive only). spec.md FR-018, FR-036,
      FR-038; US5 AC1, AC5.

    **Existing code to extend**:
    - `internal/appmodel/copy_path.go` — `CopyPath(documentID)` and
      `RevealInFileManager(documentID)` already operate internally on a plain path string via
      `service.clipboard` (`file.ClipboardWriter`) and `service.reveal` (`file.RevealPort`), with an
      `os.Stat` immediately before the reveal and a `file.ErrRevealUnavailable` mapping. Factor the
      two helpers out and **refactor both existing methods to use them**, then add the path-keyed
      pair.
    - `internal/file/paths.go` — `CanonicalizeCandidateDocumentPath`'s parent-resolution logic is the
      parallel for the symlink-safe containment check.
    - `internal/workspace.Build` and the snapshot rebuild, both from T004.
    - `internal/appmodel/handler.go` — bind the four new methods.

    **Create / modify**: `workspace.go`, `copy_path.go`, `handler.go`.

    **Tests**:
    - `tests/go/integration/appmodel/workspace_create_test.go` (new) — create a file and a folder
      under the root and under a nested folder; the rebuilt snapshot includes the new entry in its
      sorted position; a name that already exists refuses `conflict`; a `parentPath` outside the
      workspace root, including one reached through a symlink, refuses `unsupported-input`; an empty
      name, a name containing a path separator and a name beginning with a dot each refuse
      `unsupported-input` and create nothing; no workspace open
      refuses `not-found`; the created file is empty with mode 0644 and the folder is mode 0755;
      **nothing is opened** by either call.
    - `tests/go/integration/appmodel/copy_path_test.go` (modify) — the existing document-id-keyed
      behaviour is unchanged after the refactor (regression), and the new path-keyed methods work for
      a file node, a folder node, the root node and an `unreadable` folder node, copying the **full
      absolute path**.

    **Out of scope**: rename, move, delete and tree reorder are refused by ADR-0033 and FR-019 — do
    not add them in any form. Extension policy belongs to the dialog (T021), not here: these methods
    write exactly the name they are given. The context menu and dialog are T021.

    **Definition of done**: one implementation of reveal and copy-path serves both the document-keyed
    and path-keyed entry points; the containment check is symlink-safe; creation rebuilds and
    publishes but opens nothing.

    **Verify**: `scripts/test integration` then `scripts/verify --skip e2e`.

- [ ] T021 [US5] Build the tree context menu and create-entry dialog in `frontend/src/ui/widgets/WorkspaceTree/WorkspaceTreeContextMenu.tsx` and `CreateEntryPrompt.tsx`

    **Story / Priority**: US5 (P5)

    **Requirements**: FR-018, FR-019, FR-035, FR-036, FR-037, FR-038, FR-046 · US5 AC1–AC8 · SC-008

    **Read first**:
    - contracts/workspace-tree-ui.md §WorkspaceTreeContextMenu — the per-row-type availability table
      in full, the action-id restatement beneath it, and the reason the absence of rename/move/delete
      is enforced by the registry rather than a runtime filter (so no code path could add one later
      without a reviewable diff); §CreateEntryPrompt — one component for both kinds, the
      name-handling rules (including the dot-leading refusal, and that the supported suffixes arrive
      as a prop from `workspace.filterSuffixes` — the dialog holds no copy of the list), that a
      collision keeps the dialog open with the typed name intact and an inline error rather than a
      toast, and that a successful create expands the parent folder; §"Action registry surface: `'tree-context'`".
    - data-model.md §"Action Registry additions" — the new surface, the two new ids and **why they are
      not an overload of `'new-file'`**, the reused ids whose `surfaces` are extended, and the
      availability-by-row-type list.
    - contracts/workspace-tree-ui.md §WorkspaceTree header item 2 (the `+` button deferred from T009,
      scoped to the selected folder row or the root).
    - research.md **R11**; spec.md FR-018, FR-019, FR-035–FR-038, FR-046; US5 AC1–AC8; quickstart.md §5.

    **Existing code to extend**:
    - `frontend/src/ui/widgets/TabContextMenu.tsx` — the structural template: a `Popup` anchored at a
      click point, `MenuItem` rows, the same `dispatchAction` call shape. ESLint permits
      `createPortal` and `role="menu"` **only** inside `Popup`, so the menu must be built on it.
    - `frontend/src/logic/actions/actionRegistry.ts` — `ActionSurface`, `ActionId`,
      `ActionAvailabilityContext`, `getActionAvailability`, `actionsForSurface`, and the
      `surfaceOrder` convention used by the existing `'tab-context'` entries for `'copy-path'` and
      `'reveal-in-file-manager'`.
    - `frontend/src/logic/actions/actionDispatcher.ts` — `ActionDispatchContext`.
    - `frontend/src/ui/widgets/dialogs/ClosePrompt.tsx` — the `ModalShell` skeleton.
    - `frontend/src/app/useCommands.ts` — the existing open command that a newly created file is
      opened through (FR-037: the file opens in a focused tab with editor focus; the folder does not).
    - `frontend/src/ui/widgets/WorkspaceTree/WorkspaceTree.tsx` (T009) and `WorkspaceTreeNode.tsx`
      (T010) — add the header `+` and consume `onContextMenu`.

    **Create / modify**: `WorkspaceTreeContextMenu.tsx`, `CreateEntryPrompt.tsx` (new);
    `WorkspaceTree.tsx`, `WorkspaceTreeNode.tsx`, `actionRegistry.ts`, `actionDispatcher.ts`,
    `adapter/appModelAdapter.ts` and `adapter/index.ts` (the four new command wrappers and their
    `commandArities` entries), `useCommands.ts` (the create/reveal/copy commands, holding the
    `reading` flag around a create), `notificationsSlice.ts` (the `'create-workspace-entry'`,
    `'reveal-workspace-path'` and `'copy-workspace-path'` intents from data-model.md), `en.json`
    (modified).

    **Tests**:
    - `frontend/tests/unit/actions/registryCatalogue.test.ts` (modify) — add `'new-file-here'` and
      `'new-folder-here'` to the exact ordered id list.
    - `frontend/tests/unit/widgets/WorkspaceTree/WorkspaceTreeContextMenu.test.tsx` (new) — the full
      availability table: the root row and a readable folder row offer all four items; an `unreadable`
      folder row and a file row offer only Reveal and Copy Path; **no row ever offers rename, move or
      delete**; `actionsForSurface('tree-context')` returns exactly the four ids.
    - `frontend/tests/unit/widgets/WorkspaceTree/CreateEntryPrompt.test.tsx` (new) — a name with no
      supported extension gains `.md`; a name already ending in `.md`, `.markdown`, `.mdown` or `.txt`
      (case-insensitively) is sent exactly as typed, the list coming from the `supportedSuffixes`
      prop; a folder name is never extended; Create is disabled for an empty name or one containing
      a path separator; a name beginning with a dot, for either kind, sends nothing and shows an
      inline reason with the typed name intact; on a `conflict` refusal the
      dialog **stays open** with the typed name intact and shows an inline error, clearing nothing and
      raising no toast; on success a created file opens in a focused tab and a created folder opens
      nothing.
    - `frontend/tests/integration/workspace.test.tsx` (modify) — the header `+` scopes to the selected
      folder row, or the root when no folder row is selected; a create started on a collapsed folder
      leaves that folder expanded with the new row visible.

    **Out of scope**: rename, move, delete and reorder, in any form (FR-019, ADR-0033). No keyboard
    route to the context menu — that is a recorded deviation in plan.md's Complexity Tracking, not an
    omission to fix here. The `+` button is the keyboard route to New File/New Folder.

    **Definition of done**: the availability table is reproduced exactly, the extension rule lives in
    exactly one place (the dialog) and reads the snapshot's suffix list, neither a collision nor a
    dot-leading name closes the dialog, and no rename/move/delete id
    exists for the `'tree-context'` surface.

    **Verify**: `scripts/verify --skip e2e`.

- [ ] T022 [US5] Verify User Story 5 end to end in `frontend/tests/e2e/workspace-tree.test.ts`

    **Story / Priority**: US5 (P5)

    **Requirements**: US5 AC1–AC8 · FR-018, FR-019, FR-035–FR-038, FR-046 · SC-008

    **Read first**: quickstart.md §5 in full — the three row types' menus, Copy Path's absolute-path
    check, Reveal, and all four New File sub-checks (no extension, supported extension, opens focused,
    collision keeps the dialog open) plus New Folder. spec.md §"User Story 5".

    **Existing code to extend**: `frontend/tests/e2e/workspace-tree.test.ts` (from T011) and the
    harness's fixture helpers.

    **Create / modify**: the E2E suite. No production code.

    **Tests**: E2E coverage of creating a file and a folder from a folder row's menu, the created
    file appearing in its sorted position and opening focused, the collision and dot-leading-name
    cases, and the per-row-
    type menu contents. Reveal in the OS file manager and the clipboard's contents are checked in the
    real-application walkthrough rather than the harness.

    **Real-application check**: walk quickstart §5, using computer-use tooling where available —
    check availability first — and asking the user only for the checks it cannot perform (most likely
    the OS file-manager reveal and the system clipboard read), naming them.

    **Definition of done**: every US5 acceptance scenario has a passing test or a recorded walkthrough
    result, and SC-008 is confirmed: no action is offered on a row where it cannot work, and no
    failure leaves the user without a stated reason.

    **Verify**: `scripts/verify` then `scripts/baseline --compare`.

**Checkpoint**: All five user stories are independently functional.

---

## Phase 8: Polish, Documentation & Closeout

- [ ] T023 Record this feature's architecture in `docs/architecture.md`

    **Story / Priority**: Polish (cross-cutting)

    **Requirements**: Constitution I (One Authority) · AGENTS.md §"Evidence and handoff" (public-
    surface changes are recorded in the active feature artifacts or the architecture map)

    **Read first**: contracts/workspace-tree-ui.md §"Consumer-inventory updates to copy into
    `docs/architecture.md`" — six named updates, quoted there in the form they should take.
    plan.md §Summary and §"Project Structure" for the owner list. research.md R1, R10, R12, R13, R14
    for the decisions worth recording durably.

    **Existing structure to extend**: `docs/architecture.md` §"Backend and bridge owners" and
    §"Frontend composition and command owners" (two tables), §"Shared UI owners and consumer
    inventory" (per-component sections for Popup, MenuItem, ToolButton/Button, Sidebar, ModalShell,
    Banner), §Persistence, §"Durable decisions" (the ADR table — the highest existing current-product
    record is **ADR-0033**, so this feature's is **ADR-0035**; ADR-0034 is already taken by a planned
    assistant record), and §"Verification walkthrough".

    **Create / modify**: `docs/architecture.md` only.

    Content to add: an **ADR-0035** row covering workspace tree ownership (`internal/workspace` pure
    builder vs. `internal/appmodel` session state), one process per window with an explicit startup
    folder argument that is not session restore, the no-watcher/manual-refresh contract, the
    additive-only reaffirmation of ADR-0033, and the app-wide hidden-folders setting. Owners-table
    rows for `internal/workspace/` and the new frontend owners (`logic/store/workspaceSlice.ts`,
    `app/useDropHandler.ts`, `ui/widgets/WorkspaceTree/`). The six consumer-inventory updates. A
    persistence note for `recent.files` v2 and `workspace.showHiddenFolders`. Two or three new
    verification-walkthrough steps for the folder tree.

    **Tests**: none. Lint checks this file twice over, so run it: rule L25 fails on any backticked
    path that does not exist, and rule L22 fails on a task id or an `FR-`/`SC-` id — describe
    behaviour and owners in the map, never this file's identifiers.

    **Out of scope**: no constitution edits (AGENTS.md forbids them outside the constitution
    workflow). No spec or contract edits — those are T024.

    **Definition of done**: every public surface this feature added has an owner row, all six consumer
    inventories are updated, and ADR-0035 exists.

    **Verify**: `scripts/verify lint` then `scripts/verify --skip e2e`.

- [ ] T024 Close the specification in `AGENTS.md`, `README.md` and `specs/005-folder-workspace/`

    **Story / Priority**: Polish (cross-cutting)

    **Requirements**: AGENTS.md §Authority (the pointer files must name the current authorities) ·
    Constitution I

    **Read first**: AGENTS.md §"Authority" and README.md's pointer paragraph — both name
    `specs/005-folder-workspace/` as the active feature. spec.md's header `**Status**: Draft`.
    checklists/requirements.md.

    **Create / modify**: `AGENTS.md` and `README.md` (confirm their pointers still resolve and
    describe the artifact set truthfully — change only what is wrong;
    `.github/copilot-instructions.md` is a symlink to `AGENTS.md`); `specs/005-folder-workspace/spec.md` (status); `specs/005-folder-workspace/tasks.md`
    (tick every completed task); `specs/005-folder-workspace/checklists/requirements.md` (final pass).

    **Tests**: none. Lint's repository and referenced-path rules cover the pointer edits.

    **Out of scope**: `.specify/memory/constitution.md` must not be edited. Do not delete or rewrite
    any feature artifact — this task updates status and pointers only. Spec Kit installs and agent
    working documents stay uncommitted (decision D14).

    **Definition of done**: every pointer resolves, the spec's status is current, and the
    traceability table below is confirmed accurate against what was actually built.

    **Verify**: `scripts/verify lint` and `scripts/format --check`.

- [ ] T025 Run the final verification and leave the worktree handoff-ready

    **Story / Priority**: Polish (cross-cutting)

    **Requirements**: Constitution VII · AGENTS.md §"Development loop" steps 4–5 and
    §"Evidence and handoff" · quickstart.md §10

    **Read first**: AGENTS.md §"Evidence and handoff" and §"Development loop" step 5 (review the diff
    for ownership, public-surface documentation, generated-file drift and unrelated changes).
    docs/architecture.md §"Verification walkthrough". quickstart.md §9 and §10.

    **Steps of substance**: run the full six-stage `scripts/verify`, then `scripts/baseline --compare`
    against `.local_tmp_files/baseline/005-folder-workspace.json`. Then build the packaged binary with
    `scripts/build` and walk docs/architecture.md §"Verification walkthrough" on it, including the
    folder-tree steps T023 added (Constitution, delivery workflow step 5). That section requires one
    sentence — date, commit, host, outcome — in this feature's close-out record: append it to
    `specs/005-folder-workspace/plan.md` under a "Close-out record" heading. Use computer-use tooling
    if available; otherwise ask the user to perform the walk and record their result. Remove the scratch fixtures
    quickstart §0 and §3 create (`/tmp/gme-workspace-fixture`, `/tmp/gme-fixture-b`,
    `/tmp/gme-fixture-c`, `/tmp/gme-many-files`).
    Confirm **no** `specs/*/evidence/` directory was created — those are disposable generated
    artifacts that AGENTS.md says must not be recreated as part of verification. Confirm generated
    bindings under `frontend/wailsjs/` and generated themes match a clean build, and that the working
    tree is clean afterwards. Review the whole feature diff for unrelated changes.

    **Create / modify**: `specs/005-folder-workspace/plan.md` (the close-out sentence). No production
    code. Fixes found here belong in the owning task's file, with the reason stated.

    **Tests**: none written; this task runs every existing suite.

    **Definition of done**: all six stages green, `--compare` shows no regression against the
    baseline, the packaged-build walkthrough is recorded in `plan.md`, the tree is clean, no evidence directory exists, and the completion note states the
    verified result, any pre-existing findings carried over from T001, and the next decision needed
    (the feature parent is **not** merged to `master` by this workflow — that is the repository
    owner's integration step).

    **Verify**: `scripts/verify` then `scripts/baseline --compare`.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (T001)**: no dependencies; must complete before any implementation edit.
- **Foundational (T002–T006)**: blocks every user story.
    - Execution order is `T002` → `T003` → `T004` → `T005` → `T006`: `T003`'s Launcher test renders
      the `folder` icon `T002` adds, `T004` promotes folders through `T003`'s repository, `T005`'s
      startup open calls `T004`'s `OpenWorkspace`, and `T006` wraps what `T004` and `T005` bind.
- **User stories (Phases 3–7)**: all depend on Foundational being complete. In practice they are
  delivered in priority order P1 → P5, because US2, US3, US4 and US5 each reuse a component or a
  command US1 introduces.
- **Polish (T023–T025)**: after every story that is being delivered.

### Cross-story reuse (each is a dependency, never a shared task)

| Built by                                                | Reused by                                                                                           |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `WorkspaceReplacePrompt` (T008)                         | T013 (recent folder entry, Reopen Last folder target), T016 (`first-only` branch)                   |
| `openNewWindow` command (T005/T006)                     | T008 (replace prompt's third choice), T016 (all-new-windows), T018 (menu row)                       |
| The per-file save-or-discard close flow (existing, 003) | T008 only — no second close path is created                                                         |
| `internal/workspace.Build` (T004)                       | T007 (hidden-folders rebuild), T020 (rebuild after create)                                          |
| The directory canonicalization helper (T004)            | T007 (picker result), T015 (`folders` bucket) — what makes the same-folder check a plain comparison |
| `WorkspaceTree.tsx` (T009)                              | T010 (rows), T021 (the `+` header button)                                                           |
| `onRefreshWorkspace` and the `reading` flag (T009/T006) | T010 (stale-row re-read), T021 (create)                                                             |
| The by-kind recent open (T013)                          | Menubar submenu and Launcher — one routing, two surfaces                                            |

### Parallel opportunities

- Foundational is sequential: each task consumes the previous one's exports, and lint rule L6
  forbids adding an export ahead of its first use. No task in this file carries `[P]`.
- Within a story, backend and frontend tasks are sequential by design (the frontend consumes the
  bound methods the backend task adds).
- With more than one implementer, US2, US3 and US4 can proceed concurrently once US1's T008 and
  T009 have landed, since their only shared surfaces are the components listed above. US5 also needs
  T010 (its menu hangs off the real row). T019's walkthrough needs US2 and US3 delivered: it runs the
  cross-window Recent check and the drop prompt's "Open in New Window" branch.

---

## Requirement traceability

Every functional requirement has one owning task. "Supporting" tasks contribute but are not
responsible for the requirement being satisfied.

| FR                                                                | Owner | Supporting |
| ----------------------------------------------------------------- | ----- | ---------- |
| FR-001 Open a folder by explicit action                           | T008  | T004, T007 |
| FR-002 Sidebar tree of the current folder                         | T009  | T010       |
| FR-003 Inclusion filter (types, dot-files, dot-folders, symlinks) | T004  | T007       |
| FR-004 Fixed, non-editable type filter shown                      | T009  | —          |
| FR-005 Selecting a file opens or focuses its tab                  | T010  | —          |
| FR-006 Empty-result message                                       | T009  | —          |
| FR-007 Manual Refresh, preserving expansion and selection         | T009  | T004       |
| FR-008 Recent list: combined, bounded, re-read on menu open       | T013  | T003, T012 |
| FR-009 Reopen Last, one action, session-resolved                  | T012  | T013       |
| FR-010 A recent entry whose path is gone                          | T013  | T003       |
| FR-011 Open by dropping onto the window                           | T016  | T015       |
| FR-012 Folder dropped, none open                                  | T016  | —          |
| FR-013 Folder dropped, one already open                           | T016  | T008       |
| FR-014 Mixed multi-item drop                                      | T016  | —          |
| FR-015 Unsupported item rejected, no state change                 | T016  | T015       |
| FR-016 New, independent window                                    | T018  | T005       |
| FR-017 Windows do not affect each other                           | T005  | T019       |
| FR-018 Right-click menu contents                                  | T021  | T020       |
| FR-019 No rename, move or delete                                  | T021  | T010, T020 |
| FR-020 Unreadable subtree skipped and indicated                   | T004  | T010       |
| FR-021 20,000-entry bound with visible truncation                 | T004  | T009       |
| FR-022 No automatic reopen at launch                              | T005  | T019, T025 |
| FR-023 Close Folder from menu and sidebar header                  | T008  | T009       |
| FR-024 Close-folder three-choice prompt                           | T008  | —          |
| FR-025 Replace closes tabs first; cancel abandons                 | T008  | —          |
| FR-026 Replace choice at every folder entry point                 | T008  | T013, T016 |
| FR-027 Sidebar becomes visible whenever a folder opens            | T008  | T009, T019 |
| FR-028 "No folder open" empty state with an Open Folder control   | T009  | —          |
| FR-029 The opened folder is the tree's first row                  | T010  | T004, T009 |
| FR-030 Folders before files, A→Z case-insensitive                 | T004  | T010       |
| FR-031 "Show hidden folders" switch, persisted app-wide           | T007  | T009       |
| FR-032 Subfolders start collapsed                                 | T009  | —          |
| FR-033 Loading state while reading                                | T009  | T006, T008 |
| FR-034 Open and unsaved row marks                                 | T010  | —          |
| FR-035 `.md` appended when no supported extension is typed        | T021  | —          |
| FR-036 A name collision keeps the dialog open                     | T021  | T020       |
| FR-037 A created file opens focused; a created folder does not    | T021  | T020       |
| FR-038 Copy Path yields the full absolute path                    | T020  | T021       |
| FR-039 One prompt for a multi-folder drop                         | T016  | —          |
| FR-040 The whole window accepts drops, with a hover indication    | T016  | —          |
| FR-041 Drop past the tab limit: open what fits, one message       | T016  | —          |
| FR-042 Single open at the tab limit is refused                    | T010  | —          |
| FR-043 Basic keyboard model (Tab, Up/Down, Enter)                 | T010  | —          |
| FR-044 The folder picker starts at the home folder                | T007  | —          |
| FR-045 Selecting a row whose file is gone                         | T010  | T004       |
| FR-046 A create name beginning with a dot is refused inline       | T021  | T020       |

| SC                                                                                     | Verified by |
| -------------------------------------------------------------------------------------- | ----------- |
| SC-001 Folder to open file in ≤3 actions                                               | T011        |
| SC-002 A loading state, never blank or frozen, never a partial tree shown as complete  | T009, T011  |
| SC-003 Only supported types; no dot-files ever; no dot-folders while the switch is off | T004, T011  |
| SC-004 Returning to the most recent item is one action                                 | T014        |
| SC-005 A single drop opens without an extra dialog, except the documented cases        | T017        |
| SC-006 Two folders in two windows, fully isolated                                      | T019        |
| SC-007 An unreadable subfolder leaves the rest browsable                               | T011        |
| SC-008 Every context-menu action succeeds or explains itself                           | T022        |

---

## Implementation strategy

### MVP first

1. T001 (baseline).
2. T002–T006 (Foundational — critical, blocks everything).
3. T007–T011 (User Story 1).
4. **Stop and validate**: User Story 1 is a complete, demoable slice on its own — a user can open a
   folder, browse it, and open files from it.

### Incremental delivery

Each subsequent story is additive and leaves the previous ones working: US2 (recent work), US3
(drag-and-drop), US4 (multi-window), US5 (create and reveal). Stop at any checkpoint to validate.

### Notes

- One task per agent session; each session plans from its task's briefing.
- A task that discovers work belonging to another story records it rather than absorbing it — the
  story boundaries above are what keep each session's scope reviewable.
- Commit one task per Conventional Commit message on a task branch
  (`feature/005-folder-workspace-<task>`), squash-merged into `feature/005-folder-workspace`. The
  feature parent is not merged into `master` by this workflow.
- If an active artifact turns out to be silent or ambiguous on something a task needs, stop and
  surface the question with a recommended default rather than inventing behaviour or editing the
  specification to make an implementation pass.
