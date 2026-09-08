# Quickstart: Editor Stage Chrome and Formatting

This guide validates the implemented `002-editor-stage-formatting` slice. It is intentionally a run guide,
not an implementation recipe. It assumes the repository is at the same baseline used by the plan and that
the feature's implementation has not been mixed with unrelated File, tab, workspace, renderer, Assistant,
or tidy-markdown work.

## Prerequisites

- Go 1.25.7, Node/npm from the repository setup, and the pinned project dependencies.
- A writable current document available through the existing development bridge fixture.
- The current host's native Wails runtime for ED-LIVE-005.
- Run Playwright from `frontend/` so its config and base URL are loaded. `just dev-ui` is the mock bridge;
  `just dev` is the real bridge and prints the local DevServer URL.

## 1. Capture a trustworthy baseline before implementation

From the repository root:

```text
just baseline 002-editor-stage-formatting
```

Expected result: every configured baseline gate records its exit code, raw output, and reliability verdict
under `specs/002-editor-stage-formatting/evidence/`. Stop if any nonzero gate is `UNRELIABLE` or analyzed
no target. Do not use a baseline to waive `just archtest`.

## 2. Run focused proof while implementing

Run the named unit and integration evidence as each vertical slice lands:

```text
cd frontend
npx jest src/logic/actions/actionRegistry.test.ts src/logic/actions/shortcutRegistry.test.ts
npx jest src/logic/format/formatting.test.ts
npx jest src/ui/widgets/EditorChrome.test.tsx src/ui/widgets/ShellMenuRow.test.tsx
npx jest src/ui/widgets/EditorContextMenu.test.tsx src/ui/widgets/ShortcutsDialog.test.tsx
npx jest src/logic/hooks/useDocumentCommands.test.ts src/ui/components/CodeEditor.test.tsx src/ui/widgets/EditorView.integration.test.tsx
```

The existing repository path is `useDocumentCommands.test.ts`; do not create a duplicate `.test.tsx` solely
to match the feature prose.

Expected focused outcomes:

- Registry tests report unique identities, frozen bindings, platform-correct accelerator labels, scope
  suppression, and deferred availability.
- Formatting tests prove selected-range/current-line bounds, marker toggle/removal, ATX heading replacement,
  line-by-line list conversion, quote/link/table behavior, one edit/undo group, and exact restoration.
- Chrome tests prove the complete File/Settings/View/About inventory, visual tab fixture, left/right controls,
  responsive overflow, accessible names, six-palette token use, and explicit Format/Compact/Lint no-mutation.
- Command/editor tests prove identity safety, buffer-queue routing, no focused-editor text echo, and in-place
  line-number/word-wrap/font-size updates that preserve content, caret, selection, scroll, and undo history.

## 3. Run repository quality and architecture gates

From the repository root:

```text
just fmt-check
just typecheck
just lint
just test
just archtest
just frontend-build
```

Expected result: formatting, type, lint, unit, architecture, and frontend-build gates complete with findings
that are either absent from the baseline or repaired. Architecture failures are fixed at their source; no
allowlist/config weakening is permitted. Generated Wails bindings are regenerated with `just gen` if their
supported output changes, then `just gen-check` is rerun.

## 4. Run the responsive browser matrix

Start the mock development surface in one terminal:

```text
just dev-ui
```

Then, from `frontend/` in a second terminal:

```text
npx playwright test e2e/editor-stage.test.ts
```

The repository wrapper may also be used when its server lifecycle is configured:

```text
just e2e-test
```

The suite must cover all 18 combinations:

| Width | Appearance combinations |
|---|---|
| 1280 | Glass/Material/Minimal × Auto/Light/Dark |
| 768 | Glass/Material/Minimal × Auto/Light/Dark |
| 375 | Glass/Material/Minimal × Auto/Light/Dark |

For each combination, operate real controls and inspect:

- `html[data-theme]` and `html[data-mode]`, computed token-backed colors, Monaco theme readiness, visible focus,
  localized accessible names, and reduced-motion behavior;
- File/Settings/View/About menus, all required submenus, toolbar groups, `»` overflow, tabs fixture, and both
  sidebar controls;
- list/link relocation at 768 and text/arrangement relocation at 375; no clipped control and no page-level
  horizontal scroll. The tab fixture may use the mockup's internal tab-strip overflow, but it never becomes
  canonical tab state;
- functional existing arrangement/sidebar/appearance/About/full-screen changes; no mutation for visual-only
  deferred items;
- source, selection, caret, scroll, undo history, projection, and gate state before and after Format, Compact,
  and Lint.

## 5. Run named live cases

Start the real bridge:

```text
just dev
```

Open the printed local DevServer URL in Codex's in-app browser and execute the actual controls. Record the
tested host, viewport, root attributes, focus target, visible state, and any issue in the feature evidence
directory.

1. **ED-LIVE-001 — Desktop chrome**: At 1280, operate File, Settings, View, About, controls, context menu,
   shortcuts dialog, and both sidebar controls. Confirm unavailable outcomes are visible and localized.
2. **ED-LIVE-002 — Responsive chrome**: At 768 and 375 in all six palettes, operate menu/toolbar overflow and
   sidebar controls. Confirm one-row toolbar, no clipping, approved rail/off-canvas behavior, and no durable
   responsive-width write.
3. **ED-LIVE-003 — Formatting journey**: In a writable document, select text and invoke Bold by pointer,
   shortcut, and context menu; perform list conversion and Table; inspect source, one undo step, focus, and
   identity. Invoke Format, Compact, and Lint and confirm no mutation, gate, problems, or focus change.
4. **ED-LIVE-004 — Offline and absence audit**: Instrument the journey and permit only the local development
   origin. Confirm zero outbound requests and no file I/O, workspace enumeration, real tab lifecycle,
   rich-rendering expansion, or Assistant/provider behavior.
5. **ED-LIVE-005 — Current-host build**: Launch the real `just build` output. Confirm the ordinary OS-managed
   frame, native movement/resize/close ownership, appearance continuity, Editor-stage chrome, and all
   explicit excluded behavior boundaries. Record current-host limits honestly.

## 6. Walk the real build and verify against baseline

From the repository root:

```text
just build
just check
just verify 002-editor-stage-formatting
```

Expected result: the built binary launches and supports the Editor-stage journey; all current gates are
reliable; `just archtest` is green; verification compares fresh evidence to the pre-edit baseline; and no
deferred action is reported as successful. Inspect the named tests and retained live/real-build evidence,
then run `$speckit-converge` before review or release.

## Evidence handoff

Retain raw outputs and human-readable manifests under
`specs/002-editor-stage-formatting/evidence/`, including the baseline, focused test results, browser/request
observations, live cases, and current-host build walkthrough. A passing label without inspectable evidence is
not completion.

