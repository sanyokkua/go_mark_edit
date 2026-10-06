# Proposal

## Why

Users who only want to read a Markdown file have no distraction-free view.

- The View menu entry "Distraction-free reading" and the Default open mode choices are shown disabled.
- The Viewer open mode only switches to the Preview arrangement, while the toolbar, tabs, sidebar and status bar stay
  on screen.

`docs/index.md` lists "a dedicated reading experience" as deferred. The preview, themes and settings it needs already
exist.

## What Changes

- Add Reading mode: a window state in which the menu bar, toolbar, tab bar, sidebar, problems panel and status bar are
  hidden. The active document is rendered exactly as in the preview, at the chosen reading width, and continues from
  its saved preview scroll position.
- Three controls stay invisible until the pointer reaches them or they receive keyboard focus:
    - Exit, which is barely visible even when revealed;
    - Show/Hide sidebar;
    - Show/Hide tab bar.
- The sidebar and the tab bar are hidden on every entry and open as overlays over the document.
    - Ctrl/Cmd+\ toggles the sidebar overlay.
    - The overlays never change the stored sidebar visibility or width.
    - There is no sidebar control without a workspace or in the narrow window.
- Toggle with Ctrl/Cmd+Enter or View, Distraction-free reading. Escape leaves Reading mode, after closing an open menu
  or overlay first. Closing the last document or creating a new untitled document also leaves it.
- Rendered text in the preview and in Reading mode can be selected and copied, with the keyboard or with a context menu
  (Copy, Select all) opened by right-click, Shift+F10 or the Menu key.
- The Default open mode setting (Reading (Viewer) or Editor) becomes selectable in the Settings menu and the Settings
  dialog.
    - With Reading (Viewer), a file opened from disk is shown in Reading mode, over its saved arrangement.
    - A file created with New File in the workspace tree, and focusing an already open document, do not enter Reading
      mode.
- A new global Reading width setting, in the Settings menu and the Settings dialog:
    - Page (default): a centered column at most 700 px wide;
    - Full width: the whole window width minus its padding.
    - A change applies at once, also while Reading mode is active. The choice is kept across restarts, Reset
      appearance restores Page, and a missing or invalid stored value is read as Page.
- Reading mode is transient window state: it is not stored per document or across restarts.

Out of scope:

- operating-system file association, and opening a file passed on the command line (a file argument is ignored today;
  this needs per-platform packaging and macOS file-open events, and gets its own change);
- a status-bar Reading shortcut;
- persisting Reading mode;
- print and PDF export.

## Capabilities

### New Capabilities

- `reading-mode`: the chrome-free window state, its reading width, its scroll position, hover-revealed controls, sidebar and tab bar
  overlays, toggle and exit, focus, and entry when a file is opened with the Reading (Viewer) default.

### Modified Capabilities

- `editor`: Open mode always uses the saved arrangement and adds Reading mode for the Reading (Viewer) default.
  Distraction-free reading leaves "Unavailable controls".
- `settings`: Default open mode becomes selectable in the Settings menu and the Settings dialog; a new Reading width
  setting (Page or Full width) joins the catalogue, allowed values, menu and dialog.
- `app-shell`: Distraction-free reading leaves the list of present-but-disabled controls.
- `actions-shortcuts`: Ctrl/Cmd+Enter toggles Reading mode; shortcut dispatch ignores keys a focused control already
  handled; the preview gets a context menu.
- `markdown-preview`: rendered text can be selected and copied.

## Impact

- **Frontend:**
    - a frontend-owned Reading slice;
    - chrome gating in `AppFrame`, `AppShell`, `EditorView` and `WorkspaceLayout`;
    - a Reading presentation of the existing preview pane in `EditorStage`;
    - a reading-controls widget and overlays;
    - a preview context menu;
    - action registry and shortcut formatting, plus a dispatch guard;
    - Settings menu and dialog, including the Default open mode and Reading width choices;
    - the Redux settings projection gains the acknowledged reading width, which the Reading layout reads;
    - string catalogue and opacity tokens;
    - Jest and Playwright tests.
- **Backend (Go):** `OpenResult` gains `readingMode`, and the Viewer default no longer forces the Preview arrangement.
  The appearance settings group gains `view.readingWidth` (`page` or `full`, default `page`) with validation, defaults
  and Reset appearance, stored in the existing settings table; the generated `frontend/wailsjs/go/models.ts` follows.
  The `viewer` value of Default open mode is unchanged.
- **Docs:**
    - `docs/architecture.md`: a new durable decision, and a corrected open-document text;
    - `docs/index.md`: entry points, flows, the preferences paragraph (Default open mode and Reading width), and the
      deferred list.
- No new dependency, no network request, no data migration (a missing `view.readingWidth` row reads as `page`).
