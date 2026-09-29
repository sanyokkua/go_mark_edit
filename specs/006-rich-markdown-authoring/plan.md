# Implementation Plan: Rich Markdown Authoring

**Branch**: `feature/006-rich-markdown-authoring` | **Date**: 2026-09-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-rich-markdown-authoring/spec.md`

## Summary

Render the Minimal, GFM and Full Markdown standards, make Format, Compact and Lint work, and make links
to other local documents open, activate and reveal them. One frontend Markdown parser serves all three
deliverables:

1. **Rendering**: a per-standard pipeline (`createPipeline(standard)`, default Full) on the existing
   unified/react-markdown stack: GFM, front matter, strict `$` math with KaTeX, GitHub alerts and five
   admonition containers, one raw-HTML sanitizer schema, highlighted fenced code (26 grammars, offline)
   and Mermaid diagrams through a serial, hardened render queue. Heading anchors come from one extractor
   shared with the editor.
2. **Tidy**: Format, Compact and Lint run in a module Web Worker behind a plain client (`runTidy()`) on
   the same parser. Format and Compact emit minimal source edits and are refused when a render-equivalence
   check fails. Lint has ten in-house rules that share predicates with Format and feeds editor markers,
   an exact status-bar count and a problems list. A frontend operation slot allows one run per window.
3. **Links**: the existing classifier (`classifyLink`) and one open path (`openLink()`) serve the preview
   and the editor (Cmd/Ctrl-click). The backend resolver drops the folder limit, refuses network and
   device paths, and returns a tree path and a reveal path.

The backend settings service owns the Markdown defaults; a Settings group edits them. Editor highlighting
(Mermaid and the FR-RN-006 languages) uses the preview's palette through the theme generator. Evidence
and prototypes are in [research.md](./research.md).

## Technical Context

**Language/Version**: Go (module `github.com/sanyokkua/go_mark_edit`, CGO-free per Constitution V) and
TypeScript 5.8 / React 19 with Vite 7, as pinned in `go.mod` and `frontend/package.json`.

**Primary Dependencies**: existing: Wails v2.15, Redux Toolkit, `react-markdown` ^10.1.0, `remark-gfm`
^4.0.1, `rehype-sanitize` ^6.0.0, `monaco-editor` ^0.52.2 with `@monaco-editor/react` ^4.7.0. The
first task adds these to `frontend/package.json` at these ranges:

| Package                             | Range      | Use                                                                     |
| ----------------------------------- | ---------- | ----------------------------------------------------------------------- |
| `remark-math`                       | `^6.0.0`   | `$$…$$` and ` ```math ` (single-dollar math off)                        |
| `mdast-util-math`                   | `^3.0.0`   | mdast for the in-repo `$` construct                                     |
| `micromark-util-character`          | `^2.1.1`   | character tests in the in-repo `$` construct                            |
| `micromark-util-classify-character` | `^2.0.1`   | intraword emphasis classification shared by Format and Lint             |
| `rehype-katex`                      | `^7.0.1`   | formula rendering                                                       |
| `katex`                             | `^0.16.47` | KaTeX engine and CSS (0.16 line, required by `rehype-katex` 7)          |
| `remark-frontmatter`                | `^5.0.0`   | YAML front matter                                                       |
| `micromark-extension-directive`     | `^4.0.0`   | container construct only, taken from `directive().flow`                 |
| `mdast-util-directive`              | `^3.1.0`   | directive from-markdown                                                 |
| `rehype-raw`                        | `^7.0.0`   | raw HTML into the tree before sanitizing                                |
| `rehype-highlight`                  | `^7.0.2`   | preview code highlighting                                               |
| `lowlight`                          | `^3.3.0`   | explicit language registry                                              |
| `highlight.js`                      | `~11.11.2` | grammars (range matches `lowlight` 3.3's `~11.11.0`, so one copy ships) |
| `github-slugger`                    | `^2.0.0`   | heading anchors                                                         |
| `get-east-asian-width`              | `^1.7.0`   | table padding by display width                                          |
| `mermaid`                           | `^11.17.2` | diagrams, lazily imported (tested 11.17.2)                              |
| `unified`                           | `^11.0.5`  | processor; imported directly today, declared explicitly                 |
| `remark-parse`                      | `^11.0.0`  | parser; declared explicitly                                             |
| `remark-rehype`                     | `^11.1.2`  | mdast to hast; declared explicitly                                      |
| `mdast-util-to-string`              | `^4.0.0`   | heading text for anchors; declared explicitly                           |
| `hast-util-sanitize`                | `^5.0.2`   | schema type and defaults; declared explicitly                           |
| `unist-util-visit`                  | `^5.1.0`   | tree walks in the in-repo plugins; declared explicitly                  |
| `micromark-util-types` (dev)        | `^2.0.3`   | types for the in-repo construct                                         |
| `markdownlint` (dev)                | `^0.41.1`  | test oracle for the lint rules only                                     |

Newer majors exist (`katex` 0.18, `mermaid` 12) and are not adopted by this feature. No new Go
dependency and no new bridge handler.

**Storage**: the existing SQLite settings table (six existing Markdown keys; the default of
`markdown.standard` changes to `full`); no new table, no migration. Findings, the operation slot and
reveal requests are ephemeral frontend values.

**Testing**: `go test` black-box under `tests/go/{unit,integration}/`; Jest (jsdom) under
`frontend/tests/{unit,integration}/`; Playwright real-backend E2E under `frontend/tests/e2e/`; all run
through `scripts/test` and `scripts/verify`. Test titles are behaviour sentences without requirement or
task identifiers (Constitution II, lint rule L22).

**Target Platform**: macOS, Windows and Linux desktop. E2E has been measured on macOS arm64 only
(`docs/e2e-performance.md`); Linux E2E is unverified and there is no Windows E2E run. The push workflow
(Linux) runs `scripts/verify --skip e2e`; the release workflow runs the full verification, E2E included,
on macOS. Windows link spelling (FR-LK-014) and network-path refusal (FR-LK-009) are therefore proven by
Go and classifier table tests, and by the packaged-build walk when a Windows machine is available.

**Project Type**: desktop application (Go backend and embedded React/TypeScript frontend in a Wails v2
webview).

**Performance Goals**: preview reflects typing within 300 ms of the pause for documents up to 100 KB and
up to 10 diagrams appear within 2 s of opening (SC-002); a theme or standard change repaints diagrams and
code within 1 s (FR-RN-013, FR-RN-015); a tidy run shows progress and Cancel on a document above 1 MiB or once
it has lasted 1 s, and documents up to 256 KiB are parsed as one chunk. Measured during
planning (Node 24): tidy parse 1 MiB 1.0 s, 3 MiB 5.3 s, 10 MiB 32 s unchunked and 6.5 s chunked at
headings; edit computation under 0.4 s at 10 MiB; a 300-edge flowchart 1.5 s on the main thread.

**Constraints**: offline; no request, telemetry or remote asset; Mermaid `strict` with `htmlLabels:
false` and an extended `secure` list; KaTeX `trust: false`; one sanitizer schema at every standard,
keeping `id` with `clobberPrefix: ''` so footnote links resolve; no CSP exists, so sanitization is the
only defence; numeric bounds in the data model; six theme and mode combinations; every string from the
catalogue; every colour from tokens; keyboard operable.

**Scale/Scope**: six user stories (P1 rendering and tidy, P2 preview and editor links, P3 settings and
highlighting); 55 requirements (17 FR-RN, 16 FR-TD, 14 FR-LK, 6 FR-ST, 2 FR-HL); up to 10 MiB editable
text, 40 open documents, 20,000 tree entries (existing bounds unchanged).

## Constitution Check

_GATE: checked before Phase 0 and again after Phase 1 design._

| Principle                              | Result                                                                                          |
| -------------------------------------- | ----------------------------------------------------------------------------------------------- |
| I. One authority                       | PASS; Principle IV amendment (constitution 2.2.0) and ADR-0036 to ADR-0039 completed 2026-09-29 |
| II. EARS and vertical slices           | PASS                                                                                            |
| III. Backend authority and boundaries  | PASS; one new ephemeral frontend state owner (operation slot), recorded by ADR-0039             |
| IV. Offline, private, safe             | PASS; the Principle IV amendment is applied (constitution 2.2.0)                                |
| V. Data protection and cross-platform  | PASS                                                                                            |
| VI. Accessible, tokenized, coherent    | PASS                                                                                            |
| VII. Evidence before completion        | PASS; source-string assertions in `renderer.test.ts` are replaced by behaviour tests            |
| VIII. One implementation per behaviour | PASS; existing owners extended (see "Existing code replaced or changed")                        |

**Post-design re-check**: no new violation.

## Project Structure

### Documentation (this feature)

```text
specs/006-rich-markdown-authoring/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0: decisions, evidence, alternatives
├── data-model.md        # Phase 1: values, settings, bridge additions, limits
├── quickstart.md        # Phase 1: validation walk and commands
├── contracts/
│   ├── markdown-pipeline.md
│   ├── tidy-engine.md
│   ├── link-open.md
│   ├── settings-markdown.md
│   ├── editor-highlighting.md
│   └── ui-surfaces.md
├── checklists/requirements.md
└── tasks.md             # produced by /speckit-tasks
```

### Source code (repository root)

```text
internal/
├── settings/model.go                      # DefaultSettings: standard full (single defaults owner)
├── apperr/results.go                      # OpenResult gains RevealPath and TreePath
├── appmodel/preview_link.go               # folder limit removed; RevealPath, TreePath; network refusal
├── appmodel/workspace.go                  # tree-row lookup over the in-memory workspace snapshot (case via file.Identity)
└── file/paths.go                          # link-target decoding (POSIX, Windows); UNC and device refusal

frontend/
├── package.json                           # dependencies above
├── vite.config.ts                         # KaTeX CSS woff2-only transform, assetsInlineLimit 0, no modulePreload polyfill
├── scripts/generate-editor-themes-core.cjs  # unscoped preview .hljs-* rules; generic Monaco token rules
├── src/
│   ├── logic/
│   │   ├── markdown/
│   │   │   ├── pipeline.ts, sanitizeSchema.ts, headings.ts, highlight.ts        # new
│   │   │   ├── syntax/ (mathStrict.ts, containers.ts, alerts.ts)               # new
│   │   │   ├── mermaid/ (queue.ts, config.ts, scrub.ts, theme.ts)              # new
│   │   │   ├── renderer.ts                                                    # baseGfm* replaced
│   │   │   └── linkPolicy.ts                                                  # link folder limit removed
│   │   ├── tidy/ (runTidy.ts, worker.ts, protocol.ts, chunking.ts, edits.ts, rules.ts, equivalence.ts, prefs.ts)  # new
│   │   ├── operations/operationSlot.ts                                        # new
│   │   ├── actions/ (actionRegistry.ts, actionDispatcher.ts, editorActionExecutor.ts)
│   │   ├── format/formatting.ts                                               # formatMarkers carries heading style and +
│   │   ├── hooks/useDocumentCommands.ts                                       # DocumentCommandAPI navigation and edits
│   │   ├── store/ (settingsSlice.ts, appModelTypes.ts, classifiedNotification.ts)
│   │   ├── theme/ (generatedHighlight.css, generatedEditorThemes.ts)          # generated
│   │   └── adapter/ (index.ts, appModelAdapter.ts)                            # OpenResult fields
│   ├── app/ (useCommands.ts, useDocumentWrites.ts, useNotifications.ts)       # openLink, on-save, reveal
│   ├── ui/
│   │   ├── components/ (MarkdownView.tsx, MarkdownView.module.css, CodeEditor.tsx, monacoSetup.ts,
│   │   │                monaco/ (mermaid, json, diff, makefile grammars), MermaidBlock.tsx, AlertBox.tsx,
│   │   │                StatusBar/StatusBar.tsx)
│   │   └── widgets/ (PreviewPane.tsx, EditorStage/EditorStage.tsx, EditorContextMenu.tsx,
│   │                 FormattingToolbar/FormattingToolbar.tsx, useEditorActionExecutor.ts,
│   │                 WorkspaceTree/WorkspaceTree.tsx, ProblemsPanel/ (new), dialogs/SettingsDialog.tsx,
│   │                 Menubar/ (Menubar.tsx, ApplicationMenubar.tsx, ViewMenu.tsx, SettingsMenu.tsx))
│   └── i18n/locales/en.json
├── .prettierignore                        # tests/fixtures/ added
└── tests/
    ├── fixtures/                          # new, excluded from formatting: reference, messy, three-findings, tidy corpus, link tree
    ├── support/harness.ts                 # shared request guard
    ├── unit/ (markdown, tidy, operations, actions, settings, components, widgets)
    ├── integration/ (preview-links, editorStage, formattingToolbar, menubar, settings)
    └── e2e/ (rich-rendering, tidy, links, settings, editor-highlighting; existing preview-links,
              deferred-controls)

scripts/format                             # frontend/tests/fixtures/* added to the exclusion list
tests/go/unit/{file,settings}/, tests/go/integration/{application/preview_link_test.go,appmodel/}
docs/architecture.md, docs/index.md        # ADR entries (S0); deferred-list updates at close-out
```

**Structure Decision**: extend the existing owners (`logic/markdown`, `logic/actions`,
`ui/components/monacoSetup.ts`, `internal/appmodel`, `internal/settings`, `internal/file`) and add three
frontend owners with no existing counterpart: `logic/tidy` (engine and worker client),
`logic/operations` (operation slot) and `ui/widgets/ProblemsPanel` (problems list). No new Go package or
Go file.

## Existing code replaced or changed

| Code                                                                                                                                                                                                                                                                                     | Today                                                                                                                | After                                                                                                                                                                                                                                                                                                                                      | Slice      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| `ui/components/MarkdownView.tsx` `headingId()` (l. 58) and the six heading renderers                                                                                                                                                                                                     | id derived from rendered children                                                                                    | id from the `headings.ts` extractor, only on headings with an mdast counterpart                                                                                                                                                                                                                                                            | S1         |
| `logic/markdown/renderer.ts` `baseGfmSanitizeSchema`, `baseGfmRemarkPlugins`, `baseGfmRehypePlugins` (imported by `MarkdownView.tsx`, `renderer.test.ts`, `sourceLines.test.ts`)                                                                                                         | one fixed GFM pipeline                                                                                               | `createPipeline(standard)` in `pipeline.ts` and one schema in `sanitizeSchema.ts` (keeps `id`, `clobberPrefix: ''`); `renderer.ts` keeps URL transform and components                                                                                                                                                                      | S1         |
| Deferred consumers: `actionRegistry.ts` entries `format`, `compact`, `lint`, `markdown-standard`, `format-on-save`, `lint-on-save`; `FormattingToolbar.tsx:35` `deferredActions`; `EditorContextMenu.tsx:54` deferred check; `useEditorActionExecutor.ts:24` `deferredEditorShortcutIds` | disabled as deferred                                                                                                 | per-action availability with read-only and slot-busy reasons; `lint` gains the context surface; `command-palette` stays deferred                                                                                                                                                                                                           | S1, S3, S5 |
| `logic/actions/actionDispatcher.ts:193-201` document-scope gate                                                                                                                                                                                                                          | every document action needs a writable document                                                                      | Lint needs an open document; Format and Compact need a writable one                                                                                                                                                                                                                                                                        | S3         |
| `ui/widgets/Menubar/ApplicationMenubar.tsx`, `ViewMenu.tsx`                                                                                                                                                                                                                              | File, Settings, View and About only                                                                                  | new Format group (Format, Compact, Lint); View opens the problems list                                                                                                                                                                                                                                                                     | S3         |
| Markdown defaults: `internal/settings/model.go:53` (`gfm`); `store/settingsSlice.ts:12-19` (`gfm`, `*`, lint off); fallbacks `SettingsMenu.tsx:227` (`?? 'gfm'`), `:241` (`?? false`), `:248` (`?? true`); `StatusBar.tsx:61` (`?? 'gfm'`)                                               | four diverging definitions                                                                                           | `DefaultSettings()` is the only definition (Full); the frontend holds no Markdown default; before hydration header and status bar show no standard, Markdown settings rows, tidy actions and marker toolbar actions are unavailable, the preview body shows a loading state, and no settings write is issued                               | S0         |
| `ui/widgets/EditorStage/EditorStage.tsx:292` and `en.json` `editor.preview.flavour: "GFM"`; `status.markdownStandard.*` has `gfm` and `commonmark` only                                                                                                                                  | header hard-coded to GFM                                                                                             | header and status bar show the stored standard; `minimal` and `full` keys added; the unused `commonmark` key removed                                                                                                                                                                                                                       | S0         |
| `logic/theme/generatedHighlight.css` and its generator                                                                                                                                                                                                                                   | `[data-gme-highlight=…] .hljs-*` rules; imported by nothing; nothing sets the attribute                              | generator emits unscoped `.hljs-*` rules from the `--hl-*` palette; the preview imports the file once                                                                                                                                                                                                                                      | S1         |
| `app/useNotifications.ts:157` `reveal-workspace-path`; `store/classifiedNotification.ts:151`                                                                                                                                                                                             | intent is a no-op; remediation-argument check returns false, so the action never renders                             | calls `RevealWorkspacePath` with the notice's path; the check accepts a path argument                                                                                                                                                                                                                                                      | S4         |
| `OpenResult` (`internal/apperr/results.go:628`) and its consumers: `adapter/index.ts:261` `normalizeOpenResult`, `store/appModelTypes.ts`, `hooks/useLivePreview.ts`, `PreviewPane.tsx:69` `openResultRefusal`, `app/useCommands.ts`                                                     | no reveal or tree path; `normalizeOpenResult` copies fields one by one                                               | `RevealPath` and `TreePath` added and carried by every consumer; `openResultRefusal` deleted (`openLink()` reports backend refusals through `reportEntryError` without an intent, so no Retry; the parameter becomes optional); Wails models regenerated by the build                                                                      | S4         |
| `ui/widgets/PreviewPane.tsx:253-272`                                                                                                                                                                                                                                                     | calls `adapter.openPreviewLink` directly; no flush, no activation acknowledgement; handles `focused` only            | calls `openLink()` in `useCommands.ts`                                                                                                                                                                                                                                                                                                     | S4         |
| `logic/markdown/linkPolicy.ts` `classifyLink` (helpers shared with `imagePolicy.ts`)                                                                                                                                                                                                     | refuses `outside-document-folder`; back-slash UNC not refused on POSIX                                               | link folder limit removed; UNC and device paths refused on every platform; the image folder rule is unchanged                                                                                                                                                                                                                              | S4         |
| `internal/appmodel/preview_link.go`                                                                                                                                                                                                                                                      | `isWithinDirectory` (decision D11)                                                                                   | limit removed; `RevealPath`, `TreePath`; network and device paths refused; a refused `OpenPath` result carries the target's safe basename as its subject                                                                                                                                                                                   | S4         |
| `logic/format/formatting.ts` `formatMarkers()`                                                                                                                                                                                                                                           | every value other than `_` maps to `*`; no heading style                                                             | carries heading style and the `+` bullet                                                                                                                                                                                                                                                                                                   | S3         |
| `ui/components/CodeEditor.tsx` `CodeEditorHandle`, `logic/hooks/useDocumentCommands.ts` `DocumentCommandAPI`                                                                                                                                                                             | no edit list, caret placement, reveal or focus                                                                       | `applyEdits`, `setPosition`, `revealLineInCenter`, `focus` (S3); `CodeEditor` gains an `onLinkActivate(href)` prop that the rendering widget fills with `classifyLink` and `openLink()` (S4)                                                                                                                                               | S3, S4     |
| `ui/widgets/WorkspaceTree/WorkspaceTree.tsx:108-113` selection state                                                                                                                                                                                                                     | selects the active document's path exactly; resets local selection when the active path changes; no reveal or scroll | consumes the tree reveal request `{documentId, path, seq}` when that document becomes active: expands ancestors, sets the selection to `treePath` explicitly, scrolls the row into view                                                                                                                                                    | S4         |
| `ui/components/monacoSetup.ts`                                                                                                                                                                                                                                                           | markdown contribution only                                                                                           | language contributions (TOML through the existing `ini` contribution) and grammars (S6), hover contribution (S3), links contribution and providers (S4); the link opener calls the `onLinkActivate` prop injected through `CodeEditor`, because `ui/components` imports nothing from `app/`, the store, the adapter or the action registry | S6, S3, S4 |

## Existing tests changed

| Test                                                                                                                                                                                                                                                                                                                                                                                      | Asserts today                                                                              | Change                                                                                                                         | Slice |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ----- |
| `frontend/tests/unit/markdown/renderer.test.ts` (l. 52-53)                                                                                                                                                                                                                                                                                                                                | source text: no `rehypeRaw`/`remarkMath`, `skipHtml` present                               | replaced by behaviour assertions on rendered output (Constitution VII)                                                         | S1    |
| same file, EC-RENDER-6 (l. 180)                                                                                                                                                                                                                                                                                                                                                           | `$x^2$` and directive syntax stay literal in the default `MarkdownView`                    | names GFM explicitly; Full-standard cases added in S1 and S2                                                                   | S1    |
| same file, 2 MiB timing test (l. 290, 8 s bound)                                                                                                                                                                                                                                                                                                                                          | imports `baseGfm*`; times the only pipeline                                                | built on `createPipeline('gfm')` with the same bound; no Full-standard 2 MiB bound is asserted (accepted limitation, Risks)    | S1    |
| same file, production-build test (l. ~98-110)                                                                                                                                                                                                                                                                                                                                             | at most one `fetch(` per emitted `.js`                                                     | accepts KaTeX's method named `fetch` in lazy chunks while any other `fetch(` still fails                                       | S2    |
| `frontend/tests/unit/markdown/sourceLines.test.ts`                                                                                                                                                                                                                                                                                                                                        | imports `baseGfm*`                                                                         | uses `createPipeline`                                                                                                          | S1    |
| Markdown default tests: `unit/store/settingsSlice.test.ts:13`, `unit/store/settingsProjection.test.ts`, `unit/settingsProjection.test.ts`, `unit/statusBar.test.tsx`, `integration/editorStage.legacy.test.tsx:384` (header `GFM`), Go `tests/go/unit/settings/` default assertions and `tests/go/integration/settings/repository_sqlite_test.go:41` (empty registry reads `MarkdownGFM`) | `gfm` default; header hard-coded                                                           | Full from the backend; no frontend default; header follows the stored standard                                                 | S0    |
| Deferred-tidy tests: `unit/actions/actionRegistry.test.ts:24`, `actionDispatcher.test.ts:24`, `registryCatalogue.test.ts`, `unit/widgets/dialogs/ShortcutsDialog.test.tsx`, `integration/formattingToolbar.legacy.test.tsx`, `e2e/deferred-controls.test.ts:11`                                                                                                                           | `format`, `compact`, `lint` deferred and disabled                                          | assert the new availability (read-only, slot busy); Assistant, Export, image and command palette stay deferred                 | S3    |
| `integration/menubar.settings.legacy.test.tsx` (l. 194, 325)                                                                                                                                                                                                                                                                                                                              | Format on save and Lint on save rows deferred                                              | rows available and calling the same command as the Settings group                                                              | S5    |
| `tests/go/integration/application/preview_link_test.go` (l. 56-63)                                                                                                                                                                                                                                                                                                                        | refusal of "outside folder" and "symlink escape" (D11)                                     | both open; UNC, device-path and unsupported-file cases added                                                                   | S4    |
| `frontend/tests/unit/markdown/linkPolicy.test.ts` (l. 15 `path`, l. 51 `unsupported-extension`, l. 56)                                                                                                                                                                                                                                                                                    | `path` on `localDocument`; `unsupported-extension` and `outside-document-folder` for links | `path` no longer expected; both reasons removed for links; `imageSource.test.ts:24` keeps `outside-document-folder` for images | S4    |
| `frontend/tests/e2e/preview-links.test.ts` (l. ~121-143)                                                                                                                                                                                                                                                                                                                                  | outside-folder refusal notice; source stays active                                         | outside document opens and becomes the active tab                                                                              | S4    |

## Slices, requirement ownership and order

Each slice is a vertical, user-observable increment and ends with its tests plus a walk of its quickstart
rows. `/speckit-tasks` decomposes them.

| Slice | Outcome                                                                                                                                                                                                                                              | Requirements owned                                                                                     | Scenarios                        |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------- |
| S0    | Foundations: dependencies added and baseline recorded by the first task (amendment and ADR-0036 to ADR-0039 already done in planning), backend-only defaults, pre-hydration hiding, live standard in header and status bar, shared E2E request guard | FR-ST-002                                                                                              | none alone (US5-6 closes in S5)  |
| S1    | Preview renders the three standards, front matter, alerts, admonitions, the raw-HTML policy, highlighted fences and anchors; the standard row in the Settings menu works                                                                             | FR-RN-001, 002, 003, 004 (alerts, admonitions), 006, 008, 014, 015, 016, 017 (rendering, highlighting) | US1-4, 7, 8, 9, 12; US5-1        |
| S2    | Math and Mermaid render, fail locally, stay bounded and offline, and redraw with the theme                                                                                                                                                           | FR-RN-004 (math), 005, 007, 009, 010, 011, 012, 013, 017 (diagrams, formulas)                          | US1-1, 2, 3, 5, 6, 10, 11; US5-2 |
| S6    | Editor colours Mermaid and the FR-RN-006 languages from the shared palette                                                                                                                                                                           | FR-HL-001, 002                                                                                         | US6-1 to 3                       |
| S3    | Format, Compact and Lint work with the operation slot, progress, Cancel, markers, count and problems list                                                                                                                                            | FR-TD-001 to 016; FR-ST-003 (markers read by the actions)                                              | US2-1 to 19                      |
| S4    | Links open, activate, scroll and reveal from the preview and the editor                                                                                                                                                                              | FR-LK-001 to 014                                                                                       | US3-1 to 11, US4-1 to 4          |
| S5    | Markdown settings group and on-save behaviour                                                                                                                                                                                                        | FR-ST-001, 003 (settings surfaces), 004, 005, 006                                                      | US5-3 to 7                       |

Order: **S0 → S1 → {S2, S6} → S3 → S4 → S5**.

- S1 needs S0's dependencies and defaults. S1 also writes the preview part of the theme generator.
- S2 and S6 may run in parallel because their files are disjoint. S2 writes `logic/markdown/pipeline.ts`,
  `syntax/mathStrict.ts`, `mermaid/`, `MarkdownView.tsx`, `MermaidBlock.tsx`, `vite.config.ts`, the
  production-build test and its own `en.json` keys. S6 writes the language section of `monacoSetup.ts`,
  `ui/components/monaco/`, the Monaco part of the theme generator and its generated output, and adds no
  catalogue strings.
- S3 needs S2's `$` construct because tidy parses with the Full syntax, and edits `monacoSetup.ts` after
  S6. S3 owns the shared editor additions: the hover contribution and the `CodeEditorHandle` and
  `DocumentCommandAPI` methods `applyEdits`, `setPosition`, `revealLineInCenter` and `focus`.
- S4 reuses S3's caret and reveal methods and S1's heading extractor, and adds the links contribution to
  `monacoSetup.ts`. S4 and S3 both edit `useCommands.ts`, `actionRegistry.ts` and `en.json`, so they run
  in sequence.
- S5 needs S3's Format and Lint for the on-save behaviour and edits `actionRegistry.ts`, `en.json` and
  the settings surfaces after S3 and S4.

**Governance gates (completed during planning, 2026-09-29)**: (a) the Principle IV amendment was approved and
applied (`.specify/memory/constitution.md` version 2.2.0), so S4's FR-LK-001, 007, 010 and 014 tasks are not
blocked; (b) ADR-0036 to ADR-0039 are recorded in `docs/architecture.md`, so no slice waits for an ADR. Tasks
implement these decisions and do not author them.

**Repository rules from S0 on**: the ADR rows added during planning to `docs/architecture.md`, the close-out edits to
`docs/architecture.md` and `README.md`, and every text file under `frontend/tests/` (fixtures included) and
`tests/` follow two rules of `tools/lint/repo-rules.mjs` (research R20); `docs/index.md`, outside both scans,
uses the same wording:

- L22 rejects any line matching `/\bT\d{3}\b|FR-|SC-|STORY-|Proves:/`. `FR-`, `SC-`, `STORY-` and `Proves:`
  match as bare substrings anywhere in a line, so `SC-` inside a longer word also fails; a task id is `T` plus
  three digits as a whole word. The ADR rows therefore name no requirement, scenario, success-criterion or
  task id.
- L25 requires every backticked path in `README.md`, `AGENTS.md`, `CLAUDE.md` and `docs/architecture.md` that
  starts with a repository root (`frontend/`, `internal/`, `scripts/`, `docs/`, `specs/`, `tests/`, `tools/`
  and others) to exist. The S0 ADR rows therefore reference no path a later slice creates (such as the tidy
  or operation-slot folders); later slices add such references once the paths exist.

## Test placement

All tests live in `tests/go/` and `frontend/tests/`; no white-box exception is planned. Evidence per
acceptance scenario is listed in [quickstart.md](./quickstart.md) and in the contracts' test sections.
Jest cannot run real Monaco, Mermaid layout or the folder tree; E2E proves those, and Jest proves the
Mermaid queue against a mocked renderer (stale discard, coalescing, error mapping). The shared request
guard in `frontend/tests/support/harness.ts` replaces the ad hoc guard in `preview-images.test.ts` and
proves SC-006. S6's editor colouring journey has its own file, `frontend/tests/e2e/editor-highlighting.test.ts`.

Fixtures and formatting: Prettier would rewrite the markers and whitespace the tidy fixtures
(`frontend/tests/fixtures/messy-document.md`, `frontend/tests/fixtures/tidy-corpus/`) exist to test.
`scripts/format` builds its own file list from `git ls-files` with a hard-coded exclusion list and runs
Prettier from `frontend/`, so it reads `frontend/.prettierignore` and never the repository root's ignore
file. S0 therefore adds `frontend/tests/fixtures/*` to the exclusion `case` in `scripts/format` and
`tests/fixtures/` to `frontend/.prettierignore` (for direct Prettier runs from `frontend/`). Rule L22 scans
every text file under `frontend/tests/`, fixtures included, so no fixture line matches its pattern (see
"Repository rules from S0 on"). Large fixtures are generated by the tests, not committed.

## Risks

- **Case-only link matching on Windows.** Folder membership and tab reuse for links that differ only in capitalisation
  rely on `file.Identity`, which Open already uses. Its Windows branch reads volume and file-index fields that Go's
  `FileInfo.Sys()` may not expose, in which case it falls back to the path string and a case-only difference does not
  match (no tree reveal; a second tab is possible). Link behaviour is no worse than Open's. A Windows check is part of the
  packaged-build walk; extending `filesystemIdentity` is a separate change if the check fails.
- **Large-document preview (accepted by the owner).** Measured on synthetic table-rich text, the Full
  pipeline takes about 1.2 s at 0.5 MiB, 3 to 5 s at 1 MiB and 12 to 18 s at 2 MiB (the current pipeline
  takes about 8 s at 2 MiB). The live-preview pause stays at 2 MiB, so below that bound each preview
  update of a large document can block the interface for seconds. Parsing in a worker is out of scope
  (spec edge case "Large documents").
- **Tidy parse cost.** The parser is superlinear on lists and tables. Chunking, the worker, progress and
  Cancel bound it, but one 10 MiB table can still run for minutes; the Cancel path is mandatory.
- **Mermaid weight and webview differences.** About 3.4 MB lazy (the first pie or mindmap loads a 672 KB
  parser chunk); a 300-edge diagram blocks the main thread for about 1.5 s; `getBBox` and dynamic import
  behaviour in WKWebView, WebView2 and WebKitGTK is checked in the packaged build.
- **Sanitizer coupling.** The tag allowlist is the union of generated and raw tags, so a future rendering
  feature that adds tags extends the one schema. Raw-HTML `id`s are kept, so in-document anchor scrolling
  is limited to the preview container. Mermaid's `secure` list is reviewed at each Mermaid upgrade.
- **No CSP.** No Content Security Policy is set anywhere; sanitization is the only defence against raw
  HTML. Adding a CSP is out of scope.
- **Guard refusals.** About one real file in a thousand is refused by Format (a blank-line insertion that
  changes a list-in-quote parse). Repairing only the diverging block would need a spec change.
- **Bundle growth.** Accepted by the spec; sizes are reported at close against the baseline; no gate.

## Complexity Tracking

| Deviation                                                | Why needed                                                                                                            | Simpler alternative rejected because                                                                                   |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| New ephemeral state owner outside Redux (operation slot) | One run per window with progress and Cancel for a worker; no backend counterpart exists (`internal/gate` was deleted) | Redux would store non-application state in the backend projection; a backend registry would only mirror frontend state |
| In-repo micromark construct for `$` math                 | FR-RN-005 cannot be met by `remark-math` options (`$5 and $10` becomes math by default)                               | Disabling single-dollar math loses `$E=mc^2$`; forking `micromark-extension-math` is heavier                           |
| `OpenResult` gains `RevealPath` and `TreePath`           | The frontend cannot decide folder membership or the reveal path across symbolic links and filesystem case rules       | A new backend event or a frontend path comparison would duplicate resolver logic                                       |
