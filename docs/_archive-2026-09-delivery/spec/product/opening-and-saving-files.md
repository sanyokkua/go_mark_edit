# Opening and saving files

## What it's for

The files on disk are the product. Everything else is a way of looking at them. So this is the part
where being wrong is unrecoverable: a save that truncates a file, a line ending silently rewritten
across a repository, an unsaved document closed without asking. A user who loses work once stops
trusting an editor permanently, and no other feature makes up for it.

## What you can do

`Ctrl/Cmd+N` makes a new empty document. `Ctrl/Cmd+O` opens the native file dialog, filtered to `.md`,
`.markdown`, `.mdown` and `.txt`. `Ctrl/Cmd+S` saves. `Ctrl/Cmd+Shift+S` saves under a new name.
**File → Open Recent** lists what you had open before, and `Ctrl/Cmd+Shift+T` reopens the most recent
one directly.

Existing files autosave as you type — that is on by default and there is a toggle. A brand-new document
that has never been saved is never written automatically; it needs a real Save first.

The status bar shows the file's encoding and line ending, and the title bar shows where you are:
`Notes / release-notes.md · autosaved`.

## Rules

### A new document has no path and is never autosaved {#new-documents-are-not-autosaved}
- `Ctrl/Cmd+N` creates an empty document in a new tab, in Editor mode, with no path.
- **While** a document has no path, autosave never writes it.
- **When** Save is pressed on a document with no path, it behaves as Save As.

Examples: new document, type, wait two minutes → nothing on disk · new document, `Ctrl/Cmd+S` → the
native save dialog · a new document silently written somewhere the app chose → the user has a file they
did not ask for, in a place they will not find.

### A new file opens in the editor regardless of the default open mode {#new-files-open-in-the-editor}
- Creating a new document always opens it in Editor mode, even when the default open mode is Reading.

Examples: default open mode Reading, press `Ctrl/Cmd+N` → the editor, because there is nothing to
read yet. · the same default of Reading with an **existing** file opened from the dialog → Reading,
because that file has something to read

### Opens from the file system use the default open mode {#opens-use-the-default-open-mode}
- The **default open mode** setting is **Editor** or **Reading (Viewer)**, and it defaults to Editor.
- It applies to every open that comes from the file system: an operating-system "Open With" or
  double-click, a drag-and-drop, a click in the workspace tree, and the in-app Open dialog.
- **When** the mode is Editor, the document opens in its own persisted arrangement; for a first-time
  open with nothing persisted, the last-used arrangement is used, falling back to Split.
- **When** the mode is Reading, the document opens directly into chrome-hidden reading mode.

Examples: default Editor, double-click `notes.md` in Finder → the editor · default Reading, same action
→ the reader · default Reading, `Ctrl/Cmd+N` → the editor, see `#new-files-open-in-the-editor`.

### Save flushes first, then writes the backend's copy {#save-flushes-then-writes}
- **When** Save runs, it first flushes any pending editor-buffer sync into the backend model, then writes
  the backend's canonical content to the path.
- It never reads text from the editor widget directly.

Examples: type the last word and press `Ctrl/Cmd+S` immediately → the word is in the file · writing the
backend copy without flushing → the last few characters are on screen and missing from disk, which the
user reads as data loss and cannot reproduce reliably.

### Every write is atomic and preserves the file's permissions {#writes-are-atomic}
- A save writes to a temporary file **in the same directory** and renames it over the target.
- The original file's mode is read before the write and re-applied after the rename, because a fresh
  temporary file does not inherit it.
- **If** the write fails at any point, **then** the original file is exactly as it was and the document
  is still modified.

Examples: the disk fills mid-save → the original file is intact and the tab still shows its modified dot
· writing in place → a crash or a full disk leaves a truncated document, and the user's only copy is the
truncated one · a file that was `0600` before the save → still `0600` after.

*Known consequences of atomic replacement:* hard links to the file are broken by the rename, and
extended attributes are not carried across. Neither is worth giving up crash safety for.

### Line endings and a byte-order mark survive a round trip {#line-endings-and-bom-are-preserved}
- New files are written **UTF-8** with **LF** line endings and no byte-order mark.
- **When** an existing file is opened, its line endings are detected and preserved on save: a file
  opened with CRLF is saved with CRLF.
- **When** an existing file begins with a byte-order mark, the mark is preserved on save.
- Neither is ever silently rewritten.
- The status bar shows both, for example `UTF-8` and `CRLF`.

Examples: a Windows file with CRLF, edited one line, saved → every line still CRLF, and `git diff` shows
one changed line · the same file normalised to LF on save → a one-line edit becomes a whole-file diff,
and it happens to every file the user touches before anybody notices.

### Content that is not clean UTF-8 is read tolerantly and never corrupted {#tolerant-decoding}
- **When** a file's bytes do not decode cleanly as UTF-8, it is read tolerantly, the status bar carries a
  warning, and the document opens.
- **If** such a document is saved, **then** the bytes that could not be decoded are not corrupted.

Examples: a `.txt` in a legacy encoding → it opens with a warning and can be read · saving it and
mangling every non-ASCII character → the file was silently destroyed by an editor that offered to open
it.

### Save As lets the native dialog handle overwriting {#save-as-uses-the-native-dialog}
- **When** Save As is used and the chosen path exists, the **native** dialog asks for confirmation. The
  app does not add its own prompt.
- **If** the confirmation is declined, **then** the save is cancelled and nothing changes.
- After a successful Save As the tab tracks the new path, and the document becomes eligible for autosave.

Examples: choosing an existing name → one confirmation, the platform's own · an in-app prompt as well →
two dialogs asking the same question.

### Autosave writes existing files on a debounce and never formats {#autosave}
- Autosave is **on** by default and can be turned off.
- **While** autosave is on and a document has a path, edits are written after a pause in typing.
- **Autosave never runs format-on-save or lint-on-save.** Those run on an explicit save only.
- **When** autosave is turned off, any modified document stays modified; nothing is written to close the
  gap.
- A successful autosave raises **no toast**, ever. The status bar and the tab's dot are the feedback.

Examples: typing in a saved file → written a moment after you stop, no notification · format-on-save
enabled and autosave on → the formatter does not reflow the document under the caret every few seconds ·
a success toast per autosave → a toast every few seconds while typing, which hides everything else.

### An explicit save reports what it wrote {#explicit-save-reports}
- **When** `Ctrl/Cmd+S` succeeds, a success toast names the file and how it was written:
  `Saved · release-notes.md · UTF-8 · LF preserved`.

Examples: an explicit save → one toast · an autosave → none, see `#autosave`.

### A write checks the file has not changed underneath {#external-change-check}
- **When** any write runs — manual or autosave — the file's modification time is compared against what
  was recorded when the app last read or wrote it.
- **If** it has changed, **then** the write does **not** happen and the external-change prompt appears
  instead, offering **Reload** or **Keep mine**, with the difference shown inside the prompt.
- A second GoMarkEdit window holding the same file is not a special case; it produces the same prompt.

Examples: `git checkout` changes the file under an open tab → the next save prompts instead of
overwriting · two windows autosaving the same file within one filesystem timestamp tick → an edit can
still be lost, and that is the accepted cost of running several instances with no lock.

*Why this is a mitigation and not a lock:* there is deliberately no lock file. Several instances were
chosen over single-instance safety, and this check narrows the window rather than closing it.

### A document is modified when it differs from disk {#dirty-state}
- A document is modified when the backend's canonical content differs from what is on disk, or when it
  has never been saved and is not empty.
- The tab's dot means **unsaved and nothing else**. It appears on background tabs exactly as it does on
  the active one; the active tab is shown by its own surface treatment.
- **While** an autosave write is in flight the dot is **muted** rather than removed.

Examples: three background tabs modified → three dots · the dot used to mean "active tab" → a clean
active tab looked unsaved and a modified background tab looked fine, which was the state of the mockup
until 2026-07-25 · the dot cleared when the write starts → the tab looks saved before it is.

### Closing or quitting with unsaved work always asks {#close-prompts-when-modified}
- **When** a modified document is closed, a prompt offers **Save**, **Discard** and **Cancel**.
- **When** the app is quit with several modified documents, **one** dialog lists all of them by name with
  **Save all**, **Discard all** and **Cancel**.

Examples: four modified documents, `Cmd+Q` → one dialog naming four files · four dialogs in sequence →
four decisions where one was enough, and no way back once the user starts clicking through.

### The recent list is bounded and prunes lazily {#recent-list}
- Opening or saving a file, and opening a folder, move that path to the top of the recent list.
- **If** a recent entry no longer exists when the list is shown or the entry is chosen, **then** it is
  removed from the list and an error is shown for an explicit choice.
- `Ctrl/Cmd+Shift+T` reopens the most recent file or folder.

Examples: a file deleted outside the app → it disappears from Recent the next time the menu opens ·
checking every entry on a timer → background work this product does not do.

### The title bar shows two path segments and the save state {#title-bar-breadcrumb}
- The title bar reads `<workspace> / <filename>` followed by the save state.
- **If** no folder is open, **then** the workspace segment is omitted and only the filename shows.
- **If** the file is outside the open workspace, **then** its own parent folder's name is shown in the
  first segment, so it is clear the file is not part of what is open.
- A never-saved document shows `Untitled` with no leading segment.
- A deep path is **not** expanded — two segments, always. The full path is on the tab's tooltip and in
  Copy path.
- The trailing state is one of `autosaved`, `saved`, `unsaved changes`, `read-only`.

Examples: `Notes / release-notes.md · autosaved` · no folder open → `release-notes.md · saved` · a file
from elsewhere while `Notes` is open → `Downloads / draft.md · unsaved changes` ·
`Users / ana / Documents / Notes / release-notes.md` → not shown, because a breadcrumb with no bound
looks wrong on somebody's machine.

## What it looks like

- The File menu — `../surface/mockup.html#material-light/menu-file`
- Save / Discard / Cancel on close — `../surface/mockup.html#material-light/save-prompt`
- Quitting with several modified documents — `../surface/mockup.html#material-light/quit-prompt`
- The file changed on disk — `../surface/mockup.html#material-light/reload-prompt`
- The launcher, with Recent — `../surface/mockup.html#material-light/empty`

## When things go wrong

| Situation | What the user sees | What they can do |
|---|---|---|
| The file has been deleted since it was opened | `Couldn't find that file` · `It may have been moved or deleted. Check the path and try again.` The buffer is kept and marked detached | Save, which recreates the file |
| Saving to a location the process cannot write | `No permission to open that file` · `Check the file's permissions, or open a copy from somewhere you can write.` The document stays modified | Save As somewhere writable |
| The disk is full during a save | `Couldn't finish reading or writing` · `The disk may be full or the file may be in use. Try again.` The original file is untouched | Free space and save again |
| A recent entry points at a missing file | An error, and the entry is removed from the list | Open the file from its new location |
| The file changed on disk since it was read | The Reload / Keep mine prompt, with the difference shown | Choose one; nothing is written until they do |

## Edge cases

**A save is pressed while an autosave is already in flight**
- *Trigger:* the user presses `Ctrl/Cmd+S` during a debounced autosave write.
- *Expected:* one write completes and the document ends up clean, with one success toast for the explicit
  save.
- *Avoid:* two concurrent writes to the same path, both renaming a temporary file over the target.

**The file is deleted while it is open**
- *Trigger:* the file is removed by another program.
- *Expected:* the buffer is kept and the document is marked detached. Saving recreates the file at the
  same path.
- *Avoid:* closing the tab, which throws away work the user never asked to discard.

**A never-saved document is closed with content in it**
- *Trigger:* `Ctrl/Cmd+W` on an untitled document containing text.
- *Expected:* the Save / Discard / Cancel prompt. Choosing Save opens the save dialog.
- *Avoid:* closing without asking because the document has no path.

**The same path is opened twice**
- *Trigger:* the user opens a file that is already open in this window.
- *Expected:* the existing tab is focused. No second tab appears.
- *Avoid:* a second tab with the same file, where the two buffers diverge and the second save silently
  overwrites the first.

**Format-on-save is enabled and the save fails**
- *Trigger:* format-on-save is on, and the write fails because the location is read-only.
- *Expected:* the document keeps the formatted text and stays modified. The formatting is one undo step.
- *Avoid:* reverting the formatting because the write failed, which loses a change the user can see.

**A file opened with CRLF has one line edited**
- *Trigger:* a Windows-authored file, one word changed, saved.
- *Expected:* one line differs. Every other line keeps CRLF.
- *Avoid:* normalising line endings on read, which turns a one-word change into a whole-file diff.

## Not this

- **No session restore, no crash recovery, no swap files.** Documents open clean on every launch; see
  `the-app-window.md#launch-is-clean`.
- **No lock file and no single-instance forwarding.** See `#external-change-check` for what is done
  instead, and what it costs.
- **No autosave for never-saved documents.** See `#new-documents-are-not-autosaved`.
- **No in-app overwrite prompt on Save As.** The native dialog already asks.
- **No filesystem watcher.** External changes are noticed at the moment of the next write or the next
  manual refresh, not continuously; a watcher is background work with a per-platform implementation and
  an unbounded number of events.

## Decisions

- *2026-07-25* — The tab's dot means unsaved and nothing else, and it is muted rather than removed while
  an autosave write is in flight.
- *2026-07-25* — Autosave never formats. Running a formatter on a debounced write would reflow the
  document under the user's caret every few seconds.
- *2026-07-23* — A successful write commits to the model and a failed one resynchronises the projection,
  so the tab never shows a state the disk does not have. Recorded in
  `../../adr/0022-commit-writes-and-resynchronize-projection.md`.

## Open questions
