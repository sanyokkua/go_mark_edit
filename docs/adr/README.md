# Architecture Decision Records — implementation-time

Decisions made while implementing, from ADR-0013 onward. The initial ones (ADR-0001…0012) live with
the specification at [`../../specification/08_Decisions/`](../../specification/08_Decisions/) — read
them there; do not copy or renumber them.

- Continue the numbering from the highest id here. Copy [`template.md`](template.md) to start.
- Supersede rather than edit: the new ADR names the old in `Supersedes:`, and the old one's
  `**Status:**` line becomes `superseded by ADR-NNNN`. That status line is the only edit ever made to
  an accepted ADR body. The old file stays.

**These are *Architecture* Decision Records.** Write one when a decision constrains how the software is
built and would be expensive to reverse. Do **not** write one about documentation, story format,
traceability, evidence, phase completion, or any other part of the process — eight such ADRs were
written here and all eight were deleted on 2026-07-25 along with the machinery they described.

A decision that changes what the app should do belongs in `specification/01_Product/`. Edit it there,
and add an ADR here only if the choice also constrains the architecture.

## Index (implementation-time ADRs)

| ADR | Title | Status | Supersedes | Superseded by |
|---|---|---|---|---|
| [ADR-0013](0013-window-ui-layout-state.md) | Persist window & UI-layout state with write-through, last-writer-wins | accepted | — | — |
| [ADR-0014](0014-backend-authoritative-state.md) | Make the Go backend the single source of truth for application state | accepted | — | — |
| [ADR-0015](0015-cicd-versioning-icon.md) | Adopt go_text-style CI/CD: tag-driven versioning, derived icons, isolated builds | accepted | — | — |
| [ADR-0017](0017-coordinated-document-seams.md) | Coordinate backend snapshots with document-bound editor commands | accepted | — | — |
| [ADR-0021](0021-identity-bound-active-buffer-acknowledgements.md) | Bind active-buffer acknowledgements to document identity and revision | accepted | — | — |
| [ADR-0022](0022-commit-writes-and-resynchronize-projection.md) | Commit successful file writes and resynchronize failed projections | accepted | — | — |
| [ADR-0024](0024-corrected-phase02-document-lifecycle-policy.md) | The document lifecycle policy — open modes, suffixless Save As, read-only unsafe bytes, normalization authorization | accepted | — | — |

Add a row per ADR as it is authored.

Ids 0016, 0018, 0019, 0020, 0023, 0025, 0026 and 0027 were used by the eight process ADRs deleted on
2026-07-25. They are not reused. ADR-0024 absorbed the content of the superseded ADR-0020 and now
stands alone.
