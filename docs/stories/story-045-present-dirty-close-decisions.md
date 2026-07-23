---
id: STORY-045
title: Present dirty-close decisions without partial mutation
status: draft
spec_clauses:
  - 01_Product/03_FILES_TABS_WORKSPACE.md#dirty-state
  - 07_Phases/PHASE_02_FILE_IO_TABS.md#state-and-transition-model
  - 07_Phases/PHASE_02_FILE_IO_TABS.md#edge-and-failure-cases
  - mockups/README.md#role-in-the-spec
phase_requirements:
  - PH02-R06
  - PH02-R07
  - PH02-R09
modules:
  - logic/adapter/
  - ui/widgets/
  - i18n/
acceptance_criteria:
  - STORY-045-AC-1
  - STORY-045-AC-2
  - STORY-045-AC-3
  - STORY-045-AC-4
  - STORY-045-AC-5
edge_cases:
  - EC-DOCS-5
  - EC-TABS-3
depends_on:
  - STORY-039
  - STORY-041
  - STORY-043
  - STORY-044
adrs:
  - ADR-0024
phase: 02
owner: coder
estimate: M
---

# STORY-045 — Present dirty-close decisions without partial mutation

## Goal

Collect clear Save/Discard choices for every dirty document and submit them as one backend decision while
keeping all tabs recoverable on cancel, conflict, or failure.

## In scope

- Present single- and multi-document close plans.
- Gather a complete choice set before execution.
- Reconcile stale, failed, and successful close results.

## Out of scope

- Backend close execution, owned by STORY-044.
- Native window/quit interception, owned by STORY-046.
- General external prompt behavior, owned by STORY-043.

## Spec inputs

- `01_Product/03_FILES_TABS_WORKSPACE.md#dirty-state` — expose Save, Discard, Cancel with no content loss.
- `07_Phases/PHASE_02_FILE_IO_TABS.md#state-and-transition-model` — preserve PH02-T06 ordering.
- `07_Phases/PHASE_02_FILE_IO_TABS.md#edge-and-failure-cases` — prove dirty tab and application close.
- `mockups/README.md#role-in-the-spec` — use the frozen dialog visual language.

## Design constraints

- Choices remain ephemeral UI state until one complete command is submitted.
- Cancel never calls execute; stale plans fetch a new plan rather than replay choices.
- Any partial save failure also invalidates the displayed plan because earlier successful saves changed
  document revisions; retry starts from a fresh plan and freshly gathered choices/normalization decisions.
- External conflict prompts resolve before the affected close-save continues.
- Components call adapters only, strings are localized, and styling is token-only.
- Preserve backend authority, DD-62–64, ADR-0014/0020, Result envelopes, and offline behavior.

## Acceptance criteria

### STORY-045-AC-1
**Satisfies:** PH02-R06, PH02-R07

Single- and multi-document prompts list every dirty file in backend order and require Save or Discard for
each before execution is enabled. (satisfies EC-DOCS-5 and EC-TABS-3)

### STORY-045-AC-2
**Satisfies:** PH02-R07

Cancel closes the prompt and invokes no save, discard, or close command.

### STORY-045-AC-3
**Satisfies:** PH02-R06, PH02-R07

A stale-plan result fetches and displays the new backend plan and does not apply choices to a changed target
set.

### STORY-045-AC-4
**Satisfies:** PH02-R07, PH02-R09

A save or external-conflict failure leaves every tab rendered and reports the affected file; before retry,
the UI fetches a fresh backend plan and gathers new choices/normalization confirmations rather than reusing
the old revision-bound plan or choices.

### STORY-045-AC-5
**Satisfies:** PH02-R06, PH02-R07

A successful execution reconciles the backend-selected active tab or zero-document state and restores focus
to a reachable control.

## Test plan

- STORY-045-AC-1 — integration — `frontend/src/ui/widgets/ClosePrompt.test.tsx` —
  `it('STORY-045-AC-1 gathers every dirty choice (EC-DOCS-5 EC-TABS-3)')`.
- STORY-045-AC-2 — integration — `frontend/src/ui/widgets/ClosePrompt.test.tsx` —
  `it('STORY-045-AC-2 cancel is non-mutating')`.
- STORY-045-AC-3 — integration — `frontend/src/ui/widgets/ClosePrompt.test.tsx` —
  `it('STORY-045-AC-3 refreshes a stale close plan')`.
- STORY-045-AC-4 — integration — `frontend/src/ui/widgets/ClosePrompt.test.tsx` —
  `it('STORY-045-AC-4 partial save failure requires a fresh plan and choices')`.
- STORY-045-AC-5 — integration — `frontend/src/ui/widgets/ClosePrompt.test.tsx` —
  `it('STORY-045-AC-5 reconciles successful close and focus')`.

## Definition of done

- [ ] Every AC and edge has passing explicit evidence.
- [ ] Tests prove gather-before-execute, no Cancel call, stale refresh, save failure, and external conflict.
- [ ] Dialog roles, names, focus trap/restore, and localized labels are tested.
- [ ] No optimistic tab removal occurs.
- [ ] Frontend quality/UI gates pass.
- [ ] Authority, adapter-only imports, tokens, envelopes, and offline behavior hold.
- [ ] `just trace` and `just trace-check` pass.
- [ ] The module inventory is unchanged.
