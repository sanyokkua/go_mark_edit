---
id: STORY-001
title: Scaffold the Wails v2 app and embedded React frontend so a blank window boots
status: done
spec_clauses:
  - ../../../_archive-2026-07-28-specification/02_Architecture/01_SYSTEM_ARCHITECTURE.md#process-model
  - ../../../_archive-2026-07-28-specification/02_Architecture/01_SYSTEM_ARCHITECTURE.md#layer-boundaries
  - ../../../_archive-2026-07-28-specification/02_Architecture/04_WAILS_INTEGRATION.md#embed
  - ../../../_archive-2026-07-28-specification/00_Foundation/04_DESIGN_DECISIONS.md#1-platform--framework
  - ../../../_archive-2026-07-28-specification/05_Dependencies/01_GO_DEPENDENCIES.md#1-runtime-dependencies
  - ../../../_archive-2026-07-28-specification/05_Dependencies/01_GO_DEPENDENCIES.md#5-go-version
phase_requirements:
  - PH00-R01
modules:
  - internal/application/
  - ui/styles/
  - ui/widgets/
acceptance_criteria:
  - STORY-001-AC-1
  - STORY-001-AC-2
  - STORY-001-AC-3
edge_cases: []
depends_on: []
adrs:
  - ADR-0001
phase: 00
owner: coder
estimate: M
---

> **Historical vocabulary — this story is not maintained.** The `AC-…`, `EC-…` and `DD-…` identifiers are the scheme of the pre-2026-07-28 specification; `spec_clauses` and `phase_requirements` point into `_archive-2026-07-28-specification/`, which is kept so a citation still resolves and is **not normative**. See `README.md`. If anything here disagrees with the code, the code is the truth.

# STORY-001 — Scaffold the Wails v2 app and embedded React frontend so a blank window boots

## Goal

Provide a real, empty desktop application that later Phase 00 verticals can compose into without adding Markdown or file behaviour.

## In scope

- CGO-free Go module, Wails v2 application options, composition-root placeholder, embedded frontend build output, and React/Vite blank root.

## Out of scope

- Error envelopes (STORY-002), runtime services, settings, and all document behaviour.

## Spec inputs

- `../../../_archive-2026-07-28-specification/02_Architecture/04_WAILS_INTEGRATION.md#embed` — embed `frontend/dist` in the native binary.
- `../../../_archive-2026-07-28-specification/00_Foundation/04_DESIGN_DECISIONS.md#1-platform--framework` — use Wails v2 and pure Go.

## Design constraints

- Keep concrete wiring in `internal/application` plus `main.go`; use no CGO, network call, telemetry, or auto-update.
- Apply ADR-0001; later frontend calls reach Go only through `logic/adapter`.

## Acceptance criteria

### STORY-001-AC-1

**Satisfies:** PH00-R01
The CGO-free Wails v2 application embeds `frontend/dist`, uses the composition-root seam, and boots a blank native window.

### STORY-001-AC-2

**Satisfies:** PH00-R01
The embedded React/Vite output renders an empty application root with no Markdown, document, or file behaviour.

### STORY-001-AC-3

**Satisfies:** PH00-R01
A production build does not enable CGO or substitute a runtime dependency outside the approved set.

## Test plan

Each named test begins with its matching `Proves: STORY-001-AC-N` tag.

- STORY-001-AC-1 — integration — `main_test.go` — `TestWailsAppEmbedsFrontendAndBootsBlankView`.
- STORY-001-AC-2 — unit — `frontend/src/App.test.tsx` — `it('STORY-001-AC-2 renders the blank application root')`.
- STORY-001-AC-3 — architecture — `main_test.go` — `TestBuildConfigurationRemainsCGOFree`.

## Definition of done

- [x] Every test begins with its required `Proves: STORY-001-AC-N` tag.
- [x] Go and frontend checks pass; `just gen` is run for bound signatures.
- [x] `just trace` and `just trace-check` pass before status becomes `done`.
