---
description: Turn one phase into a complete, ordered set of stories. Read-only until approved.
argument-hint: <phase number, e.g. 04>
allowed-tools: Read, Grep, Glob, Bash, Task, ExitPlanMode
model: opus
---

Plan the stories for **phase $1**.

You are read-only until the plan is approved. Do not write, edit, or create anything before
`ExitPlanMode`.

## 1. Read

- `specification/07_Phases/PHASE_$1_*.md` — in full.
- **Every** `01_Product/` file it points at, in full. This is where the behaviour actually lives; the
  phase document is a plan, not a specification.
- The mockup screens it names. Open `specification/mockups/gomarkedit-mockup.html` and look at them.
- Any `ADR-NNNN` and `DD-NN` it names.
- `docs/KNOWN_ISSUES.md` — check whether any entry belongs to this phase.
- `docs/stories/README.md` — the story format you will be writing.

## 2. Stop if the phase has unanswered questions

The phase's **Questions to settle first** section exists because two accepted documents disagree, or
because something was never specified. If any of them affects the stories you are about to write:

**Stop and ask the user.** Present each question in one plain sentence with your recommendation and
what it would cost to be wrong. Do not invent an answer, do not pick the more convenient reading, and
do not write a story on top of an unresolved contradiction — that is how the previous plan accumulated
30 of them.

When answered, the answer has to land somewhere. **You cannot write it yourself** — this command is
read-only and no agent in the pipeline may write to `specification/`. Present the answer and say
exactly which file needs which edit, so the user can make it (or approve you doing it in a later,
non-plan turn). If the decision constrains the architecture it also wants an ADR, which `architect`
can write to `docs/adr/`.

## 3. Find out what already exists

Delegate to the `investigator` agent: what of this phase is already built, partly built, or stubbed?
Name real files and symbols. You are slicing work against a real codebase, not a blank one.

## 4. Slice it

**Vertically, by what a person can do.** Each story ends with something you can run and try. A story
that delivers only a backend service, or only a component, is wrong — backend and UI land together.

The test for each: *after this ships, can I state in one sentence a new thing the user can do?*

- One story per step in the phase's "Build it in this order", unless a step is plainly two things.
- Order them so each depends only on what came before. Say what each depends on in prose.
- One coding session each. More than about six acceptance criteria means split it.

## 5. Check coverage before you present

Three passes. Report each explicitly — "I checked and found nothing" is a valid result, silence is not.

- **Forwards** — every step in the phase's build order is covered by at least one story.
- **Backwards** — walk the `01_Product/` sections the phase cites, paragraph by paragraph, and find the
  story that owns each stated behaviour. Anything unowned is a gap: either add a story or say plainly
  that it is deferred and to where.
- **Edges** — the failure cases in those product files: what happens when the file is missing, the
  disk is full, the user cancels, two things arrive out of order. Each needs an owner.

Also check the phase's **Done when** paragraph: if you did everything you are proposing, would it be
true? If not, something is missing.

## 6. Present

- The story list: id, one-line "what the user can do", what it depends on.
- The coverage report from step 5, including anything deliberately left out.
- Anything you had to assume, and what would change if the assumption is wrong.

Then `ExitPlanMode`. On approval, delegate to the `architect` agent to write the files — it holds the
rule that stories must be fully worded rather than collections of citations.
