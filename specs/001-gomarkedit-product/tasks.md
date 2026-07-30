# Tasks: GoMarkEdit Product — First Foundation and Appearance Batch

**Input**: Design documents from `/specs/001-gomarkedit-product/`

**Binding appearance source**: `appearance-contract.md` supplies the complete palette, token,
Monaco, Auto, first-paint, accessibility, and failure rules for T005–T016. Its sibling
`surface/mockup.html` is the binding visual source for controls, labels, layouts, displayed states,
and token values; legacy files under `docs/delivery/` are reference only.

**Authorized batch**: Preserve trustworthy evidence while moving from legacy story planning to Spec
Kit, then complete the existing appearance journey. Stop before launcher/window-shell decomposition.

**Tests**: Required. The specification requires named automated evidence, live interaction checks for
visible work, and a real-build walkthrough where mock evidence cannot prove the behavior. Test tasks
must be completed before their matching implementation tasks.

**Organization**: Phase 1 captures the pre-edit comparison point. Phase 2 performs only the blocking
Spec Kit evidence transition. Phase 3 is the appearance subset of User Story 1. Phase 4 verifies and
reconciles that slice. Later User Story 1 capability groups and User Stories 2–4 remain plan-level.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can proceed in parallel after Phase 2 because it changes a separate test seam and does not
  depend on another incomplete Phase 3 task.
- **[US1]**: The task owns part of User Story 1, “View Any Supported Markdown Document,” limited to the
  complete appearance journey authorized by the delivery-stage contract.
- Every task names the exact files it creates, modifies, deletes, or records evidence in.

## Governing constraints for every task

- Preserve current behavior only after direct code and test inspection classifies it as conforming;
  repair partial or defective behavior and implement missing behavior. Historical story or phase
  status is not evidence.
- The Go backend and SQLite remain canonical. Redux remains projection metadata. The focused Monaco
  model remains an ephemeral identity-bound working copy and must not be recreated by a palette change.
- Only `frontend/src/logic/adapter/` may import `wailsjs/`. Generated Wails and database code must not
  be hand-edited.
- No color literal may appear under `frontend/src/ui/` outside
  `frontend/src/ui/styles/tokens.css`. `data-theme` and resolved `data-mode` belong only on
  `document.documentElement`; `data-mode="auto"` is invalid.
- Every visible string and accessible name must come from `frontend/src/i18n/locales/en.json` through
  `t()`. Theme and appearance controls remain keyboard reachable with visible focus. Reduced motion
  collapses tokenized durations, and palette changes never animate.
- No runtime font, theme, Monaco, highlight, telemetry, update, or other background network request is
  permitted. Generated preview highlighting is committed but remains inactive until the renderer
  slice.
- A failed settings read or write keeps the last acknowledged palette and mirror, produces the existing
  classified actionable notification through the centralized adapter envelope path, exposes no raw
  error or private path, and produces no success toast. Repeated matching failures remain deduplicated.
- Do not weaken architecture, product, formatting, typing, lint, test, build, baseline-reliability,
  browser, live, or real-build checks. Do not add an architecture allowlist entry, skip a test, or
  accept a gate that analyzed nothing.
- Do not edit `docs/delivery/spec/` or `docs/delivery/architecture/`. They are historical reference;
  the copied `appearance-contract.md` and `surface/mockup.html` are authoritative for this batch.

## Owned requirement context

This batch transfers and implements only the following complete clauses and their initial-spec detail.
All other clauses remain governed by their existing authority and are out of this task file.

### FR-002 — Bundled and offline appearance assets

The product makes no background network request and bundles every application, font, theme, language,
and editor asset. Material’s Roboto subset, Minimal’s Inter subset, Monaco, generated themes, and the
inactive preview highlight stylesheet must work without a CDN or runtime fetch.

### FR-004 and FR-005 — Accessible and localized appearance controls

Both appearance entry points and every theme or appearance option are keyboard reachable, expose the
correct role and a catalogued accessible name, show the two-layer tokenized focus ring, tolerate longer
text, and continue to work with reduced motion. Missing translations fall back to English and then the
key. Theme and appearance changes are instantaneous, not animated.

### FR-006 and FR-007 — Failure and notification behavior

A classified settings failure presents a distinct actionable title and remediation without raw errors,
secrets, full URLs, or private paths. Matching failures deduplicate by failure and subject, no more than
three toasts are visible, errors do not auto-dismiss, and successful automatic or appearance work is
silent. The current centralized adapter/notification behavior is preserved and tested, not reimplemented
inside an appearance component.

### FR-015 — Three themes and three choices

Offer exactly Liquid Glass (`glass`), Material (`material`), and Minimal (`minimal`), with Material as
default. Offer Auto, Light, and Dark, with Auto as default. Auto resolves from
`prefers-color-scheme: dark`, changes live when the operating system changes, and is the only choice
that subscribes to system changes. Pinned Light or Dark ignores the system and has no active listener.
There is no fourth theme, theme editor, imported theme, custom accent, per-document theme, or separate
editor theme.

### FR-016 — Choice, resolved mode, acknowledgement, and first paint

The stored choice (`auto | light | dark`) remains distinct from resolved `data-mode` (`light | dark`).
Theme and choice persist through the existing backend settings command. The visible root and Monaco
change only after that command is acknowledged. A theme-only startup mirror may contain only theme and
appearance choice; it updates only from an acknowledged canonical value, is never authoritative, and
causes no backend write by itself. A blocking bundled script reads it before normal application modules,
resolves Auto from the current system preference, and writes valid root attributes before first paint.
A missing, malformed, or unsupported mirror falls back to Material/Auto and normal startup reconciles
the root and mirror with SQLite without showing an unstyled/default frame after React begins. Failed
reads or writes retain the last acknowledged values.

### FR-017 — Six palettes and generated consumers

All application surfaces, Markdown source, embedded Go, selection, focus, scrollbars, status colors,
and overlays use one of six palettes: three themes by resolved light/dark mode. Every palette token
matches the binding mockup's full theme-and-mode row. Syntax tokens vary by
resolved appearance, not theme. Status tokens follow the six palette values in the binding mockup and
may vary by theme. Every specified Monaco UI color is generated from
`tokens.css`; no authored `defineTheme()` color is allowed. Markdown rules use Monaco’s bundled `.md`
postfix and embedded Go rules use `.go`, including qualified descendants: for example `keyword.md`
maps to `--md-heading` and `keyword.go` maps to `--hl-keyword`. Six named themes
`gme-{glass|material|minimal}-{light|dark}` and one inactive highlight stylesheet are deterministic,
committed build outputs. Monaco registers them once and follows valid root attribute changes without
recreating its model, moving the caret, changing selection/scroll, clearing undo history, or flushing
content.

The generated Monaco color set includes editor background/foreground, active and inactive line
numbers, cursor, selection and selection highlight, active line, gutter, widgets, suggest widget,
minimap, scrollbar slider and hover, error and warning diagnostics. Markdown source rules cover
qualified heading/marker, strong, emphasis, quote/comment descendants, link/target, fence string, and
source content scopes. Qualified Go rules cover keyword descendants, string, comment descendants,
number descendants, delimiter descendants, annotation, identifier, type, and constant scopes. The
preview stylesheet derives the same `--hl-*` values but is not imported in this batch.

### FR-078 appearance subset and SC-003

Appearance settings accept only the three themes and Auto/Light/Dark, default independently to
Material/Auto for missing or invalid values, persist immediately after acknowledgement, reject invalid
writes rather than clamp, ignore unknown stored keys, and do not change another window until relaunch.
Every affected current surface must pass interaction and layout review at 375 px, 768 px, and desktop
width in all six resolved palettes: 18 combinations per surface, with no horizontal clipping, unthemed
portal, missing focus, serif font fallback, stale Monaco palette, or runtime error.

---

## Phase 1: Trustworthy Pre-Edit Baseline

**Purpose**: Preserve the current comparison point before the first implementation edit. The existing
legacy identifier is deliberately used because evidence tooling is migrated only after this capture.

- [X] T001 Run `just baseline STORY-063`, require exit 0 with every gate’s raw output, exit code, and reliability verdict, and confirm the known generator formatting findings and unused `root` lint finding are parsed rather than marked `UNRELIABLE` in `docs/delivery/work/baselines/story-063.md` and `docs/delivery/work/baselines/story-063.logs/`

**Hard stop**: If any gate exits non-zero without a parsed finding, or architecture is red, do not start
T002. Repair or re-plan the unreliable gate; an empty-versus-empty comparison is not evidence.

---

## Phase 2: Spec Kit Evidence Foundation (Blocking)

**Purpose**: Replace only the legacy planning/traceability dependency while retaining every correctness
gate and preserving the just-captured comparison point.

**Critical**: Phase 3 cannot begin until `just verify STORY-063` can still read the Phase 1 baseline and
the new feature-slice form is covered by tests.

- [X] T002 Add failing shell contract cases for safe feature-slice identifiers, backward-compatible `STORY-063` lookup, rejection of traversal/empty identifiers, preservation of raw logs and reliability verdicts, refusal of `UNRELIABLE` evidence, and verification against the existing story baseline in `scripts/baseline_verify_test.sh`
- [X] T003 Implement shared evidence-identifier parsing and feature-slice baseline paths while retaining legacy story-baseline readability in `scripts/evidence_id.sh`, `scripts/baseline.sh`, `scripts/verify.sh`, and the `baseline`/`verify` recipes in `justfile`
- [X] T004 Remove only the superseded `spec-check` and `story-check` recipe wiring and delete legacy planning, story-shape, upgrade-marker, and `Proves:` resolution validators in `justfile`, `scripts/validate_spec.py`, `scripts/check_story.py`, `scripts/upgrade_check.py`, and `scripts/check_proves.py`; extend `scripts/baseline_verify_test.sh` to assert retained `fmt-check`, `typecheck`, `lint`, `test`, `archtest`, `frontend-build`, baseline reliability, and verification behavior remain callable

**Foundation checkpoint**: `bash scripts/baseline_verify_test.sh` passes; `just verify STORY-063` still
uses the Phase 1 report; a temporary feature-slice fixture proves the new identifier form; and direct
review confirms no product, architecture, quality, build, browser, live, or real-build gate was removed.

---

## Phase 3: User Story 1 — Complete Appearance Journey (Priority: P1) MVP

**Goal**: A user can choose any of the three themes and Light, Dark, or live Auto; the root and Monaco
change together only after acknowledgement; relaunch begins in the acknowledged palette; and all
current surfaces remain accessible, offline, and coherent in the full 18-combination matrix.

**Independent Test**: With networking disabled, launch the running interface with a persisted palette,
confirm the first root attributes before React hydration, use the keyboard to choose each theme and
mode, change the operating-system appearance while Auto is selected, and verify current surfaces plus
Monaco at 375 px, 768 px, and 1280 px in all six resolved palettes. Confirm pinned modes ignore system
changes, failed settings calls retain acknowledged state, generated assets are current and bundled, and
Monaco retains its model, text, caret, selection, scroll, and undo history.

### Tests for User Story 1

- [ ] T005 [P] [US1] Expand computed-style tests to enumerate every required surface, theme-identity, status, interaction, stacking, motion, `--md-*`, `--hl-*`, `--code-fg`, and `--gutter` token across all six palettes; prove syntax equality by resolved appearance and the six mockup status values in `frontend/src/ui/styles/tokens.test.ts`
- [ ] T006 [P] [US1] Add failing generator tests for exact six-theme names, every required Monaco UI color, `.md` and `.go` qualified base/descendant scope mappings, deterministic committed outputs, missing/duplicate/unresolved/untraceable token rejection, and inactive highlight CSS parity in `frontend/scripts/generate-editor-themes.test.mjs`
- [X] T007 [P] [US1] Add failing Monaco lifecycle tests for one-time six-theme registration, Material/light fallback, valid root-attribute switching, invalid mutation fallback, observer disposal, and preservation of model identity plus editor content/view/undo state in `frontend/src/ui/components/monacoSetup.test.ts` and `frontend/src/ui/components/CodeEditor.test.tsx`
- [ ] T008 [P] [US1] Add failing Auto lifecycle and acknowledgement tests covering one active `matchMedia` listener only for Auto, immediate coordinated root updates on system changes, no listener or response for pinned modes, latest-intent write ordering, failed read/write retention, silent success, and one deduplicated classified failure notification in `frontend/src/ui/widgets/AppearanceControls.test.tsx` and `frontend/src/logic/adapter/index.test.ts`
- [ ] T009 [P] [US1] Add failing startup-mirror and pre-paint tests for valid, missing, malformed, unsupported, stale, Auto-light, and Auto-dark values; assert the mirror contains only theme and choice, is unchanged on failed writes, and the blocking bundled script sets only valid root attributes before the application module in `frontend/src/logic/theme/startupThemeMirror.test.ts` and `frontend/public/theme-bootstrap.test.mjs`
- [ ] T010 [P] [US1] Add failing Playwright journeys for keyboard-operated appearance controls, root/Monaco palette agreement, first-load mirror behavior, failed-write retention, no runtime errors or horizontal overflow, non-serif bundled fonts, visible focus, reduced motion, and screenshots at 375 px, 768 px, and 1280 px for all six resolved palettes in `frontend/e2e/appearance.test.ts` and `frontend/e2e/appearance.test.ts-snapshots/`

### Implementation for User Story 1

- [ ] T011 [US1] Complete the sole authored palette with every missing mockup palette row, mockup-specific status rows, appearance-only syntax rows, interaction tokens, stacking tokens, motion tokens, exact SpecKit contract values, and no component color literals in `frontend/src/ui/styles/tokens.css` until T005 passes
- [ ] T012 [US1] Repair the deterministic generator to emit language-qualified Markdown and Go base/descendant rules, every required Monaco UI color, six committed definitions, and an unimported highlight stylesheet; wire generation plus drift checking before tests/build and commit the derived files in `frontend/scripts/generate-editor-themes.mjs`, `frontend/package.json`, `frontend/src/logic/theme/generatedEditorThemes.ts`, and `frontend/src/logic/theme/generatedHighlight.css` until T006 passes
- [ ] T013 [US1] Register generated themes once, derive the selected name from valid root attributes, observe only `data-theme` and `data-mode`, swap Monaco themes without model recreation, and expose deterministic observer cleanup for tests in `frontend/src/ui/components/monacoSetup.ts` and `frontend/src/ui/components/CodeEditor.tsx` until T007 passes
- [ ] T014 [US1] Refactor appearance resolution into a disposable Auto-only media-query subscription and coordinate each acknowledged theme/mode transition through the single root mutation consumed by Monaco; retain complete latest-intent serialization, pinned-mode silence, and centralized classified failure notification behavior in `frontend/src/logic/theme/theme.ts` and `frontend/src/ui/widgets/AppearanceControls.tsx` until T008 passes
- [ ] T015 [US1] Implement a versioned theme-only startup mirror written after successful backend acknowledgement or canonical startup reconciliation, never on rejection; add the bundled blocking pre-paint reader before the application module and reconcile valid SQLite settings without backend write-back in `frontend/src/logic/theme/startupThemeMirror.ts`, `frontend/src/ui/widgets/AppearanceControls.tsx`, `frontend/public/theme-bootstrap.js`, and `frontend/index.html` until T009 passes
- [ ] T016 [US1] Complete the 18-combination mock-bridge journey and stable screenshots, using real controls rather than direct DOM mutation after setup; assert current shell, settings surfaces, editor, preview, status, portals, selection/focus/scrollbars, Monaco syntax, generated theme name, layout, and authoritative root state in `frontend/e2e/appearance.test.ts` and `frontend/e2e/appearance.test.ts-snapshots/` until T010 passes

**User Story 1 checkpoint**: The appearance subset is functional and independently testable. The
generated highlight stylesheet exists but has no production import; renderer, Mermaid, KaTeX, reading
mode, and print consumers remain assigned to their later owning slices.

---

## Phase 4: Verification, Live Evidence, and Reconciliation

**Purpose**: Prove the completed batch against its trustworthy baseline and observe behavior that unit
tests or the mock bridge cannot establish.

- [X] T017 [US1] Run the focused Node/Jest/Playwright appearance suites, `just fmt-check`, `just typecheck`, `just lint`, `just test`, `just archtest`, `just frontend-build`, and `just verify STORY-063`; fix every new finding and record command results plus generated-asset drift status in `specs/001-gomarkedit-product/evidence/appearance-verification.md`
- [X] T018 [US1] Start the appropriate development server, open its local URL in the in-app browser, use the actual appearance controls at 375 px, 768 px, and 1280 px across all six resolved palettes, inspect root attributes and Monaco state, fix/reload/recheck every live finding, and record the completed interactive cases in `specs/001-gomarkedit-product/evidence/appearance-verification.md`
- [X] T019 [US1] Run `just build`, launch the real binary, verify persisted first paint, a real operating-system Auto light/dark switch, pinned-mode non-response, bundled fonts and Monaco syntax, native selection/scrollbars, keyboard focus, multiple-window acknowledged-setting isolation, and five minutes with zero outbound requests; reconcile every difference as a code defect or explicit blocker in `specs/001-gomarkedit-product/evidence/appearance-verification.md`

**Batch checkpoint**: Do not mark the batch complete unless architecture is green, verification can
read the pre-edit baseline, generated assets are current, all named tests pass, live findings were fixed
and rechecked, and the real-build cases demonstrate first paint, Auto, offline assets, and the visual
matrix. A mock-only pass is insufficient.

---

## Dependencies and Execution Order

### Phase dependencies

1. **Phase 1** has no dependency and must be the first action.
2. **Phase 2** depends on a trustworthy Phase 1 baseline. It blocks all appearance work.
3. **Phase 3 tests T005–T010** depend on Phase 2 and may be authored in parallel because they touch
   separate seams.
4. **T011** satisfies T005 and establishes the complete token source consumed by T012.
5. **T012** satisfies T006 and produces the generated data consumed by T013.
6. **T013** satisfies T007 and establishes Monaco’s root-attribute consumer before Auto and startup
   flows drive it.
7. **T014** satisfies T008 and establishes live acknowledged transitions before the mirror is added.
8. **T015** satisfies T009 and establishes first-paint state before the end-to-end matrix is finalized.
9. **T016** satisfies T010 and depends on T011–T015.
10. **Phase 4** is sequential: automated verification, live dev-server interaction, then real-build
    platform/offline evidence and reconciliation.

### User-story dependency graph

```text
Trustworthy baseline
        |
Spec Kit evidence foundation
        |
US1 appearance tests
        |
tokens -> generated assets -> Monaco consumer -> Auto transitions -> startup mirror -> 18-case matrix
        |
automated verification -> live browser check -> real-build reconciliation
        |
STOP: launcher/window-shell planning requires this implemented and reconciled basis
```

### Parallel example after Phase 2

```text
Worker A: T005 token contract tests
Worker B: T006 generator contract tests
Worker C: T007 Monaco lifecycle tests
Worker D: T008 Auto/acknowledgement tests
Then: T009 and T010 may proceed on their separate startup and Playwright files while earlier reviews run.
Implementation T011–T016 remains dependency ordered.
```

---

## Implementation Strategy

### MVP scope

The MVP for this task file is the entire authorized appearance subset of User Story 1, not merely the
generator repair. It is complete only when generated Monaco palettes, acknowledged live Auto behavior,
first-paint bootstrap, and the 18-combination evidence work together.

### Incremental delivery

1. Preserve evidence before changing the evidence tooling.
2. Move baseline identifiers and remove only obsolete planning validators while retaining correctness
   gates and old-baseline readability.
3. Establish failing behavior tests across all appearance seams.
4. Complete the token source and deterministic generated consumers.
5. Attach Monaco without changing editor identity.
6. Add acknowledged Auto behavior, then the non-authoritative pre-paint mirror.
7. Prove mock, live, native, offline, failure, and recovery behavior and reconcile the result.

### Deliberate stop boundary

After T019, stop task decomposition. Do not add launcher/window-shell, file lifecycle, renderer
activation, packaging, Editor expansion, Assistant action, or Assistant chat tasks. The next
`/speckit-tasks` run may detail the launcher/window-shell capability group only after the appearance
outcome is implemented, live-verified, and reconciled, because every new surface consumes this palette
contract.

## Phase 5: Convergence

- [X] T020 Prove every current appearance surface consumes its required computed token values across all six palettes in `frontend/src/ui/styles/tokens.test.ts` per FR-017 and T005 (partial)
- [X] T021 Reject duplicate, unresolved, and untraceable palette input and prove complete inactive-highlight parity in `frontend/scripts/generate-editor-themes.test.mjs` and `frontend/scripts/generate-editor-themes.mjs` per FR-017 and T006 (partial)
- [X] T022 Prove the actual appearance-controls lifecycle retains exactly one Auto listener, makes pinned choices non-responsive, serializes acknowledgement/failure recovery, remains silent on success, and deduplicates classified failures in `frontend/src/ui/widgets/AppearanceControls.test.tsx` and `frontend/src/logic/adapter/index.test.ts` per FR-015, FR-016, FR-006, FR-007, and T008 (partial)
- [X] T023 Prove the bundled pre-paint bootstrap itself handles valid, missing, malformed, unsupported, stale, Auto-light, and Auto-dark mirrors and runs before the application module in `frontend/public/theme-bootstrap.test.mjs`, `frontend/public/theme-bootstrap.js`, and `frontend/index.html` per FR-016 and T009 (partial)
- [X] T024 Complete Playwright evidence for startup-mirror first load, rejected-write retention, bundled non-serif fonts, visible focus, reduced motion, and stable six-palette screenshots at 375 px, 768 px, and 1280 px in `frontend/e2e/appearance.test.ts` and `frontend/e2e/appearance.test.ts-snapshots/` per FR-004, FR-005, FR-016, FR-017, SC-003, and T010 (partial)

## Phase 6: Convergence

- [X] T025 Format `frontend/e2e/appearance.test.ts` and rerun `just verify STORY-063` without accepting a formatting-drift finding per Constitution VII and the Phase 4 verification gate (partial)
