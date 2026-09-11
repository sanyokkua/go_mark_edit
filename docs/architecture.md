# GoMarkEdit architecture map

This is the concise architecture map for GoMarkEdit. Together with the active feature tree in
`specs/004-codebase-refactoring/`, it is the authority for the current product and its boundaries.
The old delivery records are historical evidence; this file states the decisions that current work
must follow.

## Product intent

GoMarkEdit is a local-first desktop Markdown editor. A Wails v2 process owns the application model,
file I/O, persistence and operating-system integration. A React frontend is the view and controller
inside the native webview. Markdown files remain the user's source of truth; the application does not
turn them into a proprietary document store.

The default product works without internet access. It makes no background or unsolicited network
request, has no telemetry or automatic update path, and keeps rendering assets local. Document content
and a future assistant may use a network only under the user's explicit control and the policy of the
feature that introduces that capability. The current product is an offline editor with editor,
split-view and preview presentations, local settings and recent files, and multiple independent
instances.

## Authority and ownership

The active feature specification, plan, contracts and task list live under
`specs/004-codebase-refactoring/`. This map records the stable architecture that those artifacts
describe. A change to an existing behaviour starts by finding its owner and every consumer below;
it does not create a parallel implementation in the caller.

### Backend and bridge owners

| Owner                   | Responsibility                                                                                                                                            |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main.go`               | Composition root: constructs the database, model, settings service, handlers, native window and Wails bindings.                                           |
| `internal/appmodel/`    | One backend-authoritative document and UI model, lifecycle, publication, saves, close plans, conflicts, autosave, tab state and recent-file coordination. |
| `internal/application/` | Wails-facing handlers, emitter, native window/dialog ports, shutdown coordination, native menu and the local preview-image route.                         |
| `internal/settings/`    | Typed settings groups and their handler over the shared key-value store.                                                                                  |
| `internal/bridge/`      | Request identity, result guarding, failure conversion, event names and the process-level outcome cache. It is a leaf package.                             |
| `internal/kv/`          | The one small typed key-value helper used by settings, layout, recents and file metadata.                                                                 |
| `internal/file/`        | Canonical file identity and paths, supported suffixes, document reading, atomic replacement, clipboard and file-manager ports.                            |
| `internal/db/`          | CGO-free SQLite opening, WAL and busy-timeout configuration, corruption handling and additive migrations.                                                 |
| `internal/bootstrap/`   | Startup logging and application version.                                                                                                                  |
| `internal/logging/`     | Local structured logging and rotation.                                                                                                                    |

Every Wails-bound method is guarded and returns the standard result envelope. The frontend is the only
place allowed to import generated Wails bindings: `frontend/src/logic/adapter/`. The adapter mints
request identities, applies pacing and unwraps results; widgets and primitives call the adapter or
receive commands through props and contexts.

### Frontend composition and command owners

| Owner                                          | Responsibility                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------------ |
| `frontend/src/app/App.tsx`                     | Composition of the shell, projection hydration and top-level providers.        |
| `frontend/src/app/useBootstrap.ts`             | Startup steps and readiness/failure presentation.                              |
| `frontend/src/app/useShutdown.ts`              | Frontend half of the native close protocol.                                    |
| `frontend/src/app/useCommands.ts`              | Command orchestration, action dispatch and notification delivery.              |
| `frontend/src/logic/adapter/`                  | The bridge boundary, request pacing, event subscriptions and service wrappers. |
| `frontend/src/logic/store/`                    | A disposable Redux projection of backend state; it is not the source of truth. |
| `frontend/src/logic/actions/actionRegistry.ts` | The action catalogue and availability decisions used by every command surface. |
| `frontend/src/logic/format/formatting.ts`      | The single formatting runner used by toolbar and command paths.                |
| `frontend/src/logic/markdown/linkPolicy.ts`    | Link classification before a preview action is dispatched.                     |
| `frontend/src/ui/widgets/editorSession.ts`     | The document-identity-bound active editor command seam.                        |
| `frontend/src/ui/widgets/Menubar/`             | File, Settings, View, About and narrow overflow menu composition.              |
| `frontend/src/ui/widgets/DocumentTabs/`        | The DocumentTabs consumer of TabBar and tab-specific commands.                 |
| `frontend/src/ui/widgets/FormattingToolbar/`   | Formatting groups, arrangement control and Bar overflow.                       |
| `frontend/src/ui/widgets/EditorStage/`         | Editor/preview panes, arrangement and preview accessory state.                 |
| `frontend/src/ui/widgets/dialogs/`             | Settings, About, Shortcuts, close, conflict and normalization dialogs.         |
| `frontend/src/ui/widgets/StartupFailure/`      | Per-step startup failure, Retry and Quit.                                      |

## Shared UI owners and consumer inventory

The following inventory is part of the ownership contract. A change to one shared component must be
visible in all of the listed consumers and must stay within the component's layer. Components and
primitives take props or local primitive context; they do not import the store, adapter or action
registry.

### Popup — `frontend/src/ui/components/Popup/`

Popup owns the portal, open/close lifecycle, Escape and outside-pointer dismissal, focus restoration,
menu navigation, collision handling and frame-bounded placement. It portals into the application
frame, uses an 8 px collision margin, and supports trigger, point and bounds anchors.

Consumers: File menu, Settings menu, View menu, About menu, narrow menubar overflow, tab context menu,
editor context menu, formatting-toolbar overflow and the StatusBar Document details disclosure.

### MenuItem — `frontend/src/ui/components/MenuItem/`

MenuItem owns the shared menu row, disabled/checked/radio presentation, accelerator placement and
submenu grouping. Consumers are every Popup menu above; the Shortcuts dialog also reuses the shared
accelerator formatting helper.

### Bar and Island

`frontend/src/ui/components/Bar/` owns horizontal framing, slots, alignment and measured overflow.
Its consumers are the Menubar, the TabBar and the FormattingToolbar. Menubar uses its scroll policy,
TabBar keeps horizontal scrolling, and FormattingToolbar uses the menu policy below its accepted
breakpoint.

`frontend/src/ui/components/Island/` owns a labelled visual group. Its consumer is the formatting
toolbar's text, heading, list, insertion, deferred-action and arrangement groups.

### ToolButton and Button

`frontend/src/ui/primitives/ToolButton/` owns icon/text variants, disabled, pressed and checked states,
selection-preserving mousedown and the square icon-only shape. Its consumer is the FormattingToolbar;
TabBar and Menubar controls belong to their owning Bar/TabBar surfaces.

`frontend/src/ui/primitives/Button/` owns primary, secondary and quiet buttons. Its consumers are the
dialogs, toasts and Launcher.

### TabBar — `frontend/src/ui/components/TabBar/`

TabBar owns document tabs, horizontal scrolling, drag reorder, add and close controls, the context-menu
anchor and the tablist keyboard model. Its consumer is DocumentTabs. Theme differences such as radius,
padding and underline are tokens, not alternate tab implementations.

### Pane — `frontend/src/ui/components/Pane/`

Pane owns the header, identity, body and accessory slots. Its consumers are the editor pane and preview
pane; a paused or failed preview banner arrives through the explicit accessory slot.

### Sidebar — `frontend/src/ui/components/Sidebar/`

Sidebar owns side, width, collapsed state, minimum width and resize callbacks. Its consumer is the
workspace panel; the reserved assistant panel is a future consumer. The acknowledged, pending or
refused width is supplied by `frontend/src/logic/store/uiLayoutCommands.ts` and is never inferred from
notification text.

### ModalShell — `frontend/src/ui/components/ModalShell/`

ModalShell owns modal portal, backdrop, focus trap, Tab/Shift+Tab, Escape, opener restoration and
dismissal policy. Its consumers are Settings, About, Shortcuts, Normalization, Close, External change
and Recovery dialogs.

### Segmented and Icon

`frontend/src/ui/primitives/Segmented/` owns roving focus and Arrow/Home/End navigation. Its consumers
are the FormattingToolbar arrangement control, the Settings menu mode group and the radio groups in
SettingsDialog.

`frontend/src/ui/primitives/Icon/` is the only glyph source. Its consumers are Menubar, FormattingToolbar,
TabBar's close/add controls, the preview file glyph, StatusBar, dialogs and Launcher.

### StatusBar and Notifications

`frontend/src/ui/components/StatusBar/` owns fact rows, drop priority, save identity, transient state
and the Details Popup. Its consumer is the shell's status surface.

`frontend/src/ui/components/Notifications/` owns the single non-blocking notification surface. Its
consumer is the application shell; save failures, refused links and stuck-call notices enter through
this one mount.

### Rendering and theme owners

`frontend/src/ui/components/CodeEditor.tsx` owns the visible Monaco working copy. It is paired with
`frontend/src/ui/components/MarkdownView.tsx`, which owns sanitized preview rendering. The frontend theme
generator produces the editor and highlight output from the token families in
`frontend/src/ui/styles/tokens.css`.

All appearance values come from `frontend/src/ui/styles/tokens.css`. The three themes and light/dark
values are selected on the document root. Widget stylesheets do not select themes and portalled
surfaces inherit the root attributes.

## Commands and verification

The five executable entry points are `scripts/build`, `scripts/test`, `scripts/verify`, `scripts/format`
and `scripts/baseline`. Shared shell functions and the stage runner live in `scripts/lib/`; JSON stage
records and baseline comparison are owned by `tools/verify/results.mjs`.

The optional `justfile` has only aliases to those entry points: build, test, verify, format, baseline,
dev and setup. Hooks and CI call the scripts directly. A developer may use the following forms:

- `scripts/build` checks the declared toolchain, regenerates bindings and themes, builds the packaged
  application, restores generated-file modes, scans the bundle and verifies a clean tree.
- `scripts/build setup` installs declared dependencies; `scripts/build dev` runs the Wails development
  application.
- `scripts/test unit`, `scripts/test integration` and `scripts/test e2e` run the three test tiers;
  `scripts/test all` runs them in order.
- `scripts/verify` runs Lint, Format check, Build, Unit, Integration and E2E in that order.
  `scripts/verify lint` and the other stage names run one stage; `scripts/verify --skip e2e` records
  E2E as skipped rather than passed.
- `scripts/format --check` checks the repository formatter set. `scripts/baseline` captures a full
  stage record, and `scripts/baseline --compare` fails closed when findings remain or a new finding
  appears.

The Lint stage's owners are `tools/archlint/`, `frontend/eslint.config.js`,
`frontend/stylelint.config.mjs`, `tools/lint/tokens.mjs`, `tools/lint/repo-rules.mjs` and the declared
Go/TypeScript compilers. `tools/lint/bundle-scan.mjs` runs after the production build. A rule belongs
to one executable owner; prose explains intent but does not replace the gate.

## Document lifecycle

### Opening and identity

Every file-entry route uses the application model's open flow. Supported suffixes are `.md`,
`.markdown`, `.mdown` and `.txt`, case-insensitively. The global default open mode is applied first:
Reading opens directly in Reading mode; Editor opens with the document's persisted view, then the last
application arrangement, then Split; a new document always starts in Editor mode.

`frontend/src/logic/adapter/` carries the request identity and `internal/file/` resolves canonical
paths and filesystem identity. A hard link focuses the existing document identity instead of creating
a second tab. Invalid UTF-8 or NUL-bearing input becomes clearly read-only and is never converted.
UTF-8 BOM, uniform LF/CRLF and the original bytes remain stable. Mixed endings are editable but require
the one-time, revision-bound normalization authorization before any write.

### Backend truth and frontend working copy

`internal/appmodel/lifecycle.go` owns one record per open document, including path identity, revisions,
dirty state, write coordination and per-document resources. `internal/appmodel/publish.go` is the one
publication path: it snapshots under the model lock, emits after unlock and rejects stale publication
identities. Disk I/O stays outside the model lock, and disposal releases all per-document resources.

The Redux store under `frontend/src/logic/store/` hydrates once and applies content-free state patches.
The active Monaco buffer is the only frontend working copy and is not the backend source of truth.
`frontend/src/ui/widgets/editorSession.ts` binds commands to the expected document identity and session;
its results explicitly distinguish available, unavailable and document-mismatch outcomes.

### Editing, saves and conflicts

The document-command seam supplies selection, replacement and replacement of the whole document. A
format or assistant proposal becomes one editor edit and then follows the ordinary dirty, save and
autosave path. Autosave is allowed only for an existing saved file; a never-saved buffer is not silently
written.

`internal/file/atomic_replace.go` owns atomic replacement. Before the replacement commits, failure
leaves disk and the old baseline unchanged. After it commits, the model records the exact written
baseline even if patch delivery fails; the adapter rehydrates before accepting further mutations and
does not repeat the write.

External changes are classified before saving. Editable conflicts offer Reload or one exact-version
Keep mine authorization. Read-only conflicts offer Reload only. Close plans gather all required choices
and normalization authorizations before writing, save in authoritative tab order, stop at the first
failure, and close tabs only after all requested saves succeed.

### Links, files and images

`frontend/src/logic/markdown/linkPolicy.ts` classifies anchors, local document candidates, http/https
links and refused schemes. `internal/appmodel/preview_link.go` applies the canonical open flow for a
local candidate; an http/https target goes to the system browser; refused targets produce one warning
without disturbing the page or editor session.

`internal/application/preview_image.go` serves the local image route registered by the composition
root. It resolves symlinks, requires the image to remain inside the document's folder and enforces the
20 MB bound. A web image, an outside image, an oversized image or an image from an untitled document
uses the existing placeholder and its alt text without a new notice.

Workspace operations are additive only: New file, New folder, Reveal in file manager and Copy path.
The application does not rename, move, delete or reorder workspace files because it has no watcher or
undo journal to reconcile those destructive changes safely.

## Shutdown

`internal/application/shutdown.go` owns the native close and quit protocol; `frontend/src/app/useShutdown.ts`
owns the frontend half. The request identity for a close is distinct from the identity of each bridge
call.

The sequence is normative:

1. `OnBeforeClose` asks the ready frontend whether it may close. Dirty documents appear in one Save
   all / Discard all / Cancel decision; Cancel is a clean no-op. Before readiness, clean state can exit
   immediately, while dirty or pending writes enter the confirmation path.
2. In-flight runs are cancelled and the shared gate is released.
3. Started writes, the editor buffer, autosave and debounced window geometry are flushed; no new write
   starts during draining.
4. The SQLite database is closed.
5. The logger is flushed and closed, then the process exits.

A timeout never authorizes data loss. A late or stale answer is rejected by close identity, and a
second native request while one is pending re-emits the same request rather than creating a second
veto state. There is no session restore.

## Persistence

Documents are file-first. Settings, recent files, window layout and per-document view state live in the
small SQLite key-value store opened by `internal/db/` at the platform configuration location under
`GoMarkEdit` or `GoMarkEdit-Dev`, in `settings.db`. The store uses the `settings(key, value, type)`
table, typed values, WAL and a five-second busy timeout so independent processes can share it. The
embedded migration is `internal/db/migrations/0001_settings.sql`; migrations are additive and never
rewrite existing data.

Settings, layout, recents and file metadata use `internal/kv/` and leave keys they do not own alone.
Layout changes write through immediately; continuous window resize is debounced and flushed during
shutdown. Shared state follows last-writer-wins by change time. Missing or invalid values fall back to
defaults. No document content, credentials or API keys are stored in the settings database; a future
provider stores only an environment-variable name.

The application opens clean: it does not restore a session or tabs, and it has no crash-recovery or
swap-file feature. Autosave touches only files that already exist on disk.

## Verification walkthrough

Before a release, run the packaged binary produced by `scripts/build` on the developer's host. Record
one sentence in the release notes with the date, commit, host and outcome. This feature has no release,
so the same sentence belongs in the close-out record in `specs/004-codebase-refactoring/plan.md`.
CI does not automate native dialogs or OS-level window interaction.

1. Launch the packaged app with Wi-Fi and Ethernet disabled; confirm the window appears and the process
   opens no connection.
2. Open About and confirm the local build reports `dev`, or that the release build reports its tag
   version.
3. Use the native Open dialog to open a Markdown file and confirm the tab is clean and Saved.
4. Type, save, undo and confirm the bytes, dirty state, caret and focus are correct.
5. Use native Save As and confirm the new file bytes equal the editor and the tab is clean.
6. Open a hard link to the current file and confirm the existing tab is focused.
7. Edit a second file, request close, and exercise Cancel, Discard and Save choices.
8. Exercise an anchor, a sibling local document, an outside local document, refused schemes and an
   http/https browser link; confirm bridge and editing continuity.
9. Confirm a local in-folder image renders and a web image uses the placeholder with its alt text.
10. Open File, Settings, View and About by pointer and keyboard in Material, Glass and Minimal; check
    the elevation shadow and second-click close.
11. Open a tab context menu by pointer and keyboard; confirm its anchor and shortcut rows.
12. Resize to the minimum width and confirm every menubar menu remains inside the frame.
13. Request quit with a dirty document; confirm the native confirmation names it and Cancel returns to
    a working application.
14. Request quit with everything saved and confirm the application exits.
15. Relaunch and confirm recent files and window layout are restored without a false unsaved state.

## Durable decisions

These decisions are carried forward from the accepted decision records and are restated here as current
architecture. The assistant records are intentionally listed separately because that capability is not
part of the current product.

| Record   | Current decision                                                                                                                                                                                                                         |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ADR-0001 | Use stable Wails v2 with a CGO-free Go backend and pure-Go SQLite. Native webviews and file association remain the platform boundary.                                                                                                    |
| ADR-0002 | Use Monaco for v1 source editing; keep CodeMirror 6 as a future contained alternative. Bundle editor workers locally.                                                                                                                    |
| ADR-0004 | Keep documents file-first and use a small SQLite KV store for settings, recents, layout and view state. Launch clean with no session restore or swap files.                                                                              |
| ADR-0005 | Use one token-driven layout with three built-in themes and light/dark modes; keep editor and preview appearance unified and do not support user-authored themes.                                                                         |
| ADR-0006 | Allow multiple independent instances; share the small settings database with WAL and busy timeout instead of a single-instance lock.                                                                                                     |
| ADR-0011 | The application is offline-first with no background network. Only an explicitly user-invoked request to the configured future provider may use a network; telemetry, automatic updates and unsolicited content fetches remain forbidden. |
| ADR-0013 | Persist application layout by write-through, with last-writer-wins change semantics and a debounced window-size write flushed on close.                                                                                                  |
| ADR-0014 | The Go backend owns live state; Redux is a projection and Monaco is only the visible document's working copy.                                                                                                                            |
| ADR-0015 | Derive releases from tags or an explicit version input, keep unversioned builds at `dev`, and derive platform icons from one source asset.                                                                                               |
| ADR-0017 | Coordinate backend canonical snapshots with a document-identity-bound frontend command session; neither seam impersonates the other.                                                                                                     |
| ADR-0021 | Active-buffer acknowledgements carry document identity and accepted revision; ordinary patches stay content-free, including the true zero-document state.                                                                                |
| ADR-0022 | Commit successful writes and resynchronize a failed projection; never pretend an irreversible replacement failed or repeat it.                                                                                                           |
| ADR-0024 | Apply one complete document lifecycle policy for open modes, suffixes, tolerant read-only input, line endings, normalization authorization, close plans and external conflicts.                                                          |
| ADR-0028 | The earlier custom title-bar/native-menu decision is superseded. The current product keeps the native operating-system frame introduced by feature 001.                                                                                  |
| ADR-0029 | Generate Monaco and highlight colours at build time from one pair of syntax-token families; runtime theme changes only swap generated names.                                                                                             |
| ADR-0030 | Derive raw-HTML sanitization from the selected Markdown standard; keep the explicit bounded allowlist, strict Mermaid security and KaTeX trust disabled.                                                                                 |
| ADR-0031 | Format and Compact use remark-stringify with the maximal parse plugin set; Prettier remains a repository development tool, not a runtime formatter.                                                                                      |
| ADR-0032 | Use one cancellable run registry and one deterministic shutdown order; a run has one terminal outcome and background panics are contained and logged.                                                                                    |
| ADR-0033 | Workspace file operations are additive only: create, reveal and copy path are allowed; rename, move, delete and tree reorder are refused.                                                                                                |

The preview link classifier and local image route are also durable current decisions: they are the
single policy and route described in the lifecycle section, with no remote rendering policy until the
future rendering feature defines one.

## Planned assistant decisions

The following accepted records describe future seams and are not current capabilities:

| Record   | Planned shape                                                                                                                                                                               |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ADR-0007 | One OpenAI-compatible provider client parameterized by per-kind profiles; credentials are environment-variable references and never persisted or logged.                                    |
| ADR-0008 | A bounded, cancellable, multi-turn tool loop with schema-validated, least-privilege read tools; model output proposes edits and never writes files.                                         |
| ADR-0009 | An offline approximate tokenizer and explicit context budget with a safety margin, reply reserve, history trimming and a warn/chunk path.                                                   |
| ADR-0010 | A right assistant sidebar whose proposals render as diffs and apply through the identity-bound editor command seam; provider and context settings extend SettingsDialog.                    |
| ADR-0034 | Tool support is detected per provider/model, rewrite actions have a single-shot degradation path, one wall-clock budget governs retries and iterations, and truncated output is actionable. |

## Decisions for this refactor

The owner decisions that shaped this refactor are recorded here so they are not silently rediscovered:

- **D1 — Toolbar overflow:** below 768 px the FormattingToolbar moves controls that do not fit into
  the shared `Bar` menu; TabBar keeps horizontal scrolling.
- **D2 — Icon controls:** FormattingToolbar icon-only controls use the square shared ToolButton shape
  and preserve the active editor selection on mousedown.
- **D3 — Black-box Go tests:** tests live in external unit and integration roots; only the three
  documented unreachable behaviours remain as in-package white-box tests.
- **D4 — Parity removal:** the pixel-parity harness goes after the real-backend E2E stage is green.
- **D5 — One authority:** the active `specs/` tree and this map are normative; delivery material is
  archived.
- **D6 — Mock removal:** the mock bridge and native evidence driver go after the real-backend E2E stage.
- **D7 — Remote content wording:** the current app remains offline without background requests; a
  future rendering feature owns the user-controlled remote-content policy.
- **D8 — Deferred controls:** not-yet-built controls remain visible and disabled, with availability
  read from the action registry.
- **D9 — Native frame:** the native operating-system window frame remains the accepted current shell.
- **D10 — Accepted amendments:** Document details and Toggle Assistant remain in their accepted menu
  surfaces even while assistant behaviour is planned.
- **D11 — Link policy:** anchor, local, browser and refused link cases use the single classifier and
  normal bridge/open flow described above.
- **D12 — Lost-screen handling:** a close request before readiness follows the same no-data-loss
  protocol and never introduces session restore.

## Planning decisions retained

The seven planning decisions are part of the implementation record:

1. The formatter covers tracked source and documents, including SQL and archived material; migration
   comparison ignores whitespace so formatting does not look like a data migration.
2. The unused icon-processing helper is removed while the canonical source and generated icon assets
   remain.
3. The late-completion test lever is a second process holding an exclusive transaction on the harness
   profile database, because a blocking document path is refused before reading.
4. The `justfile` is hand-maintained and excluded from the formatter because `just` is optional.
5. `scripts/build setup --with-browser` and the universal help flags are accepted convenience forms;
   they do not add stages or aliases.
6. The two archive-only race cases use throwaway tests in the archived worktree and public-interface
   tests in the refactored tree.
7. `docs/superpowers/` and `docs/reference/` remain because they are retained planning/reference
   material, not the legacy workflow or Spec Kit core.

## Open decisions

The following are intentionally unresolved and must be surfaced as decisions rather than invented in
implementation:

- code signing and notarisation for release artifacts;
- the final split between `apperr` result envelopes and the serialized wire representation;
- Windows verification and release-runner coverage;
- the future remote-content policy for images and stylesheets, including its user consent surface.

Until the last item is decided by the rendering feature, web-referenced rendering remains outside this
product's current behaviour. The durable privacy principle is: the application runs without internet;
document content and a future assistant may use it under the user's control.
