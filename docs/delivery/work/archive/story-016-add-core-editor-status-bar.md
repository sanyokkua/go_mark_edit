---
id: STORY-016
title: Add the core editor status bar
status: done
spec_clauses:
  - ../../../_archive-2026-07-28-specification/01_Product/01_FUNCTIONAL_REQUIREMENTS.md#fr-i18n
  - ../../../_archive-2026-07-28-specification/01_Product/02_EDITOR_AND_VIEWER_MODES.md#editor-mode
  - ../../../_archive-2026-07-28-specification/01_Product/03_FILES_TABS_WORKSPACE.md#encoding-and-line-endings
  - ../../../_archive-2026-07-28-specification/01_Product/13_I18N.md#i18n-layer
  - ../../../_archive-2026-07-28-specification/01_Product/13_I18N.md#string-catalog
  - ../../../_archive-2026-07-28-specification/01_Product/13_I18N.md#adding-a-locale
  - ../../../_archive-2026-07-28-specification/01_Product/13_I18N.md#formatting
  - ../../../_archive-2026-07-28-specification/02_Architecture/03_FRONTEND_REACT.md#state-ownership
  - ../../../_archive-2026-07-28-specification/00_Foundation/04_DESIGN_DECISIONS.md#10-non-functional--operations
  - ../../../_archive-2026-07-28-specification/00_Foundation/04_DESIGN_DECISIONS.md#14-application-state-ownership
  - 07_Phases/PHASE_04_RENDERING_EXTENSIONS.md#scope
phase_requirements:
  - PH01-R13
  - PH01-R16
modules:
  - i18n/
  - ui/components/
  - ui/widgets/
  - logic/store/
  - ui/styles/
acceptance_criteria:
  - STORY-016-AC-1
  - STORY-016-AC-2
  - STORY-016-AC-3
  - STORY-016-AC-4
  - STORY-016-AC-5
  - STORY-016-AC-6
edge_cases:
  - EC-I18N-1
  - EC-I18N-2
depends_on:
  - STORY-015
  - STORY-019
adrs:
  - ADR-0014
phase: 01
owner: coder
estimate: L
---

> **Historical vocabulary — this story is not maintained.** The `AC-…`, `EC-…` and `DD-…` identifiers are the scheme of the pre-2026-07-28 specification; `spec_clauses` and `phase_requirements` point into `_archive-2026-07-28-specification/`, which is kept so a citation still resolves and is **not normative**. See `README.md`. If anything here disagrees with the code, the code is the truth.
> A link beginning `07_Phases/` names a retired phase document that was deleted rather than archived; that set is in git at `e1bd33f`.

# STORY-016 — Add the core editor status bar

## Goal
Show users the active cursor location and backend-derived document metadata in the editor chrome so the first untitled document communicates position, word count, encoding, line endings, and arrangement without treating frontend text as authoritative.

## In scope
- Add a presentational `StatusBar` for one-based cursor position, backend-derived word count, encoding, line ending, and current arrangement.
- Feed cursor position from ephemeral Monaco events and all document/view metadata from the reconciled Redux projection.
- Compose the status bar into `EditorView`; format canonical `utf-8`/`lf` wire values as `UTF-8`/`LF` labels.
- Add the dependency-free, bundled i18n seam needed by the new status-bar strings: an eager Vite locale-resource discovery path, English fallback, named interpolation, locale-aware number formatting, and typed `t()`/`setLocale()`/`availableLocales` exports.

## Out of scope
- Autosave, lint counts, file warnings, binary/non-UTF-8 warnings, and save state, owned by later phases.
- Computing word count from Monaco text or storing content in Redux; the backend's Unicode whitespace-token rule is authoritative.
- Persisting cursor position or per-path file metadata, owned by later document and settings work.
- Reading mode, which hides the status bar and is owned by Phase 04.
- Markdown-standard status labeling, owned by Phase 04; Phase 01 need not show a `GFM` label in the status bar.
- Restorable cursor/selection synchronization, owned by STORY-019; this story consumes its immediate ephemeral cursor signal and backend patch provenance.
- Migrating pre-existing UI literals globally or exposing the Settings Language UI, both owned by the later i18n/settings stories.

## Spec inputs
- `../../../_archive-2026-07-28-specification/01_Product/02_EDITOR_AND_VIEWER_MODES.md#editor-mode` — include the status bar in editor chrome and use the specified Split, UTF-8/LF, and source-editor defaults.
- `../../../_archive-2026-07-28-specification/01_Product/03_FILES_TABS_WORKSPACE.md#encoding-and-line-endings` — display encoding and line ending explicitly; Phase 01 uses the untitled UTF-8/LF defaults before file I/O exists.
- `../../../_archive-2026-07-28-specification/01_Product/01_FUNCTIONAL_REQUIREMENTS.md#fr-i18n` and `../../../_archive-2026-07-28-specification/01_Product/13_I18N.md#i18n-layer` — status-bar strings pass through a lightweight, offline i18n layer with English shipped.
- `../../../_archive-2026-07-28-specification/01_Product/13_I18N.md#string-catalog`, `#adding-a-locale`, and `#formatting` — resource-file-only locale discovery, stable namespaced keys, named placeholders, and locale-aware word-count formatting.
- `../../../_archive-2026-07-28-specification/02_Architecture/03_FRONTEND_REACT.md#state-ownership` — keep cursor position as ephemeral active-view scaffolding and read document counts/view state from the backend projection.
- `../../../_archive-2026-07-28-specification/00_Foundation/04_DESIGN_DECISIONS.md#10-non-functional--operations` — DD-35 requires i18n readiness; DD-32 keeps locale resources bundled with no runtime fetch.
- `../../../_archive-2026-07-28-specification/00_Foundation/04_DESIGN_DECISIONS.md#14-application-state-ownership` — apply DD-62 through DD-64 so counts and arrangement come from backend-derived metadata rather than Monaco content.
- `07_Phases/PHASE_04_RENDERING_EXTENSIONS.md#scope` — defer Markdown-standard selection/badge presentation to the Phase-04 rendering expansion.

## Design constraints
- Word count and view arrangement come only from reconciled backend metadata; neither `StatusBar` nor a selector reads Monaco content or stores document text in Redux (DD-62, DD-63, DD-64; ADR-0014).
- Cursor line/column are one-based ephemeral active-editor state supplied by STORY-019 and update immediately without becoming authoritative application state; restorable cursor/selection still synchronizes through backend-owned `DocView`.
- `StatusBar` remains presentational, typed, and independent of generated bindings; only `logic/adapter/` may import `wailsjs/`.
- `frontend/src/i18n/` is dependency-free and uses Vite eager glob discovery for bundled JSON; missing active-locale values fall back to `en`, then the key, never a blank label. Jest maps component imports to a test-only English shim because Jest does not evaluate Vite's `import.meta.glob` transform.
- Status-bar labels use stable i18n keys and named interpolation; `formatNumber()` owns locale-sensitive word-count formatting. The language-picker UI and migration of existing literals remain deferred.
- `StatusBar` unit tests prove typed prop rendering only. Cursor wiring and backend-patch provenance are proven in a store-connected `EditorView` integration.
- Canonical backend wire values remain `utf-8` and `lf`; the UI alone formats `UTF-8` and `LF` labels.
- Backend commands retain Handler → Service → Repository layering and concrete `apperr.*Result` envelopes.
- Use CSS Modules and existing tokens only; do not introduce hardcoded colors, static inline styling, or a second layout.
- Phase 01 makes no network calls and adds no runtime assets, telemetry, or persistence path.

## Acceptance criteria

### STORY-016-AC-1
**Satisfies:** PH01-R13
Given typed initial props, `StatusBar` renders `Ln 1, Col 1`, `0 words`, `UTF-8`, `LF`, and `Split`.

### STORY-016-AC-2
**Satisfies:** PH01-R13
Monaco cursor changes wired through `EditorView` display one-based line and column values immediately while restorable synchronization remains STORY-019.

### STORY-016-AC-3
**Satisfies:** PH01-R13
A backend metadata patch reconciled through `EditorView` changes the word count without reading Monaco content or storing content in Redux.

### STORY-016-AC-4
**Satisfies:** PH01-R13
A reconciled backend view patch updates the arrangement label through the store-connected `EditorView`.

### STORY-016-AC-5
**Satisfies:** PH01-R13
Before Phase 02 file I/O, canonical `utf-8`/`lf` wire values are formatted by the UI as the explicit `UTF-8`/`LF` untitled labels.

### STORY-016-AC-6
**Satisfies:** PH01-R16
`StatusBar` resolves cursor, word-count, encoding, line-ending, and arrangement labels through the typed i18n seam, including named interpolation and locale-aware number formatting.

## Test plan
Each Jest test name begins with its matching `STORY-016-AC-N` id.

- STORY-016-AC-1 — unit — `frontend/src/ui/components/StatusBar.test.tsx` — `it('STORY-016-AC-1 renders initial untitled metadata')`.
- STORY-016-AC-2 — integration — `frontend/src/ui/widgets/EditorView.integration.test.tsx` — `it('STORY-016-AC-2 displays live one-based cursor position')`.
- STORY-016-AC-3 — integration — `frontend/src/ui/widgets/EditorView.integration.test.tsx` — `it('STORY-016-AC-3 renders backend-derived word count')`.
- STORY-016-AC-4 — integration — `frontend/src/ui/widgets/EditorView.integration.test.tsx` — `it('STORY-016-AC-4 reflects backend view arrangement')`.
- STORY-016-AC-5 — integration — `frontend/src/ui/widgets/EditorView.integration.test.tsx` — `it('STORY-016-AC-5 formats Phase-01 wire metadata labels')`.
- STORY-016-AC-6 — unit — `frontend/src/i18n/catalog.test.ts` — `it('STORY-016-AC-6 interpolates status labels and formats word counts by active locale')`.
- EC-I18N-1 — unit — `frontend/src/i18n/catalog.test.ts` — `it('EC-I18N-1 falls back to English and then the key without a blank label')`.
- EC-I18N-2 — unit — `frontend/src/i18n/catalog.test.ts` — `it('EC-I18N-2 discovers a dropped-in locale resource without component changes')`.

## Definition of done
- [ ] Every acceptance criterion has a passing test whose Jest name begins with its `STORY-016-AC-N` id.
- [ ] Every edge case in `edge_cases:` has a passing test.
- [ ] StatusBar unit tests prove props only; catalog tests prove i18n interpolation, fallback, formatting, and resource discovery; store-connected EditorView tests prove live cursor wiring and backend-derived word/view/encoding/line-ending provenance without document content in Redux.
- [ ] UI formatting maps canonical `utf-8`/`lf` to `UTF-8`/`LF`, and Markdown-standard labeling remains deferred to Phase 04.
- [ ] The dependency-free i18n seam eagerly discovers bundled locale JSON, exposes typed `t()`/`setLocale()`/`availableLocales`, interpolates named values, formats numbers by locale, and falls back to English/the key without a blank label.
- [ ] StatusBar's own labels route through `t()`; global literal migration and Language settings UI remain deferred.
- [ ] Frontend `prettier --check`, ESLint, `tsc --noEmit`, and Jest pass; backend quality gates pass if backend/generated files are touched.
- [ ] Generated bindings remain current with no unexpected drift.
- [ ] Handler → Service → Repository layering, Result envelopes, backend authority, adapter-only Wails imports, and token-only theming remain intact.
- [ ] `just trace` regenerates the record and `just trace-check` passes with zero orphans and a fresh record.
- [ ] The module inventory is unchanged, or changes are reflected in `01_MODULE_INVENTORY.md` in the same story.
- [ ] The status bar matches the applicable Phase-01 mockup structure, and no background/unsolicited network call, telemetry, remote runtime asset, file-I/O behavior, or premature persistence is introduced.
