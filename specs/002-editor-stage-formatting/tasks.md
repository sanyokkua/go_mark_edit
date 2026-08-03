# Tasks: Editor Stage Chrome and Formatting

**Input**: Approved design artifacts in `/specs/002-editor-stage-formatting/`

**Binding scope**: Deliver the dependency-complete Editor-stage slice defined by `FR-ED-001` through
`FR-ED-027`: one canonical action registry, Phase 04 bounded formatting, acknowledged editor display
settings, the mockup-shaped Editor-stage chrome, responsive overflow, context-menu and shortcut discovery,
and named automated/live/real-build evidence.

**Stop boundary**: Do not implement file opening, saving, export, workspace enumeration, real tab state or
lifecycle, image/file paste, TSV/CSV or rich-paste conversion, renderer/plugin expansion, scroll-sync/find,
problems or lint behavior, Format/Compact document behavior, PDF/export, Assistant/provider behavior, remote
assets, telemetry, or any outbound network path. Required File, tab, right-side, Image, Format, Compact,
Lint, Assistant, reading, log-folder, GitHub, and future Settings shapes remain explicitly deferred and
must not report success, acquire a gate, or create hidden state. At 375 pixels, the visual tab strip may use
contained horizontal scrolling, but no tab-management overflow state, menu, command, or lifecycle may be added.

**Tests**: Required by the specification and plan. Each implementation group starts with named tests that
must fail for the missing behavior before production changes. Test and evidence tasks use `Supports:` and
never claim requirement ownership.

## Format: `[ID] [P?] [Story] Description`

- **[P]** means the task has a disjoint file set and no dependency on another incomplete task.
- **[US1]** is “See the complete Editor-stage chrome.”
- **[US2]** is “Apply common Markdown formatting.”
- **[US3]** is “Run document actions and editor/view controls.”
- **[US4]** is “Learn and reach actions by keyboard.”
- Every `FR-ED-*` appears in exactly one `Owns:` field. `Owner: ED-VS-*` names its sole plan owner;
  supporting tests and evidence refer to that owner without duplicating ownership.

## Governing constraints for every task

- Capture and require a trustworthy baseline before the first implementation edit. A nonzero gate that
  analyzed nothing is `UNRELIABLE` and blocks the batch; `just archtest` must be green independently.
- Keep Go/appmodel and the existing settings service canonical, Redux projection-only, and Monaco an
  identity-bound ephemeral working copy. Formatting uses the existing document-command/buffer seam and one
  bounded Monaco edit; display settings update Monaco in place without remounting or reseeding.
- Only `frontend/src/logic/adapter/` may access generated Wails bindings. Any new bound handler returns one
  typed `apperr.*Result`, takes no `context.Context`, uses a named result, recovers panics in its first
  statement, calls its service only, and remains composition-root wired. Run `just gen`; never hand-edit
  generated bindings.
- Preserve the completed Feature 001 appearance, layout, focus, full-screen, notification, native menu, and
  ordinary OS-managed framed-window contracts. Add no custom title control, drag/resize region, private
  runtime call, second layout owner, or responsive-only durable width.
- Derive visible actions, labels, accessible names, accelerators, availability, ordering, and dispatch
  identity from one registry. Use catalogue strings, semantic roles, visible focus, reduced-motion behavior,
  and centralized tokens across all six palettes.
- A deferred action is a localized deterministic unavailable result, not a production placeholder or no-op:
  it has no backend command, file/network side effect, canonical future state, document mutation, successful
  outcome, or long-operation-gate acquisition.
- Do not edit `docs/delivery/`, weaken a quality/architecture configuration, add an architecture allowlist
  entry, skip or narrow a failing test, or change any file outside a task's named paths without reporting and
  re-planning the expansion.

---

## Phase 1: Setup — Trustworthy Pre-Edit Baseline

**Purpose**: Preserve reliable pre-change evidence before any production edit.

- [ ] T001 Run `just baseline 002-editor-stage-formatting`, inspect every recorded exit code/raw output/reliability verdict, require `just archtest` to be green, and retain the comparison point; Supports: ED-VS-01 through ED-VS-06 in `specs/002-editor-stage-formatting/evidence/`

**Hard stop**: If any nonzero gate analyzed no target or is marked `UNRELIABLE`, or architecture is red,
repair the unchanged official gate or re-plan before T002. Do not record an empty result and continue.

---

## Phase 2: Foundational — Canonical Action and Shortcut Registry (Blocking)

**Purpose**: Establish the single registry and scoped dispatcher required by every story surface.

> Write T002 first and confirm the unique-identity, binding, platform-label, scope, availability, modal,
> and native-role assertions fail before T003–T005.

- [ ] T002 Add failing registry and dispatcher tests for every Editor-stage identity, localized metadata, ordered surface membership, available/deferred state, frozen bindings, macOS/Windows/Linux rendering, native macOS clipboard exclusions, editor/document/window scope, writable-document checks, modal suppression, and classified unavailable/mismatch outcomes; Supports: ED-VS-01 in `frontend/src/logic/actions/actionRegistry.test.ts`, `frontend/src/logic/actions/shortcutRegistry.test.ts`, `frontend/src/logic/actions/shellActions.test.ts`, and `frontend/src/logic/actions/useShellShortcuts.test.tsx`
- [ ] T003 Owns: FR-ED-011. Owner: ED-VS-01. Create one typed registry for every visible Editor-stage action with stable identity, catalogue/accessibility keys, scope, availability, shortcut, ordered surface membership, and typed invocation; migrate existing Settings/View/About/full-screen consumers without retaining a competing catalogue in `frontend/src/logic/actions/actionRegistry.ts` and `frontend/src/logic/actions/shellActions.ts`
- [ ] T004 Owns: FR-ED-020. Owner: ED-VS-01. Implement the frozen Editor-stage binding set and platform-correct Ctrl/Cmd and Alt/Option accelerator rendering without shadowing reserved Monaco, find/replace, native clipboard, or existing keys in `frontend/src/logic/actions/shortcutRegistry.ts` and `frontend/src/logic/actions/useShellShortcuts.ts`
- [ ] T005 Owns: FR-ED-021. Owner: ED-VS-01. Implement the canonical dispatcher checks for deferred availability, modal suppression, focused identity-bound editor scope, writable current-document scope, focused-window scope, and typed `mutated`/`unavailable`/`document-mismatch` outcomes without synthetic success in `frontend/src/logic/actions/actionDispatcher.ts` and `frontend/src/logic/actions/useShellShortcuts.ts`

**Checkpoint**: Registry tests pass, every visible action has one identity/binding owner, and no UI or backend
future behavior has been introduced.

---

## Phase 3: User Story 2 — Apply Common Markdown Formatting (Priority: P1)

**Goal**: Apply the approved Phase 04 source transformations through one identity-safe editor command seam,
with identical pointer/shortcut/context identities and one undo step.

**Independent Test**: With one writable current document, apply Bold from pointer, keyboard, and context
identity; repeat empty-selection marker insertion, ATX heading toggles, multi-line list conversion, Quote,
Link, and Table. Confirm exact bounded source changes, useful caret placement, original-byte restoration on a
second toggle, one edit/undo group, and no focused-editor reset.

> Write T006 first and confirm every missing transformation and integration assertion fails before
> T007–T013.

- [ ] T006 [US2] Add failing pure and editor-integration tests for selected-range/current-line bounds, marker pairs immediately inside/outside selections, empty-caret placement, ATX add/replace/remove, line-by-line list conversion/removal with canonical `1. ` numbered markers and no auto-renumbering, Quote, Link, the empty GFM table skeleton, preference inputs, one contiguous edit/undo group, identity mismatch, buffer routing, focused projection safety, and surface-specific invocation coverage: Bold/Italic/Link through toolbar, keyboard, and context menu; Heading/list/Quote/Table through toolbar and keyboard, plus approved overflow wherever exposed; Supports: ED-VS-02 in `frontend/src/logic/format/formatting.test.ts`, `frontend/src/logic/hooks/useDocumentCommands.test.ts`, `frontend/src/ui/components/CodeEditor.test.tsx`, and `frontend/src/ui/widgets/EditorView.integration.test.tsx`
- [ ] T007 [US2] Owns: FR-ED-013. Owner: ED-VS-02. Implement Bold, Italic, Strikethrough, and Inline-code pair add/remove behavior, including markers just outside a selection and empty-pair caret placement, while preserving exact original bytes after the second toggle in `frontend/src/logic/format/formatting.ts`
- [ ] T008 [US2] Owns: FR-ED-014. Owner: ED-VS-02. Implement ATX Heading 1/2/3 add, level replacement, and same-level removal without inventing Setext conversion or an H3 fallback in `frontend/src/logic/format/formatting.ts`
- [ ] T009 [US2] Owns: FR-ED-015. Owner: ED-VS-02. Implement line-by-line Bullet, Numbered, and Task-list add/convert/remove behavior using canonical `-` bullets, canonical `1. ` numbered markers per affected line, task markers, and acknowledged Markdown marker inputs; convert other list markers to `1. `, remove same-kind markers, and never auto-renumber, as one bounded replacement in `frontend/src/logic/format/formatting.ts`
- [ ] T010 [US2] Owns: FR-ED-016. Owner: ED-VS-02. Implement Quote, source-only Link, and empty GFM Table transformations through the common formatter, and retain Image as a localized deferred registry entry with no file, asset, clipboard-conversion, or network path in `frontend/src/logic/format/formatting.ts` and `frontend/src/logic/actions/actionRegistry.ts`
- [ ] T011 [US2] Owns: FR-ED-012. Owner: ED-VS-02. Define the pure bounded `FormatRequest`/edit-result contract so nonempty selections change only their range and empty selections change only the current line or insertion point, then route it exclusively through the existing document-command seam in `frontend/src/logic/format/formatting.ts` and `frontend/src/logic/hooks/useDocumentCommands.ts`
- [ ] T012 [US2] Owns: FR-ED-017. Owner: ED-VS-02. Apply each Phase 04 formatting result as exactly one Monaco `executeEdits` operation bracketed by the existing undo stops, keep Format/Compact/Lint outside this mutation path, and preserve useful caret/selection intent in `frontend/src/ui/components/CodeEditor.tsx` and `frontend/src/ui/widgets/EditorView.tsx`
- [ ] T013 [US2] Owns: FR-ED-024. Owner: ED-VS-02. Preserve Go/appmodel canonical state, Redux projection-only updates, the identity-bound Monaco working copy, flush/read ordering, stale-session refusal, and no full-content echo that resets caret, selection, scroll, or undo during formatting in `frontend/src/logic/hooks/useDocumentCommands.ts`, `frontend/src/ui/widgets/editorSession.ts`, `frontend/src/ui/widgets/EditorView.tsx`, and `frontend/src/logic/store/appModelProjection.ts`

**User Story 2 checkpoint**: All Phase 04 formatting semantics pass without whole-document rewriting, file or
image behavior, paste conversion, rich editing, or a second document store.

---

## Phase 4: User Story 3 — Document Actions and Editor/View Controls (Priority: P2)

**Goal**: Persist and acknowledge line-number, word-wrap, and exact font-size settings through the existing
Go/Wails path while exposing Format, Compact, and Lint as explicitly unavailable controls only.

**Independent Test**: Change line numbers, word wrap, and font size 13/14/16 and confirm acknowledged
persistence plus in-place Monaco updates preserve content, identity, caret, selection, scroll, and undo.
Inspect Format/Compact/Lint metadata and confirm they remain deferred; full no-gate/no-mutation proof is
completed after all surfaces exist in Phase 7.

> T014 and T015 may be written together after T013 because their Go/settings and frontend/editor test files
> are disjoint. Confirm both sets fail before T016–T017.

- [ ] T014 [P] [US3] Add failing Go settings model, service, repository, and handler tests for EditorSettings defaults, exactly accepted font sizes 13/14/16, rejected values, additive KV persistence, acknowledged failure retention, typed no-context named-result first-statement panic-safe handler behavior, and reset isolation; Supports: ED-VS-03 in `internal/apperr/results_test.go`, `internal/settings/service_test.go`, `internal/settings/repository_sqlite_test.go`, and `internal/settings/handler_test.go`
- [ ] T015 [P] [US3] Add failing adapter, development-bridge, projection, and editor integration tests for DTO/arity parity, acknowledged updates, rejected-write retention, line-number/wrap/font-size projection, and in-place Monaco option updates preserving model identity/content/caret/selection/scroll/undo; Supports: ED-VS-03 in `frontend/src/logic/adapter/services.test.ts`, `frontend/src/dev/bridge-mock/bridge.test.ts`, `frontend/src/logic/store/appModelProjection.test.ts`, `frontend/src/ui/components/CodeEditor.test.tsx`, and `frontend/src/ui/widgets/EditorView.integration.test.tsx`
- [ ] T016 [US3] Owns: FR-ED-022. Owner: ED-VS-03. Add backend-authoritative `EditorSettings` with line numbers on, word wrap off, font size 14 default, exactly 13/14/16 validation, additive immediate persistence, acknowledged projection, and in-place Monaco option consumption without content mutation or remounting in `internal/apperr/results.go`, `internal/settings/model.go`, `internal/settings/repository.go`, `internal/settings/repository_sqlite.go`, `internal/settings/service.go`, `frontend/src/logic/store/appModelTypes.ts`, `frontend/src/logic/store/appModelProjection.ts`, `frontend/src/ui/components/CodeEditor.tsx`, and `frontend/src/ui/widgets/EditorView.tsx`
- [ ] T017 [US3] Owns: FR-ED-025. Owner: ED-VS-03. Extend the typed Settings handler, sole frontend adapter, development bridge, and composition wiring for EditorSettings; keep binding arity/result guards and handler architecture intact, run `just gen`, and never hand-edit generated output in `internal/settings/handler.go`, `internal/application/application_context_holder.go`, `frontend/src/logic/adapter/settingsTypes.ts`, `frontend/src/logic/adapter/services.ts`, `frontend/src/logic/adapter/index.ts`, `frontend/src/dev/bridge-mock/go/settings/SettingsHandler.ts`, and generated `frontend/wailsjs/go/settings/SettingsHandler.d.ts`, `frontend/wailsjs/go/settings/SettingsHandler.js`, and `frontend/wailsjs/go/models.ts`

**User Story 3 checkpoint**: Acknowledged editor settings survive reload and update the existing editor in
place; existing arrangement/sidebar/full-screen owners remain consumed; deferred document actions still have
no successful execution path.

---

## Phase 5: User Story 1 — See the Complete Editor-Stage Chrome (Priority: P1) MVP Surface

**Goal**: Render the complete mockup-shaped Editor-stage menu, visual tabs, toolbar, arrangement, and sidebar
controls while preserving native framing, existing working actions, responsive reachability, and every
deferred boundary.

**Independent Test**: With one writable document, operate File/Settings/View/About, the visual tab fixture,
toolbar and overflow, arrangement, and both sidebar controls at 1280/768/375 across all six palettes. Confirm
root appearance attributes, pointer/keyboard reachability, visible focus, one-row layout, no page clipping,
functional existing actions, explicit unavailable future actions, and absence of tab/Assistant/file state.

> T018 and T019 may be written together after T017 because the component-test and Playwright files are
> disjoint. Confirm the missing inventory, behavior, relocation, accessibility, and absence cases fail before
> T020–T029.

- [ ] T018 [P] [US1] Add failing real-component tests for exact File/Settings/View/About order and inventories, visual tab fixtures, both sidebar controls, the shared deferred `toggle-assistant` identity and localized unavailable outcome, all toolbar groups, arrangement, six-palette token/catalogue/focus behavior, one-pane preservation, and absence of file/tab/Assistant state, panels, provider calls, or commands; Supports: ED-VS-04 in `frontend/src/ui/widgets/ShellMenuRow.test.tsx`, `frontend/src/ui/widgets/EditorChrome.test.tsx`, `frontend/src/ui/widgets/AppShell.test.tsx`, and `frontend/src/ui/widgets/EditorView.test.tsx`
- [ ] T019 [P] [US1] Add failing Playwright journeys for all 18 width/palette combinations, actual pointer and keyboard menu/toolbar use, root attributes, bounding-box reachability, 768/375 overflow relocation, one-row toolbar, no page-level horizontal scroll, contained visual tab-strip scrolling at 375 without tab state/menu/command, responsive sidebar states, and no responsive width persistence; Supports: ED-VS-04 in `frontend/e2e/editor-stage.test.ts`
- [ ] T020 [US1] Owns: FR-ED-001. Owner: ED-VS-04. Render one in-app File/Settings/View/About row in that order directly below the ordinary native title bar while preserving OS movement, resizing, controls, title gestures, and existing shell placement in `frontend/src/ui/widgets/ShellMenuRow.tsx`, `frontend/src/ui/widgets/ShellMenuRow.module.css`, and `frontend/src/ui/widgets/AppShell.tsx`
- [ ] T021 [US1] Owns: FR-ED-002. Owner: ED-VS-04. Add the exact File menu shape—New File, New Window, Open File, Open Folder, Open Recent, Reopen, Save, Save As, Export to PDF, Close Tab, and Exit—as localized deferred fixtures with no file/tab command, while retaining any already implemented action only under its existing contract in `frontend/src/logic/actions/actionRegistry.ts`, `frontend/src/ui/widgets/ShellMenuRow.tsx`, and `frontend/src/i18n/locales/en.json`
- [ ] T022 [US1] Owns: FR-ED-003. Owner: ED-VS-04. Render the exact Settings inventory and grouping from registry state, keep delivered appearance and Markdown marker controls working, wire Editor line-number/wrap/13/14/16 settings, keep lifecycle/renderer/tidy items visibly unavailable, and omit every Assistant settings group in `frontend/src/ui/widgets/SettingsMenu.tsx`, `frontend/src/logic/actions/actionRegistry.ts`, and `frontend/src/i18n/locales/en.json`
- [ ] T023 [US1] Owns: FR-ED-004. Owner: ED-VS-04. Render View items in mockup order; reuse working Editor/Split/Preview, left-sidebar, line-number, word-wrap, and full-screen commands with one-pane preservation; make Toggle Assistant share the deferred `toggle-assistant` registry identity and localized unavailable outcome with the right-side control, keep Distraction-free reading unavailable, and change no native-shell ownership in `frontend/src/ui/primitives/ViewMenu.tsx`, `frontend/src/logic/actions/actionRegistry.ts`, `frontend/src/logic/store/docViewCommands.ts`, and `frontend/src/logic/store/uiLayoutCommands.ts`
- [ ] T024 [US1] Owns: FR-ED-005. Owner: ED-VS-04. Render Keyboard shortcuts, Open logs folder, View on GitHub (MIT), and About GoMarkEdit in order; retain the existing local About/version owner, keep logs/GitHub unavailable, and add no remote URL opening or duplicate native macOS About path in `frontend/src/ui/widgets/ShellMenuRow.tsx`, `frontend/src/logic/actions/actionRegistry.ts`, `frontend/src/ui/widgets/AboutDialog.tsx`, and `frontend/src/i18n/locales/en.json`
- [ ] T025 [US1] Owns: FR-ED-006. Owner: ED-VS-04. Add the representative `release-notes.md` and `spec-draft.md` visual tab presentation with modified dot, close, and add affordances as inert accessible fixtures only; allow contained horizontal tab-strip scrolling at 375 as visual layout only; create no canonical tab identity, lifecycle, switching, ordering, persistence, restore, tab-management overflow state/menu/command, file path, or backend call in `frontend/src/ui/widgets/EditorChrome.tsx` and `frontend/src/ui/widgets/EditorChrome.module.css`
- [ ] T026 [US1] Owns: FR-ED-007. Owner: ED-VS-04. Expose and reuse the acknowledged left workspace/sidebar visibility command across desktop, 768-pixel rail, and 375-pixel off-canvas presentations while preventing responsive-only width write-back to durable desktop layout in `frontend/src/ui/widgets/AppShell.tsx`, `frontend/src/ui/widgets/AppShell.module.css`, `frontend/src/logic/store/uiLayoutCommands.ts`, and `frontend/src/ui/widgets/EditorChrome.tsx`
- [ ] T027 [US1] Owns: FR-ED-008. Owner: ED-VS-04. Render an inspectable localized right-side visibility control that resolves through the shared deferred `toggle-assistant` registry entry and localized unavailable outcome used by the View item; create no panel, layout field, Assistant content/state/landmark, provider call, network request, or placeholder, leaving the left sidebar as the only functional sidebar action in `frontend/src/logic/actions/actionRegistry.ts`, `frontend/src/ui/widgets/EditorChrome.tsx`, and `frontend/src/ui/widgets/AppShell.tsx`
- [ ] T028 [US1] Owns: FR-ED-009. Owner: ED-VS-04. Build the one-row EditorChrome groups for inline text, Heading 1/2/3, lists/Quote, Link/Image/Table, `»` overflow, and Editor/Split/Preview; relocate list/link groups at 768 and text/arrangement at 375 so every action remains pointer/keyboard reachable without page-level clipping in `frontend/src/ui/widgets/EditorChrome.tsx`, `frontend/src/ui/widgets/EditorChrome.module.css`, `frontend/src/ui/widgets/EditorView.tsx`, and `frontend/src/ui/widgets/EditorView.module.css`
- [ ] T029 [US1] Owns: FR-ED-010. Owner: ED-VS-04. Place Format, Compact, and Lint with their exact labels and registry metadata in every required toolbar/overflow location, expose localized deferred availability, and provide no formatter, linter, problems, gate, source-mutation, or successful document-operation path in `frontend/src/logic/actions/actionRegistry.ts`, `frontend/src/ui/widgets/EditorChrome.tsx`, and `frontend/src/i18n/locales/en.json`

**User Story 1 checkpoint**: The complete Editor-stage shape is independently operable and responsive, but
future File/tab/image/tidy/Assistant/renderer behavior remains absent rather than simulated.

---

## Phase 6: User Story 4 — Learn and Reach Actions by Keyboard (Priority: P2)

**Goal**: Project the canonical registry into the exact editor context menu and a modal shortcuts dialog,
with platform-correct accelerators, identical action identities, and accessible discovery.

**Independent Test**: Open the context menu and shortcuts dialog, inspect exact order/separators and every
binding on macOS/Windows/Linux mappings, invoke representative actions with and without editor focus, and
confirm focus trapping, Escape/opener restoration, modal background suppression, long-label reachability,
visible focus, reduced motion, and six-palette token use.

> Write T030 first and confirm exact-order, accelerator, identity, focus, modality, and accessibility cases
> fail before T031–T032.

- [ ] T030 [US4] Add failing context-menu and shortcuts-dialog tests for exact registry order/separators, no Lint context item, shared identities, platform accelerators, surface-specific formatting coverage, pointer session retention, focus trap, Escape, opener restoration, modal suppression, translated long labels, semantic roles, visible focus, reduced motion, and all six palettes; Supports: ED-VS-05 in `frontend/src/ui/widgets/EditorContextMenu.test.tsx` and `frontend/src/ui/widgets/ShortcutsDialog.test.tsx`
- [ ] T031 [US4] Owns: FR-ED-019. Owner: ED-VS-05. Implement the registry-derived editor context menu in the exact Cut/Copy/Paste/Paste-as-plain-text, Bold/Italic/Link, Format/Compact, Command-palette order and separators, preserve native clipboard ownership, omit Lint, dispatch the originating editor session's shared identity, and keep Heading/list/Quote/Table on their toolbar and keyboard surfaces, plus approved overflow surfaces wherever exposed, rather than adding them to the context menu in `frontend/src/ui/widgets/EditorContextMenu.tsx`, `frontend/src/ui/widgets/EditorContextMenu.module.css`, and `frontend/src/ui/widgets/EditorView.tsx`
- [ ] T032 [US4] Owns: FR-ED-023. Owner: ED-VS-05. Implement the registry-derived modal Shortcuts dialog and complete catalogue, semantic-role, accessible-name, two-layer focus, reduced-motion, long-label, and centralized-token behavior for menus, controls, tooltips, overflows, unavailable outcomes, and errors across all six palettes in `frontend/src/ui/widgets/ShortcutsDialog.tsx`, `frontend/src/ui/widgets/ShortcutsDialog.module.css`, `frontend/src/ui/widgets/ShellMenuRow.tsx`, `frontend/src/ui/widgets/EditorChrome.tsx`, `frontend/src/i18n/locales/en.json`, and `frontend/src/ui/styles/tokens.css`

**User Story 4 checkpoint**: Every required discovery surface renders from the one registry, keyboard scope
and modality are enforced, and no duplicated label, binding, or handler remains.

---

## Phase 7: Deferred Boundaries, Offline Safeguards, and Completion Evidence

**Purpose**: Prove that visible future controls remain honest unavailable surfaces, preserve native/offline
architecture, exercise the live interface and real build, and reconcile every owned requirement.

> Write T033 and T035 first and confirm the no-mutation/no-gate and architecture/absence assertions fail for
> missing safeguards before T034 and T036–T037.

- [ ] T033 Add failing deferred-action integration tests that snapshot source, selection, caret, scroll, undo, problems, projection, layout, Assistant state/panel, operation-gate calls, adapter/backend/provider calls, files, and requests before and after Format/Compact/Lint and shared `toggle-assistant` dispatch from required surfaces; Supports: ED-VS-06 in `frontend/src/logic/actions/actionDispatcher.test.ts`, `frontend/src/ui/widgets/EditorChrome.test.tsx`, and `frontend/src/ui/widgets/EditorView.integration.test.tsx`
- [ ] T034 Owns: FR-ED-018. Owner: ED-VS-06. Make deferred Format/Compact/Lint resolve deterministically to the localized unavailable result before command or gate acquisition, with no partial source/editor/problems/projection/layout mutation and no backend/file/network call in `frontend/src/logic/actions/actionDispatcher.ts` and `frontend/src/ui/widgets/EditorChrome.tsx`
- [ ] T035 Add failing semantic architecture and bundle/offline safeguards for adapter-only generated bindings, typed handler shape, catalogue/tokens, OS-managed framing, no custom drag/resize/title controls, no hidden future entities/commands, no remote assets, and no production network path without banning inert Monaco/Vite bundle strings; Supports: ED-VS-06 in `frontend/scripts/archtest.mjs`, `internal/apperr/architecture_test.go`, and `frontend/src/ui/components/CodeEditor.bundle.test.ts`
- [ ] T036 Owns: FR-ED-026. Owner: ED-VS-06. Preserve the ordinary OS-managed frame, public native runtime boundaries, single acknowledged state owners, bundled assets, and offline/privacy contract; add no custom title/drag/resize substitute, private resize call, telemetry, update check, remote About navigation, Assistant/provider behavior, or outbound request in `main.go`, `frontend/src/logic/adapter/windowAdapter.ts`, `frontend/src/logic/actions/actionRegistry.ts`, and `frontend/scripts/archtest.mjs`
- [ ] T037 Owns: FR-ED-027. Owner: ED-VS-06. Guard every visual-only future item against file open/save/export, workspace enumeration, real tab state/lifecycle, image/file paste, renderer/plugin expansion, tidy/problemlist behavior, Assistant behavior, hidden backend commands, and manufactured success while retaining the required mockup fixtures and localized unavailable outcomes in `frontend/src/logic/actions/actionRegistry.ts`, `frontend/src/ui/widgets/EditorChrome.tsx`, `frontend/src/ui/widgets/ShellMenuRow.tsx`, and `frontend/scripts/archtest.mjs`
- [ ] T038 Run `just gen` if supported output changed, then run `just gen-check`, the named Go/Jest suites from `quickstart.md`, and `just archtest`; inspect every named test and retain commands, raw outcomes, and generated-binding parity before browser repair; Supports: ED-VS-01 through ED-VS-06 in `specs/002-editor-stage-formatting/evidence/editor-stage-focused.md`
- [ ] T039 Start `just dev`, open its printed local DevServer URL in the in-app browser, operate actual controls for ED-LIVE-001 through ED-LIVE-004 at 1280/768/375 in all six palettes, instrument the local-origin-only request journey, fix/reload/recheck every visible defect, and retain root attributes, focus, bounding boxes, unavailable outcomes, formatting/undo observations, responsive-width behavior, and absence results in `specs/002-editor-stage-formatting/evidence/editor-stage-live.md` and `specs/002-editor-stage-formatting/evidence/editor-stage-browser.json`
- [ ] T040 Run the complete `frontend/e2e/editor-stage.test.ts` 18-case matrix from `frontend/`, then run `just fmt-check`, `just typecheck`, `just lint`, `just test`, `just archtest`, `just frontend-build`, `just build`, `just check`, and `just verify 002-editor-stage-formatting`; compare every reliable result with T001 and repair every new finding without weakening a gate in `specs/002-editor-stage-formatting/evidence/editor-stage-verification.md`
- [ ] T041 Launch the real `just build` output and execute ED-LIVE-005 on the current host: verify native frame/movement/title gestures/border resizing/close ownership, appearance continuity, File/Settings/View/About, visual tabs, toolbar/overflow, formatting, acknowledged editor settings, context menu, shortcuts dialog, deferred outcomes, and all excluded behavior boundaries; record host and Windows/Linux runtime limits honestly in `specs/002-editor-stage-formatting/evidence/editor-stage-native.md`
- [ ] T042 Reconcile the implementation and retained evidence against every `FR-ED-001` through `FR-ED-027`, `SC-ED-001` through `SC-ED-009`, the contract, quickstart, deferred-source matrix, and T001 baseline; classify each difference as a code defect, approved specification amendment, or unresolved blocker in `specs/002-editor-stage-formatting/evidence/editor-stage-reconciliation.md`

**Feature checkpoint**: Do not claim this slice complete unless the baseline is trustworthy, all 27 owners and
named tests pass, architecture is green, generated bindings are current, the real controls and complete
browser matrix have been inspected, request instrumentation is clean, the current-host real build preserves
the OS frame, and reconciliation has no unresolved in-scope difference.

---

## Dependencies and Execution Order

### Phase dependencies

1. T001 is the first hard gate and blocks every production edit.
2. T002 fails before T003 → T004 → T005 establish the shared registry, frozen bindings, and scoped
   dispatcher. These tasks serialize because they share action identities and shortcut dispatch.
3. T006 fails before T007 → T008 → T009 → T010 → T011 → T012 → T013 deliver pure transformations,
   the one-edit executor, and identity-safe synchronization. Shared formatter/editor seams require order.
4. After T013, T014 and T015 may run in parallel. Both fail before T016 adds canonical settings and T017
   completes handler/adapter/bridge/generated-binding integration.
5. After T017, T018 and T019 may run in parallel. Both fail before T020 → T021 → T022 → T023 → T024 →
   T025 → T026 → T027 → T028 → T029 build the shared menu/chrome/style surfaces in order.
6. T030 fails after T029, then T031 → T032 complete context-menu and shortcuts discovery without competing
   identities.
7. T033 and T035 are written before their corresponding production safeguards; T033 → T034 and
   T035 → T036 → T037. Because the production paths overlap, implement T034 before T036–T037.
8. T038 → T039 → T040 → T041 → T042 is sequential: focused/static proof, live browser repair and retained
   observations, current automated/full gates, real-build evidence, then reconciliation.

### User-story dependency graph

```text
trustworthy baseline
      |
canonical action/shortcut registry and scoped dispatcher
      |
US2 formatting seam and identity-bound one-edit behavior
      |
US3 acknowledged editor settings and adapter parity
      |
US1 complete responsive Editor-stage chrome
      |
US4 registry-derived context menu and shortcuts discovery
      |
deferred/offline/native safeguards -> focused proof -> live browser repair
      |
full gates and 18-case matrix -> current-host real build -> reconciliation
      |
STOP: file lifecycle, real tabs, workspace, paste/assets, renderer, tidy, and Assistant remain downstream
```

US1 and US2 are both P1, but the plan's technical dependency is authoritative: the visible toolbar must
consume the tested formatting and acknowledged settings seams, so US2 and US3 foundations precede the US1
surface. Each story retains the independent test described in its phase; the feature ships only after all
four stories and Phase 7 converge.

### Parallel opportunities

```text
After T013, T014 and T015 may run in parallel because the complete Go/settings and frontend/editor test
file sets are disjoint. After T017, T018 and T019 may run in parallel because component-test and Playwright
files are disjoint. No implementation or evidence task is marked [P]: registry, formatter, adapter, shell,
style, architecture, and evidence paths otherwise overlap or consume unfinished behavior.
```

---

## Implementation Strategy

### Suggested MVP scope

The suggested MVP is T001–T029: trustworthy baseline, canonical registry, complete Phase 04 formatting,
acknowledged editor settings, and the complete US1 Editor-stage chrome. It is the first dependency-complete
visible increment. T030–T042 remain required for the full feature because discovery, deferred-boundary,
offline, live, real-build, and reconciliation obligations are active requirements, not optional polish.

### Incremental delivery

1. Capture the reliable baseline and stop on an unreliable gate.
2. Establish the one registry/dispatcher, then deliver bounded formatting and acknowledged editor settings
   behind named failing-first tests.
3. Build the mockup-shaped responsive chrome on those working seams without implementing future behavior.
4. Add context-menu and shortcut discovery from the same identities.
5. Prove deferred/offline/native boundaries, repair the running interface, run current gates and the full
   matrix, walk the real build, and reconcile every requirement.

### Deliberate stop boundary

After T042, stop decomposition. File/launcher behavior waits for safe New/Open/Save/Close and a valid
zero-document model. Real tabs wait for document identity plus file lifecycle. Paste/assets, renderer/search,
tidy/lint/problems/PDF, workspace, and Assistant/provider work remain separate dependency-complete slices.

## Notes

- `[P]` tasks have fully disjoint paths and no unfinished producer dependency.
- Story labels map implementation work to the four specified user stories; setup/foundation/evidence tasks
  intentionally have no story label.
- Supporting tests and evidence never duplicate `Owns:`. Every implementation owner names its plan slice.
- Changes remain unstaged and uncommitted unless explicitly requested.
