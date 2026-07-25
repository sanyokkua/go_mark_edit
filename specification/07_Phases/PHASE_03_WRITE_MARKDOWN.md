# Phase 03 — I can write Markdown, not just type it

## What you get

Select a word, press `Ctrl/Cmd+B`, and it becomes bold. Or click the **B** in the toolbar. Or
right-click and choose it. Headings, lists, quotes, code, links, images and tables all work the same
way — on the selection, or on the current line if nothing is selected. Every one of them is one undo
step.

You can also see every shortcut in one place, and change how the editor itself looks — line numbers,
word wrap, font size.

## Why this phase exists

It was missing. `01_Product/02_EDITOR_AND_VIEWER_MODES.md:31` requires the formatting toolbar,
`01_Product/12_KEYBOARD_SHORTCUTS.md` binds a shortcut to every one of them — and no phase implemented
them. Searching the entire old phase set for "bold" returned nothing. This is the primary thing a
person does in a Markdown editor, so it gets built before the file handling that surrounds it.

## Build it in this order

1. **The shortcut registry.** One registry mapping an action id to its binding, label and scope
   (global / editor / document). It is the single source of truth for the toolbar, the menus, the
   tooltips and the Shortcuts dialog, so a binding is defined once. macOS uses `Cmd` where the tables
   say `Ctrl`. Build this first — everything below registers into it.
2. **The formatting actions.** Bold, italic, strikethrough, inline code, headings 1–3, bullet list,
   numbered list, task list, quote, link, image, table. Each acts on the selection, or the current
   line when the selection is empty, and each is a single undo step. They go through the document
   command seam from Phase 01, not into Monaco directly.
3. **The toolbar.** The buttons for those actions, in the chrome from Phase 02, each with an
   accessible name and its shortcut in the tooltip. Disabled when there is no writable document.
4. **The context menu.** Right-click in the editor: cut, copy, paste, and the formatting actions.
   Same registry, same actions — not a second implementation.
5. **Editor display settings.** Line numbers on/off, word wrap on/off, font size. Real Monaco options,
   persisted, with their controls in the Settings dialog's Editor group.
6. **The view and window bindings.** Register the non-formatting actions that already have surfaces:
   the Editor / Split / Preview arrangements, full screen (`F11`), and toggle sidebar (`Ctrl+\`) — the
   last of these acts on the empty sidebar slot Phase 02 built and stays correct once Phase 06 fills
   it. Register them here so there is one registry; the actions themselves may already exist.
7. **Shortcuts and About dialogs.** The Shortcuts dialog lists the registry, grouped and searchable.
   About shows the version, which reads `dev` until Phase 07 injects a real one.

## Where the details are

- The action list: `01_Product/02_EDITOR_AND_VIEWER_MODES.md#editor-mode`
- The bindings: `01_Product/12_KEYBOARD_SHORTCUTS.md` — the registry, and the format, file and view
  tables, and the platform mapping. Every binding in that document is registered here or by the phase
  that builds its action; none is invented elsewhere.
- Editor settings: `01_Product/11_SETTINGS.md#editor-group`
- What it looks like: `mockups/gomarkedit-mockup.html` → `editor-split` (toolbar), `context-menu`,
  `shortcuts`, `about`
- The seam to edit through: ADR-0017, and `logic/hooks/useDocumentCommands.ts`

## Questions to settle first

None blocking. `12_KEYBOARD_SHORTCUTS.md` already fixes every binding and scope.

One thing to decide as you build: whether a formatting action applied to an empty selection on an
empty line inserts the markers and places the cursor between them, or does nothing. Pick the first —
it is what every other editor does — and write it into `02_EDITOR_AND_VIEWER_MODES.md`.

## Done when

Select a word and make it bold with the keyboard, the toolbar and the context menu — all three produce
the same result and undo in one step. Turn a paragraph into a list. Insert a table. Toggle line numbers
and word wrap and see the editor change. Open the Shortcuts dialog and find a binding you have not used
yet. Every action is reachable by keyboard alone.
