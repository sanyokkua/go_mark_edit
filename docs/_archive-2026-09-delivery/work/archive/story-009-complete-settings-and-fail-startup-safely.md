---
id: STORY-009
title: Complete Stage-1 settings and fail startup safely
status: done
spec_clauses:
  - ../../../_archive-2026-07-28-specification/01_Product/11_SETTINGS.md#appearance-group
  - ../../../_archive-2026-07-28-specification/01_Product/11_SETTINGS.md#markdown-group
  - ../../../_archive-2026-07-28-specification/01_Product/11_SETTINGS.md#content-privacy-group
  - ../../../_archive-2026-07-28-specification/01_Product/11_SETTINGS.md#persistence
  - ../../../_archive-2026-07-28-specification/01_Product/11_SETTINGS.md#defaults
  - ../../../_archive-2026-07-28-specification/01_Product/11_SETTINGS.md#edge-cases
  - ../../../_archive-2026-07-28-specification/01_Product/10_THEMING.md#no-custom-themes
  - ../../../_archive-2026-07-28-specification/01_Product/10_THEMING.md#edge-cases
  - ../../../_archive-2026-07-28-specification/01_Product/04_MARKDOWN_STANDARDS.md#standard-setting
  - ../../../_archive-2026-07-28-specification/01_Product/06_FORMAT_AND_LINT.md#on-save
  - ../../../_archive-2026-07-28-specification/01_Product/06_FORMAT_AND_LINT.md#canonical-style
  - ../../../_archive-2026-07-28-specification/02_Architecture/05_STATE_AND_PERSISTENCE.md#kv-schema
  - ../../../_archive-2026-07-28-specification/02_Architecture/02_BACKEND_GO.md#layering
  - ../../../_archive-2026-07-28-specification/02_Architecture/02_BACKEND_GO.md#error-envelope
  - ../../../_archive-2026-07-28-specification/02_Architecture/02_BACKEND_GO.md#di-two-phase
  - ../../../_archive-2026-07-28-specification/02_Architecture/04_WAILS_INTEGRATION.md#lifecycle
  - ../../../_archive-2026-07-28-specification/00_Foundation/06_IMPLEMENTATION_STAGES.md#stage-1-must-leave-open
phase_requirements:
  - PH00-R03
  - PH00-R05
modules:
  - internal/settings/
  - internal/apperr/
  - internal/application/
acceptance_criteria:
  - STORY-009-AC-1
  - STORY-009-AC-2
  - STORY-009-AC-3
  - STORY-009-AC-4
  - STORY-009-AC-5
  - STORY-009-AC-6
edge_cases:
  - EC-THEME-3
  - EC-SET-2
depends_on:
  - STORY-005
adrs:
  - ADR-0004
  - ADR-0006
phase: 00
owner: coder
estimate: M
---

> **Historical vocabulary — this story is not maintained.** The `AC-…`, `EC-…` and `DD-…` identifiers are the scheme of the pre-2026-07-28 specification; `spec_clauses` and `phase_requirements` point into `_archive-2026-07-28-specification/`, which is kept so a citation still resolves and is **not normative**. See `README.md`. If anything here disagrees with the code, the code is the truth.

# STORY-009 — Complete Stage-1 settings and fail startup safely

## Goal

Finish the Stage-1 settings contract so every required Appearance and Markdown preference has a safe typed default and durable validation, while an unrecoverable initialization failure is shown to the user and terminates the application instead of leaving a partially wired process running.

## In scope

- Complete the typed Appearance group with Theme, Color mode, and Default open mode, defaulting to Material, Auto, and Editor.
- Complete the typed Markdown group with Standard, Format on save, Lint on save, Bullet marker, Emphasis marker, and Heading style, defaulting to GFM, Off, On, `-`, `_`, and ATX.
- Persist every group member through the existing generic `settings(key, value, type)` table, using stable dotted keys and correct string/bool type metadata; validate all caller-supplied updates before writing.
- Normalize missing rows, malformed encoded values, mismatched type metadata, and unsupported enum values to the documented scalar defaults.
- Preserve the Content privacy default of Ask and prove that a future typed scalar/group can extend the registry without changing the database schema.
- Make `ApplicationContextHolder.Init(ctx)` failure show a native Wails error dialog and terminate with a non-zero status through a safely injectable execution seam, before any code can use an unopened database or nil repository.

## Out of scope

- Settings dialog/menu UI, token definitions, and live theme application; this story completes the backend registry only.
- Applying Default open mode to OS associations, drag-and-drop, workspace-tree opens, or the Open dialog; those open flows consume this setting in their owning phase stories.
- Running Format or Lint during save and implementing the formatter/linter themselves; this story stores and validates their settings only.
- Changing Content privacy behavior, the remote-content policy, or the offline policy beyond preserving the existing Ask setting.
- A database migration, a new settings table, or changes to sqlc-generated `internal/db/store/`.
- Any new architecture decision; ADR-0004 and ADR-0006 already settle the persistence and multi-instance model.

## Spec inputs

- `../../../_archive-2026-07-28-specification/01_Product/11_SETTINGS.md#appearance-group` — expose Theme, Color mode, and Default open mode with the specified value sets.
- `../../../_archive-2026-07-28-specification/01_Product/11_SETTINGS.md#markdown-group` — expose Standard, Format on save, Lint on save, Bullet marker, Emphasis, and Heading style with the specified value sets.
- `../../../_archive-2026-07-28-specification/01_Product/11_SETTINGS.md#content-privacy-group` — retain Ask/Allow/Block as the typed external-content policy group without adding adjustable network or telemetry settings.
- `../../../_archive-2026-07-28-specification/01_Product/11_SETTINGS.md#persistence` — use the generic typed SQLite KV table, with no migration for new scalar preferences, under the multi-instance WAL policy.
- `../../../_archive-2026-07-28-specification/01_Product/11_SETTINGS.md#defaults` — apply the exact Stage-1 defaults for Appearance, Markdown, and Content privacy.
- `../../../_archive-2026-07-28-specification/01_Product/11_SETTINGS.md#edge-cases` — use safe scalar defaults or a hard startup failure for corrupt/newer persisted state (EC-SET-2).
- `../../../_archive-2026-07-28-specification/01_Product/10_THEMING.md#no-custom-themes` and `../../../_archive-2026-07-28-specification/01_Product/10_THEMING.md#edge-cases` — restrict Theme and Color mode to the shipped values and fall back to Material/Auto for invalid or missing persisted values (EC-THEME-3).
- `../../../_archive-2026-07-28-specification/01_Product/04_MARKDOWN_STANDARDS.md#standard-setting` — default the persisted Markdown standard to GFM.
- `../../../_archive-2026-07-28-specification/01_Product/06_FORMAT_AND_LINT.md#on-save` — default Format on save to Off and Lint on save to On.
- `../../../_archive-2026-07-28-specification/01_Product/06_FORMAT_AND_LINT.md#canonical-style` — default the formatting/lint style to bullet `-`, emphasis `_`, and ATX headings.
- `../../../_archive-2026-07-28-specification/02_Architecture/05_STATE_AND_PERSISTENCE.md#kv-schema` — use typed accessors over dotted keys in the existing `settings(key,value,type)` schema.
- `../../../_archive-2026-07-28-specification/02_Architecture/02_BACKEND_GO.md#layering`, `../../../_archive-2026-07-28-specification/02_Architecture/02_BACKEND_GO.md#error-envelope`, and `../../../_archive-2026-07-28-specification/02_Architecture/02_BACKEND_GO.md#di-two-phase` — keep settings in Handler → Service → Repository form, return concrete envelopes at the bridge, and inject persistence only after the database opens.
- `../../../_archive-2026-07-28-specification/02_Architecture/04_WAILS_INTEGRATION.md#lifecycle` — on `Init(ctx)` failure, show `runtime.MessageDialog` and exit non-zero instead of continuing startup.
- `../../../_archive-2026-07-28-specification/00_Foundation/06_IMPLEMENTATION_STAGES.md#stage-1-must-leave-open` — satisfy F4 with complete Stage-1 Appearance/Markdown/Content groups and registry growth without schema rewrites.

## Design constraints

- Preserve Handler → Service → Repository layering. Bound settings methods take no `context.Context`, recover panics to `CodeInternal`, and return concrete `apperr.*Result` envelopes; services keep `(T, error)` and own validation; only the repository touches SQLite (DD-03, DD-10; ADR-0004).
- Treat type metadata as part of the persisted contract: enum/style values use `type=string`, on-save toggles use `type=bool`, and a missing, undecodable, wrong-type, or unsupported scalar resolves independently to its documented default. Caller updates with unsupported values return `CodeValidation` and do not partially persist a group.
- Use the documented dotted keys `appearance.theme`, `appearance.mode`, `view.defaultOpenMode`, `markdown.standard`, `format.onSave`, `lint.onSave`, and `content.remotePolicy`; keep the three canonical-style preferences as stable dotted keys under the existing `format.*` namespace. No table or migration is added (DD-10, DD-14, DD-18, DD-27–DD-29; ADR-0004).
- Keep two-phase DI in `internal/application` plus its `main.go` composition-root entry point: nil repositories are valid only before `Init(ctx)`; a failed database open or repository injection is terminal. Do not continue into post-init actions or invoke a handler backed by nil persistence (DD-08, DD-13; ADR-0006).
- Put the fatal-startup path behind a test seam for the dialog and process-exit boundary (for example injected functions or an equivalent unexported runner). Production must call Wails `runtime.MessageDialog` with `runtime.ErrorDialog` and exit non-zero; tests must not terminate the test process. This seam must not add more than one public API symbol.
- The Go backend remains authoritative for live application state; later Redux state is only a `GetState`/`state:patch`-reconciled projection, and Monaco remains a debounce-synced buffer that is never echoed into the focused editor (DD-62/DD-63/DD-64, ADR-0014). This story adds no frontend source of truth.
- Frontend code remains out of scope; any later bridge use must go through `logic/adapter/`, the only layer allowed to import `wailsjs/`. If a bound DTO/signature changes, regenerate bindings without hand-editing generated files.
- Theme values drive the existing token-only `data-theme` × `data-mode` system; do not add CSS, hardcoded colors, a second layout, or custom themes (DD-28–DD-30, ADR-0005).
- Preserve the offline invariant: no background/unsolicited network, telemetry, auto-update, or runtime CDN asset path is introduced. Stage 1 makes no network calls (DD-32–DD-34, F6, ADR-0011).

## Acceptance criteria

### STORY-009-AC-1

**Satisfies:** PH00-R05
**Given** an empty settings KV store, **when** the complete typed registry is read, **then** Appearance is exactly Theme `material`, Color mode `auto`, Default open mode `editor`; Markdown is exactly Standard `gfm`, Format on save `false`, Lint on save `true`, Bullet marker `-`, Emphasis marker `_`, Heading style `atx`; and Content privacy remains Remote policy `ask`.

### STORY-009-AC-2

**Satisfies:** PH00-R05
**Given** a valid non-default value for every Appearance and Markdown member, **when** a caller updates both groups and reads them back, **then** every value round-trips through its stable dotted KV key with `string` metadata for enum/style values and `bool` metadata for toggles, while the unchanged Content privacy value remains `ask`.

### STORY-009-AC-3

**Satisfies:** PH00-R05
An Appearance or Markdown group update containing any unsupported enum/style value is rejected through the settings handler with an `apperr` envelope whose error code is `CodeValidation`, and no member of that group is written or changed.

### STORY-009-AC-4

**Satisfies:** PH00-R05
**Given** table-driven persisted settings containing, per scalar, a missing row, malformed bool encoding, mismatched type metadata, or an unsupported enum/style value, **when** the registry is read, **then** each affected scalar falls back to its documented default while valid sibling scalars are preserved. This satisfies EC-THEME-3 and the safe-default branch of EC-SET-2.

### STORY-009-AC-5

**Satisfies:** PH00-R05
**Given** the existing settings database, **when** a representative future typed scalar/group is registered and round-tripped through the generic KV accessors, **then** it requires no schema migration and does not change the existing Appearance, Markdown, or Content privacy values. This proves the F4 growth seam.

### STORY-009-AC-6

**Satisfies:** PH00-R03
**Given** `ApplicationContextHolder.Init(ctx)` returns an unrecoverable startup error, **when** the Wails startup callback runs, **then** it invokes `runtime.MessageDialog` as an error dialog, terminates through the execution seam with a non-zero status, and performs no post-init action or settings call against an unopened database/nil repository. This satisfies the hard-startup-error branch of EC-SET-2.

## Test plan

Each named test begins with its matching `Proves: STORY-009-AC-N` tag on the first leading-comment line.

- STORY-009-AC-1 — integration — `internal/settings/repository_sqlite_test.go` — `TestCompleteStageOneDefaultsFromEmptyKV`.
- STORY-009-AC-2 — integration — `internal/settings/repository_sqlite_test.go` — `TestAppearanceAndMarkdownGroupsRoundTripDottedTypedKV`.
- STORY-009-AC-3 — unit — `internal/settings/handler_test.go` — `TestSettingsHandlerRejectsUnsupportedGroupUpdatesWithoutWriting`.
- STORY-009-AC-4 — integration — `internal/settings/repository_sqlite_test.go` — `TestStoredSettingsFallbackMatrix` (EC-THEME-3, EC-SET-2 safe-default branch).
- STORY-009-AC-5 — integration — `internal/settings/repository_sqlite_test.go` — `TestSettingsRegistryAddsTypedScalarWithoutSchemaChange`.
- STORY-009-AC-6 — integration — `main_test.go` — `TestStartupInitFailureShowsDialogAndReturnsNonZero` (EC-SET-2 hard-startup-error branch).

## Definition of done

- [ ] Every acceptance criterion has a passing test whose first leading-comment line names its `STORY-009-AC-N` id.
- [ ] EC-THEME-3 and both safe-default/hard-startup-error branches used for EC-SET-2 have passing named tests.
- [ ] Backend `gofmt`, `go vet`, `golangci-lint`, and `go test -race ./...` pass for touched packages.
- [ ] Frontend generated-binding checks, `prettier --check`, `eslint`, `tsc --noEmit`, and Jest pass if the expanded bound settings DTO changes generated TypeScript.
- [ ] Wails bindings are regenerated if the bound settings DTO/signature changes, with no unexpected generated drift.
- [ ] `just trace` is regenerated and `just trace-check` passes with no orphan clause, AC, edge case, or proving test.
- [ ] The module inventory and SQLite schema are unchanged; no existing migration or sqlc-generated file is hand-edited.
- [ ] Handler/service/repository layering, two-phase DI, Result envelopes, backend-authoritative state, adapter-only Wails imports, token-only theming, and the offline invariant remain intact.
