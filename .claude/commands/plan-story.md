---
name: plan-story
description: Expand one story stub in place — feature rules copied in whole, architecture rules injected by path-glob match, and a rendered Definition of Done naming a test per rule.
---

# Plan story $ARGUMENTS

The output is one file that a stranger could build from with nothing else open. That is the bar, and
it is testable: hand it to a fresh session and see whether the first thing it does is search the
repository for basic facts.

## 0. Open the right file, and only that file

```bash
ls docs/delivery/work/story-$ARGUMENTS-*.md
```

**Exactly one file must match.**

- **No match** — stop. The stub does not exist. Either the number is wrong or the phase was never
  planned. Say which, and do not create a story from nothing.
- **More than one match** — stop and report the collision.

Read it. **You are expanding this file in place.** You are not writing a new file, and you are not
working on a different story because it looked more tractable or better specified.

**Before you write anything, state the story number and title you are about to expand.** If that title
is not the one the user meant, they will say so now rather than after 300 lines. Drifting from
$ARGUMENTS to another number is a silent failure — the commit message says one thing and the diff does
another.

Then read: the stub's `## Rules this story owns`, the feature files those anchors live in, the phase
file, `docs/delivery/architecture/structure.md`, `docs/delivery/architecture/rules.md`, and the code
the story will touch.

## 1. Check the size before you expand

Count the rules the stub owns. **More than 5 is a defect in the phase plan, not a large story.** Stop
and propose the split: which rules stay, which move to a new story, what number it gets, and what
changes in the phase's story list. Let the user decide, then act.

A story with nine rules gets built as five-and-a-bit. Nothing downstream counts rules, so the
remainder disappears without a single check failing — which is exactly what happened to STORY-058.

## 2. Investigate

This repository already has an implementation, so `## How it works now` is **mandatory** in every
story. For anything that already exists, find every reader, every writer, and every lifecycle
boundary — what happens on restart, on cancel, on a failed write, on a tab switch mid-debounce. Name
files and line numbers.

## 3. Copy the rules in — whole, not summarised

Every rule the story implements is **copied whole** from its feature file, with its anchor and a note
saying where it came from. Never cite and expect the reader to go and read.

```markdown
### Line endings and a byte-order mark survive a round trip {#line-endings-and-bom-are-preserved}
*(from `spec/product/opening-and-saving-files.md#line-endings-and-bom-are-preserved` — copied verbatim)*
- New files are written **UTF-8** with **LF** line endings and no byte-order mark.
- **When** an existing file is opened, its line endings are detected and preserved on save: a file
  opened with CRLF is saved with CRLF.
…
Examples: a Windows file with CRLF, edited one line, saved → every line still CRLF …
```

**Copy means copy.** Every clause, every table row, every example, every backtick, every value.
Specifically:

- **A table is copied with all of its rows.** Twenty-four rows in, twenty-four rows out. Truncating a
  table is not copying it, and a truncated table is invisible downstream: the implementer builds
  exactly what is in front of them, every test passes, and the missing rows are simply never built.
  `themes-and-appearance.md#theme-identity-is-stable` reached STORY-058 with 11 of its 24 rows, and
  the ten tokens named in the missing rows have **zero** occurrences in the shipped `tokens.css`.
- **Do not tidy, shorten, reword, reorder or "clean up" a rule.** If the rule reads badly, that is a
  defect in the feature file and it goes back — you do not fix it here, because a fix here is a fork.
- **Do not merge two rules** because they seem related. One rule, one anchor, one block.
- **Do not drop the examples.** They are the boundary values; they are the most-copied and
  least-remembered part of a rule.

**Then diff what you wrote against the source, before moving on.** Count the lines of each rule in the
feature file and the lines you wrote. Count table rows on both sides. State both counts in your
report. If they differ, you have lost something — go back.

```bash
just story-check $ARGUMENTS       # python3 scripts/check_story.py docs/delivery $ARGUMENTS
```

Run it. It does this comparison mechanically. A clean run is not optional.

## 4. Decide where the code goes

Use `docs/delivery/architecture/structure.md` — in particular its "Where a new thing goes" table. List
real paths, one line each, saying what changes there.

Be complete. This list is what drives the next step, and a path you forget to declare is an
architecture rule you never receive.

The module paths in this project are:

- Go: `internal/apperr`, `internal/bootstrap`, `internal/logging`, `internal/file`, `internal/db`
  (with `internal/db/queries/`, `internal/db/migrations/`, `internal/db/store/`), `internal/settings`,
  `internal/appmodel`, `internal/gate`, `internal/application`, and `main.go`. Planned:
  `internal/docs`, `internal/recent`, `internal/workspace`, `internal/assets`, `internal/export`,
  `internal/fileassoc`, `internal/llm/…`.
- Frontend: `frontend/src/logic/adapter`, `frontend/src/logic/store`, `frontend/src/logic/hooks`,
  `frontend/src/logic/markdown`, `frontend/src/logic/theme`, `frontend/src/logic/utils`,
  `frontend/src/ui/styles`, `frontend/src/ui/primitives`, `frontend/src/ui/components`,
  `frontend/src/ui/widgets`, `frontend/src/ui/fonts`, `frontend/src/i18n`,
  `frontend/src/dev/bridge-mock`, `frontend/src/test`.

## 5. Inject the architecture rules — mechanically, and show your work

Match the paths from step 4 against every `Applies to` glob in `docs/delivery/architecture/rules.md`,
and copy each matching rule into a `## Technical constraints` section — verbatim, with its anchor, its
`Enforced by`, and its `Do instead of` line.

**This is a glob comparison, not a judgement, and you must demonstrate that you performed it.**
Produce the match table before you write the section — every rule in `rules.md`, its glob, and matched
or not-matched:

| Rule anchor | Applies to | Matched by | Injected |
|---|---|---|---|
| `#no-background-network` | `**` | every path | yes |
| `#only-the-adapter-imports-wailsjs` | `frontend/src/**` | `frontend/src/logic/adapter/theme.ts` | yes |
| `#migrations-only-add` | `internal/db/migrations/**` | — | no |

Two things this table catches, both of which have happened:

- **A glob of `**` matches everything and can never fail to match.** If a universal rule is not in
  your injected set, you did not run the comparison — you skimmed.
- A rule matched but not injected is a rule the implementer never sees, and no downstream check will
  ever mention it.

A story touching `internal/settings/handler.go` gets `#handler-returns-a-result`,
`#bound-handlers-take-no-context`, `#panic-becomes-internal-error`, `#one-hop-per-layer`,
`#logs-stay-local` and the persistence rules — not all thirty-five.

Then link the patterns that apply, from `docs/delivery/architecture/patterns/`:
`adding-a-backend-vertical.md`, `adding-a-migration.md`, `adding-a-theme-token.md`,
`extending-the-markdown-pipeline.md`, `adding-a-provider.md`, `writing-a-test.md`. Patterns are
**linked**, not copied — they are the layer a reader can skip.

If the paths match no rule and the story is not creating a new module, say so — either the rules have
a gap or the work is somewhere nothing governs.

## 6. Render the Definition of Done

From `docs/delivery/work/DOD_TEMPLATE.md`. Fill the rule-to-test table with a **specific test file and
function name** per rule — not "a unit test".

Where tests go in this project:

- Go: beside the code, `internal/<pkg>/<file>_test.go`. Table-driven, run under `-race`, faked at the
  package's own interface. Architecture invariants go in `architecture_test.go` at the repository
  root, with a function name starting `TestArchitecture`.
- Frontend: beside the component, `frontend/src/**/<Name>.test.tsx`. Render the subject, never mock
  it; mock at `logic/adapter`, never at `wailsjs/`; query by accessible role, label or text. Shared
  test helpers live in `frontend/src/test/`.
- Whole journeys: `frontend/e2e/*.test.ts`, run by `just e2e-test`. Playwright drives the mock bridge,
  not the real one — that divergence is recorded in `docs/delivery/plan/KNOWN_ISSUES.md`.
- Anything a mocked bridge cannot prove — real bytes on disk, two processes, a real provider, the
  packaged binary — is a numbered row in `docs/delivery/plan/testing/live-plan.md`, not a test.

Every test carries `// Proves: <feature>#<anchor>` on its first comment line — for example
`// Proves: opening-and-saving-files#line-endings-and-bom-are-preserved`. **Every anchor in that table
must exist in the specification.** `just spec-check` resolves every tag in the tree; an invented
anchor produces a test that proves nothing and a tag nobody can follow.

**Name what the tests must not do**, per rule where it matters: not asserting that a symbol exists,
not asserting that source text contains a string, not asserting that a function was called. Those pass
without the behaviour working, and they are the default an implementer reaches for when the real
assertion is awkward.

Add an optional M-item only if this story genuinely needs one: a migration, a new surface, a long
operation that takes the gate, packaging, a stated performance budget.

## 7. Write the walkthrough and the unblocks

A numbered do-this / expect-that sequence a person runs on a real build, using the words the user
would read. Include at least one negative assertion and at least one boundary value at the value, not
near it.

Then name what the next story needs from this one.

## 8. Remove the stub marker

Delete the `**STATUS:** stub` line and replace it with:

```markdown
**STATUS:** planned — ready to build.
**Phase:** <NN>
```

`/build-story` refuses anything still marked as a stub, so leaving the line in place is how a
half-finished expansion stays safely un-buildable.

## 9. If you cannot make it self-contained

**Say so instead of going hunting.** A story that cannot be written self-contained means the feature
file is missing something, or the architecture rules do not cover the paths. That is a defect
upstream, and it goes back rather than getting papered over.

Write the file to `docs/delivery/work/story-$ARGUMENTS-<slug>.md`. **Do not use plan mode** — the file
on disk is the plan.

## 10. Report

- the story number and title you expanded — the same one you announced in step 0
- per rule: source line count vs copied line count, and table rows on both sides
- the architecture match table from step 5
- the output of `just story-check $ARGUMENTS`
- anything you could not resolve

Then end with exactly this:

> **Next:** confirm `just story-check $ARGUMENTS` is clean, then read the story once as if you had
> never seen the project. If you find yourself needing another file open, say so — that is a planning
> defect, not something to work around.
>
> When it reads clean, run `/build-story $ARGUMENTS`.
>
> Full workflow: `docs/delivery/WORKFLOW.md`
