---
id: STORY-042
title: Detect external changes at focus and save checkpoints
status: draft
spec_clauses:
  - 01_Product/01_FUNCTIONAL_REQUIREMENTS.md#documents--files-docs
  - 01_Product/03_FILES_TABS_WORKSPACE.md#new-open-save
  - 07_Phases/PHASE_02_FILE_IO_TABS.md#state-and-transition-model
phase_requirements:
  - PH02-R10
  - PH02-R13
modules:
  - logic/hooks/
  - logic/adapter/
acceptance_criteria:
  - STORY-042-AC-1
  - STORY-042-AC-2
  - STORY-042-AC-3
  - STORY-042-AC-4
edge_cases:
  - EC-DOCS-2
  - EC-DOCS-3
depends_on:
  - STORY-038
  - STORY-039
adrs:
  - ADR-0024
phase: 02
owner: coder
estimate: M
---

# STORY-042 — Detect external changes at focus and save checkpoints

## Goal

Check backed documents at explicit lifecycle boundaries so an external modification or deletion is found
before overwrite without adding a background watcher.

## In scope

- Check the active document on application focus and immediately before save.
- Coalesce concurrent checks and discard stale results.
- Suppress checks/prompts for inapplicable documents.

## Out of scope

- Backend version comparison, owned by STORY-038.
- Reload/Keep-mine prompt UI, owned by STORY-043.
- Live watching or polling, excluded from Phase 02.

## Spec inputs

- `01_Product/01_FUNCTIONAL_REQUIREMENTS.md#documents--files-docs` — prevent silent overwrite of changed or
  deleted paths.
- `01_Product/03_FILES_TABS_WORKSPACE.md#new-open-save` — check before writing and preserve failures.
- `07_Phases/PHASE_02_FILE_IO_TABS.md#state-and-transition-model` — run PH02-T08 only at defined checkpoints.

## Design constraints

- Use application focus and save intent only; do not install a filesystem watcher, interval, network call,
  or unsolicited background task.
- Checks are keyed by document identity/revision and share one in-flight request per applicable document.
- Backed read-only documents remain applicable because their disk bytes may change; a changed read-only
  result is classified for Reload-only presentation.
- Call only adapter APIs; hooks never import generated bindings/runtime directly.
- Preserve DD-32, DD-62–64, ADR-0014/0020, content-free projection, Result envelopes, tokens, and offline.

## Acceptance criteria

### STORY-042-AC-1
**Satisfies:** PH02-R10, PH02-R13

The active backed document is checked once when the application regains focus and once immediately before a
manual or autosave write proceeds. (satisfies EC-DOCS-2)

### STORY-042-AC-2
**Satisfies:** PH02-R10

No interval, filesystem watcher, retry loop, or background network behavior is created; checks occur only
from the declared focus/save triggers.

### STORY-042-AC-3
**Satisfies:** PH02-R10, PH02-R13

Overlapping checks for the same identity/revision coalesce, and a result for a closed, switched, or newer
revision cannot create or clear the current conflict.

### STORY-042-AC-4
**Satisfies:** PH02-R10

New, clean-and-unchanged, closed, or superseded documents produce no decision prompt; a changed backed
read-only document produces Reload-only state, while a deleted backed file reports the detached outcome
once. (satisfies EC-DOCS-3)

## Test plan

- STORY-042-AC-1 — unit — `frontend/src/logic/hooks/useExternalFileCheck.test.ts` —
  `it('STORY-042-AC-1 checks focus and save boundaries (EC-DOCS-2)')`.
- STORY-042-AC-2 — architecture — `frontend/src/logic/hooks/useExternalFileCheck.test.ts` —
  `it('STORY-042-AC-2 creates no watcher polling or network path')`.
- STORY-042-AC-3 — unit — `frontend/src/logic/hooks/useExternalFileCheck.test.ts` —
  `it('STORY-042-AC-3 coalesces checks and rejects stale results')`.
- STORY-042-AC-4 — unit — `frontend/src/logic/hooks/useExternalFileCheck.test.ts` —
  `it('STORY-042-AC-4 checks read-only and suppresses only inapplicable documents (EC-DOCS-3)')`.

## Definition of done

- [ ] Every AC and edge has passing explicit evidence.
- [ ] Fake timers and deferred promises cover focus bursts, save races, switch, close, and deletion.
- [ ] Import/network architecture checks stay green.
- [ ] No background watcher or retry is introduced.
- [ ] Frontend quality gates pass.
- [ ] Authority, adapter, envelope, token, and offline invariants hold.
- [ ] `just trace` and `just trace-check` pass.
- [ ] The module inventory is unchanged.
