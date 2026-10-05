# Contract: New and changed interface surfaces

Every surface takes labels, shortcuts and availability from the action registry
(`logic/actions/actionRegistry.ts`), uses existing primitives (`Button`, `ToolButton`, `Popup`, `MenuItem`,
`Banner`, `Segmented`, `Pane`, `Icon`), takes user-visible text from the catalogue (`i18n/locales/en.json`), and
takes every colour from tokens. `ui/components` and `ui/primitives` receive props and do not import the store,
the adapter or the action registry.

## Actions

Tidy surfaces are the toolbar, its overflow, the editor context menu, the Format menu group and shortcuts.

| Action id         | Shortcut    | Surfaces                            | Available when                                                   |
| ----------------- | ----------- | ----------------------------------- | ---------------------------------------------------------------- |
| `format`          | Alt+Shift+F | tidy surfaces                       | settings loaded; an open, writable document; slot free           |
| `compact`         | Alt+Shift+C | tidy surfaces                       | same as `format`                                                 |
| `lint`            | Alt+Shift+L | tidy surfaces                       | settings loaded; an open document (read-only allowed); slot free |
| `toggle-problems` | none        | status-bar problem count, View menu | an open document                                                 |

The settings popup rows `markdown-standard`, `format-on-save` and `lint-on-save`, the Settings dialog's Markdown
group and the toolbar actions that use the bullet or emphasis marker are available once the stored settings
have loaded, and unavailable before (FR-ST-002).

A disabled action shows its reason as the tooltip: "This document is read-only." for Format and Compact on a
read-only document; "Another operation is in progress." for all three while the operation slot is held (the
running action shows Cancel instead when the document is larger than 1 MiB or the run has lasted longer than
one second). The command palette is out of
scope and stays a deferred row.

## Existing code that changes

- `logic/actions/actionRegistry.ts`: `format`, `compact`, `lint` and the three settings rows lose `deferred`;
  `lint` gains the context surface; a Format menu surface is added for the three tidy actions.
- `logic/actions/actionDispatcher.ts`: the three tidy actions are gated individually instead of by the
  `document` (writable) scope: Format and Compact need a writable document, Lint an open one, all three a free
  slot.
- `ui/widgets/FormattingToolbar/FormattingToolbar.tsx`: `deferredActions` (the three rendered as a forced-deferred
  group) is replaced by registry availability.
- `ui/widgets/EditorContextMenu.tsx`: the `availability.kind === 'deferred'` check no longer applies to the three
  items; it stays for the command palette.
- `ui/widgets/useEditorActionExecutor.ts`: `deferredEditorShortcutIds` is removed; Alt+Shift+F/C/L dispatch the
  tidy actions (the toolbar formatting shortcuts in `formatActionIds` are unchanged).
- `ui/widgets/Menubar/Menubar.tsx`: a new Format menu (Format, Compact, Lint) next to File, Settings, View and
  About; View gains Problems.
- `ui/widgets/Menubar/SettingsMenu.tsx`: the markdown rows call the same settings command as the dialog group.
- `i18n/locales/en.json`: `action.unavailable` ("in this slice") gives way to the specific reasons above.

The window keydown handler that routes Alt+Shift+F/C/L inside `[data-editor-surface]` keeps working.

## Running state

- Every run holds the operation slot; all three actions are disabled meanwhile, so a second run cannot start.
- When the document is larger than 1 MiB, from the start of the run, and for any other run once it has lasted
  longer than one second, the control that started the run is replaced by Cancel (toolbar and menu) and a
  progress indicator shows `done/total` chunks. Cancel terminates the worker; the document and the
  previous findings stay unchanged and the `tidy-cancelled` notice is shown.

## Status bar and problems panel

- New status fact `problems` (before the `cursor` fact in drop priority): the exact finding count for the active
  document, `0` after a clean run, hidden until Lint has run for the active document since it became active
  (the summary is discarded when another document becomes active or the document closes). When stale it carries an "out of date" marker and
  accessible text. It is a control that toggles the problems panel.
- Problems panel: a docked `Pane` below the editor (header, close button, body), role `region` with a localized
  name, listing findings in document order with severity icon, line, column, message and rule. Each row is
  focusable; Enter or click moves the caret to the finding and focuses the editor. At most 10,000 rows, then
  "N more not shown". Stale state shows a banner "Results are out of date until Lint runs again". Empty states:
  "No problems" after a clean run; "Run Lint to check this document" before any run. Long messages wrap; reduced
  motion is respected. It uses no `role=menu`, `dialog`, `tab` or `radiogroup`.

## Preview surfaces

- The preview header and the status bar show the selected standard ("Minimal", "GFM", "Full") once settings are
  hydrated, and nothing before; the value updates within one second of a change.
- Until settings are hydrated, the preview body renders nothing (a loading state), so no document is rendered
  at a standard the user did not choose.
- New preview components, styled with tokens only: diagram error box, formula error marker, "too large to
  render" and "too many diagrams to render" placeholders, alert and admonition boxes (icon from `Icon`, localized
  title). The whole-render failure error appears above the retained last render.

## Notices

| Code                     | When                                                                      | Actions                  |
| ------------------------ | ------------------------------------------------------------------------- | ------------------------ |
| `tidy-refused`           | Format or Compact would change the rendered document                      | none                     |
| `tidy-failed`            | worker error                                                              | none                     |
| `tidy-cancelled`         | the user cancelled a run                                                  | none                     |
| `tidy-stale`             | the document changed, or another became active, while a run was in flight | none                     |
| `format-on-save-skipped` | on-save Format skipped (the reason is named; settings-markdown contract)  | none                     |
| `preview-link-refused`   | the link classifier refuses a link; existing, new reason `network-path`   | none                     |
| `link-unsupported-file`  | an existing file the editor cannot open                                   | "Reveal in file manager" |

A Format run started by the on-save hook shows only `format-on-save-skipped`, never a `tidy-*` notice. The
`untitled` link reason reads "Relative links need a saved document." A link the backend refuses for any reason
other than an unsupported file shows the classified notice Open shows for the same condition (link-open
contract).

"Reveal in file manager" is the `reveal-workspace-path` remediation carrying the result's `revealPath`
(link-open contract).

## Catalogue additions (English source; one locale exists)

`status.markdownStandard.{minimal,gfm,full}`, `status.problems.*`, `editor.preview.standard.*` (replacing the
hard-coded "GFM"), `problems.*` (title, empty, notRun, stale, moreNotShown, row labels), `tidy.*` (running,
cancel, cancelled, refused, failed, stale, skipped with each reason, unavailable reasons),
`lint.rule.<id>.{message,hint}` for the ten rules, `settings.markdown.*` (existing control and value keys reused; group title and descriptions added),
`settings.menu.markdown.full` (text corrected; settings-markdown contract),
`preview.math.*`, `preview.mermaid.*` (error, tooManyDiagrams, tooLarge),
`preview.alert.{note,tip,important,warning,caution}`, `preview.linkRefused.reason.networkPath`,
`link.unsupportedFile.*`. Changed: `preview.linkRefused.reason.untitled` reads "Relative links need a saved
document." (FR-LK-010). Removed: the link reasons `outside` and `extension`, and the unused
`status.markdownStandard.commonmark` (replaced by the `minimal` and `full` keys).

## Accessibility and theme evidence

- Keyboard: every new control (the three actions, Cancel, problem count, problem rows, settings controls,
  reveal remediation) is operable by keyboard with visible focus; tab order follows the visual order.
- Roles and names: localized accessible names on icon-only controls; the problem count announces its value and
  stale state.
- Six theme and mode combinations: alert boxes, code colours, diagram redraw, KaTeX text, markers and the
  problems panel are checked in the running application in every combination (the looped pattern of
  `frontend/tests/e2e/theme-surfaces.test.ts`).
