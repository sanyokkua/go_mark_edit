# Contract: Workspace Lifecycle, Recent Items, and Drop Classification

This contract extends `specs/003-real-files-and-tabs/contracts/file-lifecycle.md`, which it
does not replace: `OpenPath`, `OpenFromDialog`, `NewDocument` and the 40-document/suffix rules
defined there are reused as-is. Logical shapes are language-neutral; implementation DTOs remain
typed `apperr.*Result` envelopes and adapter-only Wails calls, per Constitution III. "Workspace"
is the internal term used by these commands and types; every user-facing label for the same
concept is "folder" (Open Folder, Close Folder, "No folder open").

## Ownership

- `internal/workspace` owns pure filesystem tree construction (`Build`) — no live state, no
  locks, no dependency on `internal/appmodel` or `internal/apperr`.
- `internal/appmodel` owns the one open workspace's session state (root path, snapshot,
  unavailable flag) per window, alongside its existing document/tab/recent-item state — same
  owner, same revision/patch mechanism, no new state owner is introduced.
- `internal/appmodel` also owns the persisted, app-wide "show hidden folders" setting. It is one
  more per-field value in the existing `LayoutRepositoryAPI` store
  (`internal/appmodel/layout_repository.go`), beside `workspace.visible` and `workspace.width`:
  new field constant `LayoutWorkspaceHiddenFolders = "workspace.showHiddenFolders"`, default
  `false`. No new repository type or persistence mechanism is introduced.
- `internal/file` continues to own canonical path/identity/suffix rules
  (`IsSupportedDocumentSuffix`), the `RevealPort`/`ClipboardWriter` native ports, unchanged.
- `internal/application` owns the native folder picker (one more injected picker on the existing
  `DocumentDialogs`, backed by `runtime.OpenDirectoryDialog` in `main.go`), the new-window
  OS-process launcher and its `OpenNewWindow` bound method on `ApplicationHandler`, and the
  `DragAndDrop` Wails option, alongside its existing native window/dialog/menu ownership.
- Redux projects `workspace` and `recentItems` metadata only, same as every other projected
  field — components dispatch commands; they never invent a workspace, a tree, or a successful
  outcome.

## Snapshot and patch shape (extends the 003 contract's shape)

```text
AppStateSnapshot {
  ...                                   # unchanged fields from file-lifecycle.md
  recentItems: RecentItem[0..10]        # REPLACES recentFiles: string[0..6]
  canReopenLastFile: boolean            # now true if EITHER recentlyClosed OR recentItems is non-empty
  workspace?: WorkspaceSnapshot
}

AppStatePatch {
  ...                                   # unchanged fields from file-lifecycle.md
  recentItems?: RecentItem[0..10]       # REPLACES recentFiles
  canReopenLastFile?: boolean
  workspace?: WorkspaceSnapshot | null  # null explicitly clears (workspace closed); omitted = unchanged
}

RecentItem { path: string, kind: "file" | "folder" }

WorkspaceSnapshot {
  rootPath: string
  rootName: string
  root: WorkspaceNode                   # the opened folder itself, rendered as the tree's first row
  totalEntries: int
  truncated: boolean
  unavailable: boolean
  filterSuffixes: string[]              # always [".md", ".markdown", ".mdown", ".txt"]
  showHiddenFolders: boolean            # the app-wide setting this snapshot was built with
}

WorkspaceNode {
  path: string
  name: string
  isDir: boolean
  unreadable?: boolean                  # only on isDir nodes
  children?: WorkspaceNode[]            # only on isDir, readable nodes
}
```

`workspace` present-with-null vs. omitted follows the same convention as `activeDocument` in the
003 contract: omission means "unchanged," explicit `null` means "cleared." The adapter's
`absentWhenNull` normalization list gains `'workspace'`, and its existing `'recentFiles'` member is
renamed `'recentItems'`.

`root` is the opened folder's own node, not a synthetic container: `root.path === rootPath`,
`root.name === rootName`, `root.isDir === true`. The UI renders it as the tree's first row with
`root.children` indented beneath it (`workspace-tree-ui.md`).

`showHiddenFolders` mirrors the persisted setting at build time so the sidebar's switch renders
from projected state rather than a second frontend copy of the preference. No "loading" or
"reading" field is added to the snapshot: a folder read is in-flight only for the duration of one
bound call, so the sidebar derives its loading state from that pending command (the same way every
other busy-guarded surface in the app does) rather than from published backend state.

### Child ordering (part of the contract, not a UI detail)

`workspace.Build` emits every node's `children` already ordered: **folders first, then files**;
within each group ascending by name, **case-insensitive** (ties broken by raw byte order so the
order is stable and testable). The frontend renders `children` in the order received and never
re-sorts. The truncation bound below consumes entries in this same order, so "the first 20,000 by
traversal order" is deterministic.

## Commands

### ChooseWorkspaceFolder

```text
ChooseWorkspaceFolder() -> FolderChoiceOutcome

FolderChoiceOutcome =
  chosen { path: string }
  cancelled
  refused { classifiedError }
```

Opens the native directory picker starting at the user's home folder (FR-044) through the
`DocumentDialogs` owner (`internal/application/document_dialogs.go` gains a `chooseFolder` picker
next to `openFile`, injected from `main.go` with `runtime.OpenDirectoryDialog`), and returns the
chosen path **canonicalized** with the same directory helper `OpenWorkspace` uses. **It opens
nothing.** The frontend then runs the one open-folder orchestration it uses for every entry point:
same canonical root already open → no-op; a different folder already open →
`WorkspaceReplacePrompt`, then the tab-close flow (step 7 below); then `OpenWorkspace(path)`.

**Every folder path the backend hands the frontend is canonical** — this result,
`ClassifyDroppedPaths`' `folders`, Recent Items entries and `folder-target` — so the frontend's
"same folder" test is plain string equality with `workspace.rootPath`. Canonicalization resolves
symlinks (`/tmp/notes` is `/private/tmp/notes` on macOS), so comparing a raw path would raise the
replace prompt, and close every tab, for the folder that is already open.

Bound on `AppModelHandler` beside `OpenDocument`. The E2E harness cannot drive a native dialog, and
until Open Recent can route a folder entry there is no picker-free UI route to a folder, so the
real-backend suite opens folders through one harness helper — the real `OpenWorkspace(path)` binding
called from the page, or a launch with the startup folder argument below.

### OpenWorkspace

```text
OpenWorkspace(path) -> WorkspaceOutcome

WorkspaceOutcome =
  opened { workspace: WorkspaceSnapshot }
  unchanged { workspace: WorkspaceSnapshot }   # same canonical root already open
  refused { classifiedError }
```

1. Canonicalize `path`; if it equals the currently open workspace's root, return `unchanged`
   with the existing snapshot (Edge Cases: "the existing workspace stays as-is").
2. `os.Stat` the path; refuse `not-found` if it does not exist, `permission-denied` if it cannot
   be statted, `unsupported-input` if it is not a directory.
3. Call `workspace.Build(path, 20000, showHiddenFolders)` with the persisted setting's current
   value. A `Build` error refuses with the classified category matching the stat failure that
   caused it.
4. On success: replace `state.workspace`, promote `path` into Recent Items with `kind: "folder"`,
   bump `state.revision`, publish a patch carrying the new `workspace` and `recentItems` fields.
5. **The caller (frontend) is responsible for the replace-vs-new-window decision** when a
   _different_ workspace is already open in that window — `OpenWorkspace` itself has no knowledge
   of "replace" semantics; the frontend only calls it once a replace has been decided, or after
   spawning a new window (in which case the new window's own process calls it once, at startup,
   per the New Window contract below).
6. That decision applies to **every** folder-opening entry point, not just drag-drop:
   `File > Open Folder`, an `Open Recent` folder entry, a `Reopen Last` that resolves to a folder,
   and a dropped folder all raise the same prompt through the same component when the target
   window already has a different folder open.
7. **Choosing "replace" closes all tabs first.** The frontend closes every open document through
   the app's existing per-file save-or-discard flow (`file-lifecycle.md`'s close commands, reused
   verbatim — no new close path) and only then calls `OpenWorkspace`. **A cancel on any one of
   those save prompts abandons the entire switch**: the frontend stops closing, leaves every
   not-yet-closed tab open, and `OpenWorkspace` is never called, so the old folder stays open.

### RefreshWorkspace

```text
RefreshWorkspace() -> WorkspaceOutcome
```

Rebuilds the snapshot for the currently open workspace's root (FR-007: re-reads the entire
workspace from disk; newly created matching entries appear, removed entries disappear), using the
hidden-folders setting's current value. If the root cannot be listed, sets `unavailable: true` on
the existing snapshot, publishes that snapshot as a patch and answers `refused` — the previous tree
content is retained, not discarded, so the UI can show what was last known while flagging it. Refuses with `not-found` (no
open workspace) if called with none open. Row expansion and row selection are frontend-only state
and survive a refresh untouched (`workspace-tree-ui.md`); the backend neither stores nor restores
them.

### CloseWorkspace

```text
CloseWorkspace() -> VoidResult
```

Clears `state.workspace` unconditionally; publishes `workspace: null`. No-op safe to call with no
workspace open. It is a real, user-invoked command with two entry points that do exactly the same
thing — `File > Close Folder` and the `×` button in the sidebar header — and it remains the
recovery action from an `unavailable` workspace state.

**The caller (frontend) decides what happens to the tabs before calling**, exactly as it decides
the replace question: the three-choice prompt — _Close the tabs too_ / _Keep them open_ /
_Cancel_ — is raised by the frontend, and only while at least one document is open (FR-024); with
none open it calls `CloseWorkspace` directly. "Close the tabs too" closes every open document through the
existing per-file save-or-discard flow and only then calls `CloseWorkspace`; "Keep them open"
calls `CloseWorkspace` with no tab changes; "Cancel", or a cancel on any of those per-file save
prompts, abandons the whole close, leaving the folder open and every not-yet-closed tab open.
`CloseWorkspace` itself has no knowledge of tabs and never closes one.

### SetWorkspaceHiddenFolders

```text
SetWorkspaceHiddenFolders(show) -> WorkspaceOutcome
```

1. Refuse `not-found` if no workspace is open — the switch lives in the sidebar header, which only
   exists while a folder is open.
2. Persist `show` app-wide through the existing `LayoutRepositoryAPI` (field
   `workspace.showHiddenFolders`, default `false`), so it applies to every window opened afterwards
   and survives relaunch.
3. Rebuild this window's snapshot immediately with the new value (same work as
   `RefreshWorkspace`) and publish it, so the flip takes visible effect at once.
4. **Only the window that flipped it re-reads.** No cross-window message is sent; other open
   windows keep the view they already have until they next read their folder (Refresh, opening a
   folder, or restart), at which point they pick up the stored value.

Filtering rules applied by `workspace.Build`, in force for every build regardless of this setting:

- The document-type filter always applies to every file: only `.md`, `.markdown`, `.mdown`,
  `.txt`, via `file.IsSupportedDocumentSuffix`. It is fixed and non-editable.
- **Dot-files are always excluded**, even when their suffix is supported and even when the switch
  is on.
- **Dot-folders** are excluded — neither listed nor walked — while the switch is off, and are
  listed and walked while it is on, so supported documents inside them (e.g.
  `.obsidian/notes.md`) become reachable.
- **Symlinks and aliases**, to files or to folders, are never listed and never followed. This is
  what guarantees the walk terminates (research.md R3).

### CreateWorkspaceFile / CreateWorkspaceFolder

```text
CreateWorkspaceFile(parentPath, name) -> WorkspaceOutcome
CreateWorkspaceFolder(parentPath, name) -> WorkspaceOutcome
```

1. Refuse `not-found` if no workspace is open.
2. Refuse `unsupported-input` if `parentPath` does not canonically resolve inside the open
   workspace's root (containment check, symlink-safe, parallel to
   `file.CanonicalizeCandidateDocumentPath`'s existing logic) or if `name` is empty, contains a
   path separator, or begins with a dot (FR-046 — the tree would never show it).
3. Refuse `conflict` if an entry named `name` already exists under `parentPath`. The frontend
   keeps its dialog open on this refusal with the typed name intact (`workspace-tree-ui.md`).
4. Create (`os.WriteFile` with empty content, mode 0644, for a file; `os.Mkdir`, mode 0755, for a
   folder). `CreateWorkspaceFile` receives the name with its extension already resolved by the
   dialog (auto-appended `.md` when the typed name has no supported extension) and writes exactly
   the name it is given — extension policy lives in one place, the dialog, not in two.
5. Rebuild the whole snapshot (`workspace.Build`) and publish — this is a direct user action, not
   an out-of-band external change, so it updates the tree immediately without requiring a manual
   Refresh (User Story 5 AC1: "the tree reflects the new item").
6. A created **file** is then opened by the frontend through the existing `OpenPath`-backed open
   command, so it lands in a focused tab with editor focus; a created **folder** only appears in
   the tree. `CreateWorkspaceFile` does not open anything itself — there stays exactly one open
   orchestration path.

### RevealWorkspacePath / CopyWorkspacePath

```text
RevealWorkspacePath(path) -> RevealResult   # existing type, reused verbatim from file-lifecycle.md's sibling
CopyWorkspacePath(path) -> CopyPathResult   # existing type, reused verbatim
```

Both delegate to the same `revealPathViaPort`/`copyPathViaWriter` helpers the existing
document-ID-keyed `RevealInFileManager`/`CopyPath` use (research.md R8) — no new native
integration, only a new path-keyed entry point. `path` need not belong to an open document; any
node in the current workspace tree is valid, including the root node and an `unreadable` folder
node. `CopyWorkspacePath` always writes the node's **full absolute path**; there is no
relative-to-the-root variant and no format choice to make.

### ClassifyDroppedPaths

```text
ClassifyDroppedPaths(paths) -> DropClassificationResult

DropClassificationResult { files: string[], folders: string[], unsupported: string[] }
```

Pure classification, no side effects, no state mutation. `files` = stat-confirmed regular files
with a supported suffix; `folders` = stat-confirmed directories, returned canonicalized (see
ChooseWorkspaceFolder); `unsupported` = everything else.
The frontend is solely responsible for what happens next (FR-011 through FR-015): each `files`
entry opens via the existing `OpenPath`-backed `OpenRecentFile` bound method, up to the 40-document
limit, after which one message names how many were not opened and why; each `folders` entry opens
via `OpenWorkspace`, applying the same replace-vs-new-window decision as the menu path when a
workspace is already open in the target window; two or more dropped folders first raise one
whole-drop prompt (`workspace-tree-ui.md`); `unsupported` entries produce one notification listing
what was rejected, with no state change for those entries.

### RefreshRecentItems

```text
RefreshRecentItems() -> RecentItemsResult { recentItems: RecentItem[0..10] }
```

Re-reads the stored Recent Items list from SQLite and publishes it as a patch (`recentItems` plus
the recomputed `canReopenLastFile`) when it differs from this window's in-memory copy. This is
FR-008's cross-window mechanism: the frontend calls it each time the File menu opens (the Menubar's
existing file-menu open handler), so an entry another window recorded appears without a restart.
Backed by the two functions that already exist for this in `internal/appmodel/recent_files.go` —
`refreshRecentFiles` (today called only from `GetState`) and `publishRecentFiles` — generalized to
`RecentItem`; no second read path. Stale entries are pruned on this read by the repository's
existing lazy-prune-on-`List` behaviour.

### ClearRecentItems

```text
ClearRecentItems() -> VoidResult
```

Empties the persisted Recent Items list in one call (there is no per-entry removal), publishes
`recentItems: []` and the recomputed `canReopenLastFile` (which then reflects only this window's
`recentlyClosed` stack). The short confirmation shown before calling is a frontend concern; the
backend clears unconditionally when called. Other windows keep their in-memory list until their
File menu next re-reads the stored list.

### ReopenLastFile (extends the 003 contract's version)

```text
ReopenLastFile(expectedTabSetRevision) -> OpenOutcome

OpenOutcome gains one status:
  folder-target { path: string }   # the newest Recent entry is a folder; nothing was opened
```

One command, one menu row, resolved by session state (research.md R6, confirmed with the product
owner):

1. **Within the same session**, if `state.recentlyClosed` is non-empty, it brings back the most
   recent closed tab, behaving exactly as the 003 contract already specifies (consume the newest
   closed entry, `OpenPath`, restore its saved view) — shipped behaviour, unchanged.
2. **When there is nothing to un-close** — including in a freshly started app, whose
   `recentlyClosed` stack is always empty — it resolves the newest Recent entry, `recentItems[0]`:
   `kind: "file"` → `OpenPath`, as today. `kind: "folder"` → **the backend opens nothing** and
   returns `folder-target { path }`; the frontend then routes that path through the same
   open-folder orchestration an `Open Recent` folder entry uses (replace-or-new-window prompt when a
   different folder is open, the tab-close flow, then `OpenWorkspace`). The backend never calls
   `OpenWorkspace` from `ReopenLastFile`, because the replace decision and the tab-close sequence
   are frontend-owned (OpenWorkspace steps 5–7) and would otherwise be bypassed. No view-restore for
   the folder case.
3. Else, refuse `not-found` ("There is nothing to reopen.").

It is never unavailable while either source is non-empty: `canReopenLastFile =
len(recentlyClosed) > 0 || len(recentItems) > 0`.

## Native and filesystem ports (new, alongside the existing `DocumentDialogs` from file-lifecycle.md)

```text
NewWindowLauncher {
  Launch(folderPath string) -> error   # spawns a new OS process; folderPath may be empty
}
```

Exposed to the frontend as one bound method on the existing `ApplicationHandler`
(`internal/application/handler.go`, beside `WindowReady`/`RetryStartup`):

```text
OpenNewWindow(folderPath) -> VoidResult   # folderPath empty = a fresh window with nothing loaded
```

It is the single call behind `'new-window'` (empty path), the `WorkspaceReplacePrompt`'s "Open in
New Window" choice, and `FolderDropPrompt`'s "open all of them, each in a new window" (one call per
folder). A launcher failure refuses with `system-command-failure` and `RemediationRetry`.

Production implementation: `os.Executable()` to find the current binary, `exec.Command(execPath,
folderPath?).Start()` (detached, no `Wait()`). `main.go` parses `os.Args[1]` at startup and, when
present, calls the equivalent of `OpenWorkspace` once inside the existing `OnStartup` callback
(after `applicationContext.Init(ctx)` succeeds — see `docs/architecture.md`'s new ADR entry).
This path fires **only** when the parent process explicitly passed a folder path via this launch
mechanism — never from persisted state — so it must not be read as, and must not become, the
forbidden "auto-restore previous session" behaviour (Assumptions section; ADR-0004).

```text
DragAndDropOption { EnableFileDrop: true }   # options.App.DragAndDrop, set once in NewOptions
```

Dropped absolute paths reach the frontend through the generated runtime's own
`OnFileDrop(callback, useDropTarget)` / `OnFileDropOff()` (`frontend/wailsjs/runtime`), subscribed
inside `logic/adapter/` — the only layer allowed to import it. There is no Go-side drop callback and
no re-emitted app event: Go's part is the option above and `ClassifyDroppedPaths`. Registering
`runtime.OnFileDrop` in `main.go` and re-emitting one app event is the fallback only if the runtime
subscription proves not to deliver on a platform, and the task records that reason. The frontend then
calls `ClassifyDroppedPaths` and drives opening exactly as described above.
