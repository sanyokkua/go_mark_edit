# T119 — the default open mode reaches the document model, walked on the real binary

**Requirement:** FR-FT-003 — "Opening an existing file MUST apply the acknowledged default open mode
first. Reading opens directly in the existing Reading mode."

**Why a host walkthrough and not only tests:** T104 was the identical defect one setting over, and
its record says plainly that a projection-only test is what missed it. `tasks.md:1194` repeats the
instruction for T119.

## The defect

`SetDefaultOpenMode` (`internal/appmodel/service.go:178`) had **zero production callers**, no Wails
binding and no frontend reference. `service.defaultOpenMode` therefore stayed pinned to
`OpenModeEditor` (`service.go:121`) for the process lifetime, while `openArrangement`
(`file_lifecycle.go:392-400`) was its only reader. The setting was persisted, validated, defaulted
and reset correctly, and reached nothing.

## Build and stale-instance guard

`open` raises an already-running process, so host evidence can describe a build that is not in the
tree. Checked explicitly:

| | |
|---|---|
| binary built | `Aug 15 22:45:23 2026` — `build/bin/GoMarkEdit.app/Contents/MacOS/GoMarkEdit` |
| running instances before launch | none (`ps -eo pid,lstart,comm \| grep GoMarkEdit`) |
| process observed | pid 57615, started `Sat Aug 15 22:46:26 2026` |

The observed process started **after** the binary was written, so it is that binary.

## How Reading was selected

The Settings row for default open mode is **not editable**: `actionRegistry.ts:257-259` marks
`default-open-mode` `laterDeferred` and `SettingsMenu.tsx:240-250` renders both rows with a
hardcoded `aria-disabled="true"` and no handler. That deferral is T155's to revisit; T119 is the
backend join only.

So the preference was seeded where the application actually reads it — the persisted store, which is
exactly what `applyPersistedDefaultOpenMode` consumes at startup:

```
sqlite3 ~/Library/Application\ Support/GoMarkEdit/settings.db \
  "update settings set value='viewer' where key='view.defaultOpenMode';"
```

The store was backed up first and **restored to `editor` afterwards**; the walkthrough left no
change on the host.

## Observed

1. Launch with the seeded preference. The startup document is `Untitled` and opens in **Split** —
   `EDITOR · UNTITLED | PREVIEW · LIVE`, `S` active in the arrangement toggle. Correct: FR-FT-001
   exempts New from the default open mode, "regardless of the default open mode".
2. **File → Open Recent → `fixture-a.md`.**
3. The document opened **directly in Reading**:
   - a single `PREVIEW · LIVE` pane header, with no `EDITOR · …` header beside it;
   - the `P` arrangement toggle active where the untitled document showed `S`;
   - the rendered document filling the whole pane, no editor pane present;
   - identity row `gomarkedit-walkthrough / fixture-a.md`.

Before the fix the same steps opened the file in Split, because the stored `viewer` never left the
database.

## What this does and does not prove

Proves: on the shipped binary, a persisted default open mode of Reading is applied by Open to a real
file on disk, through the real composition root, the real SQLite store and the real webview.

Does not prove: the Settings row can select it — that row is deferred and belongs to T155. Until then
the preference is reachable only by an already-stored value, which is the case this walkthrough
covers and the case `TestPersistedDefaultOpenModeSurvivesRestart` pins.

## Covering tests

| Test | What it holds |
|---|---|
| `internal/application/default_open_mode_wiring_test.go` `TestPersistedDefaultOpenModeSurvivesRestart` | Two real holder + `Init` cycles against one SQLite file — the startup push, which is the defect |
| …`TestUpdateAppearancePropagatesDefaultOpenModeToDocumentModel` | The observer, both directions |
| …`TestResetAppearanceReturnsTheDocumentModelToEditor` | A reset does not leave the model and the store disagreeing |
| …`TestStartupLeavesDefaultOpenModeAtEditorWhenTheStoreCannotBeRead` | An unreadable store keeps the documented default |
| `internal/appmodel/open_lifecycle_test.go` `TestOpenInReadingModeOpensDirectlyIntoPreview` | The behavioural half: Reading resolves `ArrangementPreview` and outranks a persisted arrangement. No test exercised `OpenModeViewer` at all before this one |
