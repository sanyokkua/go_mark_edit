---
description: Check whether a phase is actually finished, by using the app rather than validating documents.
argument-hint: <phase number, e.g. 04>
allowed-tools: Read, Grep, Glob, Bash, Task
model: opus
---

Check whether **phase $1** is finished.

This replaces the old `just phase-complete-check NN`. That command validated the shape of documents,
reported a phase complete while the test suite was red, and is gone. A person decides now — your job
is to make that decision easy and honest, not to declare it yourself.

## 1. The gates that are real

```bash
just check
```

Everything green, including anything you would be tempted to call pre-existing. Report the actual
output; do not summarise a failure as a warning.

## 2. Every story built

List the stories written for this phase and, for each, whether it is built. For each acceptance
criterion, name the test that proves it and confirm that test **exists and passes** — do not take the
story's Tests table on trust, go and look.

Flag any criterion whose test asserts a symbol exists, greps source text, mocks the component under
test, or checks that a function was called without asserting the user-visible outcome. Those are not
proof and should be reported as gaps, not ticked off.

## 3. Walk the "Done when" paragraph

Read the phase's **Done when** paragraph and do exactly what it says, in a real build:

```bash
just build
```

Launch the app. Perform each action in the paragraph. Report what happened — including anything that
worked but felt wrong, and anything you could not test on this machine.

Where a step cannot be checked here (another operating system, for example), say so plainly. Do not
imply it passed.

## 4. What is left over

- Anything in `docs/KNOWN_ISSUES.md` that this phase was supposed to fix and did not.
- Any question in the phase's **Questions to settle first** that was never actually answered.
- Anything the phase promised that quietly did not get built.

## 5. Report

```
## just check
<actual result>

## Stories and their proof
- STORY-NNN — built; AC-1..N proven by <tests>   (or: AC-3 has no real test — <why>)

## Done-when walkthrough
- <each step, and what actually happened>

## Not verifiable here
- <step, and why — e.g. needs Windows>

## Left over
- <unfixed known issue / unanswered question / unbuilt promise, or "none">

## Verdict
<finished / not finished, and the one sentence that decides it>
```

Then say plainly whether you would call it finished, and let the user make the call. If something is
not done, the answer is "not finished" — not "finished with caveats".
