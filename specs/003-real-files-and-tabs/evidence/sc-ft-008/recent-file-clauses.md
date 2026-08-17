# SC-FT-008 — which test proves which recent-file clause

**Proves: SC-FT-008 — partially. Eight of eleven clauses have a covering test; three do not, and the
two-instance clause is proved at a narrower scope than the criterion's wording.** Written by
**T158**, which found SC-FT-008 named in no test and no evidence file.

## Where the behaviour lives

- Repository: `internal/appmodel/recent_files_repository_sqlite.go` — one `settings` KV row, each
  promotion a `BeginTx` → read → mutate → commit with a three-attempt busy retry at `:85-92`
- Projection: `internal/appmodel/recent_files.go`
- Promotion sites: `internal/appmodel/file_lifecycle.go:284-301` (Open/focus) and
  `internal/appmodel/save.go:364-396` (`SaveOriginExplicitSave` and `SaveOriginSaveAs` only)

## Clause by clause

| | Clause | Proving test | What it actually asserts |
|---|---|---|---|
| A | at most six unique entries | `internal/appmodel/recent_files_test.go:21` `TestRecentFilesMRUPersistenceAndLazyPrune` | Seven promotions leave exactly the newest six, newest first. Anchored `FR-FT-039 (partial)` |
| A | uniqueness half | `internal/appmodel/recent_files_test.go:284` `TestExplicitSaveAndSaveAsPromoteRecency` | Re-promoting `first.md` keeps the list at two entries — no duplicate row |
| B | canonical **Open** promotes | `internal/appmodel/open_lifecycle_test.go:14` `TestOpenPathLifecycle` | After Open, `Snapshot.RecentFiles == [canonical path]` |
| B | canonical **focus** promotes | `internal/appmodel/recent_files_test.go` `TestFocusingAnOpenDocumentPromotesItToTheFrontOfRecents` (T184) | Two files opened, then the older re-opened: the result is `OpenStatusFocused` on the same document id **and** that path is promoted back to the front. Verified to discriminate — focusing the file already at the front leaves the assertion failing |
| C | explicit **Save** promotes | `recent_files_test.go:284` `TestExplicitSaveAndSaveAsPromoteRecency` | Explicit `Save` of the older document moves `first.md` ahead of `second.md` |
| D | **Save As** promotes | same test | `SaveAs` puts the **adopted** path newest and leaves the order beneath it intact |
| E | autosave leaves order unchanged | `recent_files_test.go:219` `TestAutosaveAndReloadDoNotChangeRecency` | List identical before and after an autosave timer fire |
| F | Reload leaves order unchanged | same test (`ReloadFromDisk` leg) | List identical after `ReloadFromDisk` |
| G | **two-instance commit order defines MRU, no lost stale-snapshot update** | `recent_files_test.go:92` `TestTwoInstancesInterleavedPromotionFollowsCommitOrder` and `:127` `TestStaleSnapshotPromotionIsRejected` | See the scope note below — this is the clause the criterion leans hardest on |
| H | explicit refresh observes the latest committed list | `recent_files_test.go:68` `TestPromotionIsLatestValueTransaction` | `secondRepository.List()` returns `c,b,a` after interleaved commits from **both** database handles. Repository level. The **display** seam is now covered too, by `recent_files_test.go` `TestGetStateObservesARecentsCommitMadeOutOfBand` (T184): a second connection to the same database commits a promotion with no command issued to the service, and the next `GetState` snapshot carries it first. Verified to discriminate — without the out-of-band commit the snapshot keeps only the seeded entry |
| I | prunes missing entries | `recent_files_test.go:21` (second half) | Deleting a fixture then calling `List` yields five entries with order preserved. Anchored `FR-FT-039 (partial)` |
| I | an explicit stale choice refuses | `open_lifecycle_test.go:135` `TestOpenStaleRecentEntryRefusesNotFoundWithoutMutation` | Opening a deleted recent path is a refused `not-found` with zero tab or reservation mutation. Anchored `FR-FT-040` |
| I | **"without background polling"** | `internal/appmodel/recent_files_test.go` `TestRecentsAreListedOnlyAtDisplayAndChoice` (T184) | A counting repository records `List` and `Promote`. The count is taken after a display refresh and an explicit choice, stays **unchanged** across a quiet interval, then rises again on the next `GetState` — so the seam is proved quiet rather than dead. The rule no longer rests on the comment at `recent_files.go:9-10`. The "something polls" direction is not mutation-verified, because injecting a poller means adding production code |
| J | reopens no document at launch | `frontend/src/App.test.tsx:2627` `T157 opens no document at startup even with six remembered recent files` | Boots with six recents and zero documents; asserts empty `byId`, `orderedIds` and active id, and that `openRecentFile`, `reopenLastFile`, `activateDocument` and `openDocument` are never called. Anchored `FR-FT-042 (partial)`. **React layer only** — nothing asserts the production composition root (`application_context_holder.go:142`, which wires the SQLite recents repository) opens no document from a populated recents database |
| K | a failed metadata transaction retains the last committed order and is not reported as success | `recent_files_test.go:182` `TestPromotionFailureEmitsPersistenceWarningWithoutRollback` | With an always-failing repository, Open still returns `OpenStatusOpened` **plus** a `persistence-warning` — so no success is claimed — Save still commits bytes with the same warning, and the recents projection is unchanged. That test's prior order is **empty**, which is the caveat below; `recent_files_test.go` `TestFailedPromotionRetainsAPopulatedCommittedOrder` (T184) now covers the populated case against **real SQLite**: two paths are committed, a `BEFORE UPDATE … RAISE(ABORT)` trigger makes the next promotion's transaction fail while leaving the committed row readable, and the projection still carries exactly the two committed paths in order with the refused path absent. A trigger rather than lock contention — a genuine `SQLITE_BUSY` is reachable (`isRecentSQLiteBusy` and the retry loop exist for it) but costs ~15 s in a unit test, because the busy timeout is 5000 ms and `withEntries` retries three times. Verified to discriminate — without the trigger the promotion succeeds and no warning is raised |

## Clause G, at the scope it is actually proved

The criterion says "**Across two instances**, SQLite commit order MUST define MRU order without lost
stale-snapshot updates". What the tests do:

`openTwoRecentFilesDatabases` (`internal/appmodel/recent_files_repository_sqlite_test.go:14-35`)
calls `db.Open` **twice on the same file path**, producing two independent `*db.Database` / `*sql.DB`
pools, each wrapped in its own `SqliteRecentFilesRepository`. These are genuinely two database
instances contending for one file — **not** one instance with a simulated stale snapshot.

- `TestTwoInstancesInterleavedPromotionFollowsCommitOrder` parks instance 1 *inside its transaction,
  after its read*, through the `afterReadDecision` hook (`recent_files_repository_sqlite.go:105-109`);
  instance 2 then promotes and commits on its own connection; instance 1 is released and finishes.
  The result is `[first, second]` — commit order, not read order. Had instance 1's pre-hook snapshot
  won, `second.md` would have been dropped.
- `TestStaleSnapshotPromotionIsRejected` runs the same interleave and asserts the value **returned to
  the stale caller** contains both latest paths, so the stale caller is not told its own whole-list
  won.

**Three limits, stated because the criterion's wording is broader than the test:**

1. Two database handles in **one OS process** — not two OS processes, and not two full
   `AppModelService` instances. Nothing proves the service-level projection or the
   `persistence-warning` path under real cross-process contention.
2. The interleave is created by a test-only `afterReadDecision` field on the production struct, which
   self-nils after firing so the retry attempt runs unhooked. That is a deterministic scheduler, not
   a stress race.
3. There is **no** end-to-end or real-bridge two-instance evidence at all.
   `frontend/playwright.config.ts:81-93` serves the Vite bridge mock and the parity reference server,
   so `FT-VS-07` never touches SQLite.

## Clause K, at the scope it is actually proved

`failingRecentFilesRepository` fails **both** `List` and `Promote`, so the "last committed order" at
the moment of failure is the *empty* list and the assertion reduces to
`len(state.Snapshot.RecentFiles) != 0`. It proves no phantom promotion appears. It does **not** prove
that a non-empty prior order survives a failed transaction. `tasks.md:428,545` ask for a forced
busy-timeout producing one `persistence-warning` with the prior list intact; `grep -i busy` across
`*_test.go` finds only the fake error string at `recent_files_test.go:189`.

## What this artifact does not claim

Four gaps, filed as **T184**: the focus arm of clause B; the `GetState` display boundary of clause H;
the no-background-polling half of clause I as it applies to recents; and clause K's non-empty prior
order under a real transaction failure. Clause J is proved in React only.
