# T069 — Settings popup localization

**Requirement**: Constitution VI (strings go through the catalogue), FR-FT-047.
**Branch**: `feature/v1-implementation--003-t069-settings-localization`.

## Red before the fix

`just archtest` reported eight boundary violations, all in
`frontend/src/ui/widgets/SettingsMenu.tsx`, none allowlisted:

```
src/ui/widgets/SettingsMenu.tsx:127:37  User-visible text must come from the catalogue
src/ui/widgets/SettingsMenu.tsx:128:23  An accessible name is user-visible text
src/ui/widgets/SettingsMenu.tsx:148:37  User-visible text must come from the catalogue
src/ui/widgets/SettingsMenu.tsx:149:23  An accessible name is user-visible text
src/ui/widgets/SettingsMenu.tsx:173:37  User-visible text must come from the catalogue
src/ui/widgets/SettingsMenu.tsx:186:37  User-visible text must come from the catalogue
src/ui/widgets/SettingsMenu.tsx:237:15  User-visible text must come from the catalogue
src/ui/widgets/SettingsMenu.tsx:238:43  User-visible text must come from the catalogue
FAIL  src/ui/widgets/SettingsMenu.tsx: 8 boundary violation(s), 0 allowed.
```

`npm --prefix frontend test -- --runInBand -t T069` failed on
`T069 draws every visible Settings popup string from the catalogue`:
`Expected value: "Auto (system)"` was absent from the catalogue value set.

The eslint rule cannot see through a ternary, so these literals were also
hard-coded and were converted in the same pass: `Auto (system)`,
`Reading (Viewer)`, `Editor`, `Minimal (CommonMark)`, `GFM`,
`Full (+ math, footnotes…)`, `Autosave`, `Format on save`, `Lint on save`.

## Change

Ten catalogue keys added to `frontend/src/i18n/locales/en.json`. Their values
are the binding mockup's own `#m-settings` strings
(`docs/delivery/spec/surface/mockup.html`), so no visible text changed. The
compact popup wording differs from the full Settings dialog wording for the
same choices (`Auto (system)` versus `Follows system`); both now come from the
catalogue and neither is written into a component.

The mockup HTML/CSS was not edited. No mask, tolerance, comparator, selector
mapping, or allowlist entry was changed.

## Green after the fix

- `just archtest` — `archtest (frontend): ok`, zero boundary violations.
- `npm --prefix frontend test -- --runInBand` — 74 suites / 463 tests passed
  (was 2 suites / 9 tests failing before this task, all in the stale
  `menuitem "Appearance"` Settings-popup contract that T060 had already
  replaced with `All settings…`; those assertions were updated to the
  converged surface, none were deleted, skipped, or weakened).
- `npm --prefix frontend run typecheck` — clean.

## Real-application validation

Dev application at `http://127.0.0.1:4173`, 1280x720, Material Dark.

1. Clicked the real `Settings` menubar trigger.
2. Observed the popup rendering, in order: `THEME`, three swatches,
   `APPEARANCE`, `Auto (system)` (checked), `Light`, `Dark`,
   `DEFAULT OPEN MODE`, `Reading (Viewer)`, `Editor` (checked), `MARKDOWN`,
   `Minimal (CommonMark)`, `GFM` (checked), `Full (+ math, footnotes…)`,
   `Autosave` (on), `Format on save` (off), `Lint on save` (on),
   `All settings…` with the `Ctrl ,` accelerator.
3. Pressed `Escape`. Authoritative root attributes and focus read back as:

```json
{
  "popupOpen": false,
  "focused": "Settings",
  "rootTheme": "material",
  "rootMode": "dark"
}
```

Roles, keyboard operation, acknowledged state, and the source-backed layout are
unchanged; only the string source moved.
