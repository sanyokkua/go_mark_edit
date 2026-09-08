# Phase 05 — I can open, edit and save real files, in tabs

## What you get

Open a Markdown file from your disk, edit it, save it. Have several open at once as tabs and switch
between them. Files that already exist on disk save themselves as you work. If you try to quit with
unsaved changes, the app asks first. If a file changed on disk behind your back, you get a choice
instead of a silent overwrite.

After this phase GoMarkEdit is an editor you could actually use for real work.

## Build it in this order

1. **New and Open.** File ▸ New (`Ctrl/Cmd+N`) creates an empty, never-saved buffer in a new tab, in
   Editor mode — it has no path until you save it and is never autosaved. File ▸ Open with a native
   dialog filtered to `.md`, `.markdown`,
   `.mdown`, `.txt`. Read the bytes, detect the encoding and line endings, show it in the editor, put
   the filename in the title bar. Cancelling the dialog does nothing at all — no error, no empty tab.
   Opening a file that is already open focuses it rather than opening it twice. A never-saved document
   is UTF-8, no byte-order mark, LF, on every platform.
2. **Save it.** Save and Save As. Flush the pending edit to the backend first, then write the
   backend's canonical content — never text read back out of the editor. Preserve the BOM and the
   line endings the file arrived with. Clear the dirty marker only on success; report OS errors
   plainly. A never-saved document has no path, so Save behaves as Save As.
3. **Several files at once.** The tab bar in the Phase 03 chrome: click to switch, drag to reorder,
   middle-click or × to close a clean tab. Same basenames get a disambiguating path hint. Overflow
   scrolls. Closing the last tab gives a real empty state, not a blank document.
4. **Don't lose my work.** Closing a dirty tab, closing the window, or quitting asks Save / Discard /
   Cancel. Detect when a file has changed on disk before overwriting it and offer a choice. A deleted
   backing file leaves the buffer intact and dirty so Save can recreate it.
5. **Autosave.** On by default, for files that already exist on disk only — never for a buffer that
   has never been saved. Flush first, then write canonical content. Turning it off leaves anything
   dirty dirty. Its control goes in the Settings dialog.

Each step is usable on its own. Stop after step 2 and you still have a working editor.

## Also fix here

This phase is where four pieces of existing debt become real bugs. Fold each into the step that hits
it rather than doing them as a batch — see `KNOWN_ISSUES.md`.

- **Patch fan-out** (§1) — a second `state:patch` subscriber is silently discarded today. This phase
  adds the second and third. Step 1.
- **The empty tab set** (§2) — `internal/appmodel/service.go:72` dereferences the active document
  unconditionally and will panic when the last tab closes. Steps 1 and 3.
- **Per-document editor models and flushing** — Phase 01 built one Monaco session for one document.
  This phase needs several models with one visible session, disposal on close, and a guarantee that
  the outgoing document's pending edit lands before another becomes active. Steps 1 and 3.
- **The dev bridge mock** (§3) — it computes dirty as "has any text" while Go computes "differs from
  what is on disk", and every Playwright run exercises the mock rather than Go. Fix it and pin it with
  a parity test before step 3's responsive work relies on it.
- **Missing status-bar labels** (§5) — the catalog has only `utf-8` and `lf`, so the first CRLF file
  you open renders a raw key. Step 2.

## Where the details are

- Behaviour, in prose: `../spec/product/opening-and-saving-files.md` — new/open/save, Save As, autosave,
  dirty state, encoding and line endings, tabs. Read this; it is readable and it is the real spec.
- What it looks like: `../spec/surface/mockup.html` → `editor-split` (tab strip), `menu-file`,
  `toasts`
- Decisions that apply: the app launches clean with no session restore; autosave is on by
  default for saved files only; new files are written UTF-8 and an opened file's line endings and
  byte-order mark are preserved; the backend owns the document
  (`../adr/0014-backend-authoritative-state.md`),
  ADR-0021 (acknowledgements bound to document identity and revision), ADR-0022 (commit the write,
  then resynchronize a failed projection), **ADR-0024 (the document lifecycle policy — read it, it
  settles suffixless Save As, read-only unsafe bytes, and the normalization authorization)**

## Questions to settle first

**All four are settled.** Nothing here blocks story planning; the entries are kept so the reasoning
is visible and so nobody reopens a decision by accident.

1. **Which view mode wins, and when?** — *Settled 2026-07-23 by
   `../adr/0024-corrected-phase02-document-lifecycle-policy.md`, recorded 2026-07-28.*
   For every file-system open — the Open dialog, an OS association, drag-and-drop, or the workspace
   tree — the **global default open mode is applied first**. Reading opens directly in Reading mode.
   Editor mode restores the document's persisted Editor/Split/Preview view, then the last application
   arrangement, then Split. A new document always opens in Editor mode. The rule is written at
   `../spec/product/opening-and-saving-files.md#opens-use-the-default-open-mode`; build from there, not
   from the ADR. This also settles Phase 06's and Phase 07's version of the same question.
2. **A file that is not valid UTF-8** — *Settled 2026-07-23 by
   `../adr/0024-corrected-phase02-document-lifecycle-policy.md`, recorded 2026-07-28.*
   Invalid UTF-8 or NUL-bearing input **opens tolerantly and read-only**. Editing, document commands,
   Format, Lint, Save, Save As and autosave are all disabled, and every write primitive rejects the
   document before it touches the disk, so a lossy save is impossible and the original bytes are left
   alone. The rule is at `../spec/product/opening-and-saving-files.md#tolerant-decoding`.
3. **Quitting with five unsaved files** — *Settled 2026-07-23 by
   `../adr/0024-corrected-phase02-document-lifecycle-policy.md` and 2026-07-25 by
   `../adr/0032-run-registry-and-shutdown-ordering.md`, recorded 2026-07-28.*
   **One dialog**, listing every dirty document, with Save all / Discard all / Cancel. Nothing is
   written until you choose, so Cancel is a clean no-op. A multi-dirty close builds a plan covering
   every requested target before executing any of it; an incomplete choice set performs no save, no
   discard and no close. Requested saves then run in tab order without closing any tab, and the first
   failure stops execution — earlier successful saves stay clean, every tab stays open, and no discard
   is applied. The rule is at
   `../spec/product/opening-and-saving-files.md#close-prompts-when-modified`.
4. **A file changed on disk** — *Settled 2026-07-25.* **Reload / Keep mine**, two choices. "Compare
   later" was deleted from the master list: it appeared nowhere else and nothing defined what the
   deferred state would be. Once Phase 10 builds the diff view, the prompt shows the difference
   inline (`../spec/product/opening-and-saving-files.md`, the external-change prompt).

## Done when

Open a real `.md` file from your disk, edit it, save it, and confirm on disk that the bytes are what
you expect — same line endings, same BOM. Open a second file in another tab and switch between them.
Close a clean tab. Try to close a dirty one and get asked. Edit a file, change it in another editor,
and try to save — get a choice, not a silent overwrite. Quit with unsaved work and get asked. Turn
autosave off and watch a document stay dirty. All of it in a real build.

And the constraints every phase carries: open a 51 MB file and confirm the refusal names the limit; open
an 11 MB file and confirm it opens read-only with the banner; open a 41st document and confirm the
refusal; autosave a file repeatedly and confirm no toast ever appears; make a save fail three times and
confirm one toast with a count; every new dialog is reachable by keyboard alone with a visible focus
ring and works in three themes across light and dark; every new string goes through `t()`; watch the
network for five minutes and confirm nothing is sent. All of it in a real build.
