# Editor-stage reconciliation

Captured 2026-08-04 against the active spec, plan, tasks, action contract, quickstart, deferred-source
matrix, T001 trustworthy baseline, and retained evidence.

| Requirement | Result                                                                                                                                                                                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| FR-ED-001   | Implemented and covered by shell tests/live evidence: File, Settings, View, About order below the native frame                                                                                                                                                     |
| FR-ED-002   | Implemented: exact File deferred inventory; no lifecycle command                                                                                                                                                                                                   |
| FR-ED-003   | Implemented: Settings grouping, appearance/Markdown controls, editor settings, lifecycle items unavailable                                                                                                                                                         |
| FR-ED-004   | Implemented: arrangement/sidebar/editor settings/full-screen; Assistant and distraction-free unavailable                                                                                                                                                           |
| FR-ED-005   | Implemented: Keyboard shortcuts, unavailable logs/GitHub, local About/version owner                                                                                                                                                                                |
| FR-ED-006   | Implemented: inert release-notes/spec-draft visual tabs and contained-only tab-strip scrolling                                                                                                                                                                     |
| FR-ED-007   | Implemented: acknowledged left sidebar command; responsive width does not write durable width                                                                                                                                                                      |
| FR-ED-008   | Implemented: right-side Toggle Assistant control shares deferred identity and has no Assistant state/panel                                                                                                                                                         |
| FR-ED-009   | Implemented: one-row toolbar groups with responsive relocation and reachable overflow                                                                                                                                                                              |
| FR-ED-010   | Implemented: Format/Compact/Lint labels and localized unavailable state; no tidy path                                                                                                                                                                              |
| FR-ED-011   | Implemented: one frozen typed action registry                                                                                                                                                                                                                      |
| FR-ED-012   | Implemented: bounded FormatRequest/edit result through document commands                                                                                                                                                                                           |
| FR-ED-013   | Implemented: pair-marker add/remove and empty-caret behavior                                                                                                                                                                                                       |
| FR-ED-014   | Implemented: ATX heading add/replace/remove                                                                                                                                                                                                                        |
| FR-ED-015   | Implemented: line-by-line list conversion/removal with canonical `1. ` and no auto-renumbering                                                                                                                                                                     |
| FR-ED-016   | Implemented: Quote, source-only Link, empty GFM Table; Image remains deferred                                                                                                                                                                                      |
| FR-ED-017   | Implemented: one Monaco edit bracketed by undo stops with caret intent                                                                                                                                                                                             |
| FR-ED-018   | Implemented: deferred actions unavailable before mutation/gate acquisition                                                                                                                                                                                         |
| FR-ED-019   | Implemented: exact context mapping, native clipboard ownership, no Lint or Heading/list/Quote/Table context items                                                                                                                                                  |
| FR-ED-020   | Implemented: frozen cross-platform shortcut registry and rendering                                                                                                                                                                                                 |
| FR-ED-021   | Implemented: scoped dispatcher with modal, focus, writable-document, identity, and classified outcomes                                                                                                                                                             |
| FR-ED-022   | Implemented: backend-authoritative editor settings, additive persistence, 13/14/16 validation, in-place options                                                                                                                                                    |
| FR-ED-023   | Implemented: registry-derived shortcut dialog, roles, focus/escape behavior, and tokenized surfaces                                                                                                                                                                |
| FR-ED-024   | Implemented: Go/appmodel canonical state, Redux projection, identity-bound editor working copy                                                                                                                                                                     |
| FR-ED-025   | Implemented: typed Settings handler, sole adapter, mock bridge, regenerated bindings                                                                                                                                                                               |
| FR-ED-026   | Implemented in source/gates: OS-managed framing, adapter boundary, bundled/offline sources                                                                                                                                                                         |
| FR-ED-027   | Implemented in source/gates: visual-only future surfaces are guarded against lifecycle, file, Assistant, renderer, tidy, and network behavior                                                                                                                      |
| SC-ED-001   | Pass: the 27-case browser matrix covered 1280/768/375 and all six theme/appearance palettes with no page-level horizontal scroll or unreachable control                                                                                                            |
| SC-ED-002   | Pass: the frozen registry/shortcut tests and native shortcuts dialog cover identical identities and platform-correct bindings without duplicates/conflicts                                                                                                         |
| SC-ED-003   | Pass: formatting tests, browser/native toolbar and repaired native context-menu Bold, undo, and deferred-action evidence cover the named invocation outcomes                                                                                                       |
| SC-ED-004   | Pass: bounded formatter and identity/projection tests cover range limits, caret/selection/scroll/undo preservation, and one-edit behavior                                                                                                                          |
| SC-ED-005   | Pass: live browser evidence covers actual controls at all three widths and six palettes with local-origin-only request instrumentation                                                                                                                             |
| SC-ED-006   | Pass: final rebuilt current-host walkthrough records OS-owned framing, movement, resize, title gestures, and close with no custom substitute                                                                                                                       |
| SC-ED-007   | Pass: the trustworthy-baseline comparison and current format, type, lint, test, architecture, frontend-build, real-build, and feature gates pass without unreliable evidence                                                                                       |
| SC-ED-008   | Pass: visible controls, overflow, context menu, native menus, and the shortcuts dialog make the representative actions discoverable without prior shortcut knowledge                                                                                               |
| SC-ED-009   | Pass for the final rebuilt darwin/arm64 binary: native frame/movement/resize/close/chrome, settings, formatting/undo, repaired context menu, deferred controls, and excluded-boundary evidence retained; Windows/Linux runtime repetition remains outside the host |

No approved specification amendment was made and no unresolved blocker remains for the current host. The Mac
re-locked before the final rebuilt-binary ED-LIVE-005 retry, but the host was subsequently unlocked and the
retry completed. The repaired context-menu behavior is covered by the final native run, real bridge, and
focused regression evidence; no code defect or specification amendment remains identified. Windows/Linux
repetition is explicitly retained as an out-of-host evidence limit.

## Convergence T043-T047

The post-T042 assessment found five implementation gaps and classified each as a code defect resolved in
this convergence batch: typed dispatcher coverage and scope enforcement (T043), acknowledged marker
preference threading (T044), Markdown-standard deferred/inert behavior (T045), multi-line heading
preservation (T046), and registry-derived context accelerator metadata (T047). No specification amendment
was needed. The approved boundaries remain unchanged: no page-level horizontal scrolling, contained visual
tab-strip scrolling is allowed at 375px, context-menu membership remains surface-specific with no Lint,
and File/tab/image/renderer/tidy/Assistant/network behavior remains deferred.

## Convergence T061-T062

T061 closed the remaining invocation-route gap: Settings Appearance and editor-setting controls, legacy View
pane toggles, About submenu actions, and Keyboard shortcuts now use the canonical typed dispatcher with the
required application/window focus and modal context. Structural menu opening remains local state only where
it does not execute a registry action. The focused regression proof passed 9 suites and 42 tests; native
clipboard roles and all File/tab/Assistant/tidy/network deferrals remain unchanged.

T062 refreshed the official browser matrix and verifier without concurrency: 54/54 browser cases passed in
one worker, and fresh sequential M1-M6 verification passed, including real M3 static analysis. The fresh
current-host `darwin/arm64` packaged walkthrough exercised the menus, editor settings, shortcuts dialog,
deferred File/Assistant/Format/Compact/Lint surfaces, bounded Bold plus undo, native title movement, and
native close. Generated-binding parity and `git diff --check` remain separately recorded worktree tracking
results; no generated file was hand-edited. Windows/Linux runtime repetition remains an explicit out-of-host
limitation, not an unresolved in-scope blocker.

## Convergence T063

The convergence audit found one partial FR-ED-012/T011 gap: formatter offset, position, and line-bound
helpers split or copied the full source, contrary to the bounded selected-range/current-line requirement.
T063 resolved that gap with newline-indexed helpers and a selected-line window, and its large-document
regression passed alongside the named command-seam, Monaco, and EditorView suites. No other requirement,
plan decision, constitution boundary, or deferred File/tab/Assistant/tidy/network surface changed.

## Phase 13 reconciliation (2026-08-05)

T064-T067 retain the bounded formatter and unavailable deferred command results; T068 preserves the
icon-first toolbar contract; T069-T070 now have responsive hierarchy and popup ownership evidence across
the complete width, palette, and mode matrix; T071 has a fresh packaged selection-and-Bold result; T072
continues to validate preview stability; T073 retains the exact unavailable inventory; and T074 has fresh
framed-window, fullscreen, zoom, close, and responsive-resize evidence. The final quality, build, Wails
generation, e2e, verification, and diff gates pass. No in-scope specification defect remains. File/tabs,
Assistant, network, image paste, TSV rendering, Format/Compact/Lint behavior, and Windows/Linux host
repetition remain deferred exactly as specified.

## Convergence T076

The required Command palette context-menu row had been incorrectly represented as an available Window action
despite the active plan and traceability matrix deferring command-palette behavior. T076 changes only its
registry availability to localized deferred/unavailable. The row, separator, Window scope, and shortcut-help
discovery remain present; dispatcher resolution now stops before an invocation. No command palette, search,
quick-open, file, tab, Assistant, network, or backend behavior was added. Focused red/green tests, live
real-bridge observation, current repository gates, generation tracking, and a fresh native package build pass.
