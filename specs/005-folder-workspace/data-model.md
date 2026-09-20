# Phase 1 Data Model: Folder Workspace Sidebar

All wire types travel through the existing `AppState`/`AppStatePatch` projection mechanism
(`internal/apperr/results.go` ↔ `frontend/src/logic/store/appModelTypes.ts`). Go is the source of
truth; every TS type below is a structural mirror, matching the existing convention (e.g.
`DocumentMetadata`).

## Entity: Workspace

An opened folder, represented by its root location and a filtered snapshot of its file/folder
tree at the time it was opened or last refreshed. At most one Workspace is open per window; `nil`/
`undefined` means no workspace is open. The tree is never persisted beyond the session —
reconstructed fresh on every Open/Refresh (Assumptions: "no filesystem watcher exists in the
product"); only the app-wide hidden-folders setting that shapes it is stored.

**Go** (`internal/apperr/results.go`):

```go
// WorkspaceSnapshot is the content-free frontend projection of the open workspace, if any.
type WorkspaceSnapshot struct {
	RootPath          string        `json:"rootPath"`
	RootName          string        `json:"rootName"`
	Root              WorkspaceNode `json:"root"`
	TotalEntries      int           `json:"totalEntries"`
	Truncated         bool          `json:"truncated"`
	Unavailable       bool          `json:"unavailable"`
	FilterSuffixes    []string      `json:"filterSuffixes"`
	ShowHiddenFolders bool          `json:"showHiddenFolders"`
}

// WorkspaceNode is one file or folder within a workspace tree.
type WorkspaceNode struct {
	Path       string          `json:"path"`
	Name       string          `json:"name"`
	IsDir      bool            `json:"isDir"`
	Unreadable bool            `json:"unreadable,omitempty"`
	Children   []WorkspaceNode `json:"children,omitempty"`
}
```

**TypeScript** (`frontend/src/logic/store/appModelTypes.ts`):

```ts
export interface WorkspaceNode {
    path: string;
    name: string;
    isDir: boolean;
    unreadable?: boolean;
    children?: WorkspaceNode[];
}

export interface WorkspaceSnapshot {
    rootPath: string;
    rootName: string;
    root: WorkspaceNode;
    totalEntries: number;
    truncated: boolean;
    unavailable: boolean;
    filterSuffixes: string[];
    showHiddenFolders: boolean;
}
```

**Validation / invariants**:

- `FilterSuffixes` is always `[".md", ".markdown", ".mdown", ".txt"]` (FR-004: "a fixed,
  non-editable filter") — sent by the backend rather than hardcoded twice, so the frontend never
  needs its own copy of the list to render the footer chips.
- `ShowHiddenFolders` mirrors the persisted, app-wide "show hidden folders" setting that was in
  effect when this snapshot was built (default `false`). It is stored in the settings KV store, so
  it applies to future windows and survives relaunch (one more `LayoutRepositoryAPI` field,
  `workspace.showHiddenFolders`, beside `workspace.visible`); it is echoed in the snapshot because the
  sidebar switch renders from the same projection as the tree it controls. Only the window that
  flips it re-reads immediately — another window keeps the tree it already has (and therefore its
  older `ShowHiddenFolders` value) until its next Open/Refresh/restart, so two windows may
  legitimately disagree.
- No loading flag lives on the snapshot: while a folder is being read there is often no snapshot at
  all (a first Open), and the bound methods answer one request/response call rather than streaming
  progress. The sidebar's loading state is frontend-local — a `reading: boolean` in
  `workspaceSlice` held while an Open/Refresh/hidden-folders/create call is in flight.
- `TotalEntries` counts files + folders actually included in the tree (post-filter), capped at
  20,000 (FR-021). `Truncated` is true only when the walk met one more includable entry after the
  cap was already reached — the walk stops at that entry and counts nothing further — so a folder
  holding exactly 20,000 entries is complete, not truncated (FR-021 says "exceeds").
- `Unavailable = true` means the root path could not be listed on the last Open/Refresh attempt
  (moved/renamed/deleted/permission-denied) — the tree (`Root`) retains its last-known content so
  the UI can still show what was there, badged unavailable, per the Edge Cases section ("rather
  than crashing or silently showing stale data" — the data is visibly marked stale, not hidden).
- A `WorkspaceNode` with `IsDir: false` never has `Children`. A `WorkspaceNode` with
  `Unreadable: true` never has `Children` (FR-020: subtree skipped, indicator shown).
- `Root` is the opened folder itself, not a hidden container: it is rendered as the tree's first
  row, with the folder's contents indented beneath it.
- Order is part of the built snapshot, not a render-time decision: inside every node's `Children`,
  folders come first and files after, each group sorted by name A→Z case-insensitively. The
  frontend renders the order it is given and never re-sorts.
- Every node in the tree already satisfies the inclusion rules listed under `Build` below; the
  frontend never filters the tree it receives.

**State transitions** (owned by `internal/appmodel/workspace.go`):

| From                               | Action                                                                                                     | To                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| no workspace                       | `OpenWorkspace(path)` succeeds                                                                             | workspace open, `Unavailable=false`                                                                                                                                                                                                                                                                                                                                                       |
| no workspace                       | `OpenWorkspace(path)` fails (not a dir / unreadable)                                                       | no workspace (refused, classified error)                                                                                                                                                                                                                                                                                                                                                  |
| workspace open (root R)            | `OpenWorkspace(R)` (same canonical root)                                                                   | no-op, unchanged (Edge Cases: "existing workspace stays as-is")                                                                                                                                                                                                                                                                                                                           |
| workspace open (root R)            | `OpenWorkspace(R2)`, R2 ≠ R                                                                                | the **frontend** first raises the replace-or-new-window prompt and, if replace is chosen, closes every open tab through the existing per-file save-or-discard flow; a cancel on any of those save prompts abandons the switch entirely — `OpenWorkspace` is never called, root R stays open and every not-yet-closed tab stays open. Once the replace completes, workspace open (root R2) |
| workspace open                     | `RefreshWorkspace()` succeeds                                                                              | workspace open, tree replaced, `Unavailable=false`                                                                                                                                                                                                                                                                                                                                        |
| workspace open                     | `RefreshWorkspace()` fails (root gone/unreadable)                                                          | workspace open, `Unavailable=true`, tree unchanged                                                                                                                                                                                                                                                                                                                                        |
| workspace open, `Unavailable=true` | `CloseWorkspace()`                                                                                         | no workspace                                                                                                                                                                                                                                                                                                                                                                              |
| workspace open, `Unavailable=true` | `RefreshWorkspace()` succeeds (root restored)                                                              | workspace open, `Unavailable=false`                                                                                                                                                                                                                                                                                                                                                       |
| workspace open                     | `CreateWorkspaceFile/Folder(...)` succeeds                                                                 | workspace open, tree rebuilt to include new entry                                                                                                                                                                                                                                                                                                                                         |
| workspace open                     | `CloseWorkspace()` — a real user action (`File > Close Folder` and the sidebar header `×`, same behaviour) | no workspace; the **frontend** first raises the three-choice prompt (close the tabs too / keep them open / cancel), and "close the tabs too" runs the existing per-file save-or-discard flow                                                                                                                                                                                              |
| workspace open                     | `SetWorkspaceHiddenFolders(show)`                                                                          | setting persisted app-wide; **only this window** re-reads its current folder immediately (tree replaced, `ShowHiddenFolders` updated). Other windows keep their tree until they next read the folder (Refresh, Open, or restart)                                                                                                                                                          |
| no workspace                       | `SetWorkspaceHiddenFolders(show)`                                                                          | refused `not-found`, nothing persisted — the switch renders only in the sidebar header, which exists only while a folder is open (`workspace-lifecycle.md`)                                                                                                                                                                                                                               |

## Entity: internal/workspace.Node / Snapshot (pure builder output, pre-projection)

Distinct from `apperr.WorkspaceNode`/`WorkspaceSnapshot` above only in that it carries no JSON
tags and is not itself a wire type — `internal/appmodel/workspace.go` maps
`workspace.Snapshot` → `apperr.WorkspaceSnapshot` after `workspace.Build` runs. Kept as a
separate type so `internal/workspace/` has zero dependency on `internal/apperr/`.

```go
// internal/workspace/tree.go
type Node struct {
	Path       string
	Name       string
	IsDir      bool
	Unreadable bool
	Children   []Node
}

type Snapshot struct {
	RootPath     string
	Root         Node
	TotalEntries int
	Truncated    bool
}

// Build walks root and returns the tree exactly as it will be rendered, ordered and
// filtered. showHiddenFolders governs dot-folders only; every other rule is fixed.
// The walk stops once maxEntries combined entries have been included.
func Build(root string, maxEntries int, showHiddenFolders bool) (Snapshot, error)
```

**Inclusion rules** (each applies at every depth, `Root` included):

- The document-type filter **always** applies to every file: a file is included only when its name
  ends in `.md`, `.markdown`, `.mdown` or `.txt`, compared case-insensitively (`NOTES.MD` counts).
  There is no mode, setting or entry point that lists another file type.
- A file whose name starts with a dot is **always** excluded, even when it ends in a supported type
  (`.draft.md` is never listed).
- A folder whose name starts with a dot is excluded — neither listed nor walked — while
  `showHiddenFolders` is false, and is listed **and walked** while it is true, so supported
  documents inside it (e.g. `.obsidian/notes.md`) become reachable. Files inside a shown dot-folder
  still obey the two rules above.
- Symlinks and macOS aliases are never listed and never followed, whatever they point at. This is
  what guarantees the walk terminates (research.md R3).
- Ordering is produced here, not in the UI: within each directory, folders first then files, each
  group sorted by name A→Z case-insensitively.
- `maxEntries` counts included entries only; skipped entries are never counted, and no true total
  is computed once the cap is hit. Callers pass 20,000 (`appmodel.OpenWorkspace`/`RefreshWorkspace`).

`Build` returns a non-nil `error` only when `root` itself cannot be listed (not a directory,
permission denied, does not exist) — the caller (`appmodel.OpenWorkspace`/`RefreshWorkspace`)
turns that into the `Unavailable`/refused-open handling described above. A subfolder failure
never surfaces as a Go `error`; it is encoded as `Unreadable: true` on that node.

## Entity: RecentItem (supersedes `RecentFiles []string`)

A previously opened folder or file retained for quick re-access, ordered by recency, bounded to
10 combined entries (FR-008; supersedes 003's 6-entry, files-only list per research.md R5).

**Go**:

```go
// RecentItem is one entry in the combined, most-recently-used Open Recent list.
type RecentItem struct {
	Path string `json:"path"`
	Kind string `json:"kind"` // "file" | "folder"
}
```

**TypeScript**:

```ts
export type RecentItemKind = 'file' | 'folder';

export interface RecentItem {
    path: string;
    kind: RecentItemKind;
}
```

**Field replacements** (mechanical rename, listed exhaustively so no call site is missed):

| Old                                                    | New                                                                                                                                          | File(s)                                                                                                                                                            |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AppStateSnapshot.RecentFiles []string`                | `AppStateSnapshot.RecentItems []RecentItem`                                                                                                  | `internal/apperr/results.go`                                                                                                                                       |
| `AppStatePatch.RecentFiles []string`                   | `AppStatePatch.RecentItems []RecentItem`                                                                                                     | `internal/apperr/results.go`                                                                                                                                       |
| `AppStateSnapshot.recentFiles?: string[]`              | `recentItems?: RecentItem[]`                                                                                                                 | `appModelTypes.ts`                                                                                                                                                 |
| `AppStatePatch.recentFiles?: string[]`                 | `recentItems?: RecentItem[]`                                                                                                                 | `appModelTypes.ts`                                                                                                                                                 |
| `DocumentsState.recentFiles?: string[]`                | `DocumentsState.recentItems?: RecentItem[]`                                                                                                  | `documentsSlice.ts`                                                                                                                                                |
| `'recentFiles'` in the `absentWhenNull` list           | `'recentItems'`                                                                                                                              | `logic/adapter/appModelAdapter.ts`                                                                                                                                 |
| `ProjectedActionState.recentFiles?: readonly string[]` | `recentItems?: readonly RecentItem[]`                                                                                                        | `actionRegistry.ts` (and its one read site, the `'open-recent'`/`'reopen'` availability checks — check `.length === 0` still works unchanged on the renamed array) |
| `MenubarProps.recentFiles?: readonly string[]`         | `recentItems?: readonly RecentItem[]`                                                                                                        | `Menubar.tsx`, `ApplicationMenubar.tsx`                                                                                                                            |
| `AppShell`'s `state.documents.recentFiles` selector    | `state.documents.recentItems` (the `showLauncher` length check and the `Launcher` prop are unchanged in shape)                               | `AppShell.tsx`                                                                                                                                                     |
| `Launcher`'s `safeRecentLabel(path)` call sites        | unchanged signature (still takes a `path: string`), but callers now extract `.path` from a `RecentItem` and pick an `Icon name` from `.kind` | `Launcher.tsx`, `Menubar.tsx`                                                                                                                                      |

**SQLite persistence** (`internal/appmodel/recent_files_repository_sqlite.go`):

- Existing (v1): key `recent.files`, value type `recent.files.v1`, payload
  `recentFilesValue{Version int; Entries []string}`.
- New (v2): key stays `recent.files` (same setting, generalized — not a new key, to keep a
  single history rather than starting a second empty list), value type `recent.files.v2`,
  payload `recentItemsValue{Version int; Entries []RecentItem}`.
- **Migration**: `DecodeVersionedJSON` on read, if the stored value's version is 1, decode as the
  old string-array shape and map every entry to `RecentItem{Path: entry, Kind: "file"}` before
  returning — additive/forward-only per Constitution V, no existing history is lost. The next
  `Promote()` call re-persists as v2. No explicit one-shot migration script is needed; this is a
  lazy, read-time upgrade, consistent with how `EncodeVersionedJSON`/`DecodeVersionedJSON`
  already version other settings.
- `maxRecentFiles = 6` renamed to `maxRecentItems = 10`, and the interface renamed
  `RecentFilesRepository` → `RecentItemsRepository` with `Promote(ctx, path, kind string) ([]RecentItem, error)`.
- The same interface gains `Clear(ctx) error`, backing the single Clear Recent row at the bottom of
  the Open Recent submenu (it persists an empty v2 list). There is no per-entry removal.

**Promotion call sites**:

| Call site                                                                                 | `Kind`     |
| ----------------------------------------------------------------------------------------- | ---------- |
| `OpenPath`/`CommitPreparedOpen` (existing, `internal/appmodel/file_lifecycle.go:264-281`) | `"file"`   |
| `OpenWorkspace` (new)                                                                     | `"folder"` |

## Entity: ReopenLast fallback state

No new persisted entity — a computed availability flag, per research.md R6:

```go
// applicationState (internal/appmodel/model.go)
canReopenLastFile = len(state.recentlyClosed) > 0 || len(state.recentItems) > 0
```

`ReopenLastFile(ctx, expectedTabSetRevision)` is one command resolved by session state:

1. Within the same session, while there is something to un-close, it consumes the most recent
   closed tab: `recentlyClosed[0]`, `OpenPath`, restore its saved view — today's shipped behaviour,
   unchanged code path.
2. When there is nothing to un-close — including in a freshly started app, whose `recentlyClosed` is
   empty by definition — it resolves the newest Recent entry, `recentItems[0]`: `Kind == "file"`
   opens that document via `OpenPath`; `Kind == "folder"` opens **nothing** and returns the new
   `OpenOutcome` status `folder-target { path }`, which the frontend routes through the same
   open-folder orchestration an Open Recent folder entry uses (replace-or-new-window prompt when a
   different folder is open, tab-close flow, then `OpenWorkspace`). The backend never calls
   `OpenWorkspace` here, so the frontend-owned replace decision cannot be bypassed. No view-restore
   step for the folder case (a workspace has no per-document view state).
3. The command is never dead while either source is non-empty. Only with both empty does it refuse
   with `ClassifiedNotFound` (unchanged refusal shape, updated message: "There is nothing to
   reopen.").

## Entity: DropClassificationResult (drag-and-drop)

Not persisted — a single request/response shape for the one new bound method,
`ClassifyDroppedPaths`.

**Go**:

```go
type DropClassificationResult struct {
	Failure
	Files       []string `json:"files,omitempty"`
	Folders     []string `json:"folders,omitempty"`
	Unsupported []string `json:"unsupported,omitempty"`
}
```

**TypeScript**:

```ts
export interface DropClassificationResult {
    files: string[];
    folders: string[];
    unsupported: string[];
}
```

**Validation rules** (FR-011 through FR-015):

- A path classifies as `Files` only if `os.Stat` succeeds, it is a regular file, and
  `file.IsSupportedDocumentSuffix` is true.
- A path classifies as `Folders` if `os.Stat` succeeds and it is a directory; it is returned
  canonicalized, so the frontend can compare it with `workspace.rootPath` by plain equality
  (`workspace-lifecycle.md` §ChooseWorkspaceFolder).
- Everything else (missing path, special file, unsupported suffix) classifies as `Unsupported`.
- No side effect happens inside `ClassifyDroppedPaths` itself — it is a pure classification call;
  opening happens via the frontend's existing `openRecentFile`/`openWorkspace` adapter calls
  (research.md R2).

## Action Registry additions (`frontend/src/logic/actions/actionRegistry.ts`)

**New `ActionSurface` member**: `'tree-context'`.

**New `ActionId` members**: `'close-folder'` (File menu and the sidebar header's `×`),
`'clear-recent'` (the Open Recent submenu's last row), and `'new-file-here' | 'new-folder-here'`
(materially different from `'new-file'`, which creates an untitled _tab_, not an on-disk file —
Constitution VIII: distinct behaviour gets a distinct id, not an overloaded one).

**Reused `ActionId`s, `surfaces` extended**: `'copy-path'` and `'reveal-in-file-manager'` each
gain `'tree-context'` in their `surfaces` array (same meaning — copy/reveal a path — different
target-resolution: a `targetPath` instead of a `targetDocumentId`).

**Availability flips** (existing entries, `fileDeferred` → `available()`): `'open-folder'`,
`'new-window'`. (`'export-pdf'` stays deferred — out of scope for this feature.)

**New `ProjectedActionState` field**: `recentItems?: readonly RecentItem[]` (see rename table
above).

**Availability by row type** (on the `'tree-context'` surface all four require a workspace open and
a target node in the dispatch context; no document-capability/writable check applies to any of them
— they operate on the filesystem directly, not on an open document's capability):

- `'new-file-here'` / `'new-folder-here'`: available on **folder rows only**, including the root
  row, which is an ordinary folder row for this purpose. Never available on a file row, and never
  on a folder row marked `Unreadable` (there is nothing the app can write into it).
- `'copy-path'` / `'reveal-in-file-manager'` on `'tree-context'`: available on **every** row — file
  rows, folder rows and unreadable folder rows alike — because both act on the path string and the
  OS, not on the row's contents.
- `'copy-path'` yields the target node's full absolute path; there is no relative-path variant.

## New `ClassifiedError` / notification vocabulary

No new `ClassifiedErrorCategory` or `ClassifiedRemediation` enum members are needed — every new
failure mode fits an existing category:

| Situation                                                                            | Category                                                | Remediation(s)                                                                                                                                                          |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OpenWorkspace` on a missing / unreadable / non-directory path                       | `not-found` / `permission-denied` / `unsupported-input` | `RemediationNone`                                                                                                                                                       |
| `RefreshWorkspace` finds the root gone                                               | `not-found`                                             | `RemediationNone` (surfaced via `Unavailable` state + a Close/Retry affordance in the UI, not a remediation action)                                                     |
| `CreateWorkspaceFile/Folder` name collision                                          | `conflict`                                              | `RemediationNone` — the create dialog stays open with the typed name intact and shows the error inline; the refusal never closes the dialog                             |
| `CreateWorkspaceFile/Folder` outside workspace root (containment check fails)        | `unsupported-input`                                     | `RemediationNone`                                                                                                                                                       |
| `CreateWorkspaceFile/Folder` with an empty name, a path separator or a leading dot   | `unsupported-input`                                     | `RemediationNone` — the dialog catches these first and shows the reason inline; the backend check is the authoritative one                                              |
| Drop contains an unsupported item                                                    | `unsupported-input`                                     | `RemediationNone`                                                                                                                                                       |
| Recent item's path no longer exists (FR-010)                                         | `not-found`                                             | `RemediationNone` (list entry removed as part of handling, per existing `RecentFilesRepository`'s lazy-prune-on-`List` pattern, generalized to `RecentItemsRepository`) |
| Opening a tree row whose file no longer exists on disk                               | `not-found`                                             | `RemediationNone` — the message says the file is no longer available, no tab is opened, and the tree is re-read automatically so the dead row disappears                |
| Opening a tree file while the window already holds 40 documents (`maxOpenDocuments`) | `capacity-limit`                                        | `RemediationNone` — the message tells the user to close one or more tabs first; this reuses 003's existing limit refusal, not a new code path                           |

**New `NotificationRemediationIntent` members** (`frontend/src/logic/store/notificationsSlice.ts`,
following the existing `'open-recent' | 'reopen-last' | ...` pattern used by
`reportClassifiedError`): `'open-folder' | 'refresh-workspace' | 'create-workspace-entry' | 'drop-unsupported' | 'reveal-workspace-path' | 'copy-workspace-path'`.

## New bound `AppModelHandler` methods (contract summary — full shapes in `contracts/workspace-lifecycle.md`)

| Method                      | Args                      | Result                                                                                                                                                                                                          |
| --------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OpenWorkspace`             | `path string`             | `apperr.WorkspaceResult` (embeds `WorkspaceSnapshot` on success)                                                                                                                                                |
| `RefreshWorkspace`          | —                         | `apperr.WorkspaceResult`                                                                                                                                                                                        |
| `CloseWorkspace`            | —                         | `apperr.VoidResult`                                                                                                                                                                                             |
| `CreateWorkspaceFile`       | `parentPath, name string` | `apperr.WorkspaceResult`                                                                                                                                                                                        |
| `CreateWorkspaceFolder`     | `parentPath, name string` | `apperr.WorkspaceResult`                                                                                                                                                                                        |
| `RevealWorkspacePath`       | `path string`             | `apperr.RevealResult` (existing type, reused)                                                                                                                                                                   |
| `CopyWorkspacePath`         | `path string`             | `apperr.CopyPathResult` (existing type, reused)                                                                                                                                                                 |
| `ClassifyDroppedPaths`      | `paths []string`          | `apperr.DropClassificationResult`                                                                                                                                                                               |
| `SetWorkspaceHiddenFolders` | `show bool`               | `apperr.WorkspaceResult` (persists the app-wide setting through `LayoutRepositoryAPI`, then re-reads this window's folder; refused `not-found` when no folder is open)                                          |
| `ClearRecentItems`          | —                         | `apperr.VoidResult` (empties the stored list; the now-empty `recentItems` reaches every surface through the ordinary state patch, and other windows see it when their File menu next re-reads the stored list)  |
| `RefreshRecentItems`        | —                         | `apperr.RecentItemsResult` (re-reads the stored list and publishes it when changed; called by the frontend when the File menu opens — FR-008's cross-window path)                                               |
| `ChooseWorkspaceFolder`     | —                         | `apperr.FolderChoiceResult` (native directory picker starting at the home folder; returns the chosen path, canonicalized, or `cancelled`, opens nothing — the frontend then runs the open-folder orchestration) |
| `OpenNewWindow`             | `folderPath string`       | `apperr.VoidResult` — on **`ApplicationHandler`** (`internal/application/handler.go`), not `AppModelHandler`; spawns one independent process via the `NewWindowLauncher` port, empty path = fresh window        |

All thirteen follow the existing `bridge.Guard(&res)` + `bridge.Once(handler.outcomes, request, ...)`
shape (e.g. `internal/appmodel/handler.go:62-67`), take a `bridge.Request` first argument, no
`context.Context` argument, and a named result — per Constitution III. `ReopenLastFile` (existing)
additionally gains the `folder-target` status described under "Entity: ReopenLast fallback state".
