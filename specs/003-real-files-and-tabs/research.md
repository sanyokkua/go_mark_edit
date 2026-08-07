# Research: Real Files and Tabs

This document resolves the technical choices required by
[`spec.md`](spec.md). It does not change the feature's product behavior. `docs/delivery/` remains
read-only reference material, and all planning-stage technical unknowns are resolved.

## Decision 1: Extend the existing backend-authoritative application model

**Decision**: Keep `internal/appmodel.AppModelService` as the only canonical owner of open documents,
tab order, active identity, revisions, disk baselines, save state, and recently closed history. Split
the implementation into focused files inside `internal/appmodel/`; inject filesystem, dialog, clock,
timer, and persistence ports. Do not introduce a second document service or frontend-owned tab store.

The snapshot and patch contracts gain ordered document identities, `tabSetRevision`, per-document
content revisions/capabilities, and an active identity/buffer that are optional together. The existing
single `state:patch` runtime subscription becomes a true fan-out to independent frontend listeners.

**Rationale**: This preserves the consumed Feature 001 ownership contract while fixing two current
preconditions: `GetState` assumes an active document and the frontend adapter silently retains only one
patch subscriber. Both defects are reached by New/Open and the zero-document state, so they belong in
the first vertical slice rather than a later cleanup.

**Alternatives considered**:

- A separate file-document state service: rejected because two services would need cross-service
  locking and could disagree about content, tab, and disk state.
- Redux-owned tab order with Go-owned file content: rejected because it recreates the split authority
  forbidden by the constitution.
- Preserve a synthetic blank document forever: rejected because the specification requires a genuine
  zero-document launcher and optional active buffer.

## Decision 2: Canonicalize identity in Go and keep display paths separate

**Decision**: Existing paths use absolute, cleaned, symlink-resolved identity. Save As canonicalizes
the selected existing parent directory before appending the chosen basename. Duplicate detection uses
the resulting canonical identity plus filesystem-aware identity checks for existing targets. Windows
identity comparison is case-insensitive; macOS paths are not globally lowercased because case-sensitive
volumes are valid. The backend owns every duplicate/collision decision.

The projection may carry the canonical path for tooltips, Copy path, Reveal, and recent-file surfaces,
but user-facing errors carry only a safe basename and classified remediation. An identity key and a
display breadcrumb are distinct fields.

**Rationale**: String comparison in React cannot safely handle symlinks, aliases, case rules, or Save
As targets that do not yet exist. Canonicalization before mutation makes duplicate Open and collision
refusal deterministic.

**Alternatives considered**:

- Raw dialog path strings: rejected because aliases can open two buffers for one file.
- Global lowercase normalization: rejected because it corrupts identity on case-sensitive filesystems.
- Frontend collision checks: rejected because the frontend does not own the open-path set.

## Decision 3: Separate raw-file classification from canonical editor text

**Decision**: Read at most the allowed byte bound before classification. Detect BOM, NUL, UTF-8
validity, uniform LF/CRLF, mixed-ending counts and first-ending tie break from raw bytes. Writable UTF-8
documents use LF-normalized canonical editor text plus retained file characteristics. Unsafe input keeps
its exact raw baseline and a tolerant display string, is marked read-only, and is rejected by every
write primitive before disk access.

Size thresholds are binary mebibytes with exact inclusive boundaries. A safe supported file at or below
10 MiB (10,485,760 bytes) stays writable; 10,485,761 through 52,428,800 bytes (50 MiB) is classified and
opened read-only; 52,428,801 bytes or more is rejected before partial model insertion, and classification
reads at most 52,428,801 bytes. The existing live-preview pause is preserved: preview stays active through
exactly 2 MiB (2,097,152 bytes) and pauses above it, where the registry-derived Refresh preview action
(Decision 18) renders one accepted revision on demand.

**Rationale**: Monaco edits logical text, while safe round trips require byte-level knowledge. Keeping
the raw classification distinct prevents lossy display text from becoming writable canonical content.

**Alternatives considered**:

- Preserve CRLF directly inside the Monaco value: rejected because editor normalization would make
  dirty comparisons and selection offsets unreliable.
- Lossy decode followed by Save As: rejected because it can corrupt bytes the user only asked to read.
- Refuse invalid input entirely: rejected because the specification requires tolerant read-only access.

## Decision 4: Use a platform-specific same-directory atomic replacement port

**Decision**: Snapshot canonical content and its revision under the appmodel lock, then release the
global lock before dialogs or disk I/O. Serialize writes per document. Create the temporary file in the
target directory, write the fully encoded bytes, apply the existing target's permission mode before
commit, sync and close the temporary file, recheck the expected disk version, and atomically replace.
On Unix, use same-filesystem rename and sync the parent directory. On Windows, use a build-tagged
ReplaceFile/replace-existing implementation rather than assuming `os.Rename` has Unix semantics.

All temporary artifacts are removed on pre-commit failure. A new target uses the platform's normal
creation permissions; an existing target retains its permission mode. Hard-link aliasing and extended
attributes retain the explicitly accepted specification tradeoff.

**Rationale**: The specification promises atomic preservation on macOS, Windows, and Linux. A single
plain `os.Rename` implementation cannot establish that promise on all three. Applying the original mode
before replacement avoids a committed file with the wrong permissions if chmod fails.

**Alternatives considered**:

- In-place writes: rejected because a crash or full disk can destroy the only copy.
- Copy then delete: rejected because it is not atomic.
- Plain cross-platform `os.Rename`: rejected because replacement guarantees differ by platform.
- A third-party production file library: rejected because the pinned standard library plus existing
  `golang.org/x/sys` platform support is sufficient.

## Decision 5: One portable disk version and bounded conflict preview

**Decision**: `DiskVersion` contains existence, size, nanosecond modification time, permission mode,
and platform file identity when available. It is captured after successful read/write and immediately
after native Save As overwrite confirmation, then compared again immediately before replacement. The
accepted same-filesystem-timestamp-tick race remains documented; no lock or watcher is added.

An external conflict produces a transient, backend-issued `ConflictPreview` containing the first
changed hunk with at most 12 displayed lines and 4 KiB of UTF-8 text per side, plus `truncated` flags.
It is never stored in Redux. Keep-mine authorization is bound to document identity, canonical path,
exact content revision, and detected disk version; Skip creates no authorization. Any edit invalidates
the preview and forces a fresh decision.

**Rationale**: One version type prevents Open, Save As, autosave, and conflict handling from applying
different race rules. A numeric preview bound satisfies the concise inline comparison without moving an
entire inactive document into the webview or inventing the deferred navigable diff feature.

**Alternatives considered**:

- Content hashing every pre-write check: stronger against timestamp races, but rejected as unnecessary
  work outside the accepted mitigation contract.
- Modification time alone: rejected because size and replacement identity are cheap additional signals.
- Full-document comparison in Redux: rejected because it violates the content-free projection and the
  deferred full-diff boundary.

## Decision 6: Persist small file metadata in the existing SQLite KV store

**Decision**: Add a typed `FileSettings` group with `autosave: true` under a new scalar KV key. Store
the at-most-six recent-file list as a versioned JSON value in one KV row, newest first and deduplicated
by canonical identity. Store per-path persisted arrangement as a separate versioned KV value keyed by a
stable hash of the canonical path. Corrupt or unknown versions fall back safely without blocking startup.

The at-most-40 recently closed list is per-window, memory-only, and contains canonical path plus
restorable view metadata but never source text. The application still launches with no restored tab set.
Concurrent processes keep the accepted WAL/busy-timeout and last-writer-wins behavior.

**Rationale**: ADR-0004 explicitly assigns settings, short recents, and per-document view mode to the
existing small SQLite KV store. These values do not need record-level relational identity or a schema
migration.

**Alternatives considered**:

- New `recent_files` and `document_views` tables: viable for cross-process merge semantics, but rejected
  because the accepted store is last-writer-wins and the bounded JSON values are small.
- Browser localStorage: rejected because it would create a frontend persistence authority.
- Persist recently closed source or full sessions: rejected because clean launch and no recovery/session
  restore are explicit boundaries.

## Decision 7: Schedule autosave in Go one second after accepted content

**Decision**: Start or replace a per-document one-second timer only after the backend accepts a new
canonical content revision. Autosave runs only for path-backed, writable documents while the
acknowledged setting is on. Timers and clocks are injected for deterministic tests. One per-document
write coordinator serializes autosave and explicit Save; explicit Save waits for or subsumes the active
write and emits exactly one explicit success notification.

Turning autosave off cancels timers that have not started and performs no catch-up write. A write already
past its start boundary finishes. Closing waits for the accepted buffer, view, and any in-flight write.

**Rationale**: Backend scheduling makes autosave depend on canonical accepted content, not optimistic UI
state. One second leaves headroom for SC-FT-007's requirement that at least 95 of exactly 100 measured
release-build autosaves — 25 each at 1 KiB, 256 KiB, 1 MiB, and 2 MiB (2,097,152 bytes) — complete within
5,000 ms measured monotonically from final input through atomic commit **including this debounce**, while
avoiding a write on every 200 ms buffer synchronization.

**Alternatives considered**:

- Frontend debounce: rejected because Redux/React does not own dirty state or disk writes.
- Reuse the 200 ms buffer-sync debounce as autosave: rejected as excessively write-heavy.
- Two-second debounce: valid, but one second gives more performance headroom without changing user-visible
  semantics.

## Decision 8: Activate documents with revision-bound acknowledgements and fresh Monaco models

**Decision**: Before Save, switch, close, reload, or arrangement hide, the frontend lifecycle
coordinator captures the active `{documentId, activationToken, handle}`, queues the latest content and
view, and awaits both adapter flushes. Failure leaves the old tab and editor installed. A successful
activation/reload result carries `{documentId, documentRevision, projectionRevision, content}`.

The frontend waits until the projection reaches the acknowledged revision, rejects any stale request
generation or identity/revision mismatch, then creates a fresh activation token, URI, and Monaco model.
Deactivation disposes the old model after flush. No model or undo history is cached across switches;
display-setting and arrangement changes inside one activation retain the model.

**Rationale**: This is the only sequence that simultaneously preserves backend authority, prevents
cross-document text installation, and satisfies the clarified requirement that Monaco undo history not
survive a switch.

**Alternatives considered**:

- Content-bearing `state:patch`: rejected because ordinary projection events must remain content-free.
- Fetch content after an active-id patch: rejected because another activation can win between calls.
- One cached model per tab: rejected because inactive source and undo history would remain in the webview.
- Optimistic activation/reorder: rejected because rejected stale commands would already be visible.

## Decision 9: Make post-write projection convergence explicit

**Decision**: Every committed write result includes the committed state revision and written content
revision. The adapter tracks the latest synchronously applied projection revision. If an injected emitter
failure reports `resyncRequired`, an event is absent/invalid, or the projection is behind the committed
revision when the command returns, the lifecycle command barrier blocks later document commands, calls
`GetState`, rehydrates once, and resumes only after the committed revision is represented. The write is
never retried or rolled back.

Pre-commit state transitions continue using rollback-on-publish-failure. The irreversible save path uses
a dedicated post-commit publisher that records the disk baseline before it reports convergence status.

**Rationale**: Wails `EventsEmit` is fire-and-forget in production, so backend emitter return values alone
cannot prove browser application. Pairing the committed revision with frontend projection tracking makes
ADR-0022 observable without pretending an irreversible disk replacement failed.

**Alternatives considered**:

- Trust event delivery unconditionally: rejected because adapter decode/application failure would leave a
  stale projection issuing commands.
- Roll back the file: rejected because restoration is another destructive, fallible write.
- Retry Save on missing patch: rejected because the first write already committed.

## Decision 10: Coordinate native close as a two-stage, one-shot protocol

**Decision**: The first `OnBeforeClose` request is always vetoed while the normal shell is active and
emits one idempotent close request. The frontend flushes the active lifecycle state, asks the backend to
prepare one revision-aware close plan, and renders the accessible webview prompt. Cancel clears the plan
and writes/closes nothing. Complete choices and any normalization/conflict decisions are collected before
execution. Save-all writes in tab order; no tab closes until every requested save succeeds.

After authorization, the backend sets a one-shot permit and invokes the injected native Quit port. The
second `OnBeforeClose` consumes the permit, cancels runs, drains editor/autosave/layout work, and permits
shutdown; database and logger closure remain ordered afterward. Repeated close requests while a plan is
open do not create duplicate dialogs.

**Rationale**: Wails v2's close callback is synchronous while Save/Discard/Cancel and inline conflicts are
asynchronous webview interactions. A veto/plan/one-shot-quit handshake satisfies both contracts without
blocking a native callback on browser work.

**Alternatives considered**:

- Prompt in `OnShutdown`: rejected because the window can no longer be vetoed.
- Native message dialog: rejected because the feature needs three actions, dirty-file lists, and inline
  comparisons.
- Allow close and restore after Cancel: rejected because it cannot guarantee no loss or mutation.

## Decision 11: Reuse the canonical action registry and build exact visual evidence from live sources

**Decision**: Promote only Feature 003's existing deferred action identities to typed lifecycle
dispatchers. Keep Table on `Ctrl/Cmd+Shift+T`; Reopen uses `Ctrl/Cmd+Shift+Alt/Option+T`; all downstream
actions remain deterministically unavailable. Split the placeholder tab/file chrome into focused
components without creating another label, shortcut, or availability registry. Replace Unicode icon
substitutes with local binding-derived monochrome SVG primitives.

Create a manifest with exactly 17 unique families × 3 widths × 6 resolved palettes = 306 primary pairs,
plus the named state fixtures. A second local server exposes the unchanged binding mockup. A versioned
test adapter supplies only the required file-only launcher/File/conflict variants using binding
primitives. Capture reference and application regions in the same Chromium engine at DPR 1 and zero
tolerance; assert exact computed metrics, readiness, three-run hashes, and retain reference/actual/diff
artifacts on failure. Any PNG comparison dependency is development-only and pinned in the manifest and
lockfile.

**Rationale**: Live, same-engine comparison honors the HTML/CSS authority and prevents current-app
screenshots from becoming a self-approved baseline. Registry reuse preserves Feature 002 behavior and
deferred boundaries.

**Alternatives considered**:

- Visual review or representative snapshots: rejected because the spec requires every pair and exact
  metrics.
- Replace the reference with app screenshots: rejected as baseline laundering.
- Edit the legacy mockup to add Feature 003 behavior: rejected because `docs/delivery/` is read-only;
  versioned test variants keep the source immutable.

## Decision 12: Layer proof and preserve the baseline

**Decision**: The later implementation begins with `just baseline 003-real-files-and-tabs` and stops on
any `UNRELIABLE` gate. Focused Go filesystem/state-machine tests, frontend adapter/session/component tests,
dev-bridge parity, architecture/offline checks, exact browser parity, actual-control journeys, real bridge
file operations, `just e2e-test`, `just verify`, `just check`, and a fresh `just build` walkthrough remain
separate evidence layers. SC-FT-010 retains its explicit five-minute zero-outbound observation.

`just package` is excluded because packaging remains deferred and the target intentionally fails. Browser
mock evidence never substitutes for native dialogs, disk bytes/permissions, close ordering, or current-host
Wails behavior.

**Rationale**: Each layer proves a different boundary. A green aggregate or mock-only journey cannot prove
data preservation or release behavior.

**Alternatives considered**:

- Run only `just check`: rejected because it excludes Playwright and the real build.
- Use the browser mock as file evidence: rejected because it never touches the real Wails bridge or disk.
- Replace historical failures with a new screenshot baseline: rejected because evidence must preserve
  provenance and unexplained drift remains a failure.

SC-FT-002's basic-journey evidence within this layer now runs two fixed fixtures rather than an informal
timed click-through: Fixture A creates a new untitled document, types one representative line, and Save As
into a fresh empty directory; Fixture B opens one pre-existing 1 KiB fixture file, edits one character, and
explicitly Saves. Timing starts when the launcher/application becomes ready for input and stops at the
explicit-save confirmation (the disk-commit event FR-FT-015 defines), never at a click. Immediately before
the walkthrough and again immediately after that confirmation, evidence takes one non-recursive directory
listing of only the target file's immediate parent directory; the only permitted difference is the target
file itself, and the FR-FT-009 same-directory atomic-replace temporary file must already be gone by the
after-listing. This reuses the existing atomic-write and explicit-save-confirmation seams from Decisions 4
and 7 rather than adding new instrumentation.

## Decision 13: Classify every user-facing failure into one fixed, named taxonomy

**Decision**: Every error or nonfatal warning surfaced by file/tab actions is classified into exactly one
of eight categories — `not-found`, `permission-denied`, `io-failure`, `conflict`, `capacity-limit`,
`unsupported-input`, `system-command-failure`, `persistence-warning` — carried as a typed code on the
existing `apperr.*Result` envelope alongside a safe subject (basename or disambiguated tab label only) and
a remediation drawn only from a fixed vocabulary (`Retry`, `Reload from disk`, `Keep mine`, `Skip`,
`Save to recreate`, `Copy path`, `Cancel`, or message-only). A repeated failure for the same document
identity and category updates one existing notification's count instead of stacking a new one. This
formalizes spec.md's classified error and remediation contract as one shared backend concept instead of
scattering per-call-site "actionable error" strings.

**Rationale**: The prior ad hoc "actionable error" phrasing let every call site invent its own wording and
made it easy to leak a private full path or raw OS text by accident. A closed, named taxonomy lets
`internal/apperr` centralize the safe-subject rule and dedup rule once, and lets tests assert on the typed
category instead of matching message strings.

**Alternatives considered**:

- Free-form per-call-site error strings: rejected because it is exactly the ambiguity the clarification
  pass closed, and it cannot be tested for the safe-subject rule mechanically.
- A larger taxonomy (one category per FR): rejected because it would not stay finite as FRs evolve and
  would defeat the point of a shared remediation vocabulary.
- Encode remediation choice in the frontend only: rejected because the backend is the only place that
  knows which remediation is valid for a given category and document state.

## Decision 14: Copy path and Reveal in file manager as injected clipboard/reveal ports

**Decision**: Add one injected `SystemClipboard.WriteText(text) -> ok | error(system-command-failure)` port
alongside the existing `DocumentFiles.Reveal(path) -> revealed | unavailable | error(...)` port. Both
`CopyPath` and `RevealInFileManager` are appmodel-level commands: they resolve the document's canonical
path (refusing untitled documents), and `RevealInFileManager` revalidates existence immediately before
calling `Reveal` — a known-missing document reports Reveal as unavailable without invoking the port, while
a disappearance discovered only at invocation marks the document detached and reports one deduplicated
`not-found` error. `Reveal` requests native exact-file selection where the host supports it, otherwise
opens the containing folder; either OS acceptance is success with no toast. Frontend focus restoration
(originating tab, else current tab, else tab-strip New, else launcher New) is a menu-close concern handled
the same way as every other tab-context-menu action; Reveal's post-success restoration additionally waits
for the application to regain foreground focus, since the file manager may briefly own it.

**Rationale**: Concrete Wails/OS calls for clipboard and file-manager reveal are wired only in the
composition root, matching the existing `DocumentDialogs`/`DocumentFiles` pattern from Decision 4. Treating
existence revalidation as an appmodel-level step (not inside the port) keeps the `not-found` versus
`system-command-failure` classification consistent with Decision 13's taxonomy and avoids a second source
of truth for detached-document state.

**Alternatives considered**:

- Let the frontend call an OS clipboard API directly: rejected because it would create a second Wails
  bridge access point outside the adapter-only import boundary.
- Skip existence revalidation and let the OS call fail: rejected because an OS-level "no such file" error
  cannot be safely rendered without risking a raw path/error leak, and it cannot distinguish known-missing
  from a disappearance race for the detached-document classification the spec requires.
- Do not offer Copy path as Reveal-failure remediation: rejected because the clarified spec requires it as
  a fallback when the OS command itself fails.

## Decision 15: Hold a process-local canonical identity reservation for every prepared entry

Open, recent-file, reopen and Save As hold a **process-local reservation** for the prepared canonical identity
from preparation until activation, commit, cancellation, or failure. A novel prepared Open reserves **both its
canonical identity and one document slot**, and **pending novel reservations count toward the 40-document limit**.
Canonicalization and deduplication happen **before** the limit is applied, so focusing an already-open identity
stays valid at capacity and consumes no slot. **Concurrent requests resolving to the same open or pending
identity join one authoritative outcome** rather than reserving another slot or creating a second document.
Save As reserves its chosen target and releases it on every terminal outcome. No application-wide or persistent
file lock is added.

**Rationale**: Without a reservation, two overlapping Open requests for one path can each pass the duplicate
check before either inserts, producing two identities for one file — exactly the identity split the spec forbids.
A process-local reservation is the smallest mechanism that closes the window, and because it lives in the single
canonical owner it cannot become a second source of truth. It is deliberately process-local: an application-wide
or on-disk lock would violate the multi-instance constraint in constitution V.

**Alternatives considered**:

- Recheck duplicates immediately before insertion only: rejected because the flush-and-await step between
  preparation and activation is asynchronous and unbounded, so the window stays open.
- Take an advisory file lock: rejected because independent windows must run without a lock file or
  single-instance forwarding.
- Serialize all Open requests behind one mutex for their whole lifetime: rejected because it would block the
  model on a native dialog the user may never dismiss.

## Decision 16: Check for external changes only in the foreground, and serialize conflicts through one modal

External-change checks run **only** on tab activation, window focus or resume, and before every write, for
path-backed documents **including read-only ones**. Feature 003 adds **no background file watcher and no polling
timer**. When several documents are in conflict, the application presents **one modal at a time**, retains the
current modal until it resolves or invalidates, **visibly projects every waiting document as blocked by conflict**
(the `tab-blocked-conflict` state), and selects subsequent eligible decisions in **authoritative tab order**.

**Rationale**: A watcher would add a background thread, platform-specific APIs, and a class of spurious events
that the offline/quiet-by-default product promise does not want. Foreground checks cover every moment at which a
stale buffer could actually cause harm. Serializing modals keeps each decision bound to one identity/revision/disk
version triple; concurrent prompts would let a user authorize an overwrite against a comparison that another
prompt had already invalidated.

**Alternatives considered**:

- `fsnotify`-style watching: rejected as background work with per-platform behavior differences and no
  requirement demanding it.
- A short polling timer: rejected for the same reason plus continuous idle I/O.
- Stacking simultaneous conflict modals: rejected because it makes authorization ordering ambiguous and cannot
  express "this tab is waiting" in the tab strip.

## Decision 17: Make Move tab left/right registry-derived reorder actions with a confirmed, announced result

`Move tab left` and `Move tab right` are canonical registry actions. They appear in the tab context menu **after
the binding's close-action group and before its path-action group**, are **unavailable at their respective strip
edges**, and reorder **their target** from the menu or **the active tab** on `Ctrl/Cmd+Shift+PageUp` and
`Ctrl/Cmd+Shift+PageDown`. Every move **waits for backend confirmation before projecting the order**, keeps the
document active and the current focus unchanged, and announces `Moved {filename} to position {position} of
{count}` through a polite live region. A move past an edge is a **successful no-op that does not increment the
tab-set revision**.

**Rationale**: Reorder is a canonical tab-set mutation, so it must follow the same backend-authoritative path as
activation and close rather than optimistically reordering a projection. `Ctrl/Cmd+Shift+T` is already the
delivered Table binding, so reorder takes the PageUp/PageDown pair, which stays clear of the existing
`Ctrl+PageUp`/`Ctrl+PageDown` navigation. Not bumping the revision on an edge no-op keeps concurrently issued
close/reorder commands from being spuriously refused as stale.

**Alternatives considered**:

- Project the new order optimistically and reconcile later: rejected because it contradicts the projection-only
  frontend rule and would briefly show an order the backend never accepted.
- Treat an edge move as an error: rejected because the spec requires a successful no-op, and an error toast for
  pressing a key twice is user-hostile.
- Reuse drag-and-drop only: rejected because reorder must be keyboard-operable under constitution VI.

## Decision 18: Own Refresh preview in the frontend action layer, not the Go classification package

`Refresh preview` is a **registry-derived action with no keyboard shortcut**, available from the paused-preview
surface for supported text. It renders **exactly the current backend-accepted revision**, **rejects or coalesces a
duplicate run**, remains current only while that revision is unchanged, **re-pauses on the next accepted edit
above 2,097,152 bytes**, and on failure leaves preview paused with a classified `io-failure` error offering Retry.
Ownership sits with the frontend action/preview layer (`T009`), while `internal/file` keeps only the size
classification that decides when preview pauses.

**Rationale**: The action is a registry entry with availability, an accessible name, a rendering side effect and a
classified failure surface — none of which a Go byte-classification package can own. Splitting it this way keeps
FR-FT-005's size boundary in the one place that reads bytes and its user-facing action in the one place that owns
the canonical registry, without either becoming a second owner of the other's concern.

**Alternatives considered**:

- Give the action a keyboard shortcut: rejected because the clarified spec explicitly assigns it none.
- Re-render continuously above the bound: rejected because that defeats the pause the size threshold exists to
  create.
- Let a duplicate invocation start a second render: rejected because the spec requires rejection or coalescing,
  and two concurrent renders of one revision waste work and can resolve out of order.

## Decision 19: Measure SC-FT-007 on the fresh release build with a fixed 100-trial protocol

SC-FT-007 is measured on the **freshly built current-host release binary** (`just build`). The protocol is fixed:
**20 uncounted warmups (5 per size)** and **exactly 100 measured trials (25 per size)** across accepted revisions
of **1 KiB, 256 KiB, 1 MiB, and 2 MiB**; each trial replaces one character in a clean, path-backed, writable
document with autosave on, local temporary storage and no conflict; timing is **monotonic** from completion of the
final input event through atomic replacement committing that revision, **including working-copy synchronization
and the one-second debounce**; **no retry, outlier removal, or discarded failure** is permitted and a failed
eligible write is a counted miss; **at least 95 of 100** must be at or below **5,000 ms**; and all durations,
sizes, revision/commit identities, disk-byte results, p50/p95/max, warmups and host/OS/filesystem/build metadata
are retained.

**Rationale**: The criterion is about real disk latency reaching a real user. `npm --prefix frontend run
verify:ui` is Playwright against the deterministic dev-bridge mock, and the injected fake clocks used for
debounce unit tables deliberately remove the very duration being measured — neither can produce this evidence.
Constitution VII requires mock-bridge tests to be complemented by numbered live cases on the built binary, and the
spec's own edge case forbids substituting fake-clock or mock results for final-input-to-real-commit timing.
Fixing the trial count and size distribution in advance also removes the temptation to stop sampling once the
percentile looks acceptable.

**Alternatives considered**:

- Measure in the Playwright mock suite: rejected as prohibited by the spec and constitution, and meaningless
  because the mock performs no disk write.
- Measure with an injected fake clock: rejected because it measures scheduling arithmetic, not commit latency.
- Sample "representative" sizes until the 95th percentile passes: rejected because a variable stopping rule is
  not a measurement; the counts and sizes are fixed before the run.
