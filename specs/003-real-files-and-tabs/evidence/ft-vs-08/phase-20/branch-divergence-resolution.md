# Branch divergence — measurement and approved resolution

Date: 2026-08-14 · Finding: Phase 20 / T094 (CRITICAL, Constitution I)

## The contradiction

Two lineages of Feature 003's authority artifacts existed at once. Constitution I makes
`spec.md` and `tasks.md` the authority and says a discovered contradiction stops delivery until
it is explicitly resolved and approved. This is that resolution, recorded before the merge rather
than implied by it.

|                                              | Task-branch chain                  | `feature/v1-implementation`      |
| -------------------------------------------- | ---------------------------------- | -------------------------------- |
| Tip at measurement                           | `3842e1d3`                         | `f1fa1916`                       |
| Commits the other lacks                      | **122**                            | **1**                            |
| `spec.md`                                    | 1,608 lines                        | 1,513 lines                      |
| `tasks.md`                                   | 1,097 lines, highest task **T103** | 994 lines, highest task **T085** |
| `Superseded 2026-08-14` markers in `spec.md` | **8**                              | **0**                            |

Common ancestor: `7744cc824` "test(ui): add immutable zero-tolerance parity harness", **2026-08-09**.

The parent's single commit, `f1fa1916` "feat(files-tabs): converge Feature 003 real files and
tabs", changed 197 files and roughly 150,000 lines — a squashed convergence of the same body of
work this chain carried in granular commits.

## Approved resolution

**Resolve every conflict in favour of the task-branch chain.** Approved by the repository owner on
2026-08-14 after the measurement below was presented.

Conflicting paths at measurement time:

- `frontend/e2e/parity/manifest.ts`, `manifest.test.ts`, `reference-adapter.test.ts`
- `frontend/e2e/targeted-manifest.ts`, `targeted-parity.test.ts`, `real-files-parity.test.ts`
- `specs/003-real-files-and-tabs/evidence/ft-vs-08/offline-and-controls/five-minute-request-denial.{json,log}`
- `specs/003-real-files-and-tabs/spec.md`, `tasks.md`

## Why taking the chain loses nothing

Four independent measurements, each reproducible from the commands in the appendix.

1. **The product is not in dispute.** `git diff HEAD feature/v1-implementation -- frontend/src internal/`
   is **empty**. Production source is byte-identical on both sides; every conflict is in test
   files, evidence, or planning documents.

2. **The chain's task list is a strict superset.** Every task ID present on the parent is also
   present on the chain — the set difference is empty. The chain additionally carries T086–T103,
   which are the 2026-08-14 retargeting and everything that followed from it.

3. **The chain's spec carries the amendment; the parent's does not.** The parent has **zero**
   `Superseded 2026-08-14` markers, so its `spec.md` still presents the withdrawn whole-screen
   contract — 306 primary plus 240 additional keys, 1,638 comparisons — as live. Merging in its
   favour would reinstate a contract that two measured full runs passed 0 of, and would undo
   T086's amendment.

4. **Only two test names exist on the parent and not on the chain, and both were removed on
   purpose.**
   - `T035 proves all 546 binding comparisons across three unchanged repetitions` — removed by
     **T088**, because the requirement it enforced was withdrawn.
   - `T063 verifies the six backend-authoritative editor-status states at 1280px Minimal Light` —
     replaced by **T091** with six per-palette tests covering all 36 behaviour keys, of which the
     Minimal Light case is one.

   Nothing else the parent proves is absent from the chain.

## What the merge is not

This is **not** a fast-forward: the parent holds one commit the chain lacks, so a real merge is
required and the ten conflicts must be resolved by hand. Merging is reserved to the repository
owner per AGENTS.md and was not performed as part of this task.

Discarding the parent's side of these ten files supersedes `f1fa1916`'s version of them; it does
not delete the commit, which remains reachable in history.

## Appendix — commands

```
git merge-base HEAD feature/v1-implementation
git rev-list --count feature/v1-implementation..HEAD
git rev-list --count HEAD..feature/v1-implementation
git diff --stat HEAD feature/v1-implementation -- frontend/src internal/
git merge-tree --write-tree HEAD feature/v1-implementation | grep -i '^CONFLICT'
comm -23 <(git show feature/v1-implementation:specs/003-real-files-and-tabs/tasks.md \
            | grep -oE '^- \[.\] T[0-9]+' | grep -oE 'T[0-9]+' | sort -u) \
         <(git show HEAD:specs/003-real-files-and-tabs/tasks.md \
            | grep -oE '^- \[.\] T[0-9]+' | grep -oE 'T[0-9]+' | sort -u)
git show feature/v1-implementation:specs/003-real-files-and-tabs/spec.md | grep -c 'Superseded 2026-08-14'
```
