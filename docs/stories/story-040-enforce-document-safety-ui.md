---
id: STORY-040
title: Enforce read-only and newline-normalization document safety
status: draft
spec_clauses:
  - 01_Product/03_FILES_TABS_WORKSPACE.md#encoding-and-line-endings
  - 07_Phases/PHASE_02_FILE_IO_TABS.md#edge-and-failure-cases
  - 07_Phases/PHASE_02_FILE_IO_TABS.md#open-specification-conflicts
phase_requirements:
  - PH02-R02
  - PH02-R03
  - PH02-R04
  - PH02-R08
modules:
  - logic/hooks/
  - ui/widgets/
  - i18n/
acceptance_criteria:
  - STORY-040-AC-1
  - STORY-040-AC-2
  - STORY-040-AC-3
  - STORY-040-AC-4
  - STORY-040-AC-5
edge_cases:
  - EC-DOCS-8
  - EC-DOCS-9
depends_on:
  - STORY-030
  - STORY-034
  - STORY-035
  - STORY-039
adrs:
  - ADR-0024
phase: 02
owner: coder
estimate: M
---

# STORY-040 — Enforce read-only and newline-normalization document safety

## Goal

Show unsafe documents without exposing destructive editing actions, and require a clear decision before a
mixed-line-ending save changes bytes.

## In scope

- Render invalid UTF-8/NUL documents as localized read-only views.
- Disable every mutation path for read-only documents.
- Warn and confirm before mixed-line-ending normalization.

## Out of scope

- Encoding conversion.
- Backend byte detection, owned by STORY-034.
- General external-change prompts, owned by STORY-043.

## Spec inputs

- `01_Product/03_FILES_TABS_WORKSPACE.md#encoding-and-line-endings` — preserve byte metadata and warn rather
  than silently rewrite.
- `07_Phases/PHASE_02_FILE_IO_TABS.md#edge-and-failure-cases` — prove unsafe input, round trip, and Save As
  cancellation.
- `07_Phases/PHASE_02_FILE_IO_TABS.md#open-specification-conflicts` — apply the accepted PH02-X02 policy.

## Design constraints

- Apply ADR-0024 exactly: unsafe bytes are display-only; mixed endings are editable but autosave-blocked
  until explicit manual-save confirmation.
- Confirmation first obtains a backend-issued authorization bound to the current document/content revision;
  only then does the UI pass it to the aggregate canonical Save/SaveAs command.
- Do not mount editable Monaco or expose editor-session mutations for a read-only document.
- UI calls typed adapter actions; no component imports `wailsjs/`.
- All strings use i18n and all styling uses existing theme tokens; no hardcoded colors.
- Preserve backend authority/content-free projection (DD-62–64, ADR-0014), Result envelopes, and offline.

## Acceptance criteria

### STORY-040-AC-1
**Satisfies:** PH02-R03, PH02-R04

An invalid UTF-8 or NUL-bearing document displays its tolerant read-only representation with a localized
reason and without mounting an editable Monaco session. (satisfies EC-DOCS-8)

### STORY-040-AC-2
**Satisfies:** PH02-R02, PH02-R04, PH02-R08

Edit, document-command, Format, Lint, Save, Save As, and autosave actions are unavailable for a read-only
document and no adapter mutation is invoked. (satisfies EC-DOCS-8)

### STORY-040-AC-3
**Satisfies:** PH02-R02, PH02-R03, PH02-R08

A mixed-ending editable document shows a persistent normalization warning and remains ineligible for
autosave until manual-save confirmation. (satisfies EC-DOCS-9)

### STORY-040-AC-4
**Satisfies:** PH02-R02, PH02-R03

Confirming manual save obtains a backend-issued, revision-bound normalization authorization for the
backend-provided dominant/first-observed decision and passes that authorization to the canonical save
command.

### STORY-040-AC-5
**Satisfies:** PH02-R02, PH02-R03

Cancelling normalization requests no authorization, invokes no save, keeps autosave blocked, and leaves disk
bytes, canonical content, baseline, and dirty projection unchanged.

## Test plan

- STORY-040-AC-1 — integration — `frontend/src/ui/widgets/DocumentSafety.test.tsx` —
  `it('STORY-040-AC-1 renders unsafe bytes read-only (EC-DOCS-8)')`.
- STORY-040-AC-2 — integration — `frontend/src/ui/widgets/DocumentSafety.test.tsx` —
  `it('STORY-040-AC-2 disables every read-only mutation (EC-DOCS-8)')`.
- STORY-040-AC-3 — integration — `frontend/src/ui/widgets/DocumentSafety.test.tsx` —
  `it('STORY-040-AC-3 warns and blocks autosave for mixed endings (EC-DOCS-9)')`.
- STORY-040-AC-4 — integration — `frontend/src/ui/widgets/DocumentSafety.test.tsx` —
  `it('STORY-040-AC-4 obtains and passes a revision-bound normalization authorization')`.
- STORY-040-AC-5 — integration — `frontend/src/ui/widgets/DocumentSafety.test.tsx` —
  `it('STORY-040-AC-5 cancel requests no authorization or save')`.

## Definition of done

- [ ] Every AC and edge has passing explicit evidence.
- [ ] Tests assert Monaco and all mutation adapter calls are absent for read-only input.
- [ ] Mixed-ending confirm/cancel and autosave eligibility are covered.
- [ ] All new strings are localized and styles are token-only.
- [ ] Frontend format, lint, typecheck, Jest, and applicable UI checks pass.
- [ ] Authority, adapter-only imports, envelopes, and offline invariants hold.
- [ ] `just trace` and `just trace-check` pass.
- [ ] The module inventory is unchanged.
