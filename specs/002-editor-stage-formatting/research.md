# Research: Editor Stage Chrome and Formatting

**Feature**: `002-editor-stage-formatting`

**Date**: 2026-08-03

**Scope**: Phase 04 inline/selection formatting, Editor-stage chrome, editor display settings, and
registry-derived discovery surfaces. This research preserves the completed `specs/001-gomarkedit-product`
contracts and the active specification's Owned/Consumed/Deferred matrix. It does not authorize changes
under `docs/delivery/` or implementation changes during planning.

## Decision 1: Extend the existing Wails/React vertical seams

**Decision**: Keep the current Go/Wails/React/Monaco architecture and extend only the established
settings, adapter, appmodel projection, editor-session, action, and widget seams.

**Rationale**:

- The consumed application-state contract makes Go the canonical owner, Redux a projection, and Monaco
  an identity-bound ephemeral working copy.
- `useDocumentCommands` resolves `{documentId, token, handle}` at invocation time and already returns
  explicit `unavailable` and `document-mismatch` outcomes.
- `CodeEditor` already brackets a single `executeEdits` mutation with undo stops. Formatting can therefore
  preserve one undo step without adding a full-value replacement path.
- The command-boundaries contract keeps generated Wails access in `frontend/src/logic/adapter/`, requires
  typed panic-safe handlers, and requires generated bindings to be regenerated with the supported command.

**Alternatives considered**:

- A component-local formatter that writes directly to Monaco was rejected because it would bypass the
  document command seam and create a second synchronization route.
- A new frontend settings store was rejected because it would make acknowledged settings diverge from the
  existing Go-owned settings service.
- A new UI framework, Wails runtime path, or native plugin was rejected because the consumed shell contract
  already provides the needed framed-window, focus, and public runtime boundaries.

## Decision 2: Use one Editor-stage action and shortcut registry

**Decision**: Introduce one typed registry entry for every visible Editor-stage action. Each entry carries
stable identity, localized label/accessibility keys, scope, availability (`available` or `deferred`), and
one platform-neutral shortcut where specified. Menus, tooltips, controls, overflow, context menu, and the
shortcuts dialog render from this registry.

**Rationale**:

- FR-ED-011 and the consumed command-boundaries contract prohibit duplicated labels and bindings.
- A stable platform-neutral binding can resolve `Ctrl/Cmd` and `Alt/Option` at render and dispatch time,
  while preserving the native macOS clipboard/edit roles.
- The registry can represent the required visible but unavailable File, tab, right-sidebar, Image,
  Format, Compact, Lint, Assistant, reading-mode, and future file/settings entries without giving them a
  successful command path.
- Scope checks provide the required editor-focus, writable-document, window-focus, and modal suppression
  behavior in one dispatcher.

**Alternatives considered**:

- Extending `shellActions.ts` with unrelated formatting entries was rejected because the current catalogue
  only models Settings/View/About/full-screen and cannot express editor/document scope or platform mapping.
- Separate registries for toolbar and context menu were rejected because the source matrix explicitly
  requires registry-derived surfaces and zero conflicting bindings.
- Registering native macOS clipboard shortcuts in the in-app registry was rejected because macOS owns those
  Edit roles under the consumed shell and keyboard contracts.

## Decision 3: Keep formatting transformations bounded and pure

**Decision**: Implement formatting transformations as a pure, testable module that receives the current
source, selection/caret, action identity, and the acknowledged Markdown marker preferences. It returns one
bounded edit range, replacement text, and the resulting caret/selection intent. The action executor flushes
or reads through the existing document-command seam and applies one `replaceRange`/`executeEdits` mutation.

**Rationale**:

- The Phase 04 source rules require selected-range or current-line scope, marker toggles, heading/list
  replacement, a table skeleton, and no unrelated document changes.
- Pure transformation tests can cover empty selections, selections just inside markers, multi-line list
  conversion, existing heading/list replacement, canonical defaults, and preference overrides without
  coupling semantics to Monaco.
- One edit operation preserves the existing undo contract and prevents focused-editor text echo from
  resetting selection, caret, scroll, or undo history.
- Link creates Markdown source only and does not introduce a network request. Image remains a localized
  deferred action because image/file lifecycle is excluded.

**Alternatives considered**:

- Whole-document parse/rewrite was rejected because it violates bounded range behavior and belongs to the
  deferred tidy-markdown slice.
- Implementing Format/Compact/Lint as provisional transformations was rejected because their Phase 10
  parser, gate, cancellation, problems, and no-op rules are explicitly deferred.
- Adding a TSV/CSV paste converter was rejected because the matrix defers tabular paste behavior.

## Decision 3a: Keep heading buttons ATX-specific in this slice

**Decision**: The Heading 1/2/3 actions use the FR-ED-014 ATX marker semantics: add the requested ATX
level, replace a different ATX level, and remove the marker when the same level is invoked again. The
existing `headingStyle` preference remains part of the consumed Markdown settings contract, but no
additional Setext conversion is invented for these three actions; Setext behavior is not sufficiently
specified for a level-three action and remains outside this action slice.

**Rationale**:

- FR-ED-014 is the specific Editor-stage action rule and names ATX headings, while the legacy preference
  admits Setext, which has no H3 representation.
- Treating the preference as a new, underspecified Setext conversion would create a second behavior contract
  and risk conflicting with the explicit FR-ED-014 replacement/toggle examples.
- The plan records the boundary in the formatter contract and tests so a later clarification can extend it
  without silently changing this slice.

**Alternatives considered**:

- Converting H1/H2 to Setext while inventing an H3 fallback was rejected because the fallback would be an
  unapproved behavior.
- Silently changing the persisted `headingStyle` setting was rejected because actions must not mutate an
  unrelated setting as a side effect.

## Decision 4: Add editor display settings to the existing typed settings path

**Decision**: Add an `EditorSettings` group to the existing Go settings DTO/service/repository and
frontend adapter/mock bridge. It owns `lineNumbers`, `wordWrap`, and `fontSize`, validates exactly
`13 | 14 | 16`, defaults to line numbers on, word wrap off, and font size 14, and persists each acknowledged
setting through the existing immediate settings lifecycle. The editor consumes the acknowledged value and
updates Monaco options in place.

**Rationale**:

- FR-ED-022 requires acknowledged changes, exact values, and content-preserving visible updates.
- The existing `internal/settings` service already owns typed groups, normalization, validation, additive
  SQLite KV persistence, and typed Wails results. Reusing it avoids a second state owner.
- `CodeEditor` already has the option inputs and tests for line numbers, word wrap, and font size; the
  missing design piece is wiring those inputs to acknowledged settings without remounting the editor.
- `setOptions`/equivalent Monaco option updates preserve the model, identity, selection, scroll, caret, and
  undo history. A remount or `setValue` is not an acceptable settings implementation.

**Alternatives considered**:

- CSS-only font sizing was rejected because Monaco owns editor layout and needs the acknowledged numeric
  option.
- Component state with no persistence was rejected because settings must survive relaunch and remain
  backend-authoritative.
- Adding editor settings to application layout was rejected because they are typed user settings, not
  responsive geometry or document view state.

## Decision 5: Treat future behavior as explicit deferred availability

**Decision**: Render the File menu inventory, representative visual tab bar, right-side visibility button,
Image, Toggle Assistant, Distraction-free reading, future Settings items, and Format/Compact/Lint where the
mockup requires them. Give each a localized `deferred`/unavailable registry state and no backend command,
file I/O, tab state, Assistant state, operation-gate acquisition, or network path.

**Rationale**:

- The clarification answers explicitly allow visual-only File and Tabs surfaces and require the right-side
  control to remain non-functional with no Assistant region.
- FR-ED-010, FR-ED-018, FR-ED-026, and FR-ED-027 prohibit fake success and hidden dependencies.
- The migration matrix preserves each later source anchor as a named downstream boundary instead of
  silently dropping it.

**Alternatives considered**:

- Omitting the requested shapes was rejected because the binding mockup governs control presence, labels,
  order, grouping, and overflow placement.
- Enabled no-op handlers were rejected because they would claim successful backend outcomes.
- A hidden placeholder Assistant panel or zero-width state was rejected because the spec requires no panel,
  state, content, provider call, or visible placeholder.

## Decision 6: Implement responsive chrome from the binding mockup and prove real reachability

**Decision**: Keep one coherent toolbar row. At 1280 all groups are visible; at 768 the list and link groups
move into `»` overflow; at 375 the text buttons and arrangement control also move into overflow. The menu
row itself uses its approved narrow overflow. The visual tab fixture may use the mockup's internal tab-strip
overflow at 375, but the page never gains horizontal scrolling or clipped controls. Responsive-only
rail/off-canvas presentation does not write a responsive width back to durable desktop layout.

**Rationale**:

- The active matrix names the mockup screens and the exact 1280/768/375 × six-palette evidence matrix.
- Existing `ShellMenuRow` already demonstrates a keyboard-reachable narrow menu overflow, while the editor
  toolbar has no equivalent yet; the plan therefore adds overflow as a real projection, not CSS clipping.
- Playwright must assert bounding rectangles and horizontal reachability, not merely rely on hidden overflow.

**Alternatives considered**:

- Hiding low-priority controls at narrow widths was rejected because every in-scope item must remain reachable.
- Page-level horizontal scrolling was rejected because the spec requires no horizontal scroll and a one-row
  toolbar; the mockup's contained tab-strip overflow is the only allowed narrow tab presentation.
- Persisting 768/375 responsive widths was rejected by the consumed layout contract and FR-ED-007.

## Decision 7: Use layered evidence, with live and real-build proof after implementation

**Decision**: Keep the named feature evidence files and add focused tests only where required. Use unit tests
for transformations/registry, integration tests for the command and settings seams, Playwright for the full
responsive/palette browser matrix, request instrumentation and architecture guards for offline/boundary
proof, and `just build` plus ED-LIVE-005 for current-host native behavior. Capture a trustworthy baseline
before the first implementation edit and never treat an unreliable gate as passing.

**Rationale**:

- The active spec names the exact evidence obligations and ED-LIVE-001 through ED-LIVE-005.
- The constitution requires visible work to be exercised with actual controls and authoritative root state,
  and requires the real build in addition to mock-bridge browser tests.
- A browser test cannot prove native frame ownership or Go persistence, and a source-symbol check cannot
  prove formatting behavior, so the evidence layers remain complementary.

**Alternatives considered**:

- A screenshot-only test was rejected because it cannot prove keyboard dispatch, focus, persistence, or
  deferred no-mutation outcomes.
- A mock-only browser result was rejected by the consumed application-state proof obligations.
- A green aggregate label without inspecting named tests and raw gate output was rejected by the constitution.

## Resolved planning questions

The research pass resolves all Technical Context questions:

| Question                                   | Resolution                                                                                                                                              | Governing authority                                                |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Which state owns editor display settings?  | Existing Go `internal/settings` typed group, surfaced through the established adapter; UI is an acknowledged projection.                                | FR-ED-022, FR-ED-024, `application-state.md`                       |
| Which path mutates editor source?          | `useDocumentCommands`/`CodeEditor` bounded edit seam; one Monaco edit operation.                                                                        | FR-ED-012–017, `command-boundaries.md`                             |
| Which actions are real in this slice?      | Phase 04 inline/selection actions plus existing layout/sidebar/appearance/About/full-screen consumers.                                                  | Migration matrix, FR-ED-004, FR-ED-010, FR-ED-017–018              |
| Which actions are visible but unavailable? | File inventory, visual tab fixture, right-side control, Image, Format, Compact, Lint, Assistant/reading future items, and deferred file/settings items. | Clarifications, FR-ED-002–006, FR-ED-008, FR-ED-010, FR-ED-026–027 |
| How is narrow layout proven?               | Registry-derived overflow at 768/375, bounding-box/no-clipping assertions at three widths, and six-palette browser journeys.                            | FR-ED-007/009/023, SC-ED-001/005                                   |
| What is the completion gate?               | Reliable pre-edit baseline, named focused tests, architecture/offline checks, full current gates, ED-LIVE-001–005, and real `just build`.               | Constitution VII and SC-ED-007                                     |
