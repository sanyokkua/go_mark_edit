---
name: build-story
description: Implement one story — capture the baseline before any edit, build it, then verify every Definition-of-Done item against that baseline.
---

# Build story $ARGUMENTS

## 1. Baseline first, before any edit

```
just baseline STORY-$ARGUMENTS
```

It runs `just fmt-check`, `just typecheck`, `just lint`, `just test`, `just archtest`,
`just frontend-build` and coverage, and writes the commit, the timestamp, every failing test by name,
every static-analysis finding as `file:rule:message`, the coverage figure and each command's exit code
into `docs/delivery/work/baselines/story-$ARGUMENTS.md`. It always exits 0 — recording a red state is a
valid outcome, and it is the whole reason baselines exist.

Paste its summary table into the story's Definition of Done.

**If the baseline is red in a way that would mask this story's work — `just archtest` failing, or a
test in the area this story touches already broken — stop and say so.** Do not proceed and sort it out
later.

## 2. Implement

Read the story. Everything you need is in it; if something is missing, that is a defect in the story —
report it rather than inventing an answer.

- Touch nothing outside `## Where the code goes` without saying so.
- Every test's first comment line carries `// Proves: <feature>#<anchor>`.
- No placeholder, stub or no-op on a production path.
- After any change to a bound method's name, parameters or return type, run `just gen` and commit the
  regenerated `frontend/wailsjs/` in the same change. `just gen-check` fails on drift.
- After any change under `internal/db/queries/` or `internal/db/migrations/`, run `sqlc generate` and
  commit `internal/db/store/`. Never hand-edit that directory.

**If a rule turns out to be wrong or impossible: stop and report.** Never weaken a rule, never suppress
an architecture test, never add a file to `frontend/scripts/archtest-allowlist.json`, and never edit
anything under `docs/delivery/spec/` or `docs/delivery/architecture/` to make the code correct. Those
are the moves that turn a specification into decoration.

## 3. Verify

```
just verify STORY-$ARGUMENTS
```

It re-runs the same commands, loads the baseline, and prints one row per mechanical item with PASS or
FAIL, naming the specific new finding or newly-failing test. It exits non-zero if any row fails and it
never modifies source.

Every mechanical item is a **diff against the baseline** — no finding absent from it, every
baseline-passing test still passing — **except `just archtest`, which must be green outright**. It is
the only mechanical thing standing between an implementer and a design decision nobody approved, so it
is never diffed and never suppressed.

Individually if you need them: `just fmt-check` · `just typecheck` · `just lint` · `just test` ·
`just archtest` · `just frontend-build` · `just build`.

Three items are yours rather than the script's: **M7** every added or changed source file is touched by
at least one test, **M8** the diff introduces no unfinished marker or no-op return, and **M11** anything
outside `docs/delivery/` that this story made stale is fixed.

## 4. Report

The pass/fail table, then:

- what you changed, by path
- anything you had to decide that the story did not cover — those are defects in the story, name them
- anything you noticed that belongs in `docs/delivery/plan/KNOWN_ISSUES.md`
