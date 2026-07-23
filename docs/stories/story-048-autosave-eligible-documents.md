---
id: STORY-048
title: Autosave eligible documents through the serialized save path
status: draft
spec_clauses:
  - 01_Product/03_FILES_TABS_WORKSPACE.md#autosave
  - 02_Architecture/03_FRONTEND_REACT.md#state-ownership
  - 02_Architecture/05_STATE_AND_PERSISTENCE.md#file-first
  - 07_Phases/PHASE_02_FILE_IO_TABS.md#state-and-transition-model
phase_requirements:
  - PH02-R02
  - PH02-R08
  - PH02-R09
  - PH02-R10
  - PH02-R13
modules:
  - logic/hooks/
  - logic/adapter/
acceptance_criteria:
  - STORY-048-AC-1
  - STORY-048-AC-2
  - STORY-048-AC-3
  - STORY-048-AC-4
  - STORY-048-AC-5
  - STORY-048-AC-6
edge_cases:
  - EC-DOCS-2
  - EC-DOCS-6
  - EC-DOCS-13
  - EC-SET-4
depends_on:
  - STORY-037
  - STORY-038
  - STORY-039
  - STORY-043
  - STORY-047
adrs:
  - ADR-0014
  - ADR-0024
phase: 02
owner: coder
estimate: M
---

# STORY-048 — Autosave eligible documents through the serialized save path

## Goal

Autosave the newest backend-accepted edit one second after activity stops while skipping unsafe documents,
sharing the manual-save path, and never retrying failures in the background.

## In scope

- Schedule autosave from accepted dirty revisions.
- Join per-document save serialization and external-conflict handling.
- Enforce every eligibility, cancellation, failure, and edit-during-save rule.

## Out of scope

- Persisting the preference, owned by STORY-047.
- Autosave status presentation, owned by STORY-049.
- Format/lint-on-save, owned by later formatting/settings phases.

## Spec inputs

- `01_Product/03_FILES_TABS_WORKSPACE.md#autosave` — default-on debounce for existing files only.
- `02_Architecture/03_FRONTEND_REACT.md#state-ownership` — flush accepted buffer state before canonical save.
- `02_Architecture/05_STATE_AND_PERSISTENCE.md#file-first` — create no swap/shadow file and never autosave
  never-saved buffers.
- `07_Phases/PHASE_02_FILE_IO_TABS.md#state-and-transition-model` — preserve PH02-T03 failure behavior.

## Design constraints

- Schedule from backend-confirmed revisioned dirty patches, not raw keystrokes or stale patches.
- The delay is exactly one second from the latest accepted edit; one timer exists per eligible document.
- Reuse the canonical save command and per-document serialization; do not write frontend text.
- Apply ADR-0024: skip read-only and normalization-pending input; external conflict requires user action.
- Failures report once and stay dirty with no background retry.
- Preserve DD-12/DD-32/DD-62–64, ADR-0014, adapter-only imports, Result envelopes, tokens, and offline.

## Acceptance criteria

### STORY-048-AC-1
**Satisfies:** PH02-R08, PH02-R09

**Given** an eligible backed document receives backend-accepted dirty revisions, **when** edits stop, **then**
one autosave starts exactly one second after the latest accepted revision.

### STORY-048-AC-2
**Satisfies:** PH02-R02, PH02-R08, PH02-R09

Manual save cancels a pending timer, and an already-running autosave/manual save shares the document's
serialized canonical save path without a duplicate write. (satisfies EC-DOCS-13)

### STORY-048-AC-3
**Satisfies:** PH02-R08

New, clean, disabled, read-only, closed, superseded, or normalization-pending documents are not autosaved.
(satisfies EC-DOCS-6 and EC-SET-4)

### STORY-048-AC-4
**Satisfies:** PH02-R08, PH02-R10, PH02-R13

An external-change result enters the normal Reload/Keep-mine decision and autosave performs no guarded or
unguarded overwrite until the user decides. (satisfies EC-DOCS-2)

### STORY-048-AC-5
**Satisfies:** PH02-R02, PH02-R08

A failed autosave leaves the document dirty, publishes one failure status, and schedules no retry until a
new accepted edit or explicit manual action.

### STORY-048-AC-6
**Satisfies:** PH02-R02, PH02-R08, PH02-R09

An edit accepted during an in-flight save remains dirty after the older snapshot commits and schedules a
new one-second autosave for the newer revision.

## Test plan

- STORY-048-AC-1 — unit — `frontend/src/logic/hooks/useAutosave.test.ts` —
  `it('STORY-048-AC-1 waits one second from the latest accepted revision')`.
- STORY-048-AC-2 — unit — `frontend/src/logic/hooks/useAutosave.test.ts` —
  `it('STORY-048-AC-2 joins manual and automatic save (EC-DOCS-13)')`.
- STORY-048-AC-3 — unit — `frontend/src/logic/hooks/useAutosave.test.ts` —
  `it('STORY-048-AC-3 skips ineligible documents (EC-DOCS-6 EC-SET-4)')`.
- STORY-048-AC-4 — integration — `frontend/src/logic/hooks/useAutosave.test.ts` —
  `it('STORY-048-AC-4 waits for external-change choice (EC-DOCS-2)')`.
- STORY-048-AC-5 — unit — `frontend/src/logic/hooks/useAutosave.test.ts` —
  `it('STORY-048-AC-5 reports failure without background retry')`.
- STORY-048-AC-6 — unit — `frontend/src/logic/hooks/useAutosave.test.ts` —
  `it('STORY-048-AC-6 reschedules a newer revision after in-flight save')`.

## Definition of done

- [ ] Every AC and edge has passing explicit evidence.
- [ ] Fake timers and deferred promises cover rapid edits, manual save, switch/close, failure, conflict, and
  edit-during-save.
- [ ] Tests prove scheduling is patch-driven and no retry/polling loop exists.
- [ ] No frontend text reaches Save.
- [ ] Frontend quality gates pass.
- [ ] Authority, adapter-only imports, tokens, envelopes, and offline behavior hold.
- [ ] `just trace` and `just trace-check` pass.
- [ ] The module inventory is unchanged.
