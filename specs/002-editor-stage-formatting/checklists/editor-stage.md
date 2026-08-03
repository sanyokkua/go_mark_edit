# Editor-stage Requirements Quality Checklist: Editor Stage Chrome and Formatting

**Purpose**: Validate that the Editor-stage chrome, Phase 04 formatting, deferred-action boundaries, and
cross-cutting requirements are complete, clear, consistent, measurable, and ready for task generation.
**Created**: 2026-08-03
**Feature**: [spec.md](../spec.md)

**Audience/timing**: Reviewer-oriented, standard-depth pre-implementation checklist after planning.

**Focus**: Requirement completeness and clarity, Owned/Consumed/Deferred traceability, responsive/accessibility
coverage, formatting edge cases, and measurable acceptance evidence. This checklist evaluates the English
requirements and plan, not implementation behavior.

## Requirement Completeness

- [ ] CHK001 Are the four user stories, their independent-test intent, and their primary/alternate outcomes all represented without leaving a story dependent on an unstated later feature? [Completeness, Spec §User Stories 1–4]
- [ ] CHK002 Does every FR-ED-001 through FR-ED-027 requirement have exactly one primary owner and a named Owned/Consumed/Deferred disposition? [Traceability, Spec §Functional Requirements, Spec §Migration Traceability, Plan §Requirement ownership matrix]
- [ ] CHK003 Are the complete File, Settings, View, About, visual-tab, left-sidebar, right-control, toolbar, overflow, context-menu, and shortcuts-dialog inventories documented with their required order/grouping? [Completeness, Spec §FR-ED-001–010 and §FR-ED-019]
- [ ] CHK004 Are all Phase 04 formatting families, invocation surfaces, editor settings, and explicit Format/Compact/Lint unavailable states covered by requirements rather than only by the plan? [Completeness, Spec §FR-ED-009–022]
- [ ] CHK005 Are every deferred source authority, downstream entry gate, and excluded behavior named so that no original File, tab, renderer, Assistant, image, paste, tidy-markdown, or lint rule is silently omitted? [Completeness, Spec §Migration Traceability and §Explicitly deferred original product authorities]

## Requirement Clarity

- [ ] CHK006 Is the deferred/unavailable outcome defined as a localized, deterministic state with no successful operation, mutation, gate acquisition, file I/O, or network side effect? [Clarity, Spec §FR-ED-010, §FR-ED-017–018, §FR-ED-027]
- [ ] CHK007 Is the boundary between existing functional actions and visual-only File, tab, and right-sidebar surfaces explicit for every affected menu and control? [Clarity, Spec §Scope and migration boundary, §FR-ED-002–008]
- [ ] CHK008 Does each visible action have a clearly specified identity, label/accessibility name, scope, availability, shortcut, and surface membership, including actions without a working consumer? [Clarity, Spec §FR-ED-011 and §FR-ED-020–021]
- [ ] CHK009 Are selected-range, current-line, empty-caret, multi-line, marker-outside-selection, caret-placement, and one-edit semantics precise enough to distinguish every formatting result? [Clarity, Spec §FR-ED-012–017 and §Edge Cases]
- [ ] CHK010 Is the relationship between ATX Heading 1/2/3 actions and the existing Setext heading preference explicitly resolved in the governing specification, rather than only inferred from the plan? [Ambiguity, Conflict, Spec §FR-ED-014–015, Plan §Phase 0 Research Decisions]

## Requirement Consistency

- [ ] CHK011 Are the exact context-menu entries and separators consistent with the broader shortcut/control inventory, particularly the presence of Format and Compact but absence of Image and Lint? [Consistency, Spec §FR-ED-016, §FR-ED-019–020]
- [ ] CHK012 Are deferred Format/Compact/Lint availability, shortcut scope, no-gate behavior, no-mutation behavior, and later tidy-markdown ownership stated consistently across requirements, edge cases, success criteria, and migration rows? [Consistency, Spec §FR-ED-010, §FR-ED-017–018, §FR-ED-020–021, §SC-ED-009]
- [ ] CHK013 Are the one-pane minimum, Editor/Split/Preview behavior, sidebar transformations, 768/375 overflow rules, and no page-level horizontal scroll mutually consistent? [Consistency, Spec §FR-ED-004, §FR-ED-007, §FR-ED-009 and §Edge Cases]
- [ ] CHK014 Are the consumed six-palette, token, focus, localization, reduced-motion, and native-frame requirements applied consistently to every newly requested menu, toolbar, tab, dialog, and unavailable state? [Consistency, Spec §Scope and migration boundary, §FR-ED-023, §FR-ED-026, Feature 001 consumed contracts]

## Acceptance Criteria Quality

- [ ] CHK015 Does SC-ED-001 define objectively what counts as clipping, unreachable content, and acceptable responsive tab/toolbar overflow across all 18 width/palette combinations? [Acceptance Criteria, Spec §SC-ED-001]
- [ ] CHK016 Does SC-ED-002 define how identical action identity, platform-correct binding, and zero duplicate/conflicting bindings are judged across every required surface? [Acceptance Criteria, Spec §SC-ED-002, §FR-ED-011 and §FR-ED-020]
- [ ] CHK017 Do SC-ED-003 and SC-ED-004 make pointer, keyboard, and context-menu equivalence, one undo step, bounded source changes, and preserved focused-editor state objectively measurable? [Acceptance Criteria, Spec §SC-ED-003–004]
- [ ] CHK018 Do SC-ED-005 and SC-ED-006 distinguish the evidence needed for mock-bridge interface behavior, offline/absence claims, and the real current-host native frame? [Acceptance Criteria, Spec §SC-ED-005–006 and §Named evidence obligations]
- [ ] CHK019 Are the zero-success/no-gate/no-mutation outcomes for Format, Compact, and Lint measurable in every required surface rather than only stated as a general prohibition? [Acceptance Criteria, Spec §SC-ED-009]

## Scenario Coverage

- [ ] CHK020 Are primary formatting journeys defined for selection, current line, empty caret, heading/list conversion, quote, link, table, and all three invocation paths? [Coverage, Spec §User Story 2 and §SC-ED-003]
- [ ] CHK021 Are no-document, no-writable-document, detached-editor-session, editor-without-focus, unfocused-window, and modal-open outcomes specified without manufacturing a document or backend success? [Coverage, Edge Case, Spec §FR-ED-021 and §Edge Cases]
- [ ] CHK022 Are settings-write failure, invalid setting values, buffer/identity mismatch, stale projection, and pane-hide/flush failure outcomes defined with acknowledgement/failure-retention behavior? [Coverage, Exception/Recovery, Spec §FR-ED-022–025, §Edge Cases, Feature 001 application-state contract]
- [ ] CHK023 Are pointer, keyboard, toolbar, menu, overflow, context-menu, tooltip, and shortcuts-dialog discovery paths all covered by explicit requirements rather than implied by a single representative action? [Coverage, Spec §FR-ED-011, §FR-ED-019–021, §SC-ED-008]

## Edge Case Coverage

- [ ] CHK024 Are empty selections on empty lines and marker-pair caret placement specified without introducing unrelated content? [Edge Case, Spec §Edge Cases and §FR-ED-013]
- [ ] CHK025 Are multi-line selections, line-by-line list conversion, existing heading/list replacement, and markers immediately outside a selection all described without contradictory range semantics? [Edge Case, Spec §Edge Cases and §FR-ED-013–015]
- [ ] CHK026 Is the requirement for more than 1,000 lint findings reconciled with the explicit decision that lint behavior, problems, marker caps, and lint state are deferred in this slice? [Conflict, Edge Case, Spec §Edge Cases, §FR-ED-018, §Migration Traceability]
- [ ] CHK027 Are long translations, 375-pixel overflow/off-canvas behavior, six palettes, visible focus, and reduced-motion requirements specified together for every affected surface? [Edge Case, Coverage, Spec §Edge Cases and §FR-ED-023]

## Non-Functional Requirements

- [ ] CHK028 Are keyboard reachability, semantic roles, accessible names, visible focus, modal focus retention, opener restoration, localization, and reduced motion defined for menus, controls, tabs, context menus, overflow, and dialogs? [Accessibility, Spec §FR-ED-019, §FR-ED-021, §FR-ED-023]
- [ ] CHK029 Are centralized colors, six-palette legibility, bundled/local assets, and absence of new color literals or remote assets explicit for all new visual states? [Security, Tokenization, Spec §FR-ED-023, §FR-ED-026 and Feature 001 appearance contract]
- [ ] CHK030 Is offline/private behavior stated precisely enough to cover remote About links, Link formatting, deferred actions, telemetry, Assistant/provider calls, and all other unsolicited requests? [Security, Spec §FR-ED-005, §FR-ED-016, §FR-ED-026–027]
- [ ] CHK031 Are ordinary OS-managed framing, native movement/resize/title ownership, platform-specific modifier labels, and the limits of current-host versus cross-platform evidence clearly defined? [Cross-platform, Spec §FR-ED-001, §FR-ED-020, §FR-ED-026, §SC-ED-006]
- [ ] CHK032 Is the bounded-formatting performance requirement objectively quantified, or does the specification need a clearer limit beyond stating that formatting cost must not grow with the document? [Measurability, Gap, Spec §FR-ED-012 and §Success Criteria]

## Dependencies & Assumptions

- [ ] CHK033 Are the consumed Feature 001 application-state, command-boundary, appearance, responsive-layout, focus, and native-shell contracts named with the exact behavior this feature must preserve? [Dependency, Spec §Assumptions and §Migration Traceability]
- [ ] CHK034 Are the existing current-document identity, editor-session, document-command, settings acknowledgement, Markdown-marker preference, arrangement, and sidebar dependencies explicit enough to prevent a second owner? [Dependency, Assumption, Spec §Dependency-complete vertical slice and §FR-ED-024]
- [ ] CHK035 Are downstream File/launcher, real-tab, workspace, image/asset, renderer, tidy-markdown, lint/problems, export, and Assistant/provider entry gates defined independently from the visual fixtures they shape? [Dependency, Spec §Dependency-complete vertical slice, §Explicitly deferred original product authorities]

## Ambiguities & Conflicts

- [ ] CHK036 Is “Reading/Editor” default open mode aligned with the existing “viewer/editor” terminology and clearly distinguished from Editor/Split/Preview arrangement? [Ambiguity, Spec §FR-ED-003–004]
- [ ] CHK037 Is “Minimal/GFM/Full” Markdown Standard clearly separated from the deferred rich-rendering/plugin expansion and from the existing Markdown marker preferences? [Ambiguity, Spec §FR-ED-003, §FR-ED-015–016, §Migration Traceability]
- [ ] CHK038 Is the 375-pixel visual tab-strip overflow explicitly distinguished from prohibited page-level horizontal scrolling and from prohibited canonical tab lifecycle? [Ambiguity, Conflict, Spec §FR-ED-006–009 and §Edge Cases]
- [ ] CHK039 Is “existing implemented action remains functional” narrowed to a named set of consumed actions so it cannot silently expand the feature scope? [Ambiguity, Scope, Spec §FR-ED-002–005, §Assumptions]

## Notes

- This checklist is a requirements-quality review artifact; its items do not assert that implementation exists
  or that any runtime behavior has passed.
- The existing [requirements checklist](requirements.md) was preserved unchanged; this is a new focused
  checklist for the post-plan Editor-stage requirements review.
- Resolve any unchecked `[Conflict]`, `[Ambiguity]`, or `[Gap]` item in the specification or an approved
  clarification before generating implementation tasks.

