# ADR-0020 — Resolve Phase 02 document lifecycle conflicts

**Status:** superseded by ADR-0024
**Date:** 2026-07-23
**Deciders:** project owner, architect
**Supersedes:** (none)

## Context and problem statement

Phase 02 cannot define deterministic open, byte-safety, multi-document close, or external-change tests
while PH02-X01 through PH02-X04 remain unresolved. The frozen sources disagree about fresh-open view
precedence and external-change choices, and omit lossless non-UTF-8 editing and multi-dirty close ordering.
The mutable implementation needs one explicit policy without editing the frozen specification.

## Decision drivers

- Keep every file-entry route consistent while preserving backend-owned per-document state.
- Never corrupt bytes that cannot make a lossless editable UTF-8 round trip.
- Prevent Cancel, save failure, or external races from partially closing a multi-document set.
- Never overwrite a disk version the user did not explicitly authorize.
- Preserve DD-62 through DD-64 and the file-first, offline model.

## Considered options

- A. Leave each conflict to the implementing story.
- B. Resolve all four conflicts with one lifecycle policy and machine-checkable resolution record.
- C. Defer the blocked Phase 02 requirements to later phases.

## Decision outcome

Chosen: **Option B**.

For every file-system open source—Open dialog, OS association, drag-and-drop, or workspace tree—the global
default open mode is applied first. Reading opens directly in Reading mode. Editor mode restores the
document's persisted Editor/Split/Preview view, then the last application arrangement, then Split.
Creating a new document always uses Editor mode.

Invalid UTF-8 or NUL-bearing input opens tolerantly as a clearly read-only document. Editing, document
commands, Format, Lint, Save, Save As, and autosave are disabled; Phase 02 performs no conversion and leaves
the original bytes untouched. UTF-8 BOM and uniform LF/CRLF round-trip unchanged. A mixed-LF/CRLF document
is editable but carries a normalization warning. Manual Save requires explicit confirmation, normalizes to
the dominant ending, and uses the first ending encountered on a tie. Autosave remains blocked until that
confirmation; cancellation leaves disk bytes, canonical content, baseline, and dirty state unchanged.

A multi-dirty close first flushes applicable state and gathers Save or Discard for every dirty document.
Cancel or an incomplete choice set performs no save, discard, or close. Requested saves then run in
authoritative tab order without closing any tab. External conflicts are resolved before the corresponding
save. The first failure stops execution; earlier successful saves remain clean, every tab remains open, and
no discard has been applied. Tabs close only after all requested saves succeed.

An external modification offers exactly **Reload** and **Keep mine**. Reload is explicit. Keep mine grants
one overwrite attempt bound to the document identity, canonical path, and exact detected disk version. A
second disk change invalidates the grant and prompts again. Phase 02 has no Compare-later state.

### Consequences

- Positive: all four Phase 02 conflicts have deterministic, adversarially testable outcomes.
- Positive: unreadable or concurrently changed bytes are never silently rewritten.
- Positive: closing several dirty documents cannot strand the user in a partially closed state.
- Negative: mixed-ending files need an extra explicit save decision and cannot autosave beforehand.
- Negative: read-only non-UTF-8 documents cannot be converted or edited in Phase 02.
- Neutral: the frozen specification remains unchanged; the accepted policy is recorded and validated under
  mutable `docs/`.

## Pros and cons of the options

### Option A — Story-local decisions

- Good: less up-front policy work.
- Bad: entry routes, prompts, and close paths can diverge and cannot share reliable contracts.

### Option B — One explicit lifecycle policy

- Good: one precedence, preservation, close, and conflict model for every producer and consumer.
- Bad: adds a resolution record and validator work before product implementation.

### Option C — Defer blocked requirements

- Good: avoids choosing behavior now.
- Bad: Phase 02 cannot complete and downstream file-entry consumers inherit undefined seams.

## Links

- Design decisions: DD-10, DD-11, DD-12, DD-15, DD-27, DD-60, DD-62, DD-63, DD-64
- Spec clauses: `specification/01_Product/01_FUNCTIONAL_REQUIREMENTS.md#documents--files-docs`,
  `specification/01_Product/02_EDITOR_AND_VIEWER_MODES.md#per-document-view-state`,
  `specification/01_Product/02_EDITOR_AND_VIEWER_MODES.md#default-open-mode`,
  `specification/01_Product/03_FILES_TABS_WORKSPACE.md#dirty-state`,
  `specification/01_Product/03_FILES_TABS_WORKSPACE.md#encoding-and-line-endings`,
  `specification/07_Phases/PHASE_02_FILE_IO_TABS.md#open-specification-conflicts`
- Stories: STORY-033, STORY-034, STORY-035, STORY-037, STORY-038, STORY-040, STORY-042, STORY-043,
  STORY-044, STORY-045, STORY-046, STORY-048
