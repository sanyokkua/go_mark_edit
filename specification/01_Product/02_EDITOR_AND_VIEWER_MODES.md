**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester
**Last Updated:** 2026-07-10
**Cross-references:** `00_Foundation/04_DESIGN_DECISIONS.md`, `01_Product/01_FUNCTIONAL_REQUIREMENTS.md`, `01_Product/03_FILES_TABS_WORKSPACE.md`, `01_Product/10_THEMING.md`, `01_Product/12_KEYBOARD_SHORTCUTS.md`, `mockups/gomarkedit-mockup.html`

# Editor & Viewer Modes

GoMarkEdit has two first-class user modes and a set of view arrangements within the Editor. This
document defines each mode's states, transitions, defaults, and error cases. It refines
`01_FUNCTIONAL_REQUIREMENTS.md#fr-editor` and `#fr-viewer`.

## Table of Contents

1. [Editor mode](#editor-mode)
2. [Viewer (reading) mode](#viewer-reading-mode)
3. [Split view](#split-view)
4. [View mode toggle](#view-mode-toggle)
5. [Status bar](#status-bar)
6. [Per-document view state](#per-document-view-state)
7. [Default open mode](#default-open-mode)
8. [Edge cases](#edge-cases)

## Editor mode

Editor mode shows the Markdown **source** in a syntax-highlighted Monaco editor (DD-09, DD-20) with
full app chrome: menu bar, folder sidebar, tab bar, formatting toolbar, and status bar (see the
`.app` layout in `mockups/gomarkedit-mockup.html`).

**Composition.** The editor pane header shows `Editor · <filename>` and the document's `UTF-8 · LF`
encoding/line-ending badge. Line numbers and word wrap are user-toggleable (View menu; persisted as
settings). The formatting toolbar acts on the current selection or line: bold, italic, strikethrough,
inline code, headings 1–3, bullet/numbered/task lists, quote, link, image, table, plus the Format and
Lint document actions.

**States.** An Editor document is *clean* or *dirty* (see `03_FILES_TABS_WORKSPACE.md#dirty-state`).
Typing mutates the editor's working buffer, which debounce-syncs to the backend application model where
the dirty flag is derived (DD-62/DD-64); formatting actions mutate only the targeted range. The
preview reflects the backend's copy of the buffer after the debounce window (DD-20, DD-64).

**Defaults.** Line numbers on, word wrap off, view arrangement Split (see below), font size 14 px
(`11_SETTINGS.md#editor-group`).

## Viewer (reading) mode

Viewer / reading mode is the distraction-free reading state. It renders the current document and
**hides all chrome** — sidebar, tabs, toolbar, menu bar, and status bar (DD-30) — showing only the
rendered document centred in the active theme, plus a single "Done reading" affordance to exit (the
`.reader` region of the mockup).

**Entry / exit.** Toggle with `Ctrl/Cmd+Enter`, the View menu ("Distraction-free reading"), or the
status-bar "Reading mode" action. Exiting restores the exact prior Editor arrangement and scroll
position.

**Behaviour.** Reading mode is view-only: no editing, toolbar, or tabs. Theme tokens still apply
(EC-THEME-2). It is per-document: the active document is what is read. Remote-content policy and asset
resolution behave identically to the preview (`09_ASSETS_AND_SECURITY.md`).

**Typography is yours.** Reading font size and column width are settings, and
`Ctrl/Cmd +` / `Ctrl/Cmd -` / `Ctrl/Cmd 0` adjust the size live in both the preview and the reader
(DD-72, `11_SETTINGS.md#editor-group`). They are independent of the editor's font size, which is a
monospace measurement for a different purpose. Reading Markdown beautifully is stated as a headline
goal; a fixed size and a fixed measure would not deliver it.

**Relation to default open mode.** When the default open mode is **Reading (Viewer)** (DD-27), any
file-system open — OS open, drag-and-drop, workspace-tree, or the Open dialog — lands directly in reading
mode for that document. The default is **Editor**, so out of the box such opens land in the editor.

## Split view

Within Editor mode, the body is a grid of panes: **Editor** and **Preview**. Split view shows both
side by side; the layout is a responsive auto-fit grid so panes size evenly and reflow on narrow
widths (the `.body`/`.pane` grid in the mockup).

**Pane toggles.** The View menu exposes "Show Editor" and "Show Preview" toggles. Hiding one pane
yields Editor-only or Preview-only; hiding both is not allowed (at least one pane is always visible).
The preview pane header shows a live indicator (`● Preview · live`) and the active standard badge
(e.g. `GFM`).

**Sizing.** A **draggable divider** sits between the panes. Dragging it sets the split ratio, which is
persisted as `ui.splitRatio` and restored with the rest of the layout (DD-74). Double-clicking the
divider returns to an even split. The ratio is clamped so neither pane can be dragged below a usable
minimum, and `Esc` during a drag cancels it and restores the previous ratio.

This was previously deferred — "a future divider-drag is out of v1 scope" — while
`02_Architecture/05_STATE_AND_PERSISTENCE.md` already persisted three widths the user had no way to
change. Editing a wide table or a long code fence in a fixed 50% pane is the common case, not an edge
one.

On very narrow windows the grid stacks panes vertically and the divider becomes horizontal.

**Scroll sync.** In split view the two panes are linked, **by heading**: scrolling the editor moves the
preview to the heading you are under, and scrolling the preview moves the editor to that heading's
source line. It is deliberately not character-accurate — that needs a source-map through the whole
render pipeline, and Phase 09's outline already produces a heading-to-source-line map for free.
Heading accuracy is most of the value for almost none of the cost.

Sync is **on by default** with a View-menu toggle, because there is a real case for turning it off:
comparing two distant parts of one document. A document with no headings does not scroll-sync; the
panes move independently and nothing pretends otherwise.

**Right-clicking in the editor** opens a context menu: Cut · Copy · Paste · Paste as plain text ·
*(separator)* · Bold · Italic · Link · *(separator)* · Format document · Compact · *(separator)* ·
Command palette. Every item dispatches through the shortcut registry and shows its accelerator, so the
menu is a discovery surface for the bindings rather than a second set of behaviours. On macOS the
platform's own Edit menu owns the clipboard accelerators (ADR-0028); these entries invoke the same
commands.

**Find and replace.** `Ctrl/Cmd+F` and `Ctrl/Cmd+H` open Monaco's own find widget, with regular
expressions, case and whole-word options, and `F3` / `Shift+F3` to step through matches. Two things
are ours rather than Monaco's:

- **It must be themed.** The widget is a separate colour surface (`editorWidget.*`,
  `10_THEMING.md#editor-theme`) and ships white. In a dark Liquid Glass window an unthemed find box is
  the most visible thing on screen.
- **It is reserved in the registry** (`12_KEYBOARD_SHORTCUTS.md`), so no later phase binds over it.

Find operates on the **editor** pane. In Preview-only and in reading mode the browser's own in-page find
is what is available; the app does not reimplement it.

## View mode toggle

A segmented control in the toolbar switches the arrangement between **Editor**, **Split**, and
**Preview** (the `#viewseg` segmented control in the mockup). It is the primary, always-visible way to
change arrangement; the View-menu pane toggles are the secondary path and stay in sync with it.

**States.** Exactly one segment is active. `Editor` = source only; `Split` = source + preview;
`Preview` = rendered only (but still with chrome, unlike reading mode).

The segmented control is the only indicator of the arrangement. An earlier revision of this document
also said the status bar showed it; the mockup never did, and duplicating an always-visible control in
a second always-visible place spends status-bar width on something the user is already looking at. The
status bar shows **Reading** only, because reading mode hides the segmented control.

## Status bar

A single row along the bottom of the window, present in every arrangement and hidden only in reading
mode. It is a summary surface, not a control panel: two items are interactive and the rest are read-only.

| Item | Example | Interactive | Source |
|---|---|---|---|
| Standard | `Markdown · GFM` | no | `04_MARKDOWN_STANDARDS.md` |
| Caret position | `Ln 3, Col 12` | no | editor |
| Counts | `231 words` | no | backend document model (DD-62). With a selection active it shows the selection's counts instead, prefixed `sel`. |
| Encoding | `UTF-8` | no | `03_FILES_TABS_WORKSPACE.md#encoding-and-line-endings` |
| Line endings | `LF` | no | same |
| Autosave | `Autosave: On` | no | `11_SETTINGS.md` |
| Problems | `⚠ 1` | **yes** — opens the problems list | `06_FORMAT_AND_LINT.md#problems-surface` |
| Provider | `Ollama · last call OK` | no | the assistant |
| Reading | `Reading` | **yes** — enters reading mode | this document |

**Character count** is not shown by default; word count is what Markdown authors work in. It is
available in the counts item's tooltip.

**The provider item reports the last call, not a live connection.** It appears only after the app has
made at least one provider call in this session, and it shows that call's outcome. A persistent
"connected" indicator would require polling, which DD-32 forbids — there is no background network, so
the app genuinely does not know whether a provider is reachable until the user asks it to do something.

**Narrow windows drop items in a fixed order**, so the same item is never in two different places at two
widths. From the first dropped to the last kept: Provider → Autosave → Encoding and line endings →
Counts → Caret position → Standard. **Problems and Reading are never dropped** — they are the two
interactive items, and an affordance that disappears at some widths is worse than one that was never
there. A dropped item is not hidden information: it moves into the overflow tooltip on the standard
item.

## Per-document view state

Each document (tab) keeps its own view state: arrangement (Editor / Split / Preview), whether it is in
reading mode, scroll positions, and cursor/selection. This per-document view state is **owned by the
backend application model** (`internal/appmodel`, DD-62); the frontend renders it from the projection and
mutates it via a `SetDocView` command (DD-63), while the editor buffer itself syncs per DD-64. Switching
tabs restores that document's state; the per-document view mode also persists across sessions via the KV
store (DD-10) so reopening a file restores its last arrangement subject to the default-open-mode rule
below.

**Precedence.** An explicit user arrangement change on a document overrides the persisted value for
that document. A fresh file-system open (OS, drag-and-drop, tree, or Open dialog) uses the default open
mode, not the last persisted arrangement, unless a story specifies otherwise. This per-document view
state is separate from the application-level window/UI-layout state (DD-60): the latter governs window
size, sidebar visibility, and the default arrangement seed, not any single document's remembered mode.

## Default open mode

A setting selects the **default open mode** — **Editor** (default) or **Reading (Viewer)** (DD-27) —
applied whenever a document is opened **from the file system**: an OS "Open With" / double-click /
association open (via `OnFileOpen` or argv, DD-26), a **drag-and-drop** open (DD-56), a **workspace-tree**
open, and the in-app **Open** dialog. It is surfaced both in the Settings menu (segmented control) and the
full Settings dialog Appearance group, labelled **Reading (Viewer)** / **Editor** to match the mockup.

**Behaviour.** With default open mode **Editor** (the default), opening a file lands in Editor mode using
the document's persisted arrangement — or, for a first-time open with nothing persisted, the last-used
arrangement (DD-60), falling back to the Split default. With **Reading (Viewer)**, opening a file lands
directly in chrome-hidden reading mode. Creating a **new** file always opens in Editor mode regardless of
this setting.

## Edge cases

- **EC-DOCS-4** — A file over the large-file threshold opens in Editor mode but the live preview may
  pause (DD-20); reading mode renders on demand.
- **EC-DOCS-12** — A `state:patch` following a buffer edit never echoes buffer text back into the
  focused editor; the cursor/selection is preserved (DD-64).
- **EC-THEME-2** — Switching theme while in reading mode keeps token styling applied to the reader.
- **EC-TABS-5** — With no documents open, neither Editor nor reading mode has content → a defined
  empty state.
- **EC-SET-3** — Changing the Markdown standard re-renders the preview/reader of open documents.
- **EC-RENDER-4** — Preview-only and reading mode honour the same debounce/pause behaviour as split.
