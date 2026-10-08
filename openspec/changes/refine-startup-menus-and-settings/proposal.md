# Proposal

## Why

The window's starting state is wrong in three ways:

- A fresh window opens an Untitled tab instead of the "Start a document" launcher.
- The folder sidebar is shown (empty, "No folder open") when only a file is open.
- The sidebar's last visibility is restored at launch even though the folder never is.

The command and settings surfaces have also grown by accretion:

- Format, Compact and Lint appear twice in the toolbar's area.
- The in-app "Format" menu holds only three tidy commands.
- Numbered lists are always written as `1.`, and Table always inserts a two-column template.
- The Settings popup repeats rarely used choices (Default open mode, Reading width, PDF appearance).
- The Settings dialog is one long column that does not match the reference mockup
  (`.local_tmp_files/specification/mockups/gomarkedit-mockup.html`).
- In Liquid Glass, menus and dialogs are close to opaque (0.88–0.90 alpha) where the mockup shows clearly translucent
  surfaces (0.80–0.82 alpha, 28 px blur).

## What Changes

**Startup and sidebar**

- **BREAKING (behaviour):** a window started without a path shows the launcher with no tab. This covers the app icon,
  New Window, an unsupported path and a missing path. An Untitled tab exists only after New File.
- The sidebar follows the folder:
    - hidden when a window starts;
    - shown whenever a folder opens, by any route;
    - hidden when the folder closes;
    - unchanged by opening or closing files.
- Ctrl/Cmd+\ still shows or hides the sidebar for the running window.
- **BREAKING (persistence):** sidebar visibility is no longer stored or restored. Sidebar width and Show hidden folders
  still persist.

**Markdown menu and toolbar**

- The in-app "Format" menu is renamed "Markdown", including in the narrow-window overflow. The name avoids a clash with
  the macOS native Edit menu.
- It lists every formatting command in five headed groups:
    - Text: Bold, Italic, Bold Italic, Strikethrough, Inline code.
    - Headings: Heading 1–6.
    - Lists & quotes: Bullet list, Numbered list, Task list, Quote.
    - Links, images & tables: Link, Image (still disabled), Table….
    - Formatting & verification: Format, Compact, Lint.
- New commands:
    - Bold Italic (Mod+Shift+B);
    - Heading 4, 5 and 6 (Mod+4, Mod+5, Mod+6).
- Editor formatting commands (Bold through Table) become unavailable while the active document's editor is not shown:
  with no document, in the Preview arrangement, and in Reading mode. This is a change to the action availability rules
  (`actions-shortcuts`), so the Markdown menu, the toolbar buttons and the keyboard shortcuts all follow it, with the
  reason "Show the editor to use formatting.". Today they look enabled there but do nothing.
- The formatting toolbar keeps Format but drops Compact and Lint. While any tidy run is long, the Format control shows
  that run's progress and Cancel.
- Numbered list numbers the selected lines 1, 2, 3 … n. When the line above is a numbered item, it continues from that
  number.
- Enter at the end of a list item starts the next item with the next marker. Enter on an empty item ends the list. This
  does not apply inside fenced code or in read-only documents.
- Table opens an "Insert table" dialog for the column count (1–20, default 3) and the body row count (1–100, default 3),
  then inserts a table of that size.

**Settings**

- The Settings popup keeps only Theme, Appearance, Markdown standard, the Autosave, Format on save and Lint on save
  toggles, and All settings…. Default open mode, Reading width and PDF appearance move to the dialog only.
- The Settings dialog is rebuilt after the mockup:
    - a header with a close button;
    - a vertical section list on the left;
    - rows with a label (and optional description) on the left and the control on the right;
    - changes apply immediately.
- The dialog has five sections that cover every user-facing setting that exists today:
    - Appearance: Theme, Color mode, Default open mode, Reading width, Reset appearance.
    - Editor: Autosave, Line numbers, Word wrap, Scroll sync, Font size 13/14/16.
    - Markdown: Standard, Format on save, Lint on save, Bullet marker, Emphasis, Heading style.
    - Workspace: Show hidden folders. This is the same application-wide preference as the folder tree's toggle, and it
      can now be changed while no folder is open.
    - Export: PDF appearance.
- Editor font size gains its first control.
- Ctrl/Cmd+, opens the Settings dialog. The settings spec and the "All settings… ⌘," hint already say this, but today
  the shortcut opens the Settings popup.

**Liquid Glass surfaces**

- Menus, popups and dialogs use the mockup's translucency and blur:
    - Light: `rgba(255, 255, 255, 0.80)` with `blur(28px) saturate(150%)`.
    - Dark: `rgba(28, 30, 54, 0.82)` with `blur(28px) saturate(160%)`.
- In every theme, the dialog backdrop is a `rgba(6, 8, 16, 0.42)` scrim with a 3 px blur.

**Out of scope**

- The AI, Content & privacy and Language sections of the mockup, and any control for the stored remote image policy (it
  has no effect today).
- Inserting images (the action stays disabled).
- Renumbering list items below the selection.
- Changing how Bullet and Task lists toggle.
- Restoring the folder or tabs at launch.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `app-shell`: menu bar names and the Markdown menu's groups; narrow-window menu names; the launcher shown for any
  window without a document; New Window starts with the launcher.
- `os-integration`: a window started from its icon, or with an unsupported or missing path, shows the launcher instead
  of an Untitled document.
- `folder-workspace`: sidebar visibility follows the open folder; re-opening the shown folder shows a hidden sidebar,
  including through Open Folder; closing the folder hides the sidebar; the Hidden folders control is also offered in the
  Settings dialog and can be changed with no folder open.
- `settings`: the trimmed Settings popup and the sectioned Settings dialog, with a new Workspace section (Show hidden
  folders); the editor display settings, including font size, in the dialog; Default open mode, Reading width and PDF appearance only in the dialog; sidebar visibility
  removed from the remembered window state; loading-state wording for the Markdown menu.
- `reading-mode`: Reading width changed from the Settings dialog; Reading mode keeps the window's sidebar visibility
  instead of a stored one.
- `editor`: formatting actions gain Bold Italic and Headings 4–6, sequential numbering and Markdown-menu surfaces; new
  Insert table dialog; new list continuation on Enter; Image stays disabled in the toolbar and the menu.
- `actions-shortcuts`: new shortcuts Mod+4/5/6 and Mod+Shift+B; Mod+Shift+T opens the Insert table dialog; editor
  formatting commands are unavailable while the active document's editor is not shown.
- `tidy-format-lint`: Compact and Lint are no longer on the toolbar; the menu is called Markdown; the toolbar Format
  control carries progress and Cancel for any long tidy run.
- `appearance-themes`: exact Liquid Glass surface translucency and blur, and the dialog backdrop; Reset appearance
  lists everything it already restores, including reading width and PDF appearance.

## Impact

- **Backend (`internal/`):**
    - `appmodel` starts with no document and owns the derived sidebar visibility (`service.go`, `workspace.go`,
      `options.go`, layout repository).
    - `appmodel` stores and publishes the Show hidden folders preference without an open folder (`workspace.go`, the UI
      layout state).
    - The `application` new-window launcher drops its empty-session marker.
    - The `settings` package is unchanged.
- **Frontend (`frontend/src/`):**
    - action registry (new actions, menu groups, the renamed surface, the editor-shown availability);
    - `app/useCommands.ts`: opening the already shown folder reaches the backend;
    - menubar and the new Markdown menu;
    - formatting toolbar;
    - formatting transforms, and a new list continuation module;
    - `CodeEditor` Enter handling;
    - new Insert table dialog;
    - `ModalShell` header close button;
    - new `Switch` and `Select` primitives;
    - Settings dialog split into sections, including a Workspace section, and a trimmed Settings popup;
    - Glass tokens and the scrim token;
    - `en.json` strings.
- **Tests:**
    - Go tests and e2e tests that relied on the initial Untitled tab create a document explicitly.
    - Tests that pin the "Format" menu, the five toolbar groups, `1.` numbering, the two-column table, the old dialog
      layout, the popup list or the 48 px blur change with their requirements.
- **Docs:** `docs/architecture.md` gains decisions for empty-session startup, derived sidebar visibility and Show hidden
  folders outside a workspace, and its persistence, action registry and shared UI owners sections are updated. The settings and configuration rows of
  `docs/index.md` are updated.
- **Migration:** the existing `layout.workspace.visible` row stays in the database and is no longer read or written. The
  key-value store is additive (see `docs/architecture.md`, persistence), so no data migration is needed. Rolling back
  restores the old behaviour, which reads the row again.
- No new dependency and no network access.
