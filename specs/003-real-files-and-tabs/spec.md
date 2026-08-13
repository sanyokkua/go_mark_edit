# Feature Specification: Real Files and Tabs

**Parent branch**: `feature/v1-implementation` — task branches use `feature/v1-implementation--003-tNNN-*`
(these artifacts were authored on `feature/v1-implementation--003-real-files-and-tabs-specify`)

**Created**: 2026-08-07

**Status**: ready for implementation

**Input**: User description: "I can open, edit, save, and switch between real Markdown files. Add New, Open, Save, Save As, backend-authoritative file lifecycle, atomic preservation, dirty/close protection, saved-file autosave, external-change recovery, identity-safe real tabs, recent files, the 40-document limit, and mockup-aligned file widgets. Keep workspace enumeration, folder trees, file associations, rich-rendering expansion, packaging, and Assistant behavior deferred."

## Source Decisions Carried Forward

- The completed Feature 001 native shell, backend-authoritative application model, projection boundary,
  clean-launch rule, responsive shell, appearance lifecycle, and operating-system-owned window frame remain
  in force.
- Feature 002's visual-only File and tab fixtures become real only for the file and tab actions owned by
  this feature. Its formatting actions, toolbar behavior, responsive relocation rules, and canonical action
  registry remain unchanged.
- `Ctrl/Cmd+Shift+T` remains the delivered Table action. Recent files are available from the launcher and
  File menu without taking that binding; reopen-last-closed-tab uses
  `Ctrl/Cmd+Shift+Alt/Option+T`.
- Closing the final tab now activates the phase-bounded zero-document launcher because real New, Open, and
  recent-file commands exist. Open Folder and recent folders remain visibly unavailable until the workspace
  feature; the complete Feature 001 launcher contract remains unfinished until then.
- The binding mockup governs the shape of the File menu, tab strip, tab context menu, empty state, save and
  quit prompts, external-change prompt, status feedback, and responsive placement. This feature governs their
  behavior and preserves the completed ordinary native frame.
- The binding mockup's HTML and CSS are the exact source of truth for webview-owned shape and styling, not an
  illustrative approximation. The supplied mockup screenshots corroborate that authority, while the supplied
  current-build screenshots are discrepancy evidence. Planning and verification must serve the mockup and the
  application locally, capture both under the same deterministic browser conditions and logical content-box
  dimensions, and compare their mapped in-scope regions without using a newly approved application screenshot to
  conceal existing drift.

## Clarifications

### Session 2026-08-07

- Q: When a user switches away from a tab, which editor identity and history should survive for that inactive
  document? → A: Persist document identity and restorable view state; recreate the Monaco model, session, and
  token on activation, and do not preserve Monaco undo history across tab switches.
- Q: When an external disk change blocks Save, what comparison and outcomes should the prompt provide? → A:
  When disk and editor content differ, show and explain a concise inline On disk/Yours comparison; offer Keep
  mine for one later editor-version write, Reload from disk, and Skip, which cancels only the current write,
  keeps the editor dirty, writes nothing, and requires a fresh decision on the next write attempt.
- Q: Should Feature 003 activate the zero-document launcher now while Open Folder and recent folders remain
  deferred? → A: Activate New, Open, and at most six recent file paths now; keep Open Folder and recent
  folders unavailable until the workspace feature completes the Feature 001 launcher contract.
- Q: Which shortcuts and command meaning should Feature 003 use for closing and reopening documents? → A:
  Close the active tab with `Ctrl/Cmd+W`, reopen the most recently closed document with
  `Ctrl/Cmd+Shift+Alt/Option+T`, and preserve `Ctrl/Cmd+Shift+T` for the delivered Table action.
- Q: How exact is mockup parity, and how must it be proved before tasks can claim the visual work complete? → A:
  Use the binding mockup's HTML/CSS values as the exact shape and style target for every in-scope webview-owned
  region. Serve the read-only mockup and the local application simultaneously, capture both with identical logical
  content-box dimensions, pixel ratio, zoom, fonts, fixture state, focus, scroll, appearance, and motion settings,
  and require zero unexplained screenshot drift in mapped regions plus exact computed-style and bounding-box
  assertions.
  Exclude the OS-owned frame and native dialogs, populated workspace and Assistant surfaces, and deferred rich-
  rendering content; preserve unaffected Feature 001/002 behavior and baselines.
- Q: When Save As selects a path that is already open in this window or already exists on disk, which collision
  policy should apply? → A: Reject a canonical path already open in this window. For another existing target,
  native overwrite confirmation remains the only overwrite confirmation; after confirmation, capture the target
  disk version and refuse with an actionable error if it changes before atomic replacement.
- Q: If the user edits Yours while an external-change prompt is open, which editor revision may Keep mine
  authorize? → A: Authorize only the exact editor revision shown in the comparison. Any edit invalidates the
  prompt and requires a refreshed comparison and decision.
- Q: After tabs close, exactly what should Reopen last file remember and restore? → A: Keep up to 40 unique
  path-backed entries per window in newest-first order, storing canonical path and restorable view metadata but
  no source content. Reopen through canonical Open with a fresh identity, consume successful entries, remove
  stale paths with an actionable error, and exclude untitled documents.
- Q: When a file's disk version changes but its canonical text still matches the editor, what should GoMarkEdit do
  before continuing the pending write? → A: Re-read the file stably. If its bytes, byte-order mark, line endings,
  and permission mode still match the recorded baseline, refresh only the disk version and continue the suspended
  write. Otherwise require a metadata-aware Reload from disk, Keep mine, or Skip decision before writing.
- Q: After the user confirms mixed-line normalization or chooses Keep mine, how should the blocked write continue,
  including an explicit Save that arrives during autosave? → A: Resume the exact blocked intent automatically.
  Explicit Save flushes its latest accepted revision, waits for any in-flight autosave, reuses that commit only when
  it contains the same revision, otherwise performs one serialized follow-up write, and reports one explicit success
  only after that revision commits.
- Q: Without a background file watcher, when should inactive or read-only files be checked for external changes, and
  how should simultaneous conflicts appear? → A: Check on tab activation, window focus or resume, and before writes.
  Keep conflicts bound to document identity and revision, present one modal at a time in authoritative tab order,
  leave every queued document visibly blocked by conflict, and use no watcher or polling timer.
- Q: If a committed write is followed by repeated full-state rehydration failure, what recovery, quit, and native
  close-permit behavior should apply? → A: Attempt immediate rehydration plus retries after 250 ms and one second,
  then keep commands and normal close blocked behind a persistent Retry surface that truthfully says the file was
  saved. Permit Quit and discard newer unsaved changes only after a second confirmation. Never replay or roll back the
  write, and issue the one-use native close permit only after cancellation and drain succeed.
- Q: What keyboard contract should reorder tabs while keeping navigation and activation distinct? → A: Add
  registry-derived Move tab left and Move tab right actions to each tab context menu and bind
  `Ctrl/Cmd+Shift+PageUp/PageDown` to moving the active tab one position. Keep the document active and focus unchanged,
  wait for backend-confirmed order, announce the resulting position, and make an edge move a no-op without a revision
  bump.
- Q: Which ordering and path-safety contract should New, Open, recent/reopen, and Save As follow when activation, the
  40-document limit, aliases, and concurrent writers overlap? → A: Use a two-phase revision-checked lifecycle. Select
  Open without mutation; canonicalize and deduplicate before applying the insertion limit; flush the outgoing session
  before activation; then revalidate the tab revision and a process-local canonical identity reservation. Stable reads
  use version-before/read/hash/version-after. Save As reserves its target and rechecks version plus raw-byte hash
  immediately before replacement. Add no application-wide or persistent file lock, and explicitly retain the
  unavoidable race from an uncooperative writer after the final check.
- Q: What exact size, line-ending, and preview-refresh rules should apply at the 2/10/50 limits and to text without LF
  or CRLF? → A: Use binary 2/10/50 MiB thresholds with exact inclusive boundaries and read at most 50 MiB plus one
  byte. Preserve `none` files without adding a terminator until the user inserts a break, then use LF. Open lone-CR
  text read-only with a warning; treat NEL, U+2028, and U+2029 as ordinary content. A registry-derived Refresh preview
  action with no shortcut renders one accepted revision; the next edit above 2 MiB pauses again, and failure remains
  paused with Retry.
- Q: When mixed endings or an external disk change blocks a write, what exact confirmation modal and bounded comparison
  should the user receive? → A: Use the shared accessible webview modal with a safe initial choice. Mixed endings show
  Normalize line endings?, the safe filename, proposed LF/CRLF consequence, Normalize and save, and Cancel; Cancel has
  initial focus and Escape/backdrop semantics. External conflicts show File changed on disk and the first changed hunk,
  enforcing both 12-line and 4,096-UTF-8-byte limits per side without splitting a code point and explaining truncation.
  Reload, Keep mine, and Skip retain order; Skip has initial focus and Escape semantics. Read-only conflicts provide
  Reload plus structural Cancel only. Normalization is an additional `save-prompt` state and conflicts remain under
  `reload-prompt`.
- Q: How should GoMarkEdit authoritatively display saved/autosaved state and distinguish tabs whose filenames and
  immediate parent folders are identical? → A: Go projects Not saved, Unsaved changes, Saved, Autosaved, or Read-only
  with capability/dirty precedence and only changes a clean status when the committed revision is still current. Tabs
  display basename plus the shortest unique canonical parent suffix, recomputed after tab/path changes with host-aware
  comparison. Control and bidirectional-formatting characters are escaped or isolated; visual overflow preserves a
  distinguishing suffix, the accessible label remains complete, the tooltip carries the approved full path, and the
  document heading retains at most one parent segment.
- Q: Which exact completion-evidence contract should define autosave timing, cross-instance recent-file ordering, and
  the finite additional visual-state matrix? → A: Measure 20 warmups and exactly 100 release-build autosaves across
  1 KiB, 256 KiB, 1 MiB, and 2 MiB, timing final input through commit and requiring at least 95 within 5,000 ms with no
  excluded failures. Promote recents transactionally against the latest committed six-entry list, using SQLite commit
  order across instances and explicit display refresh. Define 40 additional state IDs, each in all six palettes at one
  assigned width: 240 additional plus 306 primary equals 546 logical cases; three repetitions equal 1,638 executions
  without changing the manifest count.
- Q: Which complete behavior should Copy path and Reveal in file manager use? → A: Copy the exact canonical absolute
  path for any path-backed document, including detached documents, and announce `Copied path for {safe filename}` in
  a transient polite notification. Reveal revalidates existence, requests native exact-file selection where
  supported, otherwise opens the containing folder; OS acceptance is success and produces no toast. Known-missing
  Reveal is unavailable; a disappearance race marks the document detached and reports one deduplicated
  `not-found` error with Save-to-recreate and Copy-path remediation. Clipboard or OS failures produce one
  deduplicated `system-command-failure` error with Retry; Reveal failure also offers Copy path. The menu closes and
  focus returns without activating another document: originating tab if present, otherwise current tab, tab-strip
  New, or launcher New. After a successful Reveal, restoration occurs when the app regains foreground focus.
- Q: What finite set of error categories and remediation actions should replace every ambiguous "actionable
  error"/"actionable remediation" phrase? → A: Adopt one eight-category taxonomy — `not-found`,
  `permission-denied`, `io-failure`, `conflict`, `capacity-limit`, `unsupported-input`, `system-command-failure`,
  and `persistence-warning` — each remediated only from a fixed vocabulary (Retry, Reload from disk, Keep mine,
  Skip, Save to recreate, Copy path, Cancel, or message-only), with one safe-subject rule (basename or
  disambiguated tab label only, never a full path or raw OS/stack text). Every existing "actionable" phrase in the
  operative requirements, acceptance scenarios, and edge cases now cites its category.
- Q: For SC-FT-002's 30-second walkthrough, when should the timer start and stop, what fixture should be used, and
  how should the before/after filesystem inventory be bounded to prove no hidden files were created? → A: Start
  timing when the launcher/application becomes ready for input and stop it at the explicit-save confirmation (disk
  commit, not a click). Use two fixtures: a new untitled document with one typed line saved into a fresh empty
  directory, and a pre-existing 1 KiB file with one character edited and saved. Bound the filesystem inventory to a
  non-recursive snapshot of only the immediate parent directory of the target file, taken before and after; the only
  permitted diff is the target file itself, and the atomic-replace temporary file must already be gone.

### Session 2026-08-09

- Q: Should exact binding-mockup parity be achieved by changing production UI or by normalizing the comparison
  harness? → A: Change the production UI to match the immutable binding mockup as closely as the in-scope contract
  requires. Do not edit the mockup, replace the reference, widen masks, increase tolerance, or normalize away
  genuine production layout drift.
- Q: Where should document identity, the resize divider, and status live in the converged layout? → A: Render
  document identity in the top in-app menu row and remove the separate vertical identity row; keep the divider
  resizable but overlay it so it consumes no layout width; render the 28 px status bar below the editor content,
  outside the main document content area.
- Q: What workspace and Assistant surfaces are in scope? → A: Match the empty workspace frame only. Do not add a
  populated folder tree or workspace enumeration. Keep the Assistant surface zero-width and defer all Assistant and
  provider behavior.
- Q: Should ordinary startup change to support parity? → A: No. Preserve normal startup behavior unchanged and
  seed the populated multi-document fixture only on the deterministic parity route.
- Q: How should T045 resolve the retained editor-region metric that includes the mockup Assistant column even
  though CL-17 and FR-FT-049 require a zero-width Assistant? → A: Preserve the zero-width Assistant contract and
  revise the fixed reference mapping to an explicit zero-Assistant adapter region. The adapter may activate the
  mockup's existing `.app.no-assistant` class, preserve the immutable source hash and HTML/CSS values, and map
  the editor region to `#app.no-assistant .content`; it MUST NOT change production Assistant behavior, masks,
  pixel tolerance, coordinate handling, comparator, or the mockup source.

### Session 2026-08-12

- Q: Should T059 preserve canonical macOS accelerator glyphs or require the mockup's literal `Ctrl` text on macOS?
  → A: Preserve native platform labels in production: macOS File-menu accelerators render `⌘N`, `⌘O`, `⌘S`, and
  `⌘⇧S`; Windows and Linux retain their platform-correct labels. T059 records an explicit, task-local visual
  evidence exception for the macOS accelerator glyph text when the immutable mockup uses `Ctrl` text. The exception
  covers only those accelerator glyph pixels. It does not waive popup geometry, row or label placement, action
  availability, focus, keyboard behavior, semantic shortcut values, or any other comparison, and it MUST NOT change
  the mockup, masks, tolerance, comparator, or coordinate handling.

### Session 2026-08-13

- Q: The reviewed editor-region mapping compares `#app.no-assistant .content`, which contains the mockup's
  deferred rich-rendering widgets and its hand-written editor text, while this specification requires those
  regions to be excluded rather than reproduced. How is that contradiction resolved? → A: Keep the whole mapped
  region compared and split the two pane interiors by owner. **Preview pane:** the Feature 003 reference variant
  carries the same in-scope basic-preview content the application renders, built only from the mockup's own
  `.preview-in` primitives, and the deferred rich-rendering widgets — remote-content banner, image placeholder,
  math, and Mermaid — are removed from the reference rather than manufactured in production. **Editor pane:**
  Monaco owns its own text raster, gutter metrics and internal layout under Feature 002, so the editor pane's
  interior is a named reviewed region exclusion rather than a pixel comparison; its position, size, and computed
  styles are still asserted exactly, and the pane shell, header and metadata remain fully compared. The exclusion
  is declared in the reviewed mapping, is bounded to that one component, and is not a mask, a tolerance change,
  or a comparator change. The immutable mockup HTML/CSS and its raw source hash stay unchanged, and the manifest
  count does not change.
- Q: The `status-saved`, `status-autosaved`, `status-unsaved-changes`, `status-read-only`, `status-mixed-ending`
  and `status-large-file` manifest IDs require paired reference states, but the immutable mockup contains only the
  static `Autosave: On` status condition. How is that resolved? → A: Permit exactly six reviewed Feature 003
  reference-adapter status variants built from the mockup's own status-bar primitives. The fixed 546 logical-case
  and 1,638-comparison contract is preserved, the raw immutable mockup source hash is preserved, the mockup
  HTML/CSS is never edited, and a production-only `comparisonAttempted: false` artifact MUST NOT be counted as a
  visual-parity pass.
- Q: The toolbar's `image`, `format`, `compact` and `lint` actions are deferred, so production renders them
  visibly unavailable, but the immutable mockup draws no disabled state anywhere. Measured at 1280px Minimal
  Light, that collapses 751 of the toolbar region's 965 differing pixels into an opacity difference instead of
  measuring geometry. How is that resolved? → A: Extend the same reviewed treatment FR-FT-056 already grants the
  File menu. The Feature 003 reference variant renders those four toolbar controls at the single reviewed
  unavailable opacity used for the File menu's deferred rows, built from the mockup's own `.tbtn` primitive, so
  the comparison keeps measuring geometry, labels and spacing rather than collapsing into a colour difference.
  Production's deferred outcomes are unchanged — the controls stay disabled and non-activating — because Feature
  003 may not change any deferred outcome. The immutable mockup HTML/CSS and its raw source hash stay unchanged,
  no mask, tolerance, comparator, coordinate handling or manifest count changes, and this treatment is confined
  to controls the action registry marks deferred.
- Q: FR-ED-004 requires the View menu to expose Editor, Split, and Preview "in the original mockup order and
  grouping", but the mockup's `#m-view` has `Show Editor` and `Show Preview` instead, so the two halves of that
  requirement cannot both hold against the binding. Production also draws `Toggle Assistant` and
  `Distraction-free reading` visibly unavailable with no accelerator, where the mockup gives both an accelerator
  at full opacity, and formats accelerators for the host platform. How is that resolved? → A: Keep FR-ED-004's
  inventory in production and express the difference as a Feature 003 reference variant for `#m-view`, exactly as
  the File menu already does for `#m-file`. The variant carries the Editor, Split, and Preview rows in place of
  `Show Editor` and `Show Preview`, marks the two deferred rows visibly unavailable at the single reviewed
  unavailable opacity, drops the accelerators Feature 003 does not own, and is built for the host platform — all
  from the mockup's own `.mi`, `.tick`, `.sep`, and `.k` primitives. Binding order, grouping, indicators, and
  switches remain production's target and stay compared. The immutable mockup HTML/CSS and its raw source hash
  stay unchanged, and no mask, tolerance, comparator, coordinate handling, or manifest count changes.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Open, edit, and safely save a real file (Priority: P1)

A user opens a supported local Markdown or text file, edits its source, and saves it without losing the
last keystrokes or silently changing the file's encoding characteristics, line endings, or permissions.

**Why this priority**: A trustworthy round trip to disk is the minimum useful real-file editor and the
foundation for every later workspace, search, rendering, and Assistant feature.

**Independent Test**: Open representative UTF-8 files with LF, CRLF, and UTF-8 byte-order marks in the real
application, edit and save each immediately after typing, then compare the resulting bytes and permissions
with the originals. Exercise cancellation, a failed write, and a file that is already open.

**Acceptance Scenarios**:

1. **Given** a supported local file at or below 10 MiB (10,485,760 bytes), **When** the user chooses Open and selects it,
   **Then** one document with a stable identity opens in the configured default mode and displays the file's
   name, encoding, line-ending state, and save state.
2. **Given** a pending editor change, **When** the user invokes Save immediately after typing, **Then** the
   pending working copy is accepted before the canonical document is written and the final typed bytes are
   present on disk.
3. **Given** an existing LF, CRLF, or UTF-8-BOM file with non-default permissions, **When** a save succeeds,
   **Then** the original line-ending convention, byte-order-mark presence, and permission mode are preserved.
4. **Given** a save that fails before replacement completes, **When** the failure is reported, **Then** the
   original file is byte-for-byte intact, the document remains modified, and the user receives a classified
   `io-failure` message offering Retry.
5. **Given** a path already open in this window, **When** the user opens that path again, **Then** the existing
   tab is focused and no duplicate document or buffer is created.
6. **Given** the window already contains 40 documents, **When** Open, Open Recent, or Reopen resolves through aliases
   to a path already open in that window, **Then** the existing tab is focused because no document is inserted. A
   distinct path is refused before read or mutation. Any activation occurs only after the outgoing session flushes
   and the prepared canonical identity and tab revision revalidate.
7. **Given** valid UTF-8 text has no LF or CRLF, **When** it opens and is saved without inserting a line break,
   **Then** it remains writable and gains no terminator. If the user inserts a line break, that break is encoded as LF.
   A file containing a lone ASCII CR opens read-only with a warning, while NEL, U+2028, and U+2029 remain ordinary
   content rather than line-ending markers.
8. **Given** a writable document is opened, edited, written, or edited again during a write, **When** its identity
   surface updates, **Then** Go projects Saved after Open/Reload/manual Save/Save As, Autosaved after a current autosave,
   and Unsaved changes for dirty, detached, failed, or newer revisions. Read-only overrides those states; an empty
   untitled document is Not saved.

---

### User Story 2 - Create, name, and close work without losing it (Priority: P1)

A user creates an untitled document, saves it to a chosen path, uses Save As when needed, and can close a
document or quit knowing that every unsaved change will be accounted for first.

**Why this priority**: New documents and close protection complete the essential file lifecycle and prevent
the most damaging class of editor failure: silent data loss.

**Independent Test**: Create an untitled document, confirm that waiting does not create a file, save it with
and without a suffix, use Save As, then exercise clean close, dirty close, close-many, final-tab close, and
window quit with Save, Discard, Cancel, normalization confirmation, and write failure outcomes.

**Acceptance Scenarios**:

1. **Given** any default open mode, **When** the user creates a new document, **Then** an empty untitled tab
   opens in Editor mode with no path, UTF-8, LF, no byte-order mark, and no automatic write.
2. **Given** a modified untitled document, **When** the user invokes Save, **Then** the native Save As flow
   runs; cancellation makes no file or model change, while success gives the existing document the chosen
   path without changing its stable identity.
3. **Given** a dirty tab, **When** the user closes it, **Then** one prompt offers Save, Discard, and Cancel;
   Cancel writes and closes nothing.
4. **Given** several dirty documents targeted by Close others, Close to the right, window close, or quit,
   **When** the close is requested, **Then** one dialog lists every dirty target and offers Save all, Discard
   all, and Cancel before any target is changed.
5. **Given** the last clean tab, **When** it closes, **Then** the application enters a true zero-document
   state and shows the launcher rather than manufacturing a blank document.
6. **Given** Save As selects a canonical path already open in this window or an existing target that changes
   after native overwrite confirmation, including a metadata-preserving byte change, **When** the operation continues,
   **Then** the process-local reservation or final version-and-raw-byte-hash recheck prevents the replacement. No
   write, path adoption, or other document mutation occurs, and a classified `conflict` error explains the collision.
7. **Given** any manual, automatic, Save As, or close-save write is blocked by mixed line endings, **When** the
   normalization modal opens, **Then** it identifies the safe filename and proposed LF/CRLF result, explains that all
   endings will change, and offers Normalize and save followed by Cancel. Cancel initially owns focus; Escape or
   backdrop cancellation resumes nothing; confirmation resumes the exact suspended write without another Save.

---

### User Story 3 - Work across real document tabs (Priority: P2)

A user keeps several files open, switches and reorders their tabs, and returns to each document at the same
caret, selection, scroll position, and view arrangement without one document's text leaking into another.

**Why this priority**: Multi-document work is the defining benefit of tabs, but it is safe only after the
single-file lifecycle and identity boundaries are trustworthy.

**Independent Test**: Open multiple files including identical basenames, assign distinct text, caret,
selection, scroll, and arrangement state to each, then switch by click and keyboard, reorder, close, reopen
the last closed tab, and force both a failed outgoing flush and a stale reorder.

**Acceptance Scenarios**:

1. **Given** an active document with pending text and view state, **When** the user requests another tab,
   **Then** the outgoing state is accepted first and only then does the incoming identity-bound working copy
   become active.
2. **Given** an outgoing flush failure, **When** a tab switch is attempted, **Then** the current tab stays
   active, the incoming content is not installed, and the failure is shown.
3. **Given** open files share a basename and may also share one or more immediate parent names, **When** the tab set or
   a path changes, **Then** each tab recomputes and shows the shortest unique canonical parent suffix under host-aware
   comparison, while its tooltip exposes the approved full path. Long or hostile names remain distinguishable and
   accessible without allowing control or bidirectional-formatting characters to spoof adjacent chrome.
4. **Given** a tab is dragged to a new position, **When** the current tab-set revision still matches,
   **Then** the insertion position is visible during the drag and the backend-authoritative order changes
   once; Escape or a same-position drop changes nothing.
5. **Given** a tab is closed or another tab wins during a pending switch, reload, reorder, or close,
   **When** the stale result arrives, **Then** it is rejected without changing the active document, order,
   or working copy.
6. **Given** several path-backed tabs close in sequence, **When** Reopen last file is invoked repeatedly,
   **Then** up to 40 unique entries reopen newest-first through the canonical Open lifecycle with fresh identities
   and restored view metadata but no retained source content.
7. **Given** several tabs are open, **When** the user invokes Move tab left or Move tab right from the targeted tab's
   context menu, or presses `Ctrl/Cmd+Shift+PageUp/PageDown` for the active tab, **Then** the requested tab moves one
   position only after backend confirmation, its document stays active when it was active, focus remains where it
   was, and an accessible announcement states its filename and new position out of the tab count. Moving beyond an
   edge is a successful no-op with no tab-set revision change.
8. **Given** a path-backed tab's context menu is open, **When** the user chooses Copy path, **Then** the exact
   canonical absolute path is on the system clipboard, a transient `Copied path for {safe filename}` notification
   announces it, the menu closes, and focus returns to the originating tab without activating another document.
   **When** the user instead chooses Reveal in file manager on a file still present on disk, **Then** the OS file
   manager opens with the file selected where supported or its containing folder opened otherwise, no toast
   appears, and focus returns to the application at the same tab once the application regains foreground focus.
   **When** the backing file was already known missing, **Then** Reveal is unavailable; **when** it disappears only
   at invocation, **Then** the document is marked detached and one deduplicated error offers Save to recreate and
   Copy path.

---

### User Story 4 - Autosave and recover from external changes (Priority: P2)

A user can rely on existing files to save after typing pauses, turn autosave off when desired, and decide
what happens when another program changes or deletes the backing file.

**Why this priority**: Autosave improves everyday reliability, while explicit conflict handling prevents
that convenience from overwriting work made elsewhere.

**Independent Test**: Edit an existing saved file with autosave on and off, overlap an explicit save with
an autosave, modify the file from another process before manual and automatic writes, inspect the inline
comparison, choose Reload, Keep mine, and Skip, change the file a second time, delete it, and repeat with an
unsafe read-only document.

**Acceptance Scenarios**:

1. **Given** autosave is on and a writable document has a path, **When** typing pauses, **Then** the accepted
   canonical content is written without format, lint, or a success toast; an untitled document is never
   autosaved.
2. **Given** autosave is turned off while a document is modified, **When** the setting is acknowledged,
   **Then** no catch-up write occurs and the document remains modified until another explicit action saves
   it.
3. **Given** the disk version changed since the application last read or wrote it, **When** a manual or
   automatic write is about to run, **Then** the application completes a stable re-read before writing. If the
   bytes, byte-order mark, line endings, and permission mode still match the recorded baseline, it refreshes only
   the disk version and resumes the suspended write. Otherwise no write occurs and an editable document shows the
   changed content or file characteristics, explains each outcome, and offers Reload from disk, Keep mine, and Skip.
4. **Given** the user chooses Reload from disk, **When** the reload succeeds, **Then** the disk content and
   all derived file characteristics replace the document atomically and the active editor accepts them only
   for the matching document identity and revision.
5. **Given** the user chooses Keep mine, **When** the disk version has not changed again, **Then** one later
   overwrite attempt is authorized and the exact suspended write intent resumes automatically; authorization use,
   path change, reload, close, successful write, another edit, or another disk change invalidates that authorization.
6. **Given** a backing file is deleted, **When** the change is discovered, **Then** the buffer remains open,
   detached, and modified, and an explicit Save can recreate the file at the same path.
7. **Given** an editable external-change comparison is open, **When** the canonical editor content changes,
   **Then** the displayed decision becomes invalid, no overwrite is authorized, and the comparison must refresh
   against the new editor revision before Keep mine can be chosen.
8. **Given** one or more path-backed documents changed outside the application, including read-only documents,
   **When** their tabs activate, the window regains focus or resumes, or a write checks them, **Then** stable
   foreground checks discover the changes without a watcher or polling timer. Conflicts remain bound to document
   identity and revision, appear one modal at a time in authoritative tab order, and every waiting document visibly
   remains blocked by conflict.
9. **Given** a disk replacement committed but projection rehydration fails immediately and again after 250 ms and one
   second, **When** recovery remains unavailable, **Then** no write is repeated or rolled back, document commands and
   normal close remain blocked, and a persistent surface says that the file was saved but editor-state recovery
   failed. Retry starts the same bounded recovery cycle; Quit and discard newer unsaved changes requires a second
   confirmation and can issue a one-use native close permit only after cancellation and drain succeed.
10. **Given** an external conflict has content differences, **When** its comparison opens, **Then** it shows the first
    changed hunk with at most 12 logical lines and 4,096 UTF-8 bytes per side, stopping at whichever bound is reached
    first without splitting a code point, and visibly states when either side is truncated. Skip initially owns focus
    and Escape. A read-only conflict instead offers Reload from disk plus structural Cancel and no overwrite action.
11. **Given** the fresh current-host release build has autosave enabled with no conflict, **When** 20 warmups and 100
    measured one-character replacement trials run evenly across accepted revisions of 1 KiB, 256 KiB, 1 MiB, and
    2 MiB, **Then** timing includes final input, synchronization, and the one-second debounce through atomic commit;
    at least 95 measured trials finish within 5,000 ms, and every failure remains a counted miss.

---

### User Story 5 - Find recent files and use file widgets at every supported width (Priority: P3)

A user can return to recent files from the File menu or zero-document launcher and can operate the real
file and tab widgets by pointer or keyboard across the delivered palettes and responsive widths.

**Why this priority**: Recent files and coherent widgets make the safe lifecycle practical for daily use,
while preserving the design and accessibility foundation already delivered.

**Independent Test**: Open and save more than six files, inspect the MRU order in the File menu and launcher,
delete a recent file, close the last tab, and operate the file menu, tab strip, tab menu, prompts, settings,
and empty state at 1280, 768, and 375 pixels in all six palettes. In the same deterministic browser, serve the
read-only binding mockup and the local application, capture every mapped in-scope state, and inspect the
reference, actual, and difference images together with exact computed-style and bounding-box assertions.

**Acceptance Scenarios**:

1. **Given** files have been opened or saved, **When** the recent-file surface is shown, **Then** it lists at
   most the six most recent canonical file paths in most-recent-first order without reopening them at launch.
2. **Given** a recent path no longer exists, **When** the list is shown, **Then** the stale entry is removed
   lazily; choosing a path that becomes stale during the interaction shows a classified `not-found` error.
3. **Given** no documents are open, **When** the launcher appears, **Then** New, Open, and recent-file actions
   are functional while Open Folder remains visibly unavailable and creates no workspace state.
4. **Given** the interface is 1280, 768, or 375 pixels wide, **When** the user operates file and tab widgets,
   **Then** all in-scope actions remain reachable, the tab strip scrolls within its own bounds when needed,
   and no page-level horizontal scrolling or native-frame replacement is introduced.
5. **Given** the binding mockup and local application are served under the approved deterministic capture
   conditions, **When** any required visual state is compared, **Then** every mapped webview-owned region has
   the binding control metrics, typography, iconography, spacing, radii, borders, shadows, opacity, blur,
   alignment, and state treatment with zero unexplained changed pixels; any mismatch retains reference,
   actual, and difference evidence and prevents visual completion.
6. **Given** two application instances share the same settings database, **When** successful Open/Save promotions
   commit in an interleaved order, **Then** each transaction removes the canonical duplicate, prepends its path, and
   truncates the latest committed list to six. SQLite commit order defines global recency, and either instance sees
   the result when its recent surface explicitly refreshes without polling.
7. **Given** the exact parity manifest is validated, **When** its primary and additional cases are counted, **Then** it
   contains exactly 306 primary cases and 40 additional state IDs expanded across six palettes at one assigned width
   for 240 additional and 546 total logical cases. Three unchanged repetitions execute 1,638 comparisons without
   creating extra manifest keys.

### Edge Cases

- Cancelling Open creates no document, tab, notification, or recent-file entry.
- An unsupported Save As suffix is rejected before any write; a suffixless name gains `.md`.
- Invalid UTF-8 or NUL-bearing input opens tolerantly and read-only with a warning. Editing, formatting,
  linting, Save, Save As, and autosave are unavailable and the original bytes are never rewritten.
- A file larger than 10 MiB (10,485,760 bytes) and at most 50 MiB (52,428,800 bytes) opens read-only with a banner;
  a file larger than 50 MiB is refused before partial loading with a message naming the 50 MiB limit. Classification
  reads no more than 52,428,801 bytes. Exactly 10 MiB remains writable when otherwise safe, and exactly 50 MiB opens
  read-only.
- Valid UTF-8 text with no LF or CRLF is classified as `none` and remains writable. Saving without an inserted line
  break preserves the absence of a terminator; inserted breaks use LF. A lone ASCII CR produces a read-only warning.
  NEL, U+2028, and U+2029 remain ordinary content and do not affect line-ending classification.
- A supported document larger than 2 MiB pauses live preview. Refresh preview renders only the current accepted
  revision and stays current while that revision is unchanged. The next accepted edit above 2 MiB pauses preview
  again. A refresh failure keeps preview paused, shows a classified `io-failure` error, and offers Retry without a duplicate run.
- An Open request made while the only tab is an unchanged, empty untitled document replaces that empty
  placeholder as one transition; it never replaces a non-empty untitled document.
- A mixed-LF/CRLF document is editable but warns before its first write. Normalization uses the dominant
  ending, or the first ending encountered on a tie, and no write occurs without single-use confirmation
  bound to the exact document revision and chosen normalization. The shared modal names the safe filename, proposed
  ending, and whole-file consequence; Normalize and save confirms, while focused Cancel, Escape, or backdrop
  cancellation resumes nothing. Confirmation automatically resumes the exact suspended write kind and revision.
- Pressing explicit Save while autosave is running flushes and captures the latest accepted explicit revision,
  waits for the automatic write, and reuses that commit only if it contains the same revision. Otherwise one
  serialized follow-up write commits the explicit revision. Exactly one explicit success notification appears only
  after that revision reaches disk; edits accepted later remain modified.
- A successful disk replacement followed by projection-delivery failure is not retried or rolled back. The
  disk baseline stays committed, document commands pause, and the projection is resynchronized immediately, then
  after 250 ms and one second if needed. Exhaustion shows a persistent recovery surface that reports the successful
  disk save, offers Retry, and offers Quit and discard newer unsaved changes only through a second confirmation.
- A close requested while a dirty tab has an autosave scheduled or in flight first flushes the latest working copy and
  waits for the write coordinator. The close plan then re-evaluates the committed/current revision: a now-clean tab may
  close without a dirty prompt, while a newer or failed revision remains open for an explicit choice.
- A multi-document close with an incomplete choice set, cancelled native Save As, missing normalization
  confirmation, or external-conflict cancellation saves, discards, and closes nothing.
- During a multi-document Save all, saves run in authoritative tab order without closing any tab. The first
  failure stops the batch; earlier successful saves stay clean, every tab stays open, no discard is applied,
  and retry requires a fresh plan and fresh choices.
- A content-difference preview shows the first changed hunk and enforces both 12 logical lines and 4,096 UTF-8 bytes
  per side, stopping at the first reached bound without splitting a code point. It visibly identifies each truncated
  side. A read-only document changed on disk offers Reload from disk plus structural Cancel; Keep mine and Skip are
  unavailable because no overwrite or blocked write can be authorized.
- Editing Yours while an external-change comparison is open invalidates that comparison and any pending Keep-mine
  decision; no overwrite may use content the user did not compare.
- A disk-version mismatch first performs a stable re-read whose version is unchanged across classification. If the
  raw bytes, byte-order mark, line endings, and permission mode equal the recorded baseline, the application refreshes
  only the disk version and resumes the suspended write. Any byte or file-characteristic difference prevents the write
  and requires a metadata-aware external-change decision; an unstable re-read writes nothing and retries only after a
  fresh foreground check.
- Tab activation and window focus or resume run foreground external-change checks for path-backed documents, including
  read-only documents. If several conflicts are pending, the current modal remains stable, other affected tabs visibly
  remain blocked by conflict, and eligible decisions continue one at a time in authoritative tab order.
- Skipping an editable external-change decision cancels only the current write attempt, leaves both disk and
  editor content unchanged, keeps the document modified, grants no overwrite authorization, and requires a
  fresh disk check and decision on the next write attempt.
- At 40 open documents, New and any Open, recent-file, or reopen request for a distinct canonical path refuse a 41st
  document with a message naming the limit and make no partial state change. A request that resolves to an already-open
  canonical identity focuses that tab because it inserts nothing; successful focus consumes a reopen entry when
  applicable.
- Native Open selection, recent/reopen resolution, and New activation never replace the active identity directly.
  Open first selects without mutation, canonicalizes and deduplicates, and checks capacity only if insertion is needed.
  The outgoing session must then flush before Go revalidates the tab revision and process-local path reservation and
  performs one backend-authoritative activation. Cancellation, failed flush, stale revision, or lost reservation makes
  no tab, document, recent-file, or active-buffer change.
- The recently closed history contains at most 40 unique path-backed entries per window. Untitled documents and
  source content are never retained; reopening a discarded file reads its current disk content rather than
  restoring discarded edits.
- Reopen last file consumes an entry after canonical Open successfully opens it or focuses the path's existing
  tab. A missing path is removed with a classified `not-found` error; another open failure leaves the entry available to
  retry. Repeated successful commands continue from newest to oldest.
- Two instances that promote recent paths concurrently each read and update the latest committed list in one
  transaction; commit order decides recency. A busy-timeout or other metadata failure leaves the prior committed list
  intact, does not roll back the already successful file operation, and produces one nonfatal warning rather than a
  false promotion.
- Closing the active tab selects an adjacent tab and restores its state; closing the final tab leaves active
  document and active buffer absent together.
- A successful write of revision N records its baseline origin, but if revision N+1 is already accepted the visible
  status remains Unsaved changes. Returning exactly to the committed baseline restores Saved or Autosaved from that
  baseline's origin; a failed write never changes status. Empty untitled is Not saved, and read-only capability wins
  over every write-origin label.
- If identical basenames also have identical immediate parent names, tabs extend only the canonical parent suffix
  needed for uniqueness and recompute it after open, close, or Save As. C0 controls, DEL, and bidirectional formatting
  controls render as visible `\uXXXX` escapes; remaining path text is directionally isolated. Ellipsis MUST preserve
  some distinguishing suffix, while the complete disambiguated label remains the accessible name and the approved full
  path remains available in the tooltip.
- Keyboard Move tab left/right keeps the active document and current focus unchanged, waits for backend confirmation
  before projecting order, and announces the filename and resulting one-based position out of the tab count. An edge
  move changes no order or tab-set revision.
- Revealing or copying the path of an untitled document is unavailable until it has a path.
- Copy path succeeds for a detached (missing-backing-file) document because the canonical path remains defined;
  Reveal on a document already known missing is unavailable, while a disappearance discovered only at Reveal
  invocation marks the document detached and reports one deduplicated `not-found` error offering Save to recreate
  and Copy path rather than silently failing.
- A clipboard write failure for Copy path, or an OS command failure for Reveal, reports one deduplicated
  `system-command-failure` error naming only the safe filename; repeated failures for the same document and cause
  update that one notification's count rather than stacking. Reveal failure additionally offers Copy path as a
  fallback remediation.
- Closing the tab context menu after Copy path or Reveal returns focus without activating another document: the
  originating tab if it still exists, otherwise the current tab, otherwise tab-strip New, otherwise launcher New.
  A successful Reveal restores that focus only when the application regains foreground focus from the file manager.
- The application launches with no restored tab set, working copy, or prior document content.
- A binding screenshot includes the obsolete custom titlebar, populated workspace, Assistant, provider state,
  or rich-rendering result: those regions are excluded rather than reproduced. Exclusion is performed on the
  reference side by the Feature 003 reference variant, which removes the deferred widget from the mockup using
  the mockup's own primitives, rather than by masking the application or by manufacturing the widget in
  production. The comparison still covers the webview-owned row below the native frame, tabs, toolbar, pane
  chrome, basic preview typography, settings, status, prompts, launcher, menus, and notifications.
- A deterministic screenshot differs only because of a blinking caret or another explicitly named dynamic
  pixel: the capture must first freeze the dynamic state. A mask is permitted only when freezing is impossible,
  must be the smallest reviewed rectangle, and must not cover component geometry, text, icons, focus, or state.
- A proposed screenshot-baseline update contains an unexplained difference: it is rejected. Every accepted
  baseline change must map to an explicit Feature 003 requirement and preserve unaffected Feature 001/002
  baselines.
- Performance evidence cannot discard a slow or failed eligible autosave, restart its timer after synchronization, or
  substitute fake-clock/mock results for final-input-to-real-commit timing. Visual evidence cannot count one capture as
  two state IDs or count three deterministic repetitions as additional manifest cases.

## Requirements _(mandatory)_

### Scope and Migration Boundary

This feature migrates the Phase 05 real-file lifecycle and real-tab behavior into one self-contained Spec Kit
slice. It replaces Feature 002's visual-only File and tab fixtures where the requirements below name real
behavior. It also owns the bounded visual-convergence repair of the shared webview chrome visible in the
approved current-build/mockup comparisons: menu row and popups, tabs, toolbar and arrangement segment,
editor/preview pane chrome and basic preview typography, settings, status, prompts, notifications, and the
launcher. Feature 001's completed shell and Feature 002's editor/action behavior remain consumed authority;
this visual repair MUST NOT reimplement or broaden those behaviors.

The binding mockup's HTML and CSS are the exact source of truth for webview-owned control presence, labels,
order, grouping, dimensions, typography, local icon treatment, spacing, borders, radii, shadows, opacity,
backdrop effects, palette layering, focus, checked/selected/disabled states, and responsive relocation. The
approved mockup screenshots are reference illustrations of that source; the approved current-build screenshots
are audit evidence, not alternative baselines. Behavior comes from this specification.

All the time, when UI changes are made, they should be compared with screenshots of the Mockup to validate the
consistency of the style, theme, widget, sizes, and other aspects of the UI/UX. Screenshots are in the
folder: "specs/003-real-files-and-tabs/surface".

The completed operating-system-managed frame supersedes the mockup's obsolete custom traffic lights, brand,
drag region, resize zones, and outer window shadow. The in-app row below that native frame remains in scope and
inherits the mockup row's webview-owned metrics and state styling. Native Open/Save dialogs are behavior evidence,
not screenshot-parity regions.

Workspace enumeration, folder trees, Open Folder behavior, drag-and-drop, operating-system file associations,
packaging, export, rich-rendering expansion, full tidy/diff workflows, session restore, crash recovery, swap
files, tab groups, split tab panes, pinned or detachable tabs, and all Assistant/provider behavior remain
outside this feature.

#### Exact visual-parity contract

The finite parity manifest contains the following 17 screen families. Each family MUST be checked at 1280,
768, and 375 logical pixels in all six resolved theme/appearance palettes, producing exactly 306 paired
mockup/application comparisons before the additional state fixtures below are counted.

| Family                | Required mapped region and Feature 003 adaptation                                                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `editor-split`        | In-app row, real tabs, full toolbar, arrangement segment, both pane shells, basic preview typography, and status; the reference variant carries the application's in-scope preview content and marks the toolbar's deferred controls visibly unavailable, and the Monaco editor pane interior is a named Feature 002-owned region exclusion whose bounds and computed styles are still asserted. |
| `editor-only`         | The same shared chrome with the Editor pane filling the owned document region; its Monaco interior is the same named Feature 002-owned region exclusion.                             |
| `preview-only`        | The same shared chrome with the Preview pane filling the owned document region; remote assets, math, Mermaid, and other rich-rendering expansion are removed from the reference variant rather than reproduced.                    |
| `menu-file`           | Binding menu geometry with Feature 003 file actions, at most six recent files, and downstream actions visibly unavailable. Recent folders remain absent.                             |
| `menu-settings`       | Binding compact menu, swatches, rows, separators, indicators, switches, and All settings entry; only previously owned or Feature 003 settings may act.                               |
| `menu-view`           | Binding menu geometry, grouping, indicators, switches, and accelerators without changing Feature 002 action behavior; the reference variant carries FR-ED-004's Editor/Split/Preview rows, the deferred rows visibly unavailable, and Feature 003's own accelerators. |
| `menu-about`          | Binding geometry, separators, labels, and accelerator column without changing owned About behavior.                                                                                  |
| `tab-menu`            | Binding tab-menu shape with the exact Feature 003 action inventory and untitled-path unavailable states.                                                                             |
| `toolbar-overflow`    | Binding flat menu-row presentation and responsive relocation, retaining Feature 002 action identities and deferred outcomes.                                                         |
| `empty`               | Binding launcher shape with functional New/Open/file recents, unavailable Open Folder, no recent folders, and first-run/maximum-six variants.                                        |
| `save-prompt`         | Binding single-document prompt shape with Feature 003 Save, Discard, and Cancel behavior; mixed normalization is an additional state of this family.                                 |
| `quit-prompt`         | Binding multi-document prompt shape with the complete Feature 003 dirty-target list and Save all, Discard all, and Cancel behavior.                                                  |
| `reload-prompt`       | Binding external-change comparison shape extended with bounded/truncated content, metadata-only, editable, and read-only variants using the specified button primitives.             |
| `toasts`              | Binding success, warning, and error geometry with Feature 003 file outcomes and deduplicated repeated-failure count.                                                                 |
| `settings-appearance` | Binding settings-shell geometry while preserving Feature 001 appearance authority.                                                                                                   |
| `settings-editor`     | Binding settings-shell geometry while preserving Feature 002 line-number, word-wrap, and editor-size behavior.                                                                       |
| `settings-markdown`   | Binding settings-shell geometry with only already-owned or explicitly unavailable Markdown/file-save choices.                                                                        |

The additional manifest contains exactly these 40 state IDs. Each row has one assigned family and width and MUST run
once in each of the six palettes, producing exactly 240 additional logical comparisons. A capture MUST NOT satisfy two
state IDs merely because both happen to be visible.

| Category        | State ID                          | Assigned family | Width |
| --------------- | --------------------------------- | --------------- | ----: |
| Tab             | `tab-active`                      | `editor-split`  |  1280 |
| Tab             | `tab-inactive`                    | `editor-split`  |  1280 |
| Tab             | `tab-dirty`                       | `editor-split`  |  1280 |
| Tab             | `tab-autosave-in-flight`          | `editor-split`  |  1280 |
| Tab             | `tab-read-only`                   | `editor-split`  |  1280 |
| Tab             | `tab-detached`                    | `editor-split`  |  1280 |
| Tab             | `tab-blocked-conflict`            | `editor-split`  |  1280 |
| Tab             | `tab-identical-basename`          | `editor-split`  |  1280 |
| Tab             | `tab-adjacent-after-close`        | `editor-split`  |  1280 |
| Tab             | `tab-contained-overflow`          | `editor-split`  |   375 |
| Tab             | `tab-40-document`                 | `editor-split`  |   375 |
| Identity/status | `identity-not-saved`              | `editor-only`   |  1280 |
| Identity/status | `status-saved`                    | `editor-only`   |  1280 |
| Identity/status | `status-autosaved`                | `editor-only`   |  1280 |
| Identity/status | `status-unsaved-changes`          | `editor-only`   |  1280 |
| Identity/status | `status-read-only`                | `editor-only`   |  1280 |
| Identity/status | `status-mixed-ending`             | `editor-only`   |  1280 |
| Identity/status | `status-large-file`               | `editor-only`   |  1280 |
| Launcher        | `launcher-first-run`              | `empty`         |  1280 |
| Launcher        | `launcher-six-file`               | `empty`         |   375 |
| Control/menu    | `control-enabled`                 | `menu-file`     |  1280 |
| Control/menu    | `control-checked`                 | `menu-settings` |  1280 |
| Control/menu    | `control-selected`                | `menu-view`     |  1280 |
| Control/menu    | `control-focused`                 | `menu-file`     |  1280 |
| Control/menu    | `control-hovered`                 | `menu-file`     |  1280 |
| Control/menu    | `control-unavailable`             | `menu-file`     |  1280 |
| Control/menu    | `tab-menu-move-left-unavailable`  | `tab-menu`      |   375 |
| Control/menu    | `tab-menu-move-right-unavailable` | `tab-menu`      |   375 |
| Path/label      | `label-short`                     | `editor-split`  |  1280 |
| Path/label      | `label-long-localized`            | `editor-split`  |   375 |
| Path/label      | `path-hostile-disambiguated`      | `editor-split`  |   375 |
| Preview         | `preview-paused`                  | `preview-only`  |   375 |
| Preview         | `preview-refreshing`              | `preview-only`  |   375 |
| Preview         | `preview-refresh-failed`          | `preview-only`  |   375 |
| Prompt/recovery | `prompt-normalization`            | `save-prompt`   |   375 |
| Prompt/recovery | `conflict-content-truncated`      | `reload-prompt` |   375 |
| Prompt/recovery | `conflict-metadata-only`          | `reload-prompt` |   375 |
| Prompt/recovery | `conflict-read-only`              | `reload-prompt` |   375 |
| Prompt/recovery | `resync-recovery`                 | `save-prompt`   |   375 |
| Prompt/recovery | `quit-discard-newer`              | `quit-prompt`   |   375 |

The 306 primary and 240 additional entries form exactly 546 logical manifest cases. Three deterministic repetitions
execute 1,638 comparisons but MUST NOT create additional manifest keys. Direct metric assertions and unaffected
regression suites attach to cases and do not increase either count.

T059 platform evidence decision: production File-menu accelerator labels remain platform-correct, including the
macOS glyphs `⌘N`, `⌘O`, `⌘S`, and `⌘⇧S`. If the immutable reference presents literal `Ctrl` text for that case, the
focused evidence MUST record the difference as the explicit T059 macOS accelerator-glyph exception rather than an
unexplained production drift. The exception is limited to accelerator glyph pixels and MUST still assert the
semantic shortcut values, visible labels, popup geometry, action availability, focus, keyboard behavior, and
dismissal. It is not a mask or tolerance change, and no protected parity control may be modified.

The following binding metrics are direct acceptance values rather than planning suggestions:

| Surface             | Binding values                                                                                                                                                                                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| In-app menu row     | 44 px high; 13 px triggers; `6px 10px` trigger padding; 7 px trigger radius.                                                                                                                                                                                                   |
| Monochrome icons    | 15 × 15 logical px, 1.75 px stroke, round caps/joins, current-color tint, no emoji or Unicode substitute glyphs.                                                                                                                                                               |
| Dropdown and popup  | At least 250 px wide; 12 px radius; 6 px outer padding; `7px 10px` rows; 13 px row text; 11 px monospaced accelerators; 10 px uppercase group labels; full-width separators.                                                                                                   |
| Tabs                | `7px 10px` row padding with 5 px gap; `7px 12px` tab padding; 12.5 px labels; 28 × 28 px add control. Material tabs use 18 px pills and `8px 15px` padding; Minimal tabs are borderless with a 2 px active underline.                                                          |
| Toolbar             | `7px 10px` row padding with 4 px gap; groups use 3 px padding/gap and 11 px radius; actions are 30 px high, at least 30 px wide, `0 8px` padded, and use 12.5 px icon labels or 12 px text labels.                                                                             |
| Arrangement segment | 10 px container radius with 3 px padding; 11.5 px option labels; `5px 12px` option padding; 7 px selected-option radius and solid accent treatment.                                                                                                                            |
| Document panes      | Desktop body uses `8px 10px` padding and 10 px gap; 375 px uses 6 px padding/gap and stacked panes. Non-Minimal panes use 12 px radius. Headers use `9px 14px` padding and 10 px uppercase metadata. Minimal uses flush, borderless panes separated only where two panes meet. |
| Basic preview       | `20px 26px` inner padding; 25 px level-one headings; 18 px level-two headings; binding paragraph, list, quote, inline-code, and block spacing. Deferred rich-rendering widgets are not manufactured for parity.                                                                |
| Status              | Exactly 28 px high, one unwrapped row, 11 px text, 14 px gap, and `0 14px` padding with the binding responsive drop order.                                                                                                                                                     |

All other visible values, including exact palette tokens, theme font stacks, hover/focus/selection colors,
disabled opacity, shadows, strokes, scrollbar colors, and Liquid Glass gradients and layer opacity, come directly
from the corresponding binding CSS block. Liquid Glass MUST use one continuous internal gradient canvas with
the binding translucent app/surface/elevated layers, the 28 px blur and 150% light or 160% dark saturation, and
the binding highlight treatment. Material MUST retain its filled surfaces and pill tabs. Minimal MUST retain its
flat, separator/underline-led structure instead of receiving the generic outlined-card geometry.

#### Classified error and remediation contract

Every user-facing failure or nonfatal warning produced by file and tab actions MUST be classified into exactly one
of these eight categories. Each category draws its remediation only from this fixed vocabulary: `Retry`,
`Reload from disk`, `Keep mine`, `Skip`, `Save to recreate`, `Copy path`, `Cancel`, and message-only (dismissal with
no further action).

| Category                 | Meaning                                                                                                            | Remediation drawn from the vocabulary                                                                                                                       |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `not-found`               | A referenced path, recent entry, reopen entry, or reveal target no longer exists.                                    | Message-only removal/refresh of the stale entry, or `Save to recreate` plus `Copy path` for a detached document.                                            |
| `permission-denied`       | The operating system refuses a read, write, or reveal for lack of access.                                            | Message-only; retrying the identical action cannot succeed.                                                                                                 |
| `io-failure`              | A read, write, atomic replace, shutdown drain, or preview render fails for a reason other than permission or a stale version. | `Retry`.                                                                                                                                                     |
| `conflict`                | A version, raw-byte hash, or canonical-identity collision is detected against another writer, another open document, or the disk. | `Reload from disk`, `Keep mine`, and `Skip` for an editable external change; `Reload from disk` and `Cancel` for a read-only external change; message-only for a Save As target/identity collision. |
| `capacity-limit`          | The 40-document limit blocks a distinct insertion.                                                                    | Message-only, naming the limit.                                                                                                                             |
| `unsupported-input`       | Content or a chosen suffix falls outside the safe read/write contract (invalid UTF-8, NUL bytes, unsupported suffix). | Message-only; the write path remains blocked.                                                                                                               |
| `system-command-failure`  | An operating-system command invoked on the user's behalf (clipboard write, Reveal in file manager) fails or is refused. | `Retry`; a Reveal failure also offers `Copy path`.                                                                                                           |
| `persistence-warning`     | A settings or recent-file metadata transaction fails without invalidating an already-successful file operation.      | Message-only nonfatal notice; no retry, because nothing blocking remains.                                                                                    |

Every classified message MUST name only the safe basename or the document's shortest-unique disambiguated tab
label (FR-FT-035); it MUST NEVER include a full path, raw OS error text, or a stack cause. A repeated failure for
the same document identity and category MUST update one existing notification with an incrementing count instead
of stacking a new one, extending FR-FT-015's dedup rule to every category. Every requirement, acceptance scenario,
and edge case below that names a classified category means: a message classified into exactly that row of this
table, safe-subject only, remediated only from that row's vocabulary.

### Functional Requirements

#### File entry and classification

- **FR-FT-001**: New MUST create one empty untitled document in a new tab and Editor mode with stable identity,
  no path, UTF-8, LF, no byte-order mark, and no automatic write, regardless of the default open mode.
- **FR-FT-002**: Open MUST use the native file picker filtered case-insensitively to `.md`, `.markdown`,
  `.mdown`, and `.txt`; cancellation MUST create no document, tab, recent entry, or error outcome.
- **FR-FT-003**: Opening an existing file MUST apply the acknowledged default open mode first. Reading opens
  directly in the existing Reading mode; Editor restores the document's persisted arrangement, then the
  last-used application arrangement, then Split. This feature MUST NOT expand existing rendering behavior.
- **FR-FT-004**: Paths MUST be canonicalized before identity and duplicate-open checks. Opening a canonical
  path already present in the current window MUST focus its existing tab without creating a second identity
  or working copy. Save As MUST refuse a canonical path held by another open document in the current window
  before any write, path adoption, or model mutation and MUST report the collision as a classified `conflict` error.
  If the only tab
  is an unchanged, empty untitled document, Open MUST replace it atomically; a non-empty untitled document MUST
  never be replaced. Existing paths MUST use an absolute cleaned path plus resolved symlink and filesystem identity.
  A not-yet-existing candidate MUST canonicalize its existing parent before appending the selected basename. Equality
  MUST follow the host filesystem rather than globally lowercasing macOS paths. Open, recent-file, reopen, and Save As
  MUST hold a process-local reservation for the prepared canonical identity until activation, commit, cancellation, or
  failure. Open, recent-file, and reopen MUST canonicalize and deduplicate before applying the 40-document limit, so
  focusing an existing identity remains valid at capacity. Only a distinct insertion is subject to the limit. A novel
  prepared Open MUST reserve both its canonical identity and one document slot; pending novel reservations count toward
  the limit. Concurrent requests resolving to the same open or pending identity MUST join one authoritative outcome
  rather than reserve another slot or create another document.
  Native Open selection MUST complete without document or recent-file mutation. After selection, or
  after a recent/reopen path is selected, the backend MUST prepare canonical identity, duplicate, capacity, and path-
  reservation outcomes without activating a document. New MUST prepare only revision and capacity. Before any prepared
  New/Open/focus transition, the frontend MUST flush and await the outgoing identity-bound content and view state. The
  backend MUST then revalidate the expected tab-set revision and reservation and apply exactly one authoritative
  transition. Cancellation, failed flush, stale revision, lost reservation, classification failure, or refusal MUST
  leave active identity, ordered tabs, documents, recents, and active buffer unchanged.
- **FR-FT-005**: Size thresholds MUST use binary mebibytes: 2 MiB = 2,097,152 bytes, 10 MiB = 10,485,760 bytes, and
  50 MiB = 52,428,800 bytes. A safe supported file at exactly 10 MiB MUST remain writable; a file larger than 10 MiB
  and no larger than 50 MiB MUST open read-only with a visible reason; and a file larger than 50 MiB MUST be refused
  before partial model insertion with a message naming the 50 MiB limit. Classification MUST read no more than
  52,428,801 bytes. Live preview MUST remain active through exactly 2 MiB and pause above it. A registry-derived
  Refresh preview action with no keyboard shortcut MUST be available from the paused-preview surface for supported
  text. It MUST render exactly the current backend-accepted revision, reject or coalesce a duplicate run, and remain
  current only while that revision is unchanged. The next accepted edit above 2 MiB MUST pause preview again. Failure
  MUST leave preview paused with a classified `io-failure` error and Retry.
- **FR-FT-006**: Invalid UTF-8 or NUL-bearing input MUST open tolerantly as clearly read-only. Editing,
  document formatting or lint commands, Save, Save As, and autosave MUST be unavailable, and every write path
  MUST reject it before disk access.
- **FR-FT-007**: Uniform LF or CRLF, mixed LF/CRLF, no LF-or-CRLF (`none`), and UTF-8 byte-order-mark presence MUST be
  detected on open. Mixed endings MUST be classified separately and displayed with a normalization warning rather
  than silently rewritten. Valid UTF-8 `none` text MUST remain writable. A lone ASCII CR MUST open read-only with a
  warning and MUST NOT be silently converted. Unicode NEL (U+0085), line separator (U+2028), and paragraph separator
  (U+2029) MUST remain ordinary content and MUST NOT count as file line endings.

#### Save and disk safety

- **FR-FT-008**: Save MUST first accept the newest pending identity-bound working copy, then write only the
  backend's canonical content. It MUST never read the value directly from the visible editor widget.
- **FR-FT-009**: Every write MUST replace the target atomically through a temporary file in the same directory
  and MUST preserve the original permission mode. Any pre-commit failure MUST leave the original file intact
  and the document modified.
- **FR-FT-010**: A write of a uniformly-ended existing file MUST preserve its LF or CRLF convention and UTF-8
  byte-order-mark presence. An existing `none` file MUST preserve the absence of a line terminator until the user
  inserts a break; every introduced break MUST use LF. A new file MUST be written as UTF-8 with LF characteristics,
  no byte-order mark, and no physical trailing newline unless its canonical content contains one.
- **FR-FT-011**: Saving a mixed-ending document MUST require a single-use confirmation bound to document
  identity, canonical content revision, and the proposed normalization. The normalized ending MUST be the
  dominant ending, using the first ending encountered on a tie. Manual save, Save As, autosave, and close-save
  MUST refuse before disk access without matching authorization. Confirmation MUST consume that authorization
  and automatically resume the exact suspended write kind and revision; cancellation MUST resume nothing. The shared
  accessible webview modal MUST be titled `Normalize line endings?`, identify the safe filename, show the proposed LF
  or CRLF result, and explain that the write converts every line ending. Its buttons MUST be `Normalize and save`
  followed by `Cancel`; Cancel MUST receive initial focus, and Escape or backdrop dismissal MUST equal Cancel. The
  modal MUST offer no persistent suppression choice. Save, Save As, autosave, and close-save MUST use this same surface;
  queued close-plan normalizations MUST resolve one at a time in authoritative tab order before any batch write.
- **FR-FT-012**: Save on a document without a path MUST behave as Save As. Save As MUST accept only the four
  supported suffixes case-insensitively, append `.md` to a suffixless name, and reject an unsupported suffix
  before writing.
- **FR-FT-013**: Native overwrite confirmation MUST be the only overwrite confirmation for Save As.
  Cancellation MUST perform no write or model mutation; success MUST keep the same stable document identity,
  adopt the new canonical path, refresh its disk baseline, and make it eligible for autosave. For an existing
  target not held by another open document, the backend MUST capture the target disk version after native
  confirmation, stably read and hash its raw bytes, and compare both version and raw-byte hash again immediately before
  atomic replacement. A target created after an absent-target selection, a changed version, or a changed raw-byte hash
  MUST abort with a classified `conflict` error, no second overwrite prompt, and no write, path adoption, or other document
  mutation. The process-local target reservation MUST be released on every terminal outcome.
- **FR-FT-014**: A document MUST be modified when canonical content differs from its disk baseline or when an
  untitled document is non-empty. The dirty dot MUST mean unsaved only, appear on active and background tabs,
  remain present but muted while a write is in flight, and clear only after a successful write or an edit that returns
  exactly to the current disk baseline. Go MUST authoritatively project one save status using this precedence:
  read-only capability = `read-only`; empty untitled = `not-saved`; dirty, detached, nonempty untitled, failed write,
  or a revision newer than an in-flight/committed snapshot = `unsaved-changes`; clean after Open, Reload, explicit
  Save, or Save As = `saved`; clean after autosave = `autosaved`. Each committed baseline MUST retain its originating
  successful read/write kind so returning to it restores the correct clean label. A successful stale-revision write
  MUST update disk truth but MUST NOT project a clean status for newer content.
- **FR-FT-015**: An explicit successful Save MUST produce one localized confirmation naming the file, encoding,
  and preserved or normalized line-ending outcome. Automatic success MUST remain silent. Classified failures
  MUST keep the document modified and use that failure's classified category and remediation (`io-failure`,
  `permission-denied`, or `conflict`, per the classified error and remediation contract) without exposing private full paths;
  repeated failures for the same file and cause MUST update one notification with a count instead of stacking.
- **FR-FT-016**: Once atomic replacement commits, the backend disk baseline MUST record the exact written
  snapshot even if projection delivery fails. The successful result MUST require resynchronization, block
  later document commands until full rehydration succeeds, and MUST NOT repeat or roll back the write. Newer
  edits made during the write MUST remain modified against the committed baseline. Rehydration MUST run immediately,
  then retry after 250 ms and one second. If all three attempts fail, the application MUST keep document commands and
  normal close blocked and show a persistent recovery surface stating that the file was saved on disk but editor-state
  recovery failed. Retry MUST restart the same bounded sequence. Quit and discard newer unsaved changes MUST require a
  second confirmation naming the affected documents and MUST NOT alter or replay any committed write.

#### Autosave and external changes

- **FR-FT-017**: Autosave MUST default to On, be controlled through the acknowledged Settings surface, and
  run only for writable documents that already have a path after exactly one second without another accepted content
  revision. It MUST flush first, write
  canonical content, never format or lint, and never show a success toast.
- **FR-FT-018**: Turning autosave Off MUST cancel any not-yet-started automatic write without performing a
  catch-up save. Existing dirty documents MUST stay dirty. Disabling autosave MUST never affect untitled or
  read-only documents because they were never eligible.
- **FR-FT-019**: Manual and automatic writes to the same document MUST be serialized. An explicit Save arriving
  during autosave MUST flush and capture the latest accepted explicit revision, wait for the in-flight automatic
  write, and reuse that commit only when the automatic snapshot contains that same revision. Otherwise the backend
  MUST perform one serialized follow-up write of the explicit revision. Exactly one explicit success notification
  MUST appear only after that explicit revision commits; any later accepted revision MUST remain modified.
- **FR-FT-020**: Before any manual or automatic write, the current disk version MUST be compared with the
  version recorded at the last successful read or write. A mismatch MUST suspend the write and perform a stable
  re-read whose version remains unchanged across classification and whose raw-byte hash is captured with the baseline.
  Stable Open and Reload reads MUST likewise capture version before reading and require the same version after raw-byte
  classification and hashing. When raw bytes, byte-order mark, line endings,
  and permission mode still match the recorded baseline, the backend MUST refresh only the disk version and resume
  the suspended write. Any byte or file-characteristic difference MUST prevent the write and open the external-
  change decision. An unstable re-read MUST write nothing and retry only after a fresh foreground check. A second
  application window is handled the same as any other external writer. For Save As to an existing target, the
  post-confirmation target version and raw-byte hash from FR-FT-013 are the comparison baseline for that one write, and
  a mismatch MUST use FR-FT-013's classified `conflict` outcome rather than a second prompt. Tab activation and window focus or
  resume MUST also run stable foreground version checks for path-backed documents, including read-only documents.
  Feature 003 MUST NOT introduce a background file watcher or polling timer.
- **FR-FT-021**: When disk and editor content differ, an editable external conflict MUST show an accessible webview
  modal titled `File changed on disk` with the first changed On disk/Yours hunk. Each side MUST enforce both a maximum
  of 12 displayed logical lines and 4,096 bytes of valid UTF-8 text, stop when either bound is reached, never split a
  UTF-8 code point, and visibly identify which side is truncated while explaining that full diff navigation is
  deferred. When canonical text matches but byte-order mark, line endings,
  permission mode, or another classified file characteristic differs, the same prompt MUST show those metadata
  differences instead of an empty content comparison. It MUST explain the consequence of each action and offer
  Reload from disk, Keep mine, and Skip. Reload MUST atomically re-read and reclassify content, BOM, line
  endings, mixed state, read-only capability, disk baseline, dirty state, and the active-buffer
  acknowledgement. Keep mine MUST create one single-use authorization bound to document identity, canonical path,
  the exact canonical content revision shown in the comparison, and the detected disk version, then automatically
  resume the exact suspended write intent. The authorization MUST be consumed before atomic replacement begins;
  cancellation or Skip MUST resume nothing. Conflict decisions MUST remain bound to document identity, canonical
  content revision, and detected disk version. When several conflicts are pending, the application MUST show one
  modal at a time, retain the current modal until it resolves or invalidates, visibly project every waiting document
  as blocked by conflict, and select subsequent decisions in authoritative tab order. Editable buttons MUST remain
  `Reload from disk`, `Keep mine`, and `Skip` in that order; Skip MUST receive initial focus, and Escape or backdrop
  dismissal MUST equal Skip.
- **FR-FT-022**: Reload, successful Save, successful Save As, close, path change, canonical content revision
  change, authorization use, or a second disk change MUST invalidate a Keep-mine authorization. Any edit while
  the comparison is open MUST also invalidate the displayed decision before authorization; the comparison MUST
  refresh against the new editor revision before Keep mine can be chosen. A read-only external conflict MUST offer
  `Reload from disk` plus structural `Cancel`, with Cancel initially focused and used by Escape or backdrop dismissal;
  it MUST offer neither Keep mine nor Skip. Cancel MUST dismiss only that foreground check, change no document or disk
  state, and permit a fresh check on the next activation, focus/resume pass, or explicit reload. Skip MUST cancel only
  the current editable write attempt, leave disk and editor content unchanged,
  keep the document modified, grant no overwrite authorization, and require a fresh disk check and decision on
  the next write. Skip is not a persistent Compare-later state. A standalone navigable diff workflow remains
  deferred.
- **FR-FT-023**: If the backing file is missing, the application MUST keep the buffer, mark the document
  detached and modified, and allow explicit Save to recreate the same path. It MUST NOT close the tab or lose
  the working copy.

#### Close and shutdown protection

- **FR-FT-024**: Closing one modified document MUST offer Save, Discard, and Cancel. Closing a clean document
  MUST not prompt, but any pending working-copy flush or in-flight autosave MUST complete successfully before
  the document is removed.
- **FR-FT-025**: Close others, Close to the right, window close, and quit MUST create one complete close plan in
  authoritative tab order and show one dialog listing all dirty targets with Save all, Discard all, and Cancel.
  No save, discard, or close may occur while choices or required normalization decisions are incomplete.
- **FR-FT-026**: A multi-document Save all MUST resolve external conflicts before each affected save and run
  requested saves in tab order without closing any tab. The first failure MUST stop the batch; prior successful
  saves remain clean, every tab remains open, no discard is applied, and retry requires a fresh plan and choices.
  Tabs close only after all requested saves succeed.
- **FR-FT-027**: Native close MUST remain vetoed until the close plan authorizes exit. After authorization, shutdown
  MUST cancel in-flight long operations and drain accepted layout, editor, and autosave work before creating a
  one-use close permit or invoking native Quit. A cancellation or drain failure MUST create no permit, keep the window
  open, and provide a classified `io-failure` error with Retry. After a successful drain, the backend MUST create one one-use permit, invoke
  native Quit, and atomically consume that permit only in the immediately resulting native close callback. The
  permitted shutdown MUST then close persistence and diagnostics in that order. Cancel MUST be a clean no-op that
  writes and closes nothing. During FR-FT-016 recovery, only the twice-confirmed Quit and discard newer unsaved changes
  path may bypass successful rehydration; it MUST still satisfy this cancellation, drain, and permit sequence.

#### Real tab lifecycle and editor identity

- **FR-FT-028**: The backend MUST remain the canonical owner of document identities, tab order, active identity,
  tab-set revision, disk baselines, dirty state, and recently closed history. Each window's history MUST contain
  at most 40 unique path-backed entries in newest-first order, storing only canonical path and restorable view
  metadata. Closing an eligible path MUST move it to the top. Untitled documents and source content MUST NOT be
  retained. The frontend state MUST remain a content-free projection and MUST NOT create canonical tab outcomes
  locally.
- **FR-FT-029**: Stable document identity and restorable view state MUST persist across tab switches, but Monaco
  model/session identity MUST be activation-scoped. Deactivation MUST dispose the active Monaco model/session
  after its required flush; activation MUST create a new model, session, and token from the identity-and-revision-
  bound active-buffer acknowledgement. Only the active model may retain source text in the webview; inactive
  source remains backend-owned. Monaco undo history MUST NOT persist across tab switches, and no disposed model or
  session identity may be reused.
- **FR-FT-030**: Activating a tab or reloading the active document MUST return one identity-and-revision-bound
  active-buffer acknowledgement. It may be applied only while both values still match the confirmed active
  projection; inactive reloads update backend state only until later activation.
- **FR-FT-031**: A tab switch MUST flush and await the outgoing document's newest text, caret, selection, scroll,
  and view state before activating the incoming document. Failure MUST leave the outgoing tab active and install
  no incoming content.
- **FR-FT-032**: Each document MUST preserve its own dirty state, Editor/Split/Preview arrangement, Reading state,
  editor and preview scroll, caret, selection, and editor view state across switches. The application arrangement
  remains fallback only for a document with no saved view.
- **FR-FT-033**: Close and reorder commands MUST carry the tab-set revision they were issued against. A stale
  command MUST be refused without partial order, active-document, or close changes.
- **FR-FT-034**: The real tab strip MUST show each open filename, unsaved dot, close affordance, and New affordance.
  Clicking and the canonical Next/Previous shortcuts (`Ctrl/Cmd+Tab` and `Ctrl+PageDown` for next; `Ctrl/Cmd+Shift+Tab`
  and `Ctrl+PageUp` for previous) MUST switch tabs; the close affordance, middle-click, and
  tab-specific Close action MUST close the targeted tab. The canonical Close Tab action and `Ctrl/Cmd+W` MUST
  close the active tab. The Reopen last file action and `Ctrl/Cmd+Shift+Alt/Option+T` MUST reopen the most recently
  closed eligible document through the canonical Open lifecycle. A newly reopened path MUST receive a fresh
  document identity and its retained view metadata; a path already open MUST focus its existing tab. Either
  success MUST consume the history entry. A missing path MUST be removed with a classified `not-found` error, while another
  open failure MUST retain the entry for retry. Repeated successful commands MUST continue newest-first.
  `Ctrl/Cmd+Shift+T` MUST remain assigned to Table, and there MUST be no jump-to-tab-by-number binding. The canonical
  Move tab left and Move tab right actions MUST reorder the active tab by one position on
  `Ctrl/Cmd+Shift+PageUp/PageDown`, respectively, while tab-targeted context-menu actions MUST reorder their target.
  Every move MUST wait for backend confirmation before projecting the order, retain the active document and current
  focus, and announce `Moved {filename} to position {position} of {count}` through a polite live region. Moving past an
  edge MUST succeed as a no-op without incrementing the tab-set revision.
- **FR-FT-035**: Tabs with identical basenames MUST display `basename — shortest unique canonical parent suffix`.
  The suffix MUST use the fewest trailing parent segments that distinguish every open matching basename under the
  host filesystem's canonical identity comparison and MUST be recomputed after open, close, or Save As. C0 control
  characters, DEL, and bidirectional-formatting controls MUST render as visible `\uXXXX` escapes, and remaining
  user-supplied path text MUST be directionally isolated. Visual ellipsis MUST retain part of the distinguishing
  suffix; the complete disambiguated label MUST remain the accessible name, while the approved full canonical path
  remains in the tooltip and explicit path actions. Overflow MUST scroll without shrinking labels to unreadable widths
  or creating page-level overflow.
- **FR-FT-036**: Dragging a tab MUST show the insertion position and reduced-opacity dragged tab, allow Escape to
  cancel, auto-scroll the strip near its edges, and issue no reorder for a same-position drop.
- **FR-FT-037**: The tab-specific context menu MUST contain Close, Close others, Close to the right, Move tab left,
  Move tab right, Copy path, and Reveal in file manager. The two registry-derived Move actions MUST appear after the
  binding's close-action group and before its path-action group, and MUST be unavailable at their respective strip
  edges. Existing actions MUST retain their binding order. Path actions MUST be unavailable for untitled documents,
  and the menu MUST NOT expose folder-tree operations. Copy path MUST copy the exact canonical absolute path of any
  path-backed document, including a detached document, to the system clipboard and announce
  `Copied path for {safe filename}` in a transient polite live-region notification naming only the safe basename or
  disambiguated tab label. Reveal in file manager MUST first revalidate existence: a document already known missing
  MUST show Reveal as unavailable rather than invoking it; a disappearance discovered only at invocation (a
  disappearance race) MUST mark the document detached and report one deduplicated `not-found` error offering
  `Save to recreate` and `Copy path`. On a still-present target, Reveal MUST request native exact-file selection
  where the host supports it and otherwise open the containing folder; OS acceptance of either MUST be treated as
  success and MUST produce no toast. A clipboard write failure for Copy path, or an OS command failure for Reveal,
  MUST report one deduplicated `system-command-failure` error naming only the safe basename, offering `Retry`, and,
  for Reveal, also offering `Copy path`. Invoking either action MUST close the open menu and return focus without
  activating a different document: to the tab that had focus before the menu opened if it is still present,
  otherwise the current active tab, otherwise the tab strip's New control, otherwise the launcher's New control.
  After a successful Reveal, focus restoration MUST occur only once the application regains foreground focus, since
  the file manager may briefly own it.
- **FR-FT-038**: At most 40 distinct documents may be open or reserved for insertion in one window. Any action that
  would reserve or open a 41st distinct document MUST be refused before partial state change with a localized message
  naming the limit. Duplicate focus and requests joining the same pending canonical identity MUST remain allowed and
  MUST consume no additional slot. Closing the last document MUST project active document and active buffer as absent
  together.

#### Recent files, surfaces, and cross-cutting behavior

- **FR-FT-039**: The application MUST maintain a persisted most-recently-used list of at most six canonical file
  paths. Every successful canonical Open/focus, explicit Save, or Save As MUST promote its path in one SQLite
  transaction against the latest committed list: remove canonical duplicates, prepend the path, truncate to six, and
  commit. Autosave and Reload MUST NOT change recency. Across independent instances,
  database commit order MUST define global recency; `last writer wins` MUST mean the latest transactional promotion,
  not replacement by a stale whole-list snapshot. A promotion persistence failure MUST NOT roll back an already
  successful Open or committed document write, MUST leave the last committed list authoritative, and MUST produce one
  classified `persistence-warning` without claiming promotion success. Recent folders are deferred with workspace behavior.
- **FR-FT-040**: The recent-file list MUST be checked only when displayed or explicitly chosen, never by a
  background watcher or timer. Display MUST transactionally read the latest committed list so an instance observes
  other instances only on explicit display/choice refresh. A missing entry discovered during display MUST be removed
  silently through the same latest-value transaction; an explicit stale choice MUST also show a classified `not-found` error.
- **FR-FT-041**: The File menu MUST activate New File, Open File, Open Recent files, Reopen last file, Save,
  Save As, Close Tab, and Exit through the canonical action registry. New Window, Open Folder, Export to PDF,
  and any other downstream item MUST remain visibly unavailable and create no hidden lifecycle or network state.
  Reopen last file MUST use the recently closed document history and `Ctrl/Cmd+Shift+Alt/Option+T` binding from
  FR-FT-034. It has no `Ctrl/Cmd+Shift+T` binding because that delivered binding remains Table.
- **FR-FT-042**: The phase-bounded zero-document launcher MUST provide functional New file, Open file, and at
  most six recent file entries, plus a visibly unavailable Open folder action. It MUST show the defined
  first-run message when no recent files exist and MUST never restore prior tabs automatically. The complete
  Feature 001 launcher contract remains unfinished until the workspace feature activates Open Folder and
  recent folders.
- **FR-FT-043**: The in-app document identity surface MUST show the filename, an optional single parent-folder
  segment when useful, and the localized projection of FR-FT-014's status: `Not saved`, `Unsaved changes`, `Saved`,
  `Autosaved`, or `Read-only`. Untitled documents MUST show `Untitled`; the empty untitled state MUST show `Not saved`.
  The heading MUST remain limited to at most one safe parent segment even when tabs require a longer unique suffix.
  Full paths belong in tab tooltips and explicit Copy path/Reveal affordances, not the heading. In the converged
  binding layout, this identity surface MUST be rendered in the top in-app menu row; a separate vertical identity
  row MUST NOT push the mapped editor content downward.
- **FR-FT-044**: The status surface MUST expose the active file's encoding, line-ending or mixed-ending state,
  autosave state, and read-only warning at the widths where the binding responsive contract retains them. Dropped
  status items MUST remain available through an accessible detail surface.
- **FR-FT-045**: The shared webview chrome and every family in the exact visual-parity manifest MUST reproduce
  the binding mockup's control presence, labels, order, grouping, dimensions, typography, iconography, spacing,
  borders, radii, shadows, opacity, blur, alignment, focus, hover, checked, selected, and unavailable treatment
  across all six delivered palettes, subject only to the explicit behavior and exclusion overrides in this
  specification. General resemblance, correct hierarchy, or reachability alone MUST NOT satisfy this rule. Production
  layout and component structure MUST be corrected when required to reach that result; the comparison harness MUST
  not hide a genuine mismatch through coordinate normalization or broader exclusions.
- **FR-FT-046**: At 1280, 768, and 375 pixels, every in-scope file or tab action MUST remain pointer- and
  keyboard-reachable with no clipping or page-level horizontal scroll. Only the contained tab strip may scroll
  horizontally; the completed workspace rail/off-canvas and one-row editor toolbar contracts MUST remain intact. The
  editor resize divider MUST remain pointer- and keyboard-operable while overlaying the boundary without consuming
  layout width.
- **FR-FT-047**: Every new action, shortcut, tooltip, prompt, status, error, and unavailable outcome MUST derive
  from the canonical registry or translation catalogue, expose correct roles and accessible names, retain visible
  focus and modal focus containment, tolerate longer text, respect reduced motion, and use centralized tokens.
- **FR-FT-048**: File and tab behavior MUST make zero background network requests, use no remote assets or
  telemetry, expose no secrets or private full paths in errors, and remain safe across independent application
  windows without a lock file or single-instance forwarding.
- **FR-FT-049**: This feature MUST NOT add workspace enumeration, a folder tree, file associations, operating-
  system open forwarding, drag-and-drop, packaging behavior, export, rich-rendering expansion, full document diff
  navigation, search, tab groups, split tab panes, pinning, detachable tabs, session restore, crash recovery,
  swap files, or Assistant/provider behavior. Visual convergence MAY reproduce only the empty workspace frame; it
  MUST NOT populate a folder tree or add Assistant width or behavior.
- **FR-FT-050**: The binding mockup's HTML/CSS values MUST remain the exact source authority for the mapped
  webview-owned result. The application may use its established component architecture, but its rendered and
  computed result MUST match the binding values. The supplied mockup screenshots MUST be treated as reference
  illustrations and the supplied current-build screenshots as discrepancy evidence; neither may silently replace
  or weaken the HTML/CSS authority.
- **FR-FT-051**: Verification MUST exercise every family and additional state in the exact visual-parity contract.
  Every family MUST be paired at 1280, 768, and 375 logical pixels across `glass`, `material`, and `minimal` in
  resolved light and dark appearance for exactly 306 primary cases. Each of the 40 additional state IDs MUST use its
  assigned family/width and run once in each palette for exactly 240 additional and 546 total logical cases. Duplicate,
  missing, extra, or multiply counted manifest keys MUST fail. A representative subset, one palette per screen, or
  hierarchy-only review MUST NOT count as completion.
- **FR-FT-052**: The direct acceptance metrics in the exact visual-parity contract MUST be asserted as computed
  styles and bounding boxes in logical pixels. Menus MUST not wrap binding labels at the approved English fixture,
  toolbar and status rows MUST not grow, icons MUST use the binding monochrome size/stroke treatment, popups MUST
  stay at least 8 logical pixels inside the viewport, and only the contained tab strip may scroll horizontally.
- **FR-FT-053**: Liquid Glass, Material, and Minimal MUST remain structurally distinguishable, not merely recolored.
  Liquid Glass MUST preserve the binding continuous internal canvas, translucent layers, blur, saturation, and
  highlight; Material MUST preserve its filled hierarchy and pill tabs; Minimal MUST preserve its flat,
  separator/underline-led structure. Generic outlined cards applied identically to all three themes MUST fail.
- **FR-FT-054**: Deterministic browser evidence MUST serve the read-only binding mockup and the local application
  concurrently and capture mapped content boxes at the same 1280×720, 768×720, or 375×720 logical dimensions,
  device-pixel ratio 1, 100% zoom, loaded local fonts, resolved palette, locale, fixture data, focus, scroll,
  overlay state, frozen caret, and reduced-motion/animation state. The mockup's external harness and the
  application's native host frame are outside the selector crop. Readiness MUST be asserted before capture, and
  three consecutive unchanged captures MUST produce identical image hashes. Normal startup behavior MUST remain
  unchanged; any populated multi-document fixture used for parity MUST be seeded only on the deterministic parity
  route. Repeating all 546 logical cases three times MUST execute exactly 1,638 comparisons without changing the
  manifest count.
- **FR-FT-055**: Each deterministic comparison MUST use a reviewed mapping from binding region to application
  region and require zero unexplained changed pixels after approved exclusions. Reference, actual, and difference
  images MUST be retained on failure. Any mask MUST be the smallest reviewed rectangle for an unfreezable dynamic
  pixel and MUST NOT hide geometry, text, icons, focus, state, or a whole component. Increasing tolerance,
  replacing the reference with the current application, or accepting a baseline solely to make a gate pass is
  prohibited. A Feature 003 reference adapter MAY activate an existing mockup class that expresses the approved
  zero-Assistant boundary, provided it preserves the immutable source hash and does not alter the mockup's
  HTML/CSS values; the reviewed mapping MUST name that adapted region explicitly. The same adapter MAY also
  replace the mockup's basic-preview content with the in-scope content the application renders and remove the
  deferred rich-rendering widgets, under the same conditions: only the mockup's own primitives may be used, the
  raw source hash MUST stay unchanged, and no mask, tolerance, comparator, coordinate handling, or manifest count
  may change. A region owned by another feature MAY be declared as a named reviewed exclusion in the mapping when
  this feature cannot own its pixels — currently only the Monaco editor pane interior. Such an exclusion MUST name
  the owning feature, MUST still assert the excluded region's bounds and computed styles exactly, MUST leave the
  surrounding shell compared, and MUST NOT be used for any surface this feature owns.
- **FR-FT-056**: Behavior-owned differences from the historical mockup MUST be rendered as explicit Feature 003
  reference variants using the same binding primitives: the launcher contains file recents only and an unavailable
  Open Folder action; the File menu contains no recent folder, renders `Reopen last file`, marks its deferred
  actions visibly unavailable, and carries Feature 003's own accelerators; the toolbar marks its deferred
  controls — `image`, `format`, `compact`, and `lint` — visibly unavailable at the same single reviewed
  unavailable opacity, so their geometry, labels and spacing stay compared; the View menu carries the Editor,
  Split, and Preview arrangement rows FR-ED-004 requires in place of the mockup's `Show Editor` and `Show Preview`
  rows, marks its deferred `Toggle Assistant` and `Distraction-free reading` rows visibly unavailable, and carries
  Feature 003's own accelerators; the tab menu adds Move tab left and
  Move tab right between its close-action and path-action groups; mixed-ending normalization is an additional
  `save-prompt` state; `reload-prompt` includes bounded/truncated editable, metadata-only, and read-only variants
  with their specified buttons; the Editor and Preview panes carry the in-scope document content the application
  renders, without the deferred rich-rendering widgets and without reproducing Monaco's own text raster; and the
  status row expresses each of the six Feature 003 save-status states. These differences MUST be compared rather
  than broadly masked, and a production-only artifact that records `comparisonAttempted: false` MUST NOT be
  counted as a visual-parity pass.
- **FR-FT-057**: Every accepted screenshot or style-baseline change MUST map to an explicit Feature 003 visual
  requirement and MUST preserve unaffected Feature 001/002 baselines and behavior. Exact same-browser parity MUST
  be complemented by actual-control browser journeys, local real-bridge interaction, and a freshly built
  current-host Wails walkthrough. Host renderer or native-frame differences MUST be reported separately and MUST
  NOT be used to waive a same-browser mismatch or to introduce custom native chrome, workspace, Assistant, or rich-
  rendering behavior.

### Key Entities _(include if feature involves data)_

- **Document**: A stable identity independent of path; optional canonical path; canonical content and revision;
  disk baseline and disk version; encoding, BOM, and line-ending classification; modified, detached, and read-only
  capability; backend-derived save status; shortest-unique tab display suffix; and per-document view state.
- **Editor Working Copy**: The active document's immediate source, caret, selection, scroll, view state, pending
  synchronization, activation-scoped model/session identity and token, and accepted revision. It is ephemeral,
  disposed after the required deactivation flush, never a second canonical store, and does not preserve Monaco
  undo history across tab switches.
- **Tab Set**: The ordered open-document identities, active identity, revision used to reject stale commands, and
  per-window recently closed history of at most 40 unique path-backed entries containing canonical path and
  restorable view metadata but no source content.
- **Active Buffer Acknowledgement**: The deliberate transfer of one document's identity, accepted content revision,
  and buffer text into the visible editor after activation or active reload.
- **Disk Baseline**: The exact snapshot, disk version, raw-byte hash, and successful origin (`open`, `reload`,
  `explicit-save`, `save-as`, or `autosave`) last read or written, used to calculate modified/save status and detect
  external changes.
- **Write Authorization**: A single-use, revision-bound decision permitting one mixed-line normalization or one
  Keep-mine overwrite attempt; invalidated whenever its identity, path, revision, or disk version changes.
- **Close Plan**: One complete, revision-aware plan covering every requested tab, all dirty choices, required
  normalization decisions, external conflicts, and authoritative save order before any close-side effect occurs.
- **Recent File Entry**: One canonical file path in a persisted, deduplicated, most-recent-first list capped at six
  and pruned lazily without background filesystem work.

### Dependencies and Source Migration

| Authority                                                                                        | Classification                 | Migrated contract                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------ | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/delivery/plan/phase-05-real-files.md`                                                      | Owned                          | New/Open, safe Save/Save As, real tabs, dirty close protection, saved-file autosave, external-change recovery, limits, and real-build outcome are restated here with settled values.                                                                                                                                                                                                     |
| `docs/delivery/spec/product/opening-and-saving-files.md`                                         | Owned / narrowed               | File behavior, data preservation, recents, status, errors, and edge cases are owned; recent folders, OS entry, drag-and-drop, and workspace entry are deferred.                                                                                                                                                                                                                          |
| `docs/delivery/spec/product/working-in-tabs.md`                                                  | Owned                          | One tab per path, per-tab state, atomic switching, stale-command refusal, close/reorder/context-menu behavior, navigation, overflow, and the 40-document limit are owned.                                                                                                                                                                                                                |
| `docs/delivery/spec/surface/mockup.html` and surface `README.md`                                 | Owned exact shape / consumed   | The HTML/CSS values and the finite parity manifest are exact for mapped webview-owned shape and styling; screenshots corroborate them. Completed OS-managed native framing and this feature's explicit behavior/deferred variants override only the named obsolete or unavailable content.                                                                                               |
| `specs/001-gomarkedit-product` application-state, command-boundary, shell, and product contracts | Consumed / staged completion   | Backend authority, projection-only frontend state, identity-bound working copy, clean launch, responsive shell, settings, limits, accessibility, offline behavior, and native close ownership remain in force. Feature 003 activates the zero-document surface only for its real file actions; Open Folder and recent folders remain for workspace completion.                           |
| `specs/002-editor-stage-formatting` spec, plan, tasks, and action contract                       | Consumed / visually repaired   | The real file and tab lifecycle replaces visual fixtures and deferred File/tab actions. Feature 003 also owns exact visual convergence of the shared menu, tab, toolbar, arrangement, pane, settings, and status surfaces without changing formatting semantics, canonical action identities, Table binding, editor-size behavior, responsive action placement, or any deferred outcome. |
| ADR-0014                                                                                         | Consumed                       | Backend owns canonical application/document/tab state; the visible editor holds only the active ephemeral working copy and flushes on switch, close, and save.                                                                                                                                                                                                                           |
| ADR-0021                                                                                         | Consumed                       | Activation and reload use identity-and-revision-bound acknowledgements; patches remain content-free and the zero-document state has no phantom document.                                                                                                                                                                                                                                 |
| ADR-0022                                                                                         | Consumed                       | A committed disk write remains committed if projection delivery fails; commands pause for rehydration and the write is never repeated.                                                                                                                                                                                                                                                   |
| ADR-0024                                                                                         | Consumed / narrowly superseded | Open-mode precedence, supported suffixes, unsafe-byte read-only policy, mixed-ending authorization, and complete batch-close planning are restated here. The two-action editable-conflict prompt is narrowly superseded by safe Skip cancellation, which creates no persistent Compare-later state or authorization.                                                                     |
| ADR-0032                                                                                         | Consumed                       | Close remains vetoable, Cancel writes nothing, and shutdown follows the required cancel/flush/persistence/diagnostics order.                                                                                                                                                                                                                                                             |

### Explicitly Deferred Authorities

The following remain read-only source material for later features and are not silently claimed here:
`a-folder-of-notes.md`, `dragging-files-in.md`, `opening-files-from-the-desktop.md`,
`rendering-rich-documents.md`, `exporting-a-document.md`, `finding-things.md`, all Assistant/provider
feature files, Phase 06 rich rendering, Phase 07 workspace, Phase 08 packaging, and later search, tidy,
export, and Assistant phases. Existing visible controls for those areas remain unavailable unless a prior
completed feature already owns their behavior.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-FT-001**: In 100% of the LF, CRLF, UTF-8-BOM, permission-mode, mixed-ending-confirmation, immediate-save,
  and write-failure fixtures, a one-line user edit either reaches disk with the required characteristics or the
  original file remains byte-for-byte intact and visibly modified.
- **SC-FT-002**: In the fresh current-host release build, each of two fixtures completes in under 30 seconds with no
  account, server, or network connection. Fixture A: create a new untitled document, type one representative line,
  and Save As it into a fresh empty directory. Fixture B: open one pre-existing 1 KiB text fixture file, edit exactly
  one character, and explicitly Save. Timing starts the moment the launcher or application becomes ready for input
  and stops the moment the explicit-save confirmation (FR-FT-015) is observed; no earlier or later event may be
  substituted. Before the walkthrough begins and again immediately after that confirmation, the evidence MUST take a
  non-recursive snapshot of only the immediate parent directory of the target file. The only permitted difference
  between the two snapshots is the target file itself; the FR-FT-009 same-directory atomic-replace temporary file
  MUST already be gone by the after-snapshot. Any additional file, dotfile, swap file, or other leftover artifact in
  that directory fails this criterion.
- **SC-FT-003**: Across repeated switches among 40 distinct documents, 100% of named cases restore the correct
  content identity, caret, selection, scroll, and arrangement; stale or failed switches produce zero cross-
  document text installations.
- **SC-FT-004**: Every boundary case is exact: safe files through 10,485,760 bytes remain writable; files from
  10,485,761 through 52,428,800 bytes open read-only; files of 52,428,801 bytes or more are refused without partial
  model insertion; live preview pauses only above 2,097,152 bytes; 40 documents are allowed; and every distinct
  41st-document insertion is refused without changing the tab set, while duplicate focus remains allowed.
- **SC-FT-005**: All single- and multi-document close scenarios preserve user intent: Cancel performs zero
  writes/closes, Save all closes only after every requested save succeeds, and a first failure leaves every tab
  open with earlier successful saves accurately clean.
- **SC-FT-006**: Manual save, autosave, second-window change, file deletion, Reload, Keep mine, Skip, second
  disk change, and read-only conflict cases produce zero silent overwrites in the named external-change fixtures.
- **SC-FT-007**: The fresh current-host release build MUST run 20 uncounted warmups and exactly 100 measured autosaves:
  five warmups and 25 measurements for accepted revisions of exactly 1 KiB, 256 KiB, 1 MiB, and 2 MiB. Each trial MUST
  replace one character in a clean path-backed writable document with autosave on, local temporary storage, and no
  conflict. Monotonic timing MUST start when the final input event completes and stop when atomic replacement commits
  that content revision, including working-copy synchronization and the one-second debounce. No retry, outlier removal,
  or discarded failure is allowed; a failed eligible write is a miss. At least 95 of 100 measurements MUST be at or
  below 5,000 ms. Evidence MUST retain all durations, sizes, revision/commit identities, disk-byte results, p50/p95/max,
  warmups, and host/OS/filesystem/build metadata. Successful autosaves MUST produce zero toasts, and an explicit
  overlapping Save MUST produce exactly one success notification.
- **SC-FT-008**: The recent-file surfaces MUST retain no more than six unique entries and transactionally promote each
  successful canonical Open/focus, explicit Save, or Save As against the latest committed list while autosave and
  Reload leave order unchanged. Across two instances, SQLite commit order MUST define MRU
  order without lost stale-snapshot updates; explicit display/choice refresh MUST observe the latest committed list,
  prune missing entries without background polling, and reopen no document automatically at launch. A failed metadata
  transaction MUST retain the last committed order and MUST NOT be reported as a successful promotion.
- **SC-FT-009**: All 17 screen families MUST complete all 306 primary family/width/palette pairs, and all 40 named
  additional state IDs MUST complete their six-palette expansion at the assigned width for exactly 240 additional and
  546 total logical cases. Every mapped case MUST have zero unexplained changed pixels, exact required computed metrics,
  zero binding-label wrapping, zero page-level horizontal overflow, and no custom native-window chrome.
- **SC-FT-010**: During five minutes of representative open, edit, autosave, tab, close, recent-file, and conflict
  recovery use, the application makes zero outbound network requests and exposes zero workspace, packaging,
  rich-rendering-expansion, or Assistant behavior.
- **SC-FT-011**: A current-host real-build walkthrough opens and saves real files on disk, verifies preserved
  bytes and permissions, switches two real tabs, exercises clean and dirty close, resolves one external change,
  toggles autosave, crosses the 10 MiB, 50 MiB, and 40-document boundaries, and records every demonstrated,
  deferred, and host-unverified behavior. It also captures the mapped webview chrome for comparison with the
  same-browser result without substituting mock-only evidence or treating native renderer differences as an
  automatic pass.
- **SC-FT-012**: Three consecutive deterministic local comparison runs MUST execute exactly 1,638 comparisons and
  produce identical reference and actual image hashes for every unchanged one of the 546 logical cases, retain
  reference/actual/difference images for every failure, use no unapproved mask or tolerance, and accept zero baseline
  changes without an explicit Feature 003 requirement.
- **SC-FT-013**: All unaffected Feature 001 and Feature 002 visual, responsive, focus, action, and native-shell
  baselines remain behaviorally and visually intact; every approved changed baseline is listed against one
  Feature 003 requirement, and zero populated workspace, Assistant/provider, custom native-frame, or deferred
  rich-rendering surface appears in order to manufacture parity.

## Assumptions

- The four supported file suffixes and native file dialogs are the complete direct file-entry surface for this
  feature; operating-system associations and drag-and-drop are later entry adapters to the same canonical open
  lifecycle.
- The user-visible and persisted recent-file bound is six, carrying Feature 001's numeric launcher bound into
  this file-only phase. Recent-file promotion is a latest-value SQLite transaction whose commit order is shared across
  application instances; it is not stale-whole-value last-writer-wins. Recent folders are not created or retained until
  the workspace feature.
- When disk and editor content differ, the external-change prompt shows the binding mockup's concise inline On
  disk/Yours comparison. The standalone navigable diff experience remains part of later tidy/diff work.
- Existing renderer and Reading-mode behavior are consumed as-is. Opening real files does not authorize new
  Markdown syntax, remote assets, rich plugins, or export behavior.
- Independent application windows remain allowed and do not coordinate through an application-wide or persistent
  file lock. Stable reads, process-local canonical identity reservations, and final version-plus-raw-byte-hash checks
  detect changes through the last pre-replacement check, including metadata-preserving byte changes. A non-cooperating
  external writer can still change the target after that final check and before atomic replacement; this unavoidable
  platform race MUST be stated in target-host evidence and MUST NOT be misreported as a guaranteed exclusion.
- Same-directory atomic replacement deliberately accepts the owned source contract's filesystem tradeoffs: it
  may break hard-link aliasing and does not preserve extended attributes. This does not relax preservation of the
  target's permission mode or the requirement that a pre-commit failure leave the original file intact.
- Autosave's debounce is exactly one second after the last accepted content revision. SC-FT-007 measures the
  user-visible final-input-to-commit duration in the fresh release build rather than treating fake-clock scheduling or
  mock-bridge timing as disk-performance evidence.
- The deterministic parity gate compares the mockup and application in one local browser engine so CSS geometry,
  local fonts, and rasterization share the same conditions. The real Wails build remains mandatory, but its native
  frame and host renderer are recorded separately rather than used as the exact pixel reference.
- Monaco remains the consumed Feature 002 editor and retains its acknowledged 13/14/16 px setting contract with
  14 px as default. The deterministic mapping may isolate unavoidably editor-engine-owned dynamic pixels, but it
  must still assert the editor container, pane header, palette, configured font size, line height, selection/focus
  treatment, and all surrounding chrome; it may not mask the entire editor pane to conceal layout drift.
