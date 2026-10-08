# Design

## Context

See `proposal.md` (Why) for the motivation. This section covers only the current mechanics the design has to work with.

### Startup

- `newAppModelService` (`internal/appmodel/service.go:90-126`) always creates one Untitled document and makes it
  active.
- Only a New Window child process starts empty:
    - `WithEmptySession()` (`internal/appmodel/options.go:30-38,90-93`) does this;
    - it is applied only when `GOMARKEDIT_NEW_WINDOW_CHILD=1` (`internal/application/application_context_holder.go:100-102`,
      set and stripped in `new_window.go:27,45-50`).
- Opening a file replaces an untouched, empty Untitled document (`internal/appmodel/file_lifecycle.go:247-260`).
- The launcher (`ui/widgets/Launcher.tsx`, rendered by `ui/widgets/AppShell.tsx:187-204`) already appears whenever no
  document is active.

### Sidebar

- `state.ui.SidebarVisible` lives in the backend and defaults to `true` (`service.go:124`).
- It is persisted as `layout.workspace.visible`:
    - key at `layout_repository.go:9`;
    - restored at `service.go:394-396`;
    - written at `service.go:618`.
- The frontend effect in `app/App.tsx:41-46` calls `setWorkspaceVisible(true)` whenever a folder root appears. That call
  is persisted too.
- `OpenWorkspace` and `CloseWorkspace` (`internal/appmodel/workspace.go:200-269, 320-343`) never touch visibility.

### Menus and toolbar

- The in-app menus are React popups:
    - the Format menu is `ui/widgets/Menubar/FormatMenu.tsx`, fed by `actionsForSurface('format-menu')`
      (`logic/actions/actionRegistry.ts:659-675`);
    - on macOS the native menu holds only the App and Edit menus (`internal/application/native_menu.go`).
- The toolbar (`ui/widgets/FormattingToolbar/FormattingToolbar.tsx:36-47`) hard-codes five groups. The last group is
  Format, Compact and Lint as text buttons; it is marked `neverOverflows` (`:260-266`). The registry's `overflow`
  surface is declared but never read by the toolbar.
- A running tidy button is replaced in place by its progress and Cancel (`FormattingToolbar.tsx:122-136`). This happens
  only when `slot.kind` equals that button's own action id and progress is set, so a run started from the menu or a
  shortcut shows Cancel only on the matching button.

### Formatting transforms

- The pure transforms are in `logic/format/formatting.ts`:
    - numbered lists always write `1.` (`:548`);
    - headings stop at 3 (`FormatActionId`, `:5-18`);
    - the table is a fixed two-column string (`:625`).
- `CodeEditor` (`ui/components/CodeEditor.tsx`) applies edits through `applyEdit` (`:165-183`, bracketed by
  `pushUndoStop`), so each edit is one undo step.

### Settings

- The Settings popup (`ui/widgets/Menubar/SettingsMenu.tsx:212-333`) is JSX. The registry only controls availability
  and dispatch.
- The dialog (`ui/widgets/dialogs/SettingsDialog.tsx`, mounted from `AppearanceControls.tsx:214-246`) is one column
  inside `ModalShell` (`ui/components/ModalShell/ModalShell.tsx`). `ModalShell` renders a bare title and no close
  button.
- `Mod+,` runs the `settings` shell action. Its `openSettings` (`ui/widgets/Menubar/Menubar.tsx:337-340`) opens the
  popup, not the dialog.
- The backend `internal/settings` already stores and validates every setting the new dialog shows, including
  `editor.fontSize` (13/14/16) and `editor.scrollSync`. No setting has a backend gap.

### Glass tokens

- The Glass theme in `ui/styles/tokens.css:336-400` sets:
    - `--floating-surface` to 0.88 (light) / 0.90 (dark);
    - `--floating-backdrop-filter` to `blur(48px) saturate(180%)`.
- The same block already defines the mockup values as `--elevated` (0.80 / 0.82) and `--blur` (`blur(28px)
saturate(150%|160%)`).
- The scrim is `--overlay: rgba(0,0,0,0.4)` (`:60`).

## Goals / Non-Goals

**Goals:**

- One owner per state:
    - the backend owns the empty session and the sidebar visibility;
    - the action registry owns the Markdown menu's contents, order and groups.
- Reuse what already exists: `ModalShell`, `Segmented`, `Popup`/`MenuItem`, the `CreateEntryPrompt` dialog pattern,
  `useEditorSettings`, `settingsCommands`, and the existing tokens.
- New primitives only where nothing fits: `Switch` and `Select`.

**Non-Goals:**

- A generic settings-schema renderer. The five sections are written as explicit components.
- Changing the backend settings model or its validation.
- Restoring the folder or tabs at launch.
- Generic Markdown "smart editing" beyond list continuation: no auto-pairing and no table navigation.

## Decisions

### 1. Empty session is the default (D21)

**Choice:**

- `newAppModelService` starts with no documents and an empty `activeDocumentID`.
- `StartEmpty`, `WithEmptySession` and the `GOMARKEDIT_NEW_WINDOW_CHILD` marker are deleted.
- The child process inherits the parent's environment unchanged.
- Placeholder replacement in `file_lifecycle.go` stays: after New File, opening a file still replaces the untouched
  Untitled document. Its spec ("Open a document") stays valid unchanged.

**Tests:**

- Go tests that relied on the constructor's document create one through the public `NewDocument` path, using a helper
  in `tests/go/`.
- The e2e harness gains a helper that presses Mod+N.

**Rejected alternatives:**

- Keeping `WithEmptySession` with the default flipped. That leaves a dead option.
- Adding an "initial Untitled" option used only by tests. That is a production branch for tests, which `config.yaml`
  forbids.
- Creating the empty state in the frontend by closing the tab at bootstrap. That makes the frontend authoritative for
  the session, and it flashes.

**Known transient:** the launch target opens after `windowReady` (`app/useLaunchTarget.ts`). A file argument therefore
shows one frame of the launcher where it used to show one frame of Untitled. This is the same class of transient as
today; no fix is planned.

### 2. Sidebar visibility is derived and owned by the backend (D22)

**Choice:**

- The default becomes `SidebarVisible=false`.
- `OpenWorkspace` sets it to `true` for the "opened" result in the same patch as the workspace (`workspace.go:247-252`),
  so the frontend never sees a newly opened folder without a sidebar.
- The "already open" branch (`workspace.go:212-217`) returns under the read lock and publishes nothing today. When the
  sidebar is hidden, it takes the write lock, sets `SidebarVisible=true` and publishes a sidebar-only patch; otherwise
  it stays unchanged. The folder-workspace "Open a folder" requirement is modified to say so.
- The backend branch is not enough, because the frontend never reaches it for most routes. `onOpenWorkspacePath`
  (`frontend/src/app/useCommands.ts:300-310`) returns early when the path equals the shown root, so Open Folder, the
  sidebar's Open Folder button and dropping that folder never call `OpenWorkspace`. Only Recent Items does
  (`useCommands.ts:321-322`). The fix sends a same-root open to the backend `OpenWorkspace` too, which then makes the
  sidebar visible. There is no Replace prompt and the tabs are untouched. The backend stays the only owner of
  visibility.
- `CloseWorkspace` sets it to `false` in its patch (`workspace.go:331-336`). A cancelled close never reaches the
  backend, so nothing changes.
- `SetUILayout` still accepts `SidebarVisible` for Ctrl/Cmd+\ and for a resize to width 0. The value is kept in memory
  and published, but not persisted.
- `LayoutWorkspaceVisible` is removed from `persistLayout`, from `RestoreUILayout` and from the repository's key list and
  validation.
- The other places that read or write visibility keep their meaning but must be checked against the new rule:
    - `service.go:501`: a visibility change bypasses the sidebar-width debounce, and still does;
    - `service.go:543`: the layout patch that is applied and acknowledged without a width;
    - `service.go:979`: the patch merge copies `SidebarVisible` into the state;
    - `frontend/src/logic/store/uiLayoutCommands.ts:50`: dragging the width to 0 writes `sidebarVisible=false`, which now
      stays in memory only.
- The existing database row is never read or written again. The key-value store is additive, and migrations do not
  rewrite data.

**Frontend:**

- Delete the `App.tsx:41-46` effect.
- The `?? true` fallbacks become `?? false` (`WorkspaceLayout.tsx:33`, `ApplicationMenubar.tsx:65`, `Menubar.tsx:931`).
- Reading mode (D17) never writes visibility. The narrow-window rule still hides the sidebar on its own.

**Rejected alternatives:**

- Keeping the frontend effect. It splits ownership and persists a value the spec now says is not stored.
- Deleting the old row in a migration. That breaks the "migrations never rewrite data" rule.
- Continuing to write the key. That is dead data.

### 3. Markdown menu derived from the registry

**Choice:**

- Renames:
    - surface `format-menu` → `markdown-menu`;
    - `FormatMenu.tsx` → `MarkdownMenu.tsx`;
    - label key `shell.format` → `shell.markdown`;
    - the overflow target and label in `Menubar.tsx:542` and `FormattingToolbar.tsx:49-55`.
- `ActionEntry` gets `surfaceGroupKeys?: Partial<Record<ActionSurface, string>>`, which holds a group heading i18n key.
- `groupedActionsForSurface(surface)` groups consecutive results of `actionsForSurface` by that key.
- The order is the registry order, with no `surfaceOrder` set (`actionsForSurface` falls back to the registry index):
  `bold-italic` sits after `italic`, and `heading-4..6` after `heading-3`.
- The `table` entry sets `surfaceLabelKeys: { 'markdown-menu': 'action.table.markdown-menu.label' }`, the registry's
  existing per-surface label mechanism (the File menu already uses it). The menu reads
  `item.surfaceLabelKeys?.['markdown-menu'] ?? item.labelKey`, so it shows "Table…" while the toolbar keeps
  `action.table.label` ("Table").
- `MarkdownMenu` renders each group with the existing `ViewMenu.tsx:206` pattern: `role="group"` with `aria-label` set
  to the localized heading, and the visible `PopupGroupLabel` showing the same heading as text. A `PopupSeparator` sits
  between groups. `PopupGroupLabel` has no id and `SettingsMenu.tsx` has no `role="group"`, so no primitive changes.
- Group heading keys: `menu.markdown.group.text`, `.headings`, `.lists`, `.insert`, `.tidy`.
- Execution keeps the existing captured-snapshot path (`ApplicationMenubar.tsx:112-118`).
- The `ApplicationMenuTarget` `'format'` in `ui/widgets/applicationMenuRequest.ts:3` becomes `'markdown'`.
- Availability: today `getActionAvailability` checks only the document's capability for editor-scoped actions, and the
  missing editor is caught only at execution (`actionDispatcher.ts:200`, the `no-editor` reason when the editor is not
  focused). This is new behaviour owned by the actions-shortcuts "Availability and disabled reasons" delta: an editor
  formatting command (Bold through Table) is unavailable while the active document's editor is not shown (Preview
  arrangement, Reading mode), with the localized reason "Show the editor to use formatting." (the label key `action.noEditorShown`,
  next to `action.noDocument` and `action.settingsLoading`, mapped in `actionUnavailableLabelKey`,
  `actionRegistry.ts:677`).
    - The registry's availability context (`logic/actions/actionRegistry.ts:145-164`) gains an optional `editorShown`.
      Only `editorShown === false` makes the editor-scoped formatting actions (Bold through Table) unavailable, with a
      new reason `editor-hidden` mapped to `action.noEditorShown` in `actionUnavailableLabelKey`. An absent field changes
      nothing.
    - The existing `no-editor` reason (`:20`) is not unused: `actionDispatcher.ts:200-201` returns it for an
      editor-scoped action when the editor is not focused (mapped at `:84-90`). It stays the dispatcher's focus guard
      and is a separate reason.
    - `editorShown` is true when the active document's arrangement is not Preview and Reading mode is not active, both
      read from the store (the document view's arrangement and `logic/store/readingSlice.ts`).
    - It is passed by every caller that checks availability for these actions: the toolbar (`FormattingToolbar.tsx`),
      the Markdown menu (today `FormatMenu.tsx:87`) and the `createEditorActionExecutor` dispatch context
      (`editorActionExecutor.ts:219-251`), because `dispatchAction` calls `getActionAvailability`
      (`actionDispatcher.ts:226`). The last one covers the keyboard shortcuts. The editor context menu
      (`EditorContextMenu.tsx:56`) needs no change, because it only exists over a shown editor.
    - With no document the existing `no-document` rule already applies.
    - Document-scoped Format, Compact and Lint keep their current rules. The toolbar's formatting buttons and the
      shortcuts use the same availability, so they are disabled in Preview as well.

**Rejected alternative:** a hand-written menu layout. It breaks "menus … derive from one action registry" and would
drift from the shortcuts dialog.

### 4. Toolbar keeps Format; Format carries any tidy progress

**Choice:**

- `tidyActions = ['format']`.
- `compact` and `lint` drop their `toolbar` and `overflow` surfaces. They keep `markdown-menu`, `context` and
  `shortcuts`.
- Cancel already replaces the running tidy button in place (`FormattingToolbar.tsx:122-136`), but only for the button
  whose action id equals `slot.kind`. With Compact and Lint gone from the toolbar, a run of either would show nothing.
  The change makes the Format button render that in-place progress and Cancel for any `slot.kind`:
    - while `slot.kind` is `format`, `compact` or `lint` and progress is visible, it shows that run's progress and
      Cancel;
    - otherwise it is the Format button.
- Dropping the `toolbar` and `overflow` surfaces from `compact` and `lint` is catalogue cleanup: the toolbar is
  hard-coded and never reads them.
- This keeps the requirement "show progress with a Cancel control" reachable without a menu open.

**Rejected alternatives:**

- Showing Cancel only in the menu. A long Compact or Lint would have no visible Cancel.
- Keeping hidden Compact and Lint buttons. That is dead UI.

### 5. New actions and shortcuts

**Choice:**

- `bold-italic` uses Mod+Shift+B. It is gated by Markdown settings like `italic`, because it uses the emphasis marker.
- `heading-4`, `heading-5` and `heading-6` use Mod+4, Mod+5 and Mod+6.
- All four combinations are unused in the registry. Digits already parse in `shortcutRegistry.ts`.
- They join `formatActionIds`. Editor shortcuts are not bound inside Monaco: a `window` keydown listener in
  `ui/widgets/useEditorActionExecutor.ts:79-97` handles them, gated on focus inside `[data-editor-surface]` and on
  `formatActionIds`, so the new ids are handled by that listener.
- Toolbar icons: the toolbar is unchanged apart from the tidy group, so no new toolbar icons are needed. Menu items show
  text labels.

### 6. Bold Italic transform

**Choice:**

- Strong is always `**`; emphasis uses the emphasis-marker setting.
- In the inline wrapper-stack logic (`formatting.ts`, `inlineStackEdit` and its resolver `:304-391`):
    - if the stack holds both bold and italic, remove both;
    - otherwise add whichever is missing, with bold outside and italic inside.
- Results: `**_x_**` with `_`, `***x***` with `*`. The resolver already reads `***x***` as bold plus italic.
- The multi-line fallback (`formatInlineLine`, `inlineContentBounds`) takes separate open and close strings.

**Rejected alternative:** a literal `***` toggle. It ignores the `_` emphasis preference that Format and Lint enforce.

### 7. Sequential numbering

**Choice:** `listEdit` treats `numbered-list` as all-or-nothing.

- If every non-blank selected line is numbered, remove the markers. This is today's toggle.
- Otherwise:
    - number the non-blank lines from 1, with one counter per indentation (and quote prefix); a shallower line resets the
      counters of deeper levels, so nested runs restart at 1;
    - the first line's level continues from n+1 with the same `.` or `)` delimiter when the line above the selection is a
      numbered item with the same quote prefix and indent.
- Existing bullet, task and number markers and heading markers are replaced. Each line keeps its own indent.
- A blank line in a multi-line selection stays blank. A single blank caret line still becomes `1. `.
- Items below the selection are not renumbered.
- Bullet and task lists keep today's per-line toggle.

**Rejected alternatives:**

- One counter across all indentation levels: it numbers nested items as if they were siblings (`  * first` /
  `    - second` would become `1.` / `2.`), which the existing nested-list behaviour and test reject.
- Renumbering the rest of the list: it changes text outside the selection, which "Formatting actions" forbids.

### 8. Enter list continuation

**Choice:**

- A new pure module, `logic/format/listContinuation.ts`. Input: the document lines and the caret. Output: an edit or
  `null`.
- It reuses the line parsers from `formatting.ts`; `parseQuoteLine` and `parseListLine` are exported for it.
- Fenced-code detection is a lexical scan with the fence rule used in `logic/tidy/chunking.ts` (up to 3 spaces of
  indent, then a run of at least 3 backticks or tildes, closed by the same character with at least the opener's
  length). It reads only the lines above the caret, so the cost of one Enter is bounded by the caret's line number,
  not the 10 MiB writable limit.
- `CodeEditor` takes an optional `enterEdit` prop. The editor widget passes the logic function in, so the shared
  component never imports `logic/`.
- In `handleMount`, `CodeEditor` registers a per-editor `editor.addAction` bound to `KeyCode.Enter`, with the
  precondition `editorTextFocus && !editorReadonly && !suggestWidgetVisible && !inSnippetMode && !editorHasSelection &&
!editorHasMultipleSelections`.
- The action's run applies the edit through `applyEdit` (one undo step). When the result is `null`, it falls back to
  `trigger('keyboard', 'type', { text: '\n' })`, which keeps Monaco's auto-indent.
- Monaco does not dispatch keybindings during IME composition. Shift+Enter is not bound.
- The Enter `addAction` lives inside Monaco and does not pass through the window keydown listener of Decision 5. Enter is
  not a registry shortcut and is not in `formatActionIds`, so nothing handles it twice.

**Rejected alternatives:**

- `onKeyDown`: its order relative to the suggest controller is unclear, and the context keys it would need are private.
- `addCommand`: Monaco's global command registry makes the last-mounted editor's handler win.
- `onEnterRules` in the language configuration: it cannot increment numbers, clear an empty item, or see fences.

### 9. Insert table dialog

**Choice:**

- The `table` action stays registry-gated, so read-only documents and open modals still block it.
- `createEditorActionExecutor` (`logic/actions/editorActionExecutor.ts:219-251`) gets `requestTable(snapshot)`. For
  `table` it calls that instead of `runFormatAction`.
- A new `ui/widgets/insertTableRequest.ts` context, shaped like `applicationMenuRequest.ts`, carries the setter from
  `useAppPresentation`. The open request counts in `modalOpen`.
- `AppDialogs` mounts `ui/widgets/dialogs/InsertTableDialog.tsx`. It is `ModalShell` plus the `CreateEntryPrompt`
  pattern:
    - two labelled `input type="number"` fields;
    - inline `role="alert"` messages;
    - Enter submits, Escape cancels.
- On Insert it calls `runFormatAction` with `table: { columns, rows }`. `FormatRequest` gains that optional field, and
  `tableSkeleton` becomes a builder. A request without `table` means 3 columns and 3 rows, the dialog's defaults.
- Bounds: columns 1–20 and rows 1–100, both defaulting to 3. Defaults are not remembered.
- Focus goes back to the editor with `snapshot.commands.focus()` after the `ModalShell` close effect. `returnFocusTo` is
  passed as the editor so the effect does not restore the menu or toolbar opener.

**Rejected alternatives:**

- An inline grid picker in a popup: harder to operate by keyboard, and the bounds need typed input anyway.
- Remembering the last size: no requirement (YAGNI).

### 10. Settings dialog structure

**Choice:**

- `ModalShell` gets two optional props:
    - `closeLabel`: renders a header row with the title and a `×` icon button carrying that accessible name;
    - `className`: used for the dialog surface.
- Existing dialogs are unaffected.
- New primitives:
    - `ui/primitives/Switch`: a `button` with `role="switch"` and `aria-checked`. It reuses the existing switch look by
      extracting the `.toggle` styling of `ui/components/MenuItem/MenuItem.module.css:82-112`, so the popup rows and the
      dialog switches look the same (the mockup's `.tgl`, 34 by 19 px);
    - `ui/primitives/Select`: a styled native `<select>`, so the native keyboard and accessibility behaviour comes for
      free.
- Two- and three-value choices reuse `Segmented`.
- `SettingsDialog.tsx` is split by responsibility:
    - the dialog shell;
    - `SettingsSectionNav`: a vertical `tablist` with roving `tabindex`, where Up, Down, Home and End move and activate the
      section;
    - `SettingsRow`: a label and optional description on the left, the control on the right;
    - section components: Appearance, Editor, Markdown, Workspace and Export. The Workspace section component sits between
      Markdown and Export (Decision 12 supplies its data).
- The dialog always opens on Appearance.
- Size: `min(760px, 94%)` wide and `max-height: 88%`. Only the pane scrolls.
- At 376 px or narrower, the nav sits above the pane as a horizontal row. Both layouts accept Up/Left and Down/Right,
  so the keyboard contract does not depend on the width.
- Where the data comes from, and the one writer per key. Today there are two ordered queues, the module-level one in
  `logic/settings/editorSettings.ts:9` and the per-provider one in `AppearanceControls.tsx:76`. Each setting keeps its
  one existing writer, and the popup and the dialog call the same writer for a given key:
    - the `AppearanceSettingsProvider` writes theme, mode, default open mode, reading width, PDF appearance and Reset
      appearance;
    - `useEditorSettings` writes editor, autosave and Markdown settings (`update`: line numbers, word wrap, scroll sync,
      font size; `updateFile`: autosave; `updateMarkdown`);
    - `onSetWorkspaceHiddenFolders` (`app/useCommands.ts:495`) writes Show hidden folders.
- Mod+, routes to the dialog: the shell action's `openSettings` opens the dialog. The Settings menu button still opens
  the popup.
- Popup:
    - the Default open mode, Reading width and PDF appearance rows are removed from `SettingsMenu.tsx`;
    - the unused registry ids `default-open-mode`, `reading-width` and `pdf-appearance` are removed;
    - Autosave is shown with the same switch presentation as Format on save and Lint on save.

**Rejected alternatives:**

- A data-driven settings schema: only five sections exist (YAGNI).
- A custom listbox for Font size: it duplicates native select behaviour.
- A Material-style toggle built from a checkbox: `role="switch"` is the announced semantics the spec asks for.

### 11. Glass and scrim tokens

**Choice:**

- In both Glass blocks of `tokens.css`:
    - `--floating-surface: var(--elevated)`;
    - `--floating-backdrop-filter: var(--blur)`.
- In `:root`:
    - `--overlay: rgba(6, 8, 16, 0.42)`;
    - a new `--overlay-backdrop-filter: blur(3px)`, used by `ModalShell.module.css .overlay` (with the `-webkit-` prefix
      for WKWebView).
- Material and Minimal keep opaque floating surfaces with no blur.
- No component CSS changes beyond the overlay rule. The two tokens have more consumers than the menus and dialogs, and
  all of them change in Glass:
    - the Reading mode tab-bar overlay (`ui/widgets/EditorView.module.css:15-16`);
    - the reading sidebar overlay (`ui/widgets/AppShell.module.css:32-33`);
    - the reading controls (`ReadingControls.module.css:20`).
      They follow the same material by design. Task 3 checks their legibility in the real app.

**Rejected alternative:** new Glass-only literal values. `--elevated` and `--blur` already hold the mockup values, and a
second copy would drift.

### 12. Show hidden folders outside a workspace (D23)

**Context:**

- Show hidden folders is the application-wide layout preference `layout.workspace.showHiddenFolders`.
- `SetWorkspaceHiddenFolders` (`internal/appmodel/workspace.go:152-161`) refuses with "There is no open folder to
  update." when no folder is open.
- The value reaches the frontend only inside the workspace snapshot (`frontend/src/logic/store/workspaceSlice.ts:39`), so
  the Settings dialog cannot read it without a folder.

**Choice:**

- The setter stores `layout.workspace.showHiddenFolders` whether or not a folder is open. It rebuilds and publishes the
  tree only when a folder is open.
- The stored value is also published with the window's UI layout state (restored by `RestoreUILayout` next to the
  sidebar width), so the dialog can read it without a workspace. The field is added to the `UILayout` wire type and to
  `mergeUILayout` and `cloneUILayout` (`service.go:969-1006`). `SetUILayout` ignores an incoming value, so
  `SetWorkspaceHiddenFolders` remains the only writer.
- The workspace snapshot keeps carrying it for the tree.
- The dialog's Workspace section and the tree toggle both write through `onSetWorkspaceHiddenFolders`, and both read
  the store projection of the published value, so they stay in sync.

**Rejected alternatives:**

- Moving the preference into `internal/settings`: two owners for one preference.
- Disabling the dialog row while no folder is open: it contradicts "one application-wide preference".

It becomes `docs/architecture.md` decision D23, because it changes what a persisted value means.

### 13. Documentation

`docs/architecture.md` gains:

- **D21 — Empty-session startup.** Refines D18: a window without a launch target shows the launcher.
- **D22 — Sidebar visibility derived from the workspace.** Refines D17's wording about "stored sidebar visibility".
- **D23 — Show hidden folders outside a workspace.** Decision 12.

`docs/architecture.md` updates:

- the persistence section (`## Persistence`, `:711`), which drops `layout.workspace.visible` and states that the hidden
  folders preference is stored without a folder;
- the file-table row for the menu widgets (`:86`) and the action registry section (around `:275-282`), which cover the
  Markdown menu, its group headings and the editor-shown availability;
- "Shared UI owners and consumer inventory" (`:98-231`), which adds `Switch` and `Select`, the Settings dialog sections
  and the `ModalShell` close button;
- the floating-surface token paragraph (`:387-389`).

`docs/index.md` updates its settings and configuration rows.

### Verification approach

- **Unit (Jest):**
    - the transforms: Bold Italic, H4–H6, numbering, the table builder;
    - list continuation, including fences, quotes and empty items;
    - the registry: groups, surfaces, shortcuts;
    - the `Switch` and `Select` primitives.
- **Integration (Jest + Testing Library):**
    - the Markdown menu groups and their accessibility roles;
    - the toolbar tidy slot showing Cancel for Compact;
    - the Insert table dialog: bounds, Enter, Escape, focus;
    - the Settings dialog: sections, tablist keyboard, popup ↔ dialog sync;
    - the dialog's Show hidden folders switch and the tree toggle stay in sync;
    - the Markdown menu and the toolbar in Preview and with no document;
    - the trimmed popup.
- **Go integration:**
    - setting Show hidden folders with no folder succeeds, is persisted, is published and is restored at the next start;
    - the empty session at start;
    - visibility on open and close;
    - restore ignores the old key and persist no longer writes it;
    - New Window and missing-path startup.
- **E2E (real backend):**
    - launch → launcher;
    - folder open → sidebar; Close Folder → hidden;
    - the new shortcuts;
    - Enter continuation with undo;
    - table insertion;
    - the Settings dialog;
    - Show hidden folders turned on in the dialog with no folder, then a folder with `.notes/` opened;
    - Mod+B in the Preview arrangement leaves the text unchanged and the toolbar's formatting buttons are disabled;
    - the Glass computed styles (`floating-surfaces.test.ts`: `blur(28px)`, the scrim, content still obscured), with the
      Settings popup and the Settings dialog added next to About.
- **Real application** (Wails dev on macOS), for what tests cannot fully show:
    - the startup transient;
    - Enter with the Japanese IME and with the suggest widget open;
    - focus return after the table dialog;
    - Cmd+Shift+B, Cmd+4/5/6 and Cmd+, in WKWebView;
    - the glass look against the mockup screenshots.
- Windows and Linux WebView shortcut behaviour cannot be exercised here. The e2e shortcut tests stand in for it.

## Risks / Trade-offs

- **[Large test blast radius from the empty session]** Many e2e files and Go suites assume an initial Untitled tab
  (task 1 gives the discovery rule). → Land it first, as its own task, on a task branch. Add explicit helpers instead of patching each test
  ad hoc.
- **[Monaco Enter keybinding priority]** The `addAction` precondition may not cover every widget that also handles
  Enter (parameter hints, rename input). → Real-app check. If it shows that parameter hints or the rename input also
  take Enter, add `!parameterHintsVisible` and `!renameInputVisible` (both are Monaco context keys) to the
  precondition. The fallback design is `onKeyDown` with `isComposing`.
- **[Focus return after the table dialog]** `ModalShell` restores focus to its opener after closing. → Pass the editor
  as `returnFocusTo` and cover it with an integration test.
- **[Shortcut collisions in a webview]** Cmd+Shift+B, Cmd+4, Cmd+5 and Cmd+6 might be claimed by the host webview. →
  Verify in WKWebView; WebView2 and WebKitGTK are covered by e2e only.
- **[Behaviour change for existing users]** A user who relied on the sidebar staying hidden across restarts gets a
  visible sidebar when a folder opens. → This is the intended rule; Ctrl/Cmd+\ hides it for the session.
- **[Translucency vs. legibility]** The 28 px blur at 80% opacity is lighter than today's 48 px at 88%, and it also
  reaches the Reading mode overlays. → The e2e obscurity check (mean difference below 12) stays as the guard, plus a
  real-app comparison with the mockup and a Reading mode check.
- **[Formatting disabled in Preview]** Making editor-scoped actions unavailable without a visible editor also disables
  the toolbar's formatting buttons in the Preview arrangement, where today they look enabled but do nothing. → This is
  new behaviour owned by the actions-shortcuts "Availability and disabled reasons" delta; the tooltip states the reason.

## Migration Plan

- No data migration. The `layout.workspace.visible` row stays in place and is ignored.
- **Rollback:** reverting the change restores the reads and writes of that key and the constructor's Untitled document.
  No stored data needs repair.
