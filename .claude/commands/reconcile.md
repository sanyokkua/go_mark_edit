---
name: reconcile
description: Close the loop after a phase — diff what shipped against the specification and the architecture rules, and resolve every difference in one of three named directions.
---

# Reconcile phase $ARGUMENTS

Drift is not caused by carelessness. It happens because implementation discovers things, and unless
each discovery is resolved deliberately the code and the specification quietly stop describing the same
product.

## 1. Diff

For every feature this phase touched, compare the shipped behaviour against its rules — and compare the
code against `docs/delivery/architecture/rules.md`.

```
git log --oneline <phase-start>..HEAD
git diff --stat <phase-start>..HEAD
just spec-check
just story-check NNN          # for every story in this phase
```

List, plainly:

- anything the code does that no rule says
- anything a rule says that the code does not do
- any rule whose `Enforced by` says a command, where that command does not actually cover it
- any entry in `frontend/scripts/archtest-allowlist.json` this phase should have shrunk and did not
- **any rule that reached a story as a truncated copy.** `just story-check NNN` reports it row by row.
  A rule copied with rows missing produced code missing exactly those rows, and the gap is invisible
  everywhere else. This is the highest-yield line in the whole command.

## 2. Resolve each one in exactly one direction

| | |
|---|---|
| **The document was right** | Fix the code. Raise a story if it is not small. |
| **The code was right** | **Propose** the document change and get approval. Do not just make it. |
| **Both were wrong** | It becomes an entry in the feature's `## Open questions`, with a recommendation and the cost of being wrong. |

There is no fourth option, and in particular there is no "update the docs to match what shipped" — that
is how a specification stops describing the product while still looking maintained.

A truncated copy is never resolved by editing the built story to look correct after the fact. A built
story is history. The missing behaviour becomes a **new story**, and the built one gets a line saying
what its copy lost.

Distinguish carefully:

- A **discovery** surfaces a constraint that was genuinely not visible before, is backed by evidence —
  a failing build, a platform limitation, a provider's actual behaviour, a measurement — and is
  recorded. "It was easier this way" is not evidence.
- An **unauthorised decision** changed an interface, a data shape, or an observable behaviour with no
  recorded rationale and no approval. That is a defect whether or not the code works.

## 3. Record

- An accepted specification edit gets a dated line in that feature file's `## Decisions`.
- An accepted architecture change writes a decision record in `docs/delivery/adr/` **and** updates
  `docs/delivery/architecture/rules.md` in the same commit. The record is the reasoning; the rule is the
  instruction, and only the instruction is injected into work. Number it from the highest in that
  folder — ids are never reused, including the eight that were deleted.
- A decision record is **superseded, never edited**. The replacement names the old one in `Supersedes:`,
  and the old one's `**Status:**` line becomes `superseded by ADR-NNNN`. That status line is the only
  edit ever made to an accepted record — that, and repointing a link whose target was renamed.
- New defects found by reading code go to `docs/delivery/plan/KNOWN_ISSUES.md`, each assigned to the
  phase where it becomes a bug rather than batched.
- Move finished stories to `docs/delivery/work/archive/`, and record any story-number discontinuity in
  `docs/delivery/work/archive/README.md` — a gap nobody explains reads as a lost file.
- Delete their baselines and every sidecar beside them: `.failing-tests`, `.findings`, `.commit`,
  `.exit` and the `.logs/` directory. Leaving one behind orphans it — `story-057.*` survived that way
  and nobody could say what it belonged to.

## 4. Report

Each difference, its direction, and what changed. Anything you could not resolve stays open and
visible — say so plainly rather than picking a side quietly.

Then end with exactly this:

> **Next:** approve or reject each proposed specification edit above. Nothing under
> `docs/delivery/spec/` or `docs/delivery/architecture/` changes without your say-so — that constraint
> is what keeps the documents worth reading.
>
> When the differences are resolved, run `/plan-phase <NN+1>` for the next phase in
> `docs/delivery/plan/roadmap.md`.
>
> Full workflow: `docs/delivery/WORKFLOW.md`
