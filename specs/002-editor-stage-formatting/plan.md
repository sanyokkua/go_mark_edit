# Implementation Plan: Editor Stage Chrome and Formatting

**Branch**: `002-editor-stage-formatting` | **Date**: 2026-08-03 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/002-editor-stage-formatting/spec.md`, the project
constitution, consumed Feature 001 contracts, and the specification's Owned/Consumed/Deferred
migration matrix.

## Summary

This plan delivers one dependency-complete Editor-stage vertical slice through the existing Go/Wails,
frontend adapter, Redux projection, identity-bound Monaco session, and React surface seams. It adds one
canonical action/shortcut registry; bounded Phase 04 inline and selection formatting; acknowledged editor
display settings; the mockup-shaped File/Settings/View/About chrome, visual tab presentation, sidebar
controls, toolbar overflow, context menu, and shortcuts dialog.

Format, Compact, and Lint are explicitly visible but unavailable in this slice. File operations, real tab
lifecycle, workspace enumeration, image/file paste behavior, rich-rendering expansion, Assistant/provider
behavior, and tidy-markdown document operations remain named downstream boundaries. No visual fixture is
allowed to create a fake backend success or hidden file/network dependency.

## Technical Context

**Language/Version**: Go 1.25.7; TypeScript 5.8.3; React 19.1.1

**Primary Dependencies**: Wails v2.12.0; Monaco Editor 0.52.2; Redux Toolkit 2.12.0; Radix dropdown
and toast primitives; React Testing Library/Jest 30; Playwright 1.61; existing pinned Markdown and
sanitization dependencies

**Storage**: Existing pure-Go `modernc.org/sqlite` KV settings store in WAL mode with additive,
forward-only migrations. Editor settings add typed keys through the existing `internal/settings` service;
no document, tab, file, workspace, Assistant, or renderer storage is added.

**Testing**: Go unit/service/handler/repository tests; Jest and Testing Library; adapter/dev-bridge parity;
Playwright at 1280/768/375 in all six palettes; `just archtest`; offline source/bundle guards; current-host
real-build walkthrough; reliable baseline and retained `just fmt-check`, `just typecheck`, `just lint`,
`just test`, `just frontend-build`, `just build`, and feature verification evidence

**Target Platform**: macOS, Windows, and Linux desktop. The ordinary OS-managed framed Wails window,
native movement/resize/title controls, and current-host native evidence remain consumed from Feature 001;
Windows/Linux native runtime repetition remains a whole-application completion gate.

**Project Type**: Single-process Wails desktop application with a Go backend and embedded React/TypeScript
webview

**Performance Goals**: Formatting remains bounded to the selected range/current line and one Monaco edit;
display-setting changes update Monaco in place without remounting or reseeding. The existing shell
acknowledgement and responsive timing thresholds remain consumed. Deferred Format/Compact/Lint never enter
the long-operation gate.

**Constraints**: Go/appmodel and the existing settings service own acknowledged state; Redux remains a
projection; Monaco remains an identity-bound working copy; Wails access is adapter-only; generated bindings
are regenerated, never hand-edited; all strings are localized; all colors use existing tokens; all controls
are keyboard reachable with visible focus and reduced-motion behavior; no background or unsolicited network;
no custom native title/drag/resize substitute; no production placeholder/no-op; no code or `docs/delivery/`
changes are part of this planning turn

**Scale/Scope**: 27 feature requirements; four user stories; 18 automated browser combinations (3 widths ×
6 palettes); five named live cases; one current writable document; three editor font sizes; at most one
visual tab fixture and no canonical tab lifecycle

## Constitution Check

*GATE: PASS before Phase 0 research. Re-checked and PASS after Phase 1 design.*

| Principle | Planning application | Result |
|---|---|---|
| I. Normative specification is the authority | The active `spec.md` owns behavior; `docs/delivery/spec/surface/mockup.html` remains read-only visual authority; every migrated source row remains Owned, Consumed, or Deferred. No normative file is changed. | PASS |
| II. Self-contained vertical slices | Six ordered plan slices name concrete paths, dependencies, complete owned requirements, and direct tests/live cases. No task requires an implementer to invent File, tab, renderer, Assistant, or tidy behavior. | PASS |
| III. Backend authority and explicit boundaries | Editor settings use the existing Go settings service and adapter; document edits use `useDocumentCommands` and Monaco session identity; Redux remains projection; any new Wails handler follows the consumed typed boundary. | PASS |
| IV. Offline, private, and safe | Link emits Markdown source only; deferred actions perform no I/O, network, telemetry, or provider call; source/bundle guards and request instrumentation are named. | PASS |
| V. Data and cross-platform operation | SQLite remains additive and CGO-free; generated bindings are regenerated; OS framing/movement/resize and native macOS Edit roles remain consumed rather than reimplemented. | PASS |
| VI. Accessible, tokenized, coherent interfaces | Registry-derived labels and accelerators, catalogue strings, visible focus, reduced motion, six palettes, long-label reachability, and real responsive controls are explicit obligations. | PASS |
| VII. Evidence before completion | Implementation must capture a reliable pre-edit baseline, inspect named tests, run current gates, exercise live controls, and walk the real build. Unreliable gates are hard stops. | PASS |

No constitutional exception or unresolved clarification remains. The only resolved planning ambiguity is
recorded in [research.md](research.md): Heading 1/2/3 use the explicit ATX FR-ED-014 behavior in this
slice; no unapproved Setext/H3 fallback is invented.

## Project Structure

### Documentation (this feature)

```text
specs/002-editor-stage-formatting/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── editor-stage-actions.md
├── checklists/requirements.md
└── tasks.md                         # created later by $speckit-tasks, not by this plan
```

### Source code (repository root)

```text
internal/apperr/                      # typed Settings/EditorSettings DTOs if required
internal/settings/                    # canonical EditorSettings validation and additive KV persistence
internal/db/                          # existing settings query/migration seam only
internal/appmodel/                    # existing document/layout authority; extend only if a consumed
                                      # projection contract requires it
frontend/src/logic/actions/           # action and shortcut registries and scoped dispatcher
frontend/src/logic/format/            # pure bounded Markdown transformations
frontend/src/logic/adapter/           # sole Wails binding access and typed settings adapter
frontend/src/logic/store/             # acknowledged projection and existing DocView/sidebar commands
frontend/src/logic/hooks/             # existing document-command/session integration
frontend/src/ui/components/           # CodeEditor option/edit integration
frontend/src/ui/primitives/           # existing menu/segmented/focus primitives
frontend/src/ui/widgets/              # ShellMenuRow, EditorChrome, context menu, shortcuts dialog,
                                      # Settings/View/About/AppShell/EditorView integration
frontend/src/ui/styles/               # token-only responsive chrome styles
frontend/src/i18n/locales/            # localized action labels, accelerator/unavailable states
frontend/src/dev/bridge-mock/         # parity for typed settings and action journeys
frontend/e2e/editor-stage.test.ts    # new responsive/palette/browser journey
specs/002-editor-stage-formatting/evidence/ # baseline, focused output, live and real-build records
```

**Structure Decision**: Extend the existing vertical seams. Add no second settings/document/layout store,
no localStorage editor-settings cache, no new Wails runtime path, no File/tab/workspace/Assistant model,
and no separate visual action registry. Any generated Wails output is produced by `just gen` and checked by
the existing generation gate.

## Phase 0: Research Decisions

Research is consolidated in [research.md](research.md). The resolved decisions are:

1. Extend the existing Wails/React/Monaco and settings seams; keep Go authoritative and Monaco ephemeral.
2. Replace the narrow shell catalogue with one registry carrying identity, labels, scope, availability, and
   platform-neutral shortcuts; preserve native macOS clipboard/edit ownership.
3. Keep formatting pure and bounded; apply one Monaco edit through `useDocumentCommands` and the normal
   buffer queue, preserving selection/caret/scroll/undo identity.
4. Add `EditorSettings` to the existing typed Go settings path with defaults line numbers on, word wrap off,
   and font sizes exactly 13/14/16 with 14 default; update Monaco in place.
5. Represent File, visual tabs, right-side control, Image, future Settings/View/About items, and
   Format/Compact/Lint as explicit localized deferred states with no successful command path.
6. Use the mockup's 1280/768/375 relocation rules and prove actual reachability/no clipping, not CSS hiding.
7. Use layered unit, integration, architecture/offline, browser, live, and real-build evidence after a
   reliable pre-edit baseline.
8. Resolve the heading ambiguity in favor of the explicit ATX H1/H2/H3 action rule; do not invent Setext/H3
   behavior.

## Phase 1: Dependency-ordered vertical-slice plan

The implementation sequence is `ED-VS-01 → ED-VS-02` and `ED-VS-01 → ED-VS-03`; then
`ED-VS-02 + ED-VS-03 → ED-VS-04`; `ED-VS-01 + ED-VS-04 → ED-VS-05`; and all prior slices →
`ED-VS-06`. Each slice has one primary requirement owner; tests and evidence support that owner without
creating duplicate ownership.

### ED-VS-01 — Canonical action and shortcut foundation

**Depends on**: consumed Feature 001 shell/action and focus contracts; existing `shellActions.ts` and
`useShellShortcuts.ts` behavior.

**Primary owner**: FR-ED-011, FR-ED-020, FR-ED-021.

**Build**:

- Add the typed action and shortcut registry in `frontend/src/logic/actions/`, covering all required
  Editor-stage identities, scopes, localized metadata, platform-neutral bindings, surface membership, and
  `available`/`deferred` availability.
- Replace the event-key-only shortcut matching with modifier/platform resolution, editor-focus and
  document-availability checks, modal suppression, and native macOS clipboard/edit exclusions.
- Preserve existing Settings/View/About/full-screen consumers while making them registry entries rather than
  creating a competing shell catalogue.
- Define the typed result for unavailable/deferred/mismatched dispatch so future surfaces cannot accidentally
  call a backend or report success.

**Concrete paths**: `frontend/src/logic/actions/actionRegistry.ts`,
`frontend/src/logic/actions/shortcutRegistry.ts`, `frontend/src/logic/actions/actionDispatcher.ts`,
`frontend/src/logic/actions/shellActions.ts`, `frontend/src/logic/actions/useShellShortcuts.ts`, and
their named tests.

**Proof**: `frontend/src/logic/actions/actionRegistry.test.ts` proves unique identities, scopes,
availability, surface membership, and no duplicate labels; `frontend/src/logic/actions/shortcutRegistry.test.ts`
proves frozen bindings and macOS/Windows/Linux rendering; existing shell action/shortcut tests prove modal
and existing-shell compatibility.

### ED-VS-02 — Phase 04 formatting and the identity-bound editor seam

**Depends on**: ED-VS-01; consumed `EditorSessionProvider`, `useDocumentCommands`, `CodeEditor`, and
`useSyncedBuffer` contracts.

**Primary owner**: FR-ED-012, FR-ED-013, FR-ED-014, FR-ED-015, FR-ED-016, FR-ED-017, FR-ED-024.

**Build**:

- Add pure transformations in `frontend/src/logic/format/` for emphasis/code toggles, ATX heading
  add/replace/remove, line-by-line bullet/numbered/task conversion, quote, link, and empty GFM table
  skeleton insertion.
- Read selection/content through the current identity-bound session and route mutations through one
  document-command operation. Multi-line list formatting must be one contiguous/batched Monaco edit and one
  undo step, not one mutation per line.
- Preserve marker defaults and the existing Markdown preference inputs. Do not add Setext/H3 fallback,
  TSV/CSV conversion, rich paste conversion, image file work, whole-document formatting, linting, or a new
  document store.
- Keep focused-editor content/caret/selection/scroll/undo safe when projections arrive; no full-value echo
  back into the focused model.

**Concrete paths**: new `frontend/src/logic/format/formatting.ts` and tests; existing
`frontend/src/logic/hooks/useDocumentCommands.ts`, `frontend/src/ui/widgets/editorSession.ts`,
`frontend/src/ui/components/CodeEditor.tsx`, `frontend/src/ui/widgets/EditorView.tsx`, and their tests.
The specification names `useDocumentCommands.test.tsx`; the repository's actual existing focused test is
`frontend/src/logic/hooks/useDocumentCommands.test.ts`, so extend that file rather than creating a duplicate.

**Proof**: `frontend/src/logic/format/formatting.test.ts` covers every marker/range/line/table rule and
exact original-byte restoration. `CodeEditor.test.tsx`, `useDocumentCommands.test.ts`, and
`EditorView.integration.test.tsx` prove identity checks, one `executeEdits`/undo group, buffer queue routing,
and no focused-editor reset. The pointer/shortcut/context-menu equivalence journey is completed in ED-VS-05
and ED-LIVE-003.

### ED-VS-03 — Acknowledged editor display settings and view bindings

**Depends on**: consumed settings service/repository/adapter contracts and existing `CodeEditor` option
inputs; ED-VS-01 for registry metadata.

**Primary owner**: FR-ED-022, FR-ED-025.

**Build**:

- Add the typed `EditorSettings` group to `internal/apperr`, `internal/settings/model.go`, service,
  repository, validation/default normalization, and additive KV persistence. Preserve immediate acknowledged
  setting semantics and failure retention.
- Extend `SettingsHandler`, frontend adapter types/services/index, generated bindings through `just gen`, and
  `frontend/src/dev/bridge-mock/` with parity and arity checks. Keep the handler typed, named-result,
  no-context, first-statement panic-safe, service-only, and composition-root wired.
- Hydrate and project acknowledged editor settings into the Editor surface. Change Monaco line numbers,
  word wrap, and font size in place; never remount, reseed, or replace the focused model for a setting.
- Reuse existing `SetDocView`, `SetUILayout`, one-pane, sidebar, full-screen, appearance, and native-shell
  boundaries; no new owner for arrangement or responsive geometry.

**Concrete paths**: `internal/apperr/results.go`, `internal/settings/model.go`, `service.go`,
`repository.go`, `handler.go`, repository SQL tests/migration as required; `frontend/src/logic/adapter/
settingsTypes.ts`, `services.ts`, `index.ts`, bridge mock; `frontend/src/ui/components/CodeEditor.tsx`,
`frontend/src/ui/widgets/EditorView.tsx`, and settings/editor tests. Generated Wails files are changed only
by `just gen`.

**Proof**: Go settings model/service/repository/handler tests cover defaults, accepted values, invalid
values, persistence, and failure retention; adapter/dev-bridge tests cover DTO parity and arity; CodeEditor
and EditorView integration tests prove in-place options preserve content/identity/caret/selection/scroll/undo.

### ED-VS-04 — Mockup-shaped Editor-stage chrome and responsive shell

**Depends on**: ED-VS-01 registry; ED-VS-02 formatting dispatcher; ED-VS-03 acknowledged settings; consumed
Feature 001 appearance, focus, layout, and native frame contracts.

**Primary owner**: FR-ED-001, FR-ED-002, FR-ED-003, FR-ED-004, FR-ED-005, FR-ED-006, FR-ED-007,
FR-ED-008, FR-ED-009, FR-ED-010.

**Build**:

- Extend `ShellMenuRow` to render File, Settings, View, About in order directly below the native title bar,
  deriving inventory/order/availability from the registry. Retain working appearance, arrangement, sidebar,
  full-screen, and About/version consumers.
- Add the complete mockup inventory and grouping for Settings/View/About. Keep future items visibly
  unavailable/inert; omit Assistant settings and Assistant panel. File items are shape fixtures only.
- Add the visual tab presentation with representative labels, modified dot, close/add affordances, but no
  tab state, file identity, switching, persistence, or backend command.
- Add both requested sidebar controls: existing left workspace/sidebar visibility remains functional at
  desktop/768 rail/375 off-canvas; the right-side control is inspectable and visual-only with no Assistant
  state or panel.
- Add `EditorChrome` around the editor controls: all inline/heading/list/quote/link/image/table groups,
  Format/Compact/Lint explicit deferred controls, `»` overflow, and Editor/Split/Preview arrangement.
  Preserve one pane minimum and existing flush-before-hide transitions.
- Implement the exact 1280/768/375 relocation rules with tokenized, one-row CSS and no page-level horizontal
  clipping. The visual tab fixture may use the mockup's contained tab-strip overflow at 375; assert
  responsive-only widths do not overwrite durable desktop layout.

**Concrete paths**: `frontend/src/ui/widgets/ShellMenuRow.tsx/.module.css`, `SettingsMenu.tsx`,
`ViewMenu.tsx`, `AppShell.tsx/.module.css`, `EditorView.tsx/.module.css`, new
`EditorChrome.tsx/.module.css`, and existing/new focused tests; `frontend/src/i18n/locales/en.json` and
`frontend/src/ui/styles/tokens.css` only for catalogue/token additions; `frontend/e2e/editor-stage.test.ts`.

**Proof**: `EditorChrome.test.tsx` and `ShellMenuRow.test.tsx` cover inventories, deferred states, ordering,
  overflow, sidebar controls, focus, and no Assistant/tab behavior; `AppShell.test.tsx` and
  `EditorView.test.tsx` cover one-pane/layout preservation. The E2E matrix covers all 18 width/palette
  combinations, root attributes, visible focus, bounding-box clipping, and actual pointer/keyboard reachability.

### ED-VS-05 — Registry-derived context menu and shortcuts discovery

**Depends on**: ED-VS-01 registry/dispatcher and ED-VS-04 EditorChrome/menu integration; ED-VS-02 formatting
  dispatch.

**Primary owner**: FR-ED-019, FR-ED-023.

**Build**:

- Add `EditorContextMenu` with the exact registry order and separators: Cut, Copy, Paste, Paste as plain text,
  Bold, Italic, Link, Format document, Compact, Command palette. Do not add Lint to this menu because it is
  not in the active context-menu inventory.
- Add `ShortcutsDialog` from the same registry, resolving platform accelerators and showing scope/availability
  without duplicating bindings. Preserve modal focus trap, Escape, opener restoration, and background dispatch
  suppression from the consumed dialog rules.
- Connect toolbar, menu, overflow, tooltip, context-menu, and shortcuts-dialog invocation to identical action
  identities. Ensure toolbar/context-menu pointer invocation can use the originating editor session even when
  focus moves to the surface.
- Use the existing translation catalogue, semantic roles, focus ring and reduced-motion tokens, and all six
  palettes. Long labels must remain reachable rather than clip or lose their accessible name.

**Concrete paths**: new `frontend/src/ui/widgets/EditorContextMenu.tsx/.module.css` and
`ShortcutsDialog.tsx/.module.css`; `EditorView.tsx`, `EditorChrome.tsx`, `ShellMenuRow.tsx`, i18n, and action
tests.

**Proof**: `frontend/src/ui/widgets/EditorContextMenu.test.tsx` and
`frontend/src/ui/widgets/ShortcutsDialog.test.tsx` prove exact order, separators, accelerators, modality,
focus, registry identity, and no duplicate handlers. ED-LIVE-001 and ED-LIVE-003 exercise real pointer,
keyboard, and context-menu paths.

### ED-VS-06 — Deferred boundaries, offline safeguards, and slice evidence

**Depends on**: ED-VS-01 through ED-VS-05.

**Primary owner**: FR-ED-018, FR-ED-026, FR-ED-027.

**Build**:

- Make deferred Format/Compact/Lint outcomes provably no-op at the command boundary: no source/selection/
  caret/scroll/undo/problems/projection mutation, no long-operation gate, and no backend/file/network call.
- Add absence and offline safeguards for File I/O, real tab lifecycle, workspace enumeration, rich-rendering
  expansion, Assistant/provider behavior, remote About links, telemetry, and hidden network paths. Preserve
  the visual fixtures required by ED-VS-04 without creating future entities.
- Inspect and run every named focused test, current architecture/offline gate, reliable baseline diff, browser
  matrix, live case, and real build. Record current-host limitations honestly; do not waive missing gates.

**Concrete paths**: `frontend/scripts/archtest.mjs` and existing guards only through normal implementation
changes (never allowlists/config weakening), `frontend/e2e/editor-stage.test.ts`, focused deferred-action
tests, and `specs/002-editor-stage-formatting/evidence/` records.

**Proof**: `EditorChrome.test.tsx` proves unavailable no-mutation/no-gate outcomes; `just archtest` proves
adapter/token/localization/native-shell boundaries; the request-instrumented ED-LIVE-004 proves zero
introduced outbound requests and excluded behavior; ED-LIVE-005 plus `just build` proves current-host
ordinary framed-window continuity.

## Requirement ownership matrix

Exactly one plan slice is the primary owner of every active FR-ED requirement. Supporting tests may exercise
another slice but do not create a second owner.

| Requirement | Primary owner | Responsibility |
|---|---|---|
| FR-ED-001 | ED-VS-04 | Menu row below the native title bar and OS-shell preservation. |
| FR-ED-002 | ED-VS-04 | Visual-only File menu inventory. |
| FR-ED-003 | ED-VS-04 | Settings inventory, Editor group, and deferred future settings. |
| FR-ED-004 | ED-VS-04 | View inventory, working arrangements/sidebar/full-screen, and unavailable future view items. |
| FR-ED-005 | ED-VS-04 | About inventory, local About behavior, and unavailable future links/logs. |
| FR-ED-006 | ED-VS-04 | Visual tab presentation without canonical tab state or lifecycle. |
| FR-ED-007 | ED-VS-04 | Functional left sidebar/workspace visibility and responsive presentation. |
| FR-ED-008 | ED-VS-04 | Visual-only right-side control with no Assistant state or panel. |
| FR-ED-009 | ED-VS-04 | Complete toolbar groups and 768/375 overflow relocation. |
| FR-ED-010 | ED-VS-04 | Visible Format/Compact/Lint controls with explicit deferred availability. |
| FR-ED-011 | ED-VS-01 | One canonical action registry and derived visible surfaces. |
| FR-ED-012 | ED-VS-02 | Bounded selection/current-line formatting through the shared seam. |
| FR-ED-013 | ED-VS-02 | Emphasis/code marker pair toggle and caret insertion. |
| FR-ED-014 | ED-VS-02 | ATX heading add/replace/remove behavior. |
| FR-ED-015 | ED-VS-02 | List conversion/removal and canonical/acknowledged marker preferences. |
| FR-ED-016 | ED-VS-02 | Quote, Link, Table, and deferred Image action semantics. |
| FR-ED-017 | ED-VS-02 | Phase 04 bounded behavior and one-edit contract; later document actions deferred. |
| FR-ED-018 | ED-VS-06 | Deferred Format/Compact/Lint no-gate, deterministic no-mutation outcome. |
| FR-ED-019 | ED-VS-05 | Exact registry-derived editor context menu and separators. |
| FR-ED-020 | ED-VS-01 | Frozen Editor-stage shortcut bindings and platform resolution. |
| FR-ED-021 | ED-VS-01 | Scope, focus, writable-document, window-focus, and modal suppression. |
| FR-ED-022 | ED-VS-03 | Acknowledged line-number, wrap, and 13/14/16 font-size settings. |
| FR-ED-023 | ED-VS-05 | Localization, semantic roles, focus, reduced motion, and centralized tokens. |
| FR-ED-024 | ED-VS-02 | Go/appmodel authority, Redux projection, and identity-bound editor working copy. |
| FR-ED-025 | ED-VS-03 | Adapter-only Wails access and typed handler/generated-binding boundary. |
| FR-ED-026 | ED-VS-06 | Native frame, offline, no remote assets/telemetry, and no Assistant behavior. |
| FR-ED-027 | ED-VS-06 | No hidden File/tab/workspace/renderer/Assistant dependency or fake success. |

## Owned/Consumed/Deferred source traceability

The full matrix remains in [spec.md](spec.md). The plan preserves its disposition as follows:

| Source authority group | Disposition | Plan boundary |
|---|---|---|
| Phase 04 `what-you-get`; build steps 1–4 and 6–8; `done-when` | Owned | ED-VS-01/02/03/04/05 and named formatting/registry/chrome/live evidence. |
| Phase 04 build step 5 (TSV/CSV table paste) | Deferred | No paste converter; downstream paste slice owns it. |
| Phase 04 `where-the-details-are`; `questions-to-settle-first` | Owned/Consumed | Mockup and existing `useDocumentCommands` are used; empty-selection behavior is resolved in the active spec. |
| Phase 10 tidy/share `what-you-get`, build steps, details, and questions | Deferred | Format/Compact/Lint document behavior, formatter/linter, diff, on-save, PDF/export remain downstream. |
| `writing-in-the-editor.md` source editor, buffer sync, no text echo, preview/input bounds | Consumed | Existing editor/session/appmodel/preview contracts remain sole owners. |
| `writing-in-the-editor.md` tab limit/per-document tabs, find/scroll, new problems behavior | Deferred | Visual tab fixture only; no tab/search/problems owner. |
| `writing-in-the-editor.md` one-pane/divider/arrangement/defaults | Consumed/Owned | Layout/arrangement consumed; explicit line-number/wrap/font defaults owned by ED-VS-03. |
| `formatting-text.md` scope, canonical markers, toggles, headings, lists, table, context menu, overflow | Owned | ED-VS-02/04/05 with pure transformation and surface tests. |
| `formatting-text.md` image drop/paste, bitmap writes, tabular/rich paste | Deferred | No file/asset/clipboard converter behavior. |
| `keyboard-shortcuts.md` registry/scopes/frozen map/platform/dialog/formatting | Owned | ED-VS-01 and ED-VS-05. |
| `keyboard-shortcuts.md` macOS clipboard/edit roles | Consumed | Feature 001 native role contract; no duplicate in-app handler. |
| `keyboard-shortcuts.md` file/search/reading future bindings | Deferred | No file, search, quick-open, command-palette implementation. |
| `settings.md` immediate writes, validation, registry/reset/persistence/appearance | Consumed | Existing typed settings lifecycle and appearance owner remain in force. |
| `settings.md` Editor group | Owned/Deferred | ED-VS-03 owns line numbers/wrap/13/14/16; autosave/reading/live-preview future behavior remains deferred. |
| `settings.md` Markdown group | Owned/Deferred | Existing marker preferences feed ED-VS-02; Standard/Format-on-save/Lint-on-save behavior remains deferred. |
| `docs/delivery/spec/surface/mockup.html` named Editor-stage screens | Owned shape | ED-VS-04/05 implement the visual shape; this spec supplies behavior. |
| Mockup context-menu/tab-menu/diff/problems/diagnostics/Assistant-reserved screens | Deferred/visual shape | Only explicitly requested visual tab/control fixtures appear; no downstream behavior is created. |
| Feature 001 application-state, command-boundaries, delivery-stages, window-shell, appearance contracts | Consumed with narrow supersession | Preserve authority, tokens, focus, layout, offline, OS frame, and existing actions; supersede only prior visual absence of File, visual tabs, and right-side control. |

## Downstream entry gates preserved

- File/launcher behavior waits for real New/Open/Open Folder/recent mutation/close-last commands and a valid
  zero-document model. File menu shape in this slice never enables those paths.
- Real tabs wait for document identity, safe open/save/close, decoding/size limits, workspace and tab lifecycle
  contracts. The visual tab fixture does not create canonical state.
- Renderer/plugin expansion, image/asset lifecycle, tidy-markdown document operations, PDF/export, search,
  workspace, and Assistant/provider work remain separate dependency-complete slices.

## Verification sequence for implementation handoff

1. Capture `just baseline 002-editor-stage-formatting` before the first code edit; stop if any nonzero gate is
   `UNRELIABLE`.
2. Implement ED-VS-01 through ED-VS-05 in dependency order, verifying each named focused test and preserving
   generated binding workflow.
3. Run ED-VS-06 evidence: focused tests, `just archtest`, `just check`, `just e2e-test`/`just verify-ui` as
   applicable, request instrumentation, ED-LIVE-001–005, and `just build`.
4. Compare results to the trustworthy baseline; inspect the active task list and evidence, then use
   `$speckit-converge` before review/release. Do not claim the whole product or a later stage is complete.

## Complexity Tracking

No constitutional violations are proposed. The only deliberate complexity is the feature-local action
registry plus the typed EditorSettings group; both reuse existing seams and are required to avoid duplicated
bindings or a frontend-owned settings state. No exception table is needed.

## Post-design Constitution Check

**Result: PASS.** Phase 1 design generated [data-model.md](data-model.md),
[contracts/editor-stage-actions.md](contracts/editor-stage-actions.md), and [quickstart.md](quickstart.md)
with all Technical Context unknowns resolved in [research.md](research.md). The design keeps the active
feature self-contained, assigns one primary owner per FR-ED requirement, preserves all consumed Feature 001
contracts, names each deferred boundary, and introduces no implementation code or `docs/delivery/` edit.
