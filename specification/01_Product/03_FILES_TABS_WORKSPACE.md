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
8. [Tree filter](#tree-filter)
9. [Recent](#recent)
10. [Reopen last](#reopen-last)
11. [Multi-instance](#multi-instance)
12. [Drag-and-drop open](#drag-and-drop-open)
13. [Edge cases](#edge-cases)

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

## Open folder

**Open Folder** (`Ctrl/Cmd+K O`) opens a directory as a workspace tree (DD-06), shown in the sidebar
with the folder name as the workspace label. The tree is populated recursively but lazily — children
load when a node is expanded — with a large-folder guard to keep enumeration bounded and the UI
responsive (EC-WS-1). Selecting a file opens it in the default open mode (DD-27). The workspace root
also participates in the asset allowlist (`09_ASSETS_AND_SECURITY.md#allowlist`).

v1 has **no live filesystem watcher**; external changes are reflected on manual refresh (EC-WS-6).
Deleted/moved nodes are handled gracefully on next interaction (EC-WS-3); permission-denied subfolders
are skipped with an indicator (EC-WS-4); symlink cycles are bounded (EC-WS-5).

## Tree filter

The workspace tree is **filtered** to Markdown/text files only — `.md`, `.markdown`, `.mdown`, `.txt`
— hiding all other files and dotfiles (DD-06, EC-WS-7). Directories are always shown so users can
reach nested matching files. The sidebar footer displays the active filter chips (`.md`,
`.markdown`, `.txt`). A folder with no matching files shows an empty-tree message (EC-WS-2).

## Recent

GoMarkEdit maintains a bounded, MRU-ordered list of **recent files** and **recent folders** (DD-10),
surfaced under File → Open Recent. Opening or saving a file, and opening a folder, promote the path to
the top. Missing paths are pruned lazily when the list is shown or a stale entry is chosen (EC-DOCS-1).

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

## Drag-and-drop open

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
- **UC-DND-5** — Drag a `.png` (or a selection of text) onto the window → ignored with a brief toast; the
  document and workspace are unchanged.

## Edge cases

- **EC-DND-1** — Drop a **file** with no document open / current tab is an empty untitled buffer → opens
  in the current tab (not a new one).
- **EC-DND-2** — Drop a **folder** with **no** workspace open → opens in the current window (no prompt).
- **EC-DND-3** — Drop a **folder** with a workspace **already open** → prompt: Open in this window /
  Open in a new window; Cancel is available and does nothing.
- **EC-DND-4** — Drop a file whose **path is already open** → focus the existing tab, do not duplicate.
- **EC-DND-5** — Drop an **unsupported file type** → toast "Unsupported file type", open nothing.
- **EC-DND-6** — Drop a **mix** of files and folders → files open as tabs; each folder runs the folder flow.
- **EC-DND-7** — **Non-file** drop (text, browser image/tab) → ignored safely (no crash; guards the known
  WebView2 non-file-drop panic).
- **EC-DND-8** — Linux/WebKitGTK: the drop must **not** replace the UI with the file view (webview default
  drop suppressed).
- **EC-DND-9** — Drop a path that **no longer exists** by the time it is read → toast error, open nothing.
- **EC-DOCS-1** — Recent entry points at a missing file → error + prune from Recent.
- **EC-DOCS-2** — Open file modified on disk externally → prompt Reload / Keep mine.
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
