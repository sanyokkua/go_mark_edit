# Design

## Context

See proposal.md for motivation. Observed state (paths under `frontend/src/` unless stated):

- **Open flow.** Every backend open goes through `OpenPath` → `PrepareOpen` → `CommitPreparedOpen`
  (`internal/appmodel/file_lifecycle.go:118-301`).
    - `openArrangement` (`file_lifecycle.go:436-444`) returns Preview for `viewer`. Lines 175-180 apply the saved
      per-file arrangement only for `editor`.
    - `OpenResult` (`internal/apperr/results.go:640-653`) reports status `opened` or `focused` (duplicate identity),
      among others.
    - Frontend entry points in `app/useCommands.ts`:
        - `openLink` :102
        - `onOpenDocument` :161
        - `onOpenRecentFile` :174, also used by the launcher Recent list, the tree (`onOpenTreeFile` :348) and drag
          and drop (`useDropHandler.ts:72`)
        - `onReopenLastFile` :300
        - tree New File (`onCreateWorkspaceEntry`), which calls `onOpenRecentFile` after creating the file
    - There is no tab session restore (ADR-0004). A file path on the command line is ignored.
- **Settings.** The backend stores, validates (`editor` | `viewer`) and resets `view.defaultOpenMode`, and pushes it
  into the application model (`internal/settings/service.go:156-191,300`).
    - The Settings menu rows (`ui/widgets/Menubar/SettingsMenu.tsx:63-69,222-232`) use the wrong value `reading`,
      have no `onSelect`, and are disabled. `ApplicationMenubar.tsx:74` casts to `'reading' | 'editor'`.
    - The Settings dialog (`ui/widgets/dialogs/SettingsDialog.tsx`) has no row.
    - Appearance state is React state in `AppearanceSettingsProvider` (`ui/widgets/AppearanceControls.tsx:47`). Its
      `persist` (:110-133) already sends the whole `{defaultOpenMode, mode, theme}` group through `updateAppearance`;
      only its patch type excludes `defaultOpenMode`.
- **Actions.** `distraction-free-reading` and `default-open-mode` are `laterDeferred` in
  `logic/actions/actionRegistry.ts:276-278,304-306`. The `preview` surface exists but only `refresh-preview` uses it,
  and there is no preview context menu. `formatShortcut` (`logic/actions/shortcutRegistry.ts:26-37`) has no special
  form for `Enter`.
- **Shortcuts and Escape.**
    - `useShellShortcuts` (`logic/actions/useShellShortcuts.ts:32-61`) listens on `window` in the bubble phase and does
      not check `defaultPrevented`. Monaco's Find input handles Ctrl/Cmd+Enter with `preventDefault` but without
      `stopPropagation` (`monaco-editor/esm/.../find/findWidget.js:654-664`).
    - `Popup` (`ui/components/Popup/Popup.tsx:272-278`) and `ModalShell` (`ui/components/ModalShell/ModalShell.tsx:97-103`)
      close on Escape from document listeners with `preventDefault`.
    - `modalOpen` (`app/useAppPresentation.ts:32`) covers Settings, About, Shortcuts and workflow modals.
- **Chrome composition.**
    - `app/AppFrame.tsx` holds the menu bar.
    - `ui/widgets/AppShell.tsx` holds the status bar.
    - `ui/widgets/EditorView.tsx` holds tabs, the toolbar and the problems dock.
    - `ui/widgets/WorkspaceLayout.tsx` holds the sidebar `Sidebar` + `WorkspaceTree`. The resize handle persists
      width through `setWorkspaceWidth`.
    - Toggle Sidebar persists through `setWorkspaceVisible` → `SetUILayout` (`logic/store/uiLayoutCommands.ts:29-43`).
      The callback is built in `ui/widgets/Menubar/Menubar.tsx:345-353` and reaches
      `ApplicationMenubar.tsx:172-178`.
    - Window keydown owners that must stay mounted for shortcuts to work:
        - `Menubar` (`Menubar.tsx:326-408`) mounts `useShellShortcuts` for every shell and File-menu shortcut;
        - `DocumentTabs` (`ui/widgets/DocumentTabs/DocumentTabs.tsx:475-540`) handles tab navigation and moves.

        `FormattingToolbar` registers editor formatting shortcuts, which need editor focus anyway.

    - `problemsOpen` is local state in `app/App.tsx:37`.
- **Preview.**
    - `EditorStage` keeps `LivePreview` mounted and renders nothing while the preview is hidden (`EditorStage/EditorStage.tsx:377`).
    - It keeps the editor mounted behind `Pane hidden` (:534).
    - It restores the saved preview scroll offset (`view.scroll.preview`, pixels) only when the document id differs from
      the last one restored (`claimPreviewScrollRestore`, :461-471; restore :324-330), so a remount of the same
      document's preview starts at 0.
    - Scroll sync is active only when both panes are visible (`logic/hooks/useScrollSync.ts:25`).
    - Preview text is natively selectable, and Wails' default context menu is off.

## Goals / Non-Goals

**Goals:**

- Reading mode as a presentation of the existing preview pane, with one preview instance.
- Exact restoration of the window and document state on exit, with no persisted writes caused by Reading mode
  except the preview scroll position.
- Make the existing Default open mode setting work end to end.

**Non-Goals:**

- Per-document or restart persistence of Reading mode.
- OS file association and launch-argument file open (macOS file-open events, per-platform packaging; separate change).
- Status-bar entry, print, export, new rendering features.

## Decisions

1. **Reading state is a small frontend-owned Redux slice.**
    - Fields: `active`, `sidebarShown`, `tabsShown`, all serializable booleans. Plain reducers, no thunks. The element
      to refocus on exit is kept in a ref by the Reading presentation, not in the store.
    - Its writers and readers span the open callbacks in `app/useCommands.ts`, the registry availability context, the
      shell shortcut handler, `AppFrame`, `AppShell`, `EditorView`, `WorkspaceLayout` and the reading controls.
      Threading local state through all of them, as `problemsOpen` is threaded, would add props to six layers.
    - Precedent: `logic/store/notificationsSlice.ts` is already a frontend-owned slice.
    - This refines ADR-0014 ("Redux is a projection") for transient, never-persisted window state. Recorded as a new
      durable decision in `docs/architecture.md`.
    - Shared `ui/components` still receive props only.
    - Rejected:
        - Persisting it in `DocView`/`UILayout`: a Go change, plus restart and per-document semantics the specs exclude.
        - Local `App.tsx` state: too much prop threading.
2. **Reading mode is a presentation override of `EditorStage`, not a second surface.**
    - While `active`, `EditorView` passes effective visibility editor = hidden, preview = visible and a `reading` layout
      variant: centered column up to 700 px, no pane header, no divider. The stored `view` is not written.
    - The pane's `LivePreview` is then the single renderer. Pause/Refresh, link handling, anchor jumps and the scroll
      offset updates come with no extra work.
    - "Reading mode scroll position" uses the saved pixel offset. `EditorStage` passes its layout variant
      (`normal` | `reading`) to `LivePreview` as a presentation key. The key is part of the restore claim (document id
      plus variant) and of the restore effect's inputs, so the saved offset is applied whenever the variant changes:
      on entry from Split, Preview or Editor, and on exit. Resetting the claim ref from an `EditorStage` effect is
      rejected, because the child's restore effect runs first. Scrolling in Reading mode keeps updating the saved
      offset, so leaving shows the same offset.
    - Scroll sync turns off by itself because the editor port is null.
    - Before entry, the editor view state is captured the same way the Preview switch does it (`EditorView.tsx:139-141`).
      Leaving Reading mode therefore restores arrangement, split ratio, cursor and scroll without writes.
    - Switching documents re-keys `LivePreview` per document (`EditorStage/EditorStage.tsx:555`), and each document restores its
      own saved preview scroll position.
    - Rejected:
        - Extracting `LivePreview` internals into a separate reading surface: a second lifecycle, and a double render
          when the pane is also mounted.
        - Switching to the Preview arrangement: persists a per-file change and loses the prior arrangement.
3. **Chrome gating at the existing composition points, keeping the shortcut owners mounted.**
    - The menu bar (`AppFrame` → `ApplicationMenubar` → `Menubar`) and the tab strip (`DocumentTabs` in `EditorView`)
      stay mounted while Reading mode is active and are hidden with the `hidden` attribute (no layout, outside the
      accessibility tree), so `useShellShortcuts` and the tab key handler keep working.
    - The toolbar, problems dock (`EditorView`), status bar (`AppShell`) and sidebar column (`WorkspaceLayout`) render
      nothing.
    - The sidebar column is omitted from layout, never collapsed through `setWorkspaceVisible`.
    - Rejected: unmounting the menu bar and tab strip, which removes their window keydown listeners, so Ctrl+Enter,
      Ctrl+W, Ctrl+N, Ctrl+\ and Ctrl+Tab would stop working in Reading mode.
4. **Overlays reuse content components, not the resizable shell.**
    - The sidebar overlay is an absolutely positioned panel at the stored `sidebarWidth`. It renders `WorkspaceTree`
      directly, not the resizable `Sidebar` component, so there is no resize handle and no width write.
    - The tab overlay is the same mounted `DocumentTabs` instance: while `tabsShown`, its container drops `hidden` and
      takes an absolutely positioned overlay style at the top. A second instance would register its key handler twice.
    - Neither overlay changes the document column's size.
    - The sidebar control is absent when no workspace is open or `useMinimumWindow()` is true
      (`ui/widgets/minimumWindow.ts`).
    - In Reading mode the Toggle Sidebar callback (`Menubar.tsx:345-353` → `ApplicationMenubar.tsx:172-178`) toggles
      `sidebarShown` instead of dispatching `setWorkspaceVisible`. The `toggle-sidebar` action
      (`logic/actions/shellActions.ts:90-101`) is available in Reading mode only when the sidebar control exists.
    - Overlays close themselves on Escape with `preventDefault`.
5. **Hover-revealed controls are one store-aware widget** under `ui/widgets/` built from the existing icon/tool-button
   primitives.
    - They stay in the tab order with `opacity: 0` and are placed in the window padding with a hit area of at least
      40 × 40 px.
    - Revealed opacity: sidebar and tab-bar controls 1 on `:hover` / `:focus-visible`; Exit at most 0.15 on `:hover`
      and 1 on `:focus-visible`. Values come from new opacity tokens.
    - Strings: new catalogue keys for the three accessible names.
    - Rejected:
        - Unmounting the controls until hover: not keyboard-reachable.
        - The mockup's always-visible "Done reading" button: overridden by the product owner.
6. **Keys.**
    - `distraction-free-reading` gets `shortcut: 'Mod+Enter'` and the `shortcuts` surface. It is available when a
      document is open and no modal is open, and dispatches a toggle.
    - `formatShortcut` prints `Enter` as `Enter`, giving `Ctrl+Enter` on Windows/Linux and `⌘↩` on macOS.
    - `useShellShortcuts` returns early when `event.defaultPrevented` is already true, the same yielding rule
      `Popup.tsx:287` and `MenuItem.tsx:63` use. This stops Ctrl+Enter in Monaco's Find input from toggling Reading
      mode. Monaco's own bindings already `stopPropagation`, so the guard affects only keys a control handled
      without stopping them.
    - Escape is not a catalogue command. It is a dismiss key, like Popup's. The Reading presentation registers a
      `window` keydown listener while `active`. The listener ignores events with `defaultPrevented` (menus, popups and
      overlays handled them) or while `modalOpen`, and otherwise leaves Reading mode.
7. **Preview context menu.**
    - New registry entries `preview-copy` and `preview-select-all` on surface `preview`, scope `window`, with no
      shortcut and no `shortcuts` surface, so Ctrl+C and Ctrl+A stay native.
    - Labels: `preview-copy` reuses `action.copy.label`; Select all needs a new catalogue key.
    - A `PreviewContextMenu` widget modelled on `ui/widgets/EditorContextMenu.tsx` (Popup, right-click, Shift+F10 and
      ContextMenu key) wraps the preview pane content in both the normal and the reading layout.
    - Copy writes the current `window.getSelection()` text through the existing native `ClipboardPort`
      (`logic/adapter/clipboard.ts`), as editor Copy does. It is disabled when the selection is empty or outside the
      rendered document.
    - Select all selects the rendered document's node contents with a `Range`, not `document.execCommand('selectAll')`.
    - The editor clipboard actions are editor-scoped and are not reused.
8. **Open flow signal.**
    - `OpenResult` gains `ReadingMode bool json:"readingMode,omitempty"`. It is true only when the result status is
      `opened` and the default open mode is `viewer`; it is false for `focused`, `refused`, `cancelled` and
      `folder-target`.
    - `openArrangement` stops special-casing `viewer`, and lines 175-180 apply the saved per-file arrangement in both
      modes, so a Reading open keeps the arrangement shown on exit.
    - `effectiveDocumentMetadataLocked` (`internal/appmodel/service.go:470-485`) is unchanged.
    - `NewDocument` stays Editor and reports no flag.
    - In each `useCommands.ts` entry point listed in Context, after the open is acknowledged and its activation
      generation is still current, the frontend enters Reading mode when `readingMode` is true. A false flag never
      clears Reading mode.
    - The one exception is the tree New File path (`onCreateWorkspaceEntry`). It ignores the flag and leaves Reading
      mode if active (user decision: a newly created file opens for writing).
    - There is no frontend copy of the open-mode rule.
    - Rejected:
        - The frontend reading the setting and deciding: duplicate rule, wrong for duplicate focus.
        - Leaving Preview forcing in place: Reading exit would show Preview instead of the saved arrangement.
9. **Settings UI.**
    - Keep the `viewer` wire value and the "Reading (Viewer)" label.
    - The appearance controller (`ui/widgets/appearanceSettingsContext.ts`, `AppearanceControls.tsx`) gains
      `onDefaultOpenModeChange`, mirroring theme and mode. The Settings menu rows use `'viewer' | 'editor'`, gain
      `onSelect`, and are enabled by the existing `rowUnavailable(id, writer)` rule (`SettingsMenu.tsx:128`), with no
      extra loading gate.
    - `default-open-mode` loses `laterDeferred`.
    - The Settings dialog gets a Default open mode row next to theme and mode, through `AppearanceControlsContent`
      (`AppearanceControls.tsx:185-200`) and the dialog props.
    - `persist` accepts `defaultOpenMode`.
    - No new setting, storage or migration.
10. **Durable decision.** Add D17 to `docs/architecture.md`:
    - Reading mode is transient frontend window state held in a frontend-owned slice (refines ADR-0014).
    - It is never persisted.
    - The backend signals Reading-on-open through `OpenResult.readingMode`.
    - The open-document text at `docs/architecture.md:481-483` is corrected to match.

## Risks / Trade-offs

- [The hidden editor receives shortcuts in Reading mode] → focus moves to the rendered document on entry. Editor-scope
  handlers require focus inside `[data-editor-surface]` (`ui/widgets/useEditorActionExecutor.ts:95`). Covered by an
  integration test.
- [Menu bar hidden while menu shortcuts still work] → expected; the menu bar stays mounted (Decision 3), so its window
  listener remains.
- [The `defaultPrevented` guard changes global dispatch] → existing shortcut unit, integration and e2e suites must stay
  green. The guard only skips keys another handler already consumed.
- [Changing the viewer open arrangement affects stored `viewer` values] → the value was unreachable from the UI because
  the rows were disabled. The default is Editor.

## Migration Plan

No data migration. The stored `view.defaultOpenMode` is unchanged. Rollback is reverting the change.

## Verification

- **Jest unit:** slice reducers, action availability, `formatShortcut`, dispatch guard.
- **Jest integration:** chrome gating, the override restoring arrangement/cursor, Escape yielding, overlays and stored
  layout, controls, context menu, Settings menu/dialog.
- **Go black-box:** `OpenResult.readingMode` and arrangement in both modes.
- **Playwright** against the real backend: toggle, Escape, overlays, the `@native-clipboard` copy, open into an empty
  window in each mode, the setting after restart. The copy text comes from `frontend/tests/fixtures/reference-document.md`
  ("Getting Started").
- **Real application, manual:** control visibility on hover and focus, the column and typography in the three themes
  in light and dark. The layout reference is the local, git-ignored mockup
  `.local_tmp_files/specification/mockups/gomarkedit-mockup.html`. The specs override its Done button.
