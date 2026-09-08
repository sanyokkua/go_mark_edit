# Independent review of GoMarkEdit defect probes

Reviewed 2026-09-07, read-only. Inputs: `/tmp/gomark-code-audit.md`, the appended `TestAudit...` bodies at `/tmp/gomark-audit-save_test.go:759–851`, `/tmp/gomark-audit-overlay-results.log`, and the targeted production/service-test sources cited below. No tests were rerun, no repository changes were made, and no further agents were used.

**Verdict:** All five failing backend probes support their central claims. The Save As/autosave probe demonstrates a feasible production service interleaving; it does not manufacture state or replace filesystem writes. Keep the findings, with the qualifications below. The parent separately reports green `just check`, native build, and 271 Playwright cases in 5.2 minutes, plus native confirmation of Save undo/focus loss and fresh Open showing Not saved. Those checks are compatible with these findings: existing suites omit these compositions and all Playwright journeys use the mock backend.

## C1: Save As/autosave falsely clean destination — validated; P1

The probe at `:801–828` uses real `OpenPath`, `UpdateBuffer`, `SaveAs`, and the production one-second timer. A fake save dialog supplies a temporary destination; it does not replace Save As behavior. `SetBeforeSaveAsRecheck` and `SetWriteCommitObserver` only wait on channels at existing seams. There is no direct modification of service state, snapshots, coordinator state, or file contents after the initial fixture setup.

The interleaving is valid:

1. Save As captures v1/new.md in `save.go:189–195`; `snapshotForWrite` releases `service.mu` before returning (`:268–296`). The target-recheck hook is called with no service/coordinator lock held (`:196–203`). The real path includes target stat/hash work after that seam (`:204–213`). An edit arriving after snapshot capture is permitted by the spec; newer content must remain modified.
2. Public UpdateBuffer accepts v2 and schedules the actual timer. `runAutosave` selects old.md before Save As adopts the new path (`autosave.go:181–194`). It captures v2 and executes real AtomicReplace through the normal coordinator.
3. `DocumentWriteCoordinator.Commit` releases its mutex at return (`write_coordinator.go:64–101`), before `executeWrite` calls the observer and before it acquires `service.mu` for publication (`save.go:323–353`). Pausing here models a real goroutine preemption after disk commit. It does not move publication outside a lock that ordinarily protects it; publication is already outside the coordinator lock.
4. Save As can therefore commit/adopt new.md=v1 and publish first. The old-path autosave then publishes v2 last. `applyCommittedBaseline` checks neither target path nor commit/path epoch (`save_status.go:50–57`); the late auto result sets current baseline=v2/clean even though adopted new.md still contains v1.
5. The final private `flushAutosave(id)` is only a completion barrier here. The v2 timer entry has already been removed when its callback starts. It neither injects a write nor mutates a snapshot to create the failure. Real close uses an equivalent in-flight drain.

Observed log: new.md=v1; old.md=v2; current path=new.md; active/backend content=v2; dirty=false; status=autosaved. The failing assertion compares actual new-file bytes with the actual active source and dirty flag. It is stronger than a status-only test.

**Qualifications:** Label this a deterministic service-level concurrency reproduction, not a manually observed native race or a measured frequency. Hooks extend real preemptible windows; they do not establish that a one-second stall is common on a local disk. v2 still exists in old.md, so say “new destination is falsely reported clean; clean close can discard the in-memory association without saving v2 there,” or “data-loss risk at the adopted destination,” not “all copies of v2 are destroyed.” The no-prompt close implication follows from `tab_session.go:87–109` and `close_plan.go:82–114`; the probe itself does not execute a close. Frontend beginWrite flushes before invoking Save As (`App.tsx:1402–1424`) but does not establish a lock over subsequent editing/automatic work, and the backend correctness promise must hold independently.

The fix should serialize snapshot/path adoption/baseline publication as a document transition, or reject stale publication by path/commit identity. Moving a lock blindly around disk I/O is not a prescribed solution.

## C2: Refusal label data race — validated; P1

The probe at `:778–787` performs concurrent public Save(nonexistent id) and NewDocument; it never mutates the map itself. Race output identifies the production unlocked read in `safeDocumentLabelLocked` (`save.go:701`) against the production map write in `NewDocument` (`file_lifecycle.go:66`). Save explicitly unlocks before refusal (`save.go:49–58`) while `refusedWrite` calls the locked-only label helper (`:656–657`). There are both locked and unlocked callers, so adding an unconditional inner RLock is unsafe.

**Qualifications:** This proves a service data race. A stale/nonexistent identity is valid failure input, not an impossible internal state. The 1,000-attempt loop amplifies scheduling probability, not severity. Potential fatal concurrent-map access is a consequence of unsafe Go map concurrency, not an observed native crash in this probe. Retain that distinction. The race detector itself is sufficient evidence; no visible crash must be induced.

## C3: Closed saved documents retain full source — validated; P2

The probe at `:830–840` opens a real file, updates it to 1 MiB, performs real Save, and calls the public clean CloseDocument. The log confirms zero open documents while `service.writeCoordinators[id]` retains one committed snapshot with 1,048,576 canonical string bytes and 1,048,576 encoded bytes. `closeDocuments` deletes the document but not the coordinator (`close_plan.go:544–558`); repository search shows coordinator insertion/read and no deletion. `cloneWriteSnapshot` explicitly retains/clones encoded data (`write_coordinator.go:133–145`). The remaining service-owned pointer makes this retained memory, not a temporary stack variable or the test's record of state.

**Qualifications:** “For the lifetime of the service/window” is more exact than unbounded across app restarts. The 100 × 10 MiB estimate is arithmetic (~1.95 GiB in these two representations), not a measured heap profile or measured crash. Memory growth occurs across distinct document identities, not every save of the same live document. Assign P2 unless real workloads establish frequent resource exhaustion. The related frontend record/close-plan lifetime observations are source-inspection risks; do not describe all as independently reproduced full-text leaks.

The probe dereferences `coordinator.lastCommitted` before its nil assertion; it correctly proves the current defect but should be rewritten before adoption as a regression test so a successful fix yields a pass rather than a nil-pointer panic.

## C4: Autosave disk failure is not reported — validated; P2

The fake clock's `FireNext` invokes the real scheduled callback synchronously (`autosave_test.go:57–73`). The installed write executor returns an error before the first coordinator is created. The fixture opens a writable path and UpdateBuffer schedules one revision, so this traverses the normal preparation/snapshot/execute path. The recording emitter implements both patch and async error interfaces with mutex protection (`service_test.go:240–277`). At the end of the completed callback there are zero async errors; disk is unchanged and the document remains dirty.

Production confirms the result: `executeWrite` returns a classified refusal (`save.go:332–350`), and `runAutosave` discards it (`autosave.go:227`). The async error emitter is real but never called along this path. FR-FT-015 (`spec.md:1007–1011`) silences only automatic success and requires classified failure notifications/deduplication. The central missing-error finding is sound.

**Qualifications:** The probe demonstrates a generic injected pre-commit write failure, not every disk error category, notification deduplication, normalization behavior, or post-commit rehydration. No UI Retry was exercised. Keep the discarded `ResyncRequired` extension separately labeled as source-confirmed/unprobed. A future regression test should additionally assert executor invocation count and the intended classified error payload so a skipped write cannot satisfy unrelated assertions. Avoid broad wording that all conflict/normalization flows are proven absent; only the write-refusal path was exercised here.

## C5: macOS hard-link identity failure — validated; P2

The probe at `:789–799` creates a real file and real hard link, then opens both using public OpenPath with the current tab revision. It performs no write between the opens. Both paths receive separate `path:` identities and the second result is opened with a new document id. This directly proves duplicate tabs for one inode on this host.

The cause is confirmed beyond inference: local Go Darwin source `syscall/ztypes_darwin_arm64.go:63–64` and the amd64 equivalent declare `Stat_t.Dev int32`, while `paths.go:125–130` accepts only reflection `CanUint`. Both `filesystemIdentity` (`paths.go:115–122`) and `portableFileIdentity` (`disk_version.go:70–74`) reuse that helper, losing Darwin device/inode identity. FR-FT-004 explicitly requires filesystem identity (`spec.md:916–924`). The accepted atomic-save hard-link breakage tradeoff is irrelevant because no save occurred before deduplication failed.

**Qualifications:** This is Darwin/current-host confirmation. Linux reopen-after-atomic-Save is a distinct plausible issue; the corresponding macOS control passed because path fallback hides it. Do not merge that untested Linux claim into this confirmed finding. Typed platform implementations should include independent hard-link and atomic-save reopen scenarios.

## Priority order for report synthesis

For the five backend findings alone: **C1 false clean destination (P1), C2 data race (P1), C4 silent autosave failure (P2), C3 retained source (P2), C5 hard-link deduplication (P2).** C3 versus C5 may swap based on expected document sizes/host workflows; both are valid normal-priority defects.

Including parent-confirmed native findings: put **C1, C2, and C6 ordinary Save losing Undo/focus** at the top. C6 is an ordinary action with directly observed native impact; report that confirmed behavior separately from the untested pending-keystroke-loss extension. Then C4, C3/C5, and C7 fresh Open falsely labeled Not saved (P2). Do not present hypothetical extensions as extra confirmed defects.

## Minor report corrections

- The explicit Save autosave drain is `save.go:83`, not `:81` (line 81 delegates untitled Save to Save As).
- The relevant repeated uintField call in disk-version extraction is `disk_version.go:70–74`, not line 66's shape check.
- Current `frontend/vite.config.ts` is 51 lines: mock-mode selection/aliasing is `:34–45`, not `:39–55`.
- Prefer explicit severity labels over “P1/P2” for C3 and C6; distinguish observed impact from severity judgment.
- Retain the audit's caveat that the shell wrapper's exit 0 came from tail, while the Go test log is FAIL. The five failing probes and one passing control are the evidence, not that wrapper status.

These qualifications do not invalidate any of the five central backend findings. They make the final claims match what was actually observed and what remains inference.
