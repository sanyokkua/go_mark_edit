---
id: STORY-002
title: Implement the apperr envelope and Wails-bindable result contracts
status: done
spec_clauses:
  - ../../../_archive-2026-07-28-specification/02_Architecture/06_ERROR_HANDLING.md#error-codes
  - ../../../_archive-2026-07-28-specification/02_Architecture/06_ERROR_HANDLING.md#wire
  - ../../../_archive-2026-07-28-specification/02_Architecture/06_ERROR_HANDLING.md#result-envelopes
  - ../../../_archive-2026-07-28-specification/02_Architecture/02_BACKEND_GO.md#error-envelope
  - ../../../_archive-2026-07-28-specification/02_Architecture/04_WAILS_INTEGRATION.md#bind-enumbind
phase_requirements:
  - PH00-R02
modules:
  - internal/apperr/
acceptance_criteria:
  - STORY-002-AC-1
  - STORY-002-AC-2
  - STORY-002-AC-3
edge_cases: []
depends_on:
  - STORY-001
adrs: []
phase: 00
owner: coder
estimate: M
---

> **Historical vocabulary — this story is not maintained.** The `AC-…`, `EC-…` and `DD-…` identifiers are the scheme of the pre-2026-07-28 specification; `spec_clauses` and `phase_requirements` point into `_archive-2026-07-28-specification/`, which is kept so a citation still resolves and is **not normative**. See `README.md`. If anything here disagrees with the code, the code is the truth.

# STORY-002 — Implement the apperr envelope and Wails-bindable result contracts

## Goal
Give every later Wails-bound vertical one safe, consistent error and result contract.

## In scope
- ErrorCode catalog, AppError, WireError, `ToWire`, Result envelopes, and EnumBind-ready values.

## Out of scope
- Feature handlers and frontend adapters, owned by STORIES-005 and -006.

## Spec inputs
- `../../../_archive-2026-07-28-specification/02_Architecture/06_ERROR_HANDLING.md#wire` — serialize curated errors only.
- `../../../_archive-2026-07-28-specification/02_Architecture/06_ERROR_HANDLING.md#result-envelopes` — use concrete data-or-error envelopes.

## Design constraints
- `internal/apperr` is a bottom-of-graph package; it imports no internal package and never serializes causes.
- Bound handlers later return only its concrete Result types and recover panics as `CodeInternal`.

## Acceptance criteria
### STORY-002-AC-1
**Satisfies:** PH00-R02
Every defined ErrorCode and Result envelope is serializable and suitable for Wails `EnumBind`.

### STORY-002-AC-2
**Satisfies:** PH00-R02
`ToWire` preserves a classified safe code and message while never serializing the underlying cause.

### STORY-002-AC-3
**Satisfies:** PH00-R02
`internal/apperr` imports no other internal package.

## Test plan
Each named test begins with its matching `Proves: STORY-002-AC-N` tag.

- STORY-002-AC-1 — unit — `internal/apperr/results_test.go` — `TestResultEnvelopesExposeOnlyContractFields`.
- STORY-002-AC-2 — unit — `internal/apperr/wire_test.go` — `TestToWireSanitizesCauseAndPreservesClassification`.
- STORY-002-AC-3 — architecture — `internal/apperr/architecture_test.go` — `TestApperrHasNoInternalDependencies`.

## Definition of done
- [ ] Each proving test carries its `Proves: STORY-002-AC-N` tag.
- [ ] Go checks and generated bindings are clean.
- [ ] Traceability is regenerated and validated before `done`.
