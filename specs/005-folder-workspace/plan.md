# Implementation Plan: Folder Workspace Sidebar

**Branch**: `005-folder-workspace` | **Date**: 2026-09-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-folder-workspace/spec.md`

## Summary

Add a left sidebar that browses an opened folder ("workspace"): a filtered file/folder tree whose
one adjustable control is a "show hidden folders" switch, Recent Files & Folders (combined MRU),
Reopen Last, drag-and-drop open, multi-window support, Close Folder as a real command (a File-menu
row and a sidebar `×`, both asking what to do with the open tabs), and a tree context menu limited
to New File, New Folder, Reveal, and Copy Path (no rename, move, or delete). Every folder-opening
entry point — Open Folder, Open Recent, Reopen Last and drag-drop — raises the same
replace-or-new-window prompt when that window already has a folder open. The technical approach
reuses the product's existing canonical open lifecycle (`OpenPath`/`OpenRecentFile`), its existing
empty `Sidebar` shell, its existing but
availability-gated File-menu rows (`open-folder`, `new-window`), and its existing
`Popup`/`MenuItem`/`ModalShell` primitives end to end; the only genuinely new backend surface is a
pure filesystem-tree builder (`internal/workspace/`), workspace session state in
`internal/appmodel/`, a combined Recent Items MRU (superseding the files-only list), Wails
drag-and-drop wiring, and a new-window launcher that spawns an independent OS process (Wails v2
has no in-process multi-window API).

## Technical Context

**Language/Version**: Go (module `github.com/sanyokkua/go_mark_edit`, CGO-free backend/SQLite
driver per Constitution V) + TypeScript/React 18, both already pinned in `go.mod`/`package.json`.

**Primary Dependencies**: Wails v2.15.0 (`github.com/wailsapp/wails/v2`), Redux Toolkit, Radix UI
(`@radix-ui/react-dropdown-menu`, already used by the existing `Popup` primitive), `mattn`-free
CGO-free SQLite driver already in use. No new external dependency is introduced by this feature.

**Storage**: The existing SQLite KV store (`internal/kv/`, `internal/db/`, WAL mode) — the Recent
Items MRU list is a versioned-JSON value in the same `settings` table already used for
`recent.files`, and the show-hidden-folders setting is one more per-field value written through the
existing `LayoutRepositoryAPI` (`workspace.showHiddenFolders`, beside `workspace.visible`) — no new
repository; the workspace tree itself is never persisted (rebuilt on open/refresh, per FR-007).

**Testing**: `go test` for backend (black-box under `tests/go/...`; no in-package `_test.go` is
planned — see the exceptions list below), Vitest/Testing Library for frontend unit/integration
(`frontend/tests/{unit,integration}/`), Playwright-style real-backend E2E
(`frontend/tests/e2e/`), run through `scripts/test`/`scripts/verify` per AGENTS.md.

**Target Platform**: macOS, Windows, Linux desktop (one Wails v2 binary per platform).

**Project Type**: Desktop application (Go backend + embedded React/TypeScript frontend via Wails
v2 webview).

**Performance Goals**: No timing target is asserted — the former 2-second promise (SC-002) was
dropped during clarification. The agreed criterion is a UI one: while a folder is being read (open,
Refresh, or a hidden-folders flip) the sidebar shows a loading state rather than appearing frozen.
What keeps the read finite is the bound, not a stopwatch: the walk includes at most 20,000 entries
(FR-021) and never follows symlinks or aliases, so a synchronous `os.ReadDir`-based walker behind a
frontend loading state suffices; no async/streaming tree-build is required.

**Constraints**: Offline-only, no background network/telemetry (Constitution IV); no filesystem
watcher — the tree reflects on-disk state only as of open or manual Refresh (Assumptions, FR-007);
workspace mutations are additive-only — create, reveal, copy path only, never rename/move/delete
(ADR-0033, FR-019); Recent Items bounded to 10 combined entries (FR-008); tree bounded to 20,000
combined entries with visible truncation (FR-021); the document-type filter is fixed and
non-editable, and the persisted, app-wide "show hidden folders" setting (off by default, stored in
the same settings KV store) is the one adjustable part of what the tree shows.

**Scale/Scope**: Five prioritized user stories (P1–P5); a project-sized workspace of up to a few
thousand files/folders is the expected scale, with 20,000 included entries as the hard bound; up to
40 open documents per window is an
existing, unchanged cap (`maxOpenDocuments`, `internal/appmodel/file_lifecycle.go:14`).

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design below._

| Principle                              | Check                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Result                                                 |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| I. One Authority                       | Every decision below is either lifted directly from `docs/architecture.md` (ADR-0033, ADR-0006, ADR-0004, ADR-0024) or from `specs/003-real-files-and-tabs/` contracts (canonical open lifecycle, supported suffixes), or recorded as a new decision in this feature's own artifacts. No existing requirement is weakened.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | PASS                                                   |
| II. EARS + Vertical Slices             | Every functional requirement in `spec.md` is one EARS sentence. Each user story (P1–P5) delivers backend → bridge → adapter → state projection → UI for its own slice; `tasks.md` gives each FR an owning task in its traceability table.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | PASS                                                   |
| III. Backend Authority & Boundaries    | Workspace tree/session state is added to the existing single backend state owner (`internal/appmodel`), projected read-only into Redux exactly like `documents`/`recentFiles` today; new Wails bindings only touched from `frontend/src/logic/adapter/`; new bound handlers follow the existing `bridge.Guard`+`bridge.Once`, no-context-arg, named-result shape.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | PASS                                                   |
| IV. Offline/Private/Safe               | No network calls added. Wails' native file drop and the native folder dialog are local OS integrations only. Dropped/created paths are validated at the boundary (suffix filter, containment-in-workspace-root check) before any write.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | PASS                                                   |
| V. Data & Cross-Platform               | Multiple instances already allowed (ADR-0006) — New Window reuses this, not a new instance-locking model. Recent Items migration is additive/forward-only (v1→v2 versioned JSON, no data loss). Every unbounded input has a stated numeric bound: tree 20,000 entries (FR-021), Recent Items 10 (FR-008). Workspace mutations stay additive-only per ADR-0033/FR-019 — this plan does not introduce rename/move/delete.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | PASS                                                   |
| VI. Accessible/Tokenized/Coherent      | Tree, context menu, and the new dialogs reuse existing tokenized, accessible primitives (`Sidebar`, `Popup`, `MenuItem`, `ModalShell`, `Icon`, `Banner`, `Button`, `ToolButton`); the sidebar's empty state ("No folder open" plus an Open Folder button), its loading state, the hidden-folders switch, the close-folder prompt and the drop highlight are built from those same primitives and tokens rather than new ones. The keyboard model is deliberately basic and stated as such: Tab reaches the tree, Up/Down move between rows, Enter opens a focused file and toggles a focused folder — no arrow-key folder toggling, no keyboard route to the right-click menu. All new actions are registered in the one action registry (`actionRegistry.ts`) rather than hard-coded per surface; new user-visible strings go through the existing i18n catalogue and say "folder", not "workspace", and the three existing catalogue strings that say "Workspace" (`view.menu.showWorkspace`, `shell.workspace`, `shell.workspace.resize`) are renamed to sidebar wording so the spec's terminology rule holds for the whole interface. | PASS with one recorded deviation (Complexity Tracking) |
| VII. Evidence Before Completion        | `scripts/baseline` will be run before the first implementation edit (per AGENTS.md); six-stage verification and named tests per acceptance scenario are required at close, mirrored by `quickstart.md`'s per-story validation scenarios.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | PASS (procedural, enforced at implement/verify time)   |
| VIII. One Implementation per Behaviour | Reveal/Copy-Path OS logic is factored into shared path-based helpers reused by both the existing document-ID-keyed methods and the new workspace-path methods, not duplicated. The replace-vs-new-window prompt is one component reused by every folder-opening entry point (Open Folder, Open Recent, Reopen Last, drag-drop). `copy-path`/`reveal-in-file-manager` action ids are reused (new surface added) rather than duplicated.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | PASS                                                   |

**Post-design re-check** (after Phase 0/1 artifacts below): no new violation surfaced. The two
decisions requiring judgment beyond a literal spec reading — the "Reopen Last" fallback chain
(research.md R6) and extending the drag-drop replace/new-window prompt to the menu entry point
(research.md R7) — were resolved as strict supersets/consistent extensions of existing,
already-approved behaviour, not as weakenings of any requirement (Principle I). The Recent Items
rename (research.md R5) is an additive SQLite migration (Principle V) with no history loss.

**In-package `_test.go` exceptions** (Constitution VII requires each be listed here with its
reason): none — the new Go files (`internal/workspace/tree.go`, `internal/appmodel/workspace.go`
and `internal/application/new_window.go`) expose their behaviour through public functions/bound
handlers, so every new backend test lives under `tests/go/`. The raw OS-process spawn is reached
through the `NewWindowLauncher` port wired in the composition root, so it needs no in-package test
either.

## Project Structure

### Documentation (this feature)

```text
specs/005-folder-workspace/
├── plan.md                              # This file
├── research.md                          # Phase 0 output
├── data-model.md                        # Phase 1 output
├── quickstart.md                        # Phase 1 output
├── contracts/
│   ├── workspace-lifecycle.md           # Phase 1 output — Go↔frontend binding contract
│   └── workspace-tree-ui.md             # Phase 1 output — tree/menu/dialog UI contract
└── tasks.md                             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

This is an existing desktop application (Go backend + embedded React/TypeScript frontend via
Wails v2); no new top-level project or structural option is introduced. New and modified paths:

```text
internal/
├── workspace/                     # NEW — pure filesystem tree builder, no state/locks
│   └── tree.go
├── appmodel/
│   ├── workspace.go                # NEW — workspace session state, Open/Refresh/Close/Create/Reveal/CopyPath
│   ├── handler.go                  # MODIFIED — new bound methods (incl. ChooseWorkspaceFolder, RefreshRecentItems)
│   ├── copy_path.go                # MODIFIED — factor path-based helpers, reuse from workspace.go
│   ├── recent_files.go             # MODIFIED — refreshRecentFiles/publishRecentFiles generalized to RecentItem, exposed via RefreshRecentItems
│   ├── recent_files_repository.go        # MODIFIED — RecentItem{Path,Kind}, cap 10, Clear()
│   ├── recent_files_repository_sqlite.go # MODIFIED — v1→v2 versioned JSON migration, Clear()
│   ├── layout_repository.go        # MODIFIED — LayoutWorkspaceHiddenFolders field constant (show-hidden-folders setting)
│   ├── layout_repository_sqlite.go # MODIFIED — the write-time field whitelist accepts the new bool field
│   ├── file_lifecycle.go           # MODIFIED — ReopenLastFile fallback to Recent Items head (folder-target status)
│   ├── tab_session.go              # MODIFIED — canReopenLastFile formula
│   ├── close_plan.go               # MODIFIED — canReopenLastFile formula
│   ├── model.go                    # MODIFIED — applicationState.workspace field
│   └── service.go                  # MODIFIED — snapshot/patch plumbing for workspace + recentItems
├── application/
│   ├── new_window.go               # NEW — NewWindowLauncher port + os/exec-based impl
│   ├── handler.go                  # MODIFIED — OpenNewWindow bound method
│   ├── document_dialogs.go         # MODIFIED — chooseFolder picker (native directory dialog)
│   └── options.go                  # MODIFIED — DragAndDrop: EnableFileDrop
├── apperr/
│   └── results.go                  # MODIFIED — WorkspaceSnapshot/WorkspaceNode/RecentItem/DropClassification/FolderChoice/RecentItems types, folder-target open status
└── file/
    └── paths.go                    # MODIFIED — directory canonicalization helper (none exists today)

main.go                             # MODIFIED (repository root) — CLI-arg pending workspace,
                                    #  directory-picker injection (no Go drop callback — research.md R2)

tools/e2e-seed/main.go              # MODIFIED only if E2E needs to seed a folder-kind recent entry

frontend/src/
├── logic/
│   ├── store/
│   │   ├── workspaceSlice.ts       # NEW — tree projection + local `reading` flag
│   │   ├── documentsSlice.ts       # MODIFIED — recentFiles→recentItems rename
│   │   ├── notificationsSlice.ts   # MODIFIED — new NotificationRemediationIntent members (data-model.md)
│   │   ├── appModelTypes.ts        # MODIFIED — new types, RecentItem
│   │   └── index.ts                # MODIFIED — register workspaceSlice
│   ├── adapter/
│   │   ├── appModelAdapter.ts      # MODIFIED — new workspace/drag-drop bindings
│   │   ├── index.ts                # MODIFIED — new command() wrappers + arities
│   │   └── events.ts               # MODIFIED — file-drop subscription over the runtime's OnFileDrop
│   └── actions/
│       ├── actionRegistry.ts       # MODIFIED — new ids ('close-folder', 'clear-recent', 'new-file-here',
│       │                            #  'new-folder-here'), 'tree-context' surface, availability flips
│       └── actionDispatcher.ts     # MODIFIED — path-targeted dispatch for the 'tree-context' surface
├── app/
│   ├── useCommands.ts              # MODIFIED — onOpenFolder/onCloseFolder/onShowHiddenFolders/…
│   ├── useAppPresentation.ts       # MODIFIED — thread new menuState fields
│   ├── AppDialogs.tsx              # MODIFIED — mounts the new prompts
│   └── useDropHandler.ts           # NEW — the drop handler: ClassifyDroppedPaths + open orchestration (workspace-tree-ui.md)
├── i18n/locales/
│   └── en.json                     # MODIFIED — new folder/tree strings; rename view.menu.showWorkspace,
│                                    #  shell.workspace, shell.workspace.resize to sidebar wording
├── ui/primitives/Icon/
│   └── Icon.tsx                    # MODIFIED — folder, chevron, warning, refresh icon names
└── ui/widgets/
    ├── AppShell.tsx                # MODIFIED — recentFiles→recentItems rename; mounts WindowDropTarget
    ├── WorkspaceLayout.tsx         # MODIFIED — render WorkspaceTree as Sidebar children
    ├── WorkspaceTree/              # NEW
    │   ├── WorkspaceTree.tsx
    │   ├── WorkspaceTreeNode.tsx
    │   ├── WorkspaceTreeContextMenu.tsx
    │   ├── WorkspaceEmptyState.tsx    # "No folder open" + Open Folder button
    │   ├── HiddenFoldersToggle.tsx    # the sidebar switch (ToolButton + aria-pressed)
    │   ├── CreateEntryPrompt.tsx
    │   └── WorkspaceTree.module.css
    ├── WindowDropTarget.tsx        # NEW — window-wide drop highlight and hint (workspace-tree-ui.md)
    ├── dialogs/
    │   ├── WorkspaceReplacePrompt.tsx  # NEW — replace / open in new window / cancel
    │   ├── FolderDropPrompt.tsx        # NEW — multi-folder drop: first only / all in new windows / cancel
    │   └── CloseFolderPrompt.tsx       # NEW — close the tabs too / keep them open / cancel
    ├── Menubar/
    │   ├── Menubar.tsx              # MODIFIED — Close Folder / Clear Recent rows, name-only
    │   │                              #  recent labels, recent-item icon by kind, RefreshRecentItems on open
    │   ├── ApplicationMenubar.tsx   # MODIFIED — new menuState fields
    │   └── ViewMenu.tsx             # MODIFIED — renamed sidebar label key
    └── Launcher.tsx                 # MODIFIED — recentFiles→recentItems rename; its Open Folder button
                                     #  goes live on the 'open-folder' action; folder recents route by kind

tests/go/...                                        # ALL backend tests (tree builder, workspace session,
                                                    #  recent-items v1→v2 migration, drop classification,
                                                    #  new-window launcher port) — no in-package _test.go
frontend/tests/unit/widgets/WorkspaceTree/          # tree, empty/loading state, switch tests
frontend/tests/unit/widgets/dialogs/                # new dialog unit tests
frontend/tests/integration/...                      # existing suites asserting the renamed "Workspace" strings,
                                                    #  the File-menu row list and the deferred Open Folder state
frontend/tests/integration/workspace.test.tsx       # NEW
frontend/tests/integration/drop.test.tsx            # NEW
frontend/tests/e2e/workspace-tree.test.ts           # NEW — Stories 1, 2, 5 + Close/Replace prompts

docs/architecture.md                                # MODIFIED — new ADR + owners-table entries
```

**Structure Decision**: Extend the existing single-binary desktop layout in place. No new
top-level module, package boundary style, or build target is introduced; `internal/workspace/` is
the one new backend package, scoped narrowly to pure tree-building so it doesn't overload
`internal/file/` (path/identity/suffix ownership) or `internal/appmodel/` (session-state
ownership) — each keeps one responsibility per Constitution VIII.

## Complexity Tracking

| Deviation                                                                | Why it is needed                                                                                                                                                                                                                                           | Simpler alternative rejected because                                                                                                                                                                        |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Principle VI: the tree's right-click menu has no keyboard route (FR-043) | Product-owner decision taken during the 2026-09-19 clarification: the keyboard model is deliberately basic (Tab, Up/Down, Enter). The header "+" button is the keyboard route to New File/New Folder; Copy Path and Reveal remain mouse-only on tree rows. | Adding a Shift+F10/context-key route or a keyboard-reachable row menu widens the interaction model the owner explicitly bounded; it is a reviewable follow-up, not silent scope. Recorded here, not hidden. |
