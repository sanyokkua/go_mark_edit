# Data Model: Real Files and Tabs

The Go backend owns every canonical entity in this document unless a row explicitly names another owner.
Redux contains only the content-free projection. The active Monaco model is the sole ephemeral source working
copy in the webview.

## Application document state

### Document

| Field                     | Type / bound                                                          | Rule                                                                                                                                |
| ------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `id`                      | opaque stable string                                                  | Minted in Go; independent of path; unchanged by Save As; a reopened path receives a fresh id.                                       |
| `canonicalPath`           | optional absolute path                                                | Backend identity path; empty only for untitled; never inferred in the frontend.                                                     |
| `displayName`             | localized-safe string                                                 | `Untitled` or basename; projection-safe.                                                                                            |
| `displayParent`           | optional one-segment string                                           | Added when useful for identity/disambiguation; never a deep private breadcrumb.                                                     |
| `content`                 | canonical UTF-8 string                                                | LF-normalized writable source held in Go. Unsafe read-only input uses tolerant display content but can never enter a write request. |
| `contentRevision`         | monotonic uint64 per document                                         | Bumped for accepted canonical content/reload; binds saves, prompts, sessions, and authorizations.                                   |
| `diskBaseline`            | optional `DiskBaseline`                                               | Absent for untitled; exact last successful read/write baseline.                                                                     |
| `fileCharacteristics`     | `FileCharacteristics`                                                 | Encoding/BOM/line-ending/size/capability classification.                                                                            |
| `dirty`                   | derived bool                                                          | Writable path-backed: canonical content differs from baseline; untitled: content non-empty; deleted backing file: true.             |
| `detached`                | bool                                                                  | True when the formerly backed path is missing; explicit Save may recreate it.                                                       |
| `writeState`              | `idle`, `scheduled`, `writing`, `blocked-conflict`, `resync-required` | Dirty dot stays present and is muted only during `writing`.                                                                         |
| `view`                    | `DocumentViewState`                                                   | Per-document arrangement/Reading/caret/selection/scroll state.                                                                      |
| `hasPersistedArrangement` | bool                                                                  | Distinguishes per-path arrangement from application fallback.                                                                       |

### FileCharacteristics

| Field                  | Values                                            | Validation                                                              |
| ---------------------- | ------------------------------------------------- | ----------------------------------------------------------------------- |
| `encoding`             | `utf-8`, `unsafe-utf8`                            | Feature 003 performs no encoding conversion.                            |
| `bom`                  | `present`, `absent`                               | Writable existing files round-trip; new files use absent.               |
| `lineEnding`           | `lf`, `crlf`, `mixed`, `none`                     | Mixed retains counts/tie order for authorization; new files use LF.     |
| `lfCount`, `crlfCount` | non-negative integers                             | Used only for mixed normalization.                                      |
| `firstEnding`          | optional `lf` or `crlf`                           | Tie breaker for mixed normalization.                                    |
| `rawSizeBytes`         | 0 through 52,428,800 (50 MiB)                     | 10,485,761–52,428,800 read-only; 52,428,801+ never becomes a Document.  |
| `capability`           | `writable`, `unsafe-read-only`, `large-read-only` | Projected explicitly; UI never infers writability from buffer presence. |
| `warning`              | optional classified code                          | Drives localized read-only/mixed/large status without unsafe details.   |

### DiskBaseline

| Field                    | Type                                | Rule                                                                                    |
| ------------------------ | ----------------------------------- | --------------------------------------------------------------------------------------- |
| `canonicalContent`       | UTF-8 string for writable documents | Dirty comparison baseline after LF normalization.                                       |
| `rawBytes`               | byte slice only when required       | Exact read-only unsafe baseline or the exact encoded written snapshot; never projected. |
| `version`                | `DiskVersion`                       | Captured after successful read/write.                                                   |
| `characteristics`        | `FileCharacteristics`               | Exact classification associated with the baseline.                                      |
| `writtenContentRevision` | uint64                              | Identifies which canonical revision reached disk.                                       |

### DiskVersion

| Field              | Type                       | Rule                                                                        |
| ------------------ | -------------------------- | --------------------------------------------------------------------------- |
| `exists`           | bool                       | Missing after a prior baseline detaches the document.                       |
| `size`             | int64                      | Portable comparison input.                                                  |
| `modifiedUnixNano` | int64                      | Primary external-change signal; accepted timestamp-tick limitation remains. |
| `mode`             | permission bits            | Existing target mode is applied to the temporary file before commit.        |
| `fileIdentity`     | optional platform identity | Detects replacement where supported; not a user-visible path.               |

One equality implementation is shared by Open baseline, pre-write checks, Save As target confirmation, and
Keep-mine authorization.

## Tab and active working-copy state

### OrderedTabSet

| Field                | Type / bound             | Rule                                                                                     |
| -------------------- | ------------------------ | ---------------------------------------------------------------------------------------- |
| `orderedDocumentIds` | unique list, length 0–40 | Canonical tab order. A 41st attempt is rejected before mutation.                         |
| `activeDocumentId`   | optional document id     | Present iff the tab set is non-empty.                                                    |
| `revision`           | monotonic uint64         | Every effective add/remove/reorder/activation-set change bumps once; no-op drops do not. |
| `recentlyClosed`     | `RecentlyClosedHistory`  | Per-window, not persisted.                                                               |

### ActiveBufferAcknowledgement

```text
ActiveBufferAcknowledgement {
  documentId: string
  documentRevision: uint64
  projectionRevision: uint64
  content: string
}
```

It is returned only by hydration, activation, active Reload, New/Open that become active, and reopen that becomes
active. It is not an ordinary patch and is applied only after the projection, request generation, document id,
and document revision still match.

### ActiveEditorSession

| Field                                                 | Owner                                    | Rule                                                                                   |
| ----------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------- |
| `documentId`                                          | frontend controller from acknowledgement | Must match the active projection.                                                      |
| `activationToken`                                     | frontend controller                      | Fresh symbol/token for each activation.                                                |
| `modelUri`                                            | frontend controller                      | Fresh per activation; prevents Monaco cache reuse.                                     |
| `handle`                                              | mounted Monaco adapter                   | Valid only for the activation token.                                                   |
| `workingContent`                                      | Monaco                                   | Immediate active source; queued/awaited through the adapter before lifecycle commands. |
| `caret`, `selection`, `editorScroll`, `previewScroll` | Monaco/controller                        | Captured with content before identity changes.                                         |

Deactivation order is capture → queue content/view → await both → perform backend command → dispose old model/session
→ validate acknowledgement → create the new model/session. Undo history intentionally ends at disposal.

### DocumentViewState

| Field                           | Values                       | Persistence                                   |
| ------------------------------- | ---------------------------- | --------------------------------------------- |
| `mode`                          | `editor`, `reading`          | In-memory per document.                       |
| `arrangement`                   | `editor`, `split`, `preview` | In-memory and persisted per canonical path.   |
| `caret`, `selection`            | positive one-based positions | In-memory; retained in recently closed entry. |
| `editorScroll`, `previewScroll` | finite non-negative numbers  | In-memory; retained in recently closed entry. |

Open precedence is: acknowledged default open mode; if Reading, enter Reading; if Editor, path-persisted arrangement,
then last application arrangement, then Split. New always enters Editor.

## Write coordination and authorizations

### WriteIntent

| Field                           | Type                                                 | Rule                                                              |
| ------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------- |
| `kind`                          | `explicit-save`, `save-as`, `autosave`, `close-save` | Controls dialog/toast behavior only; all use one write primitive. |
| `documentId`, `contentRevision` | identity/revision                                    | Snapshot must still be valid when accepted.                       |
| `targetPath`                    | canonical path                                       | Save As candidate is not adopted before commit.                   |
| `expectedDiskVersion`           | optional `DiskVersion`                               | Required for existing path/confirmed overwrite.                   |
| `normalizationAuthorizationId`  | optional token                                       | Required for mixed endings.                                       |
| `keepMineAuthorizationId`       | optional token                                       | Required after external conflict.                                 |

### DocumentWriteCoordinator

One coordinator exists per document:

| Field                         | Type                                               | Rule                                                                     |
| ----------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------ |
| `inFlight`                    | optional immutable `WriteSnapshot`                 | At most one replacement for the document.                                |
| `scheduledAutosaveGeneration` | optional uint64                                    | Replaced by newer accepted content; cancelled when autosave turns off.   |
| `explicitWaiter`              | optional request                                   | Coalesces with/awaits in-flight autosave without concurrent replacement. |
| `lastFailureKey`              | optional `documentId` + `ClassifiedError.category` | Updates one repeated notification count instead of stacking.             |

The global appmodel mutex is never held across a native dialog or filesystem I/O.

### ClassifiedError

Every failure and nonfatal warning returned on an `apperr.*Result` envelope carries this shape:

| Field         | Type                                                                                                                                               | Rule                                                                                                                   |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `category`    | `not-found`, `permission-denied`, `io-failure`, `conflict`, `capacity-limit`, `unsupported-input`, `system-command-failure`, `persistence-warning` | Exactly one of spec.md's eight classified categories; the sole discriminator for remediation.                          |
| `safeSubject` | string                                                                                                                                             | Basename or the document's shortest-unique disambiguated tab label only; never a full path, OS detail, or stack cause. |
| `remediation` | subset of `Retry`, `Reload from disk`, `Keep mine`, `Skip`, `Save to recreate`, `Copy path`, `Cancel`, or empty (message-only)                     | The valid subset for the category and current document state; the frontend renders only what is returned.              |
| `limit`       | optional integer                                                                                                                                   | Populated only for `capacity-limit`.                                                                                   |

Copy path and Reveal in file manager resolve the target document's `canonicalPath`/`detached` fields (no new
Document fields needed) and return either success or one `ClassifiedError` of category `not-found` (known-missing
or disappearance-race Reveal) or `system-command-failure` (clipboard write or OS reveal command failure).

### WriteAuthorization

| Field                         | Values                             | Rule                                       |
| ----------------------------- | ---------------------------------- | ------------------------------------------ |
| `id`                          | opaque token                       | Backend-issued and single-use.             |
| `kind`                        | `mixed-normalization`, `keep-mine` | Never interchangeable.                     |
| `documentId`, `canonicalPath` | identity/path                      | Exact match required.                      |
| `contentRevision`             | uint64                             | Any accepted edit invalidates.             |
| `diskVersion`                 | optional                           | Required for Keep mine.                    |
| `normalizedEnding`            | optional `lf` or `crlf`            | Required for mixed normalization.          |
| `used`                        | bool                               | Use invalidates before replacement begins. |

Invalidators: content revision, path, reload, successful Save/Save As, close, second disk change, or use. Skip never
creates an authorization.

### ConflictPreview

| Field                                          | Bound                                              | Rule                                                     |
| ---------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------- |
| `documentId`, `contentRevision`, `diskVersion` | exact identity tuple                               | Stale prompt actions are rejected.                       |
| `onDisk`, `yours`                              | first changed hunk; ≤12 lines and ≤4 KiB each      | Transient command/event result, never Redux/persistence. |
| `onDiskTruncated`, `yoursTruncated`            | bool                                               | Localized UI explains bounded preview.                   |
| `availableActions`                             | editable: Reload/Keep mine/Skip; read-only: Reload | Binding order is fixed.                                  |

## Close and shutdown state

### ClosePlan

| Field                    | Type                                                                  | Rule                                                     |
| ------------------------ | --------------------------------------------------------------------- | -------------------------------------------------------- |
| `id`                     | opaque token                                                          | One active plan per window.                              |
| `kind`                   | `single`, `others`, `right`, `window`, `quit`                         | Determines target set only.                              |
| `tabSetRevision`         | uint64                                                                | Any tab mutation invalidates the plan.                   |
| `targets`                | ordered `CloseTarget` list                                            | Always authoritative tab order, including clean targets. |
| `dirtyChoices`           | document id → `save`, `discard`, or absent                            | Incomplete choice set cannot execute.                    |
| `requiredSavePaths`      | document id → pending/resolved/cancelled                              | All native Save As results resolve before any write.     |
| `requiredNormalizations` | document id → pending/authorization                                   | All resolve before any write.                            |
| `requiredConflicts`      | document id → pending/decision                                        | All resolve before any write.                            |
| `status`                 | `collecting`, `ready`, `executing`, `failed`, `cancelled`, `complete` | Failure/cancel invalidates; retry needs a fresh plan.    |

### CloseTarget

Contains document id, content revision, path/display name, dirty/capability/write state, requested action, and any
required authorization snapshot. It contains no independent source copy.

### NativeCloseCoordinator

| State       | On native close                                      | Allowed transitions                            |
| ----------- | ---------------------------------------------------- | ---------------------------------------------- |
| `idle`      | Veto, emit one close request, enter `requested`      | `requested`, then plan collecting              |
| `requested` | Veto without duplicate request                       | Cancel → `idle`; authorized plan → `permitted` |
| `permitted` | Consume one-shot permit after drains, allow shutdown | `consumed`                                     |
| `consumed`  | Normal shutdown only                                 | terminal                                       |

Shutdown order after authorization: cancel registered runs → drain accepted editor/view/autosave/layout work → close
SQLite → flush/close logger.

## Recent and persisted metadata

### RecentFileList

Persisted as a versioned JSON KV value:

```text
RecentFileListV1 {
  version: 1
  entries: CanonicalPath[0..6] // unique, newest first
}
```

Open or successful Save moves a path to the top. Display validates entries lazily and removes missing paths silently;
explicit choice revalidates and also returns a classified `not-found` error (see `ClassifiedError` below). No
timer/watcher validates the list.

### RecentlyClosedHistory

```text
RecentlyClosedEntry {
  canonicalPath: string
  view: DocumentViewState
}
```

Per-window memory list of 0–40 unique paths, newest first. Closing moves an eligible path to the top. Untitled entries
and source are excluded. Successful reopen/focus consumes; missing consumes with error; another Open failure retains.

### PersistedDocumentView

Versioned KV value keyed by a stable hash of canonical path. Stores only arrangement needed by Open precedence. It
does not restore tabs, active identity, source, caret, selection, or scroll at launch.

### FileSettings

| Field      | Type/default  | Rule                                                                                     |
| ---------- | ------------- | ---------------------------------------------------------------------------------------- |
| `autosave` | bool / `true` | Persisted through existing typed KV settings; appmodel applies only acknowledged values. |

## Projection-only entities

`AppStateSnapshot` and `AppStatePatch` may contain:

- global projection revision and tab-set revision;
- ordered ids and optional active id;
- content-free `DocumentMetadata` (identity/display/path/capability/revisions/dirty/detached/write state/view);
- recent-file paths and reopen availability;
- existing UI layout.

They never contain canonical content, disk baselines/raw bytes, authorizations, close-plan internals, conflict source,
Monaco tokens, or in-flight filesystem handles. `ActiveBufferAcknowledgement` and bounded prompt results are explicit
transient command boundaries, not projection state.

## Evidence entities

### VisualParityCase

| Field                                   | Bound/rule                                                      |
| --------------------------------------- | --------------------------------------------------------------- |
| `family`                                | One of exactly 17 spec families.                                |
| `width`                                 | 1280, 768, or 375 logical px; height 720.                       |
| `theme`, `mode`                         | glass/material/minimal × resolved light/dark.                   |
| `referenceRegion`, `applicationRegion`  | Reviewed selector mapping.                                      |
| `fixture`, `focus`, `scroll`, `overlay` | Deterministic named state.                                      |
| `variant`                               | Base or explicit Feature 003 file-only/File/conflict variant.   |
| `masks`                                 | Empty by default; smallest reviewed unfreezable rectangle only. |

~~The Cartesian primary manifest has exactly 306 cases before additional states.~~ **Superseded 2026-08-14**:
the whole-screen expansion is withdrawn; the contract is 14 pixel-compared component keys and 36
behaviour-verified keys. See `spec.md` Clarifications → Session 2026-08-14.

### VisualParityArtifact

On failure: immutable reference PNG, actual PNG, difference PNG, metric/bounding-box JSON, manifest+variant hashes,
raw command output, and exit status. An accepted change also carries its owning FR-FT requirement and unaffected
Feature 001/002 baseline disposition.

## Principal state transitions

1. **Hydrate clean**: restore settings/recent/path-view metadata → project zero or current process documents without
   restoring a prior session → return optional active acknowledgement.
2. **New**: validate <40 → mint id/default writable untitled state → append/activate → emit metadata patch → return
   acknowledgement; no disk/KV recent write.
3. **Open**: native/explicit path → cancel or canonicalize/classify/bounds/duplicate → restore open mode/view → insert
   or replace empty placeholder atomically → update recents → patch → acknowledgement.
4. **Edit**: active Monaco queues content → backend accepts for matching id → bump content revision/dirty → schedule
   eligible autosave → metadata-only patch.
5. **Save**: await active content/view → snapshot revision → authorize/check disk → serialize/encode/replace → commit
   baseline → publish committed revision → explicit toast or silent auto → rehydrate if projection not converged.
6. **Switch**: capture+await outgoing state → validate expected tab revision → update active id → patch → validate
   acknowledgement → dispose old/create fresh session.
7. **Conflict**: version mismatch → no write → bounded preview → Reload/Keep/Skip; only matching fresh tokens act.
8. **Close**: capture+await → prepare complete revision-bound plan → collect all choices/authorizations → execute saves
   without closes → remove targets only after success → activate adjacent or project optional active state.
9. **Native quit**: veto/request → reuse all-tab close plan → authorize → one-shot Quit → drain/cancel/close resources.
10. **Reopen**: inspect newest closed entry → canonical Open/focus → consume on success/missing, retain on other failure.

## Invalid transitions

- A 41st document, unsupported suffix, duplicate Save As path, stale tab/content revision, invalid/missing authorization,
  unsafe/large read-only write, incomplete close plan, or unconfirmed changed target performs no partial mutation.
- A failed outgoing flush installs no incoming content.
- A pre-commit write failure changes neither disk baseline nor path/dirty truth.
- A post-commit projection failure never reverts or repeats disk; it enters the resync barrier.
- Cancel and Skip are terminal for only their current request and never synthesize success or persistent authorization.
