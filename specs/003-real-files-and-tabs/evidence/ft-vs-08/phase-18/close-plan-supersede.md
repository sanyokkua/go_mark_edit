# The close-app trap — newest close request wins

**Requirement**: FR-FT-033 close-plan lifecycle, Constitution III (backend
authority) and V (unsaved work protected during close and shutdown).
**Decision**: session decision 4 — `PrepareClose` supersedes any existing plan
rather than refusing while one is collecting.
**Branch**: `feature/v1-implementation--003-close-plan-supersede`.

## What was actually broken

`AppModelService.activeClosePlan` is a **single-slot lock held across a human
decision**. `PrepareClose` set it; only `ResolveClosePlan`, `ExecuteClosePlan`
or an explicit cancel cleared it.

There was no release path for _abandonment_. Any route that dropped the close
prompt without sending a decision — a dismissed dialog, a reload, a renderer
error swallowed mid-flow — left `activeClosePlan` set for the life of the
process. Every later close then hit `close_plan.go:58`:

```
"Another close plan is already collecting choices."  (conflict / retry)
```

Both tab close **and** quit route through `PrepareClose`, so one abandoned
prompt made the window impossible to close. This is the same failure surface as
the `ClosePlanSummary.Targets` null defect fixed earlier in this feature: the
app stays open with no way out.

## The fix

`internal/appmodel/close_plan.go:51-75`. The single refusal became four
explicit cases:

| Existing active plan                  | Behaviour                                                                    | Why                                                                                                                                                    |
| ------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| id set, no plan behind it             | clear the id, continue                                                       | An orphaned id can only be a bug, and keeping it refuses every close forever.                                                                          |
| same revision + kind + targets        | return the existing plan                                                     | Idempotency. A repeated identical request must not throw away choices the user already answered.                                                       |
| status `executing`                    | **still refuses**                                                            | `ExecuteClosePlan` releases the mutex at `close_plan.go:288` and runs its saves without it. This is the one plan whose writes are genuinely in flight. |
| anything else (`collecting`, `ready`) | supersede: invalidate as `cancelled`, release reservations, delete, continue | Newest close request wins.                                                                                                                             |

### Why `executing` is excluded

Decision 4 says the newest request wins. Applied literally to an executing plan
it would violate Constitution V: `ExecuteClosePlan` drops the lock to perform
saves, re-acquires it, and re-checks `service.activeClosePlan != planID` at
`close_plan.go:318`. A superseding request during that window would leave the
first plan's saves already committed to disk but its tabs never closed — a
half-applied close with no error the user can act on.

Refusing during `executing` costs nothing: that state lasts only as long as the
writes, is not waiting on a human, and cannot be abandoned. The trap being fixed
is _abandonment_, which by definition cannot happen while the backend is
executing. The refusal message was narrowed to say what is actually happening
("A close is already saving; wait for it to finish.") instead of the misleading
"already collecting choices".

Superseded plans are also deleted from `service.closePlans`. Superseding is now
a common path rather than an error path, and every consumer of the map already
guards on `service.activeClosePlan != planID`, so a terminal superseded plan is
unreachable — keeping it would grow the map once per abandoned prompt.

## Evidence

Three tests in `internal/appmodel/close_plan_test.go`:

| Test                                                        | Proves                                                                                                                                                                                                             |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `TestPrepareCloseSupersedesAnAbandonedPlan`                 | A collecting plan that is never resolved is superseded by a later quit; the new plan carries both documents, the old plan is dead (`ResolveClosePlan` on it errors), and the quit executes to zero open documents. |
| `TestPrepareCloseRepeatedIdenticallyKeepsTheCollectingPlan` | An identical repeat returns the same plan id — collected choices survive.                                                                                                                                          |
| `TestPrepareCloseRefusesWhileAnotherPlanIsSaving`           | With a blocking write executor holding a save open, a second `PrepareClose` is refused with `ClassifiedConflict`, and the original execution then completes cleanly.                                               |

**The tests were confirmed to catch the bug, not merely to pass.** With the
production change stashed and the tests unchanged:

```
--- FAIL: TestPrepareCloseSupersedesAnAbandonedPlan (0.00s)
    close_plan_test.go:417: quit PrepareClose = {Data:<nil> Error:0x...},
        want the newest request to win
FAIL	github.com/sanyokkua/go_mark_edit/internal/appmodel
```

No existing test asserted the old refusal — it had no coverage at all, which is
why the trap survived. Nothing was skipped, narrowed or deleted.

## Live proof

Decision 4 requires proving this against `wails dev` rather than the mock
bridge. That walkthrough is batched with the other Phase 18 defect fixes and
recorded in `live-walkthrough.md`, because a single real-bridge session covers
all four and the mock bridge cannot reproduce this class of defect at all.
