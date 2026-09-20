# Phase 0 Research: Folder Workspace Sidebar

Every item below resolves a technical unknown or a spec gap found while planning. None are left
as `NEEDS CLARIFICATION`; several record a decision taken by the product owner in the 2026-09-19
clarification session, and the remaining ones that go beyond what the spec states explicitly are
called out with their rationale so a later reader does not mistake them for oversights.

## R1. Wails v2 multi-window support

- **Decision**: "New Window" spawns a new OS process of the current executable via
  `os.Executable()` + `exec.Command(execPath, args...).Start()` (detached, no `Wait()`), passing
  an optional folder path as `os.Args[1]` when the new window should open pre-loaded with a
  specific workspace (e.g. "open dropped folder in a new window").
- **Rationale**: Wails v2.15.0 (this project's pinned version, `go.mod`) has no in-process
  multi-window API — confirmed via Wails GitHub issues #1480/#2165 and the v3 announcement blog,
  which introduces multi-window management as a v3-only "Application API." Process-spawning is
  not a novel risk for this product: **ADR-0006** (`docs/architecture.md`) already commits to
  "multiple independent instances... shar[ing] the small settings database with WAL and busy
  timeout instead of a single-instance lock," i.e. running two instances of this exact binary
  against the same SQLite settings DB is an already-accepted, already-working scenario. This
  plan automates that spawn and adds one optional startup argument; it does not invent a new
  persistence or locking model.
- **Alternatives considered**: (a) Upgrading to Wails v3 — rejected as far outside this feature's
  scope and the project's pinned dependency policy (Constitution: versions "remain pinned in
  their authoritative manifests... an upgrade is planned and verified work, not a descriptive
  edit"). (b) A single-window "workspace switcher" instead of true multi-window — rejected
  because it contradicts FR-016/017's explicit requirement for independent windows with isolated
  state, and the spec's Independent Test for User Story 4 requires two simultaneously open
  windows.
- **Residual risk flagged for `quickstart.md`, not blocking**: confirm on macOS that
  `os.Executable()` + `exec.Command(...).Start()` launched _from inside_ a running `.app` bundle
  produces a correctly independent second window (Dock/menu-bar behavior), since ADR-0006's
  precedent covers two independently _launched_ instances, not one instance launching a second at
  runtime. A manual quickstart check on macOS is the verification step, not a design change.

## R2. Wails v2 drag-and-drop

- **Decision**: Enable native drop via `options.App.DragAndDrop = &options.DragAndDrop{EnableFileDrop: true}`
  in `internal/application/options.go`, and receive drops through the generated JavaScript
  runtime's own `OnFileDrop(callback, useDropTarget)` (already present in
  `frontend/wailsjs/runtime`, unused today), subscribed inside `logic/adapter/`. The callback
  receives `(x, y, paths)` — absolute paths for both files and directories, confirmed working
  cross-platform (macOS, Windows, Linux) via Wails' reference docs and the GitHub PRs that
  implemented per-platform support (#3203, #3250). Registering Go's `runtime.OnFileDrop` in
  `main.go` and re-emitting an app event would deliver the same paths through one more hop, so it is
  kept only as the fallback if the runtime subscription fails on a platform.
- **Rationale**: This is the only native OS drag-and-drop mechanism Wails v2 exposes; no
  alternative library or lower-level webview API is warranted for a capability the framework
  already provides.
- **Design consequence**: Go-side involvement is deliberately minimal — one new bound method,
  `ClassifyDroppedPaths(paths []string) apperr.DropClassificationResult`, buckets each path into
  `Files`/`Folders`/`Unsupported` via `os.Stat` + the existing suffix check. It does not open
  anything. The frontend drives the actual opens through the adapter calls it already owns for
  menu-driven opens (`openRecentFile`, the new `openWorkspace`), per the 003 spec's own
  assumption: "operating-system associations and drag-and-drop are later entry adapters to the
  same canonical open lifecycle... future workspace/OS/drop adapters must reuse this command."
  This keeps exactly one Open orchestration path (Constitution VIII) instead of a second one
  living in Go's drop handler.

## R3. Symlink cycle handling in the tree walker

- **Decision**: `internal/workspace/tree.go`'s walker excludes symlinks (to files or
  directories) from the tree entirely — never listed, never traversed.
- **Rationale**: The Edge Cases section requires that traversal of a folder structure containing a
  symlink cycle always terminates. A walker that never follows a
  symlink cannot loop, by construction — this satisfies the requirement with zero additional
  state and is consistent with the product's general no-extra-machinery ethos (no watcher, no
  undo journal, KISS).
- **Alternatives considered**: Following symlinked directories while tracking visited directory
  identity via `os.SameFile` against the current ancestor chain — this is the standard approach
  used by `golang.org/x/tools/internal/gopathwalk` and third-party packages like
  `github.com/facebookgo/symwalk` (confirmed via web research). Rejected: it adds real
  complexity (ancestor-chain bookkeeping, cross-platform `os.SameFile` semantics) for a benefit
  (browsing through symlinked subfolders) the spec never asks for; the simpler exclusion
  satisfies every stated requirement.
- **Reaffirmed by the product owner (clarification, 2026-09-19)**: the decision stands unchanged —
  symlinks and aliases, to files or to folders, are never listed and never followed. The trade-off
  was put to the product owner and accepted explicitly: notes kept _behind_ a symlink (a folder
  aliased into the opened folder, or a single aliased file) will not appear in the tree at all, and
  must be reached by their real path, by Open Recent, or by a drop. Hiding them outright rather
  than showing them as inert rows is what keeps the walk terminating by construction, which is the
  whole point of the entry.

## R4. Bounded traversal order, and the separate presentation order

- **Decision**: Use `os.ReadDir` (not `filepath.WalkDir`) for full control over per-directory
  error isolation and a single global entry counter across the whole recursive walk. `os.ReadDir`
  returns each directory's entries already sorted by filename, so "the first 20,000 entries by
  traversal order" — FR-021's truncation rule, stated against the bound raised from 5,000 to
  20,000 during clarification (see R15) — is deterministic and directly testable. **Presentation
  order is a second, explicit step, not the walk's order**: within each directory the retained
  children are emitted folders first, then files, each group A→Z case-insensitively, so what the
  user reads is grouped and alphabetical regardless of the byte-order the walk happened to use.
- **Rationale**: `filepath.WalkDir`'s callback-per-entry model makes stopping mid-walk and
  distinguishing "root failed to read" from "a subfolder failed to read" (FR-020 vs. the
  Edge Cases' "workspace unavailable" case) awkward; a small hand-written recursive walker over
  `os.ReadDir` keeps both cases simple and explicit. Keeping the two orders separate is what makes
  both testable: the bound is counted against the walk's own stable order, so "which 20,000
  entries survive" is reproducible without sorting anything first, while the folders-first,
  case-insensitive A→Z ordering is a per-directory concern applied only to children that already
  survived the type filter, the hidden-folders setting (R14) and the bound — it can therefore
  never change _which_ entries are kept, only the order they are shown in.
- **Alternatives considered**: `filepath.WalkDir` with `filepath.SkipDir` returned on
  permission-denied — workable but conflates the "stop the whole walk, report unavailable" case
  (root itself is unreadable) with the "skip this one subtree, keep going" case (FR-020) unless
  wrapped in extra bookkeeping; a direct recursive `os.ReadDir` walker keeps the two cases
  naturally distinct (root failure is a returned `error`; subtree failure is a per-node
  `Unreadable: true` flag). Applying the presentation order _before_ counting — so that
  truncation would drop the alphabetically-last entries instead of the traversal-last ones —
  was also rejected: it forces every directory's full listing to be sorted before any bound
  decision can be taken, for no user-visible gain, since reaching 20,000 entries is an escape
  hatch rather than a browsing mode.

## R5. Recent Files → Recent Items (combined MRU, cap 10)

- **Decision**: Generalize the existing `internal/appmodel/recent_files_repository*.go` (files
  only, cap 6) into a combined files+folders MRU (`RecentItem{Path, Kind}`, cap 10), with an
  additive SQLite versioned-JSON migration (v1 `{Version:1, Entries []string}` → v2
  `{Version:2, Entries []RecentItem}`, every v1 string entry mapped to `Kind: "file"` on decode).
- **Rationale**: FR-008 explicitly requires "a most-recently-used list of previously opened
  folders and files ('Recent')... bounded to at most 10 combined entries." The existing list is
  files-only and capped at 6 — this is a 003-era shape that 005 explicitly supersedes for this
  one list. The spec's own Assumptions section permits tuning bounded numbers during
  planning/implementation as long as the truncation/bound behavior is preserved; the _shape_
  change (files-only → combined) is what FR-008 itself requires, not an independent choice.
- **Alternatives considered**: A second, parallel "Recent Folders" list alongside the untouched
  "Recent Files" list — rejected because FR-008 and the mockup both show one flat, interleaved,
  most-recent-first list (`release-notes.md`, `spec-draft.md`, `~/Documents/Notes` in one
  sequence), not two separate lists; a second list would also violate Constitution VIII (one
  owner per behaviour) by duplicating the MRU-repository pattern.
- **Menu surface and refresh timing (clarification, 2026-09-19)**: the list keeps its shape and
  cap, and gains three settled details. (a) A **Clear Recent** row sits at the bottom of the Open
  Recent submenu and empties the whole list after a short confirmation; there is no per-entry
  removal, since the only per-entry removal the product needs already happens automatically when a
  path turns out to be gone (FR-010). (b) Entry labels are the file or folder **name only**, with
  the full path shown on hover, so the submenu stays readable when several notes share a name and
  the disambiguating information is still one hover away. (c) Each window **re-reads the stored
  list when its own File menu opens**, so a path another window recorded appears the next time
  this window's menu is opened. There is no live cross-window messaging: the shared SQLite store
  plus a read-on-menu-open is the whole mechanism, which is exactly what ADR-0006's "multiple
  independent instances sharing the small settings database" already supports and adds no
  broadcast channel between processes.

## R6. "Reopen Last" — reconciling two meanings

- **Finding**: The existing `'reopen'` action / `AppModelHandler.ReopenLastFile` currently means
  "undo the most recently closed tab in this session" — driven entirely by an in-memory,
  per-window `recentlyClosed` stack (`internal/appmodel/tab_session.go`), never persisted.
  `canReopenLastFile` is computed purely as `len(recentlyClosed) > 0`. Spec 005's "Reopen Last"
  (FR-009; User Story 2 AC3; Independent Test: "closing the app or the folder, then confirming...
  'Reopen Last' reopens it directly") also needs something different: opening the head of the
  _persisted, cross-session_ Recent Items list, which must survive an app relaunch.
- **Decision (the product owner's own framing, reaffirmed during clarification 2026-09-19)**: one
  command, one row, resolved by session. **Within the same session, "Reopen Last" brings back the
  most recent closed tab** — today's shipped behaviour, unchanged. **When there is nothing to
  un-close — including in a freshly started app — it opens the newest Recent entry, file or
  folder.** It is never dead while either source is non-empty. Mechanically that is a fallback
  chain: `ReopenLastFile` tries the session's closed-tab stack first, and only when that stack is
  empty does it resolve the Recent Items list's most-recent entry — a file opens via `OpenPath`; for
  a folder the backend opens nothing and returns `folder-target`, and the frontend runs the
  open-folder orchestration that ends in `OpenWorkspace` (`contracts/workspace-lifecycle.md`);
  `canReopenLastFile` becomes
  `len(recentlyClosed) > 0 || len(recentItems) > 0`. A Recent entry that is a folder goes through
  the same replace-or-new-window prompt as every other folder-opening entry point (R7).
- **Rationale**: This is a strict superset of current behaviour — nothing existing is removed or
  redefined, and 005's cross-session, folder-capable requirement is satisfied by the fallback
  path. It also matches the single "↺ Reopen last file / folder" mockup row exactly: one action,
  one row, whichever source of "last" applies.
- **Alternatives considered and rejected** (options presented to and decided by the user):
  fully replacing the closed-tab-undo behaviour with MRU-head-only (rejected — silently drops a
  shipped 003 behaviour with no replacement); splitting into two separate actions/menu rows
  (rejected — diverges from the mockup's single row and adds a decision the user has to make
  every time instead of one predictable "last thing" concept).

## R7. Menu-driven "Open Folder" when a workspace is already open

- **Finding**: The spec defines the replace-vs-new-window decision only for drag-and-drop
  (FR-013) and is silent on `File > Open Folder`, on "Open Recent" landing on a folder entry, and
  on "Reopen Last" resolving to a folder entry (R6) when a folder is already open in the current
  window.
- **Decision (confirmed by the product owner during clarification, 2026-09-19)**: Apply FR-013's
  rule to every one of those entry points — the same `WorkspaceReplacePrompt` component, the same
  two choices (replace this window's folder / open it in a new window), raised whenever any
  folder-opening action targets a window that already has a folder open. **One prompt, four call
  sites**: `File > Open Folder`, Open Recent on a folder entry, Reopen Last resolving to a folder
  entry, and a folder drop. Choosing "replace" then runs the tab-closing flow in R13 before the
  new folder is read.
- **Rationale**: This is the only self-consistent behaviour across entry points and avoids a
  second bespoke decision path; it also directly satisfies Constitution VIII (one implementation
  per behaviour — one prompt, four call sites, not four variations). It is no longer a planning
  default: the question was put to the product owner directly and the rule was confirmed and
  extended to the two menu-driven folder entry points that had not been considered when the entry
  was first written.
- **Alternatives considered**: Silently replacing the workspace without prompting when the
  action originates from the menu (asymmetric with drag-drop) — rejected as inconsistent and
  surprising; always forcing a new window from the menu (never replacing) — rejected as it
  removes a natural, low-friction "switch projects in place" action the mockup's single-window
  workflow implies.

## R8. Reveal / Copy Path for tree nodes — reuse, not duplicate

- **Finding**: `internal/appmodel/copy_path.go`'s `CopyPath`/`RevealInFileManager` are keyed by
  `documentID` (open document), but internally operate on a plain path string via the existing
  `service.reveal` (`file.RevealPort`) and `service.clipboard` (`file.ClipboardWriter`) ports —
  no OS-specific logic needs to change for a workspace tree node that isn't an open document.
- **Decision**: Factor the shared logic into two small helpers,
  `revealPathViaPort(port file.RevealPort, path, subject string) apperr.RevealResult` and
  `copyPathViaWriter(writer file.ClipboardWriter, path, subject string) apperr.CopyPathResult`,
  called by both the existing document-ID-keyed methods (refactored to use them) and two new
  path-keyed methods, `RevealWorkspacePath`/`CopyWorkspacePath`, added in `workspace.go`.
- **Rationale**: Zero new native/OS integration code is needed; this is a pure Constitution VIII
  (DRY) factoring of already-working logic. Duplicating the OS-command bodies for a second,
  path-keyed pair of methods would create exactly the "second copy of a repository access path"
  the constitution forbids.

## R9. Supported document suffixes — reused, not redefined

- **Decision**: The tree filters files using the exact same list as every other entry point:
  `.md`, `.markdown`, `.mdown`, `.txt`, case-insensitive, via
  `file.IsSupportedDocumentSuffix` (`internal/file/paths.go:114`).
- **Rationale**: Five independent existing sources agree exactly on this list (003 spec, 003
  contracts, 004 data-model, `docs/architecture.md`, and the native-picker filter in `main.go`);
  the spec's own Assumptions section states this feature "does not change what counts as an
  openable document." Reusing the exported function is both correct and the only way to
  guarantee the tree can never drift from the picker/backend's own definition.

## R10. Workspace tree data shape — nested vs. flat

- **Decision**: The workspace snapshot is transmitted as one nested tree (`WorkspaceNode` with a
  `Children` array) on every Open/Refresh/Create, not as a flat, incrementally-patched node list.
- **Rationale**: FR-007 states the tree is rebuilt wholesale on open or manual Refresh only — no
  incremental, out-of-band updates are in scope (no watcher). A full nested payload each time is
  simpler to render recursively and avoids inventing normalization/patch-diffing machinery for a
  bound that is capped at 20,000 nodes (small enough that "always full snapshot" is cheap, see
  R15). This
  mirrors `AppStatePatch`'s existing style of shipping whole collections (`OrderedDocumentIDs`,
  `RecentFiles`) rather than fine-grained per-item patches for collections of this size.
- **Alternatives considered**: A flat, `documentsSlice`-style normalized map keyed by path with
  incremental upsert/remove patches — rejected as unnecessary complexity for a feature whose own
  spec explicitly rules out incremental/live updates outside manual Refresh; the pattern exists
  in the codebase for documents because documents _do_ get fine-grained incremental updates
  (open/close one at a time), which the workspace tree deliberately does not.

## R11. Tree UI composition — no new popup/modal/menu primitive

- **Decision**: The workspace tree, its context menu, and all four new dialogs (create-entry,
  replace-folder, multi-folder drop, close-folder) are built entirely from existing shared
  components: `Sidebar`
  (already the designated, currently-empty slot per `shared-components.md`: "Consumers:
  workspace panel"), `Popup`/`MenuItem` (the tab/editor context menus' existing primitive),
  `ModalShell` (the existing dialog primitive used by `ClosePrompt`/`ExternalChangePrompt`/etc.),
  `Icon`, `ToolButton`, and `Banner`.
- **Rationale**: Directly follows the explicit reuse instruction and Constitution VIII. No task
  in this feature justifies a new popup/modal/menu system; every interaction the spec describes
  (a context menu, a name-entry prompt, a replace-or-new-window choice) has a directly analogous
  existing pattern (`TabContextMenu.tsx`, `ClosePrompt.tsx`) to copy.

## R12. Closing a folder — an explicit user action with two affordances

- **Decision**: Closing the open folder is a first-class user action, reachable two ways that run
  exactly the same command: a `File > Close Folder` menu row and a `×` button in the sidebar
  header. Either raises one three-choice prompt — _Close the tabs too_ / _Keep them open_ /
  _Cancel_. "Close the tabs too" closes every open tab through the app's existing per-file
  save-or-discard flow; "Keep them open" clears the sidebar and leaves every tab exactly as it is;
  "Cancel" changes nothing at all.
- **Rationale**: `CloseWorkspace` already exists in the lifecycle contract as the recovery path
  behind the "This folder is no longer available" banner's Close action, so promoting it to a user
  command adds a menu row and a button, not a second implementation (Constitution VIII). Tabs and
  the sidebar are independent surfaces — a user closing a folder may well want to keep reading the
  notes already open, and may equally want a clean window — so the product refuses to guess and
  asks once, reusing `ModalShell` and the same save-or-discard flow `ClosePrompt` already drives.
- **Alternatives considered**: (a) Always closing the tabs with the folder — rejected: it destroys
  work the user never asked to put away, and the tabs may not even belong to the folder being
  closed. (b) Never closing them — rejected: it leaves orphan tabs from the previous project,
  which is precisely the case the prompt exists to resolve. (c) A single affordance — rejected:
  the menu row is the discoverable, keyboard-reachable one and the `×` is where the user's eye
  already is when the sidebar is the thing they want gone; both are cheap because they dispatch
  the same action.

## R13. Replacing the open folder — tabs close first, and cancel abandons the switch

- **Decision**: When a folder-opening action targets a window that already has a folder open and
  the user chooses "replace" at the R7 prompt, **all** open tabs close through the existing
  per-file save-or-discard flow, and only then is the new folder read. **Cancelling any one of
  those save prompts abandons the whole switch**: the old folder stays open and every tab that had
  not yet been closed stays open.
- **Implementation consequence (stated here because it constrains call order, not just
  behaviour)**: the frontend MUST run the tab-close sequence to completion and only then call
  `OpenWorkspace`. `OpenWorkspace` is never called speculatively, in parallel with the close
  sequence, or optimistically ahead of it, so a partially-closed set of tabs sitting beside a
  newly-opened folder can never be observed. The backend keeps `OpenWorkspace` free of any
  tab-related precondition; the ordering lives in the one frontend orchestration path that already
  owns multi-step open flows, which is also the only place that can observe a cancelled save
  prompt.
- **Rationale**: A save prompt is the last point at which the user can still say "actually, no",
  and the only outcome they can reason about afterwards is all-or-nothing: either this window is
  now the new project, or it is exactly what it was. Any partial application — new folder, some
  old tabs — produces a state neither the user nor the sidebar can explain, and the tree would
  then be showing one project while the tabs show another.
- **Alternatives considered**: (a) Opening the new folder first and closing tabs afterwards —
  rejected: a cancelled save then has nothing to undo, because the replace already happened.
  (b) Reading "Cancel" as "cancel this one file's close, carry on with the switch" — rejected: it
  silently downgrades an explicit refusal into "no, but continue anyway", and leaves exactly the
  mixed state above. (c) Closing tabs without prompting when replacing — rejected: it is the same
  data loss R12's prompt exists to prevent, arriving through a different door.

## R14. "Show hidden folders" — a persisted app-wide setting, re-read by the window that flips it

- **Decision**: Dot-**folders** are hidden by default and are neither listed nor walked. A switch
  in the sidebar, "Show hidden folders", turns them on: they are then listed _and_ walked, so
  supported documents inside them (`.obsidian/notes.md`, for example) become reachable. Dot-**files**
  are always hidden, regardless of their extension — the switch has no effect on them. The
  document-type filter always applies in both states: the switch changes which folders are walked,
  never which file types are shown, and it is the only adjustable part of the tree's filtering
  (FR-004's chip row stays fixed and non-editable). The value is persisted app-wide in the
  existing per-field settings store — the SQLite key/value already holding `workspace.visible` and
  `workspace.width` via `LayoutRepositoryAPI` — so it applies to future windows and survives a
  relaunch. Flipping it re-reads the folder immediately **in the window that flipped it only**;
  other open windows keep the tree they have until they next read a folder (Refresh, opening a
  folder, or restart).
- **Rationale**: The concrete driver is `.git`. A working repository's `.git` folder routinely
  holds tens of thousands of entries, and walking it by default would consume the tree's whole
  20,000-entry budget (R15) and truncate the user's actual notes out of the listing — the tree
  would be technically correct and practically useless. Defaulting the switch off keeps the common
  case right, while turning it on serves the real use it was asked for: notes that genuinely live
  in a dot-folder, such as an Obsidian vault's configuration directory. Dot-files stay hidden
  unconditionally because nothing a user thinks of as a note is named with a leading dot, and
  keeping them out preserves SC-003's flat, checkable promise. Storing the flag in the existing
  settings store adds a key, not a store (Constitution VIII), and re-reading only in the flipping
  window is the honest consequence of having no cross-process messaging (ADR-0006) — it is the
  same read-on-demand model R5 uses for the Recent list, with no watcher and no broadcast.
- **Alternatives considered**: (a) A per-window, session-only switch — rejected: a user who works
  in dot-folders would have to re-enable it in every new window, and the product already has a
  settings store for exactly this kind of durable preference. (b) Broadcasting the change to every
  open window — rejected: it requires cross-process messaging this product deliberately does not
  have, for a setting that is flipped rarely and whose staleness is both visible and one Refresh
  away. (c) One combined "show hidden files and folders" switch — rejected: it would put dot-files
  into the tree for a need nobody stated and weaken SC-003. (d) Making the type filter editable
  alongside it — rejected: FR-004 fixes that filter, and the clarification named this switch as
  the single adjustable part of the tree.

## R15. Bound raised to 20,000, and the 2-second promise replaced by a loading state

- **Decision**: Two linked changes. FR-021's truncation bound rises from 5,000 to **20,000**
  combined entries, with the same plain, always-visible line under the tree — "Showing the first
  20,000 items — some files are not listed." — and still no true total computed. And **SC-002's
  "within 2 seconds" promise is dropped**, replaced by a loading state: the sidebar shows that it
  is reading the folder instead of appearing frozen, for as long as the read takes.
- **Rationale**: Both follow from the same driver. Once "Show hidden folders" (R14) can be on, a
  large but entirely ordinary repository crosses 5,000 entries immediately, so the old bound would
  truncate constantly and the truncation line would become the normal state of the tree rather
  than an exceptional one. And a wall-clock guarantee over a 20,000-entry directory read is not
  something this feature can honestly make: the time is dominated by the operating system, the
  volume and anything scanning it — a cold network share, a spinning disk, an antivirus hook —
  none of which the product controls. A loading state is a promise the product _can_ keep, is
  observable in the UI, and is testable without a stopwatch or a fixture whose timing depends on
  the machine running it.
- **Alternatives considered**: (a) Keeping 5,000 and treating truncation as the user's problem to
  solve by opening narrower folders — rejected: it makes the escape hatch the everyday experience.
  (b) Keeping the 2-second criterion hedged with "typical project-sized folder" caveats — rejected
  as the worst of both: the caveats make it unfalsifiable while it still reads to a user as a
  guarantee. (c) Computing and showing a true total, "20,000 of 84,312" — rejected: it requires
  walking the entire tree to produce a number the user cannot act on, at exactly the moment the
  walk is expensive, which is the opposite of what the bound exists for.

## R16. Multi-folder drop — one prompt for the whole drop

- **Decision**: When two or more folders arrive in a single drop, one prompt covers the drop as a
  whole: _Open only the first folder_ / _Open all of them, each in its own new window_ / _Cancel_.
  "Only the first" takes the drop's own path order. If that window already has a folder open,
  choosing "only the first" then raises the normal single-folder replace-or-new-window prompt
  (R7); "open all of them" spawns one process per folder (R1) and needs no second prompt, since no
  existing window is disturbed. Files in a mixed drop are unaffected by this prompt and follow
  R17.
- **Rationale**: One window holds exactly one folder, so a multi-folder drop is ambiguous by
  construction and no default can resolve it. The design constraint is that prompts must not
  multiply with the number of dropped items — n folders must not mean n decisions — so the
  ambiguity is resolved once, for the drop, and the existing single-folder prompt then handles the
  one remaining per-window question.
- **Alternatives considered**: (a) Silently opening the first and ignoring the rest — rejected: it
  discards items the user explicitly handed to the app without saying so. (b) Silently opening all
  of them in new windows — rejected: a careless drag of ten folders would spawn ten processes.
  (c) Prompting per folder — rejected: exactly the n-prompts pile-up the single prompt exists to
  avoid.

## R17. Tab-limit behaviour differs between a batch drop and a single open

- **Decision**: The 40-document limit from the 003 contract is reused unchanged, and this feature
  defines how the two new entry points meet it. A **multi-file drop opens as many as fit** and
  then reports the remainder in one message naming how many files were not opened and why. A
  **single file open at the limit** — from a tree row, an Open Recent entry, or a one-file drop —
  **is refused** with a message naming the 40-document cap and telling the user to close one or
  more tabs first. No tab is closed automatically to make room, in either case.
- **Rationale**: A batch has a meaningful partial outcome: the user who drops fifty files wants
  the ones that fit, not a refusal of the whole gesture, and a single summary message keeps the
  report proportional (one message, never one per file). A single open has no partial outcome, so
  the only honest response is a refusal that names the limit and the remedy. Automatically closing
  a tab to make room was never on the table — it would discard work to satisfy a guard.
- **Alternatives considered**: (a) Refusing the entire drop when it does not fit — rejected: it
  punishes the whole batch for its tail and forces the user to re-drag a smaller selection.
  (b) Opening what fits and saying nothing — rejected: a silent partial failure, where the user
  believes every file they dropped is open. (c) Raising the cap for this feature — rejected: the
  40-document limit is owned by the 003 contract and changing it is not this feature's scope.

## R18. Tree row marks reuse the projected document state

- **Decision**: Files that are open in any tab get a subtle row highlight, and those with unsaved
  edits additionally get a dot. Both marks are computed in the frontend from the document state
  Redux already projects — the open-document collection and its dirty flag — matched to tree rows
  by canonical path. No new backend query, no new field on `WorkspaceSnapshot`, no per-row disk
  access.
- **Rationale**: The tree already reads the active document's path for its selection highlight, so
  "is this path open" and "is it dirty" are the same already-projected facts read one step
  further; the marks cost a lookup, not a round trip. Putting them on the snapshot instead would
  be actively wrong: the snapshot is rebuilt only on open, refresh or create (R10), so an
  `isOpen`/`isDirty` field would be stale the instant a tab is opened, closed or edited, and
  keeping it fresh would mean rebuilding the tree on the keystroke that first makes a document
  dirty.
- **Alternatives considered**: (a) Carrying the marks on `WorkspaceNode` — rejected for the
  staleness above, and because it would make a pure filesystem snapshot depend on live session
  state, crossing the ownership line `internal/workspace` is defined by. (b) A Go query per
  visible row — rejected: a bound call per row for facts that are already sitting in the store.

## R19. No search or filter box in the tree

- **Decision**: A search or filter box over the tree is explicitly out of scope for this feature.
  The sidebar has no search input, no name filter and no fuzzy-find; the hidden-folders switch
  (R14) is the only adjustable control on the tree, and the document-type filter stays fixed.
- **Rationale**: Recorded here, on the product owner's explicit instruction during clarification,
  so a later reader does not mistake the absence for an oversight. A search worth having over a
  tree this size is its own feature — match highlighting, auto-expansion to hits, result ordering,
  and defined behaviour on Refresh and on truncated listings — and the always-on type filter
  already narrows the tree to documents, which is the narrowing this feature promised.
- **Alternatives considered**: A filter-as-you-type box over the already-loaded snapshot —
  deferred rather than rejected on merit: it would be cheap to build against R10's full nested
  snapshot, but it expands the tree's interaction and keyboard model well past the deliberately
  minimal one this feature signed up for (Tab in, Up/Down, Enter). It is a natural follow-up, not
  a gap in this feature.
