# Archived delivery documents

This directory is a historical archive of the former `docs/delivery/` specification, planning,
architecture, decision, and story material. It is retained so that historical links and decisions
continue to resolve. It is not normative and must not be edited to make the active specification or
its gates pass.

## Current authority

For the active feature, read both authorities at the repository root:

- `specs/<feature>/` — the active feature's specification, plan, tasks, contracts, and evidence
  rules. The selected feature is recorded in `.specify/feature.json`.
- `docs/architecture.md` — the repository-wide architecture map, owner inventory, lifecycle
  walkthrough, durable decisions, and open decisions.

When the archived material disagrees with either current authority, the current authority wins. New
work belongs in `specs/<feature>/` and in the current architecture map when it changes a durable
architectural fact.

## Known-issues reconciliation

The former `plan/KNOWN_ISSUES.md` contained the following 17 entries. Their dispositions are recorded
here so archiving the document does not silently lose the outcome of each issue.

|   # | Entry                                                                          | Disposition                                                                                   |
| --: | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
|   1 | A second `state:patch` subscriber is silently discarded                        | Removed: state-patch listeners are multiplexed with independent disposal.                     |
|   2 | The empty tab set will panic                                                   | Removed: zero-document state is supported.                                                    |
|   3 | The dev bridge mock disagrees with the Go backend about dirty state            | Removed with the mock bridge.                                                                 |
|   4 | The three-region shell is tested against a mock of itself                      | Fixed by the real App suite rewrite.                                                          |
|   5 | Line-ending and encoding labels fall back to raw catalog keys                  | Removed as stale; the catalog and backend status values are now aligned.                      |
|   6 | The visual layer was empty or incomplete                                       | Removed as stale; the token and theme work is part of the active implementation.              |
|   7 | A database test is flaky under CPU contention                                  | Fixed with bounded retry in the database helper.                                              |
|   8 | `internal/apperr` will become the shared-DTO dumping ground                    | Carried into `docs/architecture.md` as the open `apperr`/wire-package decision.               |
|   9 | CI only runs on a version tag                                                  | Removed; the push workflow runs the verification stages.                                      |
|  10 | `internal/gate` has no production caller                                       | Removed; the unused package was deleted.                                                      |
|  11 | `settingsAdapter` has no consumer                                              | Removed as stale.                                                                             |
|  12 | `just package` is a deliberate exit-1 stub                                     | Removed; the obsolete recipe was deleted.                                                     |
|  13 | Wails does not give a frameless window usable resize edges                     | Superseded: the native frame is kept, and the decision is recorded in `docs/architecture.md`. |
|  14 | STORY-058 was built from a truncated rule copy and an unreliable gate baseline | Removed; unreliable baselines are now rejected by the baseline/verification mechanism.        |
|  15 | `just archtest` runs in no CI job                                              | Removed; the push workflow includes the verification stages.                                  |
|  16 | A user-visible startup string disagrees between the specification and code     | Fixed by the per-step startup-failure messages.                                               |
|  17 | 114 `Proves:` tags name rules that do not exist                                | Removed with the obsolete `Proves:` tags.                                                     |
