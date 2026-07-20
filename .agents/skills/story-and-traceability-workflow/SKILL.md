---
name: story-and-traceability-workflow
description: >-
  Use when creating a story file under docs/stories/, editing a non-done story's front-matter or
  body, mapping a spec clause to an acceptance criterion and its proving test, or finishing work that
  must update the traceability record. Covers the story schema and body order, the STORY-NNN /
  STORY-NNN-AC-N / EC-AREA-N id rules, the draft→ready→in-progress→done→superseded lifecycle, and
  running just trace / just trace-check before marking a story done.
allowed-tools: Read, Write, Bash, Glob, Grep
references:
  - references/front-matter-and-body.md
  - references/lifecycle-and-sizing.md
  - references/trace-check-reference.md
scripts:
  - scripts/check-story-frontmatter.sh
assets:
  - assets/story-template.md
related-skills:
  - testing-wails-app: writes the proving tests each AC needs before done
  - adr-authoring: when a story surfaces an architecturally significant decision
---

# Story Format and Traceability Workflow

Work is tracked as **stories**: one Markdown file per story, one story per coding session.
Traceability links, in both directions, the chain **spec clause → story → acceptance criterion →
test → module**, recorded in the generated `docs/traceability.yaml` and validated by `just
trace-check` before any story is `done`. This skill is the crisp playbook; the full schema, body
order, lifecycle, sizing, and the trace-check failure catalog live in the references.

## When to use

- Creating a new `docs/stories/story-NNN-short-slug.md`, or editing a **non-`done`** story's
  front-matter or body.
- Writing acceptance criteria and wiring them to their proving Go/Jest/Playwright tests.
- Finishing implementation and needing to regenerate/validate the traceability record.

## When NOT to use

- Editing a `done` story — it is immutable; a spec change spawns a **new** story (see lifecycle).
- Hand-editing `docs/traceability.yaml` — it is generated; never touch it directly.
- Recording an architecturally significant decision — that is the `adr-authoring` skill.

## Workflow

1. **Pick the next free `STORY-NNN`.** Scan `docs/stories/`; ids are permanent — never reuse a number.
   `scripts/check-story-frontmatter.sh docs/stories/` lists existing ids/status/phase at a glance.
2. **Author the front-matter** by copying `assets/story-template.md`. Verify every `spec_clauses`
   anchor resolves to a real heading and every `modules:` path exists in `01_MODULE_INVENTORY.md`. The
   field-by-field rules are in `references/front-matter-and-body.md`.
3. **Write the body in the fixed section order** — Goal, In scope, Out of scope, Spec inputs, Design
   constraints, Acceptance criteria (each `### STORY-NNN-AC-N`, phrased per
   `05_ACCEPTANCE_CRITERIA_PATTERNS.md`), Test plan, Definition of done. Worked example in
   `references/front-matter-and-body.md`.
4. **Set `status: ready`** only once every `depends_on` is `done`, the graph is acyclic, and the
   front-matter validates. Lifecycle transitions and the S/M/L sizing bounds are in
   `references/lifecycle-and-sizing.md`.
5. **Implement + land tests**, each naming its AC on the first line (`// Proves: STORY-NNN-AC-N` or
   `it('STORY-NNN-AC-N …')`) — see the `testing-wails-app` skill.
6. **Regenerate + gate.** `just trace` rewrites `docs/traceability.yaml` (never hand-edit it); `just
   trace-check` must exit 0 with zero orphans and a fresh record. Only then set `status: done`. The
   full check → meaning table is in `references/trace-check-reference.md`.

## Reference Index

| Reference | Read it for |
|---|---|
| `references/front-matter-and-body.md` | The full front-matter schema + field→rule table, the fixed body section order, a worked AC/Test-plan example and its proving-test tags |
| `references/lifecycle-and-sizing.md` | The draft→ready→in-progress→done→superseded lifecycle, transition gates, immutability of `done`, the S/M/L sizing bounds and split rule |
| `references/trace-check-reference.md` | What `just trace` vs `just trace-check` do, and the check → "fails when" table |
| `scripts/check-story-frontmatter.sh` | List each story's `id` / `status` / `phase` / `owner` and flag obvious front-matter gaps |
| `assets/story-template.md` | The copy-to-start story skeleton (front-matter + fixed body order) |

## Mandatory validation

- [ ] File named `story-NNN-short-slug.md`; `id` unique, permanent, matching the filename number.
- [ ] Every `spec_clauses` entry resolves to a real file + heading anchor.
- [ ] Every `modules` entry exists in `01_MODULE_INVENTORY.md`.
- [ ] Every AC in front-matter is written out in the body, phrased per `05_ACCEPTANCE_CRITERIA_PATTERNS.md`.
- [ ] Body sections present in the fixed order; Design constraints name the binding rules (layering, envelope, adapter-only, token-only, offline, `DD-NN`/`ADR-NNNN`).
- [ ] Each AC and each `EC-` id has a Test-plan entry and a proving test that names it on its first line.
- [ ] `depends_on` acyclic and all `done`; cited ADRs are `accepted`.
- [ ] Size tier honored (see sizing bounds).
- [ ] After landing tests: `just trace` regenerated; `just trace-check` clean before `done`.

## Gotchas

- **Editing a `done` story** — it is immutable; a change to an accepted clause it depends on spawns a
  **new** `STORY-NNN` (and a new ADR if architecturally significant), never an edit to the old file.
- **Hand-editing `docs/traceability.yaml`** — always regenerate with `just trace`; the "Record fresh"
  check catches stale/manual edits.
- **An AC with no proving test** — every AC needs a test whose first line names it, or `just trace-check`
  fails on "AC proven".
- **A test's `Proves:` id that no story defines** — orphan test; fix the id or add the AC.
- **Reusing / renumbering a `STORY-NNN` or `-AC-N` or `EC-AREA-N`** — ids are permanent; take the next
  free number, even when superseding.
- **`modules:` path not in the inventory** — add the module to `01_MODULE_INVENTORY.md` in the same
  story or fix the path.
- **`ready` with an unfinished `depends_on`** — a story reaches `ready` only when every dependency is
  `done` and the graph is acyclic.
