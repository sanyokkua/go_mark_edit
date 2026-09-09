# Baseline — STORY-058

Captured by `just baseline STORY-058`. Do not edit by hand.

|              |                                                           |
| ------------ | --------------------------------------------------------- |
| commit       | `0a7f21d` (`0a7f21dde4b596faedd804175454d5f6ee8f1cbb`)    |
| captured     | 2026-07-28 18:44 UTC                                      |
| working tree | **dirty — uncommitted changes are part of this baseline** |
| coverage     | 69.0% (mean of 11 packages)                               |

## Gates

`clean` — exit 0. `ok-with-findings` — non-zero, but findings were extracted, so the gate ran.
`UNRELIABLE` — non-zero **and** nothing extracted: the gate did not analyse anything, and a
later diff against it would pass whatever is written.

| gate           | command               | exit | verdict | findings |
| -------------- | --------------------- | ---- | ------- | -------- |
| lint           | `just lint`           | 0    | clean   | 0        |
| test           | `just test`           | 0    | clean   | 0        |
| fmt-check      | `just fmt-check`      | 0    | clean   | 0        |
| typecheck      | `just typecheck`      | 0    | clean   | 0        |
| archtest       | `just archtest`       | 0    | clean   | 0        |
| frontend-build | `just frontend-build` | 0    | clean   | 0        |

Raw output for every gate is kept in `story-058.logs/`.

## Failing tests at baseline (0)

_(none)_

## Static-analysis findings at baseline (0)

A finding present here was not caused by this story. A finding absent here was.

_(none)_

---

## Re-captured 2026-07-28 — what this replaced, and why

**This file was regenerated. The original is in git.** It recorded:

| gate                          | exit                    | findings, as recorded |
| ----------------------------- | ----------------------- | --------------------- |
| static analysis (`just lint`) | non-zero — status **5** | **0**                 |
| tests                         | 0                       | 0                     |
| everything else               | 0                       | —                     |

A status of **5** with zero findings is the `UNRELIABLE` condition: the gate exited non-zero having parsed
nothing, so it analysed nothing. Recorded as "0 static-analysis findings at baseline", every later
`comm -13` diffed empty against empty and printed PASS. **M3 was never satisfied for STORY-058, and
could not have failed.** The story shipped without ten theme tokens and no gate could see it.

The re-capture was run against the same commit — `0a7f21d`, in a detached worktree — with the repaired
`scripts/baseline.sh`, which records an exit code and a reliability verdict per gate and keeps every
raw log in `story-058.logs/`. **`just lint` returns 0 at that commit**, so the original status **5** was
environmental — a tool or cache problem in the original session — not a property of the code. The
`.findings` file was empty then and is empty now, so no static-analysis finding was ever hidden.

Two notes on the re-capture itself, so the numbers above can be read honestly:

- **`working tree: dirty`** is the repaired `scripts/baseline.sh` copied into the worktree at
  `0a7f21d`, which predates it. Nothing under `internal/`, `frontend/src/` or `docs/delivery/spec/`
  differed from the commit.
- **The first re-run failed one test** — `TestWailsAppEmbedsFrontendAndBootsBlankView`, with
  `read embedded frontend/dist/index.html: file does not exist`. That was the baseline script's own
  ordering: `frontend/dist/` is gitignored and only `just frontend-build` produces it, so running
  `just test` first in a clean checkout fails a test that has nothing to do with any story.
  `baseline.sh` and `verify.sh` now run `frontend-build` first, as `just check` already did. The
  table above is from the corrected run.

**What this does not do.** It does not retroactively verify STORY-058. A baseline says what was
already broken before a story started; it cannot say what the story did. STORY-058's M3 was never run
against a working gate, and the honest position is that its Definition of Done is unfilled rather than
passed. What the story actually missed is recorded in the story file and in
`../../plan/KNOWN_ISSUES.md` item 14, and it is closed by STORY-062 — not by this re-capture.
