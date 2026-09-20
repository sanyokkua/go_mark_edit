# Feature Specification: Folder Workspace Sidebar

**Feature Branch**: `feature/005-folder-workspace`

**Created**: 2026-09-19

**Status**: Draft

**Input**: User description: "Folder Workspace Sidebar — add a left sidebar that shows the files/folders of an opened folder (workspace), with Open Folder / Recent Files & Folders / Reopen Last / drag-and-drop opening / multi-window opening / tree context menu (New File, New Folder, Reveal, Copy Path)."

**Terminology note**: this document uses "workspace" for the internal concept of an opened folder.
Every user-visible string says **folder** — "Open Folder", "Close Folder", "No folder open", "This
folder is no longer available". "Workspace" never appears in the interface.

## Clarifications

### Session 2026-09-19

Decisions taken with the product owner and integrated into the requirements, scenarios, edge cases
and success criteria below. Listed here only so a later reader can see what was settled and when.

- Closing a folder is offered from both the File menu and the sidebar header, and asks whether to
  close the open documents too (close / keep / cancel).
- Replacing the open folder closes all open documents through the existing per-document save flow;
  cancelling any save prompt abandons the whole replacement.
- The replace-or-new-window choice applies to every folder-opening entry point, not just drops.
- Opening a folder never opens the files inside it; files open one at a time by user selection.
- Hidden files are always excluded. Hidden folders are excluded by default and revealed by a
  "Show hidden folders" switch; the document-type filter always applies regardless.
- Symlinks and aliases are never listed and never followed.
- The tree's entry bound is 20,000; the previous two-second rendering target is replaced by a
  loading state.
- The opened folder itself is the tree's first row; contents sort folders-first, then A→Z.
- Refresh preserves which folders are expanded and which row is selected.
- "Reopen Last" resolves by session: the most recently closed document while the session has one,
  otherwise the newest Recent entry.
- The tree's keyboard model is deliberately basic; there is no keyboard route to the context menu.
- A name-based search or filter box is out of scope for this feature.

### Session 2026-09-20

- New File and New Folder refuse a name that begins with a dot, inline in the dialog. Such an item
  would be created but never shown — dot files are always hidden and dot folders are hidden by
  default — so the action would appear to have done nothing.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Open a folder and browse it (Priority: P1)

A user opens a folder ("workspace") and sees its markdown/text files and subfolders laid out in a
sidebar tree. Selecting a file opens it in a tab, exactly as opening a single file does today.

**Why this priority**: This is the core value of the feature — without it, nothing else in this
spec has a reason to exist. It is also a complete, demoable slice on its own.

**Independent Test**: Can be fully tested by choosing "Open Folder," picking a directory with a
mix of markdown, text, and unrelated files, and confirming the sidebar shows only the matching
files/folders and that clicking a file opens it in a tab (or focuses it if already open).

**Acceptance Scenarios**:

1. **Given** no folder is open, **When** the user opens a folder that contains markdown and text
   files alongside other file types, **Then** the sidebar becomes visible and shows a tree whose
   first row is the opened folder itself, containing only the matching files and its subfolders,
   with non-matching files, dot files and dot folders hidden.
2. **Given** a folder has just been opened, **When** the user looks at the tree, **Then** only the
   items directly inside the opened folder are shown, every subfolder is closed, and within each
   level subfolders are listed before files with each group ordered A→Z ignoring capitalisation.
3. **Given** a folder is open, **When** the user selects a file in the sidebar tree, **Then** that
   file opens in a tab, or the existing tab for that file is focused if it's already open. Opening
   the folder itself never opened any of its files.
4. **Given** a folder is open, **When** the user opens a folder that contains no matching files,
   **Then** the sidebar shows a clear "no matching files" message instead of an empty or blank
   tree.
5. **Given** no folder is open at all, **When** the user looks at the sidebar, **Then** it shows an
   explicit "no folder open" message together with a control that opens a folder, rather than an
   empty panel.
6. **Given** a folder is open, **When** the user clicks the "Refresh" control in the sidebar,
   **Then** the sidebar re-reads the entire folder from disk, adding any newly created matching
   files or folders and removing any that no longer exist, while keeping the folders the user had
   opened up expanded and the row they had selected still selected.
7. **Given** a folder is open and the user's hidden-folders switch is off, **When** the user turns
   it on, **Then** the folder is re-read immediately and folders whose name begins with a dot — and
   the supported documents inside them — become visible, while files whose name begins with a dot
   remain hidden.
8. **Given** the user is reading a folder large enough to take a noticeable moment, **When** the
   read is in progress, **Then** the sidebar shows a loading state rather than appearing frozen or
   empty.
9. **Given** a folder is open, **When** the user clicks a file row whose file was deleted outside
   the application since the last read, **Then** no tab opens, the user is told the file is no
   longer there, and the tree is re-read automatically so the stale row disappears.

---

### User Story 2 - Return to recent work (Priority: P2)

A user who previously opened folders or files can quickly get back to them without browsing the
filesystem again, either by picking from a "Recent" list or by reopening the single most recent
item with one action.

**Why this priority**: Reduces friction for the most common real-world use case — coming back to
the same project repeatedly — without requiring the heavier automatic-restore behavior the
product intentionally avoids.

**Independent Test**: Can be fully tested by opening a folder, closing the app or the folder, then
confirming that folder appears in "Open Recent" and that "Reopen Last" reopens it directly.

**Acceptance Scenarios**:

1. **Given** the user has previously opened one or more folders and files, **When** they open the
   File menu, **Then** they see a bounded, most-recently-used list of those folders and files
   under "Open Recent," ordered with the most recent first, each row showing the item's own name
   with its full location available on hover.
2. **Given** the user has closed a document during the current session, **When** they trigger
   "Reopen Last," **Then** the most recently closed document reopens, exactly as it does today.
3. **Given** the user has closed no document in the current session — including immediately after
   starting the application — **When** they trigger "Reopen Last," **Then** the most recently
   opened folder or file from the Recent list opens instead.
4. **Given** a recent entry's path no longer exists on disk, **When** the user selects it,
   **Then** the system tells the user it's unavailable and removes it from the recent list,
   rather than failing silently or crashing.
5. **Given** recent entries exist, **When** the user chooses "Clear Recent" and confirms, **Then**
   the list is emptied.
6. **Given** two windows are open and one of them opens a folder, **When** the user next opens the
   other window's File menu, **Then** that newly opened folder is present in its "Open Recent"
   list.

---

### User Story 3 - Open by dragging files or folders in (Priority: P3)

A user drags one or more files or a folder from their OS file manager onto the application window
to open them, instead of using a menu.

**Why this priority**: A common, expected interaction for desktop editors, but purely additive to
Story 1 and 2's menu-driven flows — the app is fully usable without it.

**Independent Test**: Can be fully tested by dragging a single markdown file onto the window and
confirming it opens as a tab, then dragging a folder and confirming it opens as the window's
folder.

**Acceptance Scenarios**:

1. **Given** any state, **When** a valid drag hovers anywhere over the application window,
   **Then** the window shows a clear visual indication that the drop will be accepted.
2. **Given** no folder is open, **When** the user drags a folder onto the window, **Then** it
   opens as the folder of the current window.
3. **Given** a folder is already open, **When** the user drags a different folder onto the window,
   **Then** the system asks whether to replace the current window's folder or open the dropped
   folder in a new window.
4. **Given** any state, **When** the user drags one or more supported files onto the window,
   **Then** each opens as a tab.
5. **Given** any state, **When** the user drags two or more folders onto the window at once,
   **Then** a single question covers the whole drop, offering to open only the first folder, to
   open all of them with each in its own new window, or to cancel; choosing "only the first" then
   follows the single-folder rule above.
6. **Given** any state, **When** the user drags a mix of files and folders at once, **Then** each
   file opens as a tab and the folders follow the folder-drop behavior above.
7. **Given** the window is at or near its open-document limit, **When** the user drops more files
   than will fit, **Then** as many as fit are opened and one message reports how many were not
   opened and why.
8. **Given** any state, **When** the user drags an unsupported item onto the window, **Then** the
   drop is rejected with a clear notification and no state changes.

---

### User Story 4 - Work in more than one folder at once (Priority: P4)

A user wants to have two or more folders open side by side, each in its own window, without one
window's edits or navigation affecting the other.

**Why this priority**: Valuable for users juggling multiple projects, but not required for the
core single-folder editing experience to be complete and useful.

**Independent Test**: Can be fully tested by opening a folder, choosing "New Window," opening a
different folder in the new window, and confirming both windows keep independent tabs and
sidebars.

**Acceptance Scenarios**:

1. **Given** a folder is open, **When** the user chooses "New Window," **Then** a new, independent
   application window opens with no folder or tabs pre-loaded.
2. **Given** two windows are open, **When** the user opens or edits a document in one window,
   **Then** the other window's open tabs and folder are unaffected.
3. **Given** a folder is already open in the current window, **When** the user drags a folder in
   and chooses "open in a new window," **Then** that folder opens in a new window, leaving the
   current window's folder unchanged.

---

### User Story 5 - Create and reveal items from the tree (Priority: P5)

A user right-clicks a file or folder in the sidebar tree to create a new file or subfolder next to
it, reveal it in the OS file manager, or copy its path — without leaving the app.

**Why this priority**: A convenience layer on top of a working, browsable tree; useful but not
required for the feature's core browsing value.

**Independent Test**: Can be fully tested by right-clicking a folder in the tree, creating a new
file inside it, and confirming it appears in the tree and opens straight away.

**Acceptance Scenarios**:

1. **Given** a folder is open, **When** the user right-clicks a folder row in the tree — including
   the opened folder's own row — **Then** they can create a new file or a new subfolder inside it,
   and the tree reflects the new item.
2. **Given** the user is creating a new file, **When** they enter a name that does not end in a
   supported document type, **Then** the standard markdown extension is appended automatically; a
   name that already ends in a supported type is used exactly as typed.
3. **Given** the user is creating a new file or folder, **When** the name they entered is already
   taken in that folder, **Then** the dialog stays open with the entered name intact and shows the
   reason inline, so they can adjust it without starting over.
4. **Given** a new file has just been created, **When** creation succeeds, **Then** it opens in a
   tab with the editor focused, ready to type. A newly created folder appears in the tree only.
5. **Given** a folder is open, **When** the user right-clicks any row, **Then** they can reveal
   that item in the OS file manager and copy its full location.
6. **Given** a folder is open, **When** the user right-clicks a **file** row or a folder row that
   could not be read, **Then** only "reveal" and "copy path" are offered — creating a new file or
   folder is not offered there.
7. **Given** a folder is open, **When** the user right-clicks a file or folder in the tree,
   **Then** no rename, move, or delete action is offered.
8. **Given** the user is creating a new file or folder, **When** the name they entered begins with
   a dot, **Then** nothing is created and the dialog stays open with the entered name intact and
   shows the reason inline.

---

### Edge Cases

- What happens when the opened folder is moved, renamed, or deleted while it's open, and the user
  tries to browse or refresh it? System shows a clear "folder unavailable" state with the option to
  close it or retry, rather than crashing or silently showing stale data.
- What happens when a subfolder inside the opened folder can't be read (e.g. permission denied)?
  That subtree is skipped with a visible indicator on it, the rest of the tree continues to load and
  remains browsable, the row does not try to expand when clicked, and only "reveal" and "copy path"
  are offered on it.
- What happens when a folder contains far more entries than can reasonably be shown at once? The
  system shows as many as its bounded limit allows and clearly indicates the listing was truncated,
  rather than becoming unresponsive.
- What happens when the folder structure contains a symlink cycle? Symlinks are never listed or
  followed, so traversal always terminates.
- What happens when the user turns on "Show hidden folders" in a project holding a very large
  hidden folder? Those entries count toward the bound like any other, so the truncation indicator
  may appear; the user can turn the switch back off to get the filtered view again.
- What happens if the user tries to open the same folder that's already open in the current
  window? The existing folder stays as-is (no redundant reload/state loss).
- What happens if the user cancels a save prompt part-way through replacing the folder? The entire
  replacement is abandoned: the current folder stays open and every document that had not yet been
  closed stays open.
- What happens if the user reaches the window's open-document limit and selects another file in the
  tree? The open is refused with a message telling them to close one or more open documents first.
- What happens if a "Recent" entry points to a path that no longer exists? See User Story 2,
  Acceptance Scenario 4.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The application shall allow the user to open a folder as a workspace via an explicit
  action (e.g., a File-menu command).
- **FR-002**: While a folder is open, the application shall display that folder's files and
  subfolders in a sidebar tree.
- **FR-003**: The application shall include in the tree only files whose type matches the
  application's existing supported document types, plus folders (to allow reaching nested matches),
  shall always exclude files whose name begins with a dot, even when their extension is supported,
  shall exclude folders whose name begins with a dot unless the user has turned on "Show hidden
  folders" (FR-031), and shall never list and never follow symlinks and aliases, whether they point
  at a file or a folder.
- **FR-004**: The application shall indicate in the sidebar which file types are currently shown, as
  a fixed, non-editable filter, the "Show hidden folders" switch (FR-031) being the only adjustable
  aspect of what the tree shows.
- **FR-005**: When the user selects a file node in the tree, the application shall open it in a tab,
  or focus its existing tab if it is already open, and shall not, on opening a folder, open any of
  the files inside it.
- **FR-006**: If the opened folder contains no matching files, then the application shall show an
  explicit empty-result message in the sidebar rather than an empty or blank tree.
- **FR-007**: The application shall offer a manually triggered "Refresh" control in the sidebar that
  re-reads the entire current folder from disk, so that newly created matching files and folders
  appear and any that no longer exist disappear, shall preserve across that refresh which folders
  the user had expanded and which row was selected, for those still present, and shall not otherwise
  update the tree automatically in response to changes made outside the app.
- **FR-008**: The application shall maintain a most-recently-used list of previously opened folders
  and files ("Recent"), accessible from the File menu, ordered most-recent-first and bounded to at
  most 10 combined entries, shall label each entry with the item's own name, with its full location
  available on hover, and shall have each window re-read the stored list when its File menu is
  opened, so that entries added by another window appear without a restart.
- **FR-009**: The application shall provide a single "Reopen Last" action that, when the user has
  closed a document during the current session, reopens the most recently closed one, and otherwise
  opens the most recently opened folder or file from the Recent list, and that is unavailable only
  when both sources are empty.
- **FR-010**: If the user selects a recorded recent folder or file that no longer exists on disk,
  then the application shall inform the user and remove it from the recent list, rather than failing
  silently or crashing.
- **FR-011**: The application shall support opening files and folders by dragging them onto the
  application window.
- **FR-012**: When a folder is dropped and no folder is open in that window, the application shall
  open it as that window's folder.
- **FR-013**: When a folder is dropped and a folder is already open in that window, the application
  shall ask the user whether to replace the current window's folder or open the dropped folder in a
  new window.
- **FR-014**: When multiple files and/or folders are dropped together, the application shall open
  each file as a tab and shall handle the folders according to FR-012, FR-013 and FR-039.
- **FR-015**: If an unsupported item is dropped, then the application shall reject it with a clear
  notification and shall not change any existing state.
- **FR-016**: The application shall allow opening a new, independent application window with no
  folder or tabs pre-loaded.
- **FR-017**: The application shall ensure that actions taken in one window (opening, editing,
  closing documents or folders) do not alter the state of any other open window.
- **FR-018**: When the user right-clicks a node, the application shall offer to reveal the item in
  the OS file manager and to copy its full location, plus — on folder rows only — to create a new
  file inside that folder and to create a new subfolder inside it.
- **FR-019**: The application shall not offer rename, move, or delete actions in the sidebar tree in
  this feature.
- **FR-020**: If part of the folder cannot be read (e.g. a permission-denied subfolder), then the
  application shall skip that part, show a visible indicator on it, continue showing the rest of the
  tree, and not attempt to expand that row when it is clicked.
- **FR-021**: If the tree exceeds 20,000 combined entries, then the application shall show the first
  20,000 (by traversal order), shall clearly and persistently indicate that the listing was
  truncated, and shall not walk the remainder merely to report a total.
- **FR-022**: The application shall not automatically reopen the previous folder or files when it
  launches, and shall make every reopening an explicit user action (Open Folder, Open Recent, or
  Reopen Last).
- **FR-023**: The application shall offer a "Close Folder" action from both the File menu and a
  control in the sidebar header, both with identical behaviour: the window returns to having no
  folder open.
- **FR-024**: When documents are open and the user closes the folder, the application shall first
  ask whether to close those documents too, offering to close them, to keep them open, or to cancel
  the whole action.
- **FR-025**: When the user replaces the current window's folder with a different one, the
  application shall close all open documents using its existing per-document close flow, which
  prompts to save or discard each unsaved one, and shall, if any of those prompts is cancelled,
  abandon the replacement entirely, leaving the current folder and every not-yet-closed document
  untouched.
- **FR-026**: The application shall apply the replace-or-new-window choice in FR-013 to every action
  that opens a folder into a window that already has one — Open Folder, Open Recent, Reopen Last and
  drag-and-drop alike.
- **FR-027**: When a folder opens, by any route, the application shall make the sidebar visible.
- **FR-028**: While no folder is open, the application shall show in the sidebar an explicit "no
  folder open" message together with a control that opens a folder.
- **FR-029**: The application shall render the opened folder itself as the tree's first row, with
  its contents nested beneath it, and shall make that row collapsible and offer on it the same
  actions as any other folder row.
- **FR-030**: The application shall list folders before files within every level of the tree, and
  shall order each group A→Z ignoring capitalisation.
- **FR-031**: The application shall offer a "Show hidden folders" switch in the sidebar, off by
  default, that, when turned on, re-reads the current folder immediately and includes folders whose
  name begins with a dot, along with the supported documents inside them, and shall remember the
  setting across launches and apply it to windows opened afterwards, while windows already open keep
  their current view until they next read their folder.
- **FR-032**: When a folder is first opened, the application shall show only the items directly
  inside it, with every subfolder starting collapsed.
- **FR-033**: While a folder is being read, the application shall show a loading state in the
  sidebar rather than appearing frozen or empty.
- **FR-034**: The application shall visually distinguish in the tree the files that are currently
  open in a tab, and shall additionally mark those with unsaved changes.
- **FR-035**: When the user creates a file whose entered name does not end in one of the supported
  document types, the application shall append the standard markdown extension, and shall use a name
  that already ends in a supported type exactly as entered.
- **FR-036**: If a create action fails because the name is already taken, then the application shall
  keep the dialog open with the entered name intact and show the reason inline.
- **FR-037**: When a file is newly created, the application shall open it in a tab with the editor
  focused, and when a folder is newly created, the application shall show it in the tree without
  opening anything.
- **FR-038**: When the user chooses "Copy path", the application shall place the item's full,
  absolute location on the clipboard.
- **FR-039**: When two or more folders are dropped at once, the application shall ask a single
  question covering the whole drop, offering to open only the first folder, to open all of them with
  each in its own new window, or to cancel, and shall then follow FR-012/FR-013 if "only the first"
  is chosen.
- **FR-040**: The application shall accept drops over its entire window, and shall show a clear
  visual indication while a valid drag hovers over it.
- **FR-041**: If a drop contains more files than the window's open-document limit allows, then the
  application shall open as many as fit and report in one message how many were not opened and why.
- **FR-042**: If the window is already at its open-document limit and the user selects another file,
  then the application shall refuse the open and tell the user to close one or more open documents
  first.
- **FR-043**: The application shall make the tree reachable and operable from the keyboard to a
  basic level — focus can reach the tree, up and down move between rows, and the confirm key opens a
  focused file or expands and collapses a focused folder — without requiring a keyboard route to the
  right-click menu in this feature.
- **FR-044**: When the user invokes "Open Folder", the application shall start the folder picker at
  the user's home folder.
- **FR-045**: If the user selects a tree row whose file no longer exists on disk, then the
  application shall open no tab, tell the user the file is no longer there, and re-read the tree so
  the stale row is removed.
- **FR-046**: If the user enters a name that begins with a dot when creating a file or folder, then
  the application shall create nothing, keep the dialog open with the entered name intact and show
  the reason inline.

### Key Entities

- **Workspace**: An opened folder, represented by its root location and a filtered snapshot of its
  file/folder tree at the time it was opened or last refreshed. Which rows are expanded and which
  row is selected are presentation state only and are never persisted.
- **Tree Node**: A single file or folder within an opened folder; carries its location, name,
  whether it's a folder, and whether it could be read.
- **Recent Item**: A previously opened folder or file retained for quick re-access, ordered by
  recency, with a bounded maximum count, shared by every window.
- **Hidden-folders setting**: A remembered on/off preference controlling whether folders whose name
  begins with a dot appear in the tree. Off by default.
- **Application Window**: An independently running instance of the application, each with its own
  folder (if any) and set of open tabs, isolated from other windows.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A user can go from choosing "Open Folder" to having a file from that folder open and
  editable in 3 actions or fewer (open folder, locate file, select file).
- **SC-002**: While a folder is being read, the sidebar always shows a loading state; it never
  appears blank or frozen, and it never presents an incomplete tree as if it were complete. No
  reading-time guarantee is claimed.
- **SC-003**: 100% of files in the visible tree end in one of the supported document types, and no
  file whose name begins with a dot ever appears — with the hidden-folders switch on or off. With
  the switch off, no folder whose name begins with a dot appears either.
- **SC-004**: Returning to the most recently used folder or file takes exactly one user action
  ("Reopen Last"), plus at most one confirmation in the single case where the target is a folder
  and the window already has one open.
- **SC-005**: Dragging a single supported file or folder onto the window opens it without any
  additional dialog, except in the documented cases where a folder-replace choice or a
  multiple-folder choice is required.
- **SC-006**: A user can have two folders open in two separate windows and perform unrelated edits
  in each without either window's tabs, folder, or content being affected by the other.
- **SC-007**: When one subfolder of an open folder can't be read, the rest of it (100% of its
  otherwise-readable contents) remains browsable and usable.
- **SC-008**: Every action the tree's right-click menu offers succeeds or explains itself: no
  action is presented on a row where it cannot work, and no failure leaves the user without a
  stated reason.

## Assumptions

- The set of file types shown in the tree matches the application's existing supported document
  types; this feature does not change what counts as an openable document.
- No filesystem watcher exists in the product; the tree reflects the folder's state as of the last
  open or manual refresh, not live external changes, consistent with the product's existing
  no-background-activity principles.
- Renaming, moving, and deleting files or folders from the sidebar are explicitly out of scope for
  this feature and are not planned as a near-term follow-up without further design work, since
  doing so safely would require change-tracking (e.g., a watcher or undo journal) that doesn't
  exist yet.
- Searching or filtering the tree by name is out of scope for this feature; browsing is done by
  expanding folders. A search capability, if wanted, is its own feature.
- The application does not restore the previous session automatically on launch, consistent with
  its existing clean-launch behavior; "Open Recent" and "Reopen Last" are the explicit mechanisms
  for returning to prior work.
- "New Window" opens a fully independent instance of the application; windows do not share a live
  editing session, only the same underlying stored settings — the recent-items history and the
  hidden-folders preference — each of which is read at the moments described in FR-008 and FR-031
  rather than pushed between windows.
- This feature builds on already-delivered single-file open/save/tab behavior; that behavior's
  existing rules (supported types, the per-window open-document limit, save/conflict handling,
  etc.) are reused as-is, not redefined. FR-041 and FR-042 describe how this feature's entry points
  meet that existing limit; they do not change it.
- No network request of any kind is introduced by this feature, consistent with the product's
  offline-first, no-telemetry policy.
- The Recent list's cap of 10 combined entries and the tree's truncation limit of 20,000 combined
  entries are engineering guards chosen for testability; either may be tuned during
  planning/implementation without requiring a spec change, as long as both remain bounded and the
  truncation behavior in FR-021 is preserved.
