# Archived stories (old format)

These 25 stories describe Phase 00 and Phase 01 work that already shipped. They are kept as history.

They use the retired story format — YAML front-matter with `spec_clauses`, `phase_requirements`,
`Satisfies:` markers and a machine-validated status lifecycle. That format, and the tooling that
validated it, were removed on 2026-07-25. The whole specification moved to the Delivery Spec shape on
2026-07-28. Do not copy this shape for new work: a current story is written by `/plan-story NNN`, and
its Definition of Done is rendered from `../DOD_TEMPLATE.md`.

Nothing here is maintained. If something in one of these files is wrong, the code is the truth.

## Story numbers are never reused, and there are seven gaps

A missing number reads as a lost file. None of these is. Recorded 2026-07-28 so nobody goes looking.

| Numbers | What happened | Where they are |
|---|---|---|
| 001–007, 009, 011–019, 021–023, 027–031 | Built, and archived here. | This folder — 25 files. |
| **008, 010, 020, 024, 025, 026, 032** | Built and shipped, then **deleted** rather than archived. All seven were process stories — tooling and traceability validation, story-lifecycle enforcement, phase-planning completeness, checkpoint validation, phase-completion evidence. They went out with the machinery they described. | Git, at `927d15f` (*"Changing the approach in the development"*, 2026-07-25), under `docs/stories/`. That commit removed 29,924 lines including the eight process ADRs and roughly 4,200 lines of tests that read documents. |
| **033–051** | Planned, **never built.** They were the story set for a Phase 02 that was replaced: the roadmap was reordered on 2026-07-25 to move theming from position 8 to position 2, and the new Phase 02 was planned from scratch as 058–061. | Git, at `927d15f`, under `docs/stories/`. Do not resurrect one — they were written against a phase that no longer exists. |
| **052–056** | **Never existed.** No file was ever created with these numbers, in any commit. The jump from 051 to 057 is the gap left when the replaced Phase 02 was abandoned mid-numbering. | Nowhere. There is nothing to find. |
| **057** | **Never existed as a story.** Only a baseline was ever captured under that number — on 2026-07-28 at `e1bd33f`, against a dirty working tree, and nothing was built from it. Its four sidecar files (`.md`, `.commit`, `.findings`, `.failing-tests`) sat orphaned in `../baselines/` until they were deleted on 2026-07-28. A baseline with no story is unreadable evidence: nobody can say what it was measuring. | Git, at any commit before the deletion, under `docs/delivery/work/baselines/`. |
| 058–062 | The current Phase 02. 058 is built; 062, 059, 060 and 061 are not, and are built in that order. | `../` — the live work folder. |

**When `/reconcile` archives a story, it deletes the baseline and every sidecar beside it** —
`.failing-tests`, `.findings`, `.commit`, `.exit` and the `.logs/` directory. Leaving one behind is how
`story-057.*` became an orphan nobody could explain.
