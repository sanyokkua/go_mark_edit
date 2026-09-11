# ADR-0024 — Apply the complete corrected Phase 02 document lifecycle policy

**Status:** accepted
**Date:** 2026-07-23
**Deciders:** project owner, architect
**Supersedes:** ADR-0020 (deleted 2026-07-25 with the process ADRs; its content is fully absorbed here — see `git show 39efb7a:docs/adr/0020-phase02-document-lifecycle-policy.md`)

> **Historical vocabulary — this record is not rewritten.** The `DD-…` and `EC-…` identifiers below cite the retired 78-entry design-decision registry, last present in git at `e1bd33f` under `specification/00_Foundation/` as `04_DESIGN_DECISIONS.md`; every one of those decisions now lives in the sentence of the feature file that needs it. Links into `_archive-2026-07-28-specification/` are the pre-conversion specification, kept so a citation still resolves, and **not normative**. See `README.md`. A decision record says what was decided against what was known then, so neither is translated forward.
> A link beginning `07_Phases/` names a retired phase document that was deleted rather than archived; that set is in git at `e1bd33f`.

## Context and problem statement

ADR-0020 resolved PH02-X01 through PH02-X04, but independent review found missing deterministic behavior at
four write boundaries: suffixless Save As, authorization of mixed-line normalization, external changes to
read-only documents, and complete invalidation of Keep-mine tokens. These gaps affect multiple modules and
can cause an implementer to invent incompatible behavior. The full lifecycle policy must be restated in one
accepted replacement.

## Decision drivers

- Preserve every approved ADR-0020 behavior while closing all write-authorization gaps.
- Prevent any unconfirmed normalization or read-only flow from reaching a disk write.
- Keep file-entry, close, autosave, and external-conflict consumers on one backend-authoritative contract.
- Make every authorization revision-bound, single-use, and adversarially testable.
- Preserve DD-62 through DD-64 and the file-first, offline model.

## Considered options

- A. Leave ADR-0020 in force and document corrections only in stories.
- B. Supersede ADR-0020 with one complete corrected lifecycle policy.
- C. Split each correction into a separate policy ADR.

## Decision outcome

Chosen: **Option B**.

For every file-system open source—Open dialog, OS association, drag-and-drop, or workspace tree—the global
default open mode is applied first. Reading opens directly in Reading mode. Editor mode restores the
document's persisted Editor/Split/Preview view, then the last application arrangement, then Split.
Creating a new document always uses Editor mode.

Open and Save As support `.md`, `.markdown`, `.mdown`, and `.txt` case-insensitively. A suffixless Save As
appends `.md`. An unsupported suffix is rejected before any write. Native overwrite confirmation remains
authoritative; cancellation performs no write or model mutation.

Invalid UTF-8 or NUL-bearing input opens tolerantly as a clearly read-only document. Editing, document
commands, Format, Lint, Save, Save As, and autosave are disabled. All write primitives reject such a
document before disk access; Phase 02 performs no conversion and leaves original bytes untouched. UTF-8 BOM
and uniform LF/CRLF round-trip unchanged.

A mixed-LF/CRLF document is editable but carries a normalization warning. Normalization uses the dominant
ending, with the first ending encountered on a tie. The backend issues a single-use authorization bound to
document identity, canonical content revision, and the chosen normalization. Manual Save or Save As,
autosave, and close-save reject before disk without a matching authorization. Cancellation requests no
authorization and changes nothing. A multi-document close gathers every required normalization confirmation
and authorization before any batch save.

A multi-dirty close first flushes applicable state and creates a plan containing every requested target,
including clean tabs, while choices are collected only for dirty targets. Cancel, an incomplete choice set,
or a missing/cancelled normalization authorization performs no save, discard, or close. Requested saves run
in authoritative tab order without closing any tab. External conflicts are resolved before the corresponding
save. The first failure stops execution; earlier successful saves remain clean, every tab remains open, and
no discard is applied. Because successful earlier saves change revisions, a fresh close plan and fresh
choices are required before retry. Tabs close only after all requested saves succeed.

External modification checks include backed read-only documents. A changed read-only document offers Reload
only; Keep mine is never issued because writes are forbidden. Reload re-reads and atomically reclassifies raw
bytes, BOM, line endings, mixed state, read-only capability, baseline, dirty state, and active-buffer
acknowledgement.

An editable external conflict offers exactly **Reload** and **Keep mine**. Keep mine grants one overwrite
attempt bound to document identity, canonical path, and exact detected disk version. It is invalidated by
reload, successful Save, successful Save As, close, path change, use, or a second disk change. A second
change requires a new decision. Phase 02 has no Compare-later state.

### Consequences

- Positive: all file-entry, save, close, autosave, read-only, and conflict paths have deterministic
  authorization rules.
- Positive: unsafe bytes and unconfirmed normalization can never reach disk.
- Positive: batch-close retries cannot reuse decisions bound to revisions changed by earlier saves.
- Negative: mixed-ending saves and some close batches require explicit backend authorization.
- Negative: read-only external conflicts cannot Keep mine or convert bytes in Phase 02.
- Neutral: the frozen specification remains unchanged; the replacement policy is mutable implementation
  truth.

## Pros and cons of the options

### Option A — Story-local corrections

- Good: no replacement ADR.
- Bad: consumers could cite an accepted but incomplete policy and diverge.

### Option B — One corrected replacement policy

- Good: every consumer cites the same complete authorization and lifecycle contract.
- Bad: ADR-0020 becomes historical and all active citations must move.

### Option C — Multiple correction ADRs

- Good: smaller individual decisions.
- Bad: implementers must compose several policies correctly at each write boundary.

## Links

- Design decisions: DD-10, DD-11, DD-12, DD-15, DD-27, DD-60, DD-62, DD-63, DD-64
- Spec clauses: ../../_archive-2026-07-28-specification/01_Product/01_FUNCTIONAL_REQUIREMENTS.md#documents--files-docs`,
../../_archive-2026-07-28-specification/01_Product/02_EDITOR_AND_VIEWER_MODES.md#per-document-view-state`,
  ../../_archive-2026-07-28-specification/01_Product/02_EDITOR_AND_VIEWER_MODES.md#default-open-mode`,
../../_archive-2026-07-28-specification/01_Product/03_FILES_TABS_WORKSPACE.md#save-as`,
  ../../_archive-2026-07-28-specification/01_Product/03_FILES_TABS_WORKSPACE.md#dirty-state`,
../../_archive-2026-07-28-specification/01_Product/03_FILES_TABS_WORKSPACE.md#encoding-and-line-endings`,
  `specification/07_Phases/PHASE_05_REAL_FILES.md` (its "Questions to settle first")
- Stories: STORY-033, STORY-034, STORY-035, STORY-037, STORY-038, STORY-040, STORY-041, STORY-042,
  STORY-043, STORY-044, STORY-045, STORY-046, STORY-048, STORY-049, STORY-051
