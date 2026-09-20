# Contract: Workspace Tree UI — components, consumers, and reuse

This contract extends `specs/004-codebase-refactoring/contracts/shared-components.md`, which it
does not replace. Every component named below already has a contract entry there except the new
ones added at the bottom; this file records how the new tree feature composes with them, per the
same layering rule: `ui/widgets` compose components/read the store/dispatch through the action
registry → `ui/components` compose primitives, props only → `ui/primitives` leaf, props only →
`ui/styles` tokens only.

## User-facing wording

Every label, message and menu row this feature shows the user says **"folder"**, never
"workspace": _Open Folder_, _Close Folder_, _New Folder_, "No folder open", "This folder is no
longer available". "Workspace" stays an internal term — it is the name of the specs, the Go
packages, the state field, the components and the action ids below, and it never reaches a
translation string. Reviewers should read a user-visible "workspace" in `t('workspace.…')` copy as
a defect, not a variation.

## Layering (unchanged, restated for this feature's new files)

```
ui/widgets/WorkspaceTree/*        → compose components, read `state.workspace`/`state.documents`,
                                     dispatch through the action registry
ui/widgets/dialogs/WorkspaceReplacePrompt.tsx → same
ui/widgets/dialogs/FolderDropPrompt.tsx       → same
ui/widgets/dialogs/CloseFolderPrompt.tsx      → same
ui/widgets/WindowDropTarget.tsx               → same
(no new ui/components or ui/primitives are created by this feature)
```

## Sidebar — `ui/components/Sidebar/` (existing; now has a real consumer)

Unchanged component contract (`side`, `width`, `collapsed`, `minWidth`, `onResize`,
`onResizeEnd`, `children`). `frontend/src/ui/widgets/WorkspaceLayout.tsx` now passes
`<WorkspaceTree />` as `children` (previously passed none). Width/visibility continue to flow
from `logic/store/uiLayoutCommands` exactly as documented in `shared-components.md` — this
feature does not touch sidebar chrome, only its content. The sidebar auto-shows whenever a folder
opens from any entry point (menu, Open Recent, Reopen Last, drop, new-window startup argument) by
dispatching the same existing visibility command, not by a second visibility mechanism. It does so
in one place — in reaction to the projected `workspace.rootPath` appearing or changing, which also
covers a window that hydrates with a folder already open — not once per entry point.

## WorkspaceTree — `ui/widgets/WorkspaceTree/WorkspaceTree.tsx` (NEW)

Inputs: none from props — reads `state.workspace`, the active document's path (for row selection)
and the open documents' paths/dirty flags (for row marks) via `useAppSelector`, per the
`ui/widgets` layer's existing right to touch the store. Renders, top to bottom:

1. **Header row** — rendered only while a folder is open (its switch binds to
   `workspace.showHiddenFolders`, and `SetWorkspaceHiddenFolders` refuses without a folder). Controls
   only; **the opened folder's name is not a header title**, because the folder is the tree's first
   row (see Body). The row carries five existing `ToolButton`/`Icon`
   controls and no new icon-button component:
    - "Refresh" (dispatches `onRefreshWorkspace`).
    - "+" (opens `CreateEntryPrompt` scoped to the selected folder row, or the root when no folder
      row is selected).
    - **"Show hidden folders" switch** — a `ToolButton` in its existing toggle form (`pressed`
      bound to `workspace.showHiddenFolders`, `variant="text"` so the label is readable), which
      dispatches the hidden-folders command. Off by default; flipping it re-reads this window's
      folder immediately and leaves other windows' views alone (`workspace-lifecycle.md`).
    - "Collapse all" — clears the locally held expanded-paths set, returning the tree to the
      just-opened shape (root row expanded, every subfolder closed). Retained from the pre-
      clarification contract; the clarification pass neither added nor removed it, and it is the
      only way back to that shape now that Refresh deliberately preserves expansion.
    - **Close (`×`)** — dispatches the same Close Folder action as `File > Close Folder`, including
      its three-choice prompt (`CloseFolderPrompt` below). One action id, two entry points.
2. **Body** — one of:
    - No folder open: the empty state — "No folder open" plus an **Open Folder** `Button` that
      dispatches the **same** `'open-folder'` registry action the File menu row dispatches (not a
      second open path).
    - A folder read is in flight (open, refresh, hidden-folders flip, create): a loading state in
      place of the tree, so the sidebar never looks frozen. Derived from the pending command, not
      from projected backend state (`workspace-lifecycle.md`).
    - Folder open, `unavailable: true`: a `Banner` (existing primitive) reading "This folder is no
      longer available" with Close/Retry actions (Edge Cases section) — Close runs the Close Folder
      action, Retry calls `onRefreshWorkspace`.
    - Folder open, non-empty: `<WorkspaceTreeNode>` starting at `workspace.root` — the opened
      folder itself is the first row and its contents are indented beneath it.
    - Folder open, `totalEntries === 0`: the root row still renders, with the FR-006 empty-result
      message (`t('workspace.tree.empty')`) shown beneath it instead of children.
3. **Truncation indicator** — shown whenever `workspace.truncated`, a plain inline text row
   (FR-021) reading "Showing the first 20,000 items — some files are not listed." It is not a
   banner or a toast, it is not dismissible, and it stays visible for as long as the snapshot is
   truncated (this is persistent state, not a transient notification). No true total is computed
   or shown.
4. **Filter-chip footer** — `workspace.filterSuffixes` rendered as plain, non-interactive spans
   (FR-004: "a fixed, non-editable filter") using existing CSS tokens; explicitly **not** built
   on `Segmented` (that primitive is for interactive, selectable option groups — these chips are
   read-only, so using it would misrepresent the control's affordance). The type filter is never
   editable; the hidden-folders switch is the single adjustable part of what the tree shows.

**Row order** is whatever the snapshot supplies — folders first, then files, each group ascending
A→Z case-insensitively, guaranteed by `workspace.Build` (`workspace-lifecycle.md`). The tree
renders `children` in the received order and never re-sorts them.

**Expansion and selection** are local `useState` in this component (`expandedPaths:
Set<string>`, plus the focused/selected path) — ephemeral UI state, never Redux and never
persisted, per Constitution III's "Redux MUST remain a projection".

- **Initial state**: the root row is expanded, so the root's immediate children are visible; every
  subfolder starts closed.
- **After Refresh** (and after a create, or a hidden-folders flip): expanded folders stay
  expanded and the selected row stays selected, because `expandedPaths` and the selection are keyed
  by path and survive the snapshot swap untouched. Rows whose paths are no longer in the snapshot
  simply vanish; their stale entries in `expandedPaths` are inert.

## WorkspaceTreeNode — `ui/widgets/WorkspaceTree/WorkspaceTreeNode.tsx` (NEW)

Inputs: `node: WorkspaceNode`, `depth: number`, `selectedPath?: string`,
`openPaths: ReadonlySet<string>`, `dirtyPaths: ReadonlySet<string>`,
`expandedPaths: ReadonlySet<string>`, `onToggleExpand(path)`, `onOpenFile(path)`,
`onContextMenu(node, point)`. Renders one row: depth-indent, folder chevron (only if `isDir`),
`Icon` (`name="folder"` or `name="file"`), `unreadable` badge (small `Icon`, e.g. `name="warning"`,
when `node.unreadable`), label. The root row uses the same component at `depth: 0`; it is
collapsible and right-clickable exactly like any other folder row.

Interaction:

- Click on a file row calls `onOpenFile`; click on a readable folder row toggles `expandedPaths`
  via `onToggleExpand`; click on an `unreadable` folder row selects it but **does not attempt to
  expand it** (there is nothing to expand — the backend skipped that subtree).
- Right-click calls `onContextMenu` with the click point, for every row type including the root
  and unreadable rows.
- Opening a folder row never opens the files inside it; files open one at a time, by selection.

Row marks (all three are independent and can coexist on one row):

| Mark           | Meaning                                               | Source       |
| -------------- | ----------------------------------------------------- | ------------ |
| Selection      | `node.path === selectedPath` (active or last-clicked) | local state  |
| Open highlight | subtle highlight while the file is open in any tab    | `openPaths`  |
| Unsaved dot    | a dot as well, when that open file has unsaved edits  | `dirtyPaths` |

## Keyboard model (agreed scope: basic)

- `Tab` reaches the tree as a single tab stop.
- `Up`/`Down` move between the currently visible rows (a collapsed folder's children are not
  visible and are not reachable).
- `Enter` opens a focused **file** row, and toggles a focused **folder** row open/closed.

Explicitly **not** in this feature's scope, by decision rather than omission: arrow-key
expand/collapse (`Left`/`Right`), type-ahead row search, and any keyboard route to the right-click
menu. Adding one later is a new, reviewable change, not an implementation detail.

## WorkspaceTreeContextMenu — `ui/widgets/WorkspaceTree/WorkspaceTreeContextMenu.tsx` (NEW)

Direct structural copy of `ui/widgets/TabContextMenu.tsx`'s template — same `Popup` anchored at a
click point, same `MenuItem` rows, same `dispatchAction` call shape. Inputs:
`node: WorkspaceNode | undefined`, `anchor: PopupAnchor`, `open: boolean`, `onOpenChange`,
`onAction(actionId, node) => Promise<unknown>`, `onClose`. Rows come from
`actionsForSurface('tree-context')`, and availability is decided **per row type**:

| Row type                     | New File | New Folder | Reveal in File Manager | Copy Path |
| ---------------------------- | -------- | ---------- | ---------------------- | --------- |
| Root row (the opened folder) | yes      | yes        | yes                    | yes       |
| Folder row, readable         | yes      | yes        | yes                    | yes       |
| Folder row, `unreadable`     | no       | no         | yes                    | yes       |
| File row                     | no       | no         | yes                    | yes       |

In action-id terms: `new-file-here` and `new-folder-here` are available exactly when
`node.isDir && !node.unreadable` (the root row satisfies this like any other folder row);
`reveal-in-file-manager` and `copy-path` are available on every row, and `copy-path` always copies
the node's full absolute path (there is no relative-path variant).

No rename/move/delete row exists in this menu, ever (FR-019, ADR-0033) — this is enforced by the
action registry simply never defining such ids for the `'tree-context'` surface, not by a runtime
filter, so there is no code path that could accidentally add one later without a registry change
(and therefore a reviewable diff).

## CreateEntryPrompt — `ui/widgets/WorkspaceTree/CreateEntryPrompt.tsx` (NEW)

Built on `ModalShell` (existing primitive; same skeleton as `ui/widgets/dialogs/ClosePrompt.tsx`):
`dismiss="escape"`, focus-managed text input (target name), busy-guarded Create/Cancel buttons.
Inputs: `open`, `parentPath: string`, `kind: 'file' | 'folder'`,
`supportedSuffixes: readonly string[]` (the snapshot's `workspace.filterSuffixes` — the dialog holds
no copy of the list), `onCreate(name) => Promise<unknown>`, `onCancel`. One component serves both "New File" and "New Folder" (a `kind` prop selects the
copy/icon), rather than two near-identical dialogs — Constitution VIII.

Name handling, all of it in this one component so the rule lives in exactly one place:

- Client-side validation enables Create only for a non-empty name with no path separator; the
  backend (`CreateWorkspaceFile`/`CreateWorkspaceFolder`) re-validates authoritatively regardless
  (client validation is a UX convenience, never the source of truth).
- **A name beginning with a dot** (FR-046), for either kind: nothing is sent; the dialog shows an
  inline reason and keeps the typed name. The tree would never show such an item.
- **`kind: 'file'` with no supported extension**: `.md` is appended automatically before the
  create call. A name already ending in one of `supportedSuffixes` (case-insensitive — `.md`,
  `.markdown`, `.mdown`, `.txt`, the list the tree filters on) is sent exactly as typed.
  `kind: 'folder'` names are never extended.
- **Name collision** (`conflict` refusal from the backend): the dialog **stays open** with the
  typed name intact and shows an inline error; it does not close, does not clear the field, and
  does not surface a toast in its place.

On success: the parent folder's path is added to `expandedPaths`, so the new row is visible even
when the create was started on a collapsed folder. A newly created **file** is then opened in a tab
immediately, with editor focus, through the existing open command; a newly created **folder** just
appears in the refreshed tree and nothing is focused.

## WorkspaceReplacePrompt — `ui/widgets/dialogs/WorkspaceReplacePrompt.tsx` (NEW)

Built on `ModalShell`, same skeleton as `ClosePrompt.tsx`. Inputs: `open`, `folderPath: string`,
`onChoice(choice: 'replace' | 'new-window' | 'cancel') => Promise<unknown>`. Three `Button` rows
("Replace Folder" / "Open in New Window" / "Cancel"), busy-guarded. **One component, every call
site** (research.md R7, now applying to all entry points): `File > Open Folder`, an `Open Recent`
folder entry, a `Reopen Last` that resolves to a folder, a dropped folder, and the "only the first
folder" branch of `FolderDropPrompt` all raise this same component with the same choice semantics —
never a second implementation of the decision.

"Replace" first closes every open tab through the existing per-file save-or-discard flow and only
then calls `OpenWorkspace`; a cancel on any of those per-file save prompts abandons the whole
switch, leaving the current folder and every not-yet-closed tab in place
(`workspace-lifecycle.md`).

## FolderDropPrompt — `ui/widgets/dialogs/FolderDropPrompt.tsx` (NEW)

Built on `ModalShell`, same skeleton as `ClosePrompt.tsx`. Raised **once for the whole drop** when
a single drop contains two or more folders — never once per folder. Inputs: `open`,
`folderPaths: readonly string[]`,
`onChoice(choice: 'first-only' | 'all-new-windows' | 'cancel') => Promise<unknown>`. Three `Button`
rows: "Open only the first folder" / "Open all of them, each in a new window" / "Cancel".

- `'first-only'`: continue with `folderPaths[0]` alone. If this window already has a folder open,
  that then raises the normal single-folder `WorkspaceReplacePrompt` — the reused component above,
  not a fourth choice inside this dialog.
- `'all-new-windows'`: each folder opens in its own new window via the new-window launcher; this
  window's folder is untouched.
- `'cancel'`: nothing opens and no state changes.

Files dropped alongside the folders follow the normal file-drop path regardless of this choice.

## CloseFolderPrompt — `ui/widgets/dialogs/CloseFolderPrompt.tsx` (NEW)

Built on `ModalShell`, same skeleton as `ClosePrompt.tsx`. Raised by the Close Folder action, from
both of its entry points (`File > Close Folder` and the sidebar header's `×`), while at least one
document is open; with none open the action calls `CloseWorkspace` without asking (FR-024). Inputs:
`open`,
`onChoice(choice: 'close-tabs' | 'keep-tabs' | 'cancel') => Promise<unknown>`. Three `Button` rows:
"Close the tabs too" / "Keep them open" / "Cancel".

- `'close-tabs'`: close every open document through the existing per-file save-or-discard flow,
  then call `CloseWorkspace`.
- `'keep-tabs'`: call `CloseWorkspace` immediately; no tab is touched.
- `'cancel'`, or a cancel on any per-file save prompt: nothing closes — the folder stays open and
  every not-yet-closed tab stays open.

## WindowDropTarget — `ui/widgets/WindowDropTarget.tsx` (NEW)

**The whole window is the drop target**, not just the sidebar or the editor: this component is
mounted once by `ui/widgets/AppShell.tsx` as a window-sized overlay region that is inert until a
drag is in progress. While a valid drag hovers, it shows a visible highlight of the window edge
plus a short hint ("Drop files or a folder to open"), and it clears that state on drop, on leave
and on cancel. It renders nothing and intercepts no pointer event otherwise.

It does not open anything itself: it hands the dropped absolute paths to the existing drop handler,
which calls `ClassifyDroppedPaths` and then drives opening through the same commands the menu path
uses (`workspace-lifecycle.md`), including the tab-limit message when more supported files were
dropped than the 40-document limit allows.

## Out of scope for this feature

No search or filter box is added to the sidebar. Finding a file is done by browsing the tree; a
search affordance is a separate, future decision, not an omission to be fixed during
implementation.

## Action registry surface: `'tree-context'`

Recorded here (mirrored in `data-model.md`) because it is a UI-contract fact, not just a data
shape: `'tree-context'` is a new `ActionSurface`, following the exact precedent of `'tab-context'`
(`shared-components.md`'s Popup consumer list already includes "tab context menu (point or
focused-tab bounds)" — `'tree-context'` is the same pattern, one more Popup consumer, not a new
Popup variant).

## Consumer-inventory updates to copy into `docs/architecture.md`

- **Sidebar** (`docs/architecture.md`'s shared-components section): consumer list changes from
  "workspace panel (assistant later)" to "workspace panel (`WorkspaceTree`, this feature);
  assistant panel remains a future consumer."
- **Popup**: consumer list gains "workspace tree context menu (point-anchored)."
- **ModalShell**: consumer list gains "Create workspace entry, Replace workspace, Multi-folder
  drop, Close folder."
- **Banner**: consumer list gains "workspace unavailable state."
- **Button**: consumer list gains "sidebar empty state's Open Folder button."
- **ToolButton**: consumer list gains "workspace tree header (Refresh, New entry, Show hidden
  folders toggle, Collapse all, Close folder)."
