**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester
**Last Updated:** 2026-07-10
**Cross-references:** `02_STORY_FORMAT.md`, `01_MODULE_INVENTORY.md`

# Traceability

Traceability links, in both directions, the chain **spec clause → phase requirement → story → acceptance
criterion → test → module**. It is stored in a generated file at `../docs/traceability.yaml` (the mutable working
area, **not** the frozen spec) and validated
as a gate before any story is marked `done`.

## The chain

```
Spec clause --defines--> Phase requirement --implemented by--> Story --defines--> Acceptance criterion --proven by--> Test --exercises--> Module
Story --touches--> Module
```

## `traceability.yaml` schema

```yaml
# traceability.yaml — GENERATED. Do not edit by hand. Regenerate with `just trace`.
generated_at: '2026-07-10T00:00:00Z'
generator_version: 2
stories:            # STORY-NNN -> {title, status, phase, spec_clauses[], modules[], edge_cases[],
                    #               acceptance_criteria: { STORY-NNN-AC-N: { tests: [test node ids] } }}
phase_requirements: # PHNN-RNN -> {phase, source_clauses[], stories: {STORY-NNN: {acceptance_criteria[]}}, tests[]}
clauses:            # <spec-file>#<anchor> -> { stories: [STORY-NNN] }
edge_cases:         # EC-AREA-N -> { stories: [STORY-NNN], tests: [test node ids] }
modules:            # <module path> -> { stories: [STORY-NNN] }
```

The index maps make any direction of the chain O(1) queryable.

## How a test declares the AC it proves

A proving test names its AC on the **first line of its docstring / leading comment**, in a fixed form,
so the generator can collect it:

- **Go** (`go test`): a leading comment on the test function:
  ```go
  // Proves: STORY-018-AC-2
  // Save writes UTF-8 and preserves the file's original CRLF line endings.
  func TestSavePreservesCRLF(t *testing.T) { ... }
  ```
- **TypeScript** (`jest`): the first line of the test name or a leading comment:
  ```ts
  // Proves: STORY-031-AC-1
  it('STORY-031-AC-1 renders a GFM table in the preview', () => { ... });
  ```

Edge-case evidence is explicit per physical test node: Go uses `// Evidence: EC-AREA-N` in the leading
comment block; Jest/Playwright places the EC id in the actual test name. An EC token in fixture data,
assertion text, or the test body is not evidence. A leading comment plus an AC-first test name still
describes one physical test node and is collected once.

## The two commands

- **`just trace`** → regenerates `traceability.yaml` from `../docs/stories/*.md` and the collected test
  suites (Go test names + comments, Jest test names/comments). Run after any story or test change.
- **`just trace-check`** → validates the record; the gate that must pass before `done`. Checks:
### Phase commands

- **`just phase-check`** → validates all phase documents structurally without claiming unfinished work is complete.
- **`just phase-complete-check NN`** → validates complete phase coverage and durable exit evidence.

| Check | Fails when |
|---|---|
| Clause resolves | a `spec_clauses` entry points to no real file / heading anchor |
| Module exists | a `modules` entry is not in `01_MODULE_INVENTORY.md` |
| No orphan clause | a clause tagged "traceable" is named by no story |
| No orphan story | a story names no clause, or a `done` story has an AC with no test |
| AC proven | a `done` story has an AC with an empty `tests` list |
| No orphan test | a test's `Proves:` names an AC that no story defines |
| Edge-case covered | an `EC-` id appears in no story or has no test |
| Phase requirement resolves | a story cites no such requirement in its owning phase |
| AC mapping agrees | frontmatter `phase_requirements` differs from the union of AC `Satisfies:` markers |
| Phase completion | a requirement/transition/contract/edge/evidence row lacks done-story proof |
| Lifecycle agreement | board, frontmatter, and generated status differ, or a ready dependency is not done |
| Acyclic deps | the `depends_on` graph has a cycle |
| Record fresh | re-running the generator would differ from the committed file (catches hand-edits/staleness) |

`traceability.yaml` is generated; never hand-edit it. It may be committed (so PRs show the diff) or
regenerated in CI — either way `just trace-check` must be clean.

## Tooling note

The generator/validator are small scripts under `scripts/` (language of choice: Go or Node — an
implementation story owns them; see Phase 00). Until they exist, traceability is maintained by the
`architect`/`tester` agents manually against this schema, and the checks above are enforced by review.
