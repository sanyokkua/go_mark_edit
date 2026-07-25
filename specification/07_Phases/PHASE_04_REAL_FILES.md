# Phase 04 — I can open, edit and save real files, in tabs

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
3. **Several files at once.** The tab bar in the Phase 02 chrome: click to switch, drag to reorder,
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
it rather than doing them as a batch — see `docs/KNOWN_ISSUES.md`.

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

- Behaviour, in prose: `01_Product/03_FILES_TABS_WORKSPACE.md` — new/open/save, Save As, autosave,
  dirty state, encoding and line endings, tabs. Read this; it is readable and it is the real spec.
- What it looks like: `mockups/gomarkedit-mockup.html` → `editor-split` (tab strip), `menu-file`,
  `toasts`
- Decisions that apply: DD-11 (file-first — no session restore on launch), DD-12 (autosave on by
  default), DD-15 (UTF-8), DD-05 (tabs), DD-62/63/64 and ADR-0014 (the backend owns the document),
  ADR-0021 (acknowledgements bound to document identity and revision), ADR-0022 (commit the write,
  then resynchronize a failed projection), **ADR-0024 (the document lifecycle policy — read it, it
  settles suffixless Save As, read-only unsafe bytes, and the normalization authorization)**

## Questions to settle first

All four block step 1 or step 4. Answer them before writing the stories.

1. **Which view mode wins, and when?** Three things can disagree: the arrangement the window was left
   in, the mode remembered for that particular file, and the global default open mode. Two accepted
   documents currently say opposite things. Answer it for all four routes — application launch, a new
   window, opening a file for the first time, and reopening one you have had open before.
   Recommendation: the default open mode wins for any file-system open; per-file memory applies only to
   switching tabs within a session; the restored window arrangement applies at launch and to a new
   window, before any document is opened. This one answer also unblocks Phases 06 and 07.
2. **A file that is not valid UTF-8** — do we show it and let you edit it, or open it read-only? The
   product spec says tolerant read and no corruption on save; the old phase spec said no such path
   ships at all. Recommendation: UTF-8 only, and invalid bytes open read-only with a status-bar
   warning, so a lossy save is impossible.
3. **Quitting with five unsaved files** — five prompts in a row, or one? And if you cancel on the
   fourth, what happened to the three already saved? Recommendation: one dialog listing all of them
   with Save all / Discard all / Cancel, and nothing written until you choose, so Cancel is always a
   clean no-op.
4. **A file changed on disk** — Reload and Keep mine, or also a "Compare later" state? Recommendation:
   two choices. "Compare later" appears only in the functional-requirements master list, is absent
   from the document that owns this behaviour, and nothing defines what the deferred state would be.
   Delete it from the master list.

## Done when

Open a real `.md` file from your disk, edit it, save it, and confirm on disk that the bytes are what
you expect — same line endings, same BOM. Open a second file in another tab and switch between them.
Close a clean tab. Try to close a dirty one and get asked. Edit a file, change it in another editor,
and try to save — get a choice, not a silent overwrite. Quit with unsaved work and get asked. Turn
autosave off and watch a document stay dirty. All of it in a real build.
