# Working in tabs

## What it's for

Nobody edits one file. Writing release notes means having the changelog open beside them; documenting a
feature means the specification and the draft at once. Tabs are how several documents live in one
window, and their behaviour is felt on every switch: a tab that loses your caret, or that saves one
document's text into another's file, is worse than no tabs at all.

## What you can do

Every open document is a tab showing its filename, a dot when it has unsaved changes, and a close
control. A `+` opens a new document.

`Ctrl/Cmd+Tab` and `Ctrl/Cmd+Shift+Tab` move between tabs — `Ctrl+PageDown` and `Ctrl+PageUp` do the
same. `Ctrl/Cmd+W` closes one, and `Ctrl/Cmd+Shift+Alt+T` reopens the last one you closed.

Drag a tab to reorder it. Right-click one for Close, Close others, Close to the right, Copy path and
Reveal in file manager.

## Rules

### One tab per path {#one-tab-per-path}
- **When** a path that is already open is opened again, its existing tab is focused and no second tab
  appears.

Examples: opening `notes.md` from the tree while it is already open → the existing tab · a second tab
for the same file → two buffers for one file, and whichever saves last silently discards the other.

### Tabs with the same filename are disambiguated {#same-name-tabs}
- **When** two open documents have the same filename from different folders, both labels gain enough of
  their path to tell them apart.

Examples: `docs/README.md` and `frontend/README.md` open together → `docs/README.md` and
`frontend/README.md` · two tabs both reading `README.md` → the user picks by guessing.

### Switching tabs is all or nothing {#tab-switch-is-atomic}
- **When** the active tab changes, the outgoing document's pending buffer and view state are flushed
  **before** the incoming document becomes active.
- **If** that flush fails, **then** the current tab stays active and the switch does not happen.

Examples: type, click another tab → the typing is in the model before the switch · a switch that
completes while the flush is still running → one document's text can land beside another document's tab,
and there is no way to tell afterwards which text belongs where.

### A stale tab command is refused, not partly applied {#stale-tab-commands-are-refused}
- Reorder and close carry the tab-set revision they were issued against.
- **If** the tab set has changed since, **then** the command is refused and the existing order is left
  intact.

Examples: a drag started before another tab closed → the reorder is refused and the strip is unchanged ·
applying it anyway → the tab lands at an index that means something different now, and the user sees
tabs move for no reason.

### Each tab carries its own view state {#per-tab-view-state}
- Each tab keeps its own modified flag, arrangement, reading-mode state, scroll positions, caret and
  selection. Switching to a tab restores all of them.

Examples: document A in Split scrolled to the middle, switch away and back → Split, same place, same
caret · a shared arrangement across tabs → switching tabs changes the layout under the user.

### The dot means unsaved, on every tab {#dot-means-unsaved}
- The dot is present when the document differs from disk and absent otherwise, on the active tab and on
  every background tab alike.
- The active tab is indicated by its own surface treatment, not by the dot.
- **While** an autosave write is in flight, the dot is muted rather than removed.

Examples: three background documents modified → three dots · a dot that is faint on background tabs and
solid on the active one → a clean active tab looks unsaved and a modified background tab looks fine.

### Closing a modified tab prompts {#closing-a-modified-tab-prompts}
- **When** a tab with unsaved changes is closed, a prompt offers **Save**, **Discard** and **Cancel**.
- **When** the last tab is closed, the launcher appears.

Examples: `Ctrl/Cmd+W` on a modified document → the prompt · on a clean one → it closes.

### Reordering shows where the tab will land {#tab-reorder-feedback}
- **While** a tab is being dragged, an insertion indicator appears between tabs at the position it would
  land in, and the dragged tab follows the pointer at reduced opacity.
- **If** `Esc` is pressed during the drag, **then** the drag is cancelled and the tab returns to its
  original position.
- Dragging past the end of a scrolled tab strip scrolls it.

Examples: dragging tab 1 between tabs 3 and 4 → a vertical line appears between them · a drag with no
indicator → the gesture reads as broken rather than as absent.

*This state is specified here rather than drawn in the mockup*, because a still image communicates a
mid-flight gesture poorly.

### Overflowing tabs scroll {#tab-overflow-scrolls}
- **When** there are more tabs than fit, the strip scrolls. The layout does not break, and tabs do not
  shrink to unreadable.

Examples: 20 tabs in a 900 px window → a scrollable strip · tabs compressed to 30 px each → no filename
is legible and every one looks the same.

### At most 40 documents are open at once {#tab-limit}
- **If** 40 documents are already open, **then** opening a 41st is refused with a message naming the
  limit.

Examples: 40 open → the 41st is refused · exactly 40 → allowed, the check is on opening the next one.

*Why a real limit:* every open document's text is held in Go memory. This is a bound on memory, not a
tidiness preference.

### The tab context menu is about the tab {#tab-context-menu}
- Right-clicking a tab offers: Close · Close others · Close to the right · Copy path · Reveal in file
  manager.
- **Reveal in file manager** is named that way on every platform.

Examples: right-clicking a tab → five entries about that document · the file tree's menu appearing on a
tab → operations that do not apply, which is what the mockup wired until 2026-07-25 · "Reveal in Finder"
→ true on one of three platforms.

### Tab navigation has no by-number binding {#no-tab-by-number}
- `Ctrl/Cmd+Tab` and `Ctrl+PageDown` go to the next tab; `Ctrl/Cmd+Shift+Tab` and `Ctrl+PageUp` to the
  previous. `Ctrl/Cmd+Shift+Alt+T` reopens the last closed tab.
- There is no jump-to-tab-by-number.

Examples: `Ctrl/Cmd+1` → heading 1, not tab 1 · reopen-last-closed uses `Ctrl/Cmd+Shift+Alt+T` because
`Ctrl/Cmd+Shift+T` inserts a table.

*Why:* a Markdown author presses the heading shortcuts far more often than they jump to the fourth tab.

## What it looks like

- The tab strip — `../surface/mockup.html#material-light/editor-split`
- The tab context menu — `../surface/mockup.html#material-light/tab-menu`
- Closing a modified document — `../surface/mockup.html#material-light/save-prompt`
- No tabs open — `../surface/mockup.html#material-light/empty`

## When things go wrong

| Situation | What the user sees | What they can do |
|---|---|---|
| Opening a 41st document | A message naming the 40-document limit | Close a tab and try again |
| A tab's file was deleted on disk | The tab stays, the document is marked detached | Save, which recreates the file |
| The flush before a tab switch fails | The current tab stays active, and the failure is shown | Fix the cause and switch again |
| Reveal in file manager on a never-saved document | The entry is disabled | Save the document first |

## Edge cases

**A tab is closed while its autosave is in flight**
- *Trigger:* `Ctrl/Cmd+W` a moment after typing, while the debounced write is running.
- *Expected:* the buffer is flushed and the write completes before the tab is removed.
- *Avoid:* removing the tab and cancelling the write, which loses the last few characters with no
  prompt, because the document looked clean.

**Close others with several modified documents**
- *Trigger:* right-click a tab, Close others, with three of the others modified.
- *Expected:* one prompt listing all three, as when quitting.
- *Avoid:* three prompts in sequence.

**A tab is dragged and dropped in the same position**
- *Trigger:* the user picks up a tab and puts it back.
- *Expected:* nothing changes and no reorder command is sent.
- *Avoid:* a no-op reorder that still bumps the tab-set revision and invalidates another pending command.

**The active tab is closed**
- *Trigger:* `Ctrl/Cmd+W` on the focused tab with others open.
- *Expected:* an adjacent tab becomes active and its view state is restored.
- *Avoid:* leaving no active tab, which leaves the document area blank while tabs are visible.

## Not this

- **No tab groups, no split tab panes, no pinning.** Several windows already exist for comparing two
  documents; see `the-app-window.md#multiple-windows`.
- **No jump-to-tab-by-number.** `Ctrl/Cmd+1`, `2` and `3` are the heading shortcuts, which a Markdown
  author presses far more often than they jump to the fourth tab.
- **No detachable tabs.** Dragging a tab out to make a window is a different window model, and the tab
  set is backend-owned per window.
- **No session restore of the tab set.** See `the-app-window.md#launch-is-clean`.

## Decisions

- *2026-07-25* — The tab context menu became its own menu rather than the file tree's. The tree's menu
  offered operations that do not apply to a tab.

## Open questions
