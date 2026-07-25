---
name: adr-authoring
description: >-
  Use when a decision is architecturally significant and costly to reverse and NOT already
  pre-settled by the specification — e.g. an accepted spec clause a done story depends on has changed,
  implementation surfaced a genuine choice the spec did not anticipate, or you must supersede an
  existing ADR. Covers the ADR-NNNN file, the docs/adr/README.md index, the accepted-only citation
  rule, and supersession. Do NOT use for a local, easily reversible coding choice (that is a code
  comment or a story note).
allowed-tools: Read, Write, Glob, Grep
references:
  - references/lifecycle-and-placement.md
  - references/template-and-example.md
assets:
  - assets/adr-template.md
---

# ADR Authoring

An Architecture Decision Record captures one architecturally significant decision — what was decided,
what alternatives were weighed, and what follows — so the reasoning survives the moment it was made.
This skill is the crisp playbook; the placement rules, lifecycle, frozen set, template, and a worked
example live in the references.

## When to use

- A change to an **accepted** spec clause that a `done` story depends on forces a new decision (a
  `done` story is immutable, so the decision must be recorded, not edited in).
- Implementation surfaced a genuine architectural fork the spec left open (a new module boundary, a
  bound handler surface, the `apperr` envelope shape, the persistence layout, the dependency
  direction, the token/theming layer, or a cross-cutting policy such as offline or multi-instance).
- You must **supersede** an existing ADR with a better decision.

## When NOT to use

- The choice is local and easily reversible → a code comment or the story's Design constraints.
- The spec already fixes the rule → cite the `DD-NN` design-decision id instead of re-deciding it.
- You are only *applying* an existing accepted ADR → just reference it in the story's `adrs:`.

## The three "when to write" tests

Write an ADR only when the decision meets **all three**:

| Test | Meaning |
|---|---|
| Architecturally significant | Affects a module boundary, a public contract, the persistence shape, the dependency direction, the theming layer, or a cross-cutting policy. |
| Costly to reverse | Undoing it later touches many modules or breaks a contract others rely on. |
| Not pre-settled by the spec | The spec leaves a real choice, or implementation surfaced one it did not anticipate. |

## Workflow

1. **Confirm it passes all three tests** and is not already fixed by a `DD-NN`. If a `DD-NN` settles
   it, cite that instead and stop.
2. **Take the next free id and the right folder.** New implementation ADRs continue at **ADR-0013+**
   in the mutable `docs/adr/`; the initial set **ADR-0001…0012** is frozen in
   `specification/08_Decisions/` and must never be added to. Full placement + id rules in
   `references/lifecycle-and-placement.md`.
3. **Draft from the template.** Copy `assets/adr-template.md` (which mirrors `docs/adr/template.md`);
   fill Context, Decision drivers, Considered options, Decision outcome + Consequences, Pros/cons, and
   Links (the `DD-NN`, constrained spec clauses, applying `STORY-NNN`). A full GoMarkEdit-flavoured
   worked example is in `references/template-and-example.md`.
4. **Set the status correctly.** `proposed` while under discussion; `accepted` once in force — only
   `accepted` ADRs are citable by a story's `adrs:`. Lifecycle in `references/lifecycle-and-placement.md`.
5. **If superseding:** the new ADR's `Supersedes:` names the old one; change **only** the old ADR's
   `Status:` line to `superseded by ADR-NNNN` (the sole edit ever made to an accepted body); keep the
   old file. Update both `README.md` index tables.
6. **Update the index** (`docs/adr/README.md`) with a row: `ADR | Title | Status | Supersedes |
   Superseded by`. Have the applying story reference the ADR in `adrs:` only once it is `accepted`.

## Reference Index

| Reference | Read it for |
|---|---|
| `references/lifecycle-and-placement.md` | Where ADRs live (`docs/adr/` vs frozen `08_Decisions/`), the four-digit permanent id rule, the status lifecycle, supersession mechanics, the frozen ADR-0001…0012 table |
| `references/template-and-example.md` | The full ADR template and a complete worked GoMarkEdit example (autosave atomic-swap) |
| `assets/adr-template.md` | The copy-to-start ADR skeleton (mirrors `docs/adr/template.md`) |

## Mandatory validation

- [ ] The decision passes all three "when to write" tests and is not already fixed by a `DD-NN`.
- [ ] Filename `NNNN-short-slug.md`; four-digit id, next in sequence, never reused; authored in `docs/adr/` (never in the frozen `specification/08_Decisions/`).
- [ ] All template sections present; `Status`, `Date`, `Deciders`, `Supersedes` set correctly.
- [ ] Links cite the `DD-NN`, the constrained spec clauses, and the applying `STORY-NNN`.
- [ ] If superseding: the old ADR's Status line updated (only that line); both `README.md` index rows updated.
- [ ] A story references this ADR in `adrs:` only once it is `accepted`.

## Gotchas

- **Adding a file to `specification/08_Decisions/`** — that folder is frozen; new ADRs go in `docs/adr/`
  starting at ADR-0013.
- **Citing a `proposed` / `superseded` / `deprecated` ADR** in a story's `adrs:` — only `accepted` is
  citable.
- **Editing an accepted ADR body** to "fix" the decision — the body is immutable; supersede it instead.
  The only permitted edit is the one-line Status change during supersession.
- **Reusing or renumbering an ADR id** — ids are permanent; always take the next free number.
- **Writing an ADR for a rule the spec already fixed** — cite the `DD-NN` instead.
- **Forgetting the index** — every new or superseded ADR must be reflected in the correct `README.md`.
