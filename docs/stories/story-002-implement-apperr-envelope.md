---
id: STORY-002
title: Implement the apperr envelope and Wails-bindable result contracts
status: ready
spec_clauses:
  - 02_Architecture/06_ERROR_HANDLING.md#error-codes
  - 02_Architecture/06_ERROR_HANDLING.md#wire
  - 02_Architecture/06_ERROR_HANDLING.md#result-envelopes
  - 02_Architecture/02_BACKEND_GO.md#error-envelope
  - 02_Architecture/04_WAILS_INTEGRATION.md#bind-enumbind
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

# STORY-002 — Implement the apperr envelope and Wails-bindable result contracts

## Goal
Give every later Wails-bound vertical one safe, consistent error and result contract.

## In scope
- ErrorCode catalog, AppError, WireError, `ToWire`, Result envelopes, and EnumBind-ready values.

## Out of scope
- Feature handlers and frontend adapters, owned by STORIES-005 and -006.

## Spec inputs
- `02_Architecture/06_ERROR_HANDLING.md#wire` — serialize curated errors only.
- `02_Architecture/06_ERROR_HANDLING.md#result-envelopes` — use concrete data-or-error envelopes.

## Design constraints
- `internal/apperr` is a bottom-of-graph package; it imports no internal package and never serializes causes.
- Bound handlers later return only its concrete Result types and recover panics as `CodeInternal`.

## Acceptance criteria
### STORY-002-AC-1
Every defined ErrorCode and Result envelope is serializable and suitable for Wails `EnumBind`.

### STORY-002-AC-2
`ToWire` preserves a classified safe code and message while never serializing the underlying cause.

### STORY-002-AC-3
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
