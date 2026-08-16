# Phase 21 — owner decisions

Recorded 2026-08-16. **This file is the authority for every Phase 21 choice that needed the owner.**
It exists so the decisions survive a context reset: a later session must read this before acting on
T114, T121, T124, T130, T131, T137, T138, T139, T148, T151, T157 or T158, and must not re-ask.

A decision here is not a suggestion. Where a task's own text offers alternatives ("either … or",
"decide the direction first", "owner decision required"), the row below is the answer.

## The twelve decisions

| Task | The question | **Decision** | What it rules out |
|---|---|---|---|
| **T114** | `feature/v1-implementation` is 148 commits behind with 47 merge conflicts, 19 of them production source | **Fast-forward the parent to the chain tip.** Its only unique commit `f1fa1916` is a squashed snapshot already represented in the chain, so nothing is lost. **Tag `archive/v1-implementation-pre-t114` at the old tip first** — the reset must stay reversible | Hand-resolving 47 conflicts; leaving the gap to grow |
| **T138** | The parity route branches the production DOM, so the harness measures a structure that does not ship | **Portal unconditionally.** Remove the test-only branch in `ModalShell.tsx:48-52,195-197` and `SettingsDialog.tsx:261,397`, then re-measure the affected parity keys once | Keeping the branch and documenting that the harness measures a stand-in |
| **T130** | Tab drag reordering is wholly unbuilt | **Build the core only**: grab, insertion indicator, drop. **Defer** edge auto-scroll and the reduced-opacity ghost; keep Escape-cancel and same-position-no-op since they are cheap and prevent surprises | Building the full clause now; skipping the feature entirely |
| **T124** | `resync_recovery.go` has no non-test importer while the same cadence is re-implemented in TypeScript | **Delete the dead Go module** and implement FR-FT-016's second confirmation on the reachable close path | Wiring `ProjectionRecovery` into the composition root; leaving both |
| **T137** | 15 exported Go symbols have no non-test caller | **Decide per symbol.** Delete the genuinely dead ones; for `KeepMine`, `CancelPreparedOpen`, `CancelNormalization` and `CanonicalizeExisting` establish whether the production path is *missing* a call before deleting | Bulk deletion; keeping all and documenting |
| **T151** | `manifest.ts` asserts 306/240/546 keys while 18 are resolved by anything | **Correct the comment**, keep the list. Say plainly that 18 of 546 are used and the rest belong to the contract withdrawn 2026-08-14 | Reducing the manifest (bigger change, counts asserted in several places) |
| **T148** | The Open picker's glob is lowercase; GTK's filter is case-sensitive, `NSOpenPanel` is not | **Add the case variants to the pattern.** Correct on every host without needing a Linux machine | Verifying per platform first and blocking the task |
| **T157 / T158** | 21 FR clauses have no covering assertion; 6 SCs have no evidence | **Cover what is already built** — roughly 19 of 21. **Skip FR-FT-036** (tab drag, until T130 lands) and **FR-FT-057** (baseline traceability, unbuilt). Then close T158's linkable SCs | Writing all 21 now; cherry-picking only the risky few |
| **T121** | SC-FT-007's numbers came from the `native_evidence` driver, not the release build | **Re-run the 100 measurements on the real `just build` binary.** The original blocker is gone — `just build` exits 0 on this host | Accepting the substituted build with a written caveat |
| **T139** | Neither the parity contract nor T120's new state gate runs in CI | **Add them to `.github/workflows/main.yml`.** Accept the ~5-minute cost | Leaving both gates manual |
| **T131** | `spec.md` holds 44 `- Q:` clauses while `plan.md` declares 42, and `spec.md:1461` cites a withdrawn blocker | **Mark the stale clause superseded and correct 42 → 44**, with a note on how to re-derive it. This is the one `spec.md` edit Phase 21 authorises | Marking the stale clause only; leaving both |
| **Order** | What to implement first | **T122 and T123 first** — both are user-visible today and need no further decision. Then T125, then T114/T147 | Branch tidy-up first; strict severity order |

## Standing decisions from the earlier run (still binding)

| Topic | Decision |
|---|---|
| **Base branch** | Branch every task off the **chain tip** `feature/v1-implementation--003-t113-details-visibility`, never off `feature/v1-implementation` — that parent lacks T104–T113 and would falsify T117's and T119's premises |
| **Git protocol** | One task = one branch = one commit, squash-merged into the chain tip, branch deleted. Never `--no-verify`, never `--force`, never merge to `master` |
| **T119 scope** | Backend wiring only. The Settings row stays `laterDeferred`; **T155** owns making it selectable. The walkthrough seeds the persisted store rather than driving a control that does not exist |
| **T120 breadth** | Repair every stale assertion the 40-state run exposes rather than filing them. (Outcome: all 38 previously-unreachable assertions passed first time; only `control-hovered` needed work) |
| **Evidence honesty** | A link or anchor that overstates is worse than none. Partial coverage is recorded **as partial, in the anchor**, naming the clause it leaves out |

## Sequence agreed

1. **T122, T123** — user-visible, no dependencies
2. **T125** — widen `ClassifiedError.Remediation` to a set; **T123, T126 and T142 all wait on it**, so it lands before them to avoid four passes over the same file
3. **T114** (with the archive tag) then **T147** — stop the divergence growing
4. The heavy remainder: **T130**, **T128**, **T124**, **T137**, **T157**
5. Last: **T121** and **T139**, both of which want a settled tree

## Two findings the earlier closures escalated

Not decisions, but they set the order above and must not be re-derived.

- **T122 became CRITICAL.** T117 stopped `localizedErrorCopy` overwriting the notification title, so
  `refusedWrite`'s synthetic `doc-0000000000000003` subject (`internal/appmodel/save.go:599`, 27 call
  sites) is now rendered as the user-facing title by `classifiedNotification.ts:63`. The contract
  requires the safe basename or the disambiguated tab label.
- **T123 became HIGH.** T116 made remediations render, so `save.go:308`'s hardcoded
  `RemediationRetry` now shows a Retry button on `permission-denied` — which the contract makes
  message-only precisely because retrying cannot succeed.
