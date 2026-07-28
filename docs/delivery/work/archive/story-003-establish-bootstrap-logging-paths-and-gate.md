---
id: STORY-003
title: Establish bootstrap logging paths and the generic single-flight gate
status: done
spec_clauses:
  - 02_Architecture/02_BACKEND_GO.md#packages
  - 00_Foundation/06_IMPLEMENTATION_STAGES.md#3-forward-compatibility-constraints-per-stage
  - 00_Foundation/04_DESIGN_DECISIONS.md#10-non-functional--operations
phase_requirements:
  - PH00-R03
  - PH00-R07
  - PH00-R11
modules:
  - internal/bootstrap/
  - internal/logging/
  - internal/file/
  - internal/gate/
  - internal/application/
acceptance_criteria:
  - STORY-003-AC-1
  - STORY-003-AC-2
  - STORY-003-AC-3
  - STORY-003-AC-4
edge_cases: []
depends_on:
  - STORY-002
adrs:
  - ADR-0001
  - ADR-0006
phase: 00
owner: coder
estimate: L
---

# STORY-003 — Establish bootstrap logging paths and the generic single-flight gate

## Goal
Supply the local-only process primitives needed before database initialization and preserve the Stage 3 gate seam.

## In scope
- Pre-DB logger, rotating local logger, production/development path isolation, and a generic process-local gate.

## Out of scope
- Database opening (STORY-004) and DI of concrete feature repositories (STORY-005).

## Spec inputs
- `00_Foundation/06_IMPLEMENTATION_STAGES.md#3-forward-compatibility-constraints-per-stage` — reserve F5 and respect F6.
- `00_Foundation/04_DESIGN_DECISIONS.md#10-non-functional--operations` — keep logs local and omit telemetry.

## Design constraints
- No socket, telemetry, auto-update, or single-instance lock may be introduced.
- The gate is generic: a concurrent acquisition is rejected with `false`; a future handler maps that
  rejection to `apperr.Busy()`.

## Acceptance criteria
### STORY-003-AC-1
**Satisfies:** PH00-R03
Bootstrap logging is available before database initialization, and configured logging writes only to a local rotating sink.

### STORY-003-AC-2
**Satisfies:** PH00-R03
Development and production resolve distinct config and log paths named `GoMarkEdit-Dev` and `GoMarkEdit`.

### STORY-003-AC-3
**Satisfies:** PH00-R11
The generic gate admits one long operation and rejects a concurrent caller with `false`; a future
handler maps that rejection to the standard busy result.

### STORY-003-AC-4
**Satisfies:** PH00-R07, PH00-R11
No scaffold service creates a single-instance lock or makes an outbound network call.

## Test plan
Each named test begins with its matching `Proves: STORY-003-AC-N` tag.

- STORY-003-AC-1 — unit — `internal/bootstrap/bootstrap_test.go` — `TestBootstrapLoggerIsAvailableBeforeDatabaseOpen`.
- STORY-003-AC-1 — integration — `internal/logging/logger_test.go` — `TestConfiguredLoggerWritesLocalRotatingSink`.
- STORY-003-AC-2 — unit — `internal/file/paths_test.go` — `TestResolvePathsSeparatesDevelopmentFromProduction`.
- STORY-003-AC-3 — unit — `internal/gate/gate_test.go` — `TestGateRejectsConcurrentAcquisition`.
- STORY-003-AC-4 — architecture — `internal/application/architecture_test.go` — `TestScaffoldHasNoSingleInstanceOrNetworkPath`.

## Definition of done
- [ ] Proving tests name every AC.
- [ ] Logs remain local and no prohibited process/network mechanism exists.
- [ ] Traceability is regenerated and validated before `done`.
