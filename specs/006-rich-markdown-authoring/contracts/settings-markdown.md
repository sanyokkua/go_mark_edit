# Contract: Markdown settings and save behaviour

**Owners**: backend `internal/settings/` (defaults, validation, persistence); frontend `logic/settings/`
(commands) and `logic/store/settingsSlice.ts` (projection); `app/useDocumentWrites.ts` (on-save hook). No new
bridge handler: `GetSettings` and `UpdateMarkdown` (whole-group write) are reused.

## Settings

Shape and defaults are in the data model. `DefaultSettings()` in `internal/settings/model.go` is the only
definition of the defaults: `full`, `-`, `_`, `atx`, Format on save off, Lint on save on. Persistence uses the
existing settings table and survives restart; values are validated on write (`apperr.Validation`), and an
invalid or missing stored value reads as the default, so no migration is needed.

| Change                           | Applied where                                             | When                  |
| -------------------------------- | --------------------------------------------------------- | --------------------- |
| `standard`                       | every open document's preview; preview header; status bar | within 1 s, no reopen |
| `bulletMarker`, `emphasisMarker` | toolbar list and emphasis actions, Format, Lint           | next action           |
| `headingStyle`                   | Format and Lint only (toolbar heading actions stay ATX)   | next action           |
| `formatOnSave`, `lintOnSave`     | the on-save hook                                          | next explicit save    |

## Existing code that changes

- `internal/settings/model.go` `DefaultSettings()`: `Standard` changes from `MarkdownGFM` to `MarkdownFull`.
- `logic/store/settingsSlice.ts` `defaultMarkdownSettings` (`gfm`, emphasis `*`, Lint on save off): removed;
  markdown values come only from hydration.
- `ui/widgets/Menubar/SettingsMenu.tsx` (`:227` `?? 'gfm'`, `:241` `?? false` for Format on save, `:248`
  `?? true` for Lint on save) and `ui/components/StatusBar/StatusBar.tsx` (`:61` `?? 'gfm'`): the fallbacks are
  removed; both read the hydrated value.
- `ui/widgets/EditorStage/EditorStage.tsx` preview header: the hard-coded `editor.preview.flavour` ("GFM") is
  replaced by the hydrated standard (`editor.preview.standard.*`).
- `i18n/locales/en.json`: `status.markdownStandard.{gfm,commonmark}` becomes
  `status.markdownStandard.{minimal,gfm,full}`; the unused `commonmark` key is removed. The Settings group
  reuses the existing keys (`settings.markdown.*` for the standard, bullet, emphasis and heading controls and
  their values, `settings.formatOnSave`, `settings.lintOnSave`) and adds only the missing ones (group title and
  descriptions). The popup label `settings.menu.markdown.full` ("Full (+ math, footnotes…)") is corrected to
  match FR-RN-003 and FR-RN-004: footnotes belong to GFM, so the Full label names math, alerts and
  admonitions.
- `logic/actions/actionRegistry.ts`: `markdown-standard`, `format-on-save` and `lint-on-save` lose `deferred`.
- `logic/format/formatting.ts` `formatMarkers()`: today any emphasis other than `_` maps to `*`; it returns the
  bullet marker (including `+`) and the emphasis marker from the settings. Heading actions ignore
  `headingStyle`.

Until the settings projection is hydrated (`hydrated: false`) (FR-ST-002):

- the preview header and the status bar show no Markdown standard;
- the Markdown settings rows in the popup and the dialog group are unavailable;
- Format, Compact, Lint and the toolbar actions that use the bullet or emphasis marker are unavailable;
- the preview body renders nothing (loading state);
- no `updateMarkdown` write is issued, so a write never merges into an unloaded group.

## Settings view

The settings dialog (`SettingsDialog.tsx`) gains a "Markdown" group containing, in order: Markdown standard
(segmented: Minimal, GFM, Full), bullet marker (segmented: `-`, `*`, `+`), emphasis marker (segmented: `_`,
`*`), heading style (segmented: ATX, Setext), Format on save (switch), Lint on save (switch). Each control is
keyboard operable, has a localized accessible name and description, and uses existing primitives (`Segmented`,
the existing toggle row).

The settings popup rows for the standard, Format on save and Lint on save call the same settings command as the
dialog group and carry no logic of their own. Every change is one `updateMarkdown` call with the merged group
(existing `settingsCommands.ts` behaviour), acknowledged into the projection on success. A failed write keeps
the control at its previous value and shows a notice.

## Save behaviour (explicit saves only)

Explicit saves are Save, Save As and the Save choice of a close or quit prompt. Autosave runs neither Format nor
Lint.

1. **Format** (only while Format on save is on). The first matching case applies:

    | Case                                                     | Outcome                                            |
    | -------------------------------------------------------- | -------------------------------------------------- |
    | the saved document is not the active document            | skipped: not the active document                   |
    | the operation slot is busy                               | skipped: another operation is in progress          |
    | Format returns `edits`                                   | applied as one undo step; the formatted text saves |
    | Format returns `refused`, `cancelled` or `failed`        | skipped with that reason                           |
    | Format returns `stale` (document changed during the run) | result discarded; skipped: the document changed    |

    "Skipped" means the current text is saved unchanged and the `format-on-save-skipped` notice names the reason.

2. **Save**: flush the active editor (`flushActiveSession`) and save as today.
3. **Lint** (only while Lint on save is on): after a successful save of the active document, run Lint and set
   the markers and the count. If the operation slot is busy, Lint is skipped silently: no notice, and the
   markers, count and problems list stay as they are. The Format skip notice rules above are unchanged.

Lint on save runs only for the active document; an explicit save of any other document runs neither action.
The formatted text is what gets saved, because step 1 changes the working copy before the flush and before the
revision is read (`useDocumentWrites.ts` reads `getState()` after `flushActiveSession`). The close plan
validates each target's content revision, so the backend never changes text inside `Save`. A Lint refusal,
failure or cancellation never blocks or undoes the save.

## Tests

- Go: defaults updated to `full` in the settings unit, handler and repository tests; round trip of each key;
  an invalid stored value reads as the default.
- Frontend: before hydration no markdown value or standard is shown, the settings rows, tidy actions and marker
  toolbar actions are unavailable, the preview body is empty and no settings write is issued; every surface shows the hydrated value;
  each control changes the preview standard, Format output, Lint findings and toolbar markers; popup rows and
  dialog group issue the same command.
- On save: explicit save formats, then saves the formatted text, then lints; autosave does neither; each skip
  row (not active, slot busy, refused, cancelled, failed, stale) saves the current text with the notice; Lint on
  save with the slot busy is skipped with no notice.
- E2E: settings persist across relaunch.
