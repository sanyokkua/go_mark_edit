# How to read this specification

Everything under `docs/delivery/` is the specification and the plan for GoMarkEdit.
Nothing outside it is normative.

## Where to start

**To know what the software does** — read `spec/product/`. One file per feature, in plain
prose. It is the real specification; everything else supports it.

**To know what it looks like** — open the artifact in `spec/surface/`.

**To know how it is built** — read `architecture/README.md` first. One page.

**To know what to build next** — read `plan/roadmap.md`, then the current phase file.

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
