# Quickstart: validating Feature 005 end to end

**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | Data model: [data-model.md](data-model.md) | Contracts: [contracts/](contracts/)

These are the runnable checks that prove each user story; each names its Acceptance Scenario(s)
and the expected outcome. Run `scripts/build setup` once per AGENTS.md before any of this. Full
automated coverage runs through `scripts/verify` as usual — these are the manual/exploratory
walkthroughs the six-stage suite cannot fully replace (native dialogs, drag-and-drop, a second OS
window), plus the exact commands for the parts that are scriptable.

## 0. Fixture

Create a scratch folder outside the repo (never commit test fixtures into `specs/`):

```bash
mkdir -p /tmp/gme-workspace-fixture/projects /tmp/gme-workspace-fixture/archive/locked
cd /tmp/gme-workspace-fixture
printf '# Release notes\n' > projects/release-notes.md
printf '# Spec draft\n' > projects/spec-draft.md
printf 'readme\n' > readme.md
printf 'todo\n' > todo.txt
printf 'not markdown\n' > readme.png
printf 'hidden\n' > .gitignore                       # dot FILE — must never appear, either way
mkdir -p .config-notes                               # dot FOLDER — the switch's subject
printf '# Vault note\n' > .config-notes/vault-note.md
mkdir empty-folder
chmod 000 archive/locked || true   # permission-denied fixture (skip on platforms where root ignores chmod)
```

What each piece is for:

- `readme.png` — the always-on type filter; never listed.
- `.gitignore` — a **dot file**. It must never appear in the tree, with the hidden-folders switch
  off _or_ on, and regardless of its extension. The switch governs dot folders only (research.md
  R14); dot files are unconditionally hidden.
- `.config-notes/vault-note.md` — a **dot folder** with a supported document inside it, so the
  hidden-folders switch has something real to reveal (the `.obsidian`-style case).
- `archive/locked` — the unreadable-subtree fixture. Its name deliberately does **not** start with
  a dot, so it is visible with the hidden-folders switch off and the FR-020 indicator can be
  checked in the default state.

A second and third folder are needed for the multi-folder drop in section 3:

```bash
mkdir -p /tmp/gme-fixture-b /tmp/gme-fixture-c
printf '# B\n' > /tmp/gme-fixture-b/b.md
printf '# C\n' > /tmp/gme-fixture-c/c.md
```

## 1. User Story 1 — Open a folder and browse it (P1, AC1–AC9; FR-001–FR-007, FR-020, FR-021, FR-027–FR-034, FR-044, FR-045; SC-001–SC-003, SC-007)

```bash
scripts/build dev
```

**Before opening anything** — confirm the empty state: the sidebar reads "No folder open" and
offers an **Open Folder** button; pressing that button runs the same action as `File > Open Folder`
(the native picker opens at the user's home folder).

In the running app: File → Open Folder → select `/tmp/gme-workspace-fixture`.

Expected — tree content:

- The sidebar briefly shows a **loading state** while the folder is read, rather than appearing
  frozen; it is then replaced by the tree (research.md R15 — there is no 2-second promise to time,
  the loading state is the criterion).
- The tree's **first row is the opened folder itself**, `gme-workspace-fixture`, with everything
  else indented beneath it; collapsing that root row collapses the whole tree, and right-clicking
  it offers the same menu as any other folder row.
- Beneath the root: `archive/`, `empty-folder/`, `projects/` (with `release-notes.md`,
  `spec-draft.md` inside), `readme.md`, `todo.txt` — but **not** `readme.png`, **not** `.gitignore`
  and **not** `.config-notes/` (FR-003).
- **Ordering**: folders first, then files, each group A→Z case-insensitively. At the root that is
  exactly `archive/`, `empty-folder/`, `projects/`, then `readme.md`, `todo.txt`.
- **Initial expansion**: only the root's immediate children are visible. `projects/` and `archive/`
  are shown closed; their contents appear only after the user expands them.
- The footer shows the fixed filter chips `.md .markdown .mdown .txt` (FR-004).
- `archive/locked` shows an unreadable indicator and the rest of the tree remains browsable
  (FR-020).
- Clicking `release-notes.md` opens it in a new tab; clicking it again focuses the same tab rather
  than opening a second one (FR-005).
- Open a folder with none of the four supported suffixes present: the sidebar shows the FR-006
  empty-result message, not a blank tree.

Expected — hidden folders switch (research.md R14):

- The sidebar's **Show hidden folders** switch is **off** by default.
- Turn it on: the folder is re-read immediately, `.config-notes/` appears in the tree, and
  expanding it shows `vault-note.md`, which opens in a tab like any other file. `.gitignore` still
  does **not** appear — this is the whole point of the check.
- The type filter is unchanged by the switch: `readme.png` is still absent, and the filter chips
  are still fixed and non-interactive.
- Quit and relaunch the app, then open the fixture again: the switch is still on (it is persisted
  app-wide in the existing settings store).
- With the switch on in this window, open a **second window** (File → New Window) and open the
  fixture there, then flip the switch **off in the second window only**: the first window's tree
  is unchanged and still shows `.config-notes/` until that window is refreshed (or reopens the
  folder, or restarts). There is no live cross-window update — that is the agreed behaviour, not a
  defect.

Expected — Refresh (FR-007):

- Expand `projects/` and select `spec-draft.md`, then add a file on disk
  (`touch /tmp/gme-workspace-fixture/projects/new-file.md`) and click Refresh: the new file
  appears, **`projects/` is still expanded**, and **`spec-draft.md` is still the selected row**.
- Delete `todo.txt` on disk and click Refresh: it disappears. Without clicking Refresh, neither
  change appears (Assumptions: no watcher).

Expected — a row whose file is gone (stale row):

- With `readme.md` visible in the tree, delete it outside the app
  (`rm /tmp/gme-workspace-fixture/readme.md`), then click its row **without** refreshing first:
  a clear "no longer there" message appears, **no tab opens**, and the tree re-reads itself
  automatically so the dead row disappears.

## 2. User Story 2 — Return to recent work (P2, AC1–AC6; FR-008–FR-010; SC-004)

With the folder above still open and `release-notes.md` open in a tab:

1. Open the File menu → confirm `/tmp/gme-workspace-fixture` and `release-notes.md` both appear
   under "Open Recent," most-recent-first, with distinct file/folder icons (FR-008). Each row is
   labelled with the **name only**; hovering a row shows its **full path** as a tooltip.
2. **Reopen Last, within a session**: close the `release-notes.md` tab, then File → Reopen Last:
   confirm the closed tab comes back — this is the existing undo-close behaviour and it must be
   unchanged (research.md R6).
3. **Reopen Last, in a freshly started app**: quit and relaunch, so nothing has been closed in this
   session, then File → Reopen Last: confirm it opens the newest Recent entry instead — a file
   opens as a tab, a folder opens in the sidebar. Confirm the command is never greyed out while
   either source is non-empty. When the newest entry is a folder and this window already has one
   open, the replace-or-new-window prompt from section 7 appears — that is expected.
4. **Cross-window Recent**: with two windows open, open a new file in window A, then open window
   B's File menu: the new entry is there, because each window re-reads the stored list when its own
   File menu opens. Nothing appears in window B's already-open menu while window A works — there is
   no live cross-window messaging.
5. Manually delete the fixture folder (`rm -rf /tmp/gme-workspace-fixture`), then select it from
   Open Recent: confirm a clear "This folder is no longer available" message appears and the entry
   is removed from the list on a second look at the menu (FR-010).
6. Recreate the fixture (step 0) and repeat opens until 11 distinct paths (files+folders combined)
   have been opened; confirm the Open Recent list never exceeds 10 entries.
7. **Clear Recent**: choose the Clear Recent row at the bottom of the Open Recent submenu, confirm
   the short confirmation it raises, and check the submenu is then empty. There is no per-entry
   removal to look for — clearing is all-or-nothing.

## 3. User Story 3 — Open by dragging files or folders in (P3, AC1–AC8; FR-011–FR-015, FR-039–FR-041; SC-005)

Run this section against the **packaged application** from `scripts/build`: it is a recorded
walkthrough standing in for an automated test, and the constitution accepts that evidence from the
packaged build.

With no folder open, drag `/tmp/gme-workspace-fixture` from the OS file manager onto the window.
While the drag hovers anywhere over the window, confirm the **whole window** shows a drop highlight
and hint; releasing opens the folder directly, with no prompt (FR-012, SC-005). With that folder
open, drag a _different_ folder onto the window: confirm the replace-vs-new-window prompt appears
(FR-013) and both choices behave as described in section 7. Drag `release-notes.md` by itself onto
the window: confirm it opens as a tab. Drag a mix of one file and one folder together: confirm the
file opens as a tab and the folder follows the folder-drop rule (FR-014). Drag an unsupported file
(`readme.png`): confirm a clear rejection notification appears and no state changes (FR-015).

**Multi-folder drop** (research.md R16): drag `/tmp/gme-fixture-b` and `/tmp/gme-fixture-c`
together onto the window and confirm **one** prompt for the whole drop, offering three choices:

- _Open only the first folder_ — opens `gme-fixture-b` only. If this window already had a folder
  open, the normal single-folder replace-or-new-window prompt then follows, and nothing else from
  the drop is opened.
- _Open all of them, each in its own new window_ — two new windows appear, one per folder, and this
  window is left exactly as it was.
- _Cancel_ — nothing opens and nothing changes.

**Multi-file drop past the tab limit** (research.md R17): create more files than the 40-document
cap allows and drop them all at once —

```bash
mkdir -p /tmp/gme-many-files && for i in $(seq 1 45); do printf '# %s\n' "$i" > /tmp/gme-many-files/note-$i.md; done
```

Confirm the app opens as many as fit up to 40 open documents, then shows **one** message naming how
many files were not opened and why (not one message per file), and that no already-open tab is
closed to make room. Then, at the 40-document limit, click a single file in the tree: confirm the
open is refused with a message naming the 40-document cap and telling the user to close one or more
tabs first.

## 4. User Story 4 — Work in more than one folder at once (P4, AC1–AC3; FR-016–FR-017, FR-022; SC-006)

Run this section — and the two-window checks in sections 1 and 2 — against the **packaged
application** from `scripts/build`, not `scripts/build dev`: the self-relaunch risk below exists only
inside the packaged `.app` bundle.

File → New Window: confirm a second, independent window opens with no folder or tabs loaded
(FR-016). In the new window, open a different folder; confirm editing/opening in either window does
not affect the other's tabs or sidebar (FR-017, SC-006).

**macOS-specific verification (research.md R1 residual risk)**: confirm the second window has its
own, correctly independent Dock/menu-bar presence — not merely a second webview inside the same
process — since this exercises `os.Executable()`-based self-relaunch from inside a running `.app`
bundle for the first time in this codebase.

From the folder-drop prompt in section 3, choose "Open in New Window": confirm the dropped folder
opens in the new window with its sidebar visible (FR-027), leaving the current window's folder
unchanged (AC3).

## 5. User Story 5 — Create and reveal items from the tree (P5, AC1–AC8; FR-018, FR-019, FR-035–FR-038, FR-046; SC-008)

**Context menu per row type** — check all three, since the available items differ:

- Right-click a **folder** row (including the root row): the menu offers exactly four items — New
  File, New Folder, Reveal in File Manager, Copy Path — and nothing else, specifically no
  rename/move/delete (FR-019, AC7).
- Right-click a **file** row: the menu offers **only** Reveal in File Manager and Copy Path. No New
  File, no New Folder.
- Right-click the **unreadable folder** row (`archive/locked`): the menu offers **only** Reveal in
  File Manager and Copy Path — no create actions — and clicking the row does not attempt to expand
  it.

**Copy Path**: on any row, confirm the clipboard receives the **full absolute path** (e.g.
`/tmp/gme-workspace-fixture/projects/release-notes.md`). There is no relative-path variant to look
for. **Reveal**: confirm the OS file manager opens at that item (AC5).

**New File** (AC1), from a folder row's menu:

- Enter a name with **no extension** (`ideas`): confirm the created file is `ideas.md`.
- Enter a name that already ends in a supported suffix (`notes.txt`): confirm it is created exactly
  as typed, with no second extension appended.
- Confirm a newly created file **appears in the tree and opens in a tab immediately, with focus in
  the editor** so the user can type straight away.
- Re-run New File in the same folder with a name that already exists: confirm the dialog **stays
  open** with the typed name intact and an **inline error**, rather than closing, silently
  overwriting, or auto-renaming.
- Enter a name that **begins with a dot** (`.draft`): confirm nothing is created and the dialog stays
  open with the name intact and an inline reason. The same holds for New Folder (`.hidden`).
- Start New File on a **collapsed** folder row: confirm the folder opens up so the new row is visible.

**New Folder**, from a folder row's menu: confirm the new folder simply appears in the tree, in its
sorted position, with no tab opened and no other change.

## 6. Keyboard walkthrough — Tab, Up/Down, Enter

With a folder open and focus in the editor:

- Press Tab until focus reaches the tree; confirm the focused row is visibly indicated.
- Press Up/Down: focus moves between visible rows, in the order they are displayed.
- Press Enter on a **file** row: it opens (or focuses its existing tab).
- Press Enter on a **folder** row: it toggles open/closed.

Explicitly confirm — and do **not** record as defects — that there is **no keyboard route to the
right-click menu** and **no arrow-key folder toggling** (Left/Right do not collapse/expand). That
is the agreed scope for this feature: Tab in, Up/Down, Enter.

## 7. Closing and replacing a folder (research.md R12, R13)

**Close Folder, both affordances.** With a folder open and at least two tabs open, one of them with
unsaved edits:

1. `File > Close Folder`: confirm the three-choice prompt appears — _Close the tabs too_ / _Keep
   them open_ / _Cancel_.
2. Choose **Cancel**: nothing changes; the folder is still open and every tab is untouched.
3. Repeat and choose **Keep them open**: the sidebar returns to the "No folder open" empty state
   and every tab stays exactly as it was, including the unsaved one.
4. Reopen the folder and use the sidebar header's **×** button: confirm it raises the _same_ prompt
   with the same three choices.
5. Choose **Close the tabs too**: each tab closes through the app's existing per-file
   save-or-discard flow; the unsaved one prompts to save or discard as it does anywhere else.

**Replacing the folder.** With `/tmp/gme-workspace-fixture` open and at least one tab holding
unsaved edits, open a different folder (try each entry point at least once: `File > Open Folder`,
Open Recent on a folder entry, Reopen Last resolving to a folder entry, and a folder drop) and
choose **replace** at the prompt:

- Confirm every open tab closes through the normal per-file save-or-discard flow **before** the new
  folder's tree appears — the sidebar never shows the new folder while old tabs are still closing.
- Now **cancel** at one of those save prompts: confirm the **whole switch is abandoned** — the old
  folder is still open in the sidebar, and every tab that had not yet been closed is still open.
  Nothing from the new folder has been loaded.

## 8. Edge cases (spec's Edge Cases section)

- While a folder is open, rename its root folder on disk, then click Refresh: confirm a clear
  "This folder is no longer available" state appears with Close/Retry, not a crash or stale tree.
- Create a symlink cycle (`ln -s .. /tmp/gme-workspace-fixture/projects/cycle`) inside the fixture,
  open/refresh the folder: confirm the walk terminates (no hang) and the symlink does not appear at
  all — neither as a traversable folder nor as an inert row (research.md R3).
- Create 20,001+ matching files in a scratch folder, open it: confirm the tree shows exactly 20,000
  entries and a visible truncation line reading "Showing the first 20,000 items — some files are
  not listed." (FR-021, research.md R15). No true total is shown, and the sidebar shows the loading
  state while the read runs.
- With the folder already open, try opening the same folder again: confirm no reload/state loss and
  no replace prompt (Edge Cases).

## 9. Automated stages

```bash
scripts/test unit
scripts/test integration
scripts/verify --skip e2e
scripts/verify e2e
```

Expected: new backend tests under `tests/go/` (workspace tree building, workspace session
lifecycle, recent-items v1→v2 migration, drop classification, new-window launcher port) — no
in-package `_test.go` is planned (`plan.md`); new frontend unit tests under
`frontend/tests/unit/widgets/WorkspaceTree/` and `frontend/tests/unit/widgets/dialogs/` (including
`WorkspaceReplacePrompt.test.tsx`, `FolderDropPrompt.test.tsx`, `CloseFolderPrompt.test.tsx`,
`CreateEntryPrompt.test.tsx`); a new `frontend/tests/integration/workspace.test.tsx`; a new
`frontend/tests/e2e/workspace-tree.test.ts` driving the real backend through Stories 1, 2 and 5 and
the Close Folder / Replace prompts (section 7). The harness cannot drive the native folder picker, so
it opens folders through one helper — the real `OpenWorkspace(path)` binding called from the page, or
a launch with the startup folder argument (`workspace-lifecycle.md`). **Stories 3 and 4 are
recorded manual walkthroughs** (sections 3–4 above): the E2E harness is Playwright driving the
browser page of `wails dev`, which can neither deliver an OS drag-and-drop nor observe a second OS
process, and a recorded walkthrough is the evidence form the constitution allows for them. This is
decided here, not deferred to `/speckit-tasks`.

## 10. Baseline comparison

```bash
scripts/baseline --compare
```

Expected: all six stages remain green against `.local_tmp_files/baseline/005-folder-workspace.json`
(recorded once via `scripts/baseline` before the first implementation edit, per AGENTS.md).
