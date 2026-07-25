---
description: Plan and build one story end to end — investigate, plan, implement, test, verify, close out.
argument-hint: <story number, e.g. 057>
allowed-tools: Read, Grep, Glob, Bash, Task, ExitPlanMode
model: opus
---

Plan the implementation of **story $1**.

You are read-only until the plan is approved. Do not write, edit, or create anything before
`ExitPlanMode`.

## 1. Read

- `docs/stories/story-$1-*.md` in full. It is self-contained by design — if you cannot tell what to
  build from the story alone, **that is a defect in the story**. Say so rather than going hunting.
- The `01_Product/` section and any `ADR-NNNN` / `DD-NN` it cites, for provenance. If the story and
  the specification disagree, stop and report it; do not silently pick one.
- The mockup screen it names.
- The `.claude/rules/*.md` whose globs match the files you will touch, and the `.claude/skills/` for
  the layers involved.

## 2. Investigate before you plan

Delegate to the `investigator` agent, or do it yourself for something small. You need:

- Every **reader** and **writer** of the state this story touches.
- Every **lifecycle boundary** it crosses — mount, unmount, tab switch, close, blur, quit.
- Every **sibling consumer** of a seam you are about to change.
- Every **competing async path** — debounces, in-flight requests, event handlers that can arrive out
  of order or after the thing they refer to is gone.

This is where implementations go wrong. A change that is correct in isolation and wrong on the fourth
tab switch is the normal failure mode here.

## 3. Turn stateful criteria into ordered sequences

For any acceptance criterion involving state, write the actual order of events — command, ack,
patch, render — and say what must be true between each pair. "It updates the tab" is not a plan;
"flush the outgoing buffer, await the ack bound to that document id and revision, then activate" is.

Name what happens when a step fails halfway.

## 4. Plan the implementation

Layer by layer, naming real files:

- Backend: which package, which service, what the bound handler returns (a concrete `apperr.*Result`,
  no `context.Context`, panics recovered to `CodeInternal`), and whether wiring in
  `internal/application` changes.
- Frontend: which adapter method, which slice, which component — and confirm nothing outside
  `logic/adapter/` imports `wailsjs/`.
- Whether any bound signature changes, and therefore whether `just gen` must run.
- Whether a migration is needed — additive only; a breaking one means stop and ask.
- Tokens for anything visual. No hardcoded colour.

## 5. Plan the tests — one per acceptance criterion

For each: tier (unit / integration / e2e), exact file path, exact test name, and the `Proves:` tag.

**Then check each proposed test against these, and reject it if it fails:**

- Does it assert the **final user-visible outcome**, or just that a function was called?
- Does it render the real component, or mock the thing under test?
- Does it cover the failure path, not only the happy one?
- Does it survive a remount, a retry, or an out-of-order completion?

A test that proves a symbol exists, that source text contains a string, or that a command was invoked
is not a test. Say so and replace it.

## 6. Plan the verification

- `just check` green — and if a file you touched has a lint or type finding, fixing it is part of this
  story, not a follow-up.
- What you will do **in the running app** to confirm the story's "What you'll be able to do" paragraph
  is actually true. Name the steps. This is the real gate; the tests are the safety net.

## 7. Plan the close-out

- Does anything in `docs/KNOWN_ISSUES.md` get fixed by this story? **Say so — do not edit it here.**
  This command is read-only, and no agent in the pipeline owns that file; the removal is a one-line
  edit for the user, or for you in a later turn.
- Does the phase document need a correction because reality differed from the plan? Same: name the
  correction, do not make it.
- **Do any later stories become wrong?** If this story changes a seam another story assumed, name it
  and say what needs rewording. Do not leave a story that no longer reads true, and do not rewrite one
  silently — surface it.

## 8. Present

The plan, the tests, the verification steps, the close-out, and anything you assumed. Then
`ExitPlanMode`.

On approval: `coder` implements exactly this story, `tester` writes the acceptance-criteria tests, and
for anything non-trivial `spec-conformance-reviewer` re-derives the criteria independently before you
call it done.
