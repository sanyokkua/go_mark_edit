---
id: STORY-046
title: Intercept window close and quit through the dirty lifecycle
status: draft
spec_clauses:
  - 01_Product/03_FILES_TABS_WORKSPACE.md#dirty-state
  - 02_Architecture/04_WAILS_INTEGRATION.md#lifecycle
  - 07_Phases/PHASE_02_FILE_IO_TABS.md#state-and-transition-model
  - 07_Phases/PHASE_02_FILE_IO_TABS.md#cross-phase-contracts
phase_requirements:
  - PH02-R06
  - PH02-R07
  - PH02-R09
modules:
  - internal/application/
  - logic/adapter/
acceptance_criteria:
  - STORY-046-AC-1
  - STORY-046-AC-2
  - STORY-046-AC-3
  - STORY-046-AC-4
edge_cases:
  - EC-DOCS-5
depends_on:
  - STORY-045
adrs:
  - ADR-0004
  - ADR-0024
phase: 02
owner: coder
estimate: M
---

# STORY-046 — Intercept window close and quit through the dirty lifecycle

## Goal

Route native window close and explicit quit through the same recoverable dirty-document decision as tab
closure without recursive prompts or premature shutdown.

## In scope

- Intercept Wails close while dirty resolution is pending.
- Start the shared close-plan UI flow for native close and quit.
- Add a one-use bypass for the final approved runtime quit.

## Out of scope

- Backend close planning/execution, owned by STORY-044.
- Prompt rendering, owned by STORY-045.
- Platform file associations, owned by Phase 07.

## Spec inputs

- `01_Product/03_FILES_TABS_WORKSPACE.md#dirty-state` — keep Save/Discard/Cancel consistent at app close.
- `02_Architecture/04_WAILS_INTEGRATION.md#lifecycle` — integrate startup/shutdown and native window events.
- `07_Phases/PHASE_02_FILE_IO_TABS.md#state-and-transition-model` — apply PH02-T06 to window close.
- `07_Phases/PHASE_02_FILE_IO_TABS.md#cross-phase-contracts` — preserve the dirty lifecycle for Phase 07.

## Design constraints

- Wails `OnBeforeClose` prevents the first close while resolution is required; final quit uses one explicit
  bypass and cannot recursively reopen the prompt.
- Window close and explicit quit invoke the same typed adapter flow and backend plan as tab closure.
- Concrete Wails lifecycle wiring remains in `internal/application` plus `main.go`; handlers use concrete
  Result envelopes and no bound context. `main.go` is a composition-root artifact, not a separate module.
- Only `logic/adapter/` imports Wails runtime; UI uses adapter functions.
- Preserve DD-32, DD-62–64, ADR-0014/0020, token-only styling, i18n, and offline behavior.

## Acceptance criteria

### STORY-046-AC-1
**Satisfies:** PH02-R06, PH02-R07, PH02-R09

**Given** a dirty close plan is required, **when** Wails invokes `OnBeforeClose`, **then** native shutdown is
prevented and the shared close lifecycle starts once. (satisfies EC-DOCS-5)

### STORY-046-AC-2
**Satisfies:** PH02-R06, PH02-R07

Native window close and explicit quit obtain and execute the same backend close-plan contract as a
multi-document tab close.

### STORY-046-AC-3
**Satisfies:** PH02-R06, PH02-R07

After successful close execution, one bypass authorizes `runtime.Quit`; the resulting close callback consumes
the bypass and does not present another prompt.

### STORY-046-AC-4
**Satisfies:** PH02-R06, PH02-R07, PH02-R09

Cancel, stale plan, save failure, external conflict failure, or presentation failure leaves the window open,
clears no dirty content, and permits a later close attempt.

## Test plan

- STORY-046-AC-1 — integration — `main_test.go` —
  `TestSTORY046AC1BeforeCloseStartsDirtyLifecycle_EC_DOCS_5`.
- STORY-046-AC-2 — integration — `internal/application/application_test.go` —
  `TestSTORY046AC2WindowAndQuitShareClosePlan`.
- STORY-046-AC-3 — integration — `main_test.go` —
  `TestSTORY046AC3QuitBypassIsSingleUse`.
- STORY-046-AC-4 — integration — `frontend/src/logic/adapter/appLifecycleAdapter.test.ts` —
  `it('STORY-046-AC-4 close failures leave the native window usable')`.

## Definition of done

- [ ] Every AC and edge has passing explicit evidence.
- [ ] Tests cover callback re-entry, repeated close gestures, cancellation, and all failure classes.
- [ ] Only adapter code imports Wails runtime; lifecycle wiring stays in the composition root.
- [ ] Bound changes regenerate drift-free bindings.
- [ ] Backend/frontend quality and applicable Wails integration gates pass.
- [ ] Authority, envelopes, tokens, and offline invariants hold.
- [ ] `just trace` and `just trace-check` pass.
- [ ] The module inventory is unchanged.
