# Feature Specification: Editor Stage Chrome and Formatting

**Feature Branch**: `002-editor-stage-formatting`

**Created**: 2026-08-03

**Status**: Draft — clarified and ready for planning

**Input**: User description: "Create the next GoMarkEdit Editor-stage slice. Add the full File, Settings, View, and About menu bar with submenu items; visible sidebar controls from both sides; a tabs bar; and a formatting/controls bar. Existing actions may work and missing actions may be visual stubs. Migrate the approved Phase 04 formatting and editor-action requirements into specs/, preserve the completed appearance and native-shell behavior, define one dependency-complete vertical slice with named tests/live evidence, and exclude file opening, saving, tabs, workspace enumeration, rich-rendering expansion, and Assistant behavior."

## Clarifications

### Session 2026-08-03

- Q: Should this slice ship a non-operational File menu and Tabs Bar while file opening, saving, and real tab behavior remain excluded? → A: Yes. Show those surfaces only for functionality that is not implemented yet and will not be implemented in this phase; existing implemented functionality remains functional.
- Q: Should the right-side control toggle an empty shell state or remain a visual-only control while the Assistant region stays absent? → A: Add the button as a visual-only control with no functionality; keep the existing left workspace/sidebar hide/show behavior functional.
- Q: Which artifact governs the visible shape of the Editor-stage chrome, and how are requirements that are not implemented in this slice handled? → A: `docs/delivery/spec/surface/mockup.html` is the binding shape source; every applicable original rule is either owned here, consumed from the completed `specs/001-gomarkedit-product` contract, or explicitly deferred with its source anchor and downstream boundary. No requirement may be silently omitted.
- Q: Should Format, Compact, and Lint implement the full approved Phase 10 document behavior in this slice? → A: No. Implement the Phase 04 inline and selection formatting actions here; expose Format, Compact, and Lint as visible controls with explicit unavailable/deferred handlers until the later tidy-markdown slice.
- Q: When the Numbered list action is applied, should each affected line use the canonical `1. ` marker without automatic renumbering? → A: Yes. Use canonical `1. ` on each affected line; convert other list kinds to it, remove it when already active, and never auto-renumber in this slice.
- Q: Should the View-menu Toggle Assistant item and the right-side visibility control share one canonical deferred action identity while both remain unavailable and create no Assistant state or panel? → A: Yes. Both surfaces use one deferred `toggle-assistant` registry identity and localized unavailable outcome; dispatch creates no Assistant state, panel, provider call, or network request.
- Q: May the visual tab strip use contained horizontal scrolling at 375 pixels while real tab behavior remains excluded? → A: Yes. Permit only the mockup-shaped visual scrolling inside the tab strip; do not create canonical tab state, tab-management commands, switching, closing, reordering, restore, or persistence.
- Q: Should formatting equivalence follow the actions present on each approved surface rather than requiring every action in every surface? → A: Yes. Bold, Italic, and Link must agree across the toolbar, keyboard, and editor context menu; Heading, list, Quote, and Table must agree across their toolbar and keyboard surfaces, plus approved overflow surfaces wherever those actions are exposed, without expanding the context menu.
- Q: At 375 pixels, should “no horizontal scroll” mean no page-level scroll while allowing the approved contained tab-strip scroll? → A: Yes. Forbid page-level horizontal scrolling; allow only contained visual tab-strip scrolling for visual reachability, with no canonical tab state or tab-management commands.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See the complete Editor-stage chrome (Priority: P1)

When a document is already available in the existing editor, the user can see the complete Editor-stage
working area: the in-app File, Settings, View, and About menu row, the document-tab presentation, the
editor controls row, and the available sidebar controls. The controls make the current state visible at
a glance and remain usable as the window becomes narrow or the appearance changes.

**Why this priority**: The requested slice is primarily a visible Editor-stage foundation. A coherent
chrome surface lets later behavior be added behind known controls without redesigning the shell, while
the existing appearance and native frame remain intact.

**Independent Test**: Start with the existing acknowledged application state and one writable current
document. At 1280, 768, and 375 logical pixels, inspect and operate the real menu and toolbar controls
in all six delivered theme/appearance combinations. Confirm the visible state, root theme attributes,
focus, responsive overflow, and absence of clipping.

**Acceptance Scenarios**:

1. **Given** the existing framed native window and acknowledged appearance state, **When** the editor
   surface is shown at 1280 pixels, **Then** the in-app row presents File, Settings, View, and About in
   that order, the document-tab presentation is visible, the controls row is one coherent row, and
   both requested sidebar controls have an inspectable state.
2. **Given** the same surface at 768 or 375 pixels, **When** the user opens menus or the controls
   overflow, **Then** every in-scope item remains reachable by pointer and keyboard, the toolbar stays
   one row, the menu/toolbar overflow is reachable, and no item clips horizontally.
3. **Given** any of the three themes and either light or dark appearance, **When** the user opens a
   menu, overflow, tooltip, or control state, **Then** the surface uses the acknowledged appearance,
   visible focus remains clear, and no new colour literal or remote asset is needed.

### User Story 2 - Apply common Markdown formatting (Priority: P1)

When the editor has focus, the user can format the selected text or current line from the controls row,
the keyboard, or the editor context menu when that action is present there. The editor continues to show
Markdown source, and each formatting action produces the same source result across all surfaces that expose
it.

**Why this priority**: Formatting is the primary Editor-stage value and is the approved Phase 04
capability that turns the existing source editor into a practical Markdown-writing tool.

**Independent Test**: With one writable document and the real document-command seam, select text and
invoke Bold from the toolbar, keyboard, and context-menu paths; repeat Heading, list, Quote, and Table
through their toolbar, keyboard, and approved overflow paths. Compare the resulting source and undo
behavior across each action's supported invocation paths.

**Acceptance Scenarios**:

1. **Given** selected source text and an editor-scoped formatting action, **When** the user invokes the
   action from the controls row, **Then** only the selected range is changed and the source remains
   visible in the editor.
2. **Given** a caret with no selection, **When** the user invokes emphasis, heading, list, quote, or
   table formatting, **Then** the action applies to the current line or inserts its documented marker
   pair/skeleton at the caret, with the caret left in the useful editing position.
3. **Given** text already wrapped in an emphasis construct, **When** the same emphasis action is
   invoked, **Then** the markers are removed rather than accumulated; pressing the action twice restores
   the original bytes.
4. **Given** a line with a different heading or list kind, **When** the target heading or list action is
   invoked, **Then** the existing marker is replaced; invoking the same kind again removes the marker.
5. **Given** the same selection and an action exposed by more than one surface, **When** the user invokes
   it through each supported surface, **Then** every supported path produces the same source and one undo
   step. Bold, Italic, and Link use the toolbar, shortcut, and editor context menu; Heading, list, Quote,
   and Table use the toolbar and shortcut, plus approved overflow surfaces wherever those actions are
   exposed.

### User Story 3 - Run document actions and editor/view controls (Priority: P2)

When the user needs document-wide cleanup or editor presentation changes, the controls, menus, and
shortcuts expose visible Format, Compact, and Lint controls together with the existing
Editor/Split/Preview, full-screen, sidebar, line-number, word-wrap, and editor-size controls. The
Phase 10 document actions are visibly unavailable in this slice and do not silently perform file I/O.

**Why this priority**: These actions complete the approved Phase 04 action registry and provide the
editor settings needed to make the visible controls useful, while keeping later file, renderer, and
Assistant work outside this slice.

**Independent Test**: Use a writable current document containing inconsistent markers, excess blank
lines, and lint findings. Inspect Format, Compact, and Lint from their named surfaces and confirm their
localized unavailable state leaves source, selection, problems, projection, and layout unchanged; then
toggle the editor/view controls and inspect the acknowledged layout state.

**Acceptance Scenarios**:

1. **Given** a writable current document, **When** the user opens Format, Compact, or Lint from any
   visible action surface, **Then** the control exposes its localized unavailable/deferred state,
   changes no source or editor state, and does not acquire the long-operation gate.
2. **Given** a document with inconsistent Markdown style, **When** the user invokes a Phase 04 inline
   formatting action, **Then** it applies only its documented selection/current-line edit through the
   shared command seam and preserves the one-edit contract.
3. **Given** the user changes the Editor/Split/Preview arrangement, line-number setting, word-wrap
   setting, or supported editor font size, **When** the change is acknowledged, **Then** the visible
   editor/view state updates without changing document content or native window framing.

### User Story 4 - Learn and reach actions by keyboard (Priority: P2)

The user can discover the available actions from tooltips, menus, the editor context menu, and a
shortcuts dialog. Each action has one stable platform-neutral binding and the displayed accelerator is
resolved to the current platform.

**Why this priority**: A Markdown editor must remain efficient for keyboard users, and one registry
prevents the toolbar, menus, context menu, and help dialog from drifting apart.

**Independent Test**: Open the shortcuts dialog, inspect every Editor-stage action, then invoke a
representative action through each supported scope with and without editor focus and while a modal is
open. Confirm platform-correct labels, focus behavior, and action suppression.

**Acceptance Scenarios**:

1. **Given** the editor is focused, **When** the user presses each approved formatting shortcut,
   **Then** the corresponding action is invoked with its documented scope and no competing action.
2. **Given** the editor is not focused, **When** an editor-scoped formatting shortcut is pressed,
   **Then** the formatting action does nothing and does not mutate the document.
3. **Given** a modal dialog is open, **When** a document or editor shortcut is pressed, **Then** the
   dialog retains focus and no action runs behind it.
4. **Given** a platform-neutral binding, **When** the menu, tooltip, context menu, or shortcuts dialog
   renders, **Then** it displays the platform-correct modifier glyphs on macOS and the correct Ctrl/Alt
   form on Windows and Linux.

### Edge Cases

- A formatting action is invoked with no selection on an empty line: marker-pair actions place the
  caret between the markers; the action does not create unrelated document content.
- A formatting action is invoked on a multi-line selection: line-based actions transform each selected
  line rather than wrapping the entire block in one marker.
- A multi-line Numbered list action is invoked: each affected line receives the canonical `1. ` marker
  when added or converted, the same action removes an existing numbered marker, and the action does not
  auto-renumber the selected lines.
- Toggle Assistant is invoked from either the View menu or the right-side control: both surfaces resolve
  to the same deferred `toggle-assistant` identity and localized unavailable outcome, with no Assistant
  state, panel, provider call, or network request.
- Format, Compact, or Lint is invoked in this slice: the control remains visibly unavailable/deferred,
  no operation gate is acquired, and no document or editor state changes.
- A document has more than 1,000 lint findings: the displayed count remains exact while decorations
  are capped at the specified limit.
- A control is used with no writable document: it is disabled or returns a localized unavailable
  outcome and never manufactures a document, file, tab, or backend success.
- The window is 375 pixels wide: menus and controls move into their approved overflow locations, the
  toolbar remains one row, no page-level horizontal scroll is introduced, and the visual tab strip may
  use contained horizontal scrolling only for visual reachability.
- A menu, tooltip, context menu, or dialog is opened in each of the six delivered palettes: its
  surface remains legible and uses only centralized tokens.
- A translated label is substantially longer than English: controls remain reachable and the layout
  does not clip or hide the accessible name.
- Reduced motion is enabled: state changes remain functionally identical and motion durations collapse
  to the existing reduced-motion tokens.
- A backend projection arrives while the editor has focus: derived state may update, but the editor
  source, caret, selection, undo history, and identity-bound working copy do not reset.

## Requirements *(mandatory)*

### Scope and migration boundary

The clarification session resolved the visual-only treatment of future File, Tabs, and right-sidebar
functionality. The existing left workspace/sidebar hide/show behavior remains functional.
This specification deliberately defines one bounded vertical slice. It does not authorize file opening,
file saving, real tab lifecycle, tab switching/closing/reordering, workspace enumeration,
rich-rendering/plugin expansion, local or remote asset persistence, Assistant controls/content/provider
behavior, or outbound network activity.

The binding visual authority for this slice is
`docs/delivery/spec/surface/mockup.html`. Its shape wins for control presence, labels, order, grouping,
tab affordances, overflow placement, responsive layout, and visible states; at 375 pixels, the tab strip
may use contained horizontal scrolling for visual reachability only; this feature specification
wins for behavior. The authoritative Editor-stage screens are `editor-split`, `editor-only`,
`no-sidebar`, `menu-file`, `menu-settings`, `menu-view`, `menu-about`, `editor-menu`,
`toolbar-overflow`, `context-menu`, `shortcuts`, `about`, `settings-editor`, and
`settings-markdown`, exercised at the mockup's `glass`, `material`, and `minimal` themes and
`auto`, `light`, and `dark` modes at 1280, 768, and 375 pixels. The completed
`specs/001-gomarkedit-product` surface and shell contracts remain consumed authority for the
delivered tokens, appearance lifecycle, focus, responsive shell, and OS-managed native frame, except
where this feature explicitly supersedes their earlier absence of File, Tabs, and the right-side
visual control. The original mockup's Assistant visuals do not authorize Assistant behavior or a
visible Assistant panel in this slice.

Every migrated rule is classified in the traceability matrix below as `Owned`, `Consumed`, or
`Deferred`. A deferred rule remains a named downstream boundary and is not represented by a fake
successful command.

### Functional Requirements

- **FR-ED-001**: The application MUST render one in-app menu row directly below the ordinary
  OS-managed native title bar with File, Settings, View, and About in that order, without replacing
  native movement, resizing, controls, or title-bar behavior.
- **FR-ED-002**: The File menu MUST expose the original mockup inventory as visual-only future
  surfaces: New File, New Window, Open File, Open Folder, an Open Recent submenu, Reopen last file /
  folder, Save, Save As, Export to PDF, Close Tab, and Exit. The representative recent entries and
  tab/file labels shown by the mockup are shape fixtures only. No item in this slice may open, save,
  export, close, or create a file or real tab; any existing implemented action remains functional
  according to its current contract.
- **FR-ED-003**: The Settings menu MUST expose the original mockup inventory: theme swatches,
  Auto/Light/Dark appearance, Default open mode (Reading/Editor), Markdown Standard
  (Minimal/GFM/Full), Autosave, Format on save, Lint on save, and All settings. It MUST expose the
  Editor settings group with line numbers, word wrap, editor font sizes exactly 13, 14, and 16, and
  the existing Markdown marker preferences. Existing implemented appearance/settings behavior remains
  working; settings whose file or renderer lifecycle is deferred MUST be visibly unavailable or inert,
  and no Assistant settings group may appear.
- **FR-ED-004**: The View menu MUST expose Editor, Split, Preview, Toggle Sidebar, Toggle Assistant,
  Line numbers, Word wrap, Distraction-free reading, and Full screen in the original mockup order and
  grouping. Editor/Split/Preview, line numbers, word wrap, sidebar, and full-screen behavior remain
  functional where already implemented; Toggle Assistant is a registry-derived deferred action shared
  with the right-side visibility control, and both it and Distraction-free reading are unavailable in
  this slice. A working arrangement change MUST keep at least one pane visible and MUST preserve the
  existing native-shell contract.
- **FR-ED-005**: The About menu MUST expose Keyboard shortcuts, Open logs folder, View on GitHub (MIT),
  and About GoMarkEdit in the original mockup order. Existing local About/version behavior remains
  functional; future log-folder and GitHub actions MUST be visibly unavailable or inert and MUST NOT
  open a remote URL, install a duplicate native macOS About owner, or add telemetry, update,
  crash-upload, or other network behavior.
- **FR-ED-006**: The application MUST expose the original mockup's document-tab presentation: the
  representative `release-notes.md` and `spec-draft.md` tabs, modified-dot state, close affordances,
  and add-tab affordance. These are visual-only future surfaces. At 375 pixels, the tab strip MAY use
  contained horizontal scrolling from the mockup as visual layout only. The application MUST NOT create
  canonical tab state or implement tab opening, closing, switching, reordering, tab-management overflow
  state or menus, session restore, or tab persistence in this slice.
- **FR-ED-007**: The application MUST expose controls to inspect and change the approved left-side
  workspace/sidebar visibility state, including its desktop, 768-pixel rail, and 375-pixel off-canvas
  presentations, without writing responsive-only widths back to durable desktop layout.
- **FR-ED-008**: The application MUST expose the requested right-side visibility control as the visual
  surface for the deferred `toggle-assistant` registry action shared with the View-menu Toggle Assistant
  item. Both surfaces MUST resolve to the same localized unavailable outcome with no functionality, panel,
  layout state, Assistant behavior, Assistant content, provider call, or visible Assistant placeholder.
  The existing left workspace/sidebar control remains the only functional sidebar visibility action in
  this slice.
- **FR-ED-009**: The controls bar MUST expose the original mockup groups: Bold, Italic, Strikethrough,
  Inline code; Heading 1, Heading 2, Heading 3; Bullet list, Numbered list, Task list, Quote; Link,
  Image, Table; and the `»` overflow control, followed by the Editor/Split/Preview arrangement
  control. At 768 pixels the list and link groups MUST move into overflow; at 375 pixels the text
  buttons and arrangement control MUST join them. Nothing may silently disappear.
- **FR-ED-010**: The controls bar MUST expose Format, Compact, and Lint using the original labels and
  placement. In this slice they are visible document-action controls with explicit localized
  unavailable/deferred handlers; they MUST NOT claim to format, compact, lint, mutate, or start a long
  operation until the later tidy-markdown slice owns those behaviors. Their Phase 10 source rules are
  recorded as deferred in the traceability matrix.
- **FR-ED-011**: Every visible action MUST have exactly one canonical registry entry containing stable
  identity, localized label/accessibility name, scope, availability, and approved shortcut where one
  exists. Menus, controls, tooltips, context menus, overflow, and shortcut help MUST render from that
  registry rather than duplicate labels or bindings.
- **FR-ED-012**: Formatting actions MUST operate only on the selected range or current line and MUST
  use the shared document-command seam; they MUST NOT replace the focused editor's full value through a
  separate component path or become a second canonical document store.
- **FR-ED-013**: Bold, Italic, Strikethrough, and Inline code MUST add their canonical marker pair when
  absent, remove it when already present immediately around or just outside the selection, and insert
  the pair at the caret when there is no selection.
- **FR-ED-014**: Heading actions MUST add the requested ATX heading level to a paragraph, replace a
  different existing level, and remove the marker when the requested level is already active.
- **FR-ED-015**: Bullet, Numbered, and Task list actions MUST add, convert, or remove the line marker
  according to the selected list kind. Numbered list actions MUST use the canonical `1. ` marker on
  each affected line, replace another list marker with `1. ` when converting, remove the marker when
  the numbered kind is already active, and MUST NOT auto-renumber selected lines in this slice. The
  canonical defaults MUST remain `-` bullets, `_` emphasis, and ATX `#` headings while continuing to
  respect the existing Markdown preferences.
- **FR-ED-016**: Quote, Link, and Table actions MUST operate through the same editor action seam;
  Table MUST insert the documented empty GFM skeleton, and Link MUST not introduce an unsolicited
  network request. Image controls MUST retain their visual registry entry and localized unavailable
  state because image drop/paste and bitmap-file behavior are deferred with the excluded file/asset
  lifecycle.
- **FR-ED-017**: Phase 04 inline and selection formatting actions MUST preserve the documented bounded
  range/current-line behavior, marker semantics, and one-edit contract. Format, Compact, and Lint MUST
  not mutate source or report a successful document operation in this slice; their full
  meaning-preserving, undo, parser, marker, and problems-list behavior is deferred with the later
  tidy-markdown slice.
- **FR-ED-018**: The existing long-operation gate MUST not be acquired by the deferred Format, Compact,
  or Lint controls in this slice. Their unavailable state MUST be localized, deterministic, and free of
  partial document changes; the full busy, cancellation, failure, and release contract is deferred and
  remains mapped to its original source anchors.
- **FR-ED-019**: The editor context menu MUST contain, in registry order, Cut, Copy, Paste, Paste as
  plain text, Bold, Italic, Link, Format document, Compact, and Command palette, with the approved
  separators and platform-resolved accelerators. It MUST dispatch the same action identities as the
  controls and menus.
- **FR-ED-020**: The shortcut registry MUST include the approved Editor-stage bindings without rebinding
  existing keys: Bold Ctrl/Cmd+B, Italic Ctrl/Cmd+I, Strikethrough Ctrl/Cmd+Shift+X, Inline code
  Ctrl/Cmd+E, Link Ctrl/Cmd+K, Image Ctrl/Cmd+Shift+I, Heading 1/2/3 Ctrl/Cmd+1/2/3, Bullet/Numbered/
  Task lists Ctrl/Cmd+Shift+8/7/9, Quote Ctrl/Cmd+Shift+., Table Ctrl/Cmd+Shift+T, Format
  Alt/Option+Shift+F, Compact Alt/Option+Shift+C, Lint Alt/Option+Shift+L, Toggle sidebar Ctrl/Cmd+\\,
  Settings Ctrl/Cmd+,, Keyboard shortcuts Ctrl/Cmd+?, and Full screen F11.
- **FR-ED-021**: Editor-scoped shortcuts MUST fire only while the editor has focus; document-scoped
  actions MUST require an open writable current document; global actions MUST remain available only
  while the window has focus; and modal dialogs MUST suppress background action dispatch.
- **FR-ED-022**: Editor display settings MUST provide line numbers on by default, word wrap off by
  default, and editor font sizes of exactly 13, 14, and 16 pixels, with 14 pixels as the default. An
  acknowledged setting change MUST update the visible editor without changing document content.
- **FR-ED-023**: Every control, menu item, tooltip, dialog, overflow item, status state, unavailable
  outcome, and error MUST use the translation catalogue, correct semantic role, accessible name,
  visible focus, reduced-motion behavior, and centralized colour tokens across all six palettes.
- **FR-ED-024**: Go/appmodel MUST remain the canonical owner of acknowledged document/action/settings
  state; Redux MUST remain a projection; the identity-bound editor working copy MUST remain ephemeral;
  and editor actions MUST synchronize through the existing document command boundary before any
  consumer reads accepted content.
- **FR-ED-025**: Only the established frontend adapter boundary may access generated Wails bindings;
  any new bound handler MUST retain the typed result, no-context, named-result, first-statement panic
  recovery, service-only, and composition-root wiring rules. Generated bindings MUST be regenerated,
  never hand-edited.
- **FR-ED-026**: The slice MUST preserve ordinary OS-managed framing and MUST NOT add custom title
  controls, drag regions, resize hit targets, private resize calls, a second window state owner,
  background network calls, remote assets, telemetry, update checks, or Assistant/provider behavior.
- **FR-ED-027**: The slice MUST not add file opening, saving, export, workspace enumeration, real tab
  lifecycle, rich-rendering/plugin expansion, or Assistant behavior as a hidden dependency of the
  requested visual controls. Any unavailable future item MUST have a clear localized state and MUST
  not manufacture a successful backend outcome.

### Dependency-complete vertical slice

This slice depends on the delivered appearance/native-shell feature `specs/001-gomarkedit-product`,
its acknowledged application-model projection, the existing identity-bound editor session and
document-command seam, the existing basic editor/preview arrangement, the existing Settings/appearance
acknowledgement path, and the existing adapter/Wails boundary. It owns the Editor-stage action registry,
formatting transformations, editor display settings, menu/controls/context-menu projections, and their
automated and live evidence. It stops before file lifecycle, real tabs, workspace, renderer expansion,
and Assistant/provider work.

The implementation plan MUST keep this as one vertical slice through the necessary state, adapter,
action, editor, and UI layers. It MUST assign every requirement above to exactly one primary task and
must not create a separate speculative File, tab, workspace, renderer, or Assistant slice to make the
requested chrome appear complete.

### Named evidence obligations

Every implementation task must name and inspect evidence that proves the rule it owns. The following
evidence names are required starting points for planning; the plan may add focused files but may not
replace them with symbol-presence checks:

| Obligation | Named evidence | What it must prove |
|---|---|---|
| Action registry and bindings | `frontend/src/logic/actions/actionRegistry.test.ts`, `frontend/src/logic/actions/shortcutRegistry.test.ts` | Unique identities, frozen bindings, scopes, platform rendering, and registry-derived surfaces |
| Formatting transformations | `frontend/src/logic/format/formatting.test.ts` | Selection/current-line scope, marker toggles/conversions, table skeleton, and exact undo-facing edit contract |
| Deferred document-action surfaces | `frontend/src/ui/widgets/EditorChrome.test.tsx`, `frontend/src/ui/widgets/ShellMenuRow.test.tsx` | Format/Compact/Lint labels, registry metadata, localized unavailable state, no gate acquisition, and no document mutation; full action tests remain deferred |
| Editor command boundary | `frontend/src/logic/hooks/useDocumentCommands.test.tsx`, `frontend/src/ui/widgets/EditorView.integration.test.tsx` | Flush-before-read, identity safety, no focused-editor text echo, and action dispatch through one seam |
| Menu and toolbar chrome | `frontend/src/ui/widgets/EditorChrome.test.tsx`, `frontend/src/ui/widgets/ShellMenuRow.test.tsx` | Full menu inventory, controls bar, overflow relocation, sidebar controls, accessible names, focus, and six-palette tokens |
| Context menu and shortcuts dialog | `frontend/src/ui/widgets/EditorContextMenu.test.tsx`, `frontend/src/ui/widgets/ShortcutsDialog.test.tsx` | Exact registry-derived context-menu order and accelerators for Cut/Copy/Paste, Bold/Italic/Link, deferred Format/Compact, and Command palette; toolbar/keyboard/overflow coverage for formatting actions not present in the context menu; modality and no duplicate handlers |
| Projection and backend authority | `internal/appmodel/*_test.go`, `frontend/src/logic/store/appModelProjection.test.ts` | Acknowledged transitions, failure retention, stale state rejection, and projection-only Redux behavior |
| Architecture and offline safeguards | `just archtest`, `frontend/scripts/archtest.mjs` | Adapter-only Wails access, tokenized/localized UI, native-shell preservation, and no introduced network path |
| Browser/live interface | `frontend/e2e/editor-stage.test.ts`, live cases `ED-LIVE-001` through `ED-LIVE-004` | Real controls at 1280/768/375 in all six palettes, root state, focus, overflow, sidebar state, and no clipping |
| Real build | `just build` plus live case `ED-LIVE-005` | The packaged/current-host application preserves the OS-managed frame and visibly exercises the Editor-stage chrome |

The live cases are:

1. **ED-LIVE-001 — Desktop chrome**: In the real development interface at 1280 pixels, operate File,
   Settings, View, About, the controls row, context menu, shortcuts dialog, and both sidebar controls;
   inspect visible state, focus, root theme attributes, and any explicit unavailable outcomes.
2. **ED-LIVE-002 — Responsive chrome**: At 768 and 375 pixels, operate the real overflow and sidebar
   controls in all six palettes; confirm one-row toolbar, no clipping, and the approved rail/off-canvas
   layout while preserving durable desktop layout.
3. **ED-LIVE-003 — Formatting journey**: In a writable current document, select text, invoke Bold by
   toolbar, shortcut, and context menu, then run a line list conversion and Table through their toolbar,
   shortcut, or approved overflow surfaces; inspect source, undo, focus, and localized outcomes. Open
   Format, Compact, and Lint and confirm their unavailable/deferred states make no source, gate, problems,
   or focus change.
4. **ED-LIVE-004 — Offline and absence audit**: Instrument the representative journey, allow only the
   local development origin, and confirm no outbound request, file I/O, workspace enumeration, real
   tab lifecycle, rich-rendering expansion, or Assistant/provider behavior occurs.
5. **ED-LIVE-005 — Current-host build**: Launch the real `just build` output and verify the ordinary
   native frame, native movement/resizing/close ownership, appearance continuity, Editor-stage chrome,
   and the explicitly excluded behavior boundaries. Record the host and any cross-platform runtime
   limitation honestly.

## Key Entities *(include if feature involves data)*

- **Action registry entry**: The stable identity, localized label, accessibility name, scope,
  platform-neutral shortcut, availability, and invocation shared by every visible action surface.
- **Editor working copy**: The focused document's identity-bound, ephemeral source, selection, caret,
  scroll, and undo state; it is not canonical application state.
- **Acknowledged editor setting**: A persisted line-number, word-wrap, or font-size preference after the
  backend has accepted it and projected the result.
- **Formatting operation**: A bounded selection/current-line edit or document-wide gated operation with
  one classified terminal outcome and explicit undo behavior.
- **Editor-stage chrome state**: The visible menu, controls, overflow, document-tab presentation, and
  sidebar/view states projected from acknowledged application state.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-ED-001**: In the automated responsive matrix, all 18 combinations of 3 widths (1280, 768, and
  375) and 6 theme/appearance palettes render the in-scope chrome without horizontal clipping or an
  unreachable control.
- **SC-ED-002**: Every in-scope action appears with one identical identity and platform-correct binding
  in every required surface: menu, control/tooltip, context menu or overflow, and shortcuts dialog;
  duplicate or conflicting bindings are zero.
- **SC-ED-003**: Pointer and keyboard invocation of the representative Phase 04 formatting set (Bold,
  Italic, heading, list, Quote, Link, and Table), plus context-menu invocation of Bold, Italic, and Link,
  produces the documented result in 100% of the named automated cases, with one undo step for each
  mutating edit; Format, Compact, and Lint remain explicitly unavailable and produce no mutation.
- **SC-ED-004**: A formatting action on selected text or the current line changes no source outside its
  defined range, and no focused-editor state update resets the caret, selection, scroll, or undo history
  in the named identity/projection tests.
- **SC-ED-005**: The named live browser cases complete with actual controls at all three widths and all
  six palettes, inspect authoritative root state and visible focus, and record zero introduced outbound
  network requests.
- **SC-ED-006**: The current-host real-build walkthrough records that the OS remains the owner of native
  framing, movement, resizing, title gestures, and close, with no custom shell substitute introduced.
- **SC-ED-007**: The implementation passes the repository's current formatting, type, lint, unit,
  architecture, frontend-build, real-build, and feature verification gates against a trustworthy
  pre-edit baseline, with no unreliable gate treated as passing evidence.
- **SC-ED-008**: A user who knows none of the shortcuts can locate the representative formatting
  actions from the visible controls, tooltip, menu/context menu, or shortcuts dialog and complete the
  formatting journey using pointer or keyboard alone.
- **SC-ED-009**: Format, Compact, and Lint are visible in every required surface with one deferred
  availability state, zero successful operation outcomes, zero gate acquisitions, and zero source
  mutations until the later tidy-markdown slice owns their behavior.

## Assumptions

- The completed `specs/001-gomarkedit-product` appearance and native-shell behavior remain consumed
  authority: six palettes, centralized tokens, localized strings, keyboard focus, reduced motion,
  ordinary OS-managed framing, and current acknowledged layout lifecycle are not reimplemented here.
- The existing current-document identity and editor command seam are available. This feature does not
  create a launcher, open a file, save a file, enumerate a workspace, or invent a document when none is
  available.
- The historical Phase 04 rules for inline and selection formatting/editor actions are migrated into
  this feature where they do not require the explicitly excluded file/asset lifecycle. Format, Compact,
  and Lint are visible registry/surface entries only; their Phase 10 document behavior is explicitly
  deferred to the later tidy-markdown slice.
- Formatting preferences continue to use the existing Markdown settings for bullet, emphasis, and
  heading markers; the canonical defaults are `-`, `_`, and ATX `#`.
- The existing basic Markdown source editor and preview arrangement are consumed. This feature does
  not add Mermaid, KaTeX, additional plugins, rich rendering, image persistence, or remote content.
- Future File, Tabs, and right-sidebar items are visual-only surfaces and have no backend command or
  hidden file/network operation in this slice. Existing implemented actions remain functional; future
  surfaces do not manufacture a successful backend result.
- New user-visible strings, colours, shortcuts, action identities, and state transitions will be
  reviewed against the existing catalogue, token, action-registry, adapter, and appmodel ownership
  rules during planning.

## Migration Traceability

The matrix uses the source anchors from the original product rules. `Owned` means this feature must
implement and prove the rule. `Consumed` means the completed `specs/001-gomarkedit-product` contract
already owns the behavior and this feature must preserve it without creating a second owner. `Deferred`
means the rule remains a named downstream requirement; this slice may show its visual shape only when
the surface requires it, but it must not claim the behavior or create a fake success.

| Source anchor | Classification | This feature's contract and evidence boundary |
|---|---|---|
| `docs/delivery/plan/phase-04-write-markdown.md#what-you-get` | Owned | Phase 04 inline formatting, editor settings, one undo step, shortcuts, and context-menu reachability are covered by FR-ED-009, FR-ED-012–016, FR-ED-019–022 and the named formatting/registry tests. |
| `docs/delivery/plan/phase-04-write-markdown.md#build-it-in-this-order` steps 1–4, 6–8 | Owned | Registry, Phase 04 formatting actions, toolbar, context menu, editor display settings, view/window bindings, shortcuts, and About are owned here. |
| `docs/delivery/plan/phase-04-write-markdown.md#build-it-in-this-order` step 5 | Deferred | TSV/CSV table paste remains mapped to `#pasting-tabular-text-makes-a-table`; no paste converter is added to this slice. |
| `docs/delivery/plan/phase-04-write-markdown.md#where-the-details-are` | Owned / Consumed | The original mockup screens and `useDocumentCommands` seam are named here; the existing command seam and native frame remain consumed dependencies. |
| `docs/delivery/plan/phase-04-write-markdown.md#questions-to-settle-first` | Consumed | The empty-selection marker-pair decision is resolved in the current Clarifications and FR-ED-013. |
| `docs/delivery/plan/phase-04-write-markdown.md#done-when` | Owned | Pointer/keyboard/context-menu equivalence, keyboard reachability, localization, tokens, and offline evidence are retained; real-build evidence is ED-LIVE-005. |
| `docs/delivery/plan/phase-10-tidy-and-share.md#what-you-get` | Deferred | Format, Compact, Lint document behavior and PDF export remain later behavior; only their required visible Editor-stage controls are surfaced here. |
| `docs/delivery/plan/phase-10-tidy-and-share.md#build-it-in-this-order` | Deferred | Formatter/linter implementation, diff view, on-save execution, and PDF export are excluded; FR-ED-010 and SC-ED-009 prove explicit unavailability. |
| `docs/delivery/plan/phase-10-tidy-and-share.md#where-the-details-are` and `#questions-to-settle-first` | Deferred / Consumed | Tidy-markdown and export ADRs remain downstream; settled gate ownership is not reinterpreted by this slice. |
| `writing-in-the-editor.md#editor-shows-source`, `#formatting-scope` | Owned / Consumed | The source editor and bounded selection/current-line actions remain authoritative; FR-ED-012 and the command-boundary tests prove no rich editor replacement. |
| `writing-in-the-editor.md#typing-is-local`, `#buffer-sync`, `#no-text-echo-into-editor` | Consumed | Existing identity-bound editor/session and document-command contracts remain in force; FR-ED-024 and the existing command-boundary evidence prevent a second store or focused-editor echo. |
| `writing-in-the-editor.md#preview-is-debounced`, `#preview-pauses-at-2mb`, `#read-only-above-10mb` | Consumed | Existing preview/input bounds remain consumed product behavior; this slice does not expand rendering or large-document handling. |
| `writing-in-the-editor.md#tab-limit`, `#per-document-view-state` | Deferred | Real tab lifecycle and per-document tab state remain downstream; the visual tab fixture in FR-ED-006 creates no canonical tab state. |
| `writing-in-the-editor.md#one-pane-minimum`, `#divider-is-draggable`, `#arrangement-shown-once`, `#editor-defaults` | Consumed / Owned | Existing pane/layout ownership is preserved; editor defaults are explicitly owned by FR-ED-022 and arrangement changes by FR-ED-004. |
| `writing-in-the-editor.md#scroll-sync-by-heading`, `#find-widget-is-themed` | Deferred | Scroll synchronization and find-widget behavior remain later editor/navigation work; no new rich-rendering or search owner is introduced. |
| `writing-in-the-editor.md#status-bar`, `#status-bar-drop-order` | Consumed / Deferred | Existing status-bar ownership remains consumed for current states; new lint/problems behavior is deferred with tidy-markdown and is not fabricated here. |
| `formatting-text.md#formatting-scope`, `#canonical-markers`, `#emphasis-toggles`, `#heading-replaces-level`, `#list-buttons-convert` | Owned | FR-ED-012–015 preserve selection/current-line scope, canonical settings, toggles, heading replacement, and list conversion. |
| `formatting-text.md#formatting-is-editor-scoped`, `#table-inserts-a-skeleton` | Owned | FR-ED-012, FR-ED-016, FR-ED-020–021 and formatting tests prove scope, table skeleton, and one shared action identity. |
| `formatting-text.md#image-insert-links-not-copies`, `#bitmap-paste-writes-a-file` | Deferred | Image drop/paste and bitmap file creation require excluded file/asset lifecycle; the Image control remains visible with explicit unavailable state only. |
| `formatting-text.md#pasting-tabular-text-makes-a-table`, `#rich-paste-is-plain` | Deferred | Spreadsheet conversion and rich-text paste behavior remain later paste work and are not silently treated as plain or table behavior in this slice. |
| `formatting-text.md#context-menu-is-the-registry`, `#toolbar-overflow` | Owned | FR-ED-009, FR-ED-011, FR-ED-019 and the chrome/context-menu tests preserve exact registry derivation and 768/375 relocation. |
| `keyboard-shortcuts.md#one-shortcut-registry`, `#shortcut-scopes`, `#the-keymap-is-frozen`, `#no-chords`, `#platform-mapping`, `#shortcuts-dialog` | Owned | FR-ED-011, FR-ED-020–021 preserve one registry, scope, frozen single-combination bindings, platform rendering, and a registry-derived dialog. |
| `keyboard-shortcuts.md#macos-owns-the-clipboard` | Consumed | Native macOS Edit roles remain platform-owned under the completed shell contract; this feature must not register duplicate clipboard/undo handlers. |
| `keyboard-shortcuts.md#formatting-shortcuts` | Owned / Deferred | Phase 04 inline formatting bindings are owned; Format, Compact, and Lint bindings are visual/deferred metadata only until tidy-markdown owns their execution. |
| `keyboard-shortcuts.md#file-shortcuts` | Deferred | File, save, export, close, and tab shortcuts remain downstream even though the File menu shape is visible-only. |
| `keyboard-shortcuts.md#search-shortcuts` | Deferred | Find/Replace, Quick open, Command palette, and Outline behavior remain downstream; reserved bindings must not be shadowed by this slice. |
| `keyboard-shortcuts.md#view-shortcuts` | Owned / Deferred | Sidebar, Settings, shortcuts dialog, and F11 are owned or consumed; Reading mode and reading-size actions remain deferred visual surfaces. |
| `tidying-markdown.md#format-parses-maximally`, `#format-is-idempotent`, `#no-reflowing`, `#ordered-list-numbering-is-kept`, `#indented-code-stays-indented`, `#table-padding-uses-display-width` | Deferred | These are formatter implementation rules and are not claimed by the unavailable Format/Compact controls. |
| `tidying-markdown.md#compact-is-conservative`, `#edits-are-one-undo-step`, `#caret-is-line-anchored`, `#format-is-gated`, `#unparseable-is-a-no-op` | Deferred | Compact/Format parsing, undo, caret, gate, cancellation, failure, and no-op behavior belong to the later tidy-markdown slice. |
| `tidying-markdown.md#lint-never-modifies`, `#lint-rules`, `#lint-markers-are-widened`, `#lint-marker-cap`, `#problems-list`, `#on-save-is-explicit-only` | Deferred | Lint rules, marker ownership/caps, problems list, and explicit-save ordering are downstream; this slice proves only unavailable/no-mutation state. |
| `settings.md#changes-apply-immediately`, `#one-statement-per-setting`, `#out-of-range-is-rejected`, `#registry-grows-safely`, `#reset-scope`, `#no-cross-window-invalidation`, `#settings-persist-in-kv` | Consumed | Existing acknowledged settings lifecycle and backend authority remain consumed; FR-ED-024–025 prevent a new frontend settings owner. |
| `settings.md#appearance-group` | Consumed | The completed appearance/native-shell feature owns the six palettes and acknowledgement behavior; the new menu reuses it. |
| `settings.md#editor-group` | Owned / Deferred | Line numbers, word wrap, and 13/14/16 editor font sizes are owned by FR-ED-022; autosave, live preview, default action scope, reading size, and reading width are deferred or visual-only. |
| `settings.md#markdown-group` | Owned / Deferred | Marker preferences are owned/consumed by FR-ED-015; Minimal/GFM/Full standard and Format/Lint-on-save are visible but deferred with renderer/tidy behavior. |
| `settings.md#export-group`, `#content-privacy-group`, `#diagnostics-group`, `#language-group`, `#defaults` | Deferred / Consumed | PDF, external-content policy, diagnostics, and language settings are outside this vertical slice; existing defaults remain unchanged. |
| `docs/delivery/spec/surface/mockup.html` screens `editor-split`, `editor-only`, `no-sidebar`, `menu-file`, `menu-settings`, `menu-view`, `menu-about`, `editor-menu`, `toolbar-overflow`, `shortcuts`, `about`, `settings-editor`, `settings-markdown` | Owned shape | These screens are the binding visual fixtures for FR-ED-001–010, 019–023 and ED-LIVE-001/002; behavior comes from this spec or the consumed contracts. The tab bar, menu row, controls grouping, and responsive states are taken from the relevant `editor-split` and menu/overflow screens. |
| `docs/delivery/spec/surface/mockup.html` screens `context-menu`, `tab-menu`, `diff-view`, `problems`, `settings-diagnostics`, `assistant-reserved` | Deferred / visual shape | The file-tree/tab context menus, diff, problems, diagnostics, and Assistant behavior remain downstream or unavailable; only the explicitly requested visual tab/control fixtures may appear without behavior. |
| `docs/delivery/architecture/rules.md`, `structure.md`, and `specs/001-gomarkedit-product/contracts/command-boundaries.md` | Consumed | Backend authority, adapter-only Wails, token/catalogue rules, component ownership, one long-operation boundary, and native shell remain applicable without a second owner. |
| `specs/001-gomarkedit-product/contracts/delivery-stages.md`, `contracts/window-launcher-shell.md` | Consumed with narrow supersession | The completed shell owns appearance, responsive frame, focus, and OS-managed native behavior. This feature explicitly supersedes only its earlier absence of File, visual Tabs, and the right-side visual control; it does not supersede the absence of file behavior, real tabs, workspace enumeration, or Assistant behavior. |

### Explicitly deferred original product authorities

The following original files remain source-of-truth requirements for later slices and are not silently
dropped by this feature: `a-folder-of-notes.md`, `chatting-about-a-document.md`,
`connecting-an-ai-provider.md`, `dragging-files-in.md`, `exporting-a-document.md`,
`finding-things.md`, `how-much-fits-in-context.md`, `images-and-remote-content.md`,
`language-and-text.md`, `opening-and-saving-files.md`, `opening-files-from-the-desktop.md`,
`quick-actions.md`, `reading-a-document.md`, `rendering-rich-documents.md`, and
`working-in-tabs.md`. Their current boundaries are workspace/file lifecycle, Assistant/provider
behavior, export/PDF, search/navigation, content/asset handling, localization policy, quick actions,
reading/rendering expansion, and real tab lifecycle respectively. The visible surfaces required by
this feature are governed only by the named mockup screens and the explicit Owned/Deferred rows above.
