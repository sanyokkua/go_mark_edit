# SC-FT-002 explicit-save timings, by a method that can measure them — 2026-08-15

T105 exists because the 2026-08-14 screen-automation run could not produce this figure. Its
recorded 6.070 s for `fixture-a.md` was overwhelmingly a scripted wait plus tool round-trip
latency, and `walkthrough-2026-08-14-automated.md` refused to record it as an SC-FT-002 timing
rather than passing it off as one. That refusal was correct: the keystroke and the observation sat
on opposite sides of a tool boundary, so the number measured the harness, not the application.

T105 offered two routes — a person with a stopwatch, or T024's native-evidence timing harness
pointed at the explicit-save path. This is the second.

## The measurement

Scenario `explicit-save-latency`, `cmd/native-evidence/explicit_save_latency_scenario.go`.
Run 2026-08-15, darwin/arm64, via
`go test -tags native_evidence ./cmd/native-evidence -run TestExplicitSaveWalkthroughTimesBothSCFT002Fixtures -v`.

| Fixture | Shape                                                                         | dispatch→commit | dispatch→confirmation | fixture span | ready→confirmation | On disk | Origin          | Within 30 s |
| ------- | ----------------------------------------------------------------------------- | --------------: | --------------------: | -----------: | -----------------: | ------: | --------------- | ----------- |
| **A**   | new untitled → one representative line → Save As into a fresh empty directory |       13.686 ms |             13.803 ms |    14.114 ms |          14.115 ms |    43 B | `save-as`       | **yes**     |
| **B**   | open a 1,024-byte fixture → change exactly one character → explicit Save      |        9.181 ms |              9.230 ms |     9.647 ms |         248.001 ms | 1,024 B | `explicit-save` | **yes**     |

Both fixtures clear the 30-second budget by roughly three orders of magnitude.

Fixture B's `ready→confirmation` of 248 ms is larger than its own span because **both fixtures share
one process**, so it contains Fixture A's entire walkthrough. The budget is deliberately checked
against that conservative number; `fixtureToConfirmationNs` is the isolated figure. Strictly,
SC-FT-002 reads as one launch per fixture, and this harness does not split it that way.

## What is actually being timed

`t0` is stamped in Go immediately before the `Save`/`SaveAs` call. The commit stamp comes from the
write-commit observer. The confirmation stamp is taken when the successful `apperr.WriteResult`
carrying the FR-FT-015 payload returns to the caller. Same process, `time.Now()` at both ends,
monotonic component preserved — no scripted wait and no tool round trip anywhere inside the
interval, which is the whole point.

The path is the production one: the real `internal/appmodel` constructors, the real write
coordinator, and `internal/file`'s atomic replace. Commits are filtered by origin — only
`SaveOriginSaveAs` and `SaveOriginExplicitSave` are timed; autosave, open and reload commits are
counted into `ignoredCommits` and never timed. That filter is what makes this an _explicit-save_
measurement rather than a repeat of T024.

## SC-FT-002's directory obligation, enforced rather than described

The criterion requires a non-recursive snapshot of the target file's immediate parent before and
after, permits only the target file to differ, and fails on any leftover — including the FR-FT-009
atomic-replace temporary.

The harness takes both snapshots (name, kind, size, permission mode, SHA-256) and enforces two
clauses: every before/after difference must be the target file, and no entry other than the target
may survive. Leftovers are classified — `.gomarkedit-*` named as the FR-FT-009 temp, plus dotfile,
`.tmp`, `.swp`, `.bak`/`~`. A violation fails the row and the report.

This is proved by a negative test, not asserted:
`TestExplicitSaveWalkthroughFailsWhenAnArtifactSurvivesTheConfirmation` plants
`.gomarkedit-leftover` in the target directory during the Save As and asserts the row goes
`failed`, the error names the artifact, and the report goes `status: failed` — **while separately
asserting the write itself still committed**, so the failure is provably the directory clause and
not a broken save.

Nine tests cover the scenario, including a byte-level check that Fixture B differs from its
baseline in exactly one byte (measured, not assumed), monotonic ordering across all four stamps,
the origin filter, and a non-recursive-snapshot guard.

## What this does not measure — read before citing a number

1. **No human, and no input stack.** The representative line is applied with one `UpdateBuffer`
   command, not keystrokes. No window-server input latency, no webview event loop, and no rendering
   of the confirmation toast is inside any interval. This is ready→**backend** confirmation, not
   ready→user-sees-confirmation.
2. **Not the `just build` artifact.** It is the `native_evidence`-tagged driver — the same
   limitation T024's autosave harness carries. The write path is byte-identical; the driver is not.
3. **Not a stopwatch on the packaged `.app`.** Process launch and Wails startup precede `readyAt`
   by construction, so "ready" is honoured in the sense of _ready_, not _launched_.
4. **One process, two fixtures**, as described above.

Every one of these is also written into the report's own `metadata` (`measurementScope`,
`readyDefinition`, `fixtureSequencing`, `limitation`), so the numbers cannot be picked up without
the caveat attached.

## What remains owed

The harness has not been executed against the **windowed release binary**. That needs an evidence
bundle built with `NATIVE_EVIDENCE_SCENARIO=explicit-save-latency` against
`frontend/evidence/vite.config.ts` and a GUI session; the numbers above come from the Go tests
driving the same scenario code in-process. The process exits non-zero if either fixture fails, so
the operator step is a single run, not a judgement call.

Given the margin — 14 ms and 10 ms against a 30,000 ms budget — the conclusion that the
application's own contribution cannot threaten SC-FT-002 does not depend on that run. What the run
would add is the launch-to-ready segment and the input stack, which are the parts this method
explicitly excludes.
