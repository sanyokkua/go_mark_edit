# Data Model: Codebase Refactoring (Feature 004)

**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Date**: 2026-09-08

This feature adds no user-facing data. The entities below are the internal owners the refactor
introduces or consolidates; each names its fields, invariants and transitions so tasks can implement
them without re-deriving the rules. Persistence stays one SQLite key-value table.

## DocumentRecord (backend, `internal/appmodel/lifecycle.go`) — FR-001, FR-003, FR-005, FR-007, FR-051

One record per open document, owned by the lifecycle owner; every other map in the service goes.

| Field | Type | Rule |
|---|---|---|
| `id` | string | minted once at open; never reused within a process |
| `identity` | `file.Identity{Device, Inode}` typed per platform (signed on Darwin) or `path:<resolved>` only when the platform exposes neither | equality decides "already open" (FR-005) |
| `canonicalPath` | string or empty for untitled | updated only by Save As adoption |
| `bufferRevision` | uint64 | advanced by every accepted `UpdateBuffer` |
| `committedRevision` | uint64 | the buffer revision whose bytes are on disk |
| `publicationCommitID` | uint64 | monotonically increasing per document; a publication carrying a lower id is rejected (FR-001) |
| `writeQueue` | existing per-document write coordinator | serialises Save, Save As and autosave for the document; results applied in commit order |
| `autosave` | timer entry, generation | cancelled and released by disposal |
| `activationToken`, `saveReservation`, `normalization`, `conflict`, `keepMine` | per-document sub-records | all released by disposal |
| `baseline`, `baselineOrigin`, `failedWrite`, `detached`, `metadata` | as today | `effectiveMetadata()` is the only projector used by Open, patches and `GetState` (FR-007) |

Transitions: `Opening → Open → (Editing ⇄ Writing) → Committed → Published → Closing → Disposed`.
`dispose(id)` is the single exit and runs after every started write finished; after it, no field of
the record is reachable from any map (Story 1 scenario 3; white-box test W3).

Invariants: disk I/O happens outside the model lock; the emitter is called after the lock is
released (post-unlock queue); a refusal message is built from a snapshot taken under the lock (FR-002).

## Request and Outcome (`internal/bridge`) — FR-019, FR-020, FR-021

`Request{ID}` (first parameter of every bound method) and the backend `OutcomeCache` are defined in
[contracts/bridge-requests.md](contracts/bridge-requests.md): a completed outcome is kept for 60
seconds, at most 256 outcomes are kept with the oldest evicted first, and a call carrying an
in-flight id joins the running call. The frontend's own record is
`PendingCommand{id, command, pacing: bounded | userPaced, startedAt, noticeShown}`: bounded → 10 s
deadline once `bootstrapStatus === 'ready'`; user-paced (`OpenDocument`, `SaveAs`, `Save` of an
untitled document, `ResolveClosePlan`) → no deadline. The notice lifecycle is in the contract.

## CloseRequest (`internal/application/shutdown.go`) — FR-016, FR-017, FR-018, FR-057

| Field | Type |
|---|---|
| `id` | string, one per native close or quit request (monotonic counter plus process nonce) |
| `state` | one of the states of [contracts/shutdown-protocol.md](contracts/shutdown-protocol.md) |
| `requestedAt`, `deadline` (10 s) | timestamps |
| `frontendReady` | bool, set by `WindowReady` |
| `dirtyDocuments` | names of documents with unsaved changes at decision time |

`GetState` projects `pendingClose: {id}` so a frontend that becomes ready later discovers the request.

## ClassifiedFailure and result envelopes (`internal/apperr`, `internal/bridge`) — FR-052

`Failure{category, subject, message, remediation, id}` is embedded by every `*Result` envelope; one
constructor `bridge.Fail(category, subject, message, remediation)` replaces the fifteen wrappers;
`bridge.Guard(&result)` is the only panic recovery and turns a panic into an `internal` failure. The
error-code enum binding is unchanged.

## KVEntry (`internal/kv`) — FR-008, FR-053

| Column | Meaning |
|---|---|
| `key` | dotted namespace: `appearance.*`, `view.*`, `markdown.*`, `format.*`, `lint.*`, `content.*`, `editor.*`, `file.*` (settings); `layout.*` (layout); `recent.files` (recents); `document.view.*` (file metadata) |
| `value` | text; scalars as text, structures as versioned JSON `{"version": N, …}` |
| `type` | `string`, `bool`, `layout.versioned`, `recent.files.v1`, … |

Rules: `Tx(func(tx) error)` wraps every group update (a settings group is one transaction); `Get`
returns "absent" distinctly from a decode failure; unknown versions read as absent; rows the
refactored build does not own are never rewritten (no migration, no compatibility test).

## BaselineRecord (`.specify/baseline/<feature>.json`) — FR-064

Schema: [contracts/baseline-record.schema.json](contracts/baseline-record.schema.json). Verdict per
stage: `clean` (exit 0, no findings), `findings` (exit ≠ 0 with parsed findings), `failing` (exit ≠ 0
for a pass/fail stage), `unreliable` (exit ≠ 0 and nothing parsed — refused as a baseline).

## SharedComponent (frontend) — FR-034 to FR-043

Each shared component's inputs and consumer inventory are defined once in
[contracts/shared-components.md](contracts/shared-components.md); the final inventory is copied
into `docs/architecture.md`.

## StatusFact — FR-013

`{id, rowLabel, detailLabel, value, dropPriority}` declared once; the row renders by priority until
space runs out; Details lists every fact the row dropped.

## LinkTarget and ImageSource — FR-014, FR-049

| Kind | Condition | Outcome |
|---|---|---|
| `anchor` | `#fragment` | scroll the preview |
| `localDocument` | relative or absolute path, extension in {`.md`, `.markdown`, `.mdown`, `.txt`}, resolved after symlinks inside the document's folder | open through the normal open flow |
| `external` | `https:` or `http:` | system browser |
| `refused` | any other scheme, outside the folder, or an untitled document | one auto-dismissing warning notice naming the target and the reason |

`ImageSource`: `local` when the resolved path is inside the document's folder and the file is at most
20 MB → served by the asset route; otherwise `placeholder` with the alt text and no notice.

## StartupStep — FR-015

`bridge → model → settings → windowReady`, each with `state: pending | ok | failed | timedOut(10 s)`,
`attempt` id (a late answer from an abandoned attempt is ignored), `category` (the safe diagnostic
identity, never a path or raw error). Retry re-runs the failed step only; a bridge failure offers Quit
only; Quit is always offered.

## ActionAvailability — FR-045, FR-048

Unchanged shape (`available | deferred(reason)` statically, `available | unavailable(reason)` when
resolved in context); the registry becomes the single reader for the File menu, the toolbar, the tab
context menu and keyboard shortcuts; `formatting` commands are built by one runner; settings writes go
through one settings command owner; outcomes are typed (`committed | cancelled | refused | prompt |
conflict | mutated`) and reported once.
