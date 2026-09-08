---
name: build-story
description: Implement one story — refuse a stub, capture a trustworthy baseline before any edit, then build, then verify every Definition-of-Done item against it.
---

# Build story $ARGUMENTS

## 0. Refuse to build something that is not ready

Open `docs/delivery/work/story-$ARGUMENTS-*.md` and check all four. **Any failure is a stop, not a
warning.**

| Check | Stop if |
|---|---|
| Status | the file contains `**STATUS:** stub` |
| Constraints | there is no `## Technical constraints` section, or it is empty |
| Rules | a rule under `## What must be true when this is done` has no body — only a title and an anchor |
| Evidence | the Definition-of-Done rule-to-test table is missing or has no rows |

Any of those means `/plan-story $ARGUMENTS` has not run, or did not finish. Say which check failed and
stop. **Do not fill the gap yourself.** Inventing the missing half of a story is how a specification
becomes decoration — you would be authoring requirements inside an implementation session, with nobody
reviewing them and no record that it happened.

Then run:

```bash
just story-check $ARGUMENTS       # python3 scripts/check_story.py docs/delivery $ARGUMENTS
```

If it reports a copied rule that differs from its source, **stop and report that too.** Building from
a rule that lost a table row produces code that is missing exactly those rows, and every check after
this point will pass.

## 1. Baseline first, before any edit

```
just baseline STORY-$ARGUMENTS
```

It runs `just fmt-check`, `just typecheck`, `just lint`, `just test`, `just archtest`,
`just frontend-build` and coverage, and writes the commit, the timestamp, every failing test by name,
every static-analysis finding as `file:rule:message`, the coverage figure, **the exit code of every
gate and its reliability verdict** into `docs/delivery/work/baselines/story-$ARGUMENTS.md`. Each
gate's raw output is kept in `story-$ARGUMENTS.logs/` and is never deleted.

It exists so that "that was already failing" is a lookup rather than an argument, and so the gates can
be honest on a repository that already has findings.

### 1a. Check the baseline is trustworthy — this is not a formality

Read the baseline file. **Any of these is a hard stop:**

- **A gate exited non-zero but recorded zero findings.** It did not run clean — it crashed, it found
  no files to analyse, it hit a config error, or its output did not parse. A later diff against an
  empty baseline passes no matter what you write. This is not a degraded gate, it is a gate wired to
  ground, and it will report success for the rest of the story.
- **A gate is marked `UNRELIABLE`.** `baseline.sh` says so explicitly and exits 3.
- **A gate never ran** because an earlier one aborted the runner.
- **`just archtest` is failing**, or a test in the area this story touches is already broken.

When you hit one: **stop, report it, and say what you think is wrong.** Do not proceed and sort it out
later, do not proceed while noting it in the file, and do not treat an honest transcription of the
anomaly as having handled it. STORY-058 recorded *"`just lint` exit 5, 0 findings"* into its baseline
and built anyway; every later verify diffed empty against empty and printed PASS, and the story
shipped without ten theme tokens. A green report on top of a check that measured nothing is worse than
a red one, because nobody looks again.

File it in `docs/delivery/plan/KNOWN_ISSUES.md` with the location and the fix, then fix the gate
before building. A broken gate is a defect that outlives this story.

Paste the summary table into the story's Definition of Done.

## 2. Implement

Read the story. Everything you need is in it; if something is missing, that is a defect in the story —
report it rather than inventing an answer.

- Touch nothing outside `## Where the code goes` without saying so **before** you do it.
- Every test's first comment line carries `// Proves: <feature>#<anchor>`, and **the anchor must exist
  in the specification.** Do not invent one to cover a test that spans several rules — tag it with the
  rule it actually proves, or split the test.
- No placeholder, stub or no-op on a production path.
- **Do not assert on source text.** A test that greps a stylesheet, checks that a symbol exists, or
  confirms a function was called passes without the behaviour working. Assert what a user or a caller
  would observe.
- After any change to a bound method's name, parameters or return type, run `just gen` and commit the
  regenerated `frontend/wailsjs/` in the same change. `just gen-check` fails on drift.
- After any change under `internal/db/queries/` or `internal/db/migrations/`, run `sqlc generate` and
  commit `internal/db/store/`. Never hand-edit that directory.

**If a rule turns out to be wrong or impossible: stop and report.** Never weaken a rule, never suppress
an architecture test, never add a file to `frontend/scripts/archtest-allowlist.json`, and never edit
anything under `docs/delivery/spec/` or `docs/delivery/architecture/` to make the code correct. Those
are the moves that turn a specification into decoration.

**Never `--no-verify`. Never delete, skip or `.skip()` a failing test** to get a gate green. A failing
test is information; removing it destroys the information and keeps the defect.

## 3. Verify

```
just verify STORY-$ARGUMENTS
```

It re-runs the same commands, parses them identically, refuses outright if the baseline contains an
`UNRELIABLE` gate, and prints one row per mechanical item with PASS or FAIL, naming the specific new
finding or newly-failing test. It exits non-zero if any row fails and it never modifies source.

Every mechanical item is a **diff against the baseline** — no finding absent from it, every
baseline-passing test still passing — **except `just archtest`, which must be green outright**. It is
the only mechanical thing standing between an implementer and a design decision nobody approved, so it
is never diffed and never suppressed.

**A gate that exits non-zero fails, whatever the diff says.** An empty diff on a gate that crashed is
not a pass, and `verify.sh` now says so rather than printing PASS.

M12 resolves every tag you wrote, via `python3 scripts/check_proves.py docs/delivery internal
frontend/src .` — every `// Proves:` must point at a real anchor in a real feature file.

Individually if you need them: `just fmt-check` · `just typecheck` · `just lint` · `just test` ·
`just archtest` · `just frontend-build` · `just build`.

Four items are yours rather than the script's: **M7** every added or changed source file is touched by
at least one test, **M8** the diff introduces no unfinished marker or no-op return, **M11** anything
outside `docs/delivery/` that this story made stale is fixed, and **M13** every file touched appears in
`## Where the code goes`.

## 4. Fill in the Definition of Done completely

Every row gets a result. **A blank row is a failure, not an omission** — the rows most often left blank
are the walkthrough and the surface check, which are exactly the ones that catch what the automated
gates cannot see.

Walk the walkthrough on a real build and **record what you saw at each step**, not that you did it. If
a step produced something unexpected — a control in the wrong place, an overlap, a message that reads
wrong — that is a finding, and it goes into `docs/delivery/plan/KNOWN_ISSUES.md` before you report.
Evidence produced during the story and then not read is worse than no evidence.

## 5. Report

The pass/fail table, then:

- **Every file you touched**, checked against `## Where the code goes`. List anything outside it
  explicitly and say why. Silently widening the blast radius — editing `AGENTS.md`, adding behaviour to
  a shared component — is how a one-story diff becomes unreviewable.
- What you had to decide that the story did not cover. **Every entry here is a specification gap**, and
  it is cheapest to close now.
- Anything that belongs in `docs/delivery/plan/KNOWN_ISSUES.md`.

Then end with exactly this:

> **Next:** check the Definition of Done has no blank rows, and read the *"what I had to decide"* list
> above — each entry is a small gap in the feature file that will otherwise be rediscovered later at
> higher cost.
>
> Then run `/plan-story` for the next story in this phase — or `/finish-phase <NN>` if this was the
> last one.
>
> Full workflow: `docs/delivery/WORKFLOW.md`
