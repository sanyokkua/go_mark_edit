---
paths:
  - "docs/stories/**"
  - "docs/adr/**"
---

# Traceability and stories

**Authority:** `specification/06_Process_and_Traceability/02_STORY_FORMAT.md`,
`03_TRACEABILITY.md`, `04_ADR_FORMAT.md`, `01_MODULE_INVENTORY.md`. These files are normative -- copy
their schemas exactly.

Work is tracked as **stories** (`docs/stories/story-NNN-slug.md`), **one story per coding session**.
The chain is: **spec clause -> phase requirement -> story -> acceptance criterion -> test -> module**, recorded in the
generated `docs/traceability.yaml` and validated by `just trace-check` before any story is `done`.

## Stories

- Filename `story-NNN-short-slug.md`; ids are `STORY-NNN` (zero-padded 3), **permanent** (never reused,
  renumbered, or deleted -- even when superseded). ACs are `STORY-NNN-AC-N`, edge cases `EC-AREA-N`.
- Front-matter (copy the schema in `02_STORY_FORMAT.md`) has, all required unless noted:
  `id`, `title` (imperative, no trailing period), `status`, `spec_clauses` (>=1, each `<file>#<anchor>`
  resolving to a real heading), `phase_requirements` (>=1, each in the owning phase ledger),
  `modules` (>=1, each a path from `01_MODULE_INVENTORY.md`),
  `acceptance_criteria` (>=1, each written out in the body), `edge_cases` (optional),
  `depends_on` (>=0, acyclic), `adrs` (optional, only `accepted`), `phase`, `owner`, `estimate`.
- Body sections, in fixed order: **Goal, In scope, Out of scope, Spec inputs, Design constraints,
  Acceptance criteria (each `### STORY-NNN-AC-N`), Test plan, Definition of done.**
- Lifecycle: `draft -> ready -> in-progress -> done`; `done -> superseded`. `ready` requires front-matter
  to validate, every AC `Satisfies:` mapping to equal the `phase_requirements` union, every `depends_on`
  `done`, every clause to resolve, and an S/M estimate. L is a non-ready epic that must be split.
- **`done` is immutable.** A change to a clause a `done` story depends on -> a **new story** (and a new
  ADR if architecturally significant), never an edit to the old file.

## ADRs

- `docs/adr/NNNN-slug.md` (zero-padded **4**). Index in `docs/adr/README.md`. Only `accepted` ADRs may be
  cited by a story. Template sections: Status, Date, Deciders, Supersedes; Context and problem statement;
  Decision drivers; Considered options; Decision outcome (+ Consequences); Pros and cons; Links.
- Supersession: the new ADR's `Supersedes:` names the old; the old ADR's `Status:` becomes
  `superseded by ADR-NNNN` -- that status line is the **only** edit ever made to an accepted ADR body.
  The old file is never deleted.

## Traceability

- A proving test names its AC on the **first leading comment / test-name line**:
  `// Proves: STORY-018-AC-2` (Go) or `it('STORY-031-AC-1 ...')` (Jest). See `go-testing.md`, `ts-testing.md`.
- `just trace` regenerates `docs/traceability.yaml` (GENERATED -- never hand-edit). `just trace-check` gates:

  | Check | Fails when |
  |---|---|
  | Clause resolves | a `spec_clauses` entry points to no real file/heading anchor |
  | Module exists | a `modules` entry is not in `01_MODULE_INVENTORY.md` |
  | No orphan clause | a traceable clause is named by no story |
  | No orphan story | a story names no clause, or a `done` story has an AC with no test |
  | AC proven | a `done` story has an AC with an empty `tests` list |
  | No orphan test | a test's `Proves:` names an AC no story defines |
  | Edge-case covered | an `EC-` id appears in no story or has no test |
  | Acyclic deps | the `depends_on` graph has a cycle |
  | Record fresh | re-running the generator would differ from the committed file |

## DON'T

- Don't renumber/reuse/delete a story or AC id; don't edit a `done` story or an accepted ADR body
  (except the one superseded-status line).
- Don't hand-edit `docs/traceability.yaml`. Don't mark `done` with `just trace-check` failing or any AC
  lacking a proving test.
- Don't cite a `proposed`/`superseded` ADR in `adrs:`, or a spec anchor that doesn't resolve.

## Authoring checklist

- [ ] Front-matter matches `02_STORY_FORMAT.md`; every `spec_clauses` anchor resolves; every `modules`
      path is in the inventory.
- [ ] Every phase requirement resolves and every AC has an exact `Satisfies:` mapping.
- [ ] Ready work is S/M; L epics are split before implementation.
- [ ] Body has all fixed sections; each AC is `### STORY-NNN-AC-N` and has a Test-plan entry.
- [ ] `depends_on` acyclic and all `done`; cited ADRs are `accepted`.
- [ ] ADR (if any) follows `04_ADR_FORMAT.md` and is indexed in `docs/adr/README.md`.
- [ ] `just trace` regenerated; `just trace-check` passes with zero orphans before `done`.
