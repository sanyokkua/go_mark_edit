---
name: plan-story
description: Write one self-contained story — feature rules copied in verbatim, architecture rules injected by path-glob match, and a rendered Definition of Done naming a test per rule.
---

# Plan story $ARGUMENTS

The output is one file that a stranger could build from with nothing else open. That is the bar, and
it is testable: hand it to a fresh session and see whether the first thing it does is search the
repository for basic facts.

## 1. Investigate

Read the feature file, the phase, and the code the story will touch.

This repository already has an implementation, so `## How it works now` is **mandatory** in every
story. For anything that already exists, find every reader, every writer, and every lifecycle
boundary — what happens on restart, on cancel, on a failed write, on a tab switch mid-debounce. Name
files and line numbers.

## 2. Copy the rules in, verbatim

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

## 3. Decide where the code goes

Use `docs/delivery/architecture/structure.md` — in particular its "Where a new thing goes" table. List
real paths, one line each, saying what changes there.

The module paths in this project are:

- Go: `internal/apperr`, `internal/bootstrap`, `internal/logging`, `internal/file`, `internal/db`,
  `internal/settings`, `internal/appmodel`, `internal/gate`, `internal/application`, and `main.go`.
  Planned: `internal/docs`, `internal/recent`, `internal/workspace`, `internal/assets`,
  `internal/export`, `internal/fileassoc`, `internal/llm/…`.
- Frontend: `frontend/src/logic/adapter`, `frontend/src/logic/store`, `frontend/src/logic/hooks`,
  `frontend/src/logic/markdown`, `frontend/src/logic/utils`, `frontend/src/ui/styles`,
  `frontend/src/ui/primitives`, `frontend/src/ui/components`, `frontend/src/ui/widgets`,
  `frontend/src/i18n`, `frontend/src/dev/bridge-mock`.

## 4. Inject the architecture rules

Match those paths against every `Applies to` glob in `docs/delivery/architecture/rules.md`, and copy
each matching rule into a `## Technical constraints` section — verbatim, with its anchor, its
`Enforced by`, and its `Do instead of` line.

This is a glob comparison, not a judgement. A story touching `internal/settings/handler.go` gets
`#handler-returns-a-result`, `#bound-handlers-take-no-context`, `#panic-becomes-internal-error`,
`#one-hop-per-layer`, `#logs-stay-local` and the persistence rules — not all thirty-five.

Then link the patterns that apply, from `docs/delivery/architecture/patterns/`:
`adding-a-backend-vertical.md`, `adding-a-migration.md`, `adding-a-theme-token.md`,
`extending-the-markdown-pipeline.md`, `adding-a-provider.md`, `writing-a-test.md`. Patterns are
**linked**, not copied — they are the layer a reader can skip.

If the paths match no rule and the story is not creating a new module, say so — either the rules have
a gap or the work is somewhere nothing governs.

## 5. Render the Definition of Done

From `docs/delivery/work/DOD_TEMPLATE.md`. Fill the rule-to-test table with a **specific test file and
function name** per rule — not "a unit test".

Where tests go in this project:

- Go: beside the code, `internal/<pkg>/<file>_test.go`. Table-driven, run under `-race`, faked at the
  package's own interface. Architecture invariants go in `architecture_test.go` with a function name
  starting `TestArchitecture`.
- Frontend: beside the component, `frontend/src/**/<Name>.test.tsx`. Render the subject, never mock it;
  mock at `logic/adapter`, never at `wailsjs/`; query by accessible role, label or text.
- Whole journeys: `frontend/tests/*.spec.ts`, run by `just e2e-test`.
- Anything a mocked bridge cannot prove — real bytes on disk, two processes, a real provider, the
  packaged binary — is a numbered row in `docs/delivery/plan/testing/live-plan.md`, not a test.

Every test carries `// Proves: <feature>#<anchor>` on its first comment line — for example
`// Proves: opening-and-saving-files#line-endings-and-bom-are-preserved`.

Add an optional M-item only if this story genuinely needs one: a migration, a new surface, a long
operation that takes the gate, packaging.

## 6. Write the walkthrough and the unblocks

A numbered do-this / expect-that sequence a person runs on a real build, using the words the user
would read. Include at least one negative assertion and at least one boundary value at the value, not
near it.

Then name what the next story needs from this one.

## 7. If you cannot make it self-contained

**Say so instead of going hunting.** A story that cannot be written self-contained means the feature
file is missing something, or the architecture rules do not cover the paths. That is a defect
upstream, and it goes back rather than getting papered over.

Write the file to `docs/delivery/work/story-$ARGUMENTS-<slug>.md`. **Do not use plan mode** — the file
on disk is the plan.
