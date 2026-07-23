---
id: STORY-049
title: Show autosave and document safety status
status: draft
spec_clauses:
  - 01_Product/03_FILES_TABS_WORKSPACE.md#autosave
  - 01_Product/03_FILES_TABS_WORKSPACE.md#encoding-and-line-endings
  - 07_Phases/PHASE_02_FILE_IO_TABS.md#scope
  - mockups/README.md#role-in-the-spec
phase_requirements:
  - PH02-R03
  - PH02-R04
  - PH02-R08
modules:
  - ui/components/
  - ui/widgets/
  - i18n/
acceptance_criteria:
  - STORY-049-AC-1
  - STORY-049-AC-2
  - STORY-049-AC-3
  - STORY-049-AC-4
edge_cases:
  - EC-DOCS-6
  - EC-DOCS-7
  - EC-DOCS-8
  - EC-SET-4
depends_on:
  - STORY-040
  - STORY-041
  - STORY-047
  - STORY-048
adrs:
  - ADR-0014
  - ADR-0024
phase: 02
owner: coder
estimate: M
---

# STORY-049 — Show autosave and document safety status

## Goal

Make the current document's save, autosave, encoding, and safety state understandable without treating raw
editor activity as a completed backend operation.

## In scope

- Add status representations for dirty/saving/saved/failure and autosave eligibility.
- Show encoding, line ending, read-only, and normalization-pending state.
- Keep tab and status indicators coherent during document switches.

## Out of scope

- Autosave scheduling, owned by STORY-048.
- Backend byte metadata, owned by STORY-034/035.
- General notification/toast redesign.

## Spec inputs

- `01_Product/03_FILES_TABS_WORKSPACE.md#autosave` — communicate enabled, saved, and failure behavior.
- `01_Product/03_FILES_TABS_WORKSPACE.md#encoding-and-line-endings` — display encoding/ending safety.
- `07_Phases/PHASE_02_FILE_IO_TABS.md#scope` — provide tab/status autosave and metadata indication.
- `mockups/README.md#role-in-the-spec` — match status/tab visual language.

## Design constraints

- Derive display from backend-confirmed revisions, metadata patches, and save acknowledgements, never raw
  keystrokes.
- Read-only and normalization-pending labels follow ADR-0024.
- All states use localized text, accessible live/status semantics where appropriate, and design tokens only.
- Components call no bridge binding; preserve DD-30/DD-35/DD-36/DD-62–64, ADR-0014, and offline behavior.

## Acceptance criteria

### STORY-049-AC-1
**Satisfies:** PH02-R08

The active document status distinguishes dirty, saving, saved, autosave disabled, autosave ineligible, and
save failed; new documents are shown as ineligible rather than automatically saved. (satisfies EC-DOCS-6
and EC-SET-4)

### STORY-049-AC-2
**Satisfies:** PH02-R03, PH02-R04

Encoding, LF/CRLF/mixed, read-only, and normalization-pending values are displayed from projected backend
metadata with a clear unsafe-document label. (satisfies EC-DOCS-8)

### STORY-049-AC-3
**Satisfies:** PH02-R08

Saving/saved/failure transitions occur only for matching backend revisions; switching documents during a
save cannot put the old document's status on the new active tab. (satisfies EC-DOCS-7)

### STORY-049-AC-4
**Satisfies:** PH02-R03, PH02-R04, PH02-R08

At supported widths and themes, status and tab indicators remain localized, keyboard/screen-reader
understandable, non-overlapping, and token-only.

## Test plan

- STORY-049-AC-1 — integration — `frontend/src/ui/components/StatusBar.test.tsx` —
  `it('STORY-049-AC-1 renders autosave states (EC-DOCS-6 EC-SET-4)')`.
- STORY-049-AC-2 — integration — `frontend/src/ui/components/StatusBar.test.tsx` —
  `it('STORY-049-AC-2 renders encoding and safety metadata (EC-DOCS-8)')`.
- STORY-049-AC-3 — integration — `frontend/src/ui/components/StatusBar.test.tsx` —
  `it('STORY-049-AC-3 isolates revisioned status across switches (EC-DOCS-7)')`.
- STORY-049-AC-4 — e2e-smoke — `frontend/e2e/tabs.spec.ts` —
  `test('STORY-049-AC-4 keeps status accessible responsive and token-driven')`.

## Definition of done

- [ ] Every AC and edge has passing explicit evidence.
- [ ] Deferred tests cover switching during pending/successful/failed save.
- [ ] Responsive and accessibility assertions cover all status variants.
- [ ] Strings are localized and styles use tokens only.
- [ ] Frontend quality/UI gates pass.
- [ ] Authority, adapter boundary, envelopes, and offline behavior hold.
- [ ] `just trace` and `just trace-check` pass.
- [ ] The module inventory is unchanged.
