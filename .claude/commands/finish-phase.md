---
name: finish-phase
description: Decide whether a phase is finished — run the gates, open every named test, then launch the real build and walk the "Done when" paragraph.
---

# Finish phase $ARGUMENTS

This is a human gate wearing a command. The verdict comes from using the software, not from a green
check.

## 1. Run the gates, paste the output verbatim

```
just check
```

which is `just gen-check`, `just frontend-build`, `just fmt-check`, `just lint`, `just typecheck`,
`just frontend-test`, `just go-vet`, `just archtest`, `just go-test`.

Then `just e2e-test` for the browser journeys.

Verbatim. Not "all passing" — the actual output, so the user can see what ran and what did not.

`just package` will fail until Phase 08 builds it. That is deliberate: naming a command that does not
exist is how a Definition of Done certifies something false.

## 2. Open every named test

For each story in this phase, take each rule in its Definition-of-Done table, **open the named test
file, and confirm the function exists and passes.**

A test count is not evidence. Say so plainly if you find any of these:

- a test that asserts a symbol exists, or that source text contains a string
- a test that asserts a function was called, without asserting what the user then sees
- a component test that mocks the component it claims to prove — this mistake is live in the repository
  today and is recorded in `docs/delivery/plan/KNOWN_ISSUES.md`
- a test that reads a document: story text, phase text, a decision record, the `justfile`, CI
  configuration or anything under `.claude/` are not test subjects
- a happy path with no precondition that could fail for an interesting reason

## 3. Walk "Done when" on a real build

```
just build
```

Launch the binary it produced — not `wails dev`, which uses the mock bridge for anything Playwright
touches and has a different log level, a different version string and a different configuration folder.

Work through the phase's "Done when" paragraph step by step and **report what actually happened at each
step** — not that you did it, what you saw.

That paragraph ends with the cross-cutting constraints: three themes across light and dark, keyboard
reachability with a visible focus ring, empty states with their exact wording, every string through
`t()`, the limits at their values, and five minutes with a network monitor showing nothing sent. Those
are part of the walk, not a separate pass.

Where a step is already a numbered row in `docs/delivery/plan/testing/live-plan.md`, run it. Where it is
not, do it by hand, and capture a screenshot for each step you drive. A self-report with no artifact is
not verification.

Add any rows this phase introduced to the live plan, and write the run up in
`docs/delivery/plan/testing/reports/<date>.md`, naming the commit under test and what was not run.
Skipping a case is a result — record it with the reason.

## 4. Verdict

- Which "Done when" clauses hold, and which do not.
- Unfixed known issues, and which phase takes each.
- Any question that got answered by guessing during the phase — those need a decision recorded now, in
  the feature file's `## Decisions` or as a decision record, not later.

**If something is not done, the answer is "not finished" — not "finished with caveats".** A phase that
ships with an asterisk teaches everyone that the gate is negotiable.
