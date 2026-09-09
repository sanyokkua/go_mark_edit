# Live testing

Some things about GoMarkEdit cannot be proven by a mocked bridge, and a few cannot be proven by any
automated test at all. This folder is where those are written down, executed, and recorded.

| File                   | What it is                                                               |
| ---------------------- | ------------------------------------------------------------------------ |
| `live-plan.md`         | The standing plan. Grows one section per phase.                          |
| `reports/`             | Dated records of actually running it, each naming the commit under test. |
| `tools/fault_proxy.py` | A reverse proxy that makes a provider fail on demand.                    |

## Why this exists at all

The phase documents already end with a paragraph a person executes by using the app. That is the right
idea, and this folder is what stops it from being executed once and forgotten.

The specification deliberately has **no completion validator and no evidence file** — roughly 2,000
lines of validators plus 2,200 lines of tests-for-validators were deleted on 2026-07-25 because they
validated the _form of documents_ rather than the _behaviour of the application_, and because one of
them reported a phase complete while the test suite was red. That decision stands.

But deleting the machinery left nothing at all in its place. A dated report in plain prose, naming a
commit, is not that machinery: it is cheap, it is written by a person who used the app, and in the
reference application we studied it is what actually found the bugs — a retry loop that ran four
attempts when the setting said three, an interface offering a timeout the backend rejected, five
distinct provider failures all surfacing as one indistinguishable error.

## What belongs here, and what does not

**Here** — anything a mocked bridge cannot produce:

- Real bytes on a real disk: encodings, line endings, atomic writes, file permissions.
- Two processes at once: the shared database, last-writer-wins, the same file open twice.
- The built binary rather than `wails dev`: production log level, window geometry restored before the
  window is shown, `OnBeforeClose` on a real quit, the `-Dev` folder split.
- A real LLM provider: model discovery, cold-start latency, tool-call support, context overflow.
- Anything about the platform: the print dialog, the native macOS menu, file associations.

**Not here** — anything a test can assert. If a finding from this folder can be turned into an
automated test, it must be, and the report cites the test's path. The plan is for finding things, not
for re-checking things already found.

## The three rules

1. **A filed report is never edited.** It is what was observed on a date, against a commit. Corrections
   go in the next report.
2. **Every confirmed finding gets an automated test**, and the report names its path. A finding without
   a test is a finding that will happen again.
3. **A gap in the plan is fixed in the same change that found it**, and the plan's changelog records
   what changed. This is what stops "the plan is out of date" from becoming permanent.

## Assert on mechanism, not on model content

This rule is written here **before** the first assertion against an LLM response is written, because
afterwards it is too late.

A small local model will produce a poor rewrite. That is not a test failure — the app's job is to send
the right request, apply the reply as a reviewable proposal, and report honestly what happened. Assert
on **that**: that exactly one request was sent, that the proposal was not applied without confirmation,
that the diff matched the reply, that cancelling produced one terminal outcome.

Model output is still worth recording, but **separately from pass/fail**, in a "model behaviour"
section: action, model, input, output, and a judgement. That table is exploratory signal — it is how
you discover that a model emits your out-of-band error sentinel on perfectly ordinary input, which is
a real finding from the reference application and one no unit test would have surfaced.
