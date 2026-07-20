---
id: STORY-010
title: Restore Phase-00 toolchain integrity
status: done
spec_clauses:
  - 07_Phases/PHASE_00_SCAFFOLD.md#phase-exit-checklist
  - 04_Build_and_Release/03_CI_AND_HOOKS.md#1-justfile-command-taxonomy
  - 04_Build_and_Release/03_CI_AND_HOOKS.md#3-ordering-why-frontend-builds-before-go
  - 04_Build_and_Release/03_CI_AND_HOOKS.md#6-traceability-gate
  - 06_Process_and_Traceability/03_TRACEABILITY.md#the-two-commands
  - 06_Process_and_Traceability/06_DEFINITION_OF_DONE.md#per-story
modules:
  - internal/application/
acceptance_criteria:
  - STORY-010-AC-1
  - STORY-010-AC-2
  - STORY-010-AC-3
  - STORY-010-AC-4
edge_cases: []
depends_on:
  - STORY-008
  - STORY-009
adrs: []
phase: 00
owner: coder
estimate: M
---

# STORY-010 — Restore Phase-00 toolchain integrity

## Goal
Restore a reproducible Phase-00 quality gate so a clean checkout has current generated traceability and Wails bindings, and a single `just check` run verifies the foundation without accidentally coupling Go linting to frontend dependency resolution.

## In scope
- Regenerate and commit the current `docs/traceability.yaml` record through `just trace`; make its freshness a passing gate rather than a manual assumption.
- Commit the generated Wails TypeScript binding surface required by the existing bound API and make `just gen-check` fail on drift after generation.
- Repair the `just check` composition so it executes every applicable Phase-00 format, lint, type, test, architecture/drift, and traceability gate in the required generated-bindings → frontend → Go order.
- Scope the Go portion of `just lint` to the repository root and `internal/...`, independently of frontend package dependency resolution.

## Out of scope
- Changing a Wails-bound handler signature, application behavior, or frontend feature; this story validates the existing binding surface only.
- Hand-editing generated Wails output or `docs/traceability.yaml`; both are derived artifacts.
- New CI/release matrix, packaging, or product functionality outside the Phase-00 toolchain remediation.

## Spec inputs
- `07_Phases/PHASE_00_SCAFFOLD.md#phase-exit-checklist` — make the Phase-00 `just check` and `just trace-check` exit gates green for the current backlog.
- `04_Build_and_Release/03_CI_AND_HOOKS.md#1-justfile-command-taxonomy` — retain the canonical `just` commands, including generation, drift, traceability, and composite-check commands.
- `04_Build_and_Release/03_CI_AND_HOOKS.md#3-ordering-why-frontend-builds-before-go` — preserve the required generated-bindings → frontend → Go ordering on a clean checkout.
- `04_Build_and_Release/03_CI_AND_HOOKS.md#6-traceability-gate` — run the generated-record validator as a blocking gate with zero orphan references.
- `06_Process_and_Traceability/03_TRACEABILITY.md#the-two-commands` — regenerate rather than hand-edit the trace record and require its freshness.
- `06_Process_and_Traceability/06_DEFINITION_OF_DONE.md#per-story` — require binding drift checks and a fresh, zero-orphan traceability record before this story can be done.

## Design constraints
- This is tooling-only work: preserve Handler → Service → Repository layering, concrete `apperr.*Result` envelopes at Wails handlers, and the `internal/application` composition-root boundary; it introduces no handler, service, repository, or public API change.
- Preserve the backend-authoritative model: `internal/appmodel` remains the single source of truth, Redux remains a `state:patch`-reconciled projection, and Monaco remains a debounce-synced buffer (DD-62, DD-63, DD-64; ADR-0014). This remediation adds no frontend state path.
- Generated Wails bindings remain derived from Go and are imported only through `logic/adapter/`; no component or thunk may import `wailsjs/` directly. Generate before frontend checks, then run Go checks after the frontend build is available.
- Preserve token-only theming (`data-theme` × `data-mode`) and do not introduce frontend styling or hardcoded colors (DD-28, DD-29, DD-30; ADR-0005).
- Preserve the offline invariant: the application makes no background or unsolicited network call, uses bundled rendering assets, and adds no telemetry or auto-update path (DD-32, DD-33, DD-34; ADR-0011).
- `docs/traceability.yaml` is generated solely by `just trace`, never hand-edited, and `just trace-check` must reject an out-of-date record. No ADR is needed because the specification already settles these toolchain rules.

## Acceptance criteria

### STORY-010-AC-1
**Given** the committed stories and proving tests in the repository, **when** `just trace` is run followed by `just trace-check`, **then** the committed `docs/traceability.yaml` exactly matches the regenerated record and validation passes with zero orphan clause, module, edge-case, story, or test references.

### STORY-010-AC-2
**Given** the existing Wails-bound Go API on a clean checkout, **when** `just gen-check` is run, **then** all required `frontend/wailsjs/` bindings are tracked and generation leaves no diff in that directory.

### STORY-010-AC-3
**Given** a clean, set-up Phase-00 checkout, **when** `just check` is run, **then** it completes the Phase-00 format, Go and frontend lint, TypeScript typecheck, race-test, architecture/drift, and traceability gates successfully in generated-bindings → frontend → Go order where that ordering is required.

### STORY-010-AC-4
The Go-lint command invoked by `just lint` targets the repository-root Go package and `internal/...` packages, and it resolves no frontend package dependency while the frontend ESLint command remains a separate frontend step.

## Test plan
Each named test begins with its matching `Proves: STORY-010-AC-N` tag on the first leading-comment line.

- STORY-010-AC-1 — integration — `internal/application/traceability_test.go` — `TestTraceRecordIsFreshAndCommitted`.
- STORY-010-AC-2 — architecture — `internal/application/toolchain_test.go` — `TestWailsBindingsAreTrackedAndGenCheckIsClean`.
- STORY-010-AC-3 — architecture — `internal/application/toolchain_test.go` — `TestJustCheckRunsPhaseZeroGateSetInRequiredOrder`.
- STORY-010-AC-4 — architecture — `internal/application/toolchain_test.go` — `TestJustLintScopesGoToRootAndInternalWithoutFrontendResolution`.

## Definition of done
- [ ] Every acceptance criterion has a passing test whose first leading-comment line names its `STORY-010-AC-N` id.
- [ ] `just check` passes from a clean, set-up checkout and includes the intended Phase-00 gate set.
- [ ] Wails bindings are regenerated through `just gen-check`, tracked as required, and have no unexpected drift.
- [ ] `just trace` regenerates the committed record and `just trace-check` passes with zero orphans and a fresh record.
- [ ] The module inventory is unchanged, and no generated Wails artifact or traceability record is hand-edited.
- [ ] Handler → Service → Repository layering, Result envelopes, backend-authoritative state, adapter-only Wails imports, token-only theming, and the offline invariant remain intact.
