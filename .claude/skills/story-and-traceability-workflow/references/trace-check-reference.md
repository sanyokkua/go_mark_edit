# `just trace` / `just trace-check` reference

Authority: `specification/06_Process_and_Traceability/03_TRACEABILITY.md` (the generated record +
validation). The record lives at `docs/traceability.yaml` and carries a header:
`# traceability.yaml — GENERATED. Do not edit by hand. Regenerate with just trace.`

## The two commands

- **`just trace`** — regenerates `docs/traceability.yaml` from `docs/stories/*.md` and the collected
  test names (`Proves:` tags). Run it after landing tests. **Never hand-edit the file.**
- **`just trace-check`** — validates the record; this is the gate that must pass before a story is
  `done`. In CI the record may be regenerated and compared — either way `just trace-check` must be
  clean.

## `just trace-check` failure → meaning

| Check | Fails when |
|---|---|
| Clause resolves | a `spec_clauses` entry points to no real file / heading anchor |
| Module exists | a `modules` entry is not in `01_MODULE_INVENTORY.md` |
| No orphan clause | a clause tagged "traceable" is named by no story |
| No orphan story | a story names no clause, or a `done` story has an AC with no test |
| AC proven | a `done` story has an AC with an empty `tests` list |
| No orphan test | a test's `Proves:` names an AC that no story defines |
| Edge-case covered | an `EC-` id appears in no story or has no test |
| Acyclic deps | the `depends_on` graph has a cycle |
| Record fresh | re-running the generator would differ from the committed file |

## Fixing common failures

- **Orphan story / "AC proven"** — add the proving test whose first line is exactly
  `Proves: STORY-NNN-AC-N`.
- **Orphan test** — the test's `Proves:` id names an AC no story defines; correct the id or add the AC
  to the owning story.
- **Record fresh** — you (or a merge) edited `docs/traceability.yaml` by hand or forgot to re-run
  `just trace`; regenerate.
- **Module exists** — the `modules:` path is not in `01_MODULE_INVENTORY.md`; use an inventory path (or
  add the module to the inventory in the same story if it is genuinely new).
- **Acyclic deps** — remove the cycle in `depends_on`; a UI story depends on its backend story, not the
  reverse.
