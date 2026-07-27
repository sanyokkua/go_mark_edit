**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester
**Last Updated:** 2026-07-10
**Cross-references:** `00_Foundation/04_DESIGN_DECISIONS.md`, `01_Product/01_FUNCTIONAL_REQUIREMENTS.md`, `01_Product/02_EDITOR_AND_VIEWER_MODES.md`, `01_Product/08_FILE_ASSOCIATIONS.md`, `02_Architecture/05_STATE_AND_PERSISTENCE.md`, `mockups/gomarkedit-mockup.html`

# Files, Tabs & Workspace

Document lifecycle, tabs, and the folder workspace. Refines
`01_FUNCTIONAL_REQUIREMENTS.md#fr-files`, `#fr-workspace`, `#fr-tabs`, `#fr-recent`, `#fr-autosave`.

## Table of Contents

1. [New, open, save](#new-open-save)
2. [Save As](#save-as)
3. [Autosave](#autosave)
4. [Dirty state](#dirty-state)
5. [Encoding and line endings](#encoding-and-line-endings)
6. [Tabs](#tabs)
7. [Open folder](#open-folder)
8. [File operations](#file-operations)
9. [Tree filter](#tree-filter)
10. [Recent](#recent)
11. [The empty state is a launcher](#the-empty-state-is-a-launcher)
12. [Reopen last](#reopen-last)
13. [Multi-instance](#multi-instance)
14. [Drag-and-drop, paste, and inserting images](#drag-and-drop-paste-and-inserting-images)
15. [Inserting an image, and pasting](#inserting-an-image-and-pasting)
16. [Edge cases](#edge-cases)

## New, open, save

**New file** (`Ctrl/Cmd+N`) creates an empty, never-saved buffer in a new tab, opened in Editor mode.
It has no path until saved and is never autosaved (DD-12).

**Open file** (`Ctrl/Cmd+O`) shows the native open dialog filtered to `.md`, `.markdown`, `.mdown`,
`.txt` (DD-07) and opens the chosen file in the default open mode (DD-27). Opening a path already open
in the window focuses the existing tab (EC-DOCS-11 / EC-TABS-1).

**Save** (`Ctrl/Cmd+S`) first **flushes** any pending editor-buffer sync to the backend application
model, then writes the backend's **canonical** content to the path (DD-62/DD-64, EC-DOCS-13) — it never
reads frontend text directly. The write is **atomic**: content goes to a temporary file in the same
directory and is renamed over the target, so a crash or a full disk mid-save can never leave the user
with a truncated or half-written document. A failed write leaves the original file exactly as it was
and the document still dirty. For a never-saved buffer, Save behaves as Save As. Save clears the dirty
flag on success and reports OS errors on failure (EC-DOCS-7). If format-on-save / lint-on-save are
enabled, they run first (`06_FORMAT_AND_LINT.md#on-save`).

## Save As

**Save As** (`Ctrl/Cmd+Shift+S`) shows the native save dialog, lets the user pick a path/extension,
and writes there — the tab then tracks the new path. Overwriting an existing file is confirmed by the
**native** dialog, not by an in-app prompt (EC-DOCS-10); declining the confirmation cancels the save and
changes nothing. Save As on a new buffer is how it first acquires a path and becomes
eligible for autosave.

## Autosave

Autosave (DD-12, default **on**) persists **existing** files automatically after edits, debounced (the
`useAutosave` hook schedules it). Like manual save, an autosave flushes the pending editor-buffer sync
and then writes the backend model's canonical content (DD-62/DD-64, EC-DOCS-13). It never writes a
never-saved buffer (EC-DOCS-6). The status bar shows
`Autosave: On/Off` and the document-name area shows an "autosaved" dot; the Settings menu and dialog
both toggle it. Turning autosave off leaves any dirty buffer dirty (EC-SET-4); the user then saves
manually.

## Dirty state

A document is **dirty** when its **canonical content in the backend application model** differs from
the on-disk (or never-saved) content. The dirty flag is **owned and computed by the backend**
(`internal/appmodel`, DD-62), updated after each debounced buffer sync / flush (DD-64), and delivered
to the UI via `state:patch` — the tab dot indicator, the close-prompt, and autosave all read the
backend's flag, never the frontend buffer. Saving (manual or auto) clears it. Formatting/linting that
mutates the buffer sets dirty (after the edit syncs). Closing a dirty tab/window or quitting prompts
Save / Discard / Cancel (EC-DOCS-5, EC-TABS-3).

## Encoding and line endings

New files are written **UTF-8** (DD-15). Opened files are read tolerantly; GoMarkEdit **preserves** the
file's existing line endings (LF/CRLF) and a leading BOM if present, on round-trip, and never silently
rewrites them (EC-DOCS-9). The status bar displays both the encoding (`UTF-8`) and line ending
(`LF`/`CRLF`). Non-UTF-8 or binary-ish content (e.g. via `.txt`) is read as tolerantly-decoded text
with a status-bar warning and must not be corrupted on save (EC-DOCS-8).

## Tabs

Each open document is a tab within the window (DD-05). Tabs show the basename, a dirty dot, and a close
control; a "+" adds a new tab (`mockups/gomarkedit-mockup.html` `.tabs`). Behaviour:

- Opening a path already open activates its tab; no duplicates (EC-TABS-1).
- Two tabs with the same basename from different folders disambiguate their labels (EC-TABS-4).
- Overflowing tabs scroll without breaking layout (EC-TABS-2).
- Closing a dirty tab prompts (EC-TABS-3); closing the last tab yields the empty state (EC-TABS-5).
- Each tab carries its own dirty state and per-document view state, held in the backend application
  model (DD-62; `02_EDITOR_AND_VIEWER_MODES.md#per-document-view-state`). The tab set (order + active
  tab) is likewise backend-owned; tab actions are commands reconciled via `state:patch` (EC-TABS-7).
- **Switching tabs is all-or-nothing.** The outgoing document's pending buffer and view state flush
  before the incoming one becomes active. If that flush fails the current tab stays active — there is
  no half-completed switch that leaves one document's text beside another's tab.
- **A stale tab command is rejected, not applied.** Reorder and close carry the tab-set revision they
  were issued against; if the set has moved on, the command is refused and the order is left intact
  rather than partially rewritten.

**The dirty dot means unsaved, and nothing else.** It is present when the document differs from what is
on disk and absent otherwise, on the active tab and on every background tab alike. It is not an
active-tab indicator — the active tab is shown by its own surface treatment. (The mockup encoded the
wrong thing until 2026-07-25.) While an autosave write is in flight the dot is muted rather than
removed, so a tab never looks saved before it is.

**Right-clicking a tab** opens a tab context menu: Close · Close others · Close to the right · Copy
path · Reveal in file manager. The mockup wired the tab's context menu to the *file tree's* menu, which
offered operations that do not apply to a tab.

**Tab keyboard navigation** is `Ctrl/Cmd+Tab` / `Ctrl/Cmd+Shift+Tab` (and `Ctrl+PageDown` /
`Ctrl+PageUp`), with `Ctrl/Cmd+Shift+Alt+T` reopening the last closed tab. Tab-by-number is not
available: `Ctrl+1/2/3` are heading shortcuts, which a Markdown author uses far more often.

**Dragging a tab to reorder** shows an insertion indicator between tabs at the position it would land,
and the dragged tab follows the pointer at reduced opacity. `Esc` during a drag cancels it and the tab
returns to where it was. Dragging past the end of a scrolled tab strip scrolls it. "Drag to reorder"
without these is a gesture with no feedback, which reads as broken rather than absent.

**The title bar shows where you are**: `<workspace> / <filename>`, plus the save state. Specifically —
`Notes / release-notes.md · autosaved`. The rules, because a breadcrumb with undefined edges is a
breadcrumb that will look wrong on somebody's machine:

- **`<workspace>`** is the open folder's name. With **no** folder open it is omitted and only the
  filename shows.
- **A file outside the open workspace** shows its parent folder's name in place of the workspace name,
  so it is clear the file is not part of what you have open.
- **A never-saved document** shows `Untitled` with no leading segment.
- **A deep path is not expanded.** Two segments, always. The full path is on the tab's tooltip and in
  Copy path.
- The trailing state is `autosaved`, `saved`, `unsaved changes`, or `read-only`.

## Open folder

**Open Folder** (`Ctrl/Cmd+Shift+O`) opens a directory as a workspace tree (DD-06), shown in the sidebar
with the folder name as the workspace label. The tree is populated recursively but lazily — children
load when a node is expanded — with a large-folder guard to keep enumeration bounded and the UI
responsive (EC-WS-1). Selecting a file opens it in the default open mode (DD-27). The workspace root
also participates in the asset allowlist (`09_ASSETS_AND_SECURITY.md#allowlist`).

v1 has **no live filesystem watcher**; external changes are reflected on manual refresh (EC-WS-6).
Deleted/moved nodes are handled gracefully on next interaction (EC-WS-3); permission-denied subfolders
are skipped with an indicator (EC-WS-4); symlink cycles are bounded (EC-WS-5).

## File operations

The app **creates** files and folders in the workspace. It **never** renames, moves, deletes or
reorders anything on disk (DD-77, ADR-0033).

| Operation | Where | Behaviour |
|---|---|---|
| **New file** | sidebar header button; tree context menu | Creates an empty `.md` in the selected folder, or the workspace root when nothing is selected, and opens it in a tab. The name is typed inline in the tree. |
| **New folder** | sidebar header button; tree context menu | Creates an empty directory in the same place, named inline. |
| **Reveal in file manager** | tree context menu; tab context menu | Hands the path to the platform. Named this way on every platform — not "Reveal in Finder", which is true on one of three. |
| **Copy path** | tree context menu; tab context menu | The absolute path to the clipboard. |

**A name that already exists is refused**, with a message naming the conflict. Nothing is ever
overwritten and nothing is silently renamed to `file (2).md`.

**The tree updates by inserting the node it just created**, not by re-enumerating the folder. This is
the whole reason creation is safe while renaming and deleting are not: after a create the app knows
exactly what changed. After a rename or a delete it would have to reconcile an unknown amount of state —
every open tab, the recent list, the whole subtree — with no filesystem watcher (EC-WS-6) and no way to
undo it if the user did not mean it. That reconciliation is the cost ADR-0033 declines to pay.

Renaming a file means using a file manager, or Save As. This is a real limitation and is recorded in
`00_Foundation/01_VISION_AND_SCOPE.md#refused-on-2026-07-25-with-reasons` rather than left to be
discovered.

## Tree filter

The workspace tree is **filtered** to Markdown/text files only — `.md`, `.markdown`, `.mdown`, `.txt`
— hiding all other files and dotfiles (DD-06, EC-WS-7). Directories are always shown so users can
reach nested matching files. The sidebar footer displays the active filter chips (`.md`,
`.markdown`, `.txt`). A folder with no matching files shows an empty-tree message (EC-WS-2).

## Recent

GoMarkEdit maintains a bounded, MRU-ordered list of **recent files** and **recent folders** (DD-10),
surfaced under File → Open Recent. Opening or saving a file, and opening a folder, promote the path to
the top. Missing paths are pruned lazily when the list is shown or a stale entry is chosen (EC-DOCS-1).

## The empty state is a launcher

There is no session restore (DD-11): the app launches clean, every time. So the no-tabs state is not an
edge case — **it is the first screen of every launch**, and it is the most-seen screen in the product.

It shows the app name, three actions — New file · Open file… · Open folder… — and the six most recent
documents and folders, each with its containing folder beneath it so two files called `notes.md` are
distinguishable. Clicking one opens it in the default open mode.

Exact copy is in `20_NOTIFICATIONS_AND_EMPTY_STATES.md#empty-states`, with the other four empty states.

## Reopen last

"Reopen last file / folder" (`Ctrl/Cmd+Shift+T`) reopens the most recent file or folder from the
recent list. This is the explicit path back into prior work: on launch the app opens **clean** with no
automatic session restore (DD-11). There is no crash recovery or swap file.

## Multi-instance

GoMarkEdit supports multiple app instances/windows VS Code-style (DD-08); there is **no single-instance
lock**. Opening a second file from the OS may open a new window/instance per the routing policy
(`08_FILE_ASSOCIATIONS.md#multi-instance-routing`). Because instances are separate processes, the
shared settings/recent SQLite database is opened with WAL + `busy_timeout` so concurrent instances
read/write it safely (DD-13, EC-SET-1); writes are infrequent (settings, recent).

**Two instances may hold the same document open, and both may be autosaving it.** The rule is
last-writer-wins with a check: before every write — manual or autosave — the app compares the file's
modification time against what it recorded when it last read or wrote the file. If it has changed
underneath, the write is **not** performed and the external-change prompt appears instead
(EC-DOCS-2). This is the same prompt an edit from any other program produces; a second GoMarkEdit
window is not a special case.

The check is a mitigation, not a lock. Two instances writing within the same filesystem timestamp
granularity can still lose an edit, and there is deliberately no lock file — DD-08 chose multiple
instances over single-instance safety, and this is the cost.

**The atomic write preserves the file's mode.** A save writes a temporary file in the same directory
and renames it over the target, so a crash or a full disk cannot truncate the user's file. A fresh temp
file does not inherit the original's permissions, so the app reads them first and re-applies them after
the rename. Hard links to the file are broken by the rename and extended attributes are not carried
across — both are consequences of atomic replacement, and neither is worth giving up crash safety for.

## Drag-and-drop, paste, and inserting images

The user can **drag files and folders from the OS file manager (or desktop) onto the GoMarkEdit window**
to open them. This is a convenience path equivalent to opening via a dialog or the OS "Open With"
association; it **only opens** — it never moves, copies, renames, or reorders anything on disk. It reuses
the native path-based open pipeline, so a dropped path and an OS-associated open behave identically
(DD-56–DD-59, `08_FILE_ASSOCIATIONS.md#onfileopen`).

**Files (DD-56).** A dropped supported file (`.md`/`.markdown`/`.mdown`/`.txt`) opens in a **new tab**,
or in the **current tab when no document is open** (or the current tab is an empty, never-saved buffer).
Multiple dropped files open as multiple tabs; a path already open **focuses its existing tab** (EC-DND-4,
EC-DOCS-11). The document opens in the **default open mode** (Reading (Viewer) / Editor, default Editor, DD-27). An **unsupported** file
type is rejected with a toast and opens nothing (EC-DND-5).

**Folders (DD-57).** A dropped folder opens as a **workspace** (filtered tree, `#open-folder`):

- **No workspace open** → the folder opens in the **current window**.
- **A workspace is already open** → the app **prompts** with two choices:
  - **Open in this window** — replace the current workspace with the dropped folder (open tabs are
    handled per the normal open-folder rules; unsaved buffers prompt to save, EC-DOCS-5).
  - **Open in a new window** — launch a **new instance** on the dropped folder (multi-instance, DD-08 /
    `08_FILE_ASSOCIATIONS.md#multi-instance-routing`), leaving the current window untouched.

**Mixed / multiple drops (DD-57).** Files and folders dropped together are resolved deterministically:
every file opens as a tab; each folder runs the folder flow (prompting if a workspace is open). Dropping
more than one folder opens each via the folder flow (successive new windows); nothing is silently dropped.

**Feedback & safety (DD-59).** On drag-over the window shows a **drop-target overlay** ("Drop to open").
The webview's **default drop is suppressed** so a drop never navigates the page to the file (a real hazard
on Linux/WebKitGTK). **Non-file drops** (selected text, a browser image or tab) are **ignored** — no crash,
no action. Drag-and-drop makes **no network** calls and needs the same read permission as any file open.

### Use cases

- **UC-DND-1** — Drag `notes.md` onto the window with no document open → it opens in the current tab in
  the default open mode.
- **UC-DND-2** — Drag three `.md` files onto the editor → three tabs open; focus lands on the last.
- **UC-DND-3** — Drag a project folder onto the window with nothing open → the folder opens as the
  workspace tree (filtered to Markdown/text).
- **UC-DND-4** — A workspace is already open; drag another folder → a prompt appears; choosing "Open in a
  new window" launches a second window on the dropped folder, leaving the first intact.
- **UC-DND-6** — Drag a screenshot from the desktop into the editor → a Markdown image link to that file
  appears at the cursor. The file is not copied and nothing else in the document changes.

## Inserting an image, and pasting

Dropping or pasting an image **inserts a link to it**. The app does not convert, re-encode, or reorganise
the user's files (DD-78).

**A dropped or pasted image file that already exists on disk** is linked by its path **relative to the
document**, so `![](assets/diagram.png)` keeps working when the folder is moved or shared. When the image
lies outside the document's folder tree — a different volume, or somewhere no relative path reaches — the
absolute path is inserted and a toast says so, because a relative link would silently be wrong.

**A clipboard bitmap has no path.** Pasting a screenshot copied from a screen-capture tool is the one
case in which the app writes a file: it is saved beside the document as `<document-name>-<n>.png`, and
then linked exactly as above. Nothing else about drop or paste writes to disk. If the document has never
been saved there is nowhere to put it, so the paste is refused with a message saying to save the
document first.

**Pasting tabular text produces a table.** Clipboard content that is unambiguously delimited rows and
columns — TSV, which is what Excel, Google Sheets and most database clients put on the clipboard, or CSV
— is inserted as a **GFM table** with a header row and aligned columns. Anything ambiguous is inserted
as plain text: the test is at least two rows and a consistent column count, not a guess.

This is the case the toolbar's Table button does not serve. That button inserts an empty skeleton you
then fill in; pasting a range you already have is the far more common way a table gets into a document.
`Ctrl/Cmd+Z` once returns the raw text if the conversion was not what you wanted.

**Pasted HTML or rich text is inserted as plain text, unchanged.** The app does not convert HTML to
Markdown. Copying from a browser or a word processor and pasting gives you the text without its
formatting — a predictable outcome. Converting it would mean guessing at the structure the user wanted,
and a wrong guess is harder to repair than plain text is to re-format.

**Dropping a non-image, non-Markdown file** — a `.zip`, a `.pdf` — still opens nothing and shows a toast
(EC-DND-5). That rule is about *opening*, and it now says so.

## Edge cases

- **EC-DND-1** — Drop a **file** with no document open / current tab is an empty untitled buffer → opens
  in the current tab (not a new one).
- **EC-DND-2** — Drop a **folder** with **no** workspace open → opens in the current window (no prompt).
- **EC-DND-3** — Drop a **folder** with a workspace **already open** → prompt: Open in this window /
  Open in a new window; Cancel is available and does nothing.
- **EC-DND-4** — Drop a file whose **path is already open** → focus the existing tab, do not duplicate.
- **EC-DND-5** — Drop a file type the app cannot **open** (a `.zip`, a `.pdf`) → toast "Can't open that
  file type", open nothing. Images are not in this class — see EC-DND-6.
- **EC-DND-6** — Drop or paste an **image file** into the editor → a relative Markdown image link is
  inserted at the cursor. Nothing is copied or written.
- **EC-DND-7** — Drop or paste an image that has **no relative path** to the document (another volume) →
  the absolute path is inserted and a toast explains why.
- **EC-DND-8** — Paste a **clipboard bitmap** → written beside the document as
  `<document-name>-<n>.png` and linked. This is the only write in the drop/paste path.
- **EC-DND-9** — Paste a clipboard bitmap into a **never-saved** document → refused, with a message
  saying to save the document first. There is nowhere to put the file.
- **EC-DND-10** — Paste **HTML or rich text** → the plain-text flavour is inserted verbatim. No
  conversion is attempted.
- **EC-DOCS-14** — Two instances have the same file open and both autosave → each write checks the
  file's modification time first; a changed file raises the external-change prompt instead of writing.
- **EC-DND-6** — Drop a **mix** of files and folders → files open as tabs; each folder runs the folder flow.
- **EC-DND-7** — **Non-file** drop (text, browser image/tab) → ignored safely (no crash; guards the known
  WebView2 non-file-drop panic).
- **EC-DND-8** — Linux/WebKitGTK: the drop must **not** replace the UI with the file view (webview default
  drop suppressed).
- **EC-DND-9** — Drop a path that **no longer exists** by the time it is read → toast error, open nothing.
- **EC-DOCS-1** — Recent entry points at a missing file → error + prune from Recent.
- **EC-DOCS-2** — Open file modified on disk externally → prompt **Reload / Keep mine**, with the
  **difference shown inside the prompt** using the diff view Phase 10 builds. A choice between "reload"
  and "keep mine" made without seeing what changed is a guess; showing it costs almost nothing once the
  component exists, and turns a frightening decision into an informed one. Before Phase 10 the prompt
  is the two choices alone.
- **EC-DOCS-3** — Open file deleted on disk → keep buffer, mark detached, Save recreates.
- **EC-DOCS-5** — Unsaved changes on close/quit → prompt Save / Discard / Cancel.
- **EC-DOCS-6** — New buffer never autosaved; needs explicit Save / Save As.
- **EC-DOCS-7** — Save to read-only location → surface OS error, keep dirty.
- **EC-DOCS-8** — Non-UTF-8 / binary content → tolerant read + warning, no corruption on save.
- **EC-DOCS-9** — BOM / CRLF preserved on round-trip.
- **EC-DOCS-10** — Save As overwrite confirmed by native dialog.
- **EC-DOCS-11** — Opening an already-open path focuses the existing tab.
- **EC-DOCS-13** — Save/autosave flushes the pending debounced buffer to the backend model first, then
  writes the backend's canonical content — never frontend text (DD-64).
- **EC-WS-1..7** — Workspace edge cases (large folder, empty, deleted node, permission denied, symlink
  loop, external change, filtering) as defined in `01_FUNCTIONAL_REQUIREMENTS.md#edge-cases`.
- **EC-TABS-1..7** — Tab edge cases (duplicate open, overflow, dirty close, name collision, last-tab
  empty state, middle-click/reorder, backend-owned tab set reconciled via `state:patch`).
- **EC-SET-1** — Settings/recent DB locked by another instance → WAL + `busy_timeout` retry.
- **EC-SET-4** — Autosave off with a dirty buffer keeps it dirty.
