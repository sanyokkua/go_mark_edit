---
id: STORY-005
title: Expose the typed settings registry and wire the two-phase application root
status: done
spec_clauses:
  - ../../../_archive-2026-07-28-specification/02_Architecture/02_BACKEND_GO.md#layering
  - ../../../_archive-2026-07-28-specification/02_Architecture/02_BACKEND_GO.md#di-two-phase
  - ../../../_archive-2026-07-28-specification/02_Architecture/05_STATE_AND_PERSISTENCE.md#kv-schema
  - ../../../_archive-2026-07-28-specification/01_Product/11_SETTINGS.md#persistence
  - ../../../_archive-2026-07-28-specification/01_Product/11_SETTINGS.md#appearance-group
  - ../../../_archive-2026-07-28-specification/01_Product/11_SETTINGS.md#markdown-group
  - ../../../_archive-2026-07-28-specification/01_Product/11_SETTINGS.md#content-privacy-group
  - ../../../_archive-2026-07-28-specification/00_Foundation/06_IMPLEMENTATION_STAGES.md#3-forward-compatibility-constraints-per-stage
phase_requirements:
  - PH00-R02
  - PH00-R03
  - PH00-R05
modules:
  - internal/settings/
  - internal/db/
  - internal/apperr/
  - internal/application/
acceptance_criteria:
  - STORY-005-AC-1
  - STORY-005-AC-2
  - STORY-005-AC-3
  - STORY-005-AC-4
edge_cases: []
depends_on:
  - STORY-004
adrs:
  - ADR-0004
  - ADR-0006
phase: 00
owner: coder
estimate: L
---

> **Historical vocabulary — this story is not maintained.** The `AC-…`, `EC-…` and `DD-…` identifiers are the scheme of the pre-2026-07-28 specification; `spec_clauses` and `phase_requirements` point into `_archive-2026-07-28-specification/`, which is kept so a citation still resolves and is **not normative**. See `README.md`. If anything here disagrees with the code, the code is the truth.

# STORY-005 — Expose the typed settings registry and wire the two-phase application root

## Goal
Make the first complete backend vertical prove the envelope, repository layering, growable settings registry, and post-DB wiring model.

## In scope
- Settings Handler/Service/Repository, grouped typed defaults, and `ApplicationContextHolder` construction plus post-open repository injection.

## Out of scope
- Settings UI and theme values, owned by Phase 08; AI groups and providers, owned by Stage 3.

## Spec inputs
- `../../../_archive-2026-07-28-specification/02_Architecture/02_BACKEND_GO.md#di-two-phase` — construct with nil repositories and inject them in `Init(ctx)`.
- `../../../_archive-2026-07-28-specification/01_Product/11_SETTINGS.md#persistence` — use generic typed KV persistence.
- `../../../_archive-2026-07-28-specification/00_Foundation/06_IMPLEMENTATION_STAGES.md#3-forward-compatibility-constraints-per-stage` — establish F4 without a schema rewrite.

## Design constraints
- Enforce Handler → Service → Repository; handlers take no context, return `apperr.*Result`, and recover panics.
- Keep the backend authoritative; frontend use arrives only through STORY-006 adapters. Persist scalar settings by grouped keys, not new tables.

## Acceptance criteria
### STORY-005-AC-1
**Satisfies:** PH00-R02, PH00-R05
The settings Handler, Service, and Repository return concrete `apperr` results at the bridge, accept no handler context, recover panics, and own repository interfaces in the settings package.

### STORY-005-AC-2
**Satisfies:** PH00-R05
Grouped typed defaults persist through generic KV for Appearance (Material/Auto), Markdown (GFM), and Content privacy (Ask), without a schema change for later scalar keys.

### STORY-005-AC-3
**Satisfies:** PH00-R05
Invalid or missing scalar values resolve to their documented defaults rather than preventing startup.

### STORY-005-AC-4
**Satisfies:** PH00-R03, PH00-R05
`ApplicationContextHolder` constructs settings with nil persistence, injects the real SQLite repository in `Init(ctx)` after database open, binds the handler, and regenerates bindings.

## Test plan
Each named test begins with its matching `Proves: STORY-005-AC-N` tag.

- STORY-005-AC-1 — unit — `internal/settings/handler_test.go` — `TestSettingsHandlerReturnsRecoveredResultEnvelope`.
- STORY-005-AC-2 — integration — `internal/settings/repository_sqlite_test.go` — `TestTypedGroupedDefaultsRoundTripThroughKV`.
- STORY-005-AC-3 — unit — `internal/settings/service_test.go` — `TestInvalidOrMissingSettingFallsBackToDefault`.
- STORY-005-AC-4 — integration — `internal/application/application_test.go` — `TestApplicationContextInitializesSettingsInTwoPhases`.

## Definition of done
- [ ] Every AC has a tagged proving test and bound signatures have regenerated bindings.
- [ ] Repository wiring exists only in the composition root.
- [ ] Traceability is regenerated and validated before `done`.
