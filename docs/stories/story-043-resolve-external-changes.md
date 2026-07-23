---
id: STORY-043
title: Resolve external changes through Reload or Keep mine
status: draft
spec_clauses:
  - 01_Product/01_FUNCTIONAL_REQUIREMENTS.md#documents--files-docs
  - 01_Product/03_FILES_TABS_WORKSPACE.md#edge-cases
  - 07_Phases/PHASE_02_FILE_IO_TABS.md#open-specification-conflicts
  - mockups/README.md#role-in-the-spec
phase_requirements:
  - PH02-R07
  - PH02-R10
  - PH02-R13
modules:
  - logic/hooks/
  - ui/widgets/
  - i18n/
acceptance_criteria:
  - STORY-043-AC-1
  - STORY-043-AC-2
  - STORY-043-AC-3
  - STORY-043-AC-4
  - STORY-043-AC-5
edge_cases:
  - EC-DOCS-2
  - EC-DOCS-3
depends_on:
  - STORY-038
  - STORY-039
  - STORY-040
  - STORY-042
adrs:
  - ADR-0024
  - ADR-0021
phase: 02
owner: coder
estimate: M
---

# STORY-043 — Resolve external changes through Reload or Keep mine

## Goal

Present the safe external-change choices for the document's current write capability and apply them only to
the file version the user actually saw.

## In scope

- Present Reload-only for read-only documents and Reload/Keep mine for writable documents.
- Apply revision-bound reload handoff and guarded overwrite.
- Re-prompt when disk changes again and preserve state on presentation/command failure.

## Out of scope

- Compare-later behavior, rejected by ADR-0024.
- Detection checkpoints, owned by STORY-042.
- Dirty multi-document close choices, owned by STORY-045.

## Spec inputs

- `01_Product/01_FUNCTIONAL_REQUIREMENTS.md#documents--files-docs` — make external modification visible and
  non-destructive.
- `01_Product/03_FILES_TABS_WORKSPACE.md#edge-cases` — offer Reload/Keep mine and preserve deleted content.
- `07_Phases/PHASE_02_FILE_IO_TABS.md#open-specification-conflicts` — apply the accepted PH02-X04 choice set.
- `mockups/README.md#role-in-the-spec` — use the notification/dialog visual language.

## Design constraints

- Show exactly Reload for read-only conflicts and exactly Reload/Keep mine for writable conflicts; do not
  invent Compare-later state.
- Keep mine submits only the one-use backend token; it never calls an unguarded save.
- Reload applies content only through ADR-0021's matching active-buffer acknowledgement.
- Prompt-open state is ephemeral; canonical conflict state remains backend-owned.
- Use accessible primitives, i18n, token-only styling, adapter actions, DD-62–64, and no network.

## Acceptance criteria

### STORY-043-AC-1
**Satisfies:** PH02-R10, PH02-R13

One accessible localized prompt identifies the affected file and offers Reload only when it is read-only,
or exactly Reload and Keep mine when it is writable. (satisfies EC-DOCS-2)

### STORY-043-AC-2
**Satisfies:** PH02-R07, PH02-R10, PH02-R13

Reload installs content only when the acknowledgement identity/revision matches the still-active document
and preserves its backend-confirmed view intent.

### STORY-043-AC-3
**Satisfies:** PH02-R10, PH02-R13

For a writable conflict, Keep mine submits the displayed one-use token and never invokes an unguarded
overwrite; a read-only prompt has no Keep-mine control or token.

### STORY-043-AC-4
**Satisfies:** PH02-R10, PH02-R13

If Keep mine reports that disk changed again, the prompt remains/reopens with the new version and no
automatic retry occurs. (satisfies EC-DOCS-2)

### STORY-043-AC-5
**Satisfies:** PH02-R07, PH02-R10

Prompt dismissal, presentation failure, command failure, or a deleted path leaves canonical content
recoverable and performs no hidden write. (satisfies EC-DOCS-3)

## Test plan

- STORY-043-AC-1 — integration — `frontend/src/ui/widgets/ExternalChangePrompt.test.tsx` —
  `it('STORY-043-AC-1 offers capability-safe external choices (EC-DOCS-2)')`.
- STORY-043-AC-2 — integration — `frontend/src/ui/widgets/ExternalChangePrompt.test.tsx` —
  `it('STORY-043-AC-2 applies only the matching reload acknowledgement')`.
- STORY-043-AC-3 — integration — `frontend/src/ui/widgets/ExternalChangePrompt.test.tsx` —
  `it('STORY-043-AC-3 permits guarded Keep mine only for writable documents')`.
- STORY-043-AC-4 — integration — `frontend/src/ui/widgets/ExternalChangePrompt.test.tsx` —
  `it('STORY-043-AC-4 prompts again after a second change (EC-DOCS-2)')`.
- STORY-043-AC-5 — integration — `frontend/src/ui/widgets/ExternalChangePrompt.test.tsx` —
  `it('STORY-043-AC-5 preserves content on dismissal and failure (EC-DOCS-3)')`.

## Definition of done

- [ ] Every AC and edge has passing explicit evidence.
- [ ] Deferred tests cover active switch, second disk change, dismissal, and adapter failure.
- [ ] Accessible role/name/focus behavior and localized strings are tested.
- [ ] No Compare-later or unguarded overwrite path exists.
- [ ] Frontend quality/UI gates pass.
- [ ] Authority, adapter-only imports, tokens, envelopes, and offline behavior hold.
- [ ] `just trace` and `just trace-check` pass.
- [ ] The module inventory is unchanged.
