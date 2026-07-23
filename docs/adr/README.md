# Architecture Decision Records — implementation-time (mutable)

This folder holds **decisions made while implementing** the specification (ADR-0013 onward). It is part
of the repository's mutable `docs/` working area, **not** the frozen specification.

- The **initial** architecture decisions (**ADR-0001…0012**) are part of the frozen spec at
  [`../../specification/08_Decisions/`](../../specification/08_Decisions/) — read them there; do not
  copy or renumber them.
- New ADRs continue the numbering from **ADR-0013** and follow the format in
  [`../../specification/06_Process_and_Traceability/04_ADR_FORMAT.md`](../../specification/06_Process_and_Traceability/04_ADR_FORMAT.md).
  Copy [`template.md`](template.md) to start.
- Only `accepted` ADRs may be cited in a story's `adrs:` front-matter.
- A new decision that changes a frozen spec clause is recorded **here** (plus the corresponding new
  story); the spec itself is never edited.

## Index (implementation-time ADRs)

| ADR | Title | Status | Supersedes | Superseded by |
|---|---|---|---|---|
| [ADR-0013](0013-window-ui-layout-state.md) | Persist window & UI-layout state with write-through, last-writer-wins | accepted | — | — |
| [ADR-0014](0014-backend-authoritative-state.md) | Make the Go backend the single source of truth for application state | accepted | — | — |
| [ADR-0015](0015-cicd-versioning-icon.md) | Adopt go_text-style CI/CD: tag-driven versioning, derived icons, isolated builds | accepted | — | — |
| [ADR-0016](0016-phase01-implementation-checkpoints.md) | Separate Phase 01 preview and editing implementation checkpoints | accepted | — | — |
| [ADR-0017](0017-coordinated-document-seams.md) | Coordinate backend snapshots with document-bound editor commands | accepted | — | — |
| [ADR-0018](0018-remove-phase01-manual-network-capture.md) | Remove manual network-capture evidence from Phase 01 completion | accepted | — | — |
| [ADR-0019](0019-allow-evidence-metadata-commit.md) | Permit an evidence-metadata commit after the tested revision | accepted | — | — |
| [ADR-0020](0020-phase02-document-lifecycle-policy.md) | Resolve Phase 02 document lifecycle conflicts | superseded by ADR-0024 | — | ADR-0024 |
| [ADR-0021](0021-identity-bound-active-buffer-acknowledgements.md) | Bind active-buffer acknowledgements to document identity and revision | accepted | — | — |
| [ADR-0022](0022-commit-writes-and-resynchronize-projection.md) | Commit successful file writes and resynchronize failed projections | accepted | — | — |
| [ADR-0023](0023-phase02-evidence-metadata-descendants.md) | Permit exact-revision Phase 02 evidence metadata descendants | superseded by ADR-0025 | — | ADR-0025 |
| [ADR-0024](0024-corrected-phase02-document-lifecycle-policy.md) | Apply the complete corrected Phase 02 document lifecycle policy | accepted | ADR-0020 | — |
| [ADR-0025](0025-phase02-exact-evidence-descendants.md) | Restrict Phase 02 evidence descendants to exact artifacts and metadata fields | accepted | ADR-0023 | — |

Add a row per ADR as it is authored (start at ADR-0013).
