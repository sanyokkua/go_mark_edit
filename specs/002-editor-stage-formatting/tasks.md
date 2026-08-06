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

- [x] T001 Run `just baseline 002-editor-stage-formatting`, inspect every recorded exit code/raw output/reliability verdict, require `just archtest` to be green, and retain the comparison point; Supports: ED-VS-01 through ED-VS-06 in `specs/002-editor-stage-formatting/evidence/`

**Hard stop**: If any nonzero gate analyzed no target or is marked `UNRELIABLE`, or architecture is red,
repair the unchanged official gate or re-plan before T002. Do not record an empty result and continue.

---

## Phase 2: Foundational — Canonical Action and Shortcut Registry (Blocking)

**Purpose**: Establish the single registry and scoped dispatcher required by every story surface.

> Write T002 first and confirm the unique-identity, binding, platform-label, scope, availability, modal,
> and native-role assertions fail before T003–T005.

- [x] T002 Add failing registry and dispatcher tests for every Editor-stage identity, localized metadata, ordered surface membership, available/deferred state, frozen bindings, macOS/Windows/Linux rendering, native macOS clipboard exclusions, editor/document/window scope, writable-document checks, modal suppression, and classified unavailable/mismatch outcomes; Supports: ED-VS-01 in `frontend/src/logic/actions/actionRegistry.test.ts`, `frontend/src/logic/actions/shortcutRegistry.test.ts`, `frontend/src/logic/actions/shellActions.test.ts`, and `frontend/src/logic/actions/useShellShortcuts.test.tsx`
- [x] T003 Owns: FR-ED-011. Owner: ED-VS-01. Create one typed registry for every visible Editor-stage action with stable identity, catalogue/accessibility keys, scope, availability, shortcut, ordered surface membership, and typed invocation; migrate existing Settings/View/About/full-screen consumers without retaining a competing catalogue in `frontend/src/logic/actions/actionRegistry.ts` and `frontend/src/logic/actions/shellActions.ts`
- [x] T004 Owns: FR-ED-020. Owner: ED-VS-01. Implement the frozen Editor-stage binding set and platform-correct Ctrl/Cmd and Alt/Option accelerator rendering without shadowing reserved Monaco, find/replace, native clipboard, or existing keys in `frontend/src/logic/actions/shortcutRegistry.ts` and `frontend/src/logic/actions/useShellShortcuts.ts`
- [x] T005 Owns: FR-ED-021. Owner: ED-VS-01. Implement the canonical dispatcher checks for deferred availability, modal suppression, focused identity-bound editor scope, writable current-document scope, focused-window scope, and typed `mutated`/`unavailable`/`document-mismatch` outcomes without synthetic success in `frontend/src/logic/actions/actionDispatcher.ts` and `frontend/src/logic/actions/useShellShortcuts.ts`

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

- [x] T006 [US2] Add failing pure and editor-integration tests for selected-range/current-line bounds, marker pairs immediately inside/outside selections, empty-caret placement, ATX add/replace/remove, line-by-line list conversion/removal with canonical `1. ` numbered markers and no auto-renumbering, Quote, Link, the empty GFM table skeleton, preference inputs, one contiguous edit/undo group, identity mismatch, buffer routing, focused projection safety, and surface-specific invocation coverage: Bold/Italic/Link through toolbar, keyboard, and context menu; Heading/list/Quote/Table through toolbar and keyboard, plus approved overflow wherever exposed; Supports: ED-VS-02 in `frontend/src/logic/format/formatting.test.ts`, `frontend/src/logic/hooks/useDocumentCommands.test.ts`, `frontend/src/ui/components/CodeEditor.test.tsx`, and `frontend/src/ui/widgets/EditorView.integration.test.tsx`
- [x] T007 [US2] Owns: FR-ED-013. Owner: ED-VS-02. Implement Bold, Italic, Strikethrough, and Inline-code pair add/remove behavior, including markers just outside a selection and empty-pair caret placement, while preserving exact original bytes after the second toggle in `frontend/src/logic/format/formatting.ts`
- [x] T008 [US2] Owns: FR-ED-014. Owner: ED-VS-02. Implement ATX Heading 1/2/3 add, level replacement, and same-level removal without inventing Setext conversion or an H3 fallback in `frontend/src/logic/format/formatting.ts`
- [x] T009 [US2] Owns: FR-ED-015. Owner: ED-VS-02. Implement line-by-line Bullet, Numbered, and Task-list add/convert/remove behavior using canonical `-` bullets, canonical `1. ` numbered markers per affected line, task markers, and acknowledged Markdown marker inputs; convert other list markers to `1. `, remove same-kind markers, and never auto-renumber, as one bounded replacement in `frontend/src/logic/format/formatting.ts`
- [x] T010 [US2] Owns: FR-ED-016. Owner: ED-VS-02. Implement Quote, source-only Link, and empty GFM Table transformations through the common formatter, and retain Image as a localized deferred registry entry with no file, asset, clipboard-conversion, or network path in `frontend/src/logic/format/formatting.ts` and `frontend/src/logic/actions/actionRegistry.ts`
- [x] T011 [US2] Owns: FR-ED-012. Owner: ED-VS-02. Define the pure bounded `FormatRequest`/edit-result contract so nonempty selections change only their range and empty selections change only the current line or insertion point, then route it exclusively through the existing document-command seam in `frontend/src/logic/format/formatting.ts` and `frontend/src/logic/hooks/useDocumentCommands.ts`
- [x] T012 [US2] Owns: FR-ED-017. Owner: ED-VS-02. Apply each Phase 04 formatting result as exactly one Monaco `executeEdits` operation bracketed by the existing undo stops, keep Format/Compact/Lint outside this mutation path, and preserve useful caret/selection intent in `frontend/src/ui/components/CodeEditor.tsx` and `frontend/src/ui/widgets/EditorView.tsx`
- [x] T013 [US2] Owns: FR-ED-024. Owner: ED-VS-02. Preserve Go/appmodel canonical state, Redux projection-only updates, the identity-bound Monaco working copy, flush/read ordering, stale-session refusal, and no full-content echo that resets caret, selection, scroll, or undo during formatting in `frontend/src/logic/hooks/useDocumentCommands.ts`, `frontend/src/ui/widgets/editorSession.ts`, `frontend/src/ui/widgets/EditorView.tsx`, and `frontend/src/logic/store/appModelProjection.ts`

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

- [x] T014 [P] [US3] Add failing Go settings model, service, repository, and handler tests for EditorSettings defaults, exactly accepted font sizes 13/14/16, rejected values, additive KV persistence, acknowledged failure retention, typed no-context named-result first-statement panic-safe handler behavior, and reset isolation; Supports: ED-VS-03 in `internal/apperr/results_test.go`, `internal/settings/service_test.go`, `internal/settings/repository_sqlite_test.go`, and `internal/settings/handler_test.go`
- [x] T015 [P] [US3] Add failing adapter, development-bridge, projection, and editor integration tests for DTO/arity parity, acknowledged updates, rejected-write retention, line-number/wrap/font-size projection, and in-place Monaco option updates preserving model identity/content/caret/selection/scroll/undo; Supports: ED-VS-03 in `frontend/src/logic/adapter/services.test.ts`, `frontend/src/dev/bridge-mock/bridge.test.ts`, `frontend/src/logic/store/appModelProjection.test.ts`, `frontend/src/ui/components/CodeEditor.test.tsx`, and `frontend/src/ui/widgets/EditorView.integration.test.tsx`
- [x] T016 [US3] Owns: FR-ED-022. Owner: ED-VS-03. Add backend-authoritative `EditorSettings` with line numbers on, word wrap off, font size 14 default, exactly 13/14/16 validation, additive immediate persistence, acknowledged projection, and in-place Monaco option consumption without content mutation or remounting in `internal/apperr/results.go`, `internal/settings/model.go`, `internal/settings/repository.go`, `internal/settings/repository_sqlite.go`, `internal/settings/service.go`, `frontend/src/logic/store/appModelTypes.ts`, `frontend/src/logic/store/appModelProjection.ts`, `frontend/src/ui/components/CodeEditor.tsx`, and `frontend/src/ui/widgets/EditorView.tsx`
- [x] T017 [US3] Owns: FR-ED-025. Owner: ED-VS-03. Extend the typed Settings handler, sole frontend adapter, development bridge, and composition wiring for EditorSettings; keep binding arity/result guards and handler architecture intact, run `just gen`, and never hand-edit generated output in `internal/settings/handler.go`, `internal/application/application_context_holder.go`, `frontend/src/logic/adapter/settingsTypes.ts`, `frontend/src/logic/adapter/services.ts`, `frontend/src/logic/adapter/index.ts`, `frontend/src/dev/bridge-mock/go/settings/SettingsHandler.ts`, and generated `frontend/wailsjs/go/settings/SettingsHandler.d.ts`, `frontend/wailsjs/go/settings/SettingsHandler.js`, and `frontend/wailsjs/go/models.ts`

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

- [x] T018 [P] [US1] Add failing real-component tests for exact File/Settings/View/About order and inventories, visual tab fixtures, both sidebar controls, the shared deferred `toggle-assistant` identity and localized unavailable outcome, all toolbar groups, arrangement, six-palette token/catalogue/focus behavior, one-pane preservation, and absence of file/tab/Assistant state, panels, provider calls, or commands; Supports: ED-VS-04 in `frontend/src/ui/widgets/ShellMenuRow.test.tsx`, `frontend/src/ui/widgets/EditorChrome.test.tsx`, `frontend/src/ui/widgets/AppShell.test.tsx`, and `frontend/src/ui/widgets/EditorView.test.tsx`
- [x] T019 [P] [US1] Add failing Playwright journeys for all 18 width/palette combinations, actual pointer and keyboard menu/toolbar use, root attributes, bounding-box reachability, 768/375 overflow relocation, one-row toolbar, no page-level horizontal scroll, contained visual tab-strip scrolling at 375 without tab state/menu/command, responsive sidebar states, and no responsive width persistence; Supports: ED-VS-04 in `frontend/e2e/editor-stage.test.ts`
- [x] T020 [US1] Owns: FR-ED-001. Owner: ED-VS-04. Render one in-app File/Settings/View/About row in that order directly below the ordinary native title bar while preserving OS movement, resizing, controls, title gestures, and existing shell placement in `frontend/src/ui/widgets/ShellMenuRow.tsx`, `frontend/src/ui/widgets/ShellMenuRow.module.css`, and `frontend/src/ui/widgets/AppShell.tsx`
- [x] T021 [US1] Owns: FR-ED-002. Owner: ED-VS-04. Add the exact File menu shape—New File, New Window, Open File, Open Folder, Open Recent, Reopen, Save, Save As, Export to PDF, Close Tab, and Exit—as localized deferred fixtures with no file/tab command, while retaining any already implemented action only under its existing contract in `frontend/src/logic/actions/actionRegistry.ts`, `frontend/src/ui/widgets/ShellMenuRow.tsx`, and `frontend/src/i18n/locales/en.json`
- [x] T022 [US1] Owns: FR-ED-003. Owner: ED-VS-04. Render the exact Settings inventory and grouping from registry state, keep delivered appearance and Markdown marker controls working, wire Editor line-number/wrap/13/14/16 settings, keep lifecycle/renderer/tidy items visibly unavailable, and omit every Assistant settings group in `frontend/src/ui/widgets/SettingsMenu.tsx`, `frontend/src/logic/actions/actionRegistry.ts`, and `frontend/src/i18n/locales/en.json`
- [x] T023 [US1] Owns: FR-ED-004. Owner: ED-VS-04. Render View items in mockup order; reuse working Editor/Split/Preview, left-sidebar, line-number, word-wrap, and full-screen commands with one-pane preservation; make Toggle Assistant share the deferred `toggle-assistant` registry identity and localized unavailable outcome with the right-side control, keep Distraction-free reading unavailable, and change no native-shell ownership in `frontend/src/ui/primitives/ViewMenu.tsx`, `frontend/src/logic/actions/actionRegistry.ts`, `frontend/src/logic/store/docViewCommands.ts`, and `frontend/src/logic/store/uiLayoutCommands.ts`
- [x] T024 [US1] Owns: FR-ED-005. Owner: ED-VS-04. Render Keyboard shortcuts, Open logs folder, View on GitHub (MIT), and About GoMarkEdit in order; retain the existing local About/version owner, keep logs/GitHub unavailable, and add no remote URL opening or duplicate native macOS About path in `frontend/src/ui/widgets/ShellMenuRow.tsx`, `frontend/src/logic/actions/actionRegistry.ts`, `frontend/src/ui/widgets/AboutDialog.tsx`, and `frontend/src/i18n/locales/en.json`
- [x] T025 [US1] Owns: FR-ED-006. Owner: ED-VS-04. Add the representative `release-notes.md` and `spec-draft.md` visual tab presentation with modified dot, close, and add affordances as inert accessible fixtures only; allow contained horizontal tab-strip scrolling at 375 as visual layout only; create no canonical tab identity, lifecycle, switching, ordering, persistence, restore, tab-management overflow state/menu/command, file path, or backend call in `frontend/src/ui/widgets/EditorChrome.tsx` and `frontend/src/ui/widgets/EditorChrome.module.css`
- [x] T026 [US1] Owns: FR-ED-007. Owner: ED-VS-04. Expose and reuse the acknowledged left workspace/sidebar visibility command across desktop, 768-pixel rail, and 375-pixel off-canvas presentations while preventing responsive-only width write-back to durable desktop layout in `frontend/src/ui/widgets/AppShell.tsx`, `frontend/src/ui/widgets/AppShell.module.css`, `frontend/src/logic/store/uiLayoutCommands.ts`, and `frontend/src/ui/widgets/EditorChrome.tsx`
- [x] T027 [US1] Owns: FR-ED-008. Owner: ED-VS-04. Render an inspectable localized right-side visibility control that resolves through the shared deferred `toggle-assistant` registry entry and localized unavailable outcome used by the View item; create no panel, layout field, Assistant content/state/landmark, provider call, network request, or placeholder, leaving the left sidebar as the only functional sidebar action in `frontend/src/logic/actions/actionRegistry.ts`, `frontend/src/ui/widgets/EditorChrome.tsx`, and `frontend/src/ui/widgets/AppShell.tsx`
- [x] T028 [US1] Owns: FR-ED-009. Owner: ED-VS-04. Build the one-row EditorChrome groups for inline text, Heading 1/2/3, lists/Quote, Link/Image/Table, `»` overflow, and Editor/Split/Preview; relocate list/link groups at 768 and text/arrangement at 375 so every action remains pointer/keyboard reachable without page-level clipping in `frontend/src/ui/widgets/EditorChrome.tsx`, `frontend/src/ui/widgets/EditorChrome.module.css`, `frontend/src/ui/widgets/EditorView.tsx`, and `frontend/src/ui/widgets/EditorView.module.css`
- [x] T029 [US1] Owns: FR-ED-010. Owner: ED-VS-04. Place Format, Compact, and Lint with their exact labels and registry metadata in every required toolbar/overflow location, expose localized deferred availability, and provide no formatter, linter, problems, gate, source-mutation, or successful document-operation path in `frontend/src/logic/actions/actionRegistry.ts`, `frontend/src/ui/widgets/EditorChrome.tsx`, and `frontend/src/i18n/locales/en.json`

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

- [x] T030 [US4] Add failing context-menu and shortcuts-dialog tests for exact registry order/separators, no Lint context item, shared identities, platform accelerators, surface-specific formatting coverage, pointer session retention, focus trap, Escape, opener restoration, modal suppression, translated long labels, semantic roles, visible focus, reduced motion, and all six palettes; Supports: ED-VS-05 in `frontend/src/ui/widgets/EditorContextMenu.test.tsx` and `frontend/src/ui/widgets/ShortcutsDialog.test.tsx`
- [x] T031 [US4] Owns: FR-ED-019. Owner: ED-VS-05. Implement the registry-derived editor context menu in the exact Cut/Copy/Paste/Paste-as-plain-text, Bold/Italic/Link, Format/Compact, Command-palette order and separators, preserve native clipboard ownership, omit Lint, dispatch the originating editor session's shared identity, and keep Heading/list/Quote/Table on their toolbar and keyboard surfaces, plus approved overflow surfaces wherever exposed, rather than adding them to the context menu in `frontend/src/ui/widgets/EditorContextMenu.tsx`, `frontend/src/ui/widgets/EditorContextMenu.module.css`, and `frontend/src/ui/widgets/EditorView.tsx`
- [x] T032 [US4] Owns: FR-ED-023. Owner: ED-VS-05. Implement the registry-derived modal Shortcuts dialog and complete catalogue, semantic-role, accessible-name, two-layer focus, reduced-motion, long-label, and centralized-token behavior for menus, controls, tooltips, overflows, unavailable outcomes, and errors across all six palettes in `frontend/src/ui/widgets/ShortcutsDialog.tsx`, `frontend/src/ui/widgets/ShortcutsDialog.module.css`, `frontend/src/ui/widgets/ShellMenuRow.tsx`, `frontend/src/ui/widgets/EditorChrome.tsx`, `frontend/src/i18n/locales/en.json`, and `frontend/src/ui/styles/tokens.css`

**User Story 4 checkpoint**: Every required discovery surface renders from the one registry, keyboard scope
and modality are enforced, and no duplicated label, binding, or handler remains.

---

## Phase 7: Deferred Boundaries, Offline Safeguards, and Completion Evidence

**Purpose**: Prove that visible future controls remain honest unavailable surfaces, preserve native/offline
architecture, exercise the live interface and real build, and reconcile every owned requirement.

> Write T033 and T035 first and confirm the no-mutation/no-gate and architecture/absence assertions fail for
> missing safeguards before T034 and T036–T037.

- [x] T033 Add failing deferred-action integration tests that snapshot source, selection, caret, scroll, undo, problems, projection, layout, Assistant state/panel, operation-gate calls, adapter/backend/provider calls, files, and requests before and after Format/Compact/Lint and shared `toggle-assistant` dispatch from required surfaces; Supports: ED-VS-06 in `frontend/src/logic/actions/actionDispatcher.test.ts`, `frontend/src/ui/widgets/EditorChrome.test.tsx`, and `frontend/src/ui/widgets/EditorView.integration.test.tsx`
- [x] T034 Owns: FR-ED-018. Owner: ED-VS-06. Make deferred Format/Compact/Lint resolve deterministically to the localized unavailable result before command or gate acquisition, with no partial source/editor/problems/projection/layout mutation and no backend/file/network call in `frontend/src/logic/actions/actionDispatcher.ts` and `frontend/src/ui/widgets/EditorChrome.tsx`
- [x] T035 Add failing semantic architecture and bundle/offline safeguards for adapter-only generated bindings, typed handler shape, catalogue/tokens, OS-managed framing, no custom drag/resize/title controls, no hidden future entities/commands, no remote assets, and no production network path without banning inert Monaco/Vite bundle strings; Supports: ED-VS-06 in `frontend/scripts/archtest.mjs`, `internal/apperr/architecture_test.go`, and `frontend/src/ui/components/CodeEditor.bundle.test.ts`
- [x] T036 Owns: FR-ED-026. Owner: ED-VS-06. Preserve the ordinary OS-managed frame, public native runtime boundaries, single acknowledged state owners, bundled assets, and offline/privacy contract; add no custom title/drag/resize substitute, private resize call, telemetry, update check, remote About navigation, Assistant/provider behavior, or outbound request in `main.go`, `frontend/src/logic/adapter/windowAdapter.ts`, `frontend/src/logic/actions/actionRegistry.ts`, and `frontend/scripts/archtest.mjs`
- [x] T037 Owns: FR-ED-027. Owner: ED-VS-06. Guard every visual-only future item against file open/save/export, workspace enumeration, real tab state/lifecycle, image/file paste, renderer/plugin expansion, tidy/problemlist behavior, Assistant behavior, hidden backend commands, and manufactured success while retaining the required mockup fixtures and localized unavailable outcomes in `frontend/src/logic/actions/actionRegistry.ts`, `frontend/src/ui/widgets/EditorChrome.tsx`, `frontend/src/ui/widgets/ShellMenuRow.tsx`, and `frontend/scripts/archtest.mjs`
- [x] T038 Run `just gen` if supported output changed, then run `just gen-check`, the named Go/Jest suites from `quickstart.md`, and `just archtest`; inspect every named test and retain commands, raw outcomes, and generated-binding parity before browser repair; Supports: ED-VS-01 through ED-VS-06 in `specs/002-editor-stage-formatting/evidence/editor-stage-focused.md`
- [x] T039 Start `just dev`, open its printed local DevServer URL in the in-app browser, operate actual controls for ED-LIVE-001 through ED-LIVE-004 at 1280/768/375 in all six palettes, instrument the local-origin-only request journey, fix/reload/recheck every visible defect, and retain root attributes, focus, bounding boxes, unavailable outcomes, formatting/undo observations, responsive-width behavior, and absence results in `specs/002-editor-stage-formatting/evidence/editor-stage-live.md` and `specs/002-editor-stage-formatting/evidence/editor-stage-browser.json`
- [x] T040 Run the complete `frontend/e2e/editor-stage.test.ts` 18-case matrix from `frontend/`, then run `just fmt-check`, `just typecheck`, `just lint`, `just test`, `just archtest`, `just frontend-build`, `just build`, `just check`, and `just verify 002-editor-stage-formatting`; compare every reliable result with T001 and repair every new finding without weakening a gate in `specs/002-editor-stage-formatting/evidence/editor-stage-verification.md`
- [x] T041 Launch the real `just build` output and execute ED-LIVE-005 on the current host: verify native frame/movement/title gestures/border resizing/close ownership, appearance continuity, File/Settings/View/About, visual tabs, toolbar/overflow, formatting, acknowledged editor settings, context menu, shortcuts dialog, deferred outcomes, and all excluded behavior boundaries; record host and Windows/Linux runtime limits honestly in `specs/002-editor-stage-formatting/evidence/editor-stage-native.md`
- [x] T042 Reconcile the implementation and retained evidence against every `FR-ED-001` through `FR-ED-027`, `SC-ED-001` through `SC-ED-009`, the contract, quickstart, deferred-source matrix, and T001 baseline; classify each difference as a code defect, approved specification amendment, or unresolved blocker in `specs/002-editor-stage-formatting/evidence/editor-stage-reconciliation.md`

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

## Phase 8: Convergence

**Purpose**: Close the implementation gaps found by assessing the current code against the active
specification, plan, action contract, data model, constitution, and retained evidence after T042.

- [x] T043 Make the action registry's typed dispatcher the production invocation route for toolbar, keyboard, overflow, context-menu, and shell actions; enforce window/application focus, deferred/modal/editor/document scope checks, and derive shortcut bindings and surface membership from one registry while preserving native clipboard roles and adding regression proof per FR-ED-011, FR-ED-019, FR-ED-020, FR-ED-021, the action contract, and ED-VS-01/05 (partial)
- [x] T044 Thread acknowledged Markdown marker preferences from the existing settings projection through EditorChrome and EditorContextMenu into the shared formatter, proving bullet/emphasis preference behavior without inventing Setext conversion per FR-ED-015, data-model.md, plan ED-VS-02, and the existing settings contract (partial)
- [x] T045 Keep the Markdown Standard inventory visible but localized unavailable/inert, preventing deferred Standard behavior from being persisted or reported as an active renderer setting per FR-ED-003, the Markdown traceability disposition, and ED-VS-04 (partial)
- [x] T046 Preserve every selected line and bounded source byte when applying Heading 1/2/3 to a multi-line selection, with regression coverage for line-by-line behavior and no content deletion per FR-ED-012, FR-ED-014, SC-ED-004, and ED-VS-02 (partial)
- [x] T047 Render platform-resolved accelerator text or keyboard metadata for the exact editor context-menu inventory from the canonical registry without adding Lint or changing surface membership per FR-ED-019, FR-ED-023, the action contract, and ED-VS-05 (partial)

## Phase 9: Convergence

**Purpose**: Close the remaining in-scope implementation gaps found by assessing the current source against the active specification, plan, action contract, constitution, and retained evidence after T047.

- [x] T048 Wire the registered `Mod+\\` Toggle Sidebar shortcut and all affected visible window/application actions through the scope-aware dispatcher, requiring explicit focused-window/application context and preserving modal suppression, existing native roles, and the current sidebar behavior per FR-ED-011, FR-ED-020, FR-ED-021, and ED-VS-01/T043 (missing)
- [x] T049 Make the requested right-side visibility control registry-derived and share the deferred `toggle-assistant` identity and localized unavailable outcome with the View item, while preserving the absence of Assistant state, panel, provider, layout, and network behavior per FR-ED-008, FR-ED-011, and ED-VS-04 (partial)
- [x] T050 Make the representative tab fixtures explicitly decorative or unavailable rather than focusable no-op tab actions, while retaining only the approved contained visual tab-strip scrolling at 375 pixels and no canonical tab state or lifecycle per FR-ED-006, FR-ED-027, and Constitution VI (contradicts)
- [x] T051 Render registry-derived scope and localized deferred availability in the Shortcuts dialog so Format, Compact, and Lint remain visibly unavailable without adding execution or changing the exact context-menu inventory per FR-ED-023, SC-ED-009, the action contract, and ED-VS-05 (partial)
- [x] T052 Preserve the `Open Recent` submenu and representative recent-entry fixtures in the narrow File overflow path without enabling file, workspace, or tab lifecycle behavior per FR-ED-002, US1/AC2, and ED-VS-04 (partial)
- [x] T053 Render the required `Reading (Viewer)` and `Editor` Default open mode fixtures as visibly unavailable/inert Settings inventory items without persisting or activating file lifecycle behavior per FR-ED-003 and ED-VS-04 (partial)

## Phase 10: Convergence

**Purpose**: Close the remaining review-confirmed gaps found by assessing the current source against the active specification, plan, action contract, data model, constitution, and retained evidence after T053.

- [x] T054 CRITICAL Move acknowledged editor and Markdown settings projection out of the frontend-local React provider and back through the existing Go/settings authority, Redux projection, and adapter acknowledgement path, preserving failure retention and in-place Monaco updates per Constitution III, FR-ED-024, plan ED-VS-03, and data-model.md (contradicts)
- [x] T055 CRITICAL Expand and retain Editor-stage browser/live evidence that exercises the required formatting, platform shortcuts, context menu, sidebar controls, and 768-pixel overflow reachability across the specified responsive/palette matrix, and align SC claims with observed evidence per Constitution VII, SC-ED-001, SC-ED-003, SC-ED-008, and ED-VS-06 (partial)
- [x] T056 Normalize real keyboard events by physical key/code and platform modifiers, include the registered Settings shortcut in shell dispatch, and add shifted-binding regression coverage without changing the frozen registry per FR-ED-020, FR-ED-021, and ED-VS-01 (partial)
- [x] T057 Apply formatter caret/selection intent through the identity-bound Monaco document-command seam as part of the bounded edit, proving empty-pair caret placement and selected-range intent per FR-ED-013, FR-ED-017, US2/AC2, the caret/selection intent contract, and ED-VS-02 (partial)
- [x] T058 Include the Shortcuts dialog in modal suppression state so background shell/editor/document shortcuts cannot dispatch while it is open, with regression coverage for F11, Settings, Toggle Sidebar, and editor actions per FR-ED-021, US4/AC3, and ED-VS-05 (partial)
- [x] T059 Preserve native clipboard ownership while reporting actual clipboard command outcomes, implement a genuine paste-as-plain-text path, and prevent failed or ignored clipboard commands from returning mutated per FR-ED-019, FR-ED-021, the classified-outcome contract, and ED-VS-05 (partial)
- [x] T060 Derive the About trigger label from localized catalogue data without English-only suffix manipulation and add long-label/localization coverage per FR-ED-005, FR-ED-023, and ED-VS-04 (partial)

## Phase 11: Convergence

**Purpose**: Close the dispatcher and release-evidence gaps found by the post-T060 review without broadening the Editor-stage scope or changing any deferred boundary.

- [x] T061 Route every actual Settings, View, About, and Keyboard shortcuts invocation surface through the canonical typed action dispatcher, retaining local structural menu-open state only where no registry action executes; require application/window focus and modal suppression, preserve native clipboard roles and every File/tab/Assistant/tidy/network deferral, and add regression proof per FR-ED-011, FR-ED-020, FR-ED-021, the action contract, and ED-VS-01 (partial)
- [x] T062 Reconcile the retained Editor-stage release evidence with a fresh non-concurrent official verifier, 54-case browser matrix, and current-host packaged-build walkthrough; correct the stale M3-blocker claim, separately record the generated `git diff --check`/`just gen-check` tracking result without hand-editing generated bindings, and preserve the explicit deferred-boundary and out-of-host limitations per SC-ED-005, SC-ED-006, SC-ED-007, Constitution VII, and ED-VS-06 (partial)

## Phase 12: Convergence

- [x] T063 Replace whole-document source splitting and prefix copying in the formatter's offset, position, and line-bound helpers with bounded selected-range/current-line window operations, and add large-document regression evidence proving unrelated document length does not expand transformation work while preserving exact edit spans and caret/selection intent per FR-ED-012, T011, SC-ED-004, and ED-VS-02 (partial)

## Phase 13: Convergence

**Purpose**: Repair the implementation and live-surface gaps confirmed after the T063 audit and the
approved editor-behavior research. This phase preserves the existing Editor-stage boundary: it does not
implement real file lifecycle, real tab lifecycle, image/file paste, TSV/CSV conversion, renderer expansion,
Format/Compact/Lint document behavior, problems/lint, Assistant/provider behavior, or network paths.

**Implementation rule**: Each task below is remediation work for the current feature. Implement through the
existing canonical action registry, Go/settings authority, Redux projection, identity-bound Monaco session,
document-command seam, popup/focus primitives, and OS-managed native shell. Do not rewrite earlier tasks or
change `docs/delivery/` normative artifacts.

- [x] T064 [US2] HIGH Repair inline Markdown formatting semantics for Bold, Italic, Strikethrough, and Inline code: cancel an empty marker pair on a repeated invocation, toggle an unambiguous existing span under a collapsed caret, keep surrounding whitespace outside markers, preserve list/quote prefixes, and apply multiline selections per paragraph/list item rather than wrapping unrelated blocks per FR-ED-013, FR-ED-017, SC-ED-003, and SC-ED-004 (partial)
  - Acceptance criteria: an empty caret inserts one pair with the caret inside; invoking the same action again removes that empty pair; a selected word/phrase toggles add/remove and restores the original bytes; a collapsed caret inside an ordinary unformatted word does not guess and wrap the whole word; selected leading/trailing whitespace remains outside the markers; multiline content is formatted without consuming list or quote prefixes.
  - Proof: extend `frontend/src/logic/format/formatting.test.ts` with empty-pair cancellation, existing-span/caret, whitespace, list/quote, and multiline cases; verify toolbar, shortcut, overflow, and context-menu paths produce the same edit and one undo step.

- [x] T065 [US2] HIGH Make block formatting actions mutually coherent: Heading 1/2/3 operate on complete lines, Bullet/Numbered/Task lists convert or remove complete-line markers, and Quote wraps/un-wraps lines without leaving stale heading/list syntax per FR-ED-012, FR-ED-014, FR-ED-015, FR-ED-016, US2/AC2, US2/AC3, and SC-ED-004 (contradicts)
  - Acceptance criteria: applying a list to `# Title` produces `- Title`, not `- # Title`; applying a heading to `- Title` produces `# Title`; the same heading/list kind toggles off; different kinds replace the current marker; selected lines are transformed independently; indentation is preserved; quote toggling preserves the inner heading/list content; numbered conversion remains canonical `1. ` with no auto-renumbering.
  - Proof: add formatter and integration cases for heading/list cross-conversion, mixed multiline selections, nested indentation, quote composition, caret placement, exact edit spans, and undo/selection restoration.

- [x] T066 [US2] HIGH Make Link and Table insertion predictable structured actions: edit an existing link instead of nesting, keep link source-only, insert tables at block boundaries, produce a useful two-column GFM skeleton, and place the caret in the first meaningful edit position per FR-ED-016, FR-ED-017, SC-ED-003, and the action contract (partial)
  - Acceptance criteria: selected text becomes `[text](url)` without a network request; an empty caret inserts `[](url)` with the label or URL placeholder selected; an existing link under the caret is edited rather than wrapped again; a table is never inserted in the middle of a sentence; a blank-line/table action creates at least two columns with a header, separator, and body row; arbitrary selected text is not silently treated as TSV/CSV; the first header cell receives the caret/selection intent.
  - Proof: extend `frontend/src/logic/format/formatting.test.ts`, `EditorView.integration.test.tsx`, and the browser journey for empty, inline, selected, existing-link, list, heading, and table contexts.

- [x] T067 [US2][US4] HIGH Preserve editor selection, caret, focus, scroll, and undo across every toolbar, shortcut, overflow, and context-menu invocation per FR-ED-012, FR-ED-017, FR-ED-019, FR-ED-021, Constitution III, and SC-ED-004 (partial)
  - Acceptance criteria: toolbar `mousedown` cannot destroy the Monaco selection; each command captures the originating editor session/range before popup interaction; line actions return mapped selection intent; empty-pair/link/table actions return deliberate caret intent; the editor regains focus after a command; each formatting operation produces one undo step; opening or closing a popup does not reset selection, scroll, or the identity-bound working copy; modal dialogs suppress background commands.
  - Proof: add regression coverage in `CodeEditor.test.tsx`, `useDocumentCommands.test.ts`, `EditorView.integration.test.tsx`, `EditorContextMenu.test.tsx`, and `ShortcutsDialog.test.tsx`; run real pointer and keyboard journeys at all required widths.

- [x] T068 [US1] HIGH Replace textual/truncated toolbar controls with mockup-shaped icon-first controls and coherent active/unavailable states per FR-ED-009, FR-ED-010, FR-ED-011, FR-ED-023, Constitution VI, and SC-ED-001 (contradicts)
  - Acceptance criteria: Bold, Italic, Strikethrough, Inline code, H1/H2/H3, Bullet/Numbered/Task list, Quote, Link, Image, Table, overflow, sidebar, Assistant, and arrangement controls use the approved symbol/icon treatment with localized tooltip and accessible name; `B...`, `I...`, `T...`, and similar textual truncation are not used as the normal control representation; Format/Compact/Lint retain their approved textual labels and visibly unavailable state; active arrangement and unavailable states are visually distinct; all controls remain keyboard reachable.
  - Proof: update component tests and visual/browser assertions for labels, icon metadata, tooltip names, active/disabled states, six palettes, and the 1280/768/375 mockup layouts.

- [x] T069 [US1] HIGH Rebuild the Editor-stage chrome to match the binding mockup’s visual hierarchy: native titlebar boundary, in-app menu row, tabs, editor/preview cards, pane headers, sidebar controls, status bar, spacing, borders, radii, typography, and tokenized surfaces per FR-ED-001, FR-ED-006, FR-ED-007, FR-ED-008, FR-ED-009, FR-ED-023, and `docs/delivery/spec/surface/mockup.html` (partial)
  - Acceptance criteria: the menu row sits directly below the native titlebar; tabs show `release-notes.md`, `spec-draft.md`, modified dot, close/add affordances, and mockup-consistent active/inactive styling; decorative tabs are not focusable fake commands; editor and preview headers expose the correct labels/metadata; split-pane spacing, divider, status bar, sidebar rail/off-canvas states, right-side unavailable control, card geometry, and theme tokens match the mockup at all required widths.
  - Proof: extend `EditorChrome.test.tsx`, `EditorView.test.tsx`, `AppShell.test.tsx`, and browser screenshots/bounding-box assertions against the named mockup screens across all six palettes.

- [x] T070 [US1][US4] HIGH Unify all popup/menu surfaces around one collision-safe, focus-safe menu behavior for File, Settings, View, About, toolbar overflow, Open Recent, context menus, shortcuts, and About dialogs per FR-ED-001 through FR-ED-005, FR-ED-019, FR-ED-021, FR-ED-023, Constitution VI, and SC-ED-008 (partial)
  - Acceptance criteria: every popup opens adjacent to its trigger or pointer, remains inside the viewport, flips direction when space is insufficient, and is not clipped by ancestor overflow; only the active popup/backdrop captures pointer events; outside click and Escape close it; opening another popup closes the previous one; opener focus is restored; menu rows and separators have consistent full width, padding, hover/focus, disabled, and unavailable styling; submenus open beside their parent without clipping; modal dialogs trap focus and suppress background shortcuts.
  - Proof: add integrated geometry/hit-testing and focus tests for every popup at 1280/768/375, long translated labels, all six palettes, keyboard navigation, Escape, outside click, and repeated open/close cycles; retain browser evidence for no invisible interaction-blocking overlay.

- [x] T071 [US4] HIGH Repair the editor context menu’s pointer placement, row sizing, selection snapshot, and clipboard outcomes per FR-ED-019, FR-ED-021, FR-ED-023, SC-ED-003, and SC-ED-008 (partial)
  - Acceptance criteria: the menu opens at the right-click location with viewport clamping/flipping; all menu items occupy the same width, including items after separators; the exact approved order and separators remain unchanged; the editor selection/session is captured when the menu opens; Cut, Copy, Paste, and Paste as plain text operate on that captured editor range; unsupported or failed clipboard operations are disabled or return a visible localized unavailable result and never claim mutation; formatting menu items use the same canonical formatter actions.
  - Proof: extend `EditorContextMenu.test.tsx` with edge/corner placement, width, selection retention, keyboard, failure, and clipboard cases; exercise the real context menu in the packaged/current-host walkthrough.

- [x] T072 [US1] HIGH Replace responsive hiding/truncation with the approved one-row overflow behavior per FR-ED-009, FR-ED-023, SC-ED-001, SC-ED-008, and the plan’s 1280/768/375 relocation decision (partial)
  - Acceptance criteria: at 1280 all mockup groups are visible in order; at 768 list/link groups move into the `»` popup; at 375 text/arrangement groups also move there; the popup contains each moved action exactly once; no page-level horizontal scrolling, clipped item, ellipsis-only control, or inaccessible action exists; only the contained visual tab strip may scroll horizontally; overflow placement stays within the viewport and closes cleanly.
  - Proof: run the full responsive browser matrix and add assertions for action reachability, uniqueness, bounding boxes, `scrollWidth === clientWidth` at 375, contained tab-strip scrolling, and overflow open/close behavior.

- [x] T073 [US1][US4] HIGH Complete popup/menu item presentation and accessibility across all inventories per FR-ED-002, FR-ED-003, FR-ED-004, FR-ED-005, FR-ED-019, FR-ED-023, and Constitution VI (partial)
  - Acceptance criteria: File, Settings, View, About, overflow, context, shortcuts, and About surfaces use catalogue labels, correct menu/dialog roles, accessible names, visible focus, platform-correct accelerators, localized unavailable states, consistent icons/symbols, and tokenized colors; future File/tab/Assistant/Image/Format/Compact/Lint items remain visibly unavailable without fake success; no Assistant settings group or prohibited Lint context item appears; long translated labels remain fully reachable.
  - Proof: expand registry-derived component tests, shortcut-dialog tests, localization tests, and six-palette browser evidence for every named surface and deferred item.

- [x] T074 [US3] HIGH Verify and repair native window interaction in the real packaged build without introducing custom titlebar, drag, or resize ownership per FR-ED-026, Constitution V, SC-ED-006, and SC-ED-009 (partial)
  - Acceptance criteria: the current-host packaged application supports native movement, border resizing, macOS maximize/zoom, fullscreen, close, and titlebar ownership; no invisible web overlay blocks native controls; `DisableResize` remains false; no custom resize hit targets, private runtime resize path, second window-state owner, or fake fullscreen control is added; host/runtime limitations are recorded separately from code defects.
  - Proof: run `just build`, launch the real binary, execute the native walkthrough, inspect window options and overlay hit-testing, and retain current-host evidence for movement, resize, zoom, fullscreen, and close.

- [x] T075 HIGH Re-run focused, live, responsive, packaged-build, architecture, and reconciliation evidence for every Phase 13 repair before declaring the feature converged per Constitution VII, SC-ED-001, SC-ED-003, SC-ED-004, SC-ED-005, SC-ED-006, SC-ED-007, SC-ED-008, and SC-ED-009 (partial)
  - Acceptance criteria: every new behavior has a named automated test; actual toolbar, shortcut, overflow, context-menu, popup, and native controls are operated in the running app; all six palettes and 1280/768/375 widths are covered; no page clipping, focus trap, ghost overlay, failed clipboard success, selection loss, or deferred-boundary violation remains; reliable gates and real-build evidence are retained; reconciliation contains no unresolved in-scope defect.
  - Proof: run the applicable official SpecKit gates and `just dev`/browser plus `just build` current-host walkthrough; update only the feature evidence files and report any out-of-host limitation honestly.

## Phase 14: Convergence

**Purpose**: Close the deferred Command palette boundary that remains visually present in the required
context-menu inventory without authorizing command-palette behavior.

- [x] T076 HIGH Mark the required Command palette context-menu and shortcut-help registry entry as localized deferred/unavailable rather than available, retain its exact context-menu order and separator, prevent every activation path from reporting mutation or executing a placeholder, and add registry/context-menu/shortcuts/live evidence without implementing search, quick-open, or command-palette behavior per FR-ED-019, FR-ED-023, FR-ED-027, the plan's `keyboard-shortcuts.md` deferred decision, and Constitution I/VI (contradicts)

## Phase 15: Convergence

**Purpose**: Restore current Editor-stage browser evidence and popup/shell E2E contracts after the completed unrestricted `just e2e-test` run reported 77 passed and 71 failed, without broadening any deferred behavior boundary.

- [x] T077 CRITICAL Repair and retain the T055 Editor-stage E2E journey matrix using stable role/name locators for icon-first toolbar controls, then prove toolbar, platform shortcut, and context-menu formatting, both sidebar directions, 768-pixel overflow reachability, no page-level horizontal scroll, local-only requests, and every 1280/768/375 palette/mode case per T055, Constitution VII, SC-ED-001, SC-ED-003, SC-ED-008, and ED-VS-06 (partial)
  - Acceptance criteria: the matrix no longer relies on obsolete visible text inside icon-first controls; it exercises the same accessible action identities actually exposed by the toolbar, overflow, and context menu; it records the current unrestricted E2E result; and it does not make File, tabs, Assistant, Format, Compact, Lint, image/file paste, TSV/CSV conversion, renderer, tidy, or network behavior available.
  - Proof: update `frontend/e2e/editor-stage.test.ts`, run the focused T055 matrix and the unrestricted `just e2e-test`, retain pass/fail output in the feature evidence, and perform the named real-bridge live checks at 1280/768/375.

- [x] T078 HIGH Complete T070 single-popup ownership so opening File, Settings, View, About, toolbar overflow, Open Recent, an editor context menu, shortcuts, or an About dialog closes any competing shell popup, leaves the requested surface reachable, restores opener focus on dismissal, and preserves viewport collision handling and non-blocking hit testing per T070, FR-ED-001 through FR-ED-005, FR-ED-019, FR-ED-021, FR-ED-023, Constitution VI, and SC-ED-008 (partial)
  - Acceptance criteria: the desktop File menu cannot remain active and intercept the View trigger; 375-pixel hit testing proves underlying intended controls remain reachable after dismissal without assuming `document.body` is the topmost element; Escape, outside click, repeated open/close, keyboard navigation, long labels, submenus, dialogs, all six palettes, and 1280/768/375 viewports retain one active interaction owner; modal dialogs continue to suppress background shortcuts.
  - Proof: update `frontend/src/ui/widgets/ShellMenuRow.tsx` and its focused tests only as required, extend `frontend/e2e/editor-stage.test.ts` with concrete competing-menu/focus/geometry/hit-testing assertions, run the focused T070 matrix plus unrestricted `just e2e-test`, and repeat the real-bridge popup walkthrough without adding file, tab, Assistant, tidy, renderer, or network behavior.

- [x] T079 HIGH Reconcile affected shell E2E contracts with the active Editor-stage surface: preserve native-shell resize, focus, timing, screenshot, and local-only request coverage while replacing superseded assumptions that File/tabs are absent, Settings is first, the sidebar item is named `Show Workspace`, a generic `Close` is unique, or About opens a dialog without selecting its menu row per FR-ED-001 through FR-ED-009, SC-ED-001, SC-ED-005, SC-ED-007, SC-ED-008, Constitution I/VII, and ED-VS-06 (contradicts)
  - Acceptance criteria: `window-shell.test.ts` asserts the File/Settings/View/About order and current registry-derived labels/roles, scopes locators to their owning dialog/menu, verifies visual tabs and every visible deferred control remain inert/non-mutating, preserves only contained tab-strip scrolling at 375 pixels, and does not delete, skip, narrow, or reinterpret existing shell evidence.
  - Proof: update `frontend/e2e/window-shell.test.ts`, run its focused E2E coverage and unrestricted `just e2e-test`, compare all failures against the reliable baseline, and retain the updated E2E/live evidence with any remaining non-Editor-stage failure reported explicitly.

## Phase 16: Convergence

**Purpose**: Refresh release-grade package and raw gate evidence after the Phase 15 popup/source repair;
do not broaden any Editor-stage deferred boundary.

- [x] T080 CRITICAL Re-run and retain the complete Phase 15 release evidence after T077–T079: capture raw unrestricted `just e2e-test` output, run `just verify 002-editor-stage-formatting` against the reliable baseline, run `just build`, and walk the freshly built current-host application through the affected File/View competing-popup, formatting, deferred-control, and native-frame journeys per Constitution VII, SC-ED-006, SC-ED-007, SC-ED-009, ED-LIVE-001 through ED-LIVE-005, and T077–T079 (partial)
  - Acceptance criteria: retained evidence distinguishes raw gate output from a summary; the fresh package is the one built after the popup repair; File/View popup ownership, toolbar/shortcut/context-menu formatting, responsive overflow, deferred File/tab/Assistant/Image/Format/Compact/Lint behavior, local-only requests, and OS-managed movement/resize/zoom/fullscreen/close are observed without adding file lifecycle, tab lifecycle, Assistant/provider, tidy, renderer, or network behavior; any host-only limitation is explicit and no unreliable gate is treated as passing.
  - Proof: update only `specs/002-editor-stage-formatting/evidence/` with raw E2E/verification/build output and the current-host walkthrough; inspect every named result, compare the verifier against the reliable baseline, and report the exact outcome before marking the task complete.

## Phase 17: Convergence

**Purpose**: Repair the current unrestricted E2E regressions recorded by Phase 16 without widening the
Editor-stage slice or converting any deferred surface into behavior.

- [x] T081 CRITICAL Repair single-popup opener ownership so a View popup opened after File records View as the active opener and Escape/outside dismissal restores focus to View, while still closing the competing File popup and retaining modal suppression, collision handling, and non-blocking hit testing per FR-ED-001, FR-ED-004, FR-ED-019, FR-ED-021, T070/T078, Constitution VI, and SC-ED-008 (partial)
  - Acceptance criteria: File → View and View → File leave exactly one requested popup active; Escape and outside click restore focus to the trigger of the popup being dismissed; the 18 T070 width/theme/mode paths pass; menus, overflow, Open Recent, editor context menu, shortcuts, and About retain their existing single-owner semantics; no File lifecycle, tab lifecycle, Assistant/provider, tidy, renderer, or network path is added.
  - Proof: update `frontend/src/ui/widgets/ShellMenuRow.tsx` and its focused tests only as required, retain concrete File/View focus assertions in `frontend/e2e/editor-stage.test.ts`, run the focused popup suite, and retain the next unrestricted E2E result.

- [x] T082 HIGH Reconcile every Phase 16 failing mock-bridge browser journey with the active Editor-stage surface and repair any real command/preview regression it exposes: scope portal menus by their owning menu rather than the navigation ancestor, use the 375px shell overflow, assert the current Settings-menu radio inventory and View arrangement radios, use current Workspace/Editor-stage roles, and prove typed Monaco input reaches preview and survives arrangement changes per FR-ED-001 through FR-ED-009, FR-ED-022 through FR-ED-024, T055/T079, ED-VS-03/04/06, Constitution II/III/VI/VII, and SC-ED-001/003/005/007/008 (contradicts)
  - Acceptance criteria: no test is deleted, skipped, narrowed, or made to assert a superseded Appearance dialog, View checkbox, File-explorer label, or nav-descendant portal menu; the affected `appearance`, `core-editor`, and `window-shell` journeys operate the current accessible controls at 1280/768/375, retain local-only requests, reduced-motion, native-shell timing, screenshots, and visual deferred File/tab/Assistant/Image/Format/Compact/Lint checks; the round-trip uses the normal identity-bound document-command/mock-bridge path and any genuine input/preview failure is fixed at its source rather than hidden in a locator change; no file, tab, Assistant, tidy, renderer, or network behavior is enabled.
  - Proof: update only the required paths among `frontend/e2e/appearance.test.ts`, `frontend/e2e/core-editor.test.ts`, `frontend/e2e/window-shell.test.ts`, their existing helpers, and the established document/mock-bridge seam if a real regression is demonstrated; run each focused journey and then unrestricted `just e2e-test` with all 148 tests passing.

- [x] T083 HIGH Complete the blocked Phase 16 release evidence only after T081–T082 are green: retain the raw unrestricted passing `just e2e-test` output, run `just verify 002-editor-stage-formatting` against the reliable baseline, run `just build`, and repeat the affected real-bridge/current-host File/View, formatting, responsive-overflow, deferred-control, local-only-request, and native-frame walkthroughs per Constitution VII, SC-ED-006 through SC-ED-009, ED-LIVE-001 through ED-LIVE-005, and T080 (partial)
  - Acceptance criteria: raw output and summaries are distinct; all 148 unrestricted E2E tests pass; no unreliable gate is treated as passing; the fresh package is the one exercised; File/tab/Assistant/Image/Format/Compact/Lint controls remain deferred or inert; no file lifecycle, real tab lifecycle, Assistant/provider, tidy, renderer, or network behavior is introduced; and current-host limitations remain explicit.
  - Proof: update only `specs/002-editor-stage-formatting/evidence/` after the named proofs pass, inspect every result against the baseline, and leave T080 unchecked as historical failed evidence unless its original acceptance criteria have genuinely passed.

## Phase 18: Convergence

**Purpose**: Restore release-grade raw gate evidence without broadening the Editor-stage implementation or
rewriting the preserved Phase 16 failure record.

- [x] T084 CRITICAL Retain complete, unabridged terminal records for a fresh unrestricted `just e2e-test` and isolated-cache `just verify 002-editor-stage-formatting`, including each command's final Playwright/verifier result and exit status, and keep any human-readable conclusion in a separate summary document per T083, SC-ED-007, and Constitution VII (partial)
  - Acceptance criteria: the raw E2E record shows the full 148-test runner conclusion and process result; the raw verifier record shows every M1–M6 outcome or the actual failure; neither raw file contains an inferred pass sentence in place of omitted terminal output; the historic Phase 16 failed record remains unchanged; no source, test, gate, or deferred boundary is altered to obtain the evidence.
  - Proof: update only `specs/002-editor-stage-formatting/evidence/`, inspect the complete retained files and the reliable baseline verdict, then report the exact command outcomes before marking the task complete.

## Phase 19: Convergence

**Purpose**: Restore reliable Editor-stage release evidence after the fresh T084 records identified
formatting, lint, unit-contract, and appearance-snapshot failures. Preserve every deferred boundary and the
historic Phase 16 failure record; do not use snapshot replacement, assertion weakening, skipped tests, or
configuration changes to manufacture a pass.

- [x] T085 CRITICAL Repair the ShellMenuRow popup anchor implementation so File, Settings, View, and About preserve their current single-owner, collision-safe, opener-focus, and narrow-viewport behavior without reading mutable refs during render or retaining unused handlers per FR-ED-001, FR-ED-023, T070/T078/T081, and Constitution VI/VII (partial)
  - Acceptance criteria: the menu anchor position is captured through event/effect/state flow rather than render-time ref access; File → View and View → File retain exactly one active menu; Escape/outside dismissal restores the opener of the dismissed menu; 375px portal menus remain viewport-contained and do not block underlying intended controls; lint has no ShellMenuRow finding.
  - Proof: extend `frontend/src/ui/widgets/ShellMenuRow.test.tsx` and `frontend/e2e/editor-stage.test.ts` with the affected focus/geometry paths; run the focused tests, ESLint for `ShellMenuRow.tsx`, and the existing popup matrix without adding File/tab/Assistant/tidy/renderer/network behavior.

- [x] T086 CRITICAL Reconcile App-level Editor-stage integration assertions with the current registry-derived View menu and projection lifecycle, retaining real menu opening, modal suppression, identity-bound document state, and no-hidden-content checks rather than weakening or deleting coverage per FR-ED-001, FR-ED-011, FR-ED-024, T079/T082, and Constitution II/III/VII (partial)
  - Acceptance criteria: `App.test.tsx` proves the current View-menu role/name and deferred Toggle Assistant state after the menu is actually open; the ephemeral-buffer case seeds and disposes projection state deterministically and proves source bytes stay out of Redux without assuming stale revisions; the focused file passes in isolation and in the complete frontend suite.
  - Proof: update `frontend/src/App.test.tsx` and only its established projection/mock setup if required; run the focused Jest file, the full frontend test command, and the affected shell/document integration coverage without changing production behavior merely to satisfy a test.

- [x] T087 CRITICAL Restore the appearance browser evidence to a formatted, deterministic approved visual baseline: diagnose the 13-pixel minimal-light mismatch under controlled fonts, motion, viewport, and asynchronous appearance acknowledgement; update a snapshot only when the inspected current rendering matches the binding mockup per FR-ED-003, FR-ED-023, SC-ED-001, and Constitution VI/VII (partial)
  - Acceptance criteria: `appearance.test.ts` passes Prettier; repeated isolated and unrestricted browser runs do not intermittently fail the minimal-light screenshot; six-palette root attributes, visible focus, token-backed appearance, no page-level overflow, and rejected-write retention remain covered; no screenshot or tolerance is changed merely to hide an unexplained difference.
  - Proof: update `frontend/e2e/appearance.test.ts` and its existing snapshot only if visual inspection supports it; run Prettier for the exact file, the focused appearance journey repeatedly, and the unrestricted `just e2e-test`, retaining raw failure/success output in feature evidence.

- [x] T088 CRITICAL Re-run the complete T080 release gate only after T085–T087 are green: retain raw unrestricted `just e2e-test`, isolated-cache `just verify 002-editor-stage-formatting`, and `just build` output; walk the freshly built current-host app through competing popups, formatting, responsive overflow, deferred controls, local-only requests, and OS-managed native-frame behavior per T080, SC-ED-006 through SC-ED-009, ED-LIVE-001 through ED-LIVE-005, and Constitution VII (partial)
  - Acceptance criteria: E2E is stably green with its full runner conclusion; M1–M6 pass against the reliable baseline with real analysis; the packaged app is the freshly built bundle; live evidence distinguishes demonstrated current-host behavior from Windows/Linux or package-minimum-size limits; no File/tab/Assistant/Image/Format/Compact/Lint behavior becomes available; mark T080 complete only if its original acceptance criteria all pass.
  - Proof: update only `specs/002-editor-stage-formatting/evidence/` with full raw records and a separate factual summary; inspect every named result, execute the current-host walkthrough on the fresh build, and preserve the Phase 16/18 failure records unchanged.

## Phase 20: Convergence

**Purpose**: Close the current mockup-visible Editor-stage regressions reported after Phase 19. Preserve every deferred lifecycle boundary, canonical action identity, token-only palette rule, responsive no-page-scroll boundary, and OS-managed native frame; do not rewrite prior completion or weaken existing evidence.

- [x] T089 [US1][US4] HIGH Rebuild File, Settings, View, About, toolbar-overflow, and editor-context popup geometry and row presentation in `frontend/src/ui/widgets/ShellMenuRow.tsx/.module.css`, `SettingsMenu.tsx/.module.css`, `EditorContextMenu.tsx/.module.css`, `EditorChrome.tsx/.module.css`, and `frontend/src/ui/primitives/ViewMenu.tsx/.module.css` around one tokenized, measured popup contract per FR-ED-001 through FR-ED-005, FR-ED-019, FR-ED-023, T070/T071/T073/T078/T081/T085, SC-ED-001, and the `menu-file`, `menu-settings`, `menu-view`, `menu-about`, `toolbar-overflow`, and `editor-menu` mockup screens (partial)
  - Current failure to repair: the supplied live screenshots show menu/context surfaces rendered away from their trigger or pointer, unevenly sized, and as individually bordered controls. The current editor context-menu source clamps against fixed `304×224` values even though its inventory contains ten rows; it does not measure the actual rendered height before selecting a side. This is not acceptable viewport safety evidence.
  - Implementation instructions: retain exactly one active File/Settings/View/About owner, current opener-focus restoration, Escape/outside dismissal, modal suppression, and the fixed `document.body` portal where a popup must escape an `overflow: hidden` ancestor. Replace fixed guessed menu dimensions with the actual rendered trigger/pointer popup rectangle; use the existing 8px collision margin, clamp both axes, flip above/beside the trigger or pointer when the preferred edge has insufficient room, and recompute on viewport resize and scroll. A context menu must appear adjacent to the actual right-click point rather than at a stale, scaled, or unrelated editor coordinate; long inventories must scroll internally within the viewport instead of extending beyond it.
  - Presentation instructions: make all popup inventories read as one surface—one outer tokenized background/border/radius/shadow, full-width rows, consistent vertical rhythm, separators, hover/focus and disabled/unavailable states. Rows must not each look like a separate outlined button. Preserve the exact registry-derived inventory, ordering, separators, semantic roles, localized labels/accelerators, and surface-specific context-menu membership: Cut, Copy, Paste, Paste as plain text, Bold, Italic, Link, disabled Format document, disabled Compact, and disabled Command palette; do not add Lint, headings, lists, Quote, Table, file lifecycle, tab lifecycle, Assistant behavior, tidy behavior, renderer behavior, or any network path.
  - Acceptance criteria: at 1280, 768, and 375 logical pixels, every named popup is fully within the visual viewport with no clipping, invisible blocker, or unreachable row; only the requested popup receives pointer/keyboard interaction; File → View and View → File retain the new owner's opener focus; Open Recent remains visually present/deferred and stays contained; the editor context menu opens beside all four editor corners and each item after a separator has the same usable width as the preceding item; long translated labels remain reachable; and focus, selection, Monaco identity, document bytes, and deferred action outcomes remain correct.
  - Proof: add focused geometry, owner, style-contract, keyboard, outside-click, Escape, long-label, and corner-placement cases in `ShellMenuRow.test.tsx`, `SettingsMenu.test.tsx`, `ViewMenu.test.tsx`, `EditorContextMenu.test.tsx`, and `EditorChrome.test.tsx`; add bounding-box/hit-test assertions and screenshots for the named six mockup popup screens in `frontend/e2e/editor-stage.test.ts`; operate the same journeys in the real Wails development bridge before this task is marked complete.

- [x] T090 [US1] HIGH Apply the existing Liquid Glass blur token consistently to translucent Editor-stage surfaces in `frontend/src/ui/styles/tokens.css`, `ShellMenuRow.module.css`, `EditorChrome.module.css`, `EditorView.module.css`, `SettingsMenu.module.css`, `EditorContextMenu.module.css`, `ViewMenu.module.css`, and any directly shared popup/card stylesheet required by T089, without creating colour literals or a second appearance authority, per FR-ED-023, ED-VS-04/05, T069, Constitution VI, and the `glass-light`/`glass-dark` mockup appearance contract (partial)
  - Current failure to repair: `--blur` is already defined for both Glass palettes and is currently applied to editor panes only. The supplied Liquid Glass screens therefore show transparent menu rows, tabs, toolbar, Settings, and popup surfaces without the required background blur.
  - Implementation instructions: use `backdrop-filter: var(--blur)` only on translucent surfaces that visually overlay the canvas or another Glass surface: the shell menu row, tab strip, toolbar islands, editor/preview cards and headers, File/Settings/View/About/overflow/context surfaces, and dialogs/popovers belonging to this slice. Preserve the existing token contract so Material and Minimal resolve to no blur; do not hard-code blur radii, saturation, colours, or alpha values in components. Keep text contrast, focus rings, borders, shadows, reduced-motion behavior, stacking, pointer events, and scroll performance intact. Do not blur the Monaco editing content in a way that harms legibility or input.
  - Acceptance criteria: Glass Light and Glass Dark visibly blur the canvas/content behind every listed translucent surface, rather than merely showing transparency; the same surface in Material and Minimal has computed no-blur behavior; all six palette/root attribute combinations retain token-backed colours, readable text, visible focus, and no page-level horizontal overflow; changing theme/mode updates in place without recreating Monaco, resetting selection/scroll, or changing Go-owned acknowledged appearance state.
  - Proof: extend appearance/component checks to assert the relevant computed backdrop-filter and token-derived surface styles for Glass versus Material/Minimal, while retaining the six-palette screenshot matrix in `frontend/e2e/appearance.test.ts`; visually inspect Glass Light and Dark with a non-uniform canvas behind menu, tab, toolbar, and popup surfaces in the real bridge before replacing any snapshot. A snapshot may change only after that inspected rendering matches the binding mockup's liquid-glass intent; do not add tolerance, hide the blur, or replace a baseline solely to make a test pass.

- [x] T091 [US1] HIGH Rebuild the Editor-stage menu, tabs, toolbar islands, sidebar/Assistant placement, and arrangement switch in `frontend/src/ui/widgets/ShellMenuRow.tsx/.module.css`, `EditorChrome.tsx/.module.css`, `EditorView.tsx`, `App.tsx`, and their focused tests to the binding mockup's hierarchy without changing action ownership or deferred behavior per FR-ED-001, FR-ED-006 through FR-ED-011, FR-ED-023, ED-VS-04/05, T068/T069, SC-ED-001, and `docs/delivery/spec/surface/mockup.html` (contradicts)
  - Current failure to repair: the supplied screens show File, Settings, View, and About as outlined buttons; every toolbar action is separately boxed while groups have no island; the functional sidebar and disabled Assistant controls are on the toolbar's left/right rather than the menu-row right edge; the arrangement uses icon-only controls in the main toolbar rather than a right-aligned text `Editor | Split | Preview` island; and tabs do not preserve the mockup's active/inactive geometry.
  - Implementation instructions: render the four in-app menu triggers as plain text menu labels under the OS title bar—without a resting button outline—while retaining accessible button/menu semantics, `aria-expanded`, visible keyboard focus, localized names, and registry-derived ordering. Place the existing functional Toggle Sidebar control and the same deferred Toggle Assistant registry surface at the right edge of that menu row; Toggle Assistant must remain disabled/unavailable and must not create a right panel, Assistant state/content/provider call, layout state, or network request. Use mockup-shaped active/inactive visual tab fixtures with the representative labels, modified dot, close/add affordances, and contained 375px tab-strip scroll, but keep them decorative/unavailable with no tab identity, switching, closing, persistence, commands, or menus.
  - Toolbar instructions: enclose related formatting actions in distinct islands with one outer surface/border/radius and internally quiet action buttons; retain icon-first treatment plus localized tooltip/accessibility names for icon actions, and keep Format, Compact, and Lint as the required textual disabled controls. Put the text-labelled `Editor`, `Split`, and `Preview` radio controls in their own right-aligned island at 1280 and 768; preserve one-pane minimum, acknowledged arrangement transition/flush behavior, keyboard radio navigation, and active state. At 768 move only the approved list/link groups to `»`; at 375 move only the approved text/heading/arrangement controls to `»`, retain one toolbar row, make every item reachable, and allow horizontal scrolling only inside the visual tab strip.
  - Acceptance criteria: the 1280 hierarchy visibly matches the supplied binding mockup—text menu row, menu-row right controls, active tab treatment, grouped action islands, and a right-side textual arrangement island—and the 768/375 layout follows its exact relocation rules without page clipping. Existing sidebar, arrangement, full-screen, appearance, and About consumers remain functional through their canonical dispatcher/Go projection paths. Every visual-only File/tab/Assistant/Image/Format/Compact/Lint control remains localized deferred or disabled with no successful command outcome, document mutation, operation-gate acquisition, or hidden lifecycle.
  - Proof: add source/component accessibility and structure assertions in `ShellMenuRow.test.tsx`, `EditorChrome.test.tsx`, `App.test.tsx`, `AppShell.test.tsx`, and `EditorView.integration.test.tsx`; add responsive bounding-box and screenshot assertions in `frontend/e2e/editor-stage.test.ts` for the full Editor/Split mockup state. Exercise actual menu, sidebar, arrangement, toolbar-overflow, tab-fixture, and deferred control interactions at all three widths before completion.

- [x] T092 HIGH Prove the completed Phase 20 popup, Liquid Glass, tab, toolbar-island, sidebar/Assistant, and arrangement corrections using focused tests, the real development bridge, unrestricted browser evidence, and a freshly built current-host app; retain evidence only under `specs/002-editor-stage-formatting/evidence/` and do not mark any preceding task complete without its named proof, per T080/T088, SC-ED-001, SC-ED-005 through SC-ED-009, Constitution VI/VII, and ED-LIVE-001 through ED-LIVE-005 (partial)
  - Dependency/order: execute after T089–T091. Do not treat a component pass, mock-bridge screenshot, an earlier 148-pass run, or a preserved Phase 19 record as Phase 20 release evidence.
  - Focused proof: run the exact popup/style/chrome tests added by T089–T091; format-check every changed source/test file; preserve role/name locators for icon-first controls; and add regression coverage for real pointer coordinates, actual menu dimensions, Glass computed blur, Material/Minimal no-blur, long labels, viewport ownership/hit testing, 1280/768/375 relocation, tab-only contained scroll, and every deferred boundary.
  - Browser and live proof: run the unrestricted `just e2e-test` matrix with all 148 tests and inspect the full runner conclusion/exit status. In `just dev`, use the real Wails bridge—not only `just dev-ui`—to operate File, Settings, View, About, toolbar overflow, a right-click editor context menu, the functional sidebar, disabled Assistant, arrangement radio island, visual tabs, and Glass Light/Dark at 1280, 768, and 375 across all six palettes. Record root `data-theme`/`data-mode`, bounding boxes, actual focus restoration, page versus tab-strip scroll widths, visible blur, and local-only request observations. Retain fresh screenshots that reproduce the originally supplied menu/context scenarios after correction.
  - Package/release proof: run the unchanged isolated-cache `just verify 002-editor-stage-formatting`, `just build`, and the fresh package walkthrough. In the packaged current-host app, inspect the OS-managed frame and native movement/resize/zoom/fullscreen/close, the corrected popup/chrome/glass surfaces, formatting, responsive overflow where host-supported, and deferred File/tab/Assistant/Image/Format/Compact/Lint behavior. State Windows/Linux and package-minimum-size limits honestly. Retain unabridged raw command output, explicit exit statuses, and a separate factual summary; do not weaken locators, retries, parallelism, screenshot tolerance, gate configuration, or test scope to manufacture a pass.

## Phase 21: Convergence

- [ ] T093 HIGH Complete the missing real-control evidence for the Editor-stage slice: in the real `just dev` Wails bridge, operate File, Settings, View, About, toolbar overflow, editor right-click context menu, functional sidebar, deferred Assistant, arrangement radios, visual tabs, Glass Light/Dark, formatting, and deferred controls at 1280, 768, and 375 across all six palettes; then in the freshly built current-host app, operate and record OS-managed movement, resizing, zoom/fullscreen, and close ownership together with the same visible deferred boundaries, per SC-ED-005, SC-ED-006, ED-LIVE-001 through ED-LIVE-005, and Constitution VI/VII (partial)
  - Current evidence gap: `phase-20-summary.md` records a fresh package visual inspection but explicitly says macOS denied synthetic native input. The unrestricted 148-test browser matrix remains valuable automated proof, but it uses the mock bridge and therefore cannot replace the named real Wails development-bridge or native-control walkthrough.
  - Acceptance criteria: records show actual controls—not synthetic DOM events or a mock browser—at every required width/palette, including root `data-theme`/`data-mode`, visible focus restoration, popup and toolbar-overflow bounds, page versus tab-strip scroll widths, Glass blur, local-only request observations, formatting source/undo results, unavailable no-op outcomes, and current-host native-frame ownership. Windows/Linux and package-minimum-size limits remain explicit rather than inferred.
  - Proof: retain fresh screenshots and a factual walkthrough only under `specs/002-editor-stage-formatting/evidence/`; preserve Phase 16–20 records unchanged; rerun no broad gate unless the real walkthrough exposes a defect; do not mark this task complete until the real bridge and packaged-app interactions have been observed successfully.
