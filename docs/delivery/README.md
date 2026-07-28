# How to read this specification

Everything under `docs/delivery/` is the specification and the plan for GoMarkEdit.
Nothing outside it is normative.

## Where to start

**To know what the software does** — read `spec/product/`. One file per feature, in plain
prose. It is the real specification; everything else supports it.

**To know what it looks like** — open the artifact in `spec/surface/`.

**To know how it is built** — read `architecture/README.md` first. One page.

**To know what to build next** — read `plan/roadmap.md`, then the current phase file.

**To know how the process works** — read `WORKFLOW.md`: which command to run when, what each
one leaves on disk, and what to do when something goes wrong.

## The archive

`docs/_archive-2026-07-28-specification/` is the specification as it stood before the
conversion of **2026-07-28**. It is **historical and not normative** — it is kept so that a
citation in an accepted decision record or an archived story still resolves to the text it
was written against.

Nothing in it is maintained, and where it disagrees with `spec/` or `architecture/`, those
win. Do not write new work against it. Its retired `07_Phases/` documents were deleted
rather than archived; that set is in git at `e1bd33f`.

## Authority

`spec/` and `architecture/` are **normative**. They say what must be true. No story edits
them to agree with what was built; a needed change is raised, approved, then made.

Everything in `docs/` outside `delivery/` is **descriptive**. It says what is true, and is
updated freely whenever a change makes it stale.

`plan/` and `work/` are working state — created, consumed, archived.

## Arbitration

Where a feature file and a surface artifact disagree:

- on **shape** — what exists, what it is called, what order it is in, what it looks like —
  the surface artifact wins and the feature file is corrected.
- on **behaviour** — what happens, when, and why — the feature file wins and the artifact
  is corrected.

## Conventions

Rules are addressed by file and anchor: `product/<feature>.md#<rule-anchor>`. There are no
numeric requirement identifiers. Anchors are stable; renaming one is a breaking change to
every rule that cites it.

Tests name the rule they prove on their first line: `Proves: <feature>#<anchor>`.
