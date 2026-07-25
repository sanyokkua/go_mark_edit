# Stories

One file per story: `story-NNN-short-slug.md`. **The next free id is STORY-057.**

Ids are permanent and never reused, including by stories that were withdrawn. 001–051 were used and
either shipped (now in `archive/`) or deleted on 2026-07-25; 052–056 were drafted the same day and
withdrawn before they landed. So the next id is 057, not 052 and not 032 — do not derive it by
globbing this folder, which is currently empty of stories.

A story is **one coding session** and describes **one thing a person can do with the app**. It is
written to be read once, on its own, by someone who has not seen the specification. If a reader has
to open another document to understand what is being built, the story is not finished.

## Format

```markdown
# STORY-NNN — <what the user can do>

## What you'll be able to do
Plain prose. Concrete. Name the menu item, the keystroke, what appears on screen.

## How it should behave
Spell out every rule — the exact strings, the numbers, what happens on failure. Do not cite a
spec clause and expect the reader to go and read it. Copy the rule in.

## What it looks like
Which screen of `specification/mockups/gomarkedit-mockup.html` this matches.

## Acceptance criteria
**AC-1** — Given …, when …, then …
(numbered, each independently testable)

## Out of scope
Name the story that owns each adjacent thing.

## Technical notes
The constraints that apply: layering, the Result envelope, adapter-only bridge imports,
token-only styling, offline.

## Tests
| AC | Tier | File | Name |
(one row per acceptance criterion)

## Done when
Every AC has a passing test, `just check` is green, and you can do the thing at the top
in a real build.
```

## Two rules

1. **One test per acceptance criterion** — unit, integration or e2e, listed in the story's Tests table.
2. **`// Proves: STORY-NNN-AC-N`** on the test's first comment line (Go) or in the test name (Jest),
   so a failure tells you which requirement broke. A convention, not a validated graph.

## What this deliberately does not have

No front-matter schema, no `spec_clauses` or `phase_requirements` lists, no `Satisfies:` markers, no
status board, no generated traceability record, no S/M/L gating, no lifecycle states. A story is a
file. Whether it is done is visible from git and from running the app.

Stories come from the phase documents in `../../specification/07_Phases/`. Answer the phase's open
questions first, then write one story per usable slice.

`archive/` holds the 25 completed Phase 00/01 stories in the retired format.
