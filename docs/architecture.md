# GoMarkEdit architecture map

This is the architecture map for GoMarkEdit. [The project guide](index.md) summarizes current
interfaces, data flows, operations and scope; `openspec/specs/` describes current behaviour and
`openspec/changes/` holds proposed work. Completed earlier features are archived under
`openspec/changes/archive/`. This map records stable ownership, lifecycle and persistence decisions.

## Product intent

GoMarkEdit is a local-first desktop Markdown editor. A Wails v2 process owns the application model,
file I/O, persistence and operating-system integration. A React frontend is the view and controller
inside the native webview. Markdown files remain the user's source of truth; the application does not
turn them into a proprietary document store.

The default product works without internet access. It makes no background or unsolicited network
request, has no telemetry or automatic update path, and keeps rendering assets local. Document content
and a future assistant may use a network only under the user's explicit control and the policy of the
feature that introduces that capability. The current product is an offline editor with editor,
split-view and preview presentations, local settings, combined Recent Items and multiple independent
instances.

## Authority and ownership

Current behaviour lives in `openspec/specs/`; a proposed change lives under `openspec/changes/<name>/`
with its proposal, design, delta specs and tasks, and moves to `openspec/changes/archive/` when
complete. This map records stable architecture shared across current and future changes. A change to existing behaviour starts by finding its owner
and every consumer below; it does not create a parallel implementation in the caller.

### Backend and bridge owners

| Owner                   | Responsibility                                                                                                                                             |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main.go`               | Composition root: constructs the database, model, settings service, handlers, native window and Wails bindings.                                            |
| `internal/appmodel/`    | One backend-authoritative document and UI model, lifecycle, publication, saves, close plans, conflicts, autosave, tab state and Recent Items coordination. |
| `internal/workspace/`   | Pure, bounded filesystem tree builder; it holds no session state and reads on open, refresh or create.                                                     |
| `internal/application/` | Wails-facing handlers, emitter, native window/dialog ports, shutdown coordination, native menu and the local preview-image route.                          |
| `internal/settings/`    | Typed settings groups and their handler over the shared key-value store.                                                                                   |
| `internal/bridge/`      | Request identity, result guarding, failure conversion, event names and the process-level outcome cache. It is a leaf package.                              |
| `internal/kv/`          | The one small typed key-value helper used by settings, layout, recents and file metadata.                                                                  |
| `internal/file/`        | Canonical file identity and paths, supported suffixes, document reading, atomic replacement, clipboard and file-manager ports.                             |
| `internal/db/`          | CGO-free SQLite opening, WAL and busy-timeout configuration, corruption handling and additive migrations.                                                  |
| `internal/bootstrap/`   | Startup logging and application version.                                                                                                                   |
| `internal/logging/`     | Local structured logging and rotation.                                                                                                                     |

Every Wails-bound method is guarded and returns the standard result envelope. The frontend is the only
place allowed to import generated Wails bindings: `frontend/src/logic/adapter/`. The adapter mints
request identities, applies pacing and unwraps results; widgets and primitives call the adapter or
receive commands through props and contexts.

### Frontend composition and command owners

| Owner                                                | Responsibility                                                                                                                                    |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend/src/app/App.tsx`                           | Provider, controller and shell composition; no adapter calls or workflow decisions.                                                               |
| `frontend/src/app/AppFrame.tsx` and `AppDialogs.tsx` | Typed shell and dialog presentation, retaining the application-frame portal root and provider lifetimes.                                          |
| `frontend/src/app/useBootstrap.ts`                   | Startup attempts, hydration, readiness, failure and fresh Retry.                                                                                  |
| `frontend/src/app/useDocumentSession.ts`             | Installed active buffer and reload epoch, through guarded activation acknowledgements.                                                            |
| `frontend/src/app/useCommands.ts`                    | New, Open, by-kind Recent Items, Reopen and activation commands; recent folders and folder-target outcomes use the shared workspace replace flow. |
| `frontend/src/app/useDropHandler.ts`                 | Classifies window drops and routes file and folder targets through the existing open and workspace replacement commands.                          |
| `frontend/src/app/useDocumentWrites.ts`              | Save/Save As intent, normalization, write conflicts, committed-write reconciliation and recovery.                                                 |
| `frontend/src/app/useCloseWorkflow.ts`               | Original tab-close or native-close origin, close plans, prompts, continuations and recovery-discard confirmation.                                 |
| `frontend/src/app/useShutdown.ts`                    | Sole frontend native pending-close identity, subscriptions, duplicate delivery handling and acknowledgements.                                     |
| `frontend/src/app/useExternalChanges.ts`             | Foreground checks, single-flight execution, pending comparisons and deferred rechecks.                                                            |
| `frontend/src/app/useConflictCommands.ts`            | Shared conflict transport and guarded reload installation; callers retain their distinct continuations.                                           |
| `frontend/src/app/useWorkflowPrompts.ts`             | Close → Save → foreground prompt priority and deferred write revalidation.                                                                        |
| `frontend/src/app/useNotifications.ts`               | Notice/banner presentation, remediation routing, dismissal and polite Copy path announcements.                                                    |
| `frontend/src/app/useWindowGeometry.ts`              | Readiness-gated native resize subscription and disposal.                                                                                          |
| `frontend/src/app/useAppPresentation.ts`             | Local settings, menu, About and Shortcuts presentation state and existing command availability.                                                   |
| `frontend/src/logic/adapter/`                        | The bridge boundary, request pacing, event subscriptions, service wrappers and the native `ClipboardPort`.                                        |
| `frontend/src/logic/store/`                          | A disposable Redux projection of backend state; it is not the source of truth.                                                                    |
| `frontend/src/logic/store/appModelProjection.ts`     | Initial hydration, ordered state-patch delivery and authoritative metadata recovery after revision gaps.                                          |
| `frontend/src/logic/store/readingSlice.ts`           | Transient, never-persisted Reading mode window state: the active flag and the sidebar and tab-bar overlay flags.                                  |
| `frontend/src/logic/store/workspaceSlice.ts`         | Disposable projection of the workspace snapshot and local tree-reading state.                                                                     |
| `frontend/src/logic/actions/actionRegistry.ts`       | The action catalogue and availability decisions used by every command surface, including Markdown hydration, document and tidy-operation state.   |
| `frontend/src/logic/actions/editorActionExecutor.ts` | The sole editor-action owner for dispatch, clipboard, formatting, selection snapshots and focus restoration.                                      |
| `frontend/src/logic/format/formatting.ts`            | The inline wrapper-stack resolver and formatting runner called by the editor-action executor.                                                     |
| `frontend/src/logic/markdown/`                       | Markdown standards, rendering pipeline, sanitization, code highlighting, math, diagrams, headings and shared link classification.                 |
| `frontend/src/logic/markdown/mermaid/`               | Serialized Mermaid theme/render queue, isolated realm, SVG scrubbing and bounded cache.                                                           |
| `frontend/src/logic/tidy/`                           | Pure Format, Compact and Lint engine plus its cancellable module worker.                                                                          |
| `frontend/src/logic/operations/`                     | Per-window tidy operation slot and ephemeral problem summary.                                                                                     |
| `frontend/src/logic/markdown/linkPolicy.ts`          | Link classification before a preview or editor link action is dispatched.                                                                         |
| `frontend/src/logic/scrollSync/`                     | The block-level scroll map, the synchronization controller, the scroll-port types and the preview scroll port.                                    |
| `frontend/src/logic/hooks/useScrollSync.ts`          | Synchronized-scrolling activation and which pane the other aligns to when it starts.                                                              |
| `frontend/src/ui/widgets/editorSession.ts`           | The document-identity-bound active editor command seam, including Monaco focus restoration.                                                       |
| `frontend/src/ui/widgets/useEditorActionExecutor.ts` | Binds the central editor-action executor to toolbar, popup and editor-shortcut UI surfaces.                                                       |
| `frontend/src/ui/widgets/Menubar/`                   | File, Settings, View, About and narrow overflow menu composition.                                                                                 |
| `frontend/src/ui/widgets/DocumentTabs/`              | The DocumentTabs consumer of TabBar and tab-specific commands.                                                                                    |
| `frontend/src/ui/widgets/WorkspaceTree/`             | Sidebar tree, header controls, empty and unavailable states, context menu and create-entry prompt.                                                |
| `frontend/src/ui/widgets/FormattingToolbar/`         | Formatting groups, arrangement control and Bar overflow.                                                                                          |
| `frontend/src/ui/widgets/EditorStage/`               | Editor/preview panes, arrangement, the `reading` presentation variant, preview accessory state and synchronized scrolling.                        |
| `frontend/src/ui/widgets/ReadingControls/`           | Reading mode hover- and focus-revealed Exit, sidebar and tab-bar controls and their overlays.                                                     |
| `frontend/src/ui/widgets/PreviewContextMenu.tsx`     | Preview and Reading mode context menu (Copy, Select all) built from the action registry.                                                          |
| `frontend/src/ui/widgets/useReadingPresentation.ts`  | Reading mode Escape and focus handling: closes an open overlay first, then leaves Reading mode.                                                   |
| `frontend/src/ui/widgets/ProblemsPanel/`             | Accessible presentation of active-document lint findings; activation returns through the guarded editor command seam.                             |
| `frontend/src/ui/widgets/dialogs/`                   | Settings, About, Shortcuts, close, conflict and normalization dialogs.                                                                            |
| `frontend/src/ui/widgets/StartupFailure/`            | Per-step startup failure, Retry and Quit.                                                                                                         |

## Shared UI owners and consumer inventory

The following inventory is part of the ownership contract. A change to one shared component must be
visible in all of the listed consumers and must stay within the component's layer. Components and
primitives take props or local primitive context; they do not import the store, adapter or action
registry.

### Popup — `frontend/src/ui/components/Popup/`

Popup owns the portal, open/close lifecycle, Escape and outside-pointer dismissal, focus restoration,
menu navigation, collision handling and frame-bounded placement (a popup that does not fit above or below
pins below its anchor and scrolls within the frame, measured from its natural height). It portals into the document body
with fixed viewport coordinates, uses an 8 px application-frame collision margin, and supports
trigger, point and bounds anchors. The body portal keeps floating surfaces outside the application
frame's backdrop root so their blur samples the document content beneath them.

Consumers: File menu, Settings menu, View menu, About menu, narrow menubar overflow, tab context menu,
workspace tree context menu (point-anchored), editor context menu, preview context menu, formatting-toolbar overflow and the
StatusBar Document details disclosure.

Popup establishes initial focus once after placement; moving an open popup (for example when a theme
changes the bundled font metrics) preserves the user’s current control focus.

### MenuItem — `frontend/src/ui/components/MenuItem/`

MenuItem is the single owner of popup-row typography, minimum height, padding, alignment, hover,
keyboard focus, disabled presentation, selection marks and accelerator placement. Shared defaults
live in `frontend/src/ui/styles/tokens.css`; rows can grow for larger content. Popup owns the surface,
section labels and separators, without a competing row style.

Consumers are File (including indented recent/reopen rows), Settings (Theme and Appearance radios,
value rows and switches), View, About, narrow menubar overflow, tab, editor and preview context menus, and
formatting-toolbar overflow. Recent/reopen rows retain their indentation with the same typography
and vertical spacing. The Shortcuts dialog also reuses the shared accelerator formatting helper.

MenuItem forwards its native button ref and accepts native button handlers. Checked rows display the
shared Icon checkmark unless a custom trailing control is supplied. `MenuItemIndicator` also presents
selection on value-only rows without changing their unavailable menu-item semantics. A custom
Segmented renderer maps the provided `onClick` to `onSelect`; MenuItem respects prevented key events
so radio activation occurs once.

### Bar and Island

`frontend/src/ui/components/Bar/` owns horizontal framing, slots, alignment and measured overflow.
Its consumers are the Menubar, the TabBar and the FormattingToolbar. Menubar uses its scroll policy,
TabBar keeps horizontal scrolling, and FormattingToolbar uses the menu policy below its accepted
breakpoint. Bar removes overflowed groups from layout while retaining their measured widths by item
key, so repeated measurements keep the same overflow decision until the available space changes.

`frontend/src/ui/components/Island/` owns a labelled visual group. Its consumer is the formatting
toolbar's text, heading, list, insertion, tidy-action and arrangement groups. The tidy-action
group never overflows, so its running action's Cancel remains reachable. The arrangement Island
provides only layout and labeling, with Segmented owning
its single visible frame and selected-option treatment.
In `OverflowMenuContext`, the FormattingToolbar renders relocated actions as MenuItems with visible
labels, icons and registry-derived shortcuts. Its groups stack vertically without Island paint or
padding; dispatch, availability and selection-preserving mousedown stay with the action widget.

### ToolButton and Button

`frontend/src/ui/primitives/ToolButton/` owns icon/text variants, disabled, pressed and checked states,
selection-preserving mousedown and the square icon-only shape. Its consumers are the FormattingToolbar
and the workspace tree header (Refresh, New entry, Show hidden folders toggle, Collapse all and Close
folder); Menubar also uses ToolButton for its outlined sidebar and assistant controls. Their surrounding
surface treatment belongs to the Menubar; TabBar owns its close/add controls.

`frontend/src/ui/primitives/Button/` owns primary, secondary and quiet buttons. Its consumers are the
dialogs, toasts, Launcher and the sidebar empty state's Open Folder button.

### TabBar — `frontend/src/ui/components/TabBar/`

TabBar owns document tabs, horizontal scrolling, drag reorder, add and close controls, the context-menu
anchor and the tablist keyboard model. Its consumer is DocumentTabs. Theme differences such as radius,
padding and underline are tokens, not alternate tab implementations.
The stationary full-width TabBar frame owns the divider and Glass backdrop. Its constrained inner
tablist owns scrolling and never paints a second surface; only the selected tab and the compact
outlined add control have intentional fills.

### Pane — `frontend/src/ui/components/Pane/`

Pane owns the header, identity, body and accessory slots. Its consumers are the editor pane and preview
pane; a paused or failed preview banner arrives through the explicit accessory slot.
Pane paints each document surface once. Preview content and the generated Monaco editor, gutter and
minimap backgrounds remain transparent. Material panes have small local elevation; Minimal panes stay
flat. Monaco widget backgrounds retain their own surfaces and its focus color follows the theme accent.

### Sidebar — `frontend/src/ui/components/Sidebar/`

Sidebar owns side, width, collapsed state, minimum width and resize callbacks. Its consumer is the
workspace panel (`WorkspaceTree`); the reserved assistant panel remains a future consumer. The acknowledged, pending or
refused width is supplied by `frontend/src/logic/store/uiLayoutCommands.ts` and is never inferred from
notification text.

Sidebar and the editor/preview SplitDivider share `useHorizontalResize` for pointer capture,
tracking, release and cleanup; each consumer owns its units, limits and keyboard behavior.
EditorStage owns the split layout and its temporary drag projection. The divider appears only
with both panes side by side, exposes a localized separator with a 20–80 percent editor share,
and supports 2-percentage-point arrow steps plus Home/End. Cancellation restores the starting
share; changing documents, hiding a pane or entering the narrow layout clears uncommitted state.
The committed `DocView.splitRatio` belongs to the backend and survives arrangement changes.

### ModalShell — `frontend/src/ui/components/ModalShell/`

ModalShell owns modal portal, backdrop, focus trap, Tab/Shift+Tab, Escape, opener restoration and
dismissal policy. Its consumers are Settings, About, Shortcuts, Normalization, Close, External change,
Recovery, Create workspace entry, Replace workspace, Multi-folder drop and Close folder dialogs.

### Banner — `frontend/src/ui/primitives/Banner.tsx`

Banner owns the shared inline warning presentation. Its consumers include the workspace unavailable
state.

### Segmented and Icon

`frontend/src/ui/primitives/Segmented/` owns radio semantics, roving focus and Arrow/Home/End
navigation. Its consumers are the FormattingToolbar arrangement control, the Settings menu Theme
and Appearance groups and the radio groups in SettingsDialog. Optional `renderOption(option,
buttonProps)` supplies custom presentation without the standalone segment styles. The renderer must
forward the native button ref, radio state, tab index and handlers. Selection and focus move only when
the controlled value acknowledges a request, including after theme changes. Without a renderer,
Segmented retains its default presentation for toolbar and dialog consumers.

`frontend/src/ui/primitives/Icon/` is the only glyph source. Its consumers are Menubar, FormattingToolbar,
TabBar's close/add controls, MenuItem selection marks, the preview file glyph, StatusBar, dialogs and Launcher.

### StatusBar and Notifications

`frontend/src/ui/components/StatusBar/` owns fact rows, drop priority, save identity, transient state
and the Details Popup. Its consumer is the shell's status surface.

`frontend/src/ui/components/Notifications/` owns the single non-blocking notification surface. Its
consumer is the application shell; save failures, refused links and stuck-call notices enter through
this one mount.

### Markdown settings consumers

`internal/settings/model.go` owns `DefaultSettings()` and is the sole source of Markdown defaults.
The Settings dialog and Settings menu edit the same hydrated backend group through the existing
settings command owner; the Redux projection has no fallback Markdown values before hydration. Format,
Compact and Lint availability comes from the shared action registry and command owner. ProblemsPanel
and StatusBar read the same ephemeral active-document findings summary; neither owns a second lint
result store.

### Rendering and theme owners

`frontend/src/logic/operations/operationSlot.ts` owns the per-window ephemeral slot for Format,
Compact and Lint, outside the backend projection. It exposes stable snapshots and subscriptions;
`frontend/src/logic/operations/useOperationSlot.ts` connects those snapshots to React. Acquisition
excludes another run until release, abort signals cancellation without releasing the slot, and old
handles cannot affect a later run. Progress becomes visible immediately above 1 MiB or after one
second, retaining the latest completed-chunk counts until then.

`frontend/src/app/TidyCommandsProvider.tsx` mounts the single tidy command owner beneath the
guarded editor session. `AppWorkflows` runs beneath that provider so toolbar commands and explicit
write/close workflows share the same tidy lifecycle and operation slot. `AppContents` retains bootstrap,
document-session and native shutdown ownership. `useTidyCommands.ts` snapshots the active editor text, activation-bound
commands and Markdown preferences, acquires the operation slot using UTF-8 text size, and releases
it after one terminal outcome. Editor changes reach this owner from the actual `EditorStage`
`onChange` path immediately after buffer synchronization. A changed text, activation, close or
reload invalidates a pending result even if the user later returns to the same text. The owner
subscribes to projected active-document identity changes so an intervening switch invalidates a
run even when multiple projection updates share one React render; a content revision for the
same active document leaves the editor session intact. The owner
applies edits through the guarded editor handle, localizes the first 1,000 lint markers and
publishes the exact findings and count through `logic/operations/problemsSummary.ts`. The summary
is an ephemeral subscribed store for the active document: edits mark it stale without removing
markers; activation or close clears it. User runs report refused, cancelled, failed and stale
outcomes through localized notices; on-save runs return the outcome without those notices.

`AppShell` subscribes to the problems summary and checks its document identity against the active
projection before showing the exact status count. `AppWorkflows` owns one transient problems-panel
visibility value shared by the View menu, status control and panel close button. `EditorView` docks
the prop-driven `ProblemsPanel` below the editor stage; row activation uses the guarded document
command seam to move the caret and focus the editor, first restoring the editor arrangement when
the document is in preview-only mode. The panel renders up to 10,000 ordered findings and reports
any remaining count without truncating the status total.

The action registry now exposes Format, Compact and Lint on the toolbar, editor context menu,
Format menu and editor-scoped shortcuts. Its availability check distinguishes loading settings,
no document, read-only Format/Compact and a busy operation slot; read-only Lint remains available.
`editorActionExecutor.ts` invokes the single tidy command owner and maps its terminal outcomes
into dispatcher results. The Format menu uses the captured editor session even after the popup
takes focus. The operation slot's kind and visible progress replace the matching toolbar or
Format-menu action with Cancel; the toolbar's never-overflowing control also serves runs started
from context menus or shortcuts. Feature 006 leaves the command palette, Assistant, Export PDF and
image insertion deferred.

`frontend/src/logic/tidy/` owns source tidying independently of Monaco, Redux and the bridge.
Its pure engine uses the shared Full syntax parser, computes sorted non-overlapping edits, and
refuses a changed chunk when its normalized Markdown tree differs. Compact preserves protected
source and hard breaks while removing redundant blank lines and trailing whitespace. Format adds
preference-aware bullet and emphasis markers, strong markers, block spacing and a final newline; shared
mdast predicates keep adjacent lists and nested delimiters stable without re-indenting lists. Heading
style conversion is limited by safe reparsing, and table padding uses display width while preserving
cell text, row cell counts and container prefixes. Safe heading boundaries divide larger inputs; source offsets
remain indices into the original text. Definition-shaped candidates are confirmed with the Full parser;
ambiguous container-fence contexts use its code ranges before selecting boundaries.
Lint shares the Format rule predicates and reports exact totals across chunks. It skips inline
marker findings inside table cells, where changing delimiters can alter the parsed table, and
reports a heading-style finding only when the shared safe heading conversion can perform that
change without changing the parsed tree.
The client lazily starts a dedicated module worker, forwards completed-chunk progress, reuses a
completed worker, and terminates a cancelled worker. Vite builds the client as an explicit entry
so the production client and worker are available independently of interface integration. The dev
optimizer prebundles the worker's direct width and character-classification dependencies so its first
lazy run cannot reload the active editor.

`frontend/src/ui/components/CodeEditor.tsx` owns the visible Monaco working copy and publishes its scroll
port for synchronized scrolling. Its handle applies LF-indexed tidy edits as one undo group, retains the
caret's logical line, navigates and focuses the editor, and maps component-owned lint markers to Monaco's
`gme-lint` marker owner. `frontend/src/logic/hooks/useDocumentCommands.ts` guards these operations by
document id and activation token; Monaco stays inside the editor component and its lazy setup, which loads
the marker hover contribution. The pinned Monaco marker-decoration service draws only the first 500
model markers, so CodeEditor supplements markers 501–1,000 with one cleared-on-update decoration
collection while retaining all 1,000 model markers for diagnostics. CodeEditor renders validation
markers on read-only files and hosts Monaco's
overflow hover outside the clipped pane. CodeEditor measures Monaco once at mount before publishing editor
readiness, because native WebKit can initially report a 5-pixel viewport inside a full-sized pane;
Monaco's automatic layout handles later resizes. Generated themes give the hover the existing elevated
surface color, and CodeEditor's hover style applies the shared blur token; other Monaco widgets keep their
surface colors.

Monaco's bundled Find contribution owns the in-editor Find/Replace widget, navigation, search
options and replacements. CodeEditor's typed search methods are guarded by the same document
and activation-token seam; registry-owned Find (Ctrl/Cmd+F) and Replace (Ctrl/Cmd+R) shortcuts
invoke the native actions without returning focus away from the widget. Monaco's standard
Replace shortcuts remain available. Find is nonmutating and works on read-only files; Replace
requires a writable editor. Replacement edits use the normal buffer synchronization and undo
history. No search service or second content owner is introduced.

The editor is paired with
`frontend/src/ui/components/MarkdownView.tsx`, which owns
sanitized preview rendering; each rendered block carries a numeric `data-source-line` annotation that the
sanitization allowlist admits only as a positive integer. `frontend/src/logic/markdown/headings.ts` extracts
Markdown heading text, slugs and source lines from the shared syntax rules, then assigns preview ids only to
matching Markdown headings after sanitization. Its preview scroll helper finds the first exact id inside the
preview container, including author-supplied raw ids; the link classifier decodes anchor fragments once before
that lookup. `frontend/src/logic/markdown/syntax.ts` owns the Full-only container syntax and rewrites known
admonitions into blockquotes; its alert step converts sanitized marker blockquotes into note elements.
`MarkdownView.tsx` maps those elements to the props-only `AlertBox.tsx`, which supplies localized titles,
shared icons and token-based styling. Unknown containers remain literal and are excluded from heading
extraction by the same syntax transform. The frontend theme generator produces the editor
and highlight output from the token families in `frontend/src/ui/styles/tokens.css`. `monacoSetup.ts`
stays lazy and registers individual fenced-language contributions through asynchronous token providers,
with explicit aliases and in-repository JSON, diff, makefile and Mermaid grammars under
`frontend/src/ui/components/monaco/`. The generator resolves inherited qualified Monaco token rules
from the same highlight palette across all six theme and mode combinations, so base-language selectors
remain consistent with the shared syntax colors. `CodeEditor.tsx` applies the root palette after
Monaco mounts and forces a view repaint after palette changes, so unfocused lines do not retain
token color ids from the previous palette. This does not change editor content, selection or undo. The preview
pipeline uses `frontend/src/logic/markdown/highlight.ts` for its explicit fenced-language registry and
200,000-character guard; `MarkdownView.tsx` loads the generated unscoped highlight rules, which follow
the active tokens without re-parsing the document.

`pipeline.ts` caches each standard's preview plugin lists. `MarkdownView.tsx` passes the current source
to `createPipeline(standard, source)`, which omits only the GFM extension when a conservative scan finds
no possible table, task, footnote, strikethrough or literal-autolink marker. Pipes, tildes, email/protocol
markers, `www.`, footnotes, checkbox openers (including multiline markers), HTML, entities and escapes
retain the full GFM parser.
The prose variant keeps front matter, Full math and containers, and every rehype transform, including
sanitization, source lines, link metadata and render limits. Calls without source retain the original
pipeline; `syntaxPlugins` and its heading, tidy and editor-link consumers keep the complete syntax set.

The Full syntax list also registers `syntax/mathStrict.ts` for bounded single-dollar math.
`renderLimits.ts` counts sanitized formulas in document order and replaces sources over 10,000 characters
or formulas after the first 1,000 before `math.ts` invokes KaTeX with trust disabled and bounded expansion.
Shared formula-scope discovery and preformatted text extraction match KaTeX's input, including sanitized raw
HTML and enclosing preformatted elements. The same source supplies local error markers; display output
preserves source-line annotations.
`MarkdownView.tsx` supplies localized limit messages and token-based error styling. `PreviewPane.tsx` loads
that renderer through a lazy boundary with the existing localized loading state, so its KaTeX dependency
remains outside the entry bundle. The Vite configuration keeps all KaTeX fonts local, external to CSS, and
woff2 only; retained previews continue through pause, resume and local rendering failures.

The sanitized render-limits step also numbers Mermaid fences in document order at every Markdown standard.
`MarkdownView.tsx` replaces each numbered fence with the props-only `MermaidBlock.tsx`, preserving its source-line
annotation. The component enforces the 50-diagram and 50,000-character limits, observes root theme and mode
changes, aborts stale requests and keeps the preceding SVG visible during redraw. The shared queue under
`frontend/src/logic/markdown/mermaid/` serializes each theme configuration and render, caches up to 50 scrubbed
SVGs by source and resolved theme snapshot, and reports exact engine errors. Mermaid executes inside a persistent,
measurable offscreen iframe that loads a bundled local module under a restrictive CSP before any diagram code runs;
the queue retains ownership of scheduling, retries and cancellation. The SVG scrub removes executable elements,
external references and resource-bearing CSS before insertion. Each mounted block namespaces SVG
ids before insertion, so cached duplicate diagrams have independent references. The existing preview scroll
port observes asynchronous SVG insertion and re-measures its source-line geometry.

All appearance values come from `frontend/src/ui/styles/tokens.css`. The three themes and light/dark
values are selected on the document root. Widget stylesheets do not select themes and portalled
surfaces inherit the root attributes.
Popup and ModalShell share dedicated floating-surface background and backdrop-filter tokens.
Liquid Glass floating surfaces use strong frost in both appearances; these tokens do not change
the application-wide blur or the solid Material and Minimal surfaces.
`frontend/src/ui/styles/base.css` paints the application tint and optional Glass highlight/backdrop
on `.application-frame`, above the body canvas. Header and status rows show that continuous app
surface; the status row adds only the theme backdrop. Surface opacity must not depend on tab count,
scroll position, or a screenshot-only layout.

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
  `scripts/test all` runs them in order. `scripts/test e2e -- <Playwright file/grep/worker/repeat options>`
  selects cases through the same runner and report path; an unfiltered run retains the complete suite.
- `scripts/verify` runs Lint, Format check, Build, Unit, Integration and E2E in that order.
  `scripts/verify lint` and the other stage names run one stage; `scripts/verify --skip e2e` records
  E2E as skipped rather than passed. Every stage prints its header and keeps human-readable runner
  output visible; structured lint and Go test reports are captured, parsed and summarized without
  dumping machine-readable JSON. Unit and Integration print separate Backend and Frontend counts,
  and E2E prints the frontend/browser count. A failed run marks later stages as NOT RUN.
- `scripts/format --check` checks the repository formatter set. `scripts/baseline` captures a full
  stage record, and `scripts/baseline --compare` fails closed when findings remain or a new finding
  appears. Verification run artifacts live under `.local_tmp_files/runs/`, of which only the 10 newest folders are kept
  (each new run prunes older ones, and stale `e2e-run-*` and `verification-test-*` folders over 24 hours old); the explicit baseline
  record lives under `.local_tmp_files/baseline/` and is created or compared only by
  `scripts/baseline`. The record is named after the checked-out branch (slashes become dashes), or after the short
  commit on a detached HEAD. Required reports that are missing or malformed are UNAVAILABLE or UNRELIABLE,
  never zero; warning counts do not fail a stage.
- CI (`.github/workflows/`): `push.yml` `verify` runs on `ubuntu-24.04` with the Linux Wails toolchain
  plus `lsof`, `xvfb` and `xclip`, and runs the complete `scripts/verify` including E2E under `xvfb-run`;
  `cross-platform-go` keeps the Windows and macOS Go tests. Caches: Go modules and build cache
  (`setup-go`), the Go tool binaries in `~/go/bin` (keyed by the pinned Wails, golangci-lint and shfmt
  versions; `scripts/build setup` skips `go install` when the installed module version already matches),
  Playwright browsers (keyed by the Playwright version in `package-lock.json`) and the ESLint cache
  `.local_tmp_files/cache/eslint` (`--cache-strategy content`, restored by prefix). Each job appends a stage
  timing table from `tools/verify/stage-timings.mjs` to `$GITHUB_STEP_SUMMARY`.
  `release.yml` does not repeat verification: it first requires a successful `push.yml` run for
  `GITHUB_SHA` (queried with `gh run list`) and fails otherwise, including for a commit whose push run was
  skipped by `paths-ignore`; a manual dispatch with `full_verify` runs the complete `scripts/verify` on
  macOS instead. Otherwise it runs only the macOS E2E subset, then builds and packages the application.
- CI failure uploads allowlist stage JSON records, logs, stderr captures, normalized and raw reports,
  Jest/Playwright/Go test reports and E2E failure screenshots, error contexts and traces from
  `.local_tmp_files/runs/`; compiler, linter, Jest,
  Playwright and TypeScript build-info caches (kept in `.local_tmp_files/cache/`) are not uploaded.

The E2E stage builds the standard Wails development executable and seed helper once, then starts two
owned frontend listeners for the run: Vite development assets for functional cases by default and
Vite preview of the built production assets for cases that select the shipping bundle, including
performance benchmarks. Its E2E-only Vite configuration extends the selected repository's
configuration and serves inert HTML to the hidden native host's `GET /` and `GET /index.html`
requests on both listeners, identified by Wails' `wails.io` user-agent marker. The browser is the
sole active React frontend for each case; its real Wails IPC and the native host's lifecycle and quit callbacks remain in use.
This avoids competing React clients hydrating and commanding one backend. Native webview rendering
remains part of the walkthrough.

Each case gets a fresh real Go/Wails process, profile, document folder, Playwright context and page
on its own localhost port. Startup checks that the child owns the port
with `lsof` and that the existing Wails getters observe backend initialization or an explicit startup
failure before loading React. A relaunch gracefully stops the old app and keeps that case's
profile, folder and browser origin. Final fixture disposal stops the owned app process group and
removes per-case state. `lsof` is required on Linux test hosts as well as macOS. The runner stops
both owned frontend processes and removes temporary state; `KEEP_E2E_ARTEFACTS=1` retains the
case and preparation files for diagnosis.

Playwright runs four kinds of cases through projects. `chromium` holds every case that is not timing-bound
and runs in parallel (CI: three workers; local: at most four and the available CPU capacity). Cases tagged
`@perf` (latency bounds, deadline-based rendering, large-document and cancellation timing) run in
`chromium-serial` with one worker, after `chromium`, so concurrent work never inflates a measurement;
a case that proves flaky under parallel load is moved there rather than loosened. The OS clipboard
writer cases (`@native-clipboard`) run in `chromium-native`, also serial and after `chromium-serial`.
Setting `E2E_SUBSET=macos` replaces these with a macOS subset (`pdf-export`, `launch-target` and `menus`
files, then the clipboard cases), which the release workflow runs on macOS. Playwright retries are zero.
CI allows 15 seconds for UI assertions rather than the local five seconds. Product performance bounds and
explicit assertion timeouts remain unchanged. Automatic failure screenshots, error contexts and app output are retained, while traces
require explicit `--trace` to avoid recording overhead in timing-sensitive tests.
The paced-typing performance check measures keydown-to-input latency against its existing 100 ms
guard, alongside the 300 ms input-to-preview bound. Inter-input gaps
remain diagnostic: Playwright's requested pacing also includes controller scheduling and browser
protocol round trips, so subtracting that pacing does not measure application responsiveness.
When `GOMARKEDIT_E2E_REUSE_DIST=1` and `frontend/dist/index.html` is newer than every input of
`vite build` (checked before the generators run), preparation reuses the bundle the Build stage left
instead of building it again; otherwise it builds. The E2E binary and seed helper are never shipped.
The E2E summary reports preparation, wall, app launch/relaunch and teardown times; these totals can
overlap and must not be added to derive wall time.

The Lint stage's owners are `tools/archlint/`, `frontend/eslint.config.js`,
`frontend/stylelint.config.mjs`, `tools/lint/tokens.mjs`, `tools/lint/repo-rules.mjs` and the declared
Go/TypeScript compilers. `tools/lint/bundle-scan.mjs` runs after the production build. A rule belongs
to one executable owner; prose explains intent but does not replace the gate.

### Markdown authoring walkthrough

For a feature-specific runtime check:

1. Open a document with a table, math formula, Mermaid fence and highlighted code fence; confirm its
   selected standard renders locally. Run Format, undo once, then run Lint and open a finding from
   ProblemsPanel.
2. Follow a supported local Markdown link from the preview and another from the editor to a target
   outside the source folder; confirm each target becomes active. Check that an existing unsupported
   local file offers Reveal and that network/device paths are refused.
3. Confirm remote images retain their placeholder. User-controlled remote rendering remains outside
   current scope. Record packaged-build and platform observations with feature closeout rather than
   inferring them from this map.

## Document lifecycle

### Opening and identity

Every file-entry route uses the application model's open flow. Supported suffixes are `.md`,
`.markdown`, `.mdown` and `.txt`, case-insensitively. Every open takes the document's persisted view,
then the last application arrangement, then Split, in both default open modes; a new document always starts
in Editor mode. With the Reading (Viewer) default the backend sets `readingMode` on an `opened` result (never
on `focused`, `refused`, `cancelled`, `folder-target` or a new document), and the frontend open commands
enter Reading mode when the open is still the current activation. A false flag never leaves Reading mode, and
the workspace tree's New File ignores the flag and leaves Reading mode.

Launch targets are the one non-interactive entry to that flow. A path from the command line or the
operating system reaches `ApplicationContextHolder.AcceptOpenRequest`; a window that is still starting
keeps the first one, and after bootstrap the frontend takes it once through `TakeLaunchTarget` and opens
a folder with the workspace command or a file with the recent-file command (D18). Every other external
path starts a new process.

`frontend/src/logic/adapter/` carries the request identity and `internal/file/` resolves canonical
paths and filesystem identity. A hard link focuses the existing document identity instead of creating
a second tab. The file owner acquires metadata and identity through one platform-specific
stat operation: device/inode on POSIX and volume serial/file index on Windows. Windows reads
metadata and identity from the same handle, opened without content access and sharing read, write
and delete access. It follows symlinks and normalizes relative and long drive/UNC paths before
opening the handle. Identity acquisition failures remain errors; only a missing candidate may use
a path identity. Disk versions serialize the same filesystem identity so a replacement with matching
size, timestamp and permissions remains detectable. Invalid UTF-8 or NUL-bearing input becomes clearly read-only and is never converted.
UTF-8 BOM, uniform LF/CRLF and the original bytes remain stable. Mixed endings are editable but require
the one-time, revision-bound normalization authorization before any write.

The file owner also decodes local Markdown link targets and exposes the same filesystem identity for
existing files and directories. `internal/appmodel/preview_link.go` passes supported local targets
through Open. Its result may carry a file-manager reveal path for an unsupported file or a tree path
for a target already present in the bounded workspace snapshot. The workspace lookup compares
symlink-resolved paths and uses filesystem identity for case-only path segments; filtered and
truncated entries have no tree path.

### Backend truth and frontend working copy

`internal/appmodel/lifecycle.go` owns one record per open document, including path identity, revisions,
dirty state, write coordination and per-document resources. `internal/appmodel/publish.go` is the one
publication path: it snapshots under the model lock, emits after unlock and rejects stale publication
identities. Disk I/O stays outside the model lock, and disposal releases all per-document resources.

`frontend/src/logic/store/appModelProjection.ts` owns initial Redux hydration and content-free state
patch delivery. It holds patches after a revision gap and coalesces one existing `GetState` call to
recover authoritative metadata, then drains contiguous queued revisions. A full snapshot may repair
metadata at the current revision; stale or duplicate partial patches remain rejected. Recovery does
not install an active buffer or replay a command. A failed recovery can retry on a later state event,
and disposal ignores late recovery results. The active Monaco buffer is the only frontend working
copy and is not the backend source of truth.
`appModelAdapter.ts` coalesces editor content for 50 ms and restorable cursor, selection and scroll view
changes for 200 ms. Only backend-accepted buffer generations reach live preview; lifecycle drains flush
both pending queues in order.
`frontend/src/ui/widgets/editorSession.ts` binds commands to the expected document identity and session;
its results explicitly distinguish available, unavailable and document-mismatch outcomes.
`useDocumentSession` owns the installed buffer and clears it when the projection has no active document
(including the empty-string wire representation). An activation generation is captured before each
activation or reload command. The guard waits for the matching document and projection revision,
rejects superseded acknowledgements and installs each accepted generation once. Only an accepted
reload advances the editor epoch; an ordinary Save retains the Monaco model, undo history, selection
and focus. No separate reload context is needed.

### Editing, saves and conflicts

The document-command seam supplies selection, replacement and replacement of the whole document. A
format or assistant proposal becomes one editor edit and then follows the ordinary dirty, save and
autosave path. Autosave is allowed only for an existing saved file; a never-saved buffer is not silently
written.

`internal/file/atomic_replace.go` owns atomic replacement. Before the replacement commits, failure
leaves disk and the old baseline unchanged. After it commits, the model records the exact written
baseline even if patch delivery fails; the adapter rehydrates before accepting further mutations and
does not repeat the write. `useDocumentWrites` repairs the Redux projection from the recovered
snapshot; it does not reinstall editor content or advance activation generations.

External changes are classified before saving. Editable conflicts offer Reload or one exact-version
Keep mine authorization. Read-only conflicts offer Reload only. Close plans gather all required choices
and normalization authorizations before writing, save in authoritative tab order, stop at the first
failure, and close tabs only after all requested saves succeed.

Feature 009 replaces the historical first-hunk conflict excerpt with complete transient canonical
On disk and Yours versions. Each side reports its complete logical line count (one plus LF count).
On disk bytes come from the stable physical file read, including BOM and physical line endings.
Yours bytes describe the expected saved encoding for the exact editor revision through the existing
save encoder, without formatting, writes or new normalization authorization. A null byte count has
a typed unavailable reason: normalization-required, unsupported-encoding or unsafe-content.
These values are not persisted and remain bound to the detected disk version and editor revision.
The bundled read-only Monaco comparison renders whitespace changes and supports navigation and
virtualized scrolling. Long lines wrap without a rendering cutoff. Monaco layer hints are disabled
for the comparison to keep text visible inside frosted dialogs in native WebKit. Computation is limited to five seconds; incomplete highlighting is surfaced
while both complete versions remain available. Metadata-only differences retain version statistics
without showing an identical content diff. The existing document read limit remains unchanged.

The app workflows keep their own mutually exclusive states. A write retains its original Save or
Save As intent and target through normalization and conflicts. A close retains its original tab kind
and target IDs, or its native close ID, through preparation, decisions, execution and cancellation.
Accepted normalization tokens are remembered by the close workflow so a backend plan retaining a
confirmed token does not prompt twice. Classified retries request fresh revisions while preserving
that original intent and target set; stuck-command retries reuse the existing bridge request identity.

Explicit Save and Save As run the enabled Format before flushing the working copy and reading its
revision, then run the enabled Lint after successful write reconciliation. Tidy refusal, cancellation,
failure or stale results leave the write safe; Format skips report their reason and busy Lint is silent.
Backend autosave does not run either operation. `useDocumentWrites.saveForClose` holds one continuation
through write-owned normalization and conflict decisions; recovery blocks successful close continuation.
An active close Save cancels the old revision-bound plan and prepares a fresh one only after safe
write completion. It flushes again after Lint and checks that the active document is clean at the
exact written revision. `EditorView` makes only the editor stage inert throughout close processing;
programmatic Format edits and the sibling toolbar progress/Cancel remain available. Remaining choices
require the original target identities and content revisions;
window/quit also requires the original open-tab set. Background Saves retain the backend close batch.

`AppDialogs` mounts one conflict prompt. `useWorkflowPrompts` applies Close → Save → foreground
priority, exposing only the close-owned write prompt while the close waits in `saving-active`. Hidden requests retain their workflow identity: writes are revalidated before resuming,
foreground comparisons are checked again before display, and requests for closed documents are
removed. A failed write recheck keeps its intent hidden and offers a fresh validation Retry;
dismissing that failure releases it, and saving another selected document never redirects to it.
A failed foreground recheck remains hidden until a later focus/resume check succeeds. Cancelling a
higher-priority prompt does not authorize or start a deferred write. Shared
conflict commands only perform transport and guarded reload: write Keep mine continues the original
write, foreground Keep mine authorizes without saving, and close decisions continue the close plan.
Reload for a close-plan-owned background conflict cancels the old plan before preparing another
with the original targets. Reload for the close-owned active write carries the exact clean reloaded
revision into the same fresh-plan checks and completes the original close without overwriting disk.
It does not run post-save Lint or flush the editor while guarded reload installation is pending.
An ordinary pending write prompt is suspended inside the write owner while a close-owned write
runs, then restored and revalidated if its document remains open; cancelling the close never
authorizes or starts that earlier write.
Modal keyboard suppression and focus restoration remain with the existing UI owners.

### Links, files and images

`frontend/src/logic/markdown/linkPolicy.ts` classifies anchors, local document candidates, http/https
links and refused schemes. Before sanitization, `renderer.ts` captures original parsed anchor
targets in internal AST metadata, including drive-letter paths and web schemes with uppercase letters.
`MarkdownView.tsx` uses that metadata only for the shared click policy,
retains existing sanitized link addresses, and supplies an inert fragment link when an address was stripped.
The metadata is never an HTML attribute; unsafe addresses remain absent from rendered navigation attributes.
For a local document link, `frontend/src/app/useCommands.ts` flushes the
outgoing editor session, requests the backend Open flow and acknowledges the target's active buffer
through the guarded activation owner. It publishes a tab reveal and, when returned, a tree-row path
and heading-fragment request. Supported local Markdown documents open through this path from anywhere
on disk, including outside the source document's folder. The editor and visible preview consume each
fragment request once after the target session and preview content are ready. A self-link fragment
keeps the installed editor session; an existing unsupported file offers Reveal and is never launched.
Network and device paths are refused. The backend returns these outcomes in `OpenResult` from
`internal/apperr/results.go`: `RevealPath` carries an unsupported-file reveal target and `TreePath`
identifies a matching workspace row. `internal/appmodel/preview_link.go` sets those fields; the adapter
preserves them and `frontend/src/app/useCommands.ts` consumes them for the reveal notice and tree-row
selection. An http/https target goes to the system browser; classifier refusals produce one warning
without disturbing the page or editor session. ADR-0037 records removal
of the earlier document-folder limit; D11's single classifier and normal open flow remain in force.

`frontend/src/logic/markdown/editorLinks.ts` extracts editor link ranges and targets from the shared
Full Markdown parser, including reference definitions. A dedicated editor-link worker runs that parser
off the UI thread; its transport terminates each request on completion, cancellation or failure.
Failures produce one local diagnostic with a fixed reason, excluding document content, paths, URLs
and raw errors; normal cancellation stays silent.
The lazy Monaco setup registers an exclusive Markdown link provider, which excludes URLs inside code
from Monaco's default link detection. It caches successful results for an unchanged model version and
checks registration identity, request generation, version and cancellation before publishing an async
result. Superseding or disposing a model aborts its pending extraction. This worker is separate from
the tidy operation slot and protocol.
`CodeEditor` registers its mounted model's activation callback and disposes that registration with the
editor. Opaque link URLs identify the model, parsed generation and target; the opener checks the model
version before dispatch and consumes stale links. The provider is released after the last model
registration is disposed. A single opener remains for the application lifetime so abandoned hover
actions cannot send synthetic HTTPS addresses to the default browser opener. `PreviewPane` owns the shared activation dispatch used by preview
links and `EditorStage`; each widget supplies its own fragment scrolling or caret navigation.

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
call. `useShutdown.pendingClose` is the sole frontend pending identity consumed by
`useCloseWorkflow`; cancellation remains pending until its native acknowledgement arrives. Repeated
early, hydrated or live delivery of the same close ID starts one workflow. Recovery-discard
confirmation names only dirty documents.

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

Documents are file-first. Settings, Recent Items, window layout and per-document view state live in the
small SQLite key-value store opened by `internal/db/` at the platform configuration location under
`GoMarkEdit` or `GoMarkEdit-Dev`, in `settings.db`. The store uses the `settings(key, value, type)`
table, typed values, WAL and a five-second busy timeout so independent processes can share it. The
embedded migration is `internal/db/migrations/0001_settings.sql`; migrations are additive and never
rewrite existing data.

Settings, layout, recents and file metadata use `internal/kv/` and leave keys they do not own alone.
The `recent.files` key stores versioned v2 Recent Items with file and folder kinds; older file-only
values migrate into that list. `workspace.showHiddenFolders` stores the app-wide hidden-folders
preference. The workspace root and tree are session state and are not restored.
Layout changes write through immediately; continuous window resize is debounced and flushed during
shutdown. Shared state follows last-writer-wins by change time. Missing or invalid values fall back to
defaults. The Markdown group uses the six existing keys `markdown.standard`, `format.bulletMarker`,
`format.emphasisMarker`, `format.headingStyle`, `format.onSave` and `lint.onSave`; its defaults are
Full, `-`, `_`, ATX, Format on save off and Lint on save on. No migration or new table is needed.
No document content, credentials or API keys are stored in the settings database; a future provider
stores only an environment-variable name.

`internal/appmodel/file_metadata_repository.go` owns arrangement and split ratio together in the
existing version-one `document.view.<canonical-path-hash>` record. Missing, legacy or invalid
ratios default to 0.5; committed ratios must be finite and within [0.2, 0.8]. Explicit view changes
and Save/Save As write this metadata, including the destination path for newly saved documents.
Untitled ratios remain in-memory until saved. Routine cursor, selection and scroll packets omit
the ratio on the wire, preserving backend state without repeating persistence writes. Ratio-only
intents merge against the adapter's latest document view, preserving live editor state.
An accepted view change is retained when metadata storage fails; the existing asynchronous
error seam reports a persistence warning. A later explicit resize or Save retries storage.
This restores a reopened file's view preference, without restoring tabs or document contents.

The Markdown popup and Settings dialog use `useEditorSettings` and one settings command owner.
Queued Markdown writes read the latest acknowledged group before merging a patch; a rejected write
keeps the projection unchanged and reports an error notice. All six dialog controls and the popup
on-save rows stay unavailable until the backend Markdown group is hydrated.

The application opens clean: it does not restore a session or tabs, and it has no crash-recovery or
swap-file feature. Autosave touches only files that already exist on disk. Preview rendering uses the
latest accepted buffer from the editor synchronization path, including unsaved edits. Tidy snapshots
text from the guarded editor command API, so it also operates on the current editor working copy.
Worker progress, cancellation and lint findings remain ephemeral frontend state; explicit-save Format
and Lint use the same tidy command owner, while autosave runs neither.

## Packaged verification walkthrough

A packaged-build walkthrough is not a required close-out record for every change. For a release, run the packaged build on
the developer's host and record the release-specific result in the release notes. The build and release
workflow accept `X.Y.Z`, `X.Y.Z-alpha.N` and `X.Y.Z-beta.N`; tagged alpha and beta versions publish as
GitHub prereleases, while stable tags remain regular releases. Manual release dispatch builds an
artifact without publishing a GitHub Release. CI does not automate native dialogs or OS-level window
interaction, so use a feature-specific manual walkthrough when changes affect those surfaces.

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
15. Relaunch and confirm Recent Items and window layout persist without a false unsaved state.
16. Open a long document with headings, a code block, a table, a local image and footnotes in Split;
    scroll the editor and the preview by pointer and keyboard, and follow a preview anchor, then type
    near the end; confirm the other pane always follows to the same block without oscillating and that
    both panes reach the top and bottom together; turn Synchronized scrolling off in the View menu and
    confirm the panes scroll independently and that the choice survives a relaunch.
17. Open a folder in the packaged app and confirm the sidebar lists supported documents and folders;
    toggle Show hidden folders, refresh, and confirm dot-folders appear while dot-files stay hidden.
    Use Open Recent on both a file and a folder, then relaunch and confirm Reopen Last opens the newest
    recent item when nothing has been closed in that session.
18. Create a file and folder from the tree, use Reveal and Copy path on a tree row, and confirm the
    context menu offers no rename, move, delete or reorder action.
19. Drop a folder into a window with a folder already open; exercise Replace and New window, then
    close a folder through the sidebar and File menu, including Cancel and Keep tabs open.

### macOS association checklist

On an installed `.app` (copy to Applications, `lsregister -f` it, relaunch Finder if needed):

1. Open With for a `.md` file lists GoMarkEdit while the previous default application is unchanged.
2. Get Info > Open with GoMarkEdit > Change All makes double-clicking any `.md` file open it.
3. With GoMarkEdit not running, double-clicking a file shows it in the single window.
4. With a window showing `a.md`, double-clicking `b.md` opens a new window that shows only `b.md`.
5. Opening three selected files opens three windows, one file each.
6. Dropping a folder on the Dock icon opens a new window with that folder as workspace.
7. With the Viewer default, a double-clicked file starts in Reading mode and a dropped folder does not.

## Durable decisions

These decisions are carried forward from the accepted decision records and are restated here as current
architecture. The assistant records are intentionally listed separately because that capability is not
part of the current product.

| Record   | Current decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ADR-0001 | Use stable Wails v2 with a CGO-free Go backend and pure-Go SQLite. Native webviews and file association remain the platform boundary; D19 covers the macOS declarations.                                                                                                                                                                                                                                                                                                                                                                |
| ADR-0002 | Use Monaco for v1 source editing; keep CodeMirror 6 as a future contained alternative. Bundle editor workers locally.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ADR-0004 | Keep documents file-first and use a small SQLite KV store for settings, recents, layout and view state. Launch clean with no session restore or swap files.                                                                                                                                                                                                                                                                                                                                                                             |
| ADR-0005 | Use one token-driven layout with three built-in themes and light/dark modes; keep editor and preview appearance unified and do not support user-authored themes.                                                                                                                                                                                                                                                                                                                                                                        |
| ADR-0006 | Allow multiple independent instances; share the small settings database with WAL and busy timeout instead of a single-instance lock.                                                                                                                                                                                                                                                                                                                                                                                                    |
| ADR-0011 | The application is offline-first with no background network. Only an explicitly user-invoked request to the configured future provider may use a network; telemetry, automatic updates and unsolicited content fetches remain forbidden.                                                                                                                                                                                                                                                                                                |
| ADR-0013 | Persist application layout by write-through, with last-writer-wins change semantics and a debounced window-size write flushed on close.                                                                                                                                                                                                                                                                                                                                                                                                 |
| ADR-0014 | The Go backend owns live state; Redux is a projection and Monaco is only the visible document's working copy.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ADR-0015 | Derive releases from tags or an explicit version input, keep unversioned builds at `dev`, and derive platform icons from one source asset.                                                                                                                                                                                                                                                                                                                                                                                              |
| ADR-0017 | Coordinate backend canonical snapshots with a document-identity-bound frontend command session; neither seam impersonates the other.                                                                                                                                                                                                                                                                                                                                                                                                    |
| ADR-0021 | Active-buffer acknowledgements carry document identity and accepted revision; ordinary patches stay content-free, including the true zero-document state.                                                                                                                                                                                                                                                                                                                                                                               |
| ADR-0022 | Commit successful writes and resynchronize a failed projection; never pretend an irreversible replacement failed or repeat it.                                                                                                                                                                                                                                                                                                                                                                                                          |
| ADR-0024 | Apply one complete document lifecycle policy for open modes, suffixes, tolerant read-only input, line endings, normalization authorization, close plans and external conflicts.                                                                                                                                                                                                                                                                                                                                                         |
| ADR-0028 | The earlier custom title-bar/native-menu decision is superseded. The current product keeps the native operating-system frame introduced by feature 001.                                                                                                                                                                                                                                                                                                                                                                                 |
| ADR-0029 | Generate Monaco and highlight colours at build time from one pair of syntax-token families; runtime theme changes only swap generated names.                                                                                                                                                                                                                                                                                                                                                                                            |
| ADR-0030 | Derive raw-HTML sanitization from the selected Markdown standard; keep the explicit bounded allowlist, strict Mermaid security and KaTeX trust disabled. Superseded by ADR-0036.                                                                                                                                                                                                                                                                                                                                                        |
| ADR-0031 | Format and Compact use remark-stringify with the maximal parse plugin set; Prettier remains a repository development tool, not a runtime formatter. Superseded by ADR-0038; only the rule that Prettier is not a runtime formatter survives, and ADR-0038 restates it.                                                                                                                                                                                                                                                                  |
| ADR-0032 | Use one cancellable run registry and one deterministic shutdown order; a run has one terminal outcome and background panics are contained and logged. Refined by ADR-0039 for Format, Compact and Lint: the frontend operation slot is used and the run registry described here is not built; the single terminal outcome per run and contained background panics still apply.                                                                                                                                                          |
| ADR-0033 | Workspace file operations are additive only: create, reveal and copy path are allowed; rename, move, delete and tree reorder are refused.                                                                                                                                                                                                                                                                                                                                                                                               |
| ADR-0035 | `internal/workspace/` builds a bounded tree while `internal/appmodel/` owns each window's workspace session. New windows are independent processes; an explicit startup folder argument opens a workspace without session restore (D18 refines this: the argument is a file or a folder, taken by the frontend after startup). Trees change on open, create or manual refresh, with no watcher. Workspace operations remain additive only as in ADR-0033. The hidden-folders setting is app-wide.                                       |
| ADR-0036 | One raw-HTML policy applies at every Markdown standard: a bounded allowlist of raw HTML elements and Markdown-equivalent elements, removal together with their contents of executing, embedding, foreign-content and form elements, unwrapping of every other element, and no author-supplied style attribute, event handler, `javascript:` or `data:` address. Mermaid security stays strict and KaTeX trust stays off. Supersedes ADR-0030.                                                                                           |
| ADR-0037 | Preview links open supported Markdown documents anywhere on the local disk through the one shared link handler and the normal open flow. Network and device paths are refused on every platform. An existing local file with an unsupported suffix is refused with an offer to reveal it in the file manager and is never launched. The backend resolver decides containment, symbolic links and folder-tree rows. Replaces the document-folder link limit of the earlier link rule; D11's single classifier and normal open flow stay. |
| ADR-0038 | Format and Compact compute minimal source edits over the preview's parser with the Full syntax set, whatever standard is selected, apply them as one undo step and are refused when the result would render differently at the Full standard; Prettier stays a repository tool, not a runtime formatter. Lint shares the same parser and predicates. Supersedes ADR-0031.                                                                                                                                                               |
| ADR-0039 | Format, Compact and Lint share one per-window frontend operation slot: a single run at a time with progress and Cancel for long runs, held from its start until exactly one terminal outcome. The backend run registry of ADR-0032 stays unbuilt. Refines ADR-0032.                                                                                                                                                                                                                                                                     |

Feature 007 extends the document-view contract with a backend-owned per-document split ratio.
It uses the existing canonical-path file metadata record for durable preferences and the native
Monaco Find contribution for in-editor search and replacement. Shared pointer handling has one
owner, `useHorizontalResize`, consumed by Sidebar and SplitDivider. Temporary drag state never
becomes canonical document state, and metadata-write failure does not reject a published view
change; the existing asynchronous warning seam reports it. No content or session restoration is added.

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
- **D5 — One authority (superseded by D16):** the former `specs/` tree and this map were normative.
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
- **D13 — Scroll synchronization restored:** synchronized scrolling between the editor and the preview
  is restored at block granularity; the View menu's Synchronized scrolling preference defaults to on.
- **D14 — Versioned material (workflow parts superseded by D16):** the repository versions product code with its build and release
  configuration, tests, verification tooling, the README and agent instructions, the developer
  reference under `docs/reference/`, the former workflow constitution, this map, every feature's product
  definitions under `specs/` and this refactor's plan, tasks, research and quickstart. Workflow
  tool installs and their state, agent working documents, audits, archives, generated run records, Wails
  scaffolding that the Wails CLI regenerates, reference-only mockups, every feature's checklists and
  the planning records of earlier features are not versioned; Git history keeps their earlier
  copies. This decision supersedes D5's statement that delivery material is archived, planning
  decision 1's inclusion of archived material in the formatter scope, planning decision 7's
  retention of planning material (its reference material stays) and the legacy-source requirements
  of earlier feature specs; the superseded wording was removed from D5 and planning decisions 1
  and 7.
- **D15 — E2E invocation:** the real-backend E2E harness prepares the standard Wails dev executable
  and owned development and production-asset frontend listeners once per run, then starts an isolated
  application for each case. Functional cases use development assets by default; cases that select
  the shipping bundle use the production-asset listener. This
  supersedes the earlier per-case `wails dev` invocation in the real-backend E2E contract;
  application and browser state remain isolated, and the same canonical E2E stage runs full or
  targeted selection. Test transport keeps the browser as the sole active React frontend while
  retaining the real native host; production serving is unchanged.
- **D16 — OpenSpec is the only specification workflow:** it supersedes D5's `specs/` tree and the
  numbered-feature parts of D14, which are retired together with the former constitution and
  `specs/`. Current behaviour is reconstructed from the implemented application in `openspec/specs/`,
  and the nine earlier features are kept as archived changes under `openspec/changes/archive/`
  without replaying their deltas. Engineering rules live in `openspec/config.yaml`. Generated
  OpenSpec skills and commands under `.agents/` and `.claude/` are tool output refreshed by
  `openspec update`.

- **D17 — Reading mode is transient frontend window state:** it refines ADR-0014. Whether the window
  is in Reading mode lives in the frontend-owned
  `frontend/src/logic/store/readingSlice.ts`. The state is never persisted: it is not stored per
  document or across restarts, and it never changes a document's saved arrangement or the stored
  sidebar visibility and width. With the Reading (Viewer) default open mode the backend signals
  Reading-on-open to the frontend through `OpenResult.readingMode`, as described in the open-document
  flow above.
  The Reading width (Page or Full width, stored as `view.readingWidth`, `page` by default) is the
  exception to this transience: it is a persisted appearance setting owned by the Go settings
  service, projected into `settingsSlice` and applied as `data-reading-width` on the Reading stage,
  while Reading mode itself stays unpersisted.

- **D18 — One backend entry for paths from argv and the operating system:** `AcceptOpenRequest(path)` on
  `ApplicationContextHolder` is the only place such a path is routed. The holder keeps `startupOpen`
  (true from construction until `FrontendReady` runs), `targetAccepted` and the accepted `launchTarget`
  under `holder.mu`. A path is accepted while `startupOpen` and nothing was accepted yet; no model state
  is inspected, so an already-shown window never takes a later path. Every other path goes to
  `NewWindowLauncher.Launch(targetPath)` after the mutex is released, and a launch failure is published
  as a classified `state:error` ("A new window could not be opened.", Retry) through
  `ApplicationContextOptions.EmitEvent` (production: `runtime.EventsEmit`), or only logged before the
  lifecycle context exists. The constructor parses `StartupArgs` and passes the first argument that is
  not empty and does not start with `-` (macOS adds `-psn_...`), made absolute, to `AcceptOpenRequest`.
  The frontend hook `app/useLaunchTarget.ts` calls `TakeLaunchTarget` once when bootstrap is `ready`
  (bootstrap has already called `windowReady`, which closes `startupOpen`) and opens the result with
  `onOpenWorkspacePath` for a folder or `onOpenRecentFile` for a file, so the `OpenPath` checks, refusal
  notices, Untitled replacement and Reading-on-open of D17 apply unchanged. `TakeLaunchTarget` returns
  the target once and then an empty result; `Kind` is `folder` when the path is a directory at take
  time and `file` otherwise. `OnStartup` and `RetryStartup` open nothing, so a target accepted before an
  `Init` failure stays takeable after a successful retry. This supersedes the startup-folder open in
  `OnStartup` of ADR-0035. Rejected: single-instance forwarding (ADR-0006) and putting the target in the
  `GetState` snapshot, which races the projection's subscription.
- **D19 — macOS declares document types and receives Finder opens as events (macOS part):** the bundle plists
  `build/darwin/Info.plist` and `Info.dev.plist` carry a static `CFBundleDocumentTypes` (Markdown through
  `net.daringfireball.markdown`, Plain text `txt`, Folder `public.folder` as Viewer), all with `LSHandlerRank`
  Alternate, and a `UTImportedTypeDeclarations` entry for `net.daringfireball.markdown` (`md`, `markdown`,
  `mdown`). The entries sit outside the unused Wails `FileAssociations` template block. Alternate rank lists the
  app under Open With without taking any default; the user chooses with Get Info > Change All. Finder has no
  Open With for folders, so a folder is opened by dropping it on the Dock or application icon.
  `LSMinimumSystemVersion` is 11.0. Finder opens arrive as Apple Events, not argv: `application.Options.OnFileOpen`
  is set into `Mac.OnFileOpen` and `main.go` passes `applicationContext.AcceptOpenRequest`, so D18 routes them
  (first path into a starting window, every other path to a new window). The packaging test
  `tests/go/integration/packaging/associations_test.go` walks both plists and compares the declared suffixes with
  `file.SupportedDocumentSuffixes()`.
  The same event is delivered for a path in a spawned window's argv, so D19 adds three safeguards in
  `AcceptOpenRequest`: a window never opens another window for its own target, a path that a live window was opened
  for or that was launched in the last 10 seconds opens nothing, and no window opens while `MaxWindows` (50) are open
  (a classified error without Retry: "Too many GoMarkEdit windows are open."). Live windows are the pid files of
  `WindowRegistry` under `os.UserCacheDir()/GoMarkEdit/windows/`; entries of ended processes are ignored and removed.
  The registry holds launch targets, not documents opened later inside a window. Rejected: a spawn-depth counter, which
  also blocks legitimate chains of windows.
  **Windows part:** `build/windows/installer/project.nsi` replaces the Wails `associateFiles` macros, which write the
  default value of `Software\Classes\.<ext>` and so take over the default. Local macros register the
  `GoMarkEdit.Document` ProgID, add it under `.<ext>\OpenWithProgids` for the four suffixes, add
  `Applications\<exe>` with `SupportedTypes`, and add "Open with GoMarkEdit" verbs on `Directory\shell` (`"%1"`) and
  `Directory\Background\shell` (`"%V"`), all under `SHCTX\Software\Classes`; the uninstaller deletes exactly those
  keys and values and both sections notify the shell with `SHChangeNotify`. Windows 11 shows the folder verbs under
  "Show more options". `scripts/build` adds `-nsis` on Windows when `makensis` is on `PATH`. The packaging test scans
  the NSI lines. Explorer behaviour is not verified at runtime.
  **Linux part:** `build/linux/` holds `gomarkedit.desktop` (`MimeType` text/markdown, text/x-markdown, text/plain,
  inode/directory; `Exec=… %f`), `gomarkedit-mime.xml` (Markdown globs) and the POSIX `install.sh [--uninstall]`, which
  installs per user, rewrites `Exec=` and `Icon=` to absolute paths, refreshes the desktop and MIME databases and never
  runs `xdg-mime default` or edits `mimeapps.list`. `scripts/build` copies them and `build/appicon.png` next to the
  Linux binary. Declaring `text/plain` lists the app for every text file; unsupported ones are refused by D18. Linux
  desktop behaviour is not verified at runtime; `linux_install_test.go` runs the script with `/bin/sh` against a
  temporary `HOME`.
- **D20 — PDF export prints a hidden print copy through the native print dialog:** File, Export to PDF… and
  Ctrl/Cmd+P flush the active editor session and read the backend's copy of the text (`app/usePdfExport.ts`), so unsaved
  and Untitled text is exported. `ui/widgets/PrintDocument.tsx` renders that fixed text with the preview renderer, which
  is shared through `ui/widgets/LazyMarkdownView.ts` and `ui/widgets/previewImageSource.ts`, so limits, placeholders and
  the local-image resolver are the preview's and nothing depends on the arrangement, scroll position or a paused preview.
  The copy is portaled into `document.body` outside `#root` (so `PrintDocument.tsx` has a file-scoped ESLint portal
  override: the copy must be a child of `body`); `@media print` hides every other body child and the copy
  paints its own padding and background with `print-color-adjust: exact`. There is no `@page` rule: the spike showed it
  neither changes the macOS landscape page nor paints its margins. The hook polls every 100 ms until the copy has no
  `[data-print-pending]` element, no `[data-mermaid-state='pending']` diagram (`MermaidBlock` reports `pending`, `drawn`,
  `error` or `limit`; the last two count as settled) and every `img` is `complete`, or until 10 seconds have passed, ignores a second request while waiting, and then
  calls `ApplicationHandler.PrintWindow`, which reaches `runtime.WindowPrint` through `NativeWindowAPI.Print` (a no-op in E2E
  headless mode). The copy stays mounted, hidden on screen, until the next export or an active-document change.
  While the copy of a saved document is mounted, `PrintDocument` sets `document.title` to the file name without its last
  extension (`fileStemOf` in `ui/widgets/tabLabel.ts`) and restores the previous title when the copy goes away, because
  the print dialog suggests that title as the PDF name; Untitled documents keep the default title.
  `runtime.WindowPrint` is the only print path that works on macOS (`window.print()` does nothing there) and needs
  macOS 11, which becomes the minimum (`LSMinimumSystemVersion` 11.0). Known limitation: Wails hard-codes the macOS
  print dialog to landscape with zero margins and CSS cannot override it; the user switches to portrait in the dialog.
  `useShellShortcuts` calls `preventDefault` for a matched `export-pdf` before its availability checks so the webview's
  own print never runs on WebView2 or WebKitGTK (unverified there). Rejected: `window.print()`, printing the live
  preview pane, seeding the copy from `useLivePreview`, and a Go-side or bundled PDF renderer. D8 stays as written; it
  names no control. The PDF appearance setting (`export.pdfAppearance`, `styled` default or `clean`, carried in the
  appearance group) sets `data-print-appearance` on the copy; Clean redefines the colour tokens with the Material Light
  values in `tokens.css`, and `resolveMermaidTheme(element)` probes inside the element so diagrams are drawn light.

## Planning decisions retained

The seven planning decisions are part of the implementation record:

1. The formatter covers tracked source and documents, including SQL; migration application is owned
   by `internal/db` and is not compared against Git history by verification.
2. The unused icon-processing helper is removed while the canonical source and generated icon assets
   remain.
3. The late-completion test lever is a second process holding an exclusive transaction on the harness
   profile database, because a blocking document path is refused before reading.
4. The `justfile` is hand-maintained and excluded from the formatter because `just` is optional.
5. `scripts/build setup --with-browser` and the universal help flags are accepted convenience forms;
   they do not add stages or aliases.
6. The two archive-only race cases use throwaway tests in the archived worktree and public-interface
   tests in the refactored tree.
7. `docs/reference/` remains because it is retained reference material, not workflow tooling.

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
