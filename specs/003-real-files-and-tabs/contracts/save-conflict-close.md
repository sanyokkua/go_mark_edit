# Contract: Safe Writes, External Conflicts, Autosave, Close, and Shutdown

## Shared write primitive

Manual Save, Save As, autosave, and close-save use one backend write coordinator. The caller first awaits the active
session flush where applicable. The backend snapshots `{documentId, contentRevision, canonicalContent,
fileCharacteristics, targetPath, expectedDiskVersion}` under the model lock, releases the lock, and serializes I/O
per document.

Write order:

1. Validate identity/revision/capability/path/suffix/40-tab-independent state and required authorization.
2. For Save As, invoke the native chooser. Empty path is cancellation. Canonicalize candidate and reject another
   open document before I/O. If the target exists, native confirmation is the sole overwrite confirmation; capture
   its version after confirmation.
3. Compare current disk version with the expected baseline. Missing current backing path detaches; changed path
   returns conflict; changed Save As overwrite target returns its classified `conflict` error without another prompt.
4. Encode the immutable snapshot: new = UTF-8/LF/no BOM; uniform existing = preserved LF/CRLF/BOM; mixed requires
   matching single-use normalization authorization.
5. Create a same-directory temporary file; write fully; apply existing permission mode before commit; sync/close;
   recheck disk version.
6. Atomically replace through the platform port and record the exact committed disk snapshot/baseline.
7. Re-lock the model. Clear dirty only if canonical content still equals the written revision; otherwise the newer
   content remains dirty. Save As adopts the path only now.
8. Publish metadata and return `CommittedWriteOutcome` with committed projection/content revisions.
9. Explicit Save produces one localized success; autosave produces no success toast.

Every pre-commit failure removes temporary artifacts, preserves the original target and model path/baseline, keeps
the document dirty, and returns a result classified per spec.md's classified error and remediation contract
(`io-failure`, `permission-denied`, or `conflict`, as applicable).

### Platform replacement

- Unix-like hosts use same-filesystem replacement and parent-directory sync.
- Windows uses a build-tagged replace-existing API (`ReplaceFileW` or proven equivalent); plain `os.Rename` is not
  accepted as cross-platform proof.
- The target's permission mode is applied to the temporary file before replacement. New files use normal platform
  creation semantics.
- Platform-specific tests distinguish demonstrated current-host behavior from unrun hosts.

## Command results

```text
CommittedWriteOutcome {
  documentId: string
  writtenContentRevision: uint64
  committedProjectionRevision: uint64
  targetPathAdopted: boolean
  lineEndingOutcome: preserved-lf | preserved-crlf | normalized-lf | normalized-crlf | new-lf
  bomOutcome: preserved | absent
  resyncRequired: boolean
}

WriteOutcome =
  committed { CommittedWriteOutcome }
  cancelled
  needsNormalization { decisionToken, proposedEnding, documentRevision }
  conflict { ConflictPreview }
  refused { classifiedError }
```

The frontend never maps `cancelled`, `needsNormalization`, `conflict`, or `refused` into success.

## Projection convergence barrier

The adapter tracks the greatest projection revision synchronously applied through the store callback. After a
committed write:

- if the revision is represented and the result does not require resync, commands continue;
- otherwise enter one shared `resync-required` barrier, reject/hold later document lifecycle commands, call
  `GetState`, rehydrate, and resume only when the committed revision/baseline is represented;
- do not call Save again, restore the old file, or report that the disk commit failed.

Injected emitter failures after replacement return committed success with `resyncRequired=true`. Pre-commit
model-only commands may retain rollback-on-publication-failure behavior.

### Bounded recovery schedule

Rehydration runs **immediately, then retries after 250 ms, then after one second**. If all three attempts fail:

- document commands and normal close stay blocked;
- a **persistent recovery surface** states that the file **was saved on disk** but editor-state recovery failed;
- `Retry` restarts the same bounded three-attempt sequence;
- `Quit and discard newer unsaved changes` requires a **second confirmation naming the affected documents**, and
  even then MUST satisfy the native cancellation/drain/one-use-permit sequence below;
- no committed write is ever repeated, rolled back, or replayed.

## Save-status projection

Go authoritatively projects exactly one status per document using this precedence, highest first:

| Condition                                                                                                  | Status            |
| ---------------------------------------------------------------------------------------------------------- | ----------------- |
| Read-only capability (unsafe bytes, oversize, or filesystem)                                               | `read-only`       |
| Empty untitled document                                                                                    | `not-saved`       |
| Dirty, detached, nonempty untitled, failed write, or a revision newer than an in-flight/committed snapshot | `unsaved-changes` |
| Clean after Open, Reload, explicit Save, or Save As                                                        | `saved`           |
| Clean after autosave                                                                                       | `autosaved`       |

Each committed baseline retains its originating kind (`open`, `reload`, `explicit-save`, `save-as`, `autosave`),
so returning exactly to that baseline restores the correct clean label. A successful stale-revision write updates
disk truth but MUST NOT project a clean status for newer content, and a failed write MUST NOT change status.

## Mixed-ending authorization

`RequestNormalization(documentId, contentRevision)` returns the dominant ending, using first encountered on a tie,
and an explanation. Confirmation creates one token bound to id, revision, and ending. Cancel creates none. Save,
Save As, autosave, and close-save reject before disk access without the exact unused token. Edit/path/reload/close/
use invalidates it.

## External-change decision

### Stable re-read before any decision

A recorded-versus-current disk-version mismatch **suspends** the write and performs a re-read whose version is
**unchanged across classification** and whose raw-byte hash is captured with the baseline. Stable Open and Reload
reads capture version before reading and require the same version after raw-byte classification and hashing.

- If raw bytes, byte-order mark, line endings, **and** permission mode all still equal the recorded baseline, the
  backend refreshes **only the disk version** and resumes the suspended write. No prompt appears.
- Any byte or file-characteristic difference prevents the write and opens the external-change decision.
- An **unstable re-read writes nothing** and retries only after a fresh foreground check.

### Foreground-only checking and conflict serialization

Version checks run **only** on tab activation, window focus or resume, and before every write, for path-backed
documents **including read-only ones**. No background file watcher and no polling timer exists.

Conflicts stay bound to document identity, canonical content revision, and detected disk version. When several are
pending, the application shows **one modal at a time**, retains the current modal until it resolves or invalidates,
**visibly projects every waiting document as blocked by conflict** (`tab-blocked-conflict`), and selects subsequent
eligible decisions in **authoritative tab order**.

Disk mismatch prevents the write. Editable conflicts return the bounded On disk/Yours preview — enforcing **both**
12 logical lines and 4,096 UTF-8 bytes per side, stopping at whichever bound is reached first, never splitting a
code point, and visibly identifying each truncated side — with Reload from disk, Keep mine, Skip in that order and
Skip initially focused. A metadata-only difference shows the differing characteristics instead of an empty content
comparison. Read-only conflicts return Reload from disk plus structural Cancel only, with Cancel initially focused.

### ReloadFromDisk

```text
ReloadFromDisk(documentId, expectedContentRevision, detectedDiskVersion)
  -> inactive committed revision | active ActiveBufferAcknowledgement
```

Re-read and atomically reclassify canonical content, raw safety, BOM, endings, capability, disk baseline, dirty and
detached state. Return source only when still the active matching document. A stale result is rejected.

### KeepMine

```text
AuthorizeKeepMine(documentId, contentRevision, path, detectedDiskVersion) -> authorizationId
```

The prompt must still match all four values. The token permits exactly one later replacement attempt and is
invalidated before use. Edit while prompt open disables the decision and requires a refreshed preview.

### Skip

Cancels only this write attempt. It writes nothing, changes neither content nor disk, keeps dirty, grants no token,
and forces the next write to check disk and ask again. There is no persistent Compare-later state.

### Missing backing file

Mark path-backed document detached and dirty; keep path/content/tab. Explicit Save may recreate that path with new-
target atomic semantics. Autosave does not silently recreate a newly missing file; user intent is explicit.

## Autosave

- Acknowledged `FileSettings.autosave` defaults true.
- Each accepted content revision replaces a one-second timer for a path-backed writable document.
- Disabling cancels timers not yet started and performs no catch-up write; dirty remains dirty.
- Autosave uses the shared version/authorization/write coordinator, never format/lint and never a success toast.
- An external conflict opens the same decision path; it does not retry automatically.
- Explicit Save during an in-flight autosave produces no concurrent replacement and exactly one explicit success
  notification for the content that reaches disk.
- Untitled, unsafe, large read-only and detached documents are not automatic-write eligible.

## Close-plan protocol

### PrepareClose

```text
PrepareClose(kind, targetDocumentIds, expectedTabSetRevision) -> ClosePlanSummary
```

Frontend first awaits the active session flush. Backend validates the tab set, orders all targets by canonical tab
order, waits for any relevant in-flight write, snapshots revisions, and returns either clean-ready or the complete
dirty target list. Single dirty shows Save/Discard/Cancel; multi-target operations show one Save all/Discard all/
Cancel dialog.

### ResolveClosePlan

For Save choices, gather all native Save As paths, overwrite confirmations, normalization authorizations and
external-conflict decisions before any batch write/discard/close. Cancellation, missing choice, stale revision or
failed resolution invalidates the plan and performs no side effect.

### ExecuteClosePlan

1. Require plan status ready and unchanged tab/document revisions.
2. Execute requested saves in authoritative tab order without closing any tab.
3. Stop at first failure. Earlier successes remain clean; every tab stays open; no discard applies; plan expires.
4. Only after all saves succeed, apply discards/removals as one close transition.
5. Move eligible paths/view metadata to recently closed, select adjacent active tab, or clear active id/buffer
   together.

Retry always prepares a new plan and choices because earlier successful saves changed revisions.

## Native close and shutdown

First `OnBeforeClose` while the shell is active:

1. If no one-shot permit exists, veto, emit one idempotent close request, and let the frontend flush/prepare the
   window plan.
2. Cancel returns coordinator to idle with no write/close.
3. Authorized plan execution sets one one-shot permit and invokes the injected native Quit port.
4. Second callback consumes the permit, cancels registered long runs, drains accepted editor/view/autosave/layout
   work, and permits shutdown.
5. `OnShutdown` closes SQLite, then flushes/closes the logger. Repeated calls remain safe.

Repeated native close while requested is vetoed without duplicate prompt. A drain error consumes no permit and
keeps the application open for retry.

## Required proof

- Atomic byte/mode/new-file/mixed/Save As collision/cancel/target-race/pre-commit failure tables.
- Windows/Unix replacement port tests and current-host real bytes/permissions.
- Newer edit during write, post-commit emitter/decode/missing-patch resync, and no duplicate write.
- All external decision/invalidation/read-only/deletion/Skip/second-window paths.
- Fake-clock autosave eligibility/debounce/off/in-flight explicit serialization/no-toast/performance cases.
- Exhaustive close plan completeness/order/cancel/failure/retry/adjacent/final-tab cases.
- Native veto/duplicate request/permit/drain/DB/logger ordering with real clean and dirty close walkthrough.
