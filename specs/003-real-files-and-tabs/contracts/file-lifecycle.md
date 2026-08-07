# Contract: New, Open, File Classification, and Projection

This contract refines the consumed Feature 001 application-state and command-boundary contracts. Logical
shapes are language-neutral; implementation DTOs remain typed `apperr.*Result` envelopes and adapter-only
Wails calls.

## Ownership

- `internal/appmodel` owns canonical documents, ordered tabs, active identity, revisions, limits, dirty state,
  disk baseline, recents, and path-view metadata.
- `internal/file` implements injected path, raw-read/classification, disk-version, native-dialog, and later
  atomic-replacement capabilities. It owns no live document state.
- `internal/settings` owns typed acknowledged settings; appmodel consumes the acknowledged default open mode and
  autosave value.
- Redux projects metadata only. Active source crosses only hydration/activation/reload acknowledgement boundaries.
- Components dispatch commands; they never invent documents, recents, active tabs, capabilities, or successful
  outcomes.

## Snapshot and patch shape

```text
AppStateSnapshot {
  revision: uint64
  tabSetRevision: uint64
  orderedDocumentIds: string[0..40]
  documents: map<string, DocumentMetadata>
  activeDocumentId?: string
  ui: UILayout
  recentFiles: string[0..6]
  canReopenLastFile: boolean
}

AppState {
  snapshot: AppStateSnapshot
  activeBuffer?: ActiveBufferAcknowledgement
}

AppStatePatch {
  revision: uint64
  tabSetRevision?: uint64
  orderedDocumentIds?: string[0..40]
  documents?: { upsert?: map<string, DocumentMetadata>, remove?: string[] }
  activeDocument?: { present: boolean, documentId?: string }
  recentFiles?: string[0..6]
  canReopenLastFile?: boolean
  ui?: UILayout
}
```

`activeDocument.present=false` explicitly clears active identity; omission means unchanged. Snapshot active id and
active buffer are present or absent together. Patches never contain source content.

`DocumentMetadata` includes id, canonical path or absent, display name/optional parent, content revision,
capability, encoding/BOM/line-ending state, size class, dirty/detached/write state, word count, and view metadata.
Full raw bytes, baselines, authorizations and close plans are absent.

## Commands

### NewDocument

```text
NewDocument(expectedTabSetRevision) -> DocumentTransitionOutcome
```

1. Refuse if the expected tab revision is stale or 40 documents are already open.
2. Mint one stable id and empty writable untitled Document: Editor mode, UTF-8, LF, no BOM, no path, no write.
3. Append and activate it; do not persist a recent path.
4. Emit one metadata/order/active patch and return an `ActiveBufferAcknowledgement`.

### OpenFromDialog

```text
OpenFromDialog(expectedTabSetRevision) -> OpenOutcome
```

The Go service calls the injected native file chooser filtered to `.md`, `.markdown`, `.mdown`, and `.txt`.
Empty path is `cancelled` and creates no patch, error, document, notification, or recent entry. A returned path is
passed to canonical `OpenPath` below.

### OpenPath

```text
OpenPath(path, source, expectedTabSetRevision, optionalRestoredView) -> OpenOutcome

OpenOutcome =
  cancelled
  focused { documentId, projectionRevision, activeBufferAck? }
  opened { documentId, projectionRevision, activeBufferAck }
  refused { classifiedError }
```

`source` is only `dialog`, `recent`, or `reopen` in Feature 003. Future workspace/OS/drop adapters must reuse this
command but are not implemented now.

Order:

1. Validate expected tab revision and 40-document bound before inserting anything.
2. Validate the supported suffix case-insensitively.
3. Canonicalize in Go and focus an already-open identity without creating a duplicate; focused success updates
   recent files and consumes a reopen entry when applicable.
4. Stat and reject 52,428,801 bytes or more (over 50 MiB) before any Document insertion; read at most
   52,428,801 bytes.
5. Classify UTF-8/NUL/BOM/endings/size/capability and create canonical display text.
6. Apply default-open-mode precedence and persisted arrangement.
7. If the only tab is unchanged empty untitled, replace it as one transition; otherwise append.
8. Update the at-most-six MRU for a real path, publish content-free metadata/order/active state, and return the
   active acknowledgement.

Any failure before step 8 leaves the model and recents unchanged. An invalid UTF-8/NUL, lone-CR, or
10,485,761–52,428,800-byte success is read-only with a visible reason; a `none` (no LF or CRLF) file stays
writable. Live preview stays active through exactly 2,097,152 bytes and pauses above it, where the
registry-derived Refresh preview action renders exactly one backend-accepted revision, coalesces duplicate
runs, re-pauses on the next accepted edit above that bound, and on failure leaves preview paused with a
classified `io-failure` offering Retry.

### ListRecentFiles

```text
ListRecentFiles() -> RecentFilesOutcome
```

Read the versioned KV value, validate paths only on this explicit display command, silently remove missing entries,
persist the bounded result, and return at most six canonical paths. No watcher/timer performs this work.

### OpenRecentFile

```text
OpenRecentFile(canonicalPath, expectedTabSetRevision) -> OpenOutcome
```

Revalidate the selected path and call `OpenPath`. If now missing, remove it and return a classified `not-found`
error; other failures follow canonical Open without a partial recent/tab mutation.

## Native and filesystem ports

```text
DocumentDialogs {
  ChooseOpenFile(filter) -> path | cancelled | error
  ChooseSaveFile(suggestedName, filter) -> confirmed path | cancelled | error
}

DocumentFiles {
  CanonicalizeExisting(path) -> CanonicalPath
  CanonicalizeCandidate(path) -> CanonicalPath
  ReadClassified(path, maxBytes) -> ClassifiedRead
  CurrentVersion(path) -> DiskVersion
  AtomicReplace(request) -> CommittedDiskSnapshot
  Reveal(path) -> revealed | unavailable | error(not-found | system-command-failure)
}

SystemClipboard {
  WriteText(text) -> ok | error(system-command-failure)
}
```

`RevealInFileManager(documentId)` and `CopyPath(documentId)` are appmodel-level commands over these ports: both
first resolve the document's canonical path (refusing untitled documents), `RevealInFileManager` revalidates
existence before calling `Reveal`, and both classify a port failure per the classified error and remediation
contract in `spec.md` (`not-found` for a known-missing or disappeared target, `system-command-failure` for a
clipboard or OS command failure). Full behavior — notification text, focus restoration order, and deduplication —
is defined in [tab-session.md](tab-session.md).

Concrete Wails/runtime/OS calls are wired only in the composition root. Handlers take no context; services receive
the lifecycle context. Empty native dialog paths are cancellation, not errors.

## Persistence

- `file.autosave` (or the final typed key chosen by implementation) is a bool, default true.
- `recent.files` is versioned JSON with 0–6 unique canonical paths.
- `document.view.<stable-path-hash>` is a versioned arrangement value.
- Bad type/version/value falls back safely and does not rewrite solely because it was read.
- Existing SQLite WAL, busy timeout, multi-instance last-writer-wins, CGO-free driver, and additive-key rules remain.
- No source content, tab session, recently closed history, disk baseline, or authorization is persisted.

## Projection fan-out and convergence

One Wails `state:patch` runtime listener feeds a set of independent frontend subscribers. Adding/disposal of one
consumer cannot replace another. During hydration, valid newer patches queue then apply in revision order.

Every lifecycle command result names the projection revision it committed. The frontend applies an active buffer
only after that revision is represented. Invalid/out-of-order patches or a committed result ahead of the projection
enter the shared rehydrate barrier described in [save-conflict-close.md](save-conflict-close.md).

## Errors and privacy

- Every error is classified into exactly one of the eight categories in spec.md's classified error and remediation
  contract (`not-found`, `permission-denied`, `io-failure`, `conflict`, `capacity-limit`, `unsupported-input`,
  `system-command-failure`, `persistence-warning`), each carrying only that category's fixed remediation.
- Internal paths, OS details, raw bytes, stack causes, and home-directory prefixes never cross as error detail;
  messages name only the safe basename or disambiguated tab label, and optional numeric limit.
- Approved full paths may appear only in explicit path affordances: recent list, tooltip, Copy path, and Reveal.
- Cancellation is a normal outcome and never produces an error toast.
- A repeated failure for the same document identity and category updates one existing notification's count
  instead of stacking a new one.

## Required proof

- Optional-active and zero-document snapshot/patch round trip in Go, TypeScript, Wails generation, and dev bridge.
- Path alias/case/candidate-parent and duplicate-open tests on supported hosts.
- Suffix/cancel/unsafe/NUL/BOM/LF/CRLF/mixed/`none`/lone-CR/NEL-U+2028-U+2029 tables, exact-byte size rows at
  2,097,152 / 2,097,153 / 10,485,760 / 10,485,761 / 52,428,800 / 52,428,801, and 41st/placeholder/default-mode
  tables.
- Identity-reservation tables: reservation held until activation, commit, cancellation or failure; a novel
  prepared Open reserves identity plus one slot; pending novel reservations count toward the 40-document limit;
  concurrent same-identity requests join one authoritative outcome; every terminal outcome releases the
  reservation.
- Appmodel/handler/composition tests proving no state mutation on failures.
- Patch fan-out/disposal/bootstrap-order tests.
- Real native Open and raw-byte inspection; browser mock evidence is insufficient for filesystem claims.
