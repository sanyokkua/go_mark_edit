# Tasks

Paths under `frontend/src/` are written without that prefix. Every task follows `openspec/config.yaml` apply guidance:

- run `scripts/baseline` once before the first production edit;
- TDD where practical;
- strings from `i18n/locales/en.json`, colors and opacities from tokens;
- a task is done when its named tests pass, the relevant `scripts/verify` stages are green against the baseline
  (`scripts/baseline --compare`), and visible behaviour has been exercised in the real application.

Test edits listed under "Changes existing tests" are required by the named requirement. They are not weakened tests.

## 1. Reading mode toggle and presentation

- [x] 1.1 Enter and leave Reading mode with Ctrl/Cmd+Enter and View, Distraction-free reading, showing only the
      rendered active document. Verify that the named tests pass, `scripts/verify` is green, and the real app shows the
      column in Material, Glass and Minimal in light and dark.
    - Requirements:
        - reading-mode "Reading mode shows only the rendered document", "Reading mode scroll position", "Reading mode is
          not stored" (the Switch documents scenario of "Reading mode scroll position" is task 3, which adds the tab
          overlay), and from "Entering and leaving Reading mode" the toggle and No document scenarios only (Escape is
          task 2);
        - actions-shortcuts "Application and window shortcuts" and "Shortcut dispatch";
        - app-shell "Present-but-disabled controls";
        - editor "Image formatting action unavailable" (replaces "Unavailable controls").
    - Design: Decisions 1, 2, 3, 6 (keys, not Escape), 10.
    - Work:
        - a frontend-owned slice in `logic/store/` (precedent `logic/store/notificationsSlice.ts`, registered in
          `logic/store/index.ts`);
        - chrome gating in `app/AppFrame.tsx:50-58`, `ui/widgets/AppShell.tsx:179-215`, `ui/widgets/EditorView.tsx:213-253`
          and `ui/widgets/WorkspaceLayout.tsx:67-81`. The menu bar and `DocumentTabs` stay mounted behind `hidden`,
          because they own the window shortcut listeners (`ui/widgets/Menubar/Menubar.tsx:326-408`,
          `ui/widgets/DocumentTabs/DocumentTabs.tsx:475-540`). The toolbar, problems dock, status bar and sidebar column
          are not rendered;
        - the `reading` presentation override in `EditorView` / `ui/widgets/EditorStage/EditorStage.tsx` (visibility :377,
          :534; scroll restore :324-330 and `claimPreviewScrollRestore` :461-471, keyed by document id plus the layout
          variant per design Decision 2), capturing editor view state on entry as `EditorView.tsx:139-141` does;
        - `distraction-free-reading` in `logic/actions/actionRegistry.ts:304-306`: drop `laterDeferred`, add
          `shortcut: 'Mod+Enter'` and the `shortcuts` surface, require an open document;
        - the shell action in `logic/actions/shellActions.ts` and its View menu row (`ui/widgets/Menubar/`);
        - `formatShortcut` Enter form in `logic/actions/shortcutRegistry.ts:26-37`;
        - the `defaultPrevented` guard in `logic/actions/useShellShortcuts.ts:32-61`.
    - Changes existing tests: `frontend/tests/e2e/deferred-controls.test.ts:61-64` now expects Distraction-free reading
      to be enabled, and `frontend/tests/unit/actions/registryCatalogue.test.ts` changes if it pins availability.
    - Adds tests:
        - unit: slice reducers; action availability with and without a document; `formatShortcut('Mod+Enter')` per
          platform; the dispatch guard ignores a `defaultPrevented` event;
        - integration (`frontend/tests/integration/`): chrome hidden and restored with unchanged arrangement, split ratio
          and cursor; no editor pane and no scroll sync while active; the saved preview offset applied on entry from Split
          and from the Editor arrangement, and still in place after leaving to Split; a document over 2 MiB shows the paused notice and Refresh; a Light→Dark change
          restyles without leaving; the column fills a 375 px window;
        - e2e (`frontend/tests/e2e/`): Ctrl+Enter twice and the View menu toggle; Ctrl+Tab and Ctrl+, (which opens the Settings menu) still work in Reading
          mode; the document identity is hidden in Reading mode and visible again afterwards; the shortcuts dialog row; Ctrl+Enter in the Find input inserts a newline without entering Reading mode;
          after a restart from Reading mode the window starts normal with the saved arrangement unchanged.
    - Docs:
        - `docs/architecture.md`: add D17 per Decision 10 (after D16, around line 866), and add the slice to the owner
          inventory;
        - `docs/index.md`: add Reading mode to entry points, and remove "a dedicated reading experience" from the §11
          deferred list.

## 2. Escape, focus and document changes in Reading mode

- [x] 2.1 Leave Reading mode with Escape unless a menu, dialog or overlay takes it; move focus in and back out; follow
      document closes and new files. Verify that the named tests pass and `scripts/verify` is green.
    - Requirements: reading-mode "Entering and leaving Reading mode" (Escape scenarios), "Reading mode across document
      changes", "Reading mode focus".
    - Design: Decision 6 (Escape listener) and Decision 1 (focus target kept in a ref, not in the store).
    - Work:
        - a `window` Escape listener mounted only while Reading mode is active. It ignores `defaultPrevented` events and
          does nothing while `modalOpen` is true (`ui/widgets/modalStateContext.ts`, `app/useAppPresentation.ts:32`);
          compare with `ui/components/Popup/Popup.tsx:272-287` and `ui/components/ModalShell/ModalShell.tsx:97-103`;
        - focus the rendered document on entry and restore the previous editor or preview focus on exit;
        - leave Reading mode when no document remains, and on New File (`onNewDocument` in `app/useCommands.ts`).
    - Adds tests:
        - integration: Escape leaves; Escape with an open `Popup` only closes it; Escape with the Settings dialog open
          only closes it; Ctrl+W with two documents stays in Reading mode; Ctrl+W on the last document leaves it; Ctrl+N
          leaves it in the Editor arrangement; focus on entry and on exit;
        - e2e: Escape exit returns focus to the editor.

## 3. Reading controls and overlays

- [x] 3.1 Add the hover-revealed Exit, Show/Hide sidebar and Show/Hide tab bar controls and the sidebar and tab bar
      overlays, without touching the stored layout. Verify that the named tests pass, `scripts/verify` is green, and in
      the real app the controls are invisible at rest, the Exit control stays faint on hover, and all three are fully
      visible with keyboard focus.
    - Requirements: reading-mode "Hover-revealed reading controls", "Reading control visibility and keyboard access",
      "Reading sidebar and tab bar overlays", "Reading overlays keep the stored layout", and the Switch documents
      scenario of "Reading mode scroll position".
    - Design: Decisions 4 and 5.
    - Work:
        - a reading-controls widget in `ui/widgets/` built from the existing icon/tool-button primitives in
          `ui/primitives/`, with new opacity tokens and three new catalogue names;
        - the sidebar overlay renders `ui/widgets/WorkspaceTree/` at the stored `state.ui.layout.sidebarWidth`, without
          the resizable `ui/components/Sidebar/` and without `setWorkspaceWidth`;
        - the tab overlay is the already mounted `ui/widgets/DocumentTabs/DocumentTabs.tsx` instance, shown by dropping
          `hidden` and applying an overlay style, not a second instance;
        - overlays reset on every entry and close on Escape with `preventDefault`;
        - in Reading mode the Toggle Sidebar callback (`ui/widgets/Menubar/Menubar.tsx:345-353` →
          `ui/widgets/Menubar/ApplicationMenubar.tsx:172-178`) toggles the sidebar overlay and never dispatches
          `setWorkspaceVisible` (`logic/store/uiLayoutCommands.ts:29-43`); `toggle-sidebar` availability
          (`logic/actions/shellActions.ts:90-101`) follows the sidebar control;
        - no sidebar control without a workspace or while `useMinimumWindow()` (`ui/widgets/minimumWindow.ts`) is true.
    - Adds tests:
        - integration: controls are present, Tab-reachable and have localized names; overlays leave the document column
          width unchanged; Ctrl+\ toggles the overlay and the stored `sidebarVisible` / `sidebarWidth` stay unchanged;
          no sidebar control without a workspace or at 375 px; Escape closes the overlay first; overlays are hidden
          again on re-entry;
        - e2e: hover over Exit gives computed opacity ≤ 0.15; Exit is fully opaque with keyboard focus; open a file from
          the sidebar overlay and switch tabs from the tab overlay while staying in Reading mode; switching to another
          tab and back restores the first document's scroll offset (reading-mode "Reading mode scroll position", Switch
          documents); the stored sidebar width is unchanged after leaving.

## 4. Preview selection and context menu

- [x] 4.1 Add the preview context menu (Copy, Select all) for the preview pane and Reading mode, and keep native
      selection and Ctrl/Cmd+C working. Verify that the named tests pass and `scripts/verify` is green, including the
      `chromium-native` Playwright project.
    - Requirements: actions-shortcuts "Preview context menu"; markdown-preview "Selecting and copying rendered text".
    - Design: Decision 7.
    - Work:
        - registry entries `preview-copy` and `preview-select-all` on the existing `preview` surface
          (`logic/actions/actionRegistry.ts:2-15,293`);
        - a new "Select all" catalogue key;
        - a `PreviewContextMenu` widget modelled on `ui/widgets/EditorContextMenu.tsx:35,71-98`, wrapping the preview
          pane content in `ui/widgets/EditorStage/EditorStage.tsx` in both layouts;
        - Copy writes through the existing native `ClipboardPort` (`logic/adapter/clipboard.ts`), as editor Copy does.
    - Adds tests:
        - integration: Copy is disabled with no selection or a selection outside the document; Shift+F10 and the Menu key
          open the menu; Escape closes it and returns focus; Select all covers only the rendered document while the tab
          overlay is open;
        - e2e tagged `@native-clipboard` (project setup in `frontend/playwright.config.ts:26,31`, helper
          `frontend/tests/support/nativeClipboard.ts`, pattern in `frontend/tests/e2e/rich-rendering.test.ts:894`): copy
          "Getting Started" from `frontend/tests/fixtures/reference-document.md` by keyboard in the preview and through
          the menu in Reading mode.

## 5. Default open mode choice in Settings

- [x] 5.1 Make Default open mode selectable in the Settings menu and the Settings dialog with the `viewer` value.
      Verify that the named tests pass and `scripts/verify` is green.
    - Until task 6, choosing Reading (Viewer) keeps today's Preview-arrangement open behaviour. The repository stays
      valid.
    - Requirements: settings "Default open mode choice", "Settings menu and dialog" (the Default open mode entries;
      the Reading width entries are task 5.2).
    - Design: Decision 9.
    - Work:
        - `onDefaultOpenModeChange` in the appearance controller and context (`ui/widgets/appearanceSettingsContext.ts`,
          `ui/widgets/AppearanceControls.tsx`), mirroring theme and mode;
        - `ui/widgets/Menubar/SettingsMenu.tsx:16,63-69,128,222-232`: values `'viewer' | 'editor'`, `onSelect`, rows
          enabled by `rowUnavailable(id, writer)` with the new writer, with no extra loading gate;
        - `ui/widgets/Menubar/ApplicationMenubar.tsx:74` type;
        - `default-open-mode` without `laterDeferred` (`logic/actions/actionRegistry.ts:276-278`);
        - a Default open mode row in `ui/widgets/dialogs/SettingsDialog.tsx` through `AppearanceControlsContent`
          (`ui/widgets/AppearanceControls.tsx:185-200`) and the dialog props;
        - `persist` in `ui/widgets/AppearanceControls.tsx:110-133` accepts `defaultOpenMode`;
        - labels exist at `en.json:120-122,158`.
    - Changes existing tests: `frontend/tests/integration/menubar.legacy.test.tsx:214-218` and
      `frontend/tests/integration/menubar.settings.legacy.test.tsx` (rows now enabled and checked by the stored value).
    - Adds tests:
        - integration: choosing in the menu sends `viewer`; the dialog row and the menu stay in sync; Reset restores
          Editor;
        - e2e: the choice persists after restart.
    - Docs: the `docs/index.md` preferences section lists Default open mode as selectable.
- [x] 5.2 Add the persisted Reading width setting (Page or Full width) to the Settings menu and the Settings dialog, and
      lay out Reading mode by it. Verify that the named tests pass, `scripts/verify` is green, and in the real app Page
      and Full width look right in Material, Glass and Minimal in light and dark, and switching through Ctrl+, while in
      Reading mode restyles at once.
    - Depends on 1.1 (the reading layout variant) and 5.1 (the appearance controller, menu rows and dialog row it
      extends).
    - Requirements: settings "Settings catalogue and defaults", "Allowed values", "Settings menu and dialog" (the
      Reading width entries), "Reading width choice"; reading-mode "Reading width" and the Narrow window scenario of
      "Reading mode shows only the rendered document".
    - Design: Decision 11.
    - Work:
        - Go: `ReadingWidthPage` / `ReadingWidthFull` and the `page` default in `internal/settings/model.go`;
          `ReadingWidth string json:"readingWidth"` in `AppearanceSettings` (`internal/apperr/results.go:9-14`); the
          `view.readingWidth` key in `GetAppearance`, `UpdateAppearance` and `ResetAppearance`
          (`internal/settings/repository_sqlite.go`); normalization of a missing or invalid stored value to `page` and
          validation that refuses other written values in `internal/settings/service.go`;
        - regenerate `frontend/wailsjs/go/models.ts` with `scripts/build`;
        - `ReadingWidth = 'page' | 'full'` and `AppearanceSettings.readingWidth` in `logic/adapter/settingsTypes.ts`,
          and `readingWidth: 'page'` in `defaultAppearanceSettings` (`logic/settings/settingsCommands.ts`);
        - `logic/store/settingsSlice.ts`: `hydrateSettings` projects `appearance.readingWidth` (`page` for any other
          value) and a new `readingWidthAcknowledged` action replaces it;
        - `ui/widgets/appearanceSettingsContext.ts` and `ui/widgets/AppearanceControls.tsx`: `readingWidth` in the
          appearance state, `onReadingWidthChange`, `persist` accepting `readingWidth`, and a `readingWidthAcknowledged`
          dispatch after the startup `getSettings` and in the `persist` and `reset` acknowledgement callbacks; a
          Reading width segmented row next to Default open mode in `AppearanceControlsContent`;
        - `ui/widgets/Menubar/SettingsMenu.tsx`: a Reading width radio group (Page, Full width) after Default open mode,
          typed `'page' | 'full'` with no cast, enabled by `rowUnavailable(id, writer)`; wiring in
          `ui/widgets/Menubar/ApplicationMenubar.tsx`;
        - the Reading width row in `ui/widgets/dialogs/SettingsDialog.tsx` through `AppearanceControlsContent` and the
          dialog props;
        - `ui/widgets/EditorView.tsx` passes the projected width to `ui/widgets/EditorStage/EditorStage.tsx`, which
          sets `data-reading-width` on the reading stage; `ui/widgets/EditorStage/EditorStage.module.css` adds the
          `full` rule with `max-width: none` and keeps the 700 px token for `page`;
        - catalogue keys `settings.readingWidth`, `settings.readingWidth.page`, `settings.readingWidth.full` and
          `settings.readingWidth.description` in `i18n/locales/en.json` ("Reading width", "Page", "Full width").
    - Changes existing tests (each now includes `readingWidth` in the appearance group):
        - Go: defaults and fallback in `tests/go/unit/settings/service_test.go`; the invalid-row case in
          `tests/go/unit/settings/handler_test.go`; appearance reads and resets in
          `tests/go/integration/settings/repository_sqlite_test.go`, including
          `TestResetAppearanceChangesOnlyDeliveredAppearanceKeys`;
        - frontend: `frontend/tests/unit/store/settingsSlice.test.ts`, `frontend/tests/unit/store/settingsProjection.test.ts`,
          `frontend/tests/unit/settings/settingsCommands.test.ts`, `frontend/tests/unit/widgets/AppearanceControls.test.tsx`,
          `frontend/tests/unit/widgets/dialogs/SettingsDialog.test.tsx` and `Settings` fixtures such as
          `frontend/tests/support/loadedMarkdownSettings.ts`.
    - Adds tests:
        - Go black-box: default `page`; `full` saved and read back; any other written value refused with nothing
          stored; Reset appearance restores `page`; a missing or invalid stored value read as `page`;
        - unit: slice hydrate (valid, missing, invalid) and `readingWidthAcknowledged`; menu and dialog controls show the
          stored choice and send `page` / `full`;
        - integration: Full width removes the 700 px limit and Page keeps it; a width change while Reading mode is
          active restyles without leaving it; the menu and the dialog stay in sync; Reset restores Page;
        - e2e: switching to Full width through the Ctrl+, Settings menu while in Reading mode widens the document and
          keeps Reading mode; the choice survives a restart.
    - Docs: the `docs/index.md` preferences section lists Reading width (Page by default, Full width) beside Default
      open mode; `docs/architecture.md` D17 notes that the Reading width is a persisted appearance setting while Reading
      mode itself is not.

## 6. Reading mode on open

- [ ] 6.1 Report Reading-on-open from the backend, stop forcing the Preview arrangement, and enter Reading mode on
      every open entry point except tree New File. Verify that the named tests pass, `scripts/verify` is green, and in the
      real app opening a file from the launcher with Reading (Viewer) shows Reading mode.
    - Requirements: editor "Open mode"; reading-mode "Reading mode on open".
    - Design: Decision 8.
    - Work:
        - `internal/apperr/results.go:640-653`: add `ReadingMode bool json:"readingMode,omitempty"`;
        - `internal/appmodel/file_lifecycle.go`: set it in `CommitPreparedOpen` for `opened` with the `viewer` default;
          change `openArrangement` :436-444 and the saved-view branch :175-180;
        - regenerate the bindings with `scripts/build`, and update the adapter types in `logic/adapter/`;
        - in `app/useCommands.ts`, enter Reading mode when `readingMode` is true and the open's activation generation is
          still current, in `openLink` :102, `onOpenDocument` :161, `onOpenRecentFile` :174 (covers the launcher, tree
          and drag and drop) and `onReopenLastFile` :300. A false flag never clears Reading mode;
        - the tree New File call in `onCreateWorkspaceEntry` ignores the flag and leaves Reading mode if active.
    - Changes existing tests:
        - `tests/go/integration/appmodel/open_lifecycle_test.go:78` `TestOpeningInViewerModeUsesPreviewArrangement`
          becomes a test that viewer opens keep the saved arrangement and report `readingMode`;
        - check `tests/go/integration/appmodel/split_ratio_test.go:262` and
          `tests/go/integration/application/default_open_mode_wiring_test.go` against the new arrangement rule.
    - Adds tests:
        - Go black-box (`tests/go/integration/appmodel/`): `readingMode` true for an opened file with viewer; false with
          editor, for a focused duplicate, for a refused open and for `NewDocument`; saved arrangement kept in both modes;
        - Jest integration: each entry point enters Reading mode on a true flag; an Editor-default open from the sidebar
          overlay keeps Reading mode active; a superseded open does not enter it; tree New File opens without Reading mode
          and leaves it when active;
        - e2e: open into the launcher window with Reading (Viewer) shows Reading mode and exit shows the saved
          arrangement; with Editor no Reading mode; duplicate open does not enter it.
    - Docs:
        - correct `docs/architecture.md:481-483`, the open-document text;
        - update the open-document flow in `docs/index.md`.
