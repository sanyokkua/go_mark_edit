# Tasks

Paths under `frontend/src/` are written without that prefix. Every task follows the apply guidance in
`openspec/config.yaml`:

- Run `scripts/baseline` once, on `feature/refine-startup-menus-and-settings`, before the first production edit.
- Use TDD where practical.
- Take every string from `i18n/locales/en.json` and every colour from tokens.
- After a Go bridge change, regenerate the bindings (`scripts/build`).
- A task is done when:
    - its named tests pass;
    - the relevant `scripts/verify` stages are green against the baseline (`scripts/baseline --compare`);
    - its visible behaviour has been exercised in the real application on macOS (Wails dev). The macOS real-app checks
      are performed by the user when computer-use tooling is unavailable.
- Windows and Linux runtime behaviour cannot be exercised here. The e2e tests stand in for it.

Test edits listed under "Changes existing tests" are required by the named requirement; they are not weakened tests.
Tasks run strictly in order, one at a time, even where a task's dependencies would allow it to run earlier.
Task 1 has a large test blast radius. Use a task branch for it (`feature/refine-startup-menus-and-settings-empty-start`)
and squash-merge it back.

## 1. Start without a document

- [x] 1.1 Start every window with no document, so that a window without a launch target shows the launcher. Verify that
      the named Go and e2e tests pass, `scripts/verify` is green, and in the real app:
    - starting from the icon shows the launcher with no tab;
    - New Window shows the launcher;
    - `GoMarkEdit notes.md` shows only `notes.md`;
    - `GoMarkEdit missing.md` shows the launcher plus "The file no longer exists.".
    - Requirements:
        - app-shell "Launcher" (Started from the icon, New File from the launcher, First run) and "Independent windows"
          (New Window);
        - os-integration "Opening from the operating system" (Open a file into a starting window, Started from its icon,
          Unsupported file) and "Command-line arguments" (Missing file).
        - This task delivers only the tab and launcher clauses of the scenarios Started from the icon (app-shell),
          New Window (app-shell) and Open a file into a starting window (os-integration). Their "no sidebar" clauses are
          delivered by task 2.
    - Design: Decision 1 (D21).
    - Work:
        - `internal/appmodel/service.go:90-126`: `newAppModelService` starts with no documents, an empty
          `orderedDocumentIDs` and an empty `activeDocumentID`.
        - Delete `StartEmpty`, its apply branch and `WithEmptySession` (`internal/appmodel/options.go:30-38,90-93`).
        - Delete the `GOMARKEDIT_NEW_WINDOW_CHILD` marker read in `internal/application/application_context_holder.go:100-102`,
          and its set/strip in `internal/application/new_window.go:27,45-50`. The child keeps the parent's environment.
        - Keep the placeholder replacement in `internal/appmodel/file_lifecycle.go:247-260` unchanged.
    - Reuse: `NewDocument` (`file_lifecycle.go:44`) for tests that need a document. Add a helper in
      `tests/go/integration/appmodel/support_test.go`; the application suite
      (`tests/go/integration/application/`) creates its document through the same public `NewDocument` path.
    - Changes existing tests:
        - Go:
            - `tests/go/integration/appmodel/service_test.go:14` (start state is empty);
            - `tests/go/integration/application/new_window_test.go:165-215`, where `TestUnmarkedMissingStartupArgumentKeepsUntitled`
              becomes "missing startup argument shows no document";
            - `open_lifecycle_test.go:13` (create the placeholder with `NewDocument` first);
            - `tests/go/integration/application/launch_target_test.go:193`;
            - `tab_session_test.go:68`;
            - `tab_reorder_test.go`, `publish_test.go`, `split_ratio_test.go`, `save_test.go`, `error_surface_test.go`,
              `file_lifecycle_test.go:32,40`, `hardlink_test.go` and `workspace_create_test.go` in
              `tests/go/integration/appmodel/`;
            - in `tests/go/integration/application/`: `preview_image_test.go:137` and `preview_link_test.go:68,74`;
            - `new_window_test.go:166,178,204` set the environment marker that this task deletes, so they stop setting it;
            - every other appmodel test that read the constructor's document (close_plan, autosave and others): it
              creates one through the helper.
        - e2e: add `newUntitledDocument(page)` to `frontend/tests/support/harness.ts` (presses Mod+N and waits for the
          Untitled tab). Find the files to change with this discovery rule:
            - grep `frontend/tests/e2e` for `Untitled` and `New tab`;
            - add the tests that expect an editor or a tab count right after launch;
            - the implicit cases to name are `menus.test.ts:221`, `narrow-width.test.ts:33-36,139` and
              `theme-surfaces.test.ts:64,121,299`.
              `launcher.test.ts`, `launch-target.test.ts`, `tidy.test.ts` and `settings-markdown.test.ts` are among them.
              `launch-target.test.ts:47-52` expects the launcher plus the missing-file notice.
    - Adds tests:
        - Go: a new service has no documents and no active document; a New Window child process starts with no
          document; the unsupported and missing startup paths leave no document and report the message.
        - e2e (`launcher.test.ts`): a fresh launch shows the "Start a document" launcher with no tab; New File from the
          launcher opens one Untitled tab.
    - Docs: `docs/architecture.md` decision D21 (empty-session startup, refines D18) and the D18 wording about the
      "empty Untitled document"; `docs/index.md` startup flow.

## 2. Sidebar visibility follows the folder

- [x] 2.1 Make sidebar visibility a backend-derived, unsaved window state:
    - hidden at start;
    - shown by every folder open;
    - hidden by Close Folder;
    - toggled by Ctrl/Cmd+\ for the session.

    Verify that the named tests pass, `scripts/verify` is green, and in the real app:
    - starting from the icon, New Window and a file argument each show no sidebar;
    - Open Folder shows the tree, and Open Folder on the already shown folder with a hidden sidebar shows it again with
      no prompt;
    - Close Folder → Keep them open hides the sidebar and keeps the tabs;
    - after hiding the sidebar with a folder open and restarting from the icon, the launcher shows with no sidebar.
    - Requirements:
        - folder-workspace "Sidebar visibility follows the folder", "Open a folder" (Re-open the shown folder, Open
          Folder on the shown folder) and "Close folder";
        - the sidebar clauses of app-shell "Launcher" (Started from the icon) and "Independent windows" (New Window), and
          of os-integration "Opening from the operating system" (Open a file into a starting window), whose tab and
          launcher clauses task 1 delivers;
        - settings "Window and view state";
        - reading-mode "Reading mode shows only the rendered document" and "Reading overlays keep the stored layout";
        - app-shell "Launcher" (Started with a folder, Everything closed) and "Narrow-window presentation" (Widening).
    - Depends on: 1.
    - Design: Decision 2 (D22).
    - Work:
        - `internal/appmodel/service.go:124`: default `SidebarVisible=false`.
        - `internal/appmodel/workspace.go`:
            - `OpenWorkspace` sets the sidebar visible for both the opened and the already-open results, in the same
              patch as the workspace (`:247-252`);
            - the already-open branch (`:212-217`) publishes a sidebar-only patch when the sidebar is hidden;
            - `CloseWorkspace` sets it hidden in its patch (`:331-336`).
        - `SetUILayout` keeps `SidebarVisible` in memory and publishes it without persisting it.
        - Remove `LayoutWorkspaceVisible`:
            - from `persistLayout` and `RestoreUILayout` (`service.go:367,394-396,618,654-659`);
            - from `internal/appmodel/layout_repository.go:9`;
            - from the validation in `layout_repository_sqlite.go:137`.
        - Check the other visibility touchpoints against the new rule: `internal/appmodel/service.go:501` (a visibility
          change bypasses the width debounce), `:543` and `:979`, and `logic/store/uiLayoutCommands.ts:50` (dragging the
          width to 0 writes `visible=false`, which stays in memory only).
        - `app/useCommands.ts:300-310`: `onOpenWorkspacePath` no longer returns early for the shown root. A same-root open
          is sent to the backend `OpenWorkspace`, with no Replace prompt, so Open Folder, the sidebar's Open Folder
          button and a drop of that folder show a hidden sidebar (today only Recent Items, `:321-322`, reaches it).
        - Delete the folder-open effect in `app/App.tsx:41-46`.
        - Change the `?? true` fallbacks to `?? false` in `ui/widgets/WorkspaceLayout.tsx:33`,
          `ui/widgets/Menubar/ApplicationMenubar.tsx:65` and `ui/widgets/Menubar/Menubar.tsx:931`.
    - Reuse: `setWorkspaceVisible` and `setWorkspaceWidth` in `logic/store/uiLayoutCommands.ts` (unchanged), and the
      existing `WorkspaceEmptyState` for Ctrl/Cmd+\ with no folder.
    - Changes existing tests:
        - `tests/go/integration/appmodel/handler_test.go:194` (visibility no longer persisted);
        - `layout_repository_test.go` (key list);
        - `frontend/tests/integration/app.test.tsx:223,253` (no `setUILayout({sidebarVisible:true})` from the frontend);
        - `appShell.legacy.test.tsx:87-90,147-184` and `appShell.test.tsx:181` (default hidden);
        - `unit/store/uiLayoutCommands.test.ts`;
        - reading-mode integration and e2e tests that assumed a visible sidebar without a folder;
        - `e2e/workspace-tree.test.ts:500` (Close Folder hides the sidebar).
    - Adds tests:
        - Go:
            - open shows the sidebar and close hides it, each in one published patch;
            - re-opening the shown folder shows the sidebar again after a manual hide, and changes nothing else;
            - restore ignores a stored `layout.workspace.visible=true`;
            - persist writes width and hidden folders but not visibility.
        - integration (`useCommands`): opening the path of the shown folder calls the backend `OpenWorkspace` and does not
          open the Replace prompt;
        - Go: opening, creating and closing documents leave `SidebarVisible` unchanged;
        - e2e:
            - launch from the icon → no sidebar; New Window → no sidebar; a file argument → no sidebar;
            - Open Folder → tree visible;
            - with a folder open, hide the sidebar with Ctrl+\, then open another folder and choose Replace Folder →
              sidebar shown with the new tree;
            - with a folder open, close the last tab → sidebar still shown and the launcher visible;
            - Close Folder → "Close the tabs too" → launcher, no tab and no sidebar;
            - no folder and the sidebar hidden, close the only tab → launcher and no sidebar;
            - hide the sidebar with Ctrl+\, pick the same folder in Open Folder → sidebar shown, tree and tabs unchanged,
              no "Open another folder?" prompt;
            - Ctrl+\ with no folder → "No folder open";
            - Close Folder → Keep them open → sidebar hidden and tabs kept;
            - a sidebar width of 280 px survives a restart;
            - reading-mode "Hidden sidebar stays hidden" (`e2e/reading-mode.test.ts`): with a folder open, hide the
              sidebar with Ctrl+\, enter Reading mode, show and hide the overlay, leave Reading mode → the sidebar is
              still hidden.
    - Docs:
        - `docs/architecture.md`: decision D22 (derived sidebar visibility, refines D17's "stored sidebar visibility");
          the persistence section drops `layout.workspace.visible`; the frontend owner list loses the folder-open effect.
        - `docs/index.md`: the configuration row for window layout.

## 3. Liquid Glass translucency and dialog backdrop

- [x] 3.1 Give Liquid Glass menus, popups and dialogs the mockup's translucency and blur, and every dialog a dimmed and
      blurred backdrop. Verify that the named tests pass, `scripts/verify lint build e2e` is green, and in the real app
      the Settings popup and the Settings dialog in Glass Light and Glass Dark match `Mockup_Settings_Appearance.png`
      for translucency.
    - Requirements: appearance-themes "Floating surface material".
    - Independent of tasks 1 and 2.
    - Design: Decision 11.
    - Work:
        - `ui/styles/tokens.css` Glass light and dark blocks (`:336-400`): `--floating-surface` (white / `rgb(28, 30, 54)` at 0.5
          alpha) and `--floating-backdrop-filter: var(--blur)`.
        - `:root` (`:60`): `--overlay: rgba(6, 8, 16, 0.42)` and a new `--overlay-backdrop-filter: blur(3px)`.
        - `ui/components/ModalShell/ModalShell.module.css`: the `.overlay` rule uses `backdrop-filter` and
          `-webkit-backdrop-filter` with that token.
    - Real-app check also covers the Reading mode overlays that share the tokens (tab bar, sidebar overlay, reading
      controls): their labels stay legible over dense text in Glass Light and Glass Dark.
    - Changes existing tests: `frontend/tests/e2e/floating-surfaces.test.ts:34-38,103` asserts the Glass values
      (`rgba(255, 255, 255, 0.5)` / `rgba(28, 30, 54, 0.5)`, `blur(28px) saturate(1.5|1.6)`) and keeps its obscurity
      check (mean difference below 12).
    - Adds tests (e2e, `floating-surfaces.test.ts`):
        - the Settings popup and the Settings dialog in Glass Light and Glass Dark get the same translucency and
          obscurity checks (today only About is covered, `:117-127`);
        - an open dialog's overlay has `rgba(6, 8, 16, 0.42)` and `blur(3px)` in Material and in Glass;
        - Material and Minimal popups stay opaque with `backdrop-filter: none`.
    - Docs: `docs/architecture.md:387-389` (the floating-surface token paragraph): state the Glass translucency and blur
      values and the dialog scrim.

## 4. Markdown menu and a toolbar with only Format

- [x] 4.1 Rename the in-app Format menu to Markdown and build it from the action registry in headed groups, using the
      actions that exist today. Remove Compact and Lint from the formatting toolbar, and let the toolbar's Format
      control carry the progress and Cancel of any long tidy run. Verify that the named tests pass, `scripts/verify`
      is green, and in the real app:
    - the menu bar reads File, Markdown, Settings, View, About;
    - the Markdown menu shows the group headings;
    - the toolbar shows only Format;
    - Alt+Shift+C on a 2 MiB file shows Cancel on the toolbar's Format control.
    - Requirements:
        - app-shell "Menus and macOS native menu", "Markdown menu groups" (Groups and items, Run from the menu and
          Keyboard use, with the actions that exist today; Bold Italic and Headings 4–6 arrive in task 6, and the No
          document and Preview arrangement scenarios in task 5) and "Narrow-window presentation" (Minimum width);
        - tidy-format-lint "Format", "Compact", "Lint rules and markers" and "One bounded, cancellable operation";
        - settings "Markdown settings gating" (menu wording);
        - editor "Image formatting action unavailable".
    - Depends on: 1 (e2e helper).
    - Design: Decisions 3 (without its availability paragraph) and 4.
    - Work:
        - `logic/actions/actionRegistry.ts`:
            - surface `format-menu` → `markdown-menu`;
            - add every formatting action (bold … table) to `markdown-menu` in registry order (no `surfaceOrder` is set;
              `actionsForSurface` falls back to the registry index);
            - new `surfaceGroupKeys` option and `groupedActionsForSurface()` next to `actionsForSurface` (`:659-675`);
            - `compact` and `lint` drop the `toolbar` and `overflow` surfaces (`:379-386`).
        - `ui/widgets/Menubar/FormatMenu.tsx` → `MarkdownMenu.tsx`: groups follow the `ViewMenu.tsx:206` pattern
          (`role="group"` with `aria-label` set to the localized heading, and the visible `PopupGroupLabel`), with
          `PopupSeparator` between them.
        - `Menubar.tsx:427,542,683,817`, `ApplicationMenubar.tsx:112-118` and `ui/widgets/applicationMenuRequest.ts:3`
          (`'format'` → `'markdown'`): the new surface, target and labels.
        - `FormattingToolbar.tsx:40,47,49-55,122-136,260-266`: `tidyActions = ['format']`. The in-place progress and Cancel
          replacement (`:122-136`, today only when `slot.kind` equals the button's own id) is rendered by the Format
          button for any `slot.kind`.
        - `i18n/locales/en.json`: `shell.markdown` replaces `shell.format`; add the group heading keys (Text, Headings,
          Lists & quotes, Links, images & tables, Formatting & verification).
    - Reuse: `Popup`, `PopupGroupLabel`, `PopupSeparator`, `MenuItem`; the menu-row helpers in
      `frontend/tests/support/menuRows.ts`.
    - Changes existing tests:
        - `unit/actions/actionRegistry.test.ts:209`;
        - the `unit/actions/registryCatalogue.test.ts` snapshot;
        - `integration/menubar.test.tsx:20-108`;
        - `integration/menubar.legacy.test.tsx:122-184,357,571,608`;
        - `integration/formattingToolbar.test.tsx:65-78` (four groups plus Format);
        - `integration/formattingToolbar.legacy.test.tsx`;
        - `e2e/deferred-controls.test.ts:49-51`;
        - `e2e/tidy.test.ts:336,503`;
        - `e2e/menus.test.ts`;
        - `e2e/narrow-width.test.ts`.
    - Adds tests:
        - unit: `groupedActionsForSurface('markdown-menu')` returns the group keys in order;
        - integration:
            - the Markdown menu exposes five `group` roles with accessible names;
            - Down skips headings and the disabled Image;
            - Escape returns focus to the Markdown button;
            - the toolbar Format control shows Cancel while a Compact slot is running;
        - e2e: Compact and Lint run from the Markdown menu.
    - Docs: `docs/architecture.md:275-282` (menu ownership and group headings); `docs/index.md` (menu bar names).

## 5. Formatting unavailable without a shown editor

- [x] 5.1 Make the editor formatting commands (Bold through Table) unavailable, with the reason "Show the editor to use
      formatting.", while the active document's editor is not shown, so that the Markdown menu, the toolbar buttons and
      the keyboard shortcuts all follow the same rule. Verify that the named tests pass, `scripts/verify` is green, and
      in the real app:
    - with no document, every Markdown menu item is disabled;
    - in the Preview arrangement the toolbar's formatting buttons are disabled with the tooltip, Format stays enabled,
      and Cmd+B changes nothing;
    - in Reading mode the same commands are unavailable.
    - Requirements:
        - actions-shortcuts "Availability and disabled reasons" (editor formatting command while the editor is not
          shown; Formatting while the editor is not shown);
        - app-shell "Markdown menu groups" (No document, Preview arrangement).
    - Depends on: 4.
    - Design: Decision 3 (availability).
    - Work:
        - `logic/actions/actionRegistry.ts:145-164`: the availability context gains an optional `editorShown`. Only
          `editorShown === false` makes the editor-scoped formatting actions (bold … table) unavailable, with a new
          reason `editor-hidden` added to `ActionUnavailableReason` (`:18-25`). An absent field changes nothing.
        - `actionUnavailableLabelKey` (`actionRegistry.ts:677`) maps `editor-hidden` to the new key
          `action.noEditorShown` ("Show the editor to use formatting."), added to `i18n/locales/en.json` next to
          `action.noDocument`.
        - `editorShown` is true when the active document's arrangement (`view.arrangement`, as read in
          `ApplicationMenubar.tsx:155`) is not Preview and Reading mode is not active (`logic/store/readingSlice.ts`).
          Callers pass it:
            - `FormattingToolbar.tsx` (the availability call in `ActionButton`, around `:88`);
            - the Markdown menu (`MarkdownMenu.tsx`, today `FormatMenu.tsx:87`);
            - the `createEditorActionExecutor` dispatch context (`logic/actions/editorActionExecutor.ts:219-251`, built
              in `ui/widgets/useEditorActionExecutor.ts`). This also covers the shortcut listener (`:79-97`), because
              `dispatchAction` calls `getActionAvailability` (`actionDispatcher.ts:226`).
        - `EditorContextMenu.tsx:56` needs no change: that menu exists only over a shown editor.
        - `logic/actions/actionDispatcher.ts:200-201` keeps `no-editor` as the focus guard for an editor that is not
          focused (mapped at `:84-90`); it is a separate reason from `editor-hidden`.
    - Reuse: `getActionAvailability` and `actionUnavailableLabelKey`, which the toolbar already uses for its tooltips.
    - Changes existing tests: `unit/actions/actionRegistry.test.ts` and `unit/actions/registryCatalogue.test.ts`
      availability expectations that treat editor formatting commands as available for any writable document (the
      context now needs `editorShown`).
    - Adds tests:
        - unit: registry availability with `editorShown` false (the new reason), true and absent, and with no document;
        - integration:
            - the Markdown menu with no document shows every item disabled;
            - the Markdown menu in the Preview arrangement shows the formatting items disabled and Format, Compact and
              Lint enabled;
            - the toolbar in the Preview arrangement shows the formatting buttons disabled with the tooltip;
        - e2e: Ctrl/Cmd+B in the Preview arrangement leaves the text unchanged.
    - Docs: `docs/architecture.md` action registry section (`:275-282`): the availability check also distinguishes an
      editor that is not shown.

## 6. Bold Italic, Headings 4–6 and sequential numbering

- [x] 6.1 Add Bold Italic (Mod+Shift+B) and Heading 4–6 (Mod+4/5/6) to the registry, the Markdown menu, the shortcuts
      dialog and the editor's shortcut handling. Make Numbered list number the selection 1..n, continuing a numbered item
      above it. Verify that the named tests pass, `scripts/verify` is green, and in the real app (WKWebView) Cmd+Shift+B,
      Cmd+4, Cmd+5, Cmd+6 and Cmd+Shift+7 produce the scenario outputs.
    - Requirements:
        - editor "Formatting actions" (all scenarios except Table, which task 8 delivers) and "Numbered list
          numbering";
        - actions-shortcuts "Editing shortcuts" (Bold, Heading 6, New shortcuts listed);
        - app-shell "Markdown menu groups" (Run from the menu, and Groups and items for every item except the "Table…"
          label, which task 8 delivers);
        - settings "Markdown settings gating" (Bold Italic).
    - Depends on: 4.
    - Design: Decisions 5, 6 and 7.
    - Work:
        - `logic/actions/actionRegistry.ts`:
            - new ids `bold-italic` (after `italic`) and `heading-4..6` (after `heading-3`), on the `markdown-menu` and
              `shortcuts` surfaces with their group keys;
            - `bold-italic` joins `MARKDOWN_SETTINGS_ACTIONS` (`:474-484`).
        - `logic/format/formatting.ts`:
            - `FormatActionId` and `formatActionIds` gain the new ids;
            - `headingEdit` levels 4–6;
            - a bold-italic resolver in the inline wrapper-stack logic (`:304-391`), with separate open and close strings
              in the multi-line fallback;
            - `applyFormatEdit`'s markers guard (`:119-123`) includes `bold-italic`;
            - `listEdit` (`:538-557`) numbers per Decision 7.
        - The new ids join `formatActionIds`, so the window keydown listener in
          `ui/widgets/useEditorActionExecutor.ts:79-97` (gated on `[data-editor-surface]`) handles their shortcuts; they
          are not bound inside Monaco.
        - `i18n/locales/en.json`: labels and accessible names for the four actions.
    - Reuse: `pairEdit` and the wrapper resolver; `parseQuoteLine` and `parseListLine`; the `formatActionIds` handling of
      `useEditorActionExecutor`.
    - Changes existing tests: `unit/format/formatting.test.ts`:
        - `:59` (`1. word` stays);
        - `:240-241` (nested lines keep `1.` at each level, as the per-indentation counters give);
        - `:333-337` (mixed markers become `1.`, `2.`, `3.`; the all-numbered selection still un-numbers).
    - Also changes: `unit/actions/shortcutRegistry.test.ts`, `unit/actions/registryCatalogue.test.ts`,
      `unit/widgets/dialogs/ShortcutsDialog.test.tsx`.
    - Adds tests:
        - unit: every editor scenario (Bold italic selection, asterisk marker, completes bold text, Heading 5, Three
          plain lines, Continue a list above, Continue inside a quote, Mixed markers, Remove numbering, Nested lines,
          Blank line in the selection), and Bold Italic over a multi-line selection;
        - e2e: Mod+Shift+B, Mod+6 and Mod+Shift+7 in the real editor, each undone by one Undo.
    - Docs: none in `docs/index.md`, which lists no formatting shortcuts (only Find and Replace, `:132-135`). The
      Keyboard shortcuts dialog derives the new shortcuts from the registry.

## 7. List continuation on Enter

- [x] 7.1 Continue Markdown lists when Enter is pressed at the end of an item, and end the list on an empty item, without
      affecting fenced code, suggestions or IME composition. Verify that the named tests pass, `scripts/verify` is
      green, and in the real app:
    - typing a bullet, numbered, task and quoted list continues each;
    - Enter on an empty item ends the list;
    - Enter inside a ` ``` ` block inserts a plain line;
    - Japanese IME input confirmed with Enter adds no marker.
    - Requirements: editor "List continuation on Enter".
    - Depends on: 6 (shares the list parsing and numbering helpers).
    - Design: Decision 8.
    - Work:
        - New `logic/format/listContinuation.ts`: a pure function from lines and caret to an edit or `null`, using
          `parseQuoteLine` and `parseListLine` exported from `formatting.ts` and the fence rule of
          `logic/tidy/chunking.ts`.
        - `ui/components/CodeEditor.tsx`: an optional `enterEdit` prop; in `handleMount` (`:591`) an `addAction` bound
          to Enter with the precondition from Decision 8. Its run applies the edit through `applyEdit` (`:165-183`) or
          falls back to `trigger('keyboard', 'type', { text: '\n' })`.
        - `ui/widgets/EditorStage/EditorStage.tsx:216`, which mounts `CodeEditor`, passes `enterEdit`.
        - Enter is handled by that Monaco `addAction`, outside the window shortcut listener of
          `ui/widgets/useEditorActionExecutor.ts:79-97`. It is not a registry shortcut, so nothing handles it twice.
    - Adds tests:
        - unit (`frontend/tests/unit/format/listContinuation.test.ts`): bullet, `  3. three` → ` 4.`, `3)` → `4)`,
          task `* [x] done` → `* [ ] `, a quoted item, an empty item ends the list, the caret mid-item → `null`, inside a
          backtick fence and inside a tilde fence → `null`, after a closed fence → continues, a non-list line → `null`;
        - e2e (real editor):
            - typing `- apple` then Enter gives `- `;
            - Enter on `- ` empties the line;
            - one Ctrl/Cmd+Z restores the line before Enter;
            - a read-only document is unchanged;
            - with the suggest widget open, Enter accepts the suggestion;
            - Shift+Enter inserts a plain line.
    - Docs: `docs/architecture.md` editor section (the Enter keybinding is owned by `CodeEditor` and fed by
      `logic/format`).

## 8. Insert table dialog

- [x] 8.1 Make the table action open an "Insert table" dialog (Columns 1–20, Rows 1–100, both defaulting to 3) that
      inserts a table of the chosen size and returns focus to the editor. Verify that the named tests pass,
      `scripts/verify` is green, and in the real app Cmd+Shift+T, the toolbar Table button and the Markdown menu item
      each open the dialog, insert a 4 by 2 table and leave "Header 1" selected in a focused editor.
    - Requirements:
        - editor "Insert table dialog" and "Formatting actions" (Table);
        - actions-shortcuts "Editing shortcuts" (Table shortcut);
        - app-shell "Markdown menu groups" (Groups and items: the "Table…" label).
    - Depends on: 6.
    - Design: Decision 9.
    - Work:
        - `logic/format/formatting.ts`: `FormatRequest.table?: { columns, rows }`; `tableSkeleton` (`:625`) becomes a
          builder used by `tableEdit` (`:627-655`). A request without `table` means 3 columns and 3 rows.
        - `logic/actions/actionRegistry.ts`: the `table` entry gets `surfaceLabelKeys: { 'markdown-menu':
'action.table.markdown-menu.label' }`, the existing per-surface label mechanism (as the File menu uses
          `'file-menu'` keys); `MarkdownMenu.tsx` reads `item.surfaceLabelKeys?.['markdown-menu'] ?? item.labelKey`, as
          `Menubar.tsx:429` does for the File menu. `en.json` keeps `action.table.label` ("Table", `:339`, used by the
          toolbar) and adds `action.table.markdown-menu.label` ("Table…").
        - `logic/actions/editorActionExecutor.ts:219-251`: `requestTable(snapshot)` for `table`.
        - New `ui/widgets/insertTableRequest.ts` context (modelled on `applicationMenuRequest.ts`).
        - `app/useAppPresentation.ts`: request state, included in `modalOpen`.
        - `app/AppDialogs.tsx`: mount the dialog.
        - New `ui/widgets/dialogs/InsertTableDialog.tsx` (+ `.module.css`), built on `ModalShell` with the
          `CreateEntryPrompt` pattern.
        - `ui/widgets/useEditorActionExecutor.ts`: pass `requestTable`.
        - `i18n/locales/en.json`: title, field labels, buttons and the two range messages.
    - Reuse: `ModalShell` (`returnFocusTo` set to the editor), `Button`, `runFormatAction`.
    - Changes existing tests: `unit/format/formatting.test.ts:271-280,342-346` (the table builder with explicit sizes).
    - Adds tests:
        - unit: the builder produces the 4 by 2 output and selects "Header 1"; the insertion after a non-blank line
          leaves one blank line;
        - integration (`InsertTableDialog`):
            - the defaults are 3 and 3;
            - 21 columns and 0 rows show their messages and disable Insert;
            - Enter submits;
            - Escape and Cancel leave the text unchanged and focus the editor;
            - the dialog is not offered for a read-only document;
            - the Markdown menu item for the table action is named "Table…";
        - e2e: Mod+Shift+T → 4 × 2 → the exact Markdown lines, and one Undo removes the table.
    - Docs: `docs/architecture.md` dialogs inventory.

## 9. Settings dialog with sections

- [x] 9.1 Rebuild the Settings dialog after the mockup:
    - a header with Close;
    - a vertical section list for Appearance, Editor, Markdown and Export (task 10 adds Workspace between Markdown and
      Export);
    - rows with the label and description on the left and the control on the right, using segmented controls,
      switches and a Font size drop-down;
    - immediate apply.

    Make Ctrl/Cmd+, open it. Verify that the named tests pass, `scripts/verify` is green, and in the real app:
    - Cmd+, opens the dialog on Appearance;
    - Up, Down, Home and End switch sections;
    - Font size 16 resizes every editor;
    - at 375 px the section list sits above the rows;
    - the dialog matches the mockup screenshots in layout.
    - Requirements:
        - settings "Settings menu and dialog" (Open the dialog, Menu and dialog stay in sync), "Settings dialog layout",
          "Settings dialog sections" (all scenarios except "Workspace section" and "No unsupported sections", which
          task 10 delivers), "Settings dialog keyboard navigation", "Editor display settings", "Default open
          mode choice", "Reading width choice" and "PDF export appearance choice" (the dialog scenarios);
        - appearance-themes "Choosing and saving appearance" (unchanged) and "Reset appearance" (the Appearance-section
          button also resets the Export choice);
        - reading-mode "Reading width" (Change from the Settings menu) and "Reading mode shows only the rendered
          document" (Shortcuts keep working).
    - Ordered after: 3 (glass dialog surface) and 8 (both edit `useAppPresentation.ts`, `ModalShell` and `en.json`);
      shared files only, no functional dependency.
    - Design: Decision 10.
    - Work:
        - `ui/components/ModalShell/ModalShell.tsx` (+ css): optional `closeLabel` header with an icon close button,
          and `className`.
        - New primitives `ui/primitives/Switch/` and `ui/primitives/Select/` (component, css, index). `Switch` reuses
          the existing switch look by extracting `.toggle` from `ui/components/MenuItem/MenuItem.module.css:82-112`, so the
          popup rows and the dialog switches look the same (mockup `.tgl`, 34 by 19 px).
        - Split `ui/widgets/dialogs/SettingsDialog.tsx` into the dialog shell, `SettingsSectionNav`, `SettingsRow` and
          the four section components (Appearance, Editor, Markdown, Export). The nav is built from a section list that
          task 10 extends with Workspace.
        - Per-key single writers: each setting keeps its one existing writer, and the popup and the dialog call the same
          one. The `AppearanceSettingsProvider` writes theme, mode, default open mode, reading width and PDF appearance;
          `useEditorSettings` (`update`, `updateFile`, `updateMarkdown`) writes the editor, autosave and Markdown
          settings.
        - `AppearanceControls.tsx:214-246` wires the Editor section to `useEditorSettings` (`update`, `updateFile`).
        - The `settings` shell action's `openSettings` (`ui/widgets/Menubar/Menubar.tsx:337-340`) opens the dialog
          through the presentation state (`app/useAppPresentation.ts:30`).
        - `i18n/locales/en.json`: section names, row labels and descriptions, switch and select accessible names.
    - Reuse:
        - `Segmented`;
        - `AppearanceSettingsProvider` and `useEditorSettings` (the existing writers and their ordered queues);
        - the mockup CSS values in `.local_tmp_files/specification/mockups/gomarkedit-mockup.html:220-263` translated
          to tokens.
    - Changes existing tests:
        - `unit/widgets/dialogs/SettingsDialog.test.tsx:20,130,152,175` (sections, including Editor);
        - `unit/widgets/AppearanceControls.test.tsx:138,281`;
        - `integration/defaultOpenMode.test.tsx`, `integration/readingWidth.test.tsx` and
          `integration/pdfAppearance.test.tsx` (dialog sections);
        - `e2e/settings-markdown.test.ts:27-39,422-450` (select the Markdown tab first; tabpanel instead of a region);
        - `e2e/appearance.test.ts:132,233`;
        - `e2e/default-open-mode.test.ts`;
        - `e2e/reading-mode.test.ts` (Ctrl+, opens the dialog).
    - Adds tests:
        - unit: `Switch` (role, `aria-checked`, Space and Enter toggle, disabled); `Select` (label, value, change);
        - integration:
            - the dialog opens on Appearance;
            - the tablist keyboard (Up/Left, Down/Right, Home, End, Tab into the rows) in the wide and the narrow layout;
            - the section list contains exactly Appearance, Editor, Markdown and Export, in that order (task 10 changes
              this to five);
            - the Editor section shows the stored line numbers, word wrap, scroll sync, autosave and font size, and
              writes through `useEditorSettings`;
            - Font size offers exactly 13, 14 and 16;
            - Close, Escape and the backdrop close the dialog and return focus;
            - the narrow layout places the nav above the rows;
            - Markdown controls are disabled while loading;
        - e2e: Cmd/Ctrl+, opens the dialog; Font size 16 changes the editor font size and survives a restart.
    - Docs: `docs/architecture.md` "Shared UI owners and consumer inventory" (`:98-231`: `Switch`, `Select`, the
      ModalShell close button) and the Settings dialog owner;
      `docs/index.md:120-126` settings rows (where each setting is changed).

## 10. Show hidden folders in the Settings dialog

- [ ] 10.1 Add a Workspace section with a Show hidden folders switch to the Settings dialog, sharing the folder tree
      toggle's preference, and let the preference be changed while no folder is open. Verify that the named tests pass,
      `scripts/verify` is green, and in the real app:
    - with no folder open, turning Show hidden folders on in the dialog and then opening a folder containing `.notes/`
      shows `.notes`, and the tree's toggle shows on;
    - toggling it in the tree is reflected in the open dialog, and the reverse;
    - the value survives a restart.
    - Requirements:
        - folder-workspace "Hidden folders" (both scenarios);
        - settings "Settings dialog sections" (the "Workspace section" and "No unsupported sections" scenarios, with
          the five-section list) and "Settings menu and dialog" (the Show hidden folders wording).
    - Depends on: 9.
    - Design: Decision 12 (D23).
    - Work:
        - `internal/appmodel/workspace.go:152-161`: `SetWorkspaceHiddenFolders` stores the preference when no folder is
          open; it rebuilds and publishes the tree only when a folder is open.
        - Publish the value in the UI layout state (`internal/appmodel/service.go` restore and publish, next to the
          sidebar width and `RestoreUILayout`). The field is added to the `UILayout` wire type and to `mergeUILayout`
          and `cloneUILayout` (`service.go:969-1006`). `SetUILayout` (`service.go:487`) ignores an incoming
          `showHiddenFolders`, so `SetWorkspaceHiddenFolders` remains its only writer.
        - The frontend store projection (`logic/store`) of that published value.
        - A Workspace section component between Markdown and Export, using `onSetWorkspaceHiddenFolders`
          (`app/useCommands.ts:495`) and the `Switch` primitive. The section nav list from task 9 gains Workspace.
        - Regenerate the bindings with `scripts/build`: the UI layout state wire type (`frontend/wailsjs/go/models.ts`,
          next to `sidebarWidth`) gains the new field.
        - `i18n/locales/en.json`: the section name and its description; reuse `workspace.tree.showHiddenFolders` ("Show
          hidden folders") for the row label.
    - Reuse: `SettingsRow`, `Switch` and the section list from task 9; the existing tree toggle and its writer.
    - Changes existing tests: `tests/go/integration/appmodel/workspace_test.go:430` (it expects the refusal when no
      folder is open), and the dialog tests from task 9 that list exactly four sections.
    - Adds tests:
        - Go (`tests/go/integration/appmodel`): setting the preference with no folder succeeds, is persisted, is
          published and is restored at the next start; `SetUILayout` ignores an incoming hidden-folders value;
        - integration: the dialog switch and the tree toggle stay in sync;
        - e2e: no folder → turn Show hidden folders on in the dialog → open a folder with `.notes/` → `.notes` is
          visible.
    - Docs: `docs/architecture.md` decision D23, the persistence section (`:711`) and "Shared UI owners and consumer
      inventory" (`:98-231`); `docs/index.md` settings rows (`:120-126`) and the hidden-folders sentence at `:103`.

## 11. Settings popup as shortcuts

- [ ] 11.1 Reduce the Settings popup to Theme, Appearance, Markdown, the Autosave, Format on save and Lint on save
      switches, and All settings…, removing Default open mode, Reading width and PDF appearance. Verify that the named
      tests pass, `scripts/verify` is green, and in the real app the popup matches the trimmed list and changing a
      shortcut item is reflected in the open dialog's matching row.
    - Requirements:
        - settings "Settings menu and dialog" (Settings menu contents, Menu and dialog stay in sync);
        - "Default open mode choice", "Reading width choice" and "PDF export appearance choice" (the menu scenarios).
    - Ordered after: 9 (shared files); no functional dependency, because the current dialog already holds the three
      moved settings.
    - Design: Decision 10.
    - Work:
        - `ui/widgets/Menubar/SettingsMenu.tsx:212-333`: remove the three groups; Autosave uses the same switch row as
          Format on save and Lint on save.
        - `logic/actions/actionRegistry.ts`: remove the `default-open-mode`, `reading-width` and `pdf-appearance` ids
          and their availability branches. Before removing them, confirm the task 9 dialog sections do not read them.
        - Remove the now-unused i18n keys.
    - Changes existing tests:
        - `integration/menubar.settings.legacy.test.tsx:116,171,333-449` (the exact trimmed label list);
        - `integration/menubar.legacy.test.tsx`;
        - `unit/actions/registryCatalogue.test.ts`;
        - `e2e/floating-surfaces.test.ts` and `e2e/menus.test.ts`, where they open settings rows that moved.
    - Adds tests (integration):
        - the popup contains no Default open mode, Reading width or PDF appearance;
        - turning Format on save on in the popup shows it on in the dialog, and the reverse; writing it on in the popup and
          then off in the dialog ends with the dialog's value stored and shown in both (the only popup ↔ dialog sync
          test; task 9 tests the dialog side only).
    - Docs: `docs/index.md` Settings menu description.

## Workflow follow-up

- Archive the change on `feature/refine-startup-menus-and-settings` once every task is verified (`/opsx:archive`), then
  ask whether to squash-merge into `master`.
