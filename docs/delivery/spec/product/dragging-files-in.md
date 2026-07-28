# Dragging files in

## What it's for

Dragging a file from the desktop onto a window is how people open things when the file is already in
front of them. Without it, the same action takes a menu, a dialog and a directory to navigate. It is
also the path most likely to do something destructive if it is built carelessly — a webview's default
behaviour on a dropped file is to *navigate to it*, replacing the entire application with a rendering of
the file, and on Linux that happens with no warning at all.

## What you can do

Drag one or more files or folders from the file manager or the desktop onto the window. An overlay
appears saying **Drop to open**. Let go and they open.

A file opens in a new tab. A folder opens as the workspace. Dropping a folder while one is already open
asks whether you want it in this window or a new one.

Dragging in an image while the editor is focused inserts a link to it rather than opening it — that is
`formatting-text.md#image-insert-links-not-copies`.

## Rules

### Dropping opens; it never moves, copies or renames anything {#dropping-only-opens}
- A drop is an open. Nothing on disk is moved, copied, renamed or reordered by dragging into the window.

Examples: dragging `notes.md` from the desktop → it opens, and it is still on the desktop · a drop that
copied the file into the workspace → the app reorganising the user's files without being asked.

### A dropped path takes the same route as an operating-system open {#drops-use-the-os-open-path}
- The Go side receives **absolute filesystem paths** from the platform's own file-drop, not browser file
  objects.
- Each path is `stat`-ed to decide whether it is a file or a folder, and then routed through the **same**
  resolution used for an operating-system open.
- A dropped path and a double-clicked file therefore behave identically.

Examples: dropping `notes.md` and double-clicking it in Finder → the same tab, in the same mode · reading
the drop through the webview's own drag-and-drop data → a webview does not expose real paths, so the app
would have the file's bytes and not its location, and every relative image link in it would break.

### The webview's own drop is suppressed {#webview-drop-is-suppressed}
- The webview's default drop behaviour is prevented, on `dragover` and on `drop`.
- A drop never navigates the page to the dropped file.

Examples: dropping a file on Linux with WebKitGTK → the file opens in a tab · without the suppression →
the whole application is replaced by the browser's rendering of the file, and the only way back is to
restart.

### A drag-over shows an overlay {#drop-overlay}
- **While** files are dragged over the window, an overlay reads **Drop to open**.

Examples: dragging over → the overlay · no overlay → the user cannot tell whether the window will accept
the drop until they let go.

### A dropped file opens in a tab, in the default open mode {#dropped-files-open-in-tabs}
- **When** a supported file — `.md`, `.markdown`, `.mdown` or `.txt` — is dropped, it opens in a **new
  tab**, in the default open mode.
- **If** no document is open, or the current tab is an empty never-saved document, **then** it opens in
  the **current** tab rather than a new one.
- **If** the path is already open, **then** its existing tab is focused and no tab is added.
- Dropping several files opens each in its own tab; focus lands on the last.

Examples: three files dropped with nothing open → three tabs, the first reusing the empty one, focus on
the third · a file already open → its tab is focused, no fourth tab · default open mode Reading → each
lands in the reader.

### An unsupported file type is refused with a message {#unsupported-drops-are-refused}
- **If** a dropped file is not one of the four supported extensions, **then** a toast reads
  `Can't open that file type` and nothing opens.
- Image files are not in this class when the drop lands in the editor; see
  `formatting-text.md#image-insert-links-not-copies`.

Examples: a `.zip` dropped → the toast, no tab · a `.pdf` dropped → the toast, no tab · a `.png` dropped
into the editor → a Markdown image link at the caret.

### A dropped folder opens as the workspace {#dropped-folders-open-as-a-workspace}
- **When** a folder is dropped and **no** workspace is open, it opens as the workspace in the current
  window with no prompt.

Examples: a project folder dropped on a fresh window → the tree appears.

### Dropping a folder when one is open prompts {#dropping-a-folder-when-one-is-open-prompts}
- **When** a folder is dropped and a workspace is **already** open, a prompt offers:
  - **Open in this window** — replace the current workspace. Modified documents prompt first.
  - **Open in a new window** — launch a new window on the dropped folder, leaving this one untouched.
  - **Cancel** — nothing happens.

Examples: a second folder dropped with `Notes` open → the prompt · replacing silently → the user loses
the tree they were working in with no way back · opening a new window silently → windows accumulate
without being asked for.

### A mixed drop resolves deterministically {#mixed-drops}
- **When** files and folders are dropped together, every file opens as a tab and each folder runs the
  folder flow, prompting if a workspace is already open.
- **When** more than one folder is dropped, each runs the folder flow. Nothing is silently discarded.

Examples: two files and one folder dropped with nothing open → two tabs and the workspace · two folders
dropped → two folder flows, in order · the second folder ignored → the user dropped it and nothing
happened, with no message.

### A non-file drop is ignored safely {#non-file-drops-are-ignored}
- **If** the drop carries something that is not a file — selected text, a browser image, a dragged
  browser tab — **then** nothing happens: no crash, no action, no message.

Examples: dragging a paragraph from a browser onto the window → nothing · a known crash in the Windows
webview on a non-file drop → guarded against explicitly, because it takes the whole process down.

### A path that no longer exists is reported {#dropped-path-vanished}
- **If** a dropped path cannot be found when it is read, **then** a toast reports it and nothing opens.

Examples: a file deleted between the drag starting and the drop landing → the toast.

### Dragging in makes no network request and needs no extra permission {#drops-need-no-network}
- A drop reads a local file exactly as any other open does.

Examples: dropping a file with the network off → it opens.

## What it looks like

- The drag-over overlay — `../surface/mockup.html#material-light/drop-overlay`
- The folder-conflict prompt — `../surface/mockup.html#material-light/drop-prompt`

## When things go wrong

| Situation | What the user sees | What they can do |
|---|---|---|
| A `.zip` or `.pdf` is dropped | A toast: `Can't open that file type` | Drop a Markdown or text file |
| A dropped path no longer exists | A toast naming the file | Drop it again from its current location |
| A dropped folder cannot be read | `No permission to open that file` · `Check the file's permissions, or open a copy from somewhere you can write.` | Drop a folder they can read |
| Text or a browser image is dropped | Nothing at all | Nothing |

## Edge cases

**A file is dropped while the current tab is an empty new document**
- *Trigger:* `Ctrl/Cmd+N`, then a file is dropped without typing anything.
- *Expected:* the file opens in that tab. No empty tab is left behind.
- *Avoid:* a new tab beside an empty untitled one, which the user then has to close.

**A folder is dropped while documents are modified**
- *Trigger:* the folder-conflict prompt, with Open in this window chosen, while two documents are
  modified.
- *Expected:* the save prompt appears first, listing both. Cancelling it leaves the workspace unchanged.
- *Avoid:* replacing the workspace and closing the modified documents in the same action.

**Twenty files are dropped at once**
- *Trigger:* a whole folder's contents selected and dragged.
- *Expected:* twenty tabs, focus on the last, within the 40-document limit. Above the limit, the excess
  is refused with the limit message.
- *Avoid:* opening the first 40 and silently dropping the rest.

**A drop lands on the sidebar rather than the document area**
- *Trigger:* a file dropped on the file tree.
- *Expected:* the same as any other drop — it opens.
- *Avoid:* treating it as a move into that folder, which is a filesystem move and is refused everywhere
  else in the product.

**The same folder is dropped that is already open**
- *Trigger:* the open workspace's own folder is dragged in again.
- *Expected:* the prompt still appears; choosing Open in this window re-reads the tree.
- *Avoid:* detecting it and silently doing nothing, which reads as a failed drop.

## Not this

- **No drag-to-move or drag-to-copy on disk.** See `#dropping-only-opens`.
- **No reordering by dragging into the tree.** File operations are additive only; see
  `a-folder-of-notes.md#additive-operations-only`.
- **No dragging tabs out of the window to make a new one.** The tab set belongs to one window's model,
  so moving a tab between windows would mean moving a document between two processes.
- **No accepting dropped URLs or dropped web content.** There is no network path for it, and the app has
  no way to know what it received.

## Decisions

- *2026-07-10* — Drag-and-drop uses the platform's native path-based file drop rather than the webview's,
  because a webview's drag data does not expose real filesystem paths. Recorded in
  `../../adr/0012-drag-and-drop.md`.

## Open questions

*(none — ready to build)*
