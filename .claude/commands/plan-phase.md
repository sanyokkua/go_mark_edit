---
name: plan-phase
description: Turn one phase into an ordered set of vertical stories. Reads the phase and every feature file it names, stops on unanswered questions, then writes one stub file per story.
---

# Plan phase $ARGUMENTS

Read, in full and before anything else:

- `docs/delivery/plan/phase-$ARGUMENTS-*.md`
- **every** feature file it names under `## Where the details are` — in full, not skimmed
- `docs/delivery/architecture/README.md`
- `docs/delivery/spec/constraints.md`
- the screens this phase touches in `docs/delivery/spec/surface/mockup.html`, opened in a browser at
  the deep links the feature files give (`mockup.html#material-light/<screen>`)

## 1. Stop and ask

If the phase has entries under `## Questions to settle first`, or if reading the feature files
surfaced a contradiction, **stop here and ask the user**.

One plain sentence per question, stated in the software's own terms — never as two anchors the reader
has to go and look up. Give a recommendation and the cost of being wrong.

> **When the app is quit while a window resize is still being debounced, is the final size stored?**
> The window's size is written after a pause, and quitting closes the database. If the flush runs after
> the close it writes to a closed handle and the size is silently lost on every quit.
> *Recommendation:* flush pending layout writes before closing the database, as one ordered shutdown.
> *Cost of being wrong:* the window forgets its size every time, which reads as the setting not working
> at all rather than as a race.

**Do not write a story on top of an unresolved contradiction.** When a question is answered, say which
file needs which edit — you do not edit `docs/delivery/spec/` or `docs/delivery/architecture/`
yourself. That is the user's decision to make and to see.

A feature file whose `## Open questions` section is not empty is not ready. Do not write a story
against it.

## 2. Slice vertically

Every story delivers something observable through a real entry point — something you could show
somebody in the running app. A story that delivers only a Go service, or only a React component, is
wrong: split the work differently rather than stacking layers.

In this codebase a vertical slice usually reaches: a handler in `internal/<pkg>/handler.go`, its
service, its envelope type in `internal/apperr/results.go`, the generated binding, an adapter method in
`frontend/src/logic/adapter/`, a slice in `frontend/src/logic/store/`, and a widget in
`frontend/src/ui/widgets/`. If a story touches only one end of that, ask what the user sees.

Order by dependency. Put something demonstrable as early as possible.

**Size ceiling.** A story owns **at most 5 rules**. Count them as you slice. If a story would own
more, split it — by state, by surface, by the order a user meets the behaviour — and say in the report
why you split it that way.

A story owning nine rules is not one story that is large. It is three stories that were never
separated, and it will be built as two-and-a-bit, with the remainder disappearing silently because
nothing downstream counts rules. STORY-058 owned nine rules and shipped without ten of the theme
tokens one of them names; that is what this ceiling exists to prevent.

## 3. Check coverage three ways

- **Forwards:** every rule in every feature file this phase names is owned by exactly one story.
- **Backwards:** read the feature prose again and ask what a user could do that no story delivers.
- **Edge cases:** every `## Edge cases` entry is owned, or explicitly deferred to the phase that takes
  it.

Then check the constraints: this phase's "Done when" paragraph names themes, keyboard reachability,
empty states, strings, notifications, limits and network. Every one of those needs a story that
delivers it — they are not a review pass at the end.

## 4. Write one stub per story

Create `docs/delivery/work/story-NNN-<slug>.md` for each story.

Numbering continues from the highest story in `docs/delivery/work/` and `docs/delivery/work/archive/`.
Numbers are never reused — the discontinuities so far are recorded in
`docs/delivery/work/archive/README.md`.

**Every stub has exactly this shape**, and the status line is mandatory:

```markdown
# STORY-NNN — <what it does>

**STATUS:** stub — not buildable. Run `/plan-story NNN` to expand.
**Phase:** $ARGUMENTS

## What you'll be able to do

<Two to four sentences of plain prose. Name the control, menu item or command, and what appears.
Someone who has not read the feature file must be able to judge from this alone whether the slicing
is right.>

## Rules this story owns

- **<Rule title, as a sentence>** — `spec/product/<feature>.md#<anchor>`
  <One sentence saying what the rule actually requires, in the software's own words, with its real
  values. Not a restatement of the title.>

## Shared constraints carried

- **<Constraint title>** — `spec/constraints.md#<anchor>`
  <One sentence, same rule.>

## Depends on

<Which earlier story must be built first, and what this one needs from it. Or "nothing".>
```

**A bare anchor is not a stub entry.** A list of `` - `feature.md#some-anchor` `` with no prose is the
exact artifact this whole standard exists to eliminate: a set of identifiers that neither a person nor
an agent can act on, and that hides how big the story really is. Every bullet carries its sentence.

The one-line summaries are for **judging the slicing**, not for building. `/plan-story` replaces them
with the full rule text copied verbatim. Do not try to copy whole rules here — a stub that looks
buildable but is not is worse than one that announces itself.

**Write the files as you go. Do not hold the plan in the conversation and do not use plan mode** — the
file on disk is the plan, and it is what the next session reads. If you are interrupted, the work so
far survives.

## 5. Report

- the story list, in dependency order, each with its one-line outcome **and its rule count**
- any story you split, and on what axis
- the coverage result for all three passes, plus the constraints pass
- every assumption you made, and every question still open

Then end with exactly this, filling in the first story number:

> **Next:** review the slicing above — this is the cheapest moment to disagree. Look for a story that
> delivers only a layer, and for anything in the phase's features that no story owns.
>
> When the slicing looks right, run `/plan-story NNN` for the first story in dependency order. Stories
> are expanded and built one at a time; do not expand them all now.
>
> Full workflow: `docs/delivery/WORKFLOW.md`
