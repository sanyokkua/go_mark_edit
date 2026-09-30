---
description: 'Task list for Feature 006 — Rich Markdown Authoring'
---

# Tasks: Rich Markdown Authoring

**Input**: Design documents from `/specs/006-rich-markdown-authoring/`

**Prerequisites**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md),
[data-model.md](data-model.md), [quickstart.md](quickstart.md),
[contracts/markdown-pipeline.md](contracts/markdown-pipeline.md),
[contracts/tidy-engine.md](contracts/tidy-engine.md), [contracts/link-open.md](contracts/link-open.md),
[contracts/settings-markdown.md](contracts/settings-markdown.md),
[contracts/editor-highlighting.md](contracts/editor-highlighting.md),
[contracts/ui-surfaces.md](contracts/ui-surfaces.md).
Repository-wide authority: [docs/architecture.md](../../docs/architecture.md).
Principles: [.specify/memory/constitution.md](../../.specify/memory/constitution.md).
Working rules: [AGENTS.md](../../AGENTS.md).

**Tests**: Required. Constitution VII and AGENTS.md "Evidence and handoff" make named passing tests part of every
task's completion evidence, so each task below names the test files it owns and the cases they must cover.

## How to run these tasks

Each task is executed in its **own agent session**, in plan mode, with that task's briefing as the only context.
A task therefore carries everything needed to plan it: the story it serves, the requirement ids it satisfies, the
documents and sections to read first, the existing code that owns the behaviour being extended (with the file and
line where it lives **as verified on 2026-09-29** — re-check a line before editing, files move), the files to
create or modify, the tests to write, and the explicit boundary of what it must not touch.

A task briefing is **not** an implementation plan. It states scope and references; the session plans the
implementation itself, after reading the named material and the real code.

The first task executed (T001) records the baseline before its first edit (`scripts/baseline`); no task exists just for
that. The governance decisions this feature needs — the Constitution 2.2.0 amendment of Principle IV and ADR-0036 to
ADR-0039 in `docs/architecture.md` — were made during planning and are already in the repository. The narrow commands in each task's **Verify** line are checks to run _while working_. **A task is complete only when the full six-stage `scripts/verify` is green against the baseline** (AGENTS.md "Development loop" step 4) and the task's **Definition of done** has been re-read; E2E is part of that gate, so a task that changes what an existing E2E asserts updates that E2E in the same task.

## Standing rules (apply to every task; not repeated below)

- **L22 — no identifiers in code or tests.** `tools/lint/repo-rules.mjs` rejects any line matching
  `/\bT\d{3}\b|FR-|SC-|STORY-|Proves:/` in production sources, in **every text file under `frontend/tests/` and
  `tests/` (fixtures included)**, and in `README.md`, `AGENTS.md`, `CLAUDE.md` and `docs/architecture.md`.
  `FR-`, `SC-`, `STORY-` and `Proves:` match as bare substrings (so `SC-` inside a longer word fails too). Test
  titles are behaviour sentences (Constitution II). `specs/` is excluded, so this file may use the ids. Never
  copy text from `specs/` into a fixture without checking it.
- **L25 — referenced paths must exist.** Every backticked path that starts with a repository root (`frontend/`,
  `internal/`, `scripts/`, `docs/`, `specs/`, `tests/`, `tools/`, …) in `README.md`, `AGENTS.md`, `CLAUDE.md` and
  `docs/architecture.md` must exist when Lint runs. `docs/index.md` is outside both scans but uses the same wording.
- **L6 (Go) — no callerless exports.** `tools/archlint/main.go` fails Lint on an exported Go func/type/var/const
  with no production use. A Go helper or field is therefore introduced by the task that first consumes it.
- **Boundaries.** Only `frontend/src/logic/adapter/` imports `wailsjs/`. `frontend/src/ui/components/**` and
  `ui/primitives/**` import nothing from `logic/store`, `logic/adapter` or `logic/actions` (`frontend/eslint.config.js`
  l.107-148) — they receive props. The Redux store is a disposable projection; the Go backend is authoritative.
- **Tests live in `tests/go/{unit,integration}/` and `frontend/tests/{unit,integration,e2e}/`.** No white-box test
  under a production package is planned for this feature.
- **Strings, colours, ownership.** Every user-visible string comes from `frontend/src/i18n/locales/en.json`
  (`t()` returns the raw key when one is missing); every colour is a token; reuse an existing primitive, hook or
  owner before adding one (AGENTS.md "Ownership first"). Do not weaken or delete a valid test to get green.
- **Offline.** Nothing added may make a network request, load a remote asset, or use a `data:` font
  (`tools/lint/bundle-scan.mjs`).
- **Commit hygiene.** One task = one Conventional Commit on a task branch
  `feature/006-rich-markdown-authoring-<task>`, squash-merged into `feature/006-rich-markdown-authoring`. Generated
  files (`frontend/wailsjs/`, `frontend/src/logic/theme/generated*`) are regenerated by the build and committed
  when they change; the Build stage requires a clean tree.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: `[US1]`…`[US6]`, mapping the task to one user story in `spec.md`. Setup, Foundational and Polish
  tasks carry no story label.
- Each task names exact file paths.

## Path conventions

Desktop application, one Wails v2 binary. Go backend under `internal/` with the composition root at `main.go`;
React/TypeScript frontend under `frontend/src/`. Go tests: `tests/go/unit/`, `tests/go/integration/` (external
`package <x>_test`). Frontend tests: `frontend/tests/{unit,integration,e2e}/`, helpers in `frontend/tests/support/`,
fixtures in `frontend/tests/fixtures/`.

## Story-to-slice map

| Story | Priority | plan.md slice | Tasks     |
| ----- | -------- | ------------- | --------- |
| —     | —        | S0            | T001–T005 |
| US1   | P1       | S1, S2        | T006–T017 |
| US2   | P1       | S3            | T018–T028 |
| US3   | P2       | S4            | T029–T035 |
| US4   | P2       | S4            | T036      |
| US5   | P3       | S5            | T037–T039 |
| US6   | P3       | S6            | T040–T042 |
| —     | —        | close-out     | T043–T046 |

---

## Phase 1: Setup

**Purpose**: Dependencies, fixture formatting exclusions and the baseline record.

- [x] T001 Record the baseline, add the feature's dependencies and the fixture formatting exclusions in `frontend/package.json`, `scripts/format` and `frontend/.prettierignore`

    **Story / Priority**: Setup (T006 onward import these packages)

    **Requirements**: plan.md §"Technical Context" dependency table and §"Test placement" (fixtures and formatting) ·
    research.md R7–R13, R19.

    **Read first**: plan.md §"Primary Dependencies" (the full table with ranges and why each is there; note the
    pins: `highlight.js ~11.11.2`, `katex ^0.16.47`, `mermaid ^11.17.2`, and that katex 0.18 / mermaid 12 are **not**
    adopted) and §"Test placement" (formatting paragraph); research.md R13 (why Monaco stays 0.52.2).

    **Existing code to extend**: `frontend/package.json` (today: `react-markdown ^10.1.0`, `remark-gfm ^4.0.1`,
    `rehype-sanitize ^6.0.0`, `monaco-editor ^0.52.2`, no rendering libraries); `frontend/package-lock.json`;
    `frontend/package.json.md5` (a 32-byte hash file — find how `scripts/build setup` / `frontend/tests/support/prepare.ts`
    use it and update it the way the tooling expects); `scripts/format` (the first `case "$path" in` exclusion list
    at about l.38-40 already skips `frontend/wailsjs/*`, `specs/*/evidence/*`, …); `frontend/.prettierignore`
    (`dist/`, `node_modules/`, `wailsjs/`, `package-lock.json`, `playwright-report/`, `test-results/`).

    **Create / modify**:
    - `frontend/package.json` + `package-lock.json`: add `remark-math ^6.0.0`, `mdast-util-math ^3.0.0`,
      `micromark-util-character ^2.1.1`, `micromark-util-classify-character ^2.0.1`, `rehype-katex ^7.0.1`,
      `katex ^0.16.47`, `remark-frontmatter ^5.0.0`, `micromark-extension-directive ^4.0.0`,
      `mdast-util-directive ^3.1.0`, `rehype-raw ^7.0.0`, `rehype-highlight ^7.0.2`, `lowlight ^3.3.0`,
      `highlight.js ~11.11.2`, `github-slugger ^2.0.0`, `get-east-asian-width ^1.7.0`, `mermaid ^11.17.2`,
      `unified ^11.0.5`, `remark-parse ^11.0.0`, `remark-rehype ^11.1.2`, `mdast-util-to-string ^4.0.0`,
      `hast-util-sanitize ^5.0.2`, `unist-util-visit ^5.1.0`; dev: `micromark-util-types ^2.0.3`,
      `markdownlint ^0.41.1`. Confirm a single `highlight.js` copy ships (`npm ls highlight.js`).
    - `scripts/format`: add `frontend/tests/fixtures/*` to that exclusion `case`.
    - `frontend/.prettierignore`: add `tests/fixtures/`.

    **Step 0 — baseline (only place it is recorded)**: before the first edit, run `scripts/baseline` unless
    `.local_tmp_files/baseline/006-rich-markdown-authoring.json` already exists (Constitution VII; AGENTS.md "Development loop"
    step 2). Confirm all six stages (Lint, Format, Build, Unit, Integration, E2E) ran and collected results; a stage that exited
    non-zero having collected nothing, or a required count that is unavailable, is unreliable — fix the runner rather than
    working around it (`scripts/baseline` refuses to write such a record). Record each stage's result and every pre-existing
    failure in the completion note so later tasks are not blamed for them. E2E has been measured on macOS arm64 only
    (`docs/e2e-performance.md`).

    **Steps of substance**: `npm install` inside `frontend/` (use the existing toolchain, not global tools); verify
    the lockfile resolves the ranges above; verify the exclusion works by temporarily staging a mis-formatted file
    under `frontend/tests/fixtures/` and running `scripts/format --check` (then unstage and delete it).

    **Tests**: none new; the existing suites must stay green with packages installed but unused.

    **Out of scope**: importing any new package from source (later tasks do), the Vite KaTeX transform (T014),
    Go dependencies (none are added by this feature).

    **Definition of done**: the baseline record exists with all six stages reliable, `package.json`/lock/md5 agree, `scripts/build setup` works from a clean checkout,
    fixtures are excluded from Prettier both from `scripts/format` and direct runs in `frontend/`, and the Build
    stage still produces a clean tree.

    **Verify**: `scripts/baseline --compare` (no drift before any code change), `scripts/build setup`, `scripts/verify --skip e2e`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Slice S0 — backend-owned defaults, pre-hydration behaviour, the live standard in the header and status
bar, and the shared request guard. Every story reads the stored Markdown standard and every E2E proof of the
offline promise uses the guard.

**⚠️ CRITICAL**: No task that reads the stored Markdown settings (T006 onward, except the file-disjoint T013, T015 and T018 noted below) may begin until T002–T005 are complete.

- [x] T002 Make Full the backend default Markdown standard in `internal/settings/model.go`

    **Story / Priority**: Foundational (US1, US5)

    **Requirements**: FR-ST-002 (defaults: Full, `-`, `_`, ATX, Format on save off, Lint on save on), FR-RN-001 ·
    spec.md "Changes to earlier specs" (spec 001 FR-018) · data-model.md §"Persisted: Markdown settings" ·
    research.md R16.

    **Read first**: data-model.md §"Persisted: Markdown settings"; contracts/settings-markdown.md §Settings ("only
    definition of the defaults", invalid or missing stored value reads as the default, no migration).

    **Existing code to extend**: `internal/settings/model.go:53` (`Standard: MarkdownGFM` inside `DefaultSettings`,
    l.47-72; the other five defaults are already correct). Tests that hard-code the old default:
    `tests/go/integration/settings/repository_sqlite_test.go:41` (empty registry reads `MarkdownGFM`),
    `tests/go/unit/settings/handler_test.go` (l.18 uses `MarkdownMinimal`; l.58-61), `tests/go/unit/settings/service_test.go:33`,
    and users of `DefaultSettings()` in `tests/go/unit/settings/editor_settings_test.go`,
    `tests/go/integration/application/startup_test.go`, `context_test.go`. Also grep `tools/e2e-seed/` for a seeded
    standard.

    **Create / modify**: `internal/settings/model.go`; the Go tests above.

    **Tests**: update the default assertions to `MarkdownFull`; add (in `tests/go/unit/settings/` and
    `tests/go/integration/settings/`) a round trip of each of the six Markdown keys, and a case where an invalid
    stored value and a missing key each read back as the default (Full). No migration is written.

    **Also**: add `status.markdownStandard.minimal` and `status.markdownStandard.full` to `frontend/src/i18n/locales/en.json` now (T004 removes the unused `commonmark` key and moves the header), so the status bar never shows a raw key once Full is the default.

    **Out of scope**: any frontend default (T003); the generated Wails models need no change (values only).

    **Definition of done**: `DefaultSettings().Markdown.Standard == full`, all Go suites green, no other Go file
    names the old default.

    **Verify**: `scripts/test unit` and `scripts/test integration` (Go parts), then `scripts/verify lint`.

- [x] T003 Remove frontend Markdown defaults and gate every surface on hydration in `frontend/src/logic/store/settingsSlice.ts`, `frontend/src/ui/widgets/Menubar/SettingsMenu.tsx`, `frontend/src/ui/components/StatusBar/StatusBar.tsx`, `frontend/src/ui/widgets/AppShell.tsx`

    **Story / Priority**: Foundational (US1, US5)

    **Requirements**: FR-ST-002 (until the stored settings have loaded: no standard in header or status bar; Markdown
    settings controls, Format/Compact/Lint and marker toolbar actions unavailable; preview shows a loading state;
    **no settings write**) · data-model.md §"Persisted…" second half · contracts/settings-markdown.md §"Until the
    settings projection is hydrated" · plan.md "Existing code replaced or changed" row "Markdown defaults".

    **Read first**: contracts/settings-markdown.md (the hydration bullet list and "Existing code that changes");
    research.md R16.

    **Existing code to extend** (verified): `frontend/src/logic/store/settingsSlice.ts:12-19`
    (`defaultMarkdownSettings`: `gfm`, emphasis `*`, Lint on save off — **remove**; the slice holds no Markdown
    value until `hydrated`); `frontend/src/ui/widgets/Menubar/SettingsMenu.tsx:227` (`?? 'gfm'`), `:241`
    (`?? false`), `:248` (`?? true`); `frontend/src/ui/components/StatusBar/StatusBar.tsx:61` (`?? 'gfm'` inside
    `legacyFacts()`); **and** `frontend/src/ui/widgets/AppShell.tsx:51,67-135`, which builds the facts the app
    actually renders from `useEditorSettings().markdownSettings.standard` — pre-hydration hiding must change
    AppShell, not only StatusBar. Action availability: `frontend/src/logic/actions/actionRegistry.ts`
    (`ActionUnavailableReason` at l.19-20 has no settings-loading value — add one; `ActionAvailabilityContext`
    ~l.125-141); the toolbar actions that use the bullet or emphasis marker are `bullet-list` and `italic`
    (check `frontend/src/logic/actions/editorActionExecutor.ts:199` `formatMarkers` call site for the full set).
    The settings write path: `frontend/src/logic/settings/settingsCommands.ts` (`updateMarkdown` merges the whole
    group). Preview body: `frontend/src/ui/widgets/PreviewPane.tsx`.

    **Create / modify**: the files above; `frontend/src/i18n/locales/en.json` (a `preview.loading` string and the
    unavailable reason text); update `frontend/tests/unit/store/settingsSlice.test.ts:13`,
    `frontend/tests/unit/store/settingsProjection.test.ts`, `frontend/tests/unit/settingsProjection.test.ts`,
    `frontend/tests/unit/statusBar.test.tsx`.

    **Tests** (behaviour, not source): before hydration — no standard fact in the status bar or preview header,
    the settings popup rows for the standard/Format on save/Lint on save are disabled, the marker toolbar actions
    are unavailable with the loading reason, the preview body shows the loading state and **not** the document, and
    invoking a settings command issues no `updateMarkdown` call; after hydration every surface shows the stored
    value (drive with values that differ from the old frontend defaults, e.g. emphasis `_`, Lint on save `true`).

    **Out of scope**: rendering the standard in the header (T004), the Format/Compact/Lint availability logic
    (T026 — only the loading reason is added here), the settings rows going live (T011, T037).

    **Definition of done**: no Markdown default exists in the frontend, no `??` fallback remains at the four cited
    sites, and the pre-hydration behaviour above is proven by tests.

    **Verify**: `scripts/test unit`, `scripts/test integration`, `scripts/verify lint`.

- [x] T004 Show the stored Markdown standard in the preview header and status bar in `frontend/src/ui/widgets/EditorStage/EditorStage.tsx` and `frontend/src/i18n/locales/en.json`

    **Story / Priority**: Foundational (US1, US5)

    **Requirements**: FR-RN-015 (header and status bar update within one second), FR-ST-002, FR-ST-003 (standard) ·
    contracts/ui-surfaces.md §"Preview surfaces" and "Catalogue additions" · contracts/settings-markdown.md
    "Existing code that changes".

    **Read first**: contracts/ui-surfaces.md §"Preview surfaces"; data-model.md bullets on `status.markdownStandard.*`.

    **Existing code to extend**: `frontend/src/ui/widgets/EditorStage/EditorStage.tsx:292` (hard-coded
    `editor.preview.flavour`); `frontend/src/i18n/locales/en.json:57` (`editor.preview.flavour: "GFM"`),
    `en.json:18-19` (`status.markdownStandard.gfm` and the unused `commonmark`); the status fact `standard-kind` in
    `AppShell.tsx:67-135`. Tests asserting the header: `frontend/tests/integration/editorStage.legacy.test.tsx:384`
    (`GFM`); `frontend/tests/unit/adapter/index.test.ts:83` uses `'commonmark'` as a value — check it when the key
    is removed.

    **Create / modify**: `EditorStage.tsx` (header shows `t('editor.preview.standard.<standard>')`, and nothing
    before hydration); `en.json`: add `editor.preview.standard.{minimal,gfm,full}` and
    `status.markdownStandard.{minimal,full}`, keep `gfm`, **remove** `commonmark` and `editor.preview.flavour`;
    update the tests above.

    **Tests**: for each of Minimal/GFM/Full the header and status bar show the localized name; changing the stored
    standard (dispatch the projection update) changes both without remounting; hidden before hydration.

    **Out of scope**: changing what the preview renders (T006, T007).

    **Definition of done**: no "GFM" literal remains in `EditorStage.tsx`, `commonmark` key removed, tests updated.

    **Verify**: `scripts/test unit`, `scripts/test integration`, `scripts/verify lint`.

- [x] T005 Add the shared offline request guard in `frontend/tests/support/harness.ts` and adopt it in `frontend/tests/e2e/preview-images.test.ts`

    **Story / Priority**: Foundational (SC-006 proof used by T012, T017, T028, T035, T039, T042)

    **Requirements**: FR-RN-017, SC-006 · research.md R19 · plan.md §"Test placement" ("The shared request guard in
    `frontend/tests/support/harness.ts` replaces the ad hoc guard in `preview-images.test.ts` and proves SC-006").

    **Read first**: research.md R19; `frontend/tests/support/harness.ts` (`export const test` at l.294 extends
    Playwright with `E2EFixtures`; `E2EAppHarness` l.55; `app.launch()`, `app.page`); `frontend/tests/e2e/preview-images.test.ts`
    (l.59-61: an ad hoc `page.on('request')` that only records URLs containing `example.com`).

    **Create / modify**: `frontend/tests/support/harness.ts` (a guard the fixture installs on the page:
    `page.on('request')`, allow only the app origin — the E2E Vite origin/devserver and the backend
    `/preview-image` route are app origin — collect anything else, expose `expectNoForeignRequests()`); extract the
    pure predicate (`isForeignRequest(url, appOrigin)`) so it is unit-testable; adopt in `preview-images.test.ts`
    (its `example.com` assertion stays: remote images keep their placeholder and produce no request).

    **Tests**: `frontend/tests/unit/tooling/requestGuard.test.ts` (or the existing tooling folder) for the
    predicate: app origin allowed, `data:`/`blob:` policy stated and asserted, a foreign host, a `ws:` request, a
    path on another port each flagged; `preview-images.test.ts` still passes using the shared guard.

    **Out of scope**: adding the guard to other journeys (each later E2E task adopts it).

    **Definition of done**: one shared guard, the ad hoc one deleted, predicate tests green.

    **Verify**: `scripts/test unit`, `scripts/test e2e` (preview-images).

---

## Phase 3: User Story 1 — Read rich Markdown in the preview (Priority: P1) 🎯 MVP

**Goal**: The preview renders the Minimal, GFM and Full standards — tables, task lists, footnotes, front matter,
math, Mermaid, highlighted code, alerts, admonitions and allowed inline HTML — fails locally, stays bounded and
offline, follows the theme, and never delays typing.

**Independent Test**: Open `frontend/tests/fixtures/reference-document.md` at Full and confirm every construct of
FR-RN-003 and FR-RN-004 renders, that the broken formula and the broken diagram fail locally, that the hostile
HTML does nothing, and that no network request is made (quickstart Q1–Q9, Q27, Q28).

**Reference implementation (behaviour only, never copy)**: `/Users/ok/Development/GitHub/dev.tools` —
`src/components/elements/mermaid/MermaidBlock.tsx` (stale-result flag, per-render id, error box),
`src/common/mermaid.ts` (lazy `import('mermaid')`, parse then render), `src/pages/mermaid-editor/index.tsx`
(400 ms debounce, editor + live preview pairing), `src/pages/markdown-tools/index.tsx:35-47,229-235`
(remark-gfm/remark-math/rehype-katex/rehype-highlight wiring; its `code` override nests a diagram inside `<pre>`,
does not clean up failed renders, does not redraw on theme change and sets no `secure` list — research R12 lists
what is deliberately **not** copied), `src/common/prompts/skills/mermaid/skill.ts:41-46` (16 tested diagram
skeletons covering all 12 required diagram types — unescape the string to source fixtures), tests under
`test/components/elements/mermaid/`.

- [x] T006 [US1] Build the per-standard pipeline and the single sanitizer schema in `frontend/src/logic/markdown/pipeline.ts`, `frontend/src/logic/markdown/sanitizeSchema.ts`, `frontend/src/logic/markdown/renderer.ts`

    **Story / Priority**: US1 (P1). Needs T001 (ADR-0036 is already recorded).

    **Requirements**: FR-RN-001, FR-RN-002, FR-RN-003, FR-RN-008 · US1-4 (unknown fence), US1-7 (hostile HTML) ·
    ADR-0036 · research R7.

    **Read first**: contracts/markdown-pipeline.md §"Public surface", §"Plugin order (normative)" (steps 1-6 are this
    task; 7-11 belong to later tasks), §"Sanitization schema", §"Syntax by standard"; research.md R7; spec.md
    FR-RN-008 (the exact allow and strip lists); data-model.md §"Value: MarkdownStandard capabilities".

    **Existing code to extend / replace**: `frontend/src/logic/markdown/renderer.ts` — `baseGfmSanitizeSchema`
    (l.15), `baseGfmRemarkPlugins` (l.44), `baseGfmRehypePlugins` (l.46), the URL transform (`previewUrlTransform`,
    keeps `file:` so the link policy can refuse it visibly) and the components stay; the schema moves. The
    existing `rehypeSourceLines` / `withSourceLineAttributes` (synchronized scrolling, `data-source-line`) must stay
    in the chain at step 5. Importers of `baseGfm*`: `frontend/src/ui/components/MarkdownView.tsx` (l.6-7 import,
    l.184-185 use), `frontend/tests/unit/markdown/renderer.test.ts` (l.15-17, 50-53, 298),
    `frontend/tests/unit/markdown/sourceLines.test.ts` (l.7, 153).

    **Create / modify**:
    - `sanitizeSchema.ts` — the `hast-util-sanitize` default schema with `clobberPrefix: ''`, `img` limited to
      `alt`/`src`, `data-source-line` kept, `file` added to `href` protocols, plus the `strip` list (the 29 elements
      of FR-RN-008: `script`, `style`, `iframe`, `object`, `embed`, `form`, `noscript`, `template`, `textarea`,
      `select`, `button`, `svg`, `math`, `title`, `head`, `frame`, `applet`, `link`, `meta`, `base`, `audio`,
      `video`, `canvas`, `noembed`, `noframes`, `xmp`, `plaintext`, `dialog`, `portal`) and `tagNames` (raw
      allowlist `details summary kbd sub sup mark ins del br abbr img a` plus what Markdown generates: `p h1–h6
blockquote ul ol li pre code em strong hr table thead tbody tr th td input` and the footnote `section`).
      `div` and `span` are **not** listed (they unwrap).
    - `pipeline.ts` — `createPipeline(standard)` (memoised) and `syntaxPlugins(standard)` per the contract:
      minimal = CommonMark; gfm adds `remark-gfm` + `remark-frontmatter(['yaml'])`; the `full` entry equals `gfm`
      here (T009, T014 add to it; T013 only builds the `$` construct). Steps 3-6: `remark-rehype({allowDangerousHtml: true})`, `rehype-raw`,
      `rehypeSourceLines`, `rehype-sanitize(schema)`. Leave clearly named insertion points for steps 7-11.
    - `renderer.ts` — remove `baseGfm*`; keep URL transform and components. `MarkdownView.tsx` — temporary
      minimal change: call `createPipeline('gfm')` where it used `baseGfm*` (T007 replaces this with the `standard`
      prop).
    - Tests: rewrite `renderer.test.ts` (l.52-53 source-text checks for `rehypeRaw`/`remarkMath`/`skipHtml` become
      behaviour assertions on rendered output — Constitution VII; EC-RENDER-6 at l.180 names GFM explicitly; the
      2 MiB timing test at l.290-314 builds on `createPipeline('gfm')` with the same 8 s bound), and `sourceLines.test.ts`
      (uses `createPipeline`). New: `frontend/tests/unit/markdown/pipeline.test.ts` and `sanitizeSchema.test.ts`.

    **Tests** (each is a behaviour sentence): syntax by standard for every row of the contract table that exists at
    this point (Minimal shows a table and `~~x~~` and `- [ ]` and a footnote reference as literal text; GFM
    renders them; front matter is parsed and not shown; only `---` on line 1 counts); the hostile raw-HTML set —
    every `strip` element the HTML parser actually creates in body context is removed **with its text** (`<script>alert(1)</script>` leaves no `alert(1)`; for the void elements `embed`, `link`, `meta`, `base` and the tags the parser ignores in body context, `head` and `frame`, assert only that no such element exists — they cannot hold text), an
    `onclick`, a `style` attribute, `javascript:`/`data:` in several spellings (case, leading space, entity-encoded
    tab) dropped, an unknown element unwrapped with its text kept; the allowlist elements render (`<kbd>`, `<details>`,
    `<sub>`, `<mark>` …); a raw `<p>` renders as a paragraph; footnote links resolve (`clobberPrefix: ''`); a raw
    `id` is kept; a fenced block with an unknown or no language renders as plain monospaced text with no error.

    **Out of scope**: `MarkdownView` `standard` prop and loading state (T007), heading ids (T008), alerts (T009),
    highlighting (T010), math (T013-T014), Mermaid (T015-T016).

    **Definition of done**: `baseGfm*` no longer exists, one schema is used at every standard, the tests above pass,
    and the preview looks unchanged for existing GFM content.

    **Verify**: `scripts/test unit`, `scripts/test integration`, `scripts/verify lint`.

- [x] T007 [US1] Drive the preview from the stored standard with last-good-render fallback in `frontend/src/ui/components/MarkdownView.tsx`, `frontend/src/ui/widgets/PreviewPane.tsx`, `frontend/src/ui/widgets/EditorStage/EditorStage.tsx`

    **Story / Priority**: US1 (P1). Needs T003, T004, T006.

    **Requirements**: FR-RN-001, FR-RN-015 (re-render every open document within one second of a standard change),
    FR-RN-016 · US1-12 · contracts/markdown-pipeline.md §"Public surface" (last paragraph) and §"Failure behaviour
    and limits".

    **Read first**: contracts/markdown-pipeline.md (the two sections above); contracts/ui-surfaces.md §"Preview
    surfaces" (whole-render failure error appears above the retained last render); quickstart.md Q6.

    **Existing code to extend**: `frontend/src/ui/components/MarkdownView.tsx` (imports the pipeline; `ui/components`
    must not read the store, so `standard` arrives as a **prop** and the component is memoised on `(source,
standard)`); `frontend/src/ui/widgets/PreviewPane.tsx` and `EditorStage.tsx` (widgets that hold the stored
    standard and already gate the body on hydration from T003).

    **Create / modify**: `MarkdownView.tsx` (`standard: MarkdownStandard` prop; `createPipeline(standard)`; an error
    boundary or equivalent that keeps the **last successful render** of that document and shows an inline error
    above it when a render throws — per document, so switching documents never shows another document's retained
    render); `PreviewPane`/`EditorStage` pass the hydrated standard; `en.json` (`preview.renderError.*`); tests.

    **Tests**: `frontend/tests/unit/components/MarkdownView.test.tsx` (new or extend) — switching the `standard`
    prop re-renders (Full → GFM → Minimal changes what is literal); a forced pipeline failure (inject a throwing
    plugin) keeps the previous rendering and shows the inline error, and the next successful render clears it (this
    is the unit proof quickstart Q6 relies on, because no known document fails to render); a retained render is never reused for a different document id; a Go fence is highlighted at Minimal and at GFM (highlighting and diagrams apply at every standard).

    **Out of scope**: the Settings row (T011); Full-only constructs (T009, T013, T014).

    **Definition of done**: `MarkdownView` has no default standard, US1-12 has a passing test, the preview follows
    the stored standard live.

    **Verify**: `scripts/test unit`, `scripts/test integration`, `scripts/verify lint`.

- [x] T008 [US1] Give headings shared anchors and scroll links inside the preview container in `frontend/src/logic/markdown/headings.ts`, `frontend/src/logic/markdown/pipeline.ts`, `frontend/src/ui/components/MarkdownView.tsx`, `frontend/src/ui/widgets/PreviewPane.tsx`

    **Story / Priority**: US1 (P1). Needs T006. T033 and T036 reuse `extractHeadings`.

    **Requirements**: FR-RN-014 · US1-8, US1-9 · contracts/markdown-pipeline.md §"Heading anchors" · data-model.md
    §"Value: Heading" · research R10.

    **Read first**: contracts/markdown-pipeline.md §"Heading anchors" and pipeline step 8; research.md R10 (the
    precautions: convert heading text with `includeImageAlt: false, includeHtml: false`; slug **before** KaTeX; never
    slug hast headings without an mdast counterpart — a raw `<h2>` and the footnote `<h2 class="sr-only">` would
    shift the duplicate counter; Hindi/Thai combining marks must survive — a literal `\p{L}\p{N}` filter is wrong).

    **Existing code to replace**: `MarkdownView.tsx:58` `headingId()` and the six heading renderers at l.137-172
    (id derived from rendered children). Anchor handling for `anchor` links lives in `PreviewPane.tsx` — find the
    current `getElementById` usage and replace it.

    **Create / modify**: `headings.ts` (`extractHeadings(source): Heading[]` with `{depth, text, slug, line}` from
    mdast via `github-slugger`; `headingAnchor(headings, slug)`); a remark step recording headings and a rehype step
    (pipeline step 8) that assigns `id = slug` only to `h1`–`h6` whose start line matches an extracted heading;
    `MarkdownView` renderers stop deriving ids; anchor scrolling searches **only inside the preview container**, and
    when several elements carry the same id the first in document order wins; export a small
    `scrollToAnchor(container, slug)` helper reused by T033.

    **Tests**: `frontend/tests/unit/markdown/headings.test.ts` — `Über uns` → `über-uns`; three `Notes` →
    `notes`, `notes-1`, `notes-2`; `Hello_World` keeps the underscore; CJK/Cyrillic survive; a Hindi heading keeps
    combining marks; image alt and raw HTML excluded from slug text; a raw `<h2>` and the footnote heading get no slug
    and keep any `id` they already carry; a raw `<h2 id="setup">` is scrollable; anchor lookup never touches an
    element outside the container (place a colliding id outside).

    **Out of scope**: editor caret placement (T033/T036 call `extractHeadings`), fragment requests (T033).

    **Definition of done**: `headingId()` is deleted; US1-8/US1-9 have passing tests.

    **Verify**: `scripts/test unit`, `scripts/test integration`, `scripts/verify lint`.

- [x] T009 [US1] Render GitHub alerts and the five admonition containers in `frontend/src/logic/markdown/syntax/containers.ts`, `frontend/src/logic/markdown/syntax/alerts.ts`, `frontend/src/ui/components/AlertBox.tsx`

    **Story / Priority**: US1 (P1). Needs T006 (and T008 only for shared pipeline file ordering).

    **Requirements**: FR-RN-004 (alerts and containers part) · US1-1 (alert, admonition), US5-1 (literal below Full) ·
    contracts/markdown-pipeline.md pipeline steps 2 and 9, "Syntax by standard" · research R9.

    **Read first**: contracts/markdown-pipeline.md (plugin order steps 2 and 9, syntax table, the paragraph "An
    unknown `:::name` at Full is literal text… Only container directives are enabled"); research.md R9 (why the full
    `directive()` extension cannot be used: text/leaf directives corrupt prose — `12:30`, `foo:bar`, `Note:this`;
    known limits: `:::tip[Title]` drops the label; an unclosed `:::note` runs to the end of its container);
    contracts/ui-surfaces.md §"Preview surfaces" (alert boxes: icon from `Icon`, localized title, tokens only).

    **Existing code to reuse**: `frontend/src/ui/primitives/Icon/Icon.tsx` (add any missing glyph there — check what
    exists first); design tokens in `frontend/src/ui/styles/tokens.css`; the component map in `renderer.ts`.

    **Create / modify**:
    - `syntax/containers.ts` — use **only** the container construct of `micromark-extension-directive` (the
      `concrete: true` entry inside `directive().flow`'s list registered on `:`; the package exports only
      `directive` and `directiveHtml`) with `mdast-util-directive`'s from-markdown; a remark step rewrites each of
      `note`, `tip`, `important`, `warning`, `caution` into the mdast shape of a GitHub alert (a `blockquote` whose
      first child is a paragraph holding only `[!KIND]`, followed by the container's children); any other name
      becomes a paragraph holding the source slice. Text and leaf directives are never parsed. Added to
      `syntaxPlugins('full')`.
    - `syntax/alerts.ts` — a rehype step placed **after sanitize** (step 9, Full only): `> [!NOTE|TIP|IMPORTANT|
WARNING|CAUTION]` (marker alone on its line, case-insensitive) → `div.md-alert.md-alert-<kind>[role=note] >
p.md-alert-title`; handles GitHub alerts and rewritten admonitions alike.
    - `AlertBox.tsx` + component-map entry: icon from `Icon`, title `t('preview.alert.<kind>')`
      (`preview.alert.{note,tip,important,warning,caution}` added to `en.json`), tokens-only styling in
      `MarkdownView.module.css` or a module beside the component; readable in all six theme combinations.

    **Tests**: `frontend/tests/unit/markdown/alerts.test.ts` — `:::warning` and `> [!WARNING]` with the same body
    render identical alert output; all five kinds; case-insensitive marker; a `> [!NOTE]` with text on the marker line
    stays a blockquote; unknown `:::foo` is literal text; `12:30`, `foo:bar`, `::x` stay prose; an unclosed `:::note`;
    at GFM and Minimal the same source shows literal text; `AlertBox` renders the localized title and icon.

    **Out of scope**: math (T013-T014), the Settings row (T011).

    **Definition of done**: alerts and admonitions render at Full only and share one renderer.

    **Verify**: `scripts/test unit`, `scripts/test integration`, `scripts/verify lint`.

- [x] T010 [US1] Highlight fenced code with the shared palette in `frontend/src/logic/markdown/highlight.ts`, `frontend/scripts/generate-editor-themes-core.cjs`, `frontend/src/logic/theme/generatedHighlight.css`, `frontend/src/ui/components/MarkdownView.tsx`

    **Story / Priority**: US1 (P1). Needs T006. T041 edits the same generator afterwards.

    **Requirements**: FR-RN-006, FR-RN-013 (code recolours with the theme), FR-RN-017 · US1-4, US1-5 (code part) ·
    contracts/markdown-pipeline.md §"Code highlighting" · contracts/editor-highlighting.md §Colours (Preview half) ·
    research R11, R13.

    **Read first**: contracts/markdown-pipeline.md §"Code highlighting"; contracts/editor-highlighting.md §Colours;
    research.md R11 (26 grammars, why not `common`, aliases: `jsx`/`tsx`→JS/TS, `sh`/`shell`/`zsh`/`console`→bash,
    `toml`→ini, `html`→xml, plus `md cs rs kt docker patch make jsonc sass`) and R13 (the `[data-gme-highlight]`
    rules are dead code: nothing imports the file and nothing sets the attribute).

    **Existing code to change**: `frontend/scripts/generate-editor-themes-core.cjs:172` (emits
    `[data-gme-highlight=…] .hljs-*` rules and writes `generatedHighlight.css` at l.184; entry
    `frontend/scripts/generate-editor-themes.mjs:13`); `frontend/src/logic/theme/generatedHighlight.css`
    (generated); `--hl-*` tokens in `frontend/src/ui/styles/tokens.css`; generator test
    `frontend/tests/unit/tooling/generateEditorThemes.test.ts` (synthetic palette).

    **Create / modify**: `highlight.ts` (a `lowlight` instance with the 26 languages registered explicitly —
    javascript, typescript, go, python, java, c, cpp, csharp, rust, ruby, php, kotlin, swift, sql, json, yaml, ini,
    xml, css, scss, bash, powershell, dockerfile, makefile, diff, markdown — with the aliases; **never** `common`
    or `all`); pipeline step 11 `rehype-highlight` with `plainText: ['mermaid']`; a fence longer than **200,000**
    characters, with no language or with an unknown one, is plain monospaced text with no error (a fence of exactly
    200,000 is highlighted); the generator emits **unscoped** `.hljs-*` rules whose values are `var(--hl-*)`,
    returns the mapping as data (each `.hljs-*` class paired with a `--hl-*` variable, no colour literal), and
    removes the `[data-gme-highlight]` selectors; `MarkdownView.tsx` imports `generatedHighlight.css` once. Run
    `node frontend/scripts/generate-editor-themes.mjs` and commit the output (the Build stage checks drift).

    **Tests**: `frontend/tests/unit/markdown/highlight.test.ts` — a Go fence yields `hljs-*` spans; each alias;
    unknown language, no language and a `mermaid` fence yield plain text; the 200,000 / 200,001 boundary; and the
    extended generator test asserting the returned data (not CSS text).

    **Out of scope**: Monaco token rules (T041), the Mermaid grammar (T041).

    **Definition of done**: fenced code in the 26 languages is coloured from tokens and follows theme changes
    without a re-parse; `[data-gme-highlight]` is gone.

    **Verify**: `scripts/test unit`, `scripts/verify` through Build (clean tree after generation).

- [x] T011 [US1] Make the Markdown standard row in the Settings popup work in `frontend/src/logic/actions/actionRegistry.ts`, `frontend/src/ui/widgets/Menubar/SettingsMenu.tsx`

    **Story / Priority**: US1 (P1) / US5-1 · Needs T003, T004, T007.

    **Requirements**: FR-RN-001, FR-RN-015, FR-ST-003 (standard applies to the preview) · US5-1, US5-2 · Q7 ·
    contracts/settings-markdown.md §"Settings view" (popup rows call the same settings command as the dialog group;
    a failed write keeps the previous value and shows a notice).

    **Read first**: contracts/settings-markdown.md "Existing code that changes" (bullets on `actionRegistry.ts` and
    the `settings.menu.markdown.full` label, "Full (+ math, footnotes…)" — footnotes belong to GFM, so the Full label
    names math, alerts and admonitions).

    **Existing code to extend**: `actionRegistry.ts:261` (`markdown-standard`, `deferred`);
    `SettingsMenu.tsx` standard row (fallback removed in T003); `frontend/src/logic/settings/settingsCommands.ts`
    (whole-group `updateMarkdown`); `en.json` `settings.menu.markdown.*` and `settings.markdown.*` keys.

    **Create / modify**: remove `deferred` from `markdown-standard`; the row calls the settings command with the
    merged group and acknowledges into the projection on success; correct the Full label; tests: update the
    `markdown-standard` expectations in `frontend/tests/unit/actions/actionRegistry.test.ts` and
    `frontend/tests/integration/menubar.settings.legacy.test.tsx` (its Format-on-save/Lint-on-save rows stay deferred
    until T037).

    **Tests**: choosing GFM issues exactly one `updateMarkdown` with the merged group, the store updates, the preview
    re-renders (Full-only constructs turn literal, tables remain) and the header/status show GFM; a rejected write
    keeps the previous value and shows a notice; unavailable before hydration.

    **Out of scope**: Format on save / Lint on save rows and the dialog group (T037).

    **Definition of done**: switching the standard in the running app changes the preview, header and status bar.

    **Verify**: `scripts/test unit`, `scripts/test integration`, `scripts/verify lint`.

- [ ] T012 [US1] Add the reference fixture and the first rich-rendering journey in `frontend/tests/fixtures/reference-document.md`, `frontend/tests/e2e/rich-rendering.test.ts`

    **Story / Priority**: US1 (P1). Needs T005–T011.

    **Requirements**: US1-1 (non-math/Mermaid constructs), US1-4, US1-7, US1-8, US1-9, US5-1 · SC-001 (GFM half),
    SC-006 · quickstart.md §Fixtures (`reference-document.md`) and Q1, Q3, Q4, Q7.

    **Read first**: quickstart.md §Fixtures (the full description of the reference document: every construct of
    FR-RN-003 and FR-RN-004, one invalid formula, one invalid Mermaid block, a Go block, an unknown-language block,
    the currency paragraph, two `## Notes`, `## Über uns`, `## Getting Started` with a link to it, and hostile HTML —
    each of the 29 removed elements (those that can hold text hold visible text; the void elements `embed`, `link`, `meta`, `base` and the parser-ignored `head` and `frame` are present without text), an unknown element, an `onclick`, a `style`, and
    `javascript:`/`data:` addresses; the hostile HTML comes **last** with `plaintext` as the final element because an
    HTML parser treats everything after `<plaintext>` as text); an existing journey for the harness pattern
    (`frontend/tests/e2e/preview-links.test.ts`, `real-files.test.ts` show how a document is put on disk and
    opened); `frontend/tests/e2e/theme-surfaces.test.ts` for the looped theme pattern.

    **Create / modify**: `frontend/tests/fixtures/reference-document.md` (excluded from formatting by T001; **scanned
    by L22** — no `FR-`, `SC-`, `STORY-`, `Proves:` or `T###` text anywhere in it); `frontend/tests/e2e/rich-rendering.test.ts`.

    **Tests** (this task asserts only what exists after T011; T017 extends the journey for math and Mermaid): each
    GFM construct renders (table with alignment, task list as read-only checkboxes, strikethrough, autolink,
    footnote with working back-reference, front matter not shown), an alert and an admonition render, the Go block
    is coloured and the unknown-language block is plain, every hostile element is absent (with its text for elements that can hold text) and no
    handler ran, `[see](#getting-started)` scrolls the preview, anchors are `notes`, `notes-1`, `über-uns`; switching
    Full → GFM → Minimal in Settings turns the Full-only constructs literal and updates header and status bar within
    one second; the shared request guard reports zero foreign requests.

    **Out of scope**: math and Mermaid assertions (T017).

    **Definition of done**: the journey passes against the real backend.

    **Verify**: `scripts/test e2e` (rich-rendering), `scripts/format --check`, `scripts/verify lint`.

- [ ] T013 [P] [US1] Add the strict `$` math construct in `frontend/src/logic/markdown/syntax/mathStrict.ts`

    **Story / Priority**: US1 (P1). Needs T001 only; file-disjoint from T006-T012, so it may run in parallel with
    them. T014 wires it in.

    **Requirements**: FR-RN-005 · US1-10 · contracts/markdown-pipeline.md §Math · research R8, plan.md
    "Complexity Tracking" (why an in-repo construct).

    **Read first**: contracts/markdown-pipeline.md §Math (rule and the required unit cases); research.md R8 (why
    `remark-math` options cannot meet FR-RN-005: with the default `$5 and $10` becomes math and `$ x $` becomes
    math; with `singleDollarTextMath: false` `$E=mc^2$` is lost; `micromark-extension-math` hides its constructs
    behind its exports map; the unbounded prototype was quadratic: 32k `$x ` took 35 s).

    **Create / modify**: `syntax/mathStrict.ts` — a micromark **text** construct on `$` emitting the same token
    names as `micromark-extension-math` (`mathText`, `mathTextSequence`, `mathTextData`, `lineEnding`) so
    `mdast-util-math`'s from-markdown works unchanged; use `micromark-util-character`; rule: open at `$` not
    followed by whitespace; close at the next `$` not preceded by whitespace and not followed by a digit; `\$` is a
    literal dollar; **each opener looks ahead at most 10,000 characters**, else the `$` is literal; export a
    remark plugin combining this construct, `mdast-util-math`, and `remark-math` with `singleDollarTextMath: false`
    (which supplies `$$…$$` and the ` ```math ` fence). Do not wire it into `pipeline.ts` (T014).

    **Tests**: `frontend/tests/unit/markdown/mathStrict.test.ts` parsing with `unified().use(remarkParse)…` to mdast:
    `$E=mc^2$` math; `$5 and $10` literal; `\$5` literal `$5`; `$ x $` literal; `a$b$c` math `b`; `$$\n x \n$$`
    display; a math fence; `$20,000 and $30,000` literal; `$x$5` literal; `cost $10$` math `10`; `$a \$ b$` math
    `a \$ b`; `` `$x$` `` code span; `$a\n+b$` multi-line math; **32,000 unmatched openers** (`$x ` and `costs $5 and `
    repeated) parse in time proportional to input (assert a generous absolute bound and that doubling the input
    does not quadruple the time).

    **Out of scope**: KaTeX, limits and placeholders (T014), the pipeline wiring.

    **Definition of done**: every case above passes, including the linear-time case.

    **Verify**: `scripts/test unit`, `scripts/verify lint`.

- [ ] T014 [US1] Render formulas with KaTeX, enforce formula limits, and ship KaTeX offline in `frontend/src/logic/markdown/pipeline.ts`, `frontend/src/ui/components/MarkdownView.tsx`, `frontend/vite.config.ts`

    **Story / Priority**: US1 (P1). Needs T006, T010, T013.

    **Requirements**: FR-RN-004 (math part), FR-RN-009, FR-RN-012 (formulas), FR-RN-013 (formulas recolour), FR-RN-017 ·
    US1-1, US1-2, US1-11 (formula half), SC-006 · contracts/markdown-pipeline.md §Math (KaTeX options), pipeline
    steps 7 and 10, "Render limits" · research R8 (assets).

    **Read first**: contracts/markdown-pipeline.md ("The render-limits step walks the sanitized tree…", KaTeX
    options, "Fonts are woff2 only, bundled, with `assetsInlineLimit: 0`"); research.md R8 (KaTeX 0.16; `strict:
'ignore'` because the default `warn` prints to the console; macro bombs fail with "Too many expansions";
    `\href`/`\includegraphics` render as red command text; assets: a Vite `transform` on `katex.min.css` removes
    the woff and ttf fallbacks, leaving 20 woff2 files (259,792 B) and 21,781 B CSS; KaTeX JS 261 KB); plan.md rows
    for `renderer.test.ts` production-build test (l.~98-110 today at l.108-112: "at most one `fetch(` per emitted
    `.js`").

    **Existing code to extend**: `pipeline.ts` (T006-T010 insertion points), `MarkdownView.tsx` component map,
    `frontend/vite.config.ts` (today: `base './'`, `react()`, a dev route, `worker.format 'es'`; no `build` section),
    `frontend/tests/unit/markdown/renderer.test.ts` production-build test, `tools/lint/bundle-scan.mjs`.

    **Create / modify**:
    - `pipeline.ts`: add the strict math plugin to `syntaxPlugins('full')`; step 7 render-limits (formulas): count
      the `language-math` code elements in document order, replace the **1,001st and later** formulas and any
      formula whose source is **longer than 10,000 characters** with a placeholder element carrying its reason
      (`too-many` | `too-large`) before KaTeX; step 10 `rehype-katex` (Full only) with `trust: false`,
      `strict: 'ignore'`, `maxSize: 20`, `maxExpand: 200`, `output: 'html'`, `errorColor: 'var(--err)'`; an
      invalid formula becomes `span.katex-error` holding the source (display-mode errors need CSS).
    - `MarkdownView.tsx`: render the placeholder with `t('preview.math.tooMany')` / `t('preview.math.tooLarge')`
      (added to `en.json`), an error marker style from tokens, import `katex/dist/katex.min.css`.
    - `vite.config.ts`: a `transform` plugin that removes the woff/ttf `src` fallbacks from KaTeX's CSS (woff2 only),
      `build.assetsInlineLimit: 0` (no `data:` fonts), `build.modulePreload: { polyfill: false }`; **KaTeX must end up
      in a non-entry (lazy) chunk** — choose the mechanism (lazy `MarkdownView` or a lazily imported Full pipeline)
      after reading how `MarkdownView` is imported, and prove it with the build output (Mermaid follows the same rule
      in T016).
    - Update the production-build test to accept KaTeX's method named `fetch` inside lazy chunks while **any other**
      `fetch(` still fails.

    **Tests**: `frontend/tests/unit/markdown/math.test.ts` — inline and display math render; a ` ```math ` block
    renders; `$5 and $10` stays plain in the rendered output; an invalid formula shows `katex-error` with its
    source and the rest of the document renders; `\href{javascript:…}{x}` renders as text, not a link; a macro bomb
    fails locally; 1,001 formulas → first 1,000 rendered and the 1,001st shows the `too-many` placeholder; a display
    formula of 10,001 characters shows `too-large`; no formula is rendered at GFM or Minimal; EC-RENDER-6 (`$x^2$`
    stays literal) is expressed for GFM.

    **Out of scope**: Mermaid.

    **Definition of done**: formulas render and fail locally, limits hold, and a production build (`scripts/build`)
    contains KaTeX as a lazy chunk with woff2 fonts only and passes `node tools/lint/bundle-scan.mjs frontend/dist`.

    **Verify**: `scripts/test unit`, `scripts/build`, `node tools/lint/bundle-scan.mjs frontend/dist`, `scripts/verify lint`.

- [ ] T015 [P] [US1] Build the hardened Mermaid engine modules in `frontend/src/logic/markdown/mermaid/queue.ts`, `config.ts`, `scrub.ts`, `theme.ts`

    **Story / Priority**: US1 (P1). Needs T001; new files only, so it may run in parallel with T013/T014.

    **Requirements**: FR-RN-007 (rendering engine), FR-RN-010, FR-RN-011 (stale discard), FR-RN-012 (source length
    bound), FR-RN-017 · US1-3, US1-6 · contracts/markdown-pipeline.md §Mermaid · research R12 · edge cases in
    spec.md.

    **Read first**: contracts/markdown-pipeline.md §Mermaid (the `MermaidQueue` interface, one promise chain, the
    exact config, the output scrub); research.md R12 (each verified rationale: the default config lets `%%{init}%%`
    change the theme and `themeCSS` inject `url(https://…)`; `htmlLabels: true` let a remote `<img>` through;
    `themeVariables` throw for `var(--x)`, `oklch()`, `color-mix()` so tokens are resolved to concrete colours via a
    probe element and converted to rgb; configuration is global so each job runs `initialize` and `render` together;
    failed renders leave `div#d<id>` in `document.body` → remove `#id` and `#d<id>` in `finally`; `maxTextSize`
    renders a placeholder diagram instead of throwing, so length is checked first; one retry after a failed dynamic
    import; a running render cannot be cancelled). dev.tools behaviour references listed under this phase.

    **Existing code to reuse**: the theme-attribute observer pattern in `monacoThemes.ts`
    (`frontend/src/ui/components/` — grep for it) for reading `data-theme`/`data-mode`; design tokens (`tokens.css`).

    **Create / modify**:
    - `queue.ts` — `MermaidQueue.render({source, theme, signal}) → {kind:'svg'|'error'|'aborted'}`; one serial promise
      chain; each job calls `initialize` with its own theme then `render` with a fresh id `gme-mmd-<n>`, removes
      `#<id>` and `#d<id>` in `finally`; a job aborted before it starts returns `aborted` with no work; jobs with the
      same `theme + '\0' + source` share one promise; an LRU cache of **exactly 50** `svg` results keyed the same way;
      lazy `import('mermaid')` with one retry.
    - `config.ts` — `startOnLoad: false`, `securityLevel: 'strict'`, `htmlLabels: false`, `suppressErrorRendering:
true`, `theme: 'base'` + resolved `themeVariables`, `maxTextSize: 50000`, `maxEdges: 500`, `logLevel: 'fatal'`,
      and the extended `secure` list (passing `secure` **replaces** Mermaid's default list, so include the six
      default keys plus `theme themeVariables themeCSS look layout fontFamily altFontFamily fontSize htmlLabels
flowchart sequence logLevel deterministicIds deterministicIDSeed dompurifyConfig handDrawnSeed elk darkMode
markdownAutoWrap wrap`).
    - `scrub.ts` — before insertion remove `script`, `foreignObject`, `img`, `image`, `use`; every `on*` attribute;
      `href`/`xlink:href` from **every `a`** whatever the value (so `#…` targets are not activatable either); on all
      other elements `href`/`xlink:href` not starting with `#`; `url(` values other than `url(#…)`; keep the diagram's
      own `style` element and presentation attributes.
    - `theme.ts` — resolve tokens to concrete rgb `themeVariables` for the active theme/mode.

    **Tests** (`frontend/tests/unit/markdown/mermaid/`, mocked `mermaid` module): queue abort before start does no
    work; coalescing of identical jobs; cleanup of both ids after success **and** failure; cache holds ≤ 50 and evicts
    least-recently-used; one retry after a failed import then an error result; `initialize` receives the extended
    `secure` list (including a check that `%%{init}%%` cannot switch theme); scrub cases with hand-written SVG
    strings — `script`, `on*`, `javascript:`, `data:`, external `href`, `url(https://…)`, `click A href "https://…"`
    and `click A href "#x"` each yield an `a` with no `href`/`xlink:href`, and own styling survives; `theme.ts`
    turns `var(--x)`/`oklch()`/`color-mix()` tokens into plain rgb.

    **Error contract**: `{kind:'error', message}` carries the exact text of the error Mermaid threw (from `parse`, and from
    `render` when it fails after a successful parse, including the `maxEdges`/`maxTextSize` failures), unmodified; a
    non-`Error` rejection is converted with `String(err.message ?? err)`; the dev.tools block does the same. Tests assert the
    message is passed through byte-for-byte.

    **Out of scope**: the React component and limits (T016).

    **Definition of done**: modules exist with the tested behaviour; nothing imports `mermaid` statically.

    **Verify**: `scripts/test unit`, `scripts/verify lint`.

- [ ] T016 [US1] Render Mermaid blocks as diagrams with limits, theme redraw and stale discard in `frontend/src/ui/components/MermaidBlock.tsx`, `frontend/src/logic/markdown/pipeline.ts`, `frontend/src/ui/components/MarkdownView.tsx`

    **Story / Priority**: US1 (P1). Needs T014, T015.

    **Requirements**: FR-RN-007, FR-RN-010, FR-RN-011, FR-RN-012 (diagrams), FR-RN-013 (diagrams redraw within one
    second), FR-RN-017 · US1-3, US1-5, US1-6, US1-11 (diagram half) · contracts/markdown-pipeline.md §Mermaid
    ("The component checks the source length (50,000) and its `data-mermaid-index` (at most 50)…", "Redraw: a
    `MutationObserver` on the `<html>` `data-theme` and `data-mode`…", "The diagram wrapper keeps `data-source-line`").

    **Read first**: the contract sections above; contracts/ui-surfaces.md §"Preview surfaces" (diagram error box,
    "too large to render" and "too many diagrams" placeholders, tokens only); `frontend/src/logic/scrollSync/` and
    the existing synchronized-scroll port (how it re-measures — the SVG arrives late, so the wrapper must notify or be
    re-measured); dev.tools `MermaidBlock.tsx` for the stale-flag behaviour.

    **Existing code to extend**: pipeline step 7 (add Mermaid numbering next to the formula counting from T014);
    `MarkdownView.tsx` and `renderer.ts` component map (replace the `pre` **around** a `language-mermaid` code child —
    not nested inside it); `en.json`.

    **Create / modify**: step 7 gives each `language-mermaid` code element its 1-based document-order number as
    `data-mermaid-index`; `MermaidBlock.tsx` (props only — receives source, index, and reads `data-theme`/`data-mode`
    through a small observer, not the store): checks length (> 50,000 → `preview.mermaid.tooLarge` placeholder) and
    index (> 50 → `preview.mermaid.tooManyDiagrams`) **before** queueing; calls the queue with an `AbortController`
    aborted on source change or unmount; shows an error box with **Mermaid's exact error text, verbatim and unabridged** (`preview.mermaid.error`
    title only; the body is the engine message including its line, column and expected-token detail, in a monospaced,
    wrapping, selectable block; never replaced by a generic string, never localized, never truncated); inserts only scrubbed SVG; keeps the **previous SVG while re-rendering** (unlike the dev.tools block,
    which blanks it); a `MutationObserver` on `<html>` re-renders every mounted diagram within one second of a theme
    or mode change; the wrapper keeps `data-source-line` and triggers a scroll re-measure after the SVG arrives;
    tests.

    **Tests** (`frontend/tests/unit/components/MermaidBlock.test.tsx`, mocked queue): a stale result for older text is
    never shown; abort on unmount; the 51st block shows the too-many placeholder and blocks 1-50 queue; a 50,001-char
    source shows the too-large placeholder without calling the queue; a parse error shows Mermaid's exact message (multi-line, with line/column detail) in an error box
    while sibling blocks still render; a non-`Error` rejection is shown via its string form; an engine failure that is not a
    parse error (edge limit, render failure) also shows its own message; a failed dynamic import shows a distinct message; attribute mutation on `<html>` triggers a re-render with the new theme; the
    previous SVG stays visible during re-render; the fence is not wrapped in `<pre>`.

    **Out of scope**: real-browser proof (T017).

    **Definition of done**: diagrams render in the real app for a simple flowchart, fail locally, and Mermaid is a lazy
    chunk in the production build.

    **Verify**: `scripts/test unit`, `scripts/build`, `node tools/lint/bundle-scan.mjs frontend/dist`, `scripts/verify lint`.

- [ ] T017 [US1] Complete the rich-rendering journeys: math, Mermaid, limits, theme redraw, performance and offline in `frontend/tests/e2e/rich-rendering.test.ts`, `frontend/tests/fixtures/`

    **Story / Priority**: US1 (P1). Needs T012, T016.

    **Requirements**: US1-1 (all), US1-2, US1-3, US1-5, US1-6, US1-10, US1-11, US5-2 · SC-001, SC-002, SC-006 ·
    FR-RN-007 (twelve diagram types), FR-RN-013, FR-RN-017 · quickstart.md Q1-Q3, Q5, Q7-Q9, Q27, Q28 and §Fixtures
    "Generated by the tests".

    **Read first**: quickstart.md §Fixtures (generated documents: 51 Mermaid blocks plus one formula longer than
    10,000 characters; a 100 KB document with 10 diagrams) and Q27 (measure diagrams within 2 s of opening and the
    preview within 300 ms of stopping typing — SC-002); `frontend/tests/e2e/theme-surfaces.test.ts` (the looped
    six-combination pattern); dev.tools `src/common/prompts/skills/mermaid/skill.ts:41-46` for the diagram sources.

    **Create / modify**: extend `rich-rendering.test.ts`; add `frontend/tests/fixtures/mermaid-diagrams.md` (one
    valid block per required type: flowchart, sequence, class, state, entity-relationship, Gantt, pie, mindmap,
    timeline, git graph, journey, quadrant — sources taken from the dev.tools skeletons, checked for L22 text) and
    have the tests generate the 51-block and 100 KB documents into the temp directory.

    **Tests**: the reference document at Full — inline/display/fence math render, the invalid formula shows the
    inline marker with its source, the invalid Mermaid block shows an error box whose text equals the parser's real message (asserted against a known
    invalid source, e.g. a flowchart with a dangling arrow, using the message the installed Mermaid produces) and other
    diagrams render, `$5 and
$10` is plain, no construct of FR-RN-003/004 remains literal (SC-001); all twelve diagram types render an SVG
    with no `script`, no `on*`, no `a[href]`, no external reference; the 51-block document renders 50 and one
    placeholder and the long formula shows its placeholder; switching through all six theme/mode combinations
    redraws diagrams and recolours code, formulas and alerts within one second; typing quickly in a diagram document
    is never blocked and a diagram produced for older text is never shown; timings recorded (diagrams ≤ 2 s,
    preview ≤ 300 ms for ≤ 100 KB); the shared request guard reports zero foreign requests for the whole journey;
    `node tools/lint/bundle-scan.mjs frontend/dist` passes.

    **Out of scope**: editor colouring (T042).

    **Definition of done**: the journeys pass; the timings are recorded in the completion note with the platform
    (E2E performance is macOS arm64 only).

    **Verify**: `scripts/test e2e` (rich-rendering), `scripts/verify lint`, `scripts/format --check`.

---

## Phase 4: User Story 2 — Format, Compact and Lint a document (Priority: P1)

**Goal**: Format rewrites a document into the canonical style with minimal source edits, Compact removes only
redundant blank lines and trailing whitespace, Lint lists style problems without changing anything; each change is
one undo step; one run at a time per window, with progress and Cancel for long runs.

**Independent Test**: Open `frontend/tests/fixtures/messy-document.md`; run Format, Format again, Undo, Compact and
Lint in turn and confirm source, undo history, problem count and problems list (quickstart Q10–Q18, Q29).

**Design in one paragraph** (contracts/tidy-engine.md): the engine runs in a module Web Worker on the same unified
parser and **Full** syntax the preview uses (`syntaxPlugins('full')`, whatever standard is selected; `.txt` is treated
as Markdown). It parses to mdast with offsets and emits non-overlapping `{from, to, text}` edits. For Format and
Compact the worker applies the edits to a copy, re-parses and compares both mdast trees (positions removed, adjacent
text merged); any difference returns `refused: 'render-differs'` and no edits. Lint has ten in-house rules sharing
predicates with Format; `markdownlint` is a test oracle only. A per-window **operation slot** (frontend, outside
Redux) allows one run at a time.

- [ ] T018 [P] [US2] Add the per-window operation slot in `frontend/src/logic/operations/operationSlot.ts`

    **Story / Priority**: US2 (P1). Needs nothing beyond the repository (ADR-0039 is already recorded); new files, so it may run in parallel with US1 tasks.

    **Requirements**: FR-TD-015 (holds the slot until exactly one outcome; progress and Cancel rule), FR-TD-016
    (busy slot disables all three actions) · ADR-0039 · data-model.md §"Ephemeral store: OperationSlot" and
    §"Value: TidyOutcome" · research R6 · plan.md "Complexity Tracking" (why a frontend store outside Redux).

    **Read first**: data-model.md §"Ephemeral store: OperationSlot" (the `OperationSlotState` type, `acquire(kind)`
    refused while running, idempotent `release()`, terminal outcomes `done | cancelled | refused | failed | stale`,
    `progress` non-null from the start for a document over 1 MiB and after one second for any other run);
    contracts/tidy-engine.md §"Operation slot"; research.md R6 (why no backend registry: `internal/gate` was deleted in
    feature 004; the bridge emits only `state:patch`, `state:error`, `application:close-requested`).

    **Existing code to reuse / note**: there is **no** `useSyncExternalStore` in `frontend/src` today — this is the
    first non-Redux store. Follow the small subscribe/getSnapshot shape. Redux stays for backend projection only
    (Constitution III, recorded by ADR-0039). A hook for React consumers belongs beside it
    (`frontend/src/logic/hooks/` or `logic/operations/` — follow the nearest hook convention).

    **Create / modify**: `operationSlot.ts` (module-level singleton per window: `getSnapshot`, `subscribe`,
    `acquire(kind, { documentId, size })` returning a handle `{ signal, abort, setProgress, release }` (`abort()` is what Cancel calls; it fires `signal`), or `null`/refusal
    while running; the slot owns the "long run" rule — it sets `progress` immediately when `size > 1 MiB` and after
    **one second** of running otherwise, cleared on release); a `useOperationSlot()` hook.

    **Tests**: `frontend/tests/unit/operations/operationSlot.test.ts` (fake timers): acquire moves idle → running and
    a second acquire is refused; release is idempotent and returns to idle; a small run shows no progress before one
    second and progress after; a run on a >1 MiB document shows progress from the start; `abort()` fires the handle's signal; subscribers are notified once per change; state carries `kind` and `documentId`.

    **Out of scope**: the tidy engine, the action handler (T025), any UI.

    **Definition of done**: the store exists with the tested behaviour and one documented owner.

    **Verify**: `scripts/test unit`, `scripts/verify lint`.

- [ ] T019 [US2] Build the tidy worker, client, chunking, equivalence guard and Compact in `frontend/src/logic/tidy/` (`runTidy.ts`, `worker.ts`, `protocol.ts`, `chunking.ts`, `prefs.ts`, `equivalence.ts`, `rules.ts`, `edits.ts`, `engine.ts`)

    **Story / Priority**: US2 (P1). Needs T001, T006 (syntax plugin list), T013/T014 (the Full `$` construct — the parse
    must include math so `$$` blocks are protected) (ADR-0038 is already recorded).

    **Requirements**: FR-TD-005 (Compact), FR-TD-006 (active document, Full syntax, `.txt` like Markdown), FR-TD-007
    (render-equivalence guard), FR-TD-015 (cancel via worker termination) · US2-4, US2-5, US2-11, US2-14 (Compact
    half), US2-13 (worker-level cancel) · contracts/tidy-engine.md §Client, §"Worker protocol", §Parsing, §Compact,
    §"Guard and idempotence", §Limits · research R1-R4 · ADR-0038.

    **Read first**: contracts/tidy-engine.md (all of §Client through §"Guard and idempotence" and §Limits);
    research.md R2 (why minimal edits beat `remark-stringify`: 1,112/1,113 tree-equal and idempotent vs 1,080), R3
    (the guard; one real file of 1,113 is refused — a blank line before `> 4. Run` changes an ordered list that
    interrupts a paragraph — refusal is the specified outcome), R4 (parse cost: 1 MiB 1.0 s, 3 MiB 5.3 s, 10 MiB 32 s
    unchunked / 6.5 s chunked; synthetic worst cases stay slow, so Cancel is mandatory; parsing is synchronous so
    `worker.terminate()` is the only cancellation); data-model.md §"Value: TextEdit", §"Value: TidyOutcome".

    **Existing code to reuse**: `syntaxPlugins('full')` from T006/T009/T014; `frontend/vite.config.ts`
    (`worker.format: 'es'` is already set for the Monaco worker imported as `monaco-editor/esm/vs/editor/editor.worker?worker`
    in `monacoSetup.ts:4` — mirror its module-worker mechanism for the tidy worker, e.g.
    `new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })`); `unified`, `remark-parse`,
    `mdast-util-to-string`, `unist-util-visit` (declared in T001).

    **Create / modify** (all under `frontend/src/logic/tidy/`, a new owner that knows nothing of Monaco, Redux or the
    bridge): `protocol.ts` (messages `{id,op,text,prefs}` / `{id,type:'progress',done,total}` /
    `{id,type:'result',outcome}`); `runTidy.ts` (`runTidy(request, {signal, onProgress})` — lazily creates the
    worker, a warm worker may be reused after a completed run, an aborted worker is `terminate()`d, never reused, and
    the result is `cancelled`; a worker error is `failed`; never resolves `stale`); `worker.ts` (thin message shell);
    **`engine.ts`** (a pure `runOnText(op, text, prefs, onProgress)` the worker calls — added so the engine is
    testable without a Worker in jsdom; it lives in this owner and needs no plan change); `chunking.ts` (documents
    ≤ 256 KiB are one chunk; larger ones split at column-0 ATX headings that follow a blank line and lie outside
    front matter, HTML blocks, HTML comments, `$$` blocks and backtick/tilde fences; text before the first
    qualifying heading is the first chunk; edit offsets translated back to whole-document offsets; a chunk that fails
    the guard refuses the whole run); `prefs.ts` (`TidyPreferences` `{bullet, emphasis, heading}` snapshot from
    settings); `equivalence.ts` (the guard); `rules.ts` (**shared predicates**: protected ranges from `code`, `html`,
    `math`, `yaml` and multi-line `inlineCode` nodes; hard breaks from `break` nodes) and `edits.ts` (the Compact
    edit computation — line pass rule 5: each run of two or more blank lines becomes one; trailing spaces/tabs
    removed outside protected ranges, **keeping a run of two or more spaces that forms a hard break**; nothing else
    changes).

    **Tests** (`frontend/tests/unit/tidy/`): Compact scenarios — blank runs collapse, trailing whitespace removed,
    hard break kept, single trailing space removed, fenced and indented code and front matter untouched (byte
    identical), rendering identical before/after; the guard refuses a crafted edit list that changes the tree and
    returns no edits; chunking — a document above 256 KiB with YAML front matter holding `# comment` lines and a
    `$$` block holding a line starting with `# ` is never split inside either, and its result equals an unsplit
    parse; a document ≤ 256 KiB is one chunk; a failing chunk refuses the whole run; `.txt` and `.md` inputs give
    identical edits; client with a fake `Worker` class — progress forwarded, result resolved, `abort` → `terminate()` →
    `cancelled`, a worker `error` → `failed`, a cancelled worker is never reused, a completed one may be.

    **Out of scope**: Format edit rules (T020, T021), Lint (T022), any UI or action wiring (T025, T026).

    **Definition of done**: `runTidy({op:'compact', …})` works end to end through a real module worker in a
    production build (`scripts/build` emits the worker chunk), with the tests above green.

    **Verify**: `scripts/test unit`, `scripts/build`, `scripts/verify lint`.

- [ ] T020 [US2] Add Format bullet, emphasis and strong-marker edits with the line pass in `frontend/src/logic/tidy/rules.ts`, `frontend/src/logic/tidy/edits.ts`

    **Story / Priority**: US2 (P1). Needs T019.

    **Requirements**: FR-TD-001 (bullet, emphasis, `**` strong, blank-line and final-newline canon), FR-TD-002 (what
    Format keeps), FR-TD-004 (idempotence — rules must be idempotent by construction) · US2-1 (bullets and emphasis
    part), US2-2, US2-6, US2-14, US2-15 · contracts/tidy-engine.md §Format "Edit rules" 1, 2, 5, 6 · research R2.

    **Read first**: contracts/tidy-engine.md §Format (both bullet lists and rules 1, 2, 5, 6); research.md R2 "Rules
    the prototype settled" (bullet: replace the character at the item's start offset, adjacent lists alternate the
    marker so they stay two lists; emphasis/strong: replace delimiters at the node's start and end, `_` **only** when
    the characters outside both delimiters are whitespace, punctuation or the edge — classification as
    `micromark-util-classify-character`; nested delimiters must not merge, `_*x*_` becomes `*_x_*`; `__` becomes
    `**`; Format does not re-indent nested lists); spec.md FR-TD-002 list of what Format never edits.

    **Create / modify**: in `rules.ts` the **shared** marker classification, intraword and adjacency exemptions (T022
    reuses them — write them as exported predicates over mdast nodes, not inside Format-only code); in `edits.ts`
    Format edits: rule 1 (bullet marker at each list item's start offset, honouring the `bullet` preference `-`/`*`/`+`
    and alternating adjacent lists), rule 2 (emphasis/strong delimiters, `emphasis` preference `_`/`*`, strong always
    `**`, intraword keeps `*`), rule 5 (the T019 line pass extended with the "one blank line between blocks outside
    lists" and single final newline canon), rule 6 (no re-indentation). The engine composes Format = these edits + the
    guard.

    **Tests** (`frontend/tests/unit/tidy/format.test.ts`): default preferences turn `*` and `+` bullets into `-` and
    `*x*` into `_x_`; preference `*` and `+` bullets; emphasis preference `*`; `foo*bar*baz` keeps `*`; `__x__` →
    `**x**`; `_*x*_` becomes `*_x_*` not a merged run; a `-` list directly followed by a `*` list still renders as two
    lists; tight list stays tight; `1. 1. 1.` and `1. 2. 3.` keep their own numbering; paragraph line breaks and a
    two-space hard break kept, a one-space trailing space removed; code blocks byte-identical; Format twice equals
    Format once on each case; edits are non-overlapping and sorted.

    **Out of scope**: headings and tables (T021), Lint (T022), corpus-wide proofs (T023).

    **Definition of done**: the cases above pass through `engine.runOnText('format', …)`.

    **Verify**: `scripts/test unit`, `scripts/verify lint`.

- [ ] T021 [US2] Add Format heading-style and table edits in `frontend/src/logic/tidy/edits.ts`

    **Story / Priority**: US2 (P1). Needs T020.

    **Requirements**: FR-TD-001 (ATX/Setext, padded aligned tables), FR-TD-002, FR-TD-003 (Setext preference: levels
    1-2 Setext, 3-6 ATX) · US2-1 (Setext headings and unpadded table parts) · contracts/tidy-engine.md §Format rules 3
    and 4 · research R2.

    **Read first**: contracts/tidy-engine.md §Format rules 3-4; research.md R2 (ATX→Setext only for levels 1-2, only
    when re-parsing content plus underline yields **one heading of the same depth**, underline length
    `max(3, display width)`; Setext→ATX only for single-line content; tables: split rows on unescaped `|`, check the
    cell count against mdast, pad by East Asian display width, **never pad rows to the header width** — that changes
    the parse; cell text byte-identical, only whitespace around cells changes).

    **Existing code to reuse**: `get-east-asian-width` (T001); the guard from T019 (a table or heading edit that would
    change the tree is refused at run level).

    **Create / modify**: heading edits (both directions, honouring `heading` preference); table edits (padding by
    display width, delimiter row re-drawn to width while keeping alignment colons); tests.

    **Tests** (`frontend/tests/unit/tidy/format.headings-tables.test.ts`): Setext → ATX default; ATX → Setext when the
    preference is Setext for levels 1-2 and levels 3-6 stay ATX; a multi-line Setext heading stays as is; a heading
    whose content plus underline would not re-parse to the same depth is left alone; unpadded table gets equal column
    widths; wide (CJK) characters count as width 2; escaped `\|` inside a cell; a ragged row is not padded to the
    header width; alignment row preserved; idempotent on each.

    **Out of scope**: nested-list indentation (never re-indented), Lint.

    **Definition of done**: US2-1 is satisfied end to end for the default preferences at the engine level.

    **Verify**: `scripts/test unit`, `scripts/verify lint`.

- [ ] T022 [US2] Implement the ten lint rules in `frontend/src/logic/tidy/lint.ts`, `frontend/src/logic/tidy/rules.ts`, `frontend/src/i18n/locales/en.json`

    **Story / Priority**: US2 (P1). Needs T020 (shared predicates), T021.

    **Requirements**: FR-TD-009, FR-TD-010 (exactly ten rules with fixed severities), FR-TD-012 (exact total),
    FR-TD-013 (finding shape for the list) · US2-7 (three findings), US2-9/US2-18 (finding shape at scale), US2-10,
    US2-14 (Lint reports only the single trailing space), US2-15 (Lint reports none of those) · contracts/tidy-engine.md
    §Lint · data-model.md §"Value: LintFinding" · research R5.

    **Read first**: contracts/tidy-engine.md §Lint table (rule ids `ul-marker`, `emphasis-marker`, `strong-marker`,
    `heading-style`, `list-indent`, `single-h1`, `trailing-space` (error), `blank-lines`, `fence-language`,
    `final-newline` (error); "Format and Lint share the marker classification, intraword and adjacency exemptions and
    protected ranges from `rules.ts`, so Lint reports nothing on text Format just produced, except `fence-language`,
    `single-h1` and `list-indent`"); data-model.md `LintFinding` (1-based ranges; position-only findings widen to word
    or line; `message` and `hint` are catalogue keys + args); research.md R5 (the prototype still reported 13 emphasis,
    37 heading and 1 strong findings after Format because Lint lacked Format's exemptions; `markdownlint` reports
    MD049/MD050 twice per node and flags every extra blank line where the spec wants one finding per run).

    **Create / modify**: `lint.ts` (a new file inside the same `logic/tidy/` owner; each rule as a small function over
    the mdast and the shared predicates; findings carry `rule`, `severity`, `startLine/Column`, `endLine/Column`,
    `message` key + args, `hint` key; `engine.runOnText('lint', …)` returns `findings` + exact `total` in document
    order); rule specifics: `ul-marker` exempts adjacent-list alternation; `emphasis-marker` exempts intraword and
    nesting adjacency; `heading-style` always accepts levels 3-6 as ATX; `list-indent` ignores right-aligned ordered
    numbers; `single-h1` reports on each level-1 heading **after the first**; `trailing-space` skips code, html,
    math and front matter and skips a hard-break run of ≥ 2 spaces; `blank-lines` reports **one finding per run**;
    `final-newline` at end of text. `en.json`: `lint.rule.<id>.message` and `lint.rule.<id>.hint` for the ten rules.
    Chunked runs must give the same findings as an unsplit parse.

    **Tests** (`frontend/tests/unit/tidy/lint.test.ts`): each rule positive and negative; every exemption above;
    protected ranges; severities exactly as listed; counts for 0, 1, 10, 1,500 and 12,000 findings (generated text);
    chunked equals unchunked; `.txt` parity; preferences change what is reported (`*` bullet preference reports `-`);
    Lint on text Format just produced reports only the three non-fixed rules.

    **Out of scope**: markers/UI (T024-T027), the corpus oracle comparison (T023).

    **Definition of done**: all ten rules and their catalogue strings exist and the tests pass.

    **Verify**: `scripts/test unit`, `scripts/verify lint`.

- [ ] T023 [US2] Prove Format and Compact on a 30-document corpus in `frontend/tests/fixtures/tidy-corpus/`, `frontend/tests/unit/tidy/corpus.test.ts`

    **Story / Priority**: US2 (P1). Needs T020-T022.

    **Requirements**: FR-TD-002, FR-TD-004, FR-TD-007 · SC-003 · US2-2, US2-4, US2-5, US2-11, US2-14, US2-15 ·
    contracts/tidy-engine.md §Tests · quickstart.md §Fixtures (`tidy-corpus/`).

    **Read first**: contracts/tidy-engine.md §Tests (corpus of at least 30 documents: Format twice equals Format once;
    Format and Compact never change the Full-syntax tree; every code block is byte-identical; a document that fails the
    guard is refused untouched); research.md R2/R3 (the known refusal: a blank line inserted before `> 4. Run`).

    **Create / modify**: `frontend/tests/fixtures/tidy-corpus/*.md` — **at least 30 hand-written varied documents**:
    nested and loose lists, ordered numbering styles, block quotes with lists, tables (aligned, wide characters,
    escaped pipes, ragged), HTML blocks, front matter, math blocks, code fences and indented code with trailing
    spaces, hard breaks, intraword emphasis, Setext headings, adjacent lists, one document that fails the guard
    (US2-11). **Do not copy text from `specs/` or `docs/`** (they contain identifiers that fail L22 in fixtures);
    fixtures are excluded from Prettier by T001. `corpus.test.ts` iterates the directory.

    **Tests**: for every document — Format twice equals Format once, Compact twice equals once; the mdast (positions
    removed, adjacent text merged) is equal before and after Format and Compact; every fenced/indented code node text
    is byte-identical; the guard-failing document is refused with no edits; **oracle**: with `markdownlint` (dev
    dependency from T001) compare counts against the Lint rules where semantics match — MD004 (`ul-marker`), MD049 and
    MD050 (emphasis/strong, de-duplicated because markdownlint reports them twice per node), MD003 (`heading-style`),
    MD009 (`trailing-space`, excluding hard-break runs), MD012 (`blank-lines`, counting **runs**), MD040
    (`fence-language`), MD047 (`final-newline`), MD025 (`single-h1`) — documenting every intended divergence in the
    test; Lint after Format reports only `fence-language`, `single-h1`, `list-indent`.

    **Out of scope**: UI, action handler.

    **Definition of done**: SC-003 holds on the corpus (100% idempotent, tree-preserving, code byte-identical) and the
    oracle comparison is green with divergences documented.

    **Verify**: `scripts/test unit`, `scripts/format --check`, `scripts/verify lint`.

- [ ] T024 [US2] Add edit, caret, marker and hover support to the editor in `frontend/src/ui/components/CodeEditor.tsx`, `frontend/src/logic/hooks/useDocumentCommands.ts`, `frontend/src/ui/components/monacoSetup.ts`

    **Story / Priority**: US2 (P1). Needs T019 (edit type). T033 and T036 reuse `setPosition`.

    **Requirements**: FR-TD-008 (one undo step, caret on the same logical line, empty edit list changes nothing),
    FR-TD-011 (first 1,000 findings as underlines with hover), FR-TD-013 (activating a finding moves the caret and
    focuses the editor) · US2-3, US2-7, US2-8, US2-9 · contracts/editor-highlighting.md §"Shared editor additions" and
    §"Markers and hover" · contracts/tidy-engine.md §"Applying results".

    **Read first**: contracts/editor-highlighting.md ("Shared editor additions", "Markers and hover"); contracts/
    tidy-engine.md §"Applying results" (edits up to 20,000 through one `executeEdits` between undo stops; above that one
    whole-text replacement between undo stops; either way **one undo step**; `applyEdits` and `replaceAll` share the
    existing `applyEdit`).

    **Existing code to extend** (verified): `CodeEditor.tsx:19` `CodeEditorHandle` has only `focus`, `getContent`,
    `getSelection`, `replaceRange`, `replaceAll`; `useDocumentCommands.ts:14` `DocumentCommandAPI` has the same five and
    each is guarded by the document id and session token — keep that guard for every new method; `monacoSetup.ts`
    imports only the markdown contribution today (plus the editor worker at l.4); the text reaches the backend through
    `useSyncedBuffer`, which is how the document becomes dirty.

    **Create / modify**: `CodeEditorHandle` and `DocumentCommandAPI` gain `applyEdits(edits: TextEdit[])`,
    `setPosition(line, column)` with `revealLineInCenter` and focus, and `setMarkers(markers)` (calls
    `monaco.editor.setModelMarkers(model, 'gme-lint', markers)`, severity from the finding, `[]` clears);
    `monacoSetup.ts` imports `monaco-editor/esm/vs/editor/contrib/hover/browser/hoverContribution`. **Offsets**: tidy
    edit offsets index the LF-normalised text the run received; convert them to positions from that text (or read the
    model as LF) so a CRLF document is edited correctly. **Caret**: after `applyEdits` keep the caret on the same
    logical line where that line still exists (track the caret line through the edits).

    **Tests**: extend the existing hand-written Monaco runtime tests (`frontend/tests/unit/components/`): `applyEdits`
    produces one undo step (single undo stop pair), an empty list leaves the model and undo stack untouched, more than
    20,000 edits falls back to one whole-text replace, still one undo step; CRLF model handled; caret stays on its
    logical line; `setPosition` moves caret, reveals and focuses; `setMarkers` sets/clears with the owner name;
    commands are ignored for a stale document id or session token. Real hover and undo are proven in T028.

    **Out of scope**: link contributions (T036), languages (T040), the action handler and UI.

    **Definition of done**: the four methods exist on both APIs with the tested behaviour; hover contribution is
    imported.

    **Verify**: `scripts/test unit`, `scripts/test integration`, `scripts/verify lint`.

- [ ] T025 [US2] Run Format, Compact and Lint through one action handler with slot, stale detection, notices and the problems summary in `frontend/src/app/useTidyCommands.ts`, `frontend/src/logic/operations/problemsSummary.ts`, `frontend/src/i18n/locales/en.json`

    **Story / Priority**: US2 (P1). Needs T018, T022, T024.

    **Requirements**: FR-TD-001, FR-TD-005, FR-TD-007-FR-TD-009, FR-TD-011, FR-TD-014, FR-TD-015 · US2-3, US2-11,
    US2-13, US2-16, US2-17, US2-19 · contracts/tidy-engine.md §"Operation slot", §"Applying results" · data-model.md
    §"Value: ProblemsSummary", §"Value: TidyOutcome" · contracts/ui-surfaces.md §Notices.

    **Read first**: contracts/tidy-engine.md "Operation slot" and "Applying results"; data-model.md `ProblemsSummary`
    (`{findings, total, stale}`; one summary for the active document, in frontend memory only; discarded with the
    markers when another document becomes active or the document closes; `stale` becomes true when the document
    changes after the run and false at the next completed run) and `TidyOutcome` table; contracts/ui-surfaces.md
    Notices table (`tidy-refused`, `tidy-failed`, `tidy-cancelled`, `tidy-stale`; **a Format started by the on-save hook
    shows only `format-on-save-skipped`, never a `tidy-*` notice**); how local notices are built: no central catalogue —
    dispatch `notifyToast({code, severity, subject, title: t(...), message: t(...)})` as `useDocumentWrites.ts:124-132`
    does for `save-success`, add `tidy.*` keys to `en.json`.

    **Existing code to reuse / study**: `frontend/src/logic/actions/actionDispatcher.ts` and `editorActionExecutor.ts`
    (how actions reach the editor), `frontend/src/app/useCommands.ts` (app-level command hooks with store/adapter
    access), `frontend/src/ui/widgets/useEditorActionExecutor.ts`, `useSyncedBuffer` (find it), the operation slot
    (T018), `runTidy` (T019), `CodeEditorHandle`/`DocumentCommandAPI` (T024), settings selectors for the preference
    snapshot.

    **Create / modify**: `app/useTidyCommands.ts` (an app-level hook — the widgets call it through the dispatcher in
    T026; the engine stays free of Monaco/Redux) implementing, for `format | compact | lint | cancel`:
    (1) read the active document's editor text and version, take a `TidyPreferences` snapshot; (2) `slot.acquire`;
    (3) `runTidy` with the slot handle's signal and progress; (4) **apply only if the same document is still active and
    the editor text equals the text the run started with** — otherwise discard, keep the user's text and previous
    findings, show `tidy-stale`, report `stale`; (5) `edits` → `applyEdits` (one undo step, dirty via the synced
    buffer; an empty list changes nothing); `findings` → replace the summary, `setMarkers` (first 1,000), keep exact
    `total`; `refused`/`failed`/`cancelled` → notice, text and findings unchanged; (6) always `release()` exactly once;
    (7) an `origin: 'user' | 'on-save'` parameter that suppresses `tidy-*` notices for on-save runs and **returns the
    outcome** for T038. `logic/operations/problemsSummary.ts` — a small store (same subscribe pattern as the slot,
    same owner) holding the summary; marks `stale` when the active document's text changes after a run; **clears the
    summary and the editor markers when the active document changes or the document closes** (returning shows none
    until Lint runs again). `en.json`: `tidy.*` (running, cancel, cancelled, refused, failed, stale) and
    `problems.*` strings used by the summary. Cancel calls the handle's `abort()` → worker terminated → `tidy-cancelled`.

    **Tests** (`frontend/tests/integration/tidyCommands.test.tsx` with a fake `runTidy`/worker and the hand-written
    Monaco runtime): Format applies edits as one undo step and Undo restores the exact prior text; equal result leaves
    undo history alone; `refused` leaves text and shows the notice; cancel leaves text/findings unchanged; typing
    during a run → stale notice, typed text kept, previous findings kept (US2-17); switching the active document
    during a run → stale; the slot is released once for every outcome (assert idle afterwards); a second action while
    running is refused; findings above 1,000 → 1,000 markers, exact total; summary marked stale after an edit and
    underlines stay; switching documents **and closing the document** clear markers and summary; progress/Cancel state appears from the start for
    a >1 MiB document and after one second otherwise (fake timers, US2-19); on-save origin shows no `tidy-*` notice.

    **Out of scope**: registry/surfaces (T026), panel and count (T027), the on-save wiring (T038).

    **Definition of done**: all three actions work headlessly against the store and editor API with the tests above.

    **Verify**: `scripts/test unit`, `scripts/test integration`, `scripts/verify lint`.

- [ ] T026 [US2] Wire Format, Compact and Lint into every tidy surface and availability rule in `frontend/src/logic/actions/actionRegistry.ts`, `frontend/src/logic/actions/actionDispatcher.ts`, `frontend/src/ui/widgets/FormattingToolbar/FormattingToolbar.tsx`, `frontend/src/ui/widgets/EditorContextMenu.tsx`, `frontend/src/ui/widgets/useEditorActionExecutor.ts`, `frontend/src/ui/widgets/Menubar/`

    **Story / Priority**: US2 (P1). Needs T025.

    **Requirements**: FR-TD-001, FR-TD-005, FR-TD-009 (entry points: toolbar, Format menu group, editor context menu,
    Alt+Shift+F/C/L), FR-TD-015 (Cancel replaces the triggering control), FR-TD-016 (read-only and slot-busy
    availability and tooltips) · US2-12, US2-13, US2-17, US2-19 · contracts/ui-surfaces.md §Actions, §"Existing code
    that changes", §"Running state" · research R18.

    **Read first**: contracts/ui-surfaces.md (Actions table, "Existing code that changes", "Running state");
    research.md R18 (the deferral is hard-coded outside the registry in `FormattingToolbar.tsx`, `EditorContextMenu.tsx`
    and `useEditorActionExecutor.ts`; the menu bar has only File, Settings, View, About).

    **Existing code to change** (verified): `actionRegistry.ts` — `format` l.356, `compact` l.363, `lint` l.368 (all
    `deferred(...)`; `lint` has no `context` surface; example entry shape:
    `entry('format','document',['toolbar','overflow','context','shortcuts'],{shortcut:'Alt+Shift+F',availability:deferred('formatting-later-slice'),surfaceOrder:{context:7},separatorBefore:['context'],surfaceLabelKeys:{context:'action.format-document.label'}})`);
    `ActionUnavailableReason` (l.19-20) has no read-only or slot-busy value and `ActionAvailabilityContext`
    (~l.125-141) carries `writable`, `modalOpen`, `commandBarrier` — extend both (and add the settings-loading reason if
    T003 did not); `ActionSurface` (l.2-13) needs a Format-menu surface; `actionDispatcher.ts:193-201` blocks every
    `document`-scope action unless the projected capability is writable — gate the three individually;
    `FormattingToolbar.tsx:35` `deferredActions` and l.217; `EditorContextMenu.tsx:54` (`availability.kind ===
'deferred'` stays only for the command palette); `useEditorActionExecutor.ts:24` `deferredEditorShortcutIds`
    (remove; Alt+Shift+F/C/L dispatch the tidy actions; `formatActionIds` unchanged); menus:
    `ui/widgets/Menubar/Menubar.tsx`, `ApplicationMenubar.tsx`, `ViewMenu.tsx` (used at `Menubar.tsx:658,795`);
    `en.json` `action.unavailable` ("in this slice") gives way to the specific reasons.

    **Create / modify**: registry entries lose `deferred`; `lint` gains `context`; availability = settings loaded +
    an open writable document + slot free for Format/Compact; an open document (read-only allowed) + slot free for Lint;
    tooltips "This document is read-only." and "Another operation is in progress." (catalogue keys); a Format menu group
    (Format, Compact, Lint) next to File/Settings/View/About; while the slot's progress is non-null the triggering
    control (toolbar and menu) shows Cancel; `command-palette` stays deferred; Assistant, Export and image stay
    deferred. Update the tests listed in plan.md "Existing tests changed" (Deferred-tidy tests):
    `frontend/tests/unit/actions/actionRegistry.test.ts:24`, `actionDispatcher.test.ts:24`, `registryCatalogue.test.ts`,
    `frontend/tests/unit/widgets/dialogs/ShortcutsDialog.test.tsx`, `frontend/tests/integration/formattingToolbar.legacy.test.tsx`,
    `frontend/tests/e2e/deferred-controls.test.ts:11`.

    **Tests**: registry availability matrix (loading, no document, read-only, slot busy, ready) for each action;
    dispatcher gating per action; toolbar/context menu/Format menu render the three items with the right disabled
    reason tooltips; Cancel replaces the triggering control when progress is shown; shortcuts dispatch inside
    `[data-editor-surface]`; the command palette remains a deferred row.

    **Out of scope**: problems panel and count (T027), settings rows (T037).

    **Definition of done**: every tidy surface works through the registry with no forced-deferred group left.

    **Verify**: `scripts/test unit`, `scripts/test integration`, `scripts/verify lint`.

- [ ] T027 [US2] Add the problems panel and the status-bar count in `frontend/src/ui/widgets/ProblemsPanel/`, `frontend/src/ui/components/StatusBar/StatusBar.tsx`, `frontend/src/ui/widgets/AppShell.tsx`, `frontend/src/ui/widgets/EditorStage/EditorStage.tsx`

    **Story / Priority**: US2 (P1). Needs T025, T026.

    **Requirements**: FR-TD-012, FR-TD-013 (10,000-row list with "N more not shown", keyboard activation), FR-TD-014
    (stale marker) · US2-7, US2-8, US2-9, US2-10, US2-16, US2-18 · SC-004, SC-007 · contracts/ui-surfaces.md §"Status
    bar and problems panel".

    **Read first**: contracts/ui-surfaces.md "Status bar and problems panel" (new status fact `problems`, exact count,
    `0` after a clean run, hidden until Lint has run for the active document, "out of date" marker and accessible text,
    it is a **control** that toggles the panel; panel: docked `Pane` below the editor, header/close/body, role `region`
    with a localized name, rows with severity icon, line, column, message and rule, Enter or click moves the caret and
    focuses the editor, cap 10,000 then "N more not shown", stale `Banner` "Results are out of date until Lint runs
    again", empty states "No problems" / "Run Lint to check this document", long messages wrap, reduced motion, **no**
    `role=menu`, `dialog`, `tab` or `radiogroup`).

    **Existing code to extend** (verified): status facts are built in `AppShell.tsx:67-135` (`standard-kind` dropPriority
    0, `cursor` 1, `count` 2, `encoding` 3, `line-ending` 4, `autosave` 5; `NARROW_DROP_PRIORITY = 2`); `StatusFact`
    type at `StatusBar.tsx:13-22` (`{id,rowLabel,detailLabel,value,dropPriority,placement?,marker?,transient?}`) — it
    has no control/activation member, add one minimally; primitives `Pane`, `Banner`, `Icon`; the `toggle-problems`
    action (add to the registry with surfaces status-bar count and View menu, available when a document is open) and
    `View` → Problems in `ViewMenu.tsx`; the summary store from T025; `setPosition` from T024; the fact's drop priority
    is "before the `cursor` fact" per the contract.

    **Create / modify**: `ProblemsPanel/ProblemsPanel.tsx` (+ module CSS, tokens only), the `problems` status fact with
    its accessible value/stale text, `toggle-problems` wiring and panel visibility state (UI state), `en.json`
    (`status.problems.*`, `problems.*`: title, empty, notRun, stale, moreNotShown, row labels).

    **Tests**: `frontend/tests/unit/widgets/ProblemsPanel.test.tsx` — 3 findings list with line numbers in document
    order; activation by click and by Enter calls `setPosition` and focuses the editor; 12,000 findings → 10,000 rows
    plus "2,000 more not shown" while the status count stays 12,000; empty and not-run states; stale banner and
    "out of date" fact text after an edit; hidden before the first Lint of the active document; cleared when another
    document becomes active; `region` role and accessible names; keyboard focus order.

    **Out of scope**: real-browser proof (T028).

    **Definition of done**: the count and the panel behave per the contract in the component tests.

    **Verify**: `scripts/test unit`, `scripts/test integration`, `scripts/verify lint`.

- [ ] T028 [US2] Add the tidy fixtures and prove the tidy journeys end to end in `frontend/tests/fixtures/messy-document.md`, `frontend/tests/fixtures/three-findings.md`, `frontend/tests/e2e/tidy.test.ts`

    **Story / Priority**: US2 (P1). Needs T026, T027.

    **Requirements**: US2-1 to US2-19 (US2-11 is engine-level in T023; US2-4, US2-6, US2-14 and US2-15 are proven at engine level in T019/T020/T023 and only smoke-checked here; the rest are asserted here) ·
    SC-003 (sample), SC-004, SC-006, SC-007, SC-008 · quickstart.md Q10-Q18, Q29 and §Fixtures.

    **Read first**: quickstart.md §Fixtures (`messy-document.md`, `three-findings.md`: with default preferences exactly
    three findings from three different rules — one `*` bullet item (`ul-marker`), one prose line ending in a single
    space (`trailing-space`), one fenced block without a language (`fence-language`); one level-1 heading, no blank-line
    runs, a final newline) and "Generated by the tests into their temporary directory" (3 MiB editable document rich
    in lists and tables; a 512 KiB document of deeply nested lists whose Format run lasts longer than one second; a
    document with 1,500 findings and one with 12,000; a read-only document = a small file containing a lone carriage
    return); an existing E2E that opens real files (`real-files.test.ts`).

    **Create / modify**: the two fixtures (excluded from Prettier by T001; **L22-clean**), `tidy.test.ts`; update
    `frontend/tests/e2e/deferred-controls.test.ts` if T026 left assertions there.

    **Tests**: Format on the messy document (bullets `-`, emphasis `_`, ATX, padded table, line breaks kept, dirty
    mark), Format again changes nothing, one Undo restores the exact text; Compact result and identical preview;
    Lint on three-findings shows underlines with hover text naming rule/severity/hint, status count 3, three rows in
    the panel; activating a finding by mouse and by keyboard puts the caret there and focuses the editor; Lint on a
    clean document shows 0 and no underlines; edit after Lint keeps underlines and marks count/list out of date;
    1,500 findings → count 1,500, 1,500 rows, ≤ 1,000 underlines; 12,000 → "2,000 more not shown"; read-only document →
    Format/Compact disabled with the read-only tooltip, Lint available; 3 MiB Format shows progress and Cancel and
    cancelling leaves the text unchanged, a second run completes (module workers run in this webview); while it runs
    Compact and Lint show the in-progress tooltip and typing yields the stale notice with the typed text kept; the
    512 KiB nested-list Format shows Cancel once it has lasted one second; the problems panel and Cancel checked in
    all six theme/mode combinations; the shared request guard reports zero foreign requests.

    **Out of scope**: settings-driven preferences and on-save (T039).

    **Definition of done**: the journeys pass against the real backend; timings noted with the platform.

    **Verify**: `scripts/test e2e` (tidy, deferred-controls), `scripts/verify lint`, `scripts/format --check`.

---

## Phase 5: User Story 3 — Follow a link to another local file (Priority: P2)

**Goal**: Activating a link to another local document in the preview opens (or focuses) it, makes it the active tab
in both editor and preview, keeps the outgoing document's edits, scrolls to a `#fragment`, and — when the file is
inside the open folder and has a tree row — expands, selects and scrolls to that row. Unsupported local files are
refused with "Reveal in file manager"; network and device paths stay refused.

**Independent Test**: Open `frontend/tests/fixtures/link-tree/` as the folder; from `docs/a.md` follow `sub/b.md`
(with an unsaved edit in `a.md`), an already-open document, `sub/b.md#setup`, `../c.md`, `../.hidden/d.md` and a
link to `link-outside.md`; then `report.pdf`, a missing file and `//server/share/notes.md` (quickstart Q19-Q21).

**Governance**: the Constitution 2.2.0 text of Principle IV (links open supported documents anywhere on the local disk) and
ADR-0037 are already in the repository; these tasks implement them and need no approval step. Also needs T024 (`setPosition`)
and T008 (`extractHeadings`).

- [ ] T029 [US3] Rewrite the link resolver, add link-target decoding and `RevealPath` in `internal/appmodel/preview_link.go`, `internal/file/paths.go`, `internal/apperr/results.go`, `tests/go/`

    **Story / Priority**: US3 (P2). First Go task of the story.

    **Requirements**: FR-LK-001, FR-LK-007, FR-LK-008, FR-LK-009, FR-LK-010, FR-LK-014 · US3-3, US3-6, US3-7, US3-8,
    US3-10, US3-11 · contracts/link-open.md §"Backend resolver (`OpenPreviewLink`)" (steps 1-7 and the "Removed from
    today's resolver" paragraph) · data-model.md §"Bridge result: OpenResult (additions)" table · research R14 ·
    ADR-0037.

    **Read first**: contracts/link-open.md "Backend resolver" and "Tests" (the Go bullets); data-model.md OpenResult
    table (Status/Error category/RevealPath/TreePath per outcome; footnote 2: the classification Open gives, with the
    40-document case showing the existing capacity notice; a folder target replaces today's `unsupported-input`;
    footnote 3: the refused result's safe subject is replaced by the target's safe basename so the notice names the
    file and never shows the absolute path); research.md R14; `.golangci.yml:13-58` (depguard: `internal/apperr` imports
    no internal package; `internal/appmodel` may not import wails or bootstrap; a `handler.go` may not import
    `internal/file`).

    **Existing code to change** (verified): `internal/appmodel/preview_link.go` — `OpenPreviewLink` l.15-23 calls
    `previewLinkTarget` (l.25-88) then `service.OpenPath(ctx, target, expectedTabSetRevision)`; steps today: look up the
    document (NotFound, subject `"document"`), **untitled refusal l.51-56** (every target from an untitled document),
    `previewLinkPath(href)` l.99 (rejects `//` prefixes, empty paths and any scheme — a colon before the first slash —
    strips `?`/`#`, hand-rolled `percentDecode` because `net/url` is avoided across an appmodel network boundary),
    join to the source folder, `file.CanonicalizeCandidateDocumentPath` l.72 (symlinks resolved; for a missing file the
    parent), **`isWithinDirectory` l.79/l.157 (the D11 folder limit — remove)**, suffix refusal l.86. Refusals use
    `bridge.ClassifiedWithID(category, subject, msg, RemediationNone, documentID)` mapped by
    `bridge.FromClassified[OpenResult]` to `OpenStatusRefused`. `OpenResult` is `internal/apperr/results.go:628-636`
    (`Status, DocumentID, Path, ProjectionRevision, ActiveBuffer, Error`; alias `OpenOutcome` l.639).
    `internal/file/paths.go`: `Identity` l.26, `CanonicalizeDocumentPath` l.61, `CanonicalizeCandidateDocumentPath` l.85,
    `CanonicalizeDirectoryPath` l.114, `IsSupportedDocumentSuffix` — **there is no UNC or device-path check anywhere in
    the repository today**. The literal safe subject `"document"` is passed to `bridge.ClassifiedWithID` at many
    `internal/appmodel/file_lifecycle.go` sites (l.134, 147, 149, 161, 177, 194, 217, 223, 307, 324, 337, 345; `PrepareOpen`
    starts at l.130; `OpenPath` at l.117), also `service.go:181,186`. The safe-basename rule is in
    `internal/apperr/classified_error.go:126-152` (`NewClassifiedError`: back-slashes read as `/`, then `filepath.Base`).

    **Create / modify**:
    - `internal/file/paths.go` — a pure helper (name chosen by the task; the resolver is its production caller, which
      satisfies rule L6) that takes the href **and the host flavour as a plain `windows bool`** (production code passes `runtime.GOOS == "windows"`, so the parameter has a production caller; do **not** add exported flavour constants used only by tests — `tools/archlint/main.go` ignores `_test.go` files, so rule L6 would fail; the parameter lets unit tests run Windows and POSIX
      behaviour on every machine): drops query and fragment, percent-decodes (including `%20` and `%5C`), splits
      separators and drive letters in the host's flavour — on Windows back-slash and drive-letter spellings resolve
      like the forward-slash form; on POSIX `\` and a drive prefix are ordinary file-name text so such targets usually
      end as `not-found` — and reports UNC (`\\server\share`, `//server/share`) and device-namespace (`\\?\`, `\\.\`) — these are the **only** "network paths" (a Windows mapped drive such as `Z:\` or a share mounted under `/Volumes` is an ordinary local path; URL schemes are the classifier's job) —
      paths, judged on the **decoded** path so escaped spellings are included, on every operating system.
    - `preview_link.go` — resolver order per the contract: parse; **refuse UNC/device before any read** as
      `unsupported-input` with the existing refused-link message; refuse a **relative** target from an untitled source
      as `unsupported-input` while an absolute target continues; resolve relative targets against the source
      document's folder and canonicalise (symlinks resolved); if the canonical path is an existing regular file whose
      suffix is not `.md`, `.markdown`, `.mdown` or `.txt` (case-insensitive) → refuse as `unsupported-input` with
      `RevealPath` = its absolute path; otherwise pass to the existing `OpenPath` so missing, folder, unreadable,
      over-50-MiB and 40-document conditions get the classification Open gives and an open file is focused; when
      `OpenPath` returns `refused`, replace the result's safe subject (`Error.SafeSubject` and `Failure.Subject`,
      `"document"` from `PrepareOpen`) with the target's safe basename by the `NewClassifiedError` rule (category,
      message, remediations and the dedupe key stay). **Delete** `isWithinDirectory`, the blanket untitled refusal, the
      suffix refusal for targets that do not exist, and the mapping of a canonicalisation failure to
      `unsupported-input` ("could not be resolved").
    - `apperr/results.go` — `OpenResult` gains `RevealPath string` (`json:"revealPath,omitempty"`) only (TreePath is T030).
    - Regenerate the Wails models (`scripts/build` runs `wails generate module`; `frontend/wailsjs/go/models.ts` is
      tracked — commit the change; never edit it by hand).

    **Tests**: rewrite `tests/go/integration/application/preview_link_test.go` (l.41-47 untitled; the table at l.55-63
    asserted the D11 refusals "outside folder" and "symlink escape" — both now **open**; the unsupported-suffix case now
    carries `RevealPath`); new/updated cases: symbolic link and hard link to an open document focus the existing tab;
    case-only difference on a case-insensitive volume where available (skip otherwise); UNC and device strings refused
    on every platform (unit-test the helper with an explicit flavour); folder target, missing target, unreadable,
    over-50-MiB and 40-document targets return Open's classification with the target's **basename** as safe subject and
    no absolute path anywhere in the error; relative and absolute targets from an untitled document; percent-encoded
    (`My%20Notes.md`), `./` and `../`, angle-bracket-stripped hrefs; POSIX: `C:\docs\a.md` and `sub\b.md` end as
    `not-found` while UNC/device strings are still `unsupported-input`; Windows flavour helper cases as string tests.
    Unit tests for the helper under `tests/go/unit/file/`.

    **E2E that this task breaks and must fix**: `frontend/tests/e2e/preview-links.test.ts` (~l.121-143) asserts the outside-folder refusal notice and that the source stays active; after this task the backend opens the outside document, so update that assertion minimally (the outside link now opens; do not assert editor content yet) — T035 rewrites the file. The full `scripts/verify` gate requires it.

    **Out of scope**: `TreePath` (T030), any frontend change other than that E2E assertion, the constitution/ADR text (done).

    **Definition of done**: Go suites green, no callerless export (L6), bindings regenerated and committed, and none of
    the removed D11 refusals remain.

    **Verify**: `scripts/test unit`, `scripts/test integration`, `scripts/verify lint`, `scripts/build` (clean tree).

- [ ] T030 [US3] Return `TreePath` for targets that have a folder-tree row in `internal/appmodel/workspace.go`, `internal/appmodel/preview_link.go`, `internal/apperr/results.go`, `tests/go/`

    **Story / Priority**: US3 (P2). Needs T029.

    **Requirements**: FR-LK-004 (backend half), FR-LK-005 (symlink-resolved comparison, filesystem capitalisation rules),
    FR-LK-006 · US3-1 (tree row), US3-3, US3-9 · contracts/link-open.md §"**`TreePath`**" · research R14 · plan.md Risks
    ("Case-only link matching on Windows").

    **Read first**: contracts/link-open.md `TreePath` paragraph (set on `opened` and `focused` when a folder is open,
    the target's canonical path is inside the workspace's canonical root and the snapshot has a node for it; containment
    decided as `createWorkspaceEntry` decides it: `filepath.Rel` from the root, outside when absolute or starting with
    `..`; a segment matches a node exactly, or — when it differs only in capitalisation — when both files have the same
    `file.Identity`; where `file.Identity` falls back to the canonical path string a case-only difference never matches
    and `TreePath` is empty; entries the tree omits — dot-files, hidden folders while hidden, symlinks, unsupported
    suffixes, entries beyond 20,000 — yield an empty `TreePath`; `RevealPath`/`TreePath` are never logged).

    **Existing code to extend** (verified): `internal/appmodel/workspace.go` — `createWorkspaceEntry` l.29 (takes
    `workspaceMu`, clones `service.state.workspace`, canonicalises the parent with `CanonicalizeDirectoryPath`, checks
    containment with `Rel` against `RootPath`) and the snapshot mappers `workspaceNode`/`workspaceSnapshot`
    (l.385-406) and `cloneWorkspaceSnapshot` l.408; `apperr.WorkspaceNode` `results.go:188` (`Path`, `Name`, `IsDir`,
    `Unreadable`, nested `Children`; **absolute paths**, no per-node relative path) and `WorkspaceSnapshot` l.176
    (`RootPath`, `RootName`, `Root`, `TotalEntries`, `Truncated`, …); `file.Identity` in `internal/file/paths.go:26`.

    **Create / modify**: a small lookup function in `workspace.go` (walks the in-memory snapshot along the relative path
    under the workspace lock, returns the node's path or empty) called by `OpenPreviewLink` on `opened`/`focused`;
    `OpenResult` gains `TreePath string` (`json:"treePath,omitempty"`); regenerate and commit bindings.

    **Tests** (`tests/go/integration/appmodel/` or `application/`): target inside the folder with a row → `TreePath`
    equals the node path; outside the folder → empty; no folder open → empty; a file in a hidden folder while hidden
    folders are off → empty and the document still opens; symlinked target resolves to the in-tree path; truncated tree
    → empty; case-only difference matches only where the two files have the same identity (skip on case-sensitive
    volumes); `TreePath` is absent from logs (assert via the existing log-capture helper if present).

    **Out of scope**: the frontend consumption (T034).

    **Definition of done**: `TreePath` is set exactly per the table in data-model.md, tests green, bindings committed.

    **Verify**: `scripts/test unit`, `scripts/test integration`, `scripts/verify lint`, `scripts/build`.

- [ ] T031 [US3] Update the link classifier and refusal reasons in `frontend/src/logic/markdown/linkPolicy.ts`, `frontend/src/ui/widgets/PreviewPane.tsx`, `frontend/src/i18n/locales/en.json`

    **Story / Priority**: US3 (P2). Needs nothing beyond the story's earlier tasks.

    **Requirements**: FR-LK-009 (network/device paths refused on every platform, including percent-escaped spellings),
    FR-LK-010 (untitled documents refuse **relative** targets only), FR-LK-011 (anchors, `http`/`https`, all other
    schemes refused incl. `file:`), FR-LK-014 (classify Windows spellings identically) · US3-10, US3-11 · contracts/
    link-open.md §"Frontend classifier" · data-model.md §"Value: LinkTarget".

    **Read first**: contracts/link-open.md classifier table (every row); data-model.md LinkTarget (kinds `anchor`,
    `localDocument` {`href` as written, `fragment?`, **no `path`**}, `external`, `refused`; refusal reasons kept `empty`,
    `scheme`, `malformed`, `untitled-document`; added `network-path`; **removed** `outside-document-folder` and
    `unsupported-extension` from links; the classifier behaves identically on every platform: `C:\…` and `sub\b.md`
    classify as `localDocument` on macOS and Linux too, a single letter is not a scheme).

    **Existing code to change** (verified): `frontend/src/logic/markdown/linkPolicy.ts:71` `classifyLink`
    (refusals at l.95 outside-folder and l.98 extension); helpers `resolveLocalPath` and `isInsideDocumentFolder` stay
    **exported and unchanged** because `imagePolicy.ts:1` imports them (images keep the document-folder rule and their
    own `outside-document-folder` reason — `imageSource.test.ts:24`); `PreviewPane.tsx` `refusalReason` (serves
    classifier refusals only; gains `network-path`, loses the two removed reasons); tests
    `frontend/tests/unit/markdown/linkPolicy.test.ts` (`path` expectation at l.17, `unsupported-extension` at l.51,
    `outside-document-folder` at l.56); `en.json` `preview.linkRefused.reason.*`.

    **Create / modify**: `classifyLink` percent-decodes the path part **before** the network-path check so
    `%5C%5Cserver\…` and `%2F%2Fserver/…` are refused like `//server/share`, `\\server\share`, `\\?\`, `\\.\`; relative
    path with an untitled document → `untitled-document`, absolute → `localDocument`; remove the folder and suffix
    logic and the `path` field; `en.json`: add `preview.linkRefused.reason.networkPath`, change `…reason.untitled` to
    "Relative links need a saved document.", remove `…reason.outside` and `…reason.extension`.

    **Tests**: every row of the classifier table, including Windows spellings as string cases with the same result on
    every platform and `%5C%5Cserver%5Cshare%5Ca.md` / `%2F%2Fserver/share/a.md` as `network-path`; `file:`, `mailto:`,
    `data:`, `javascript:`, `ftp:` as `scheme`; empty and non-decodable; fragment kept on `localDocument`; `imagePolicy`
    cases unchanged and green.

    **Out of scope**: opening (T033), backend.

    **Definition of done**: the classifier never touches the disk and decides neither folder membership nor suffix.

    **Verify**: `scripts/test unit`, `scripts/verify lint`.

- [ ] T032 [US3] Carry `revealPath`/`treePath` and wire the reveal action in `frontend/src/logic/adapter/index.ts`, `frontend/src/logic/store/appModelTypes.ts`, `frontend/src/logic/hooks/useLivePreview.ts`, `frontend/src/logic/store/classifiedNotification.ts`, `frontend/src/app/useNotifications.ts`

    **Story / Priority**: US3 (P2). Needs T029, T030.

    **Requirements**: FR-LK-007 (Reveal in file manager works wherever the file is; the application never launches
    another program) · US3-6 · contracts/link-open.md §"Consumers that change" · contracts/ui-surfaces.md Notices
    (`link-unsupported-file`, "Reveal in file manager" = the `reveal-workspace-path` remediation carrying `revealPath`).

    **Read first**: contracts/link-open.md "Consumers that change"; data-model.md last paragraph of "Bridge result:
    OpenResult"; `RevealWorkspacePath` (`internal/appmodel/handler.go:84`, service `copy_path.go:124`) is **not
    workspace-restricted** and only stats the path, so it serves any reveal path.

    **Existing code to change** (verified): `adapter/index.ts:261` `normalizeOpenResult` copies fields one by one
    (callers l.474/476/513/516) — add `revealPath`, `treePath`; there is **no** adapter wrapper for
    `RevealWorkspacePath` today — add one in `adapter/` (only the adapter imports `wailsjs`);
    `store/appModelTypes.ts:395` `OpenResult` gains optional `revealPath`, `treePath`; `hooks/useLivePreview.ts:9`;
    `classifiedNotification.ts:151` `retryIsExecutable` returns false for `reveal-workspace-path` (the action would not
    render) — accept a non-empty `path` argument; `useNotifications.ts:157` handles the intent as a no-op — call the
    new wrapper with the notice's path; `useCommands.ts:379,382` already report errors with that intent. Notice
    plumbing: a local notice is `notifyToast({code, severity, subject, title, message})` with remediation via
    `NotificationRemediationIntent`/`Action` (`notificationsSlice.ts`); `reveal-workspace-path` already exists in the
    union.

    **Create / modify**: the files above; a builder for the `link-unsupported-file` notice (title naming the file,
    message stating it is not a document the editor can open, action "Reveal in file manager" carrying the path);
    `en.json` `link.unsupportedFile.*`; tests.

    **Tests**: adapter normalisation keeps both fields (and absent fields stay absent); `link-unsupported-file` renders a
    Reveal action; clicking it calls `RevealWorkspacePath` with the notice's path (wrapper spy); `retryIsExecutable`
    false for an empty path; Wails model drift covered by the Build stage.

    **Out of scope**: `openLink()` (T033).

    **Definition of done**: an `OpenResult` with `revealPath` can produce a working Reveal notice.

    **Verify**: `scripts/test unit`, `scripts/test integration`, `scripts/verify lint`.

- [ ] T033 [US3] Add the single `openLink()` path, fragment and tree-reveal requests, and route the preview through it in `frontend/src/app/useCommands.ts`, `frontend/src/ui/widgets/PreviewPane.tsx`, `frontend/src/ui/widgets/AppShell.tsx`

    **Story / Priority**: US3 (P2). Needs T008, T024, T031, T032.

    **Requirements**: FR-LK-001, FR-LK-002 (flush outgoing edits; editor and preview both show the target), FR-LK-003
    (fragment: preview scroll and editor caret; no match → top, no error), FR-LK-008, FR-LK-011, FR-LK-013 · US3-1
    (target active), US3-2, US3-4, US3-5, US3-7, US3-8, US3-10 · contracts/link-open.md §"The one open path", §"Fragment
    and tree reveal" · research R15.

    **Read first**: contracts/link-open.md "The one open path" (steps 1-5 in order; notices: only classifier refusals use
    `preview-link-refused`, shown by the caller **before** any backend call; every backend refusal reaches the user
    through step 5), "Fragment and tree reveal"; research.md R15 (today `PreviewPane.tsx:253-272` calls
    `adapter.openPreviewLink` directly, never flushes, never acknowledges the activation and handles only `focused`, so the
    store's `activeDocumentId` moves but the editor keeps the old buffer; `OpenResult.ActiveBuffer` is already filled).

    **Existing code to change / mirror** (verified): `app/useCommands.ts` — `tabRevealRequest` is
    `useState<{documentId, sequence} | null>` at l.40 (with `editorFocusRequest` l.41, producers `onFocusedDocumentOpen`
    l.74-79 and `requestFocusedTabReveal` l.83-89, returned at l.468, then plumbed `AppShell.tsx:21/48/156` →
    `EditorView.tsx:46/82/174` → `DocumentTabs.tsx` → `TabBar.tsx:164-168` where a `useLayoutEffect` consumes it by
    matching the active tab; `EditorView.tsx:99-114` tracks handled sequences in a ref) — copy this pattern for the new
    **tree reveal request `{documentId, path, seq}`** and **fragment request `{documentId, slug, seq}`** (data-model.md
    "Ephemeral requests": consumed once by `seq`, a later request replaces an unconsumed one); `openLink` does not exist;
    `flushActiveDocument()`, `activation.begin()` / `activation.acknowledge(generation, result.activeBuffer)` are how
    Open and Reopen work today (read them in this file); `reportEntryError`'s `intent` parameter becomes **optional**
    (`NotificationRemediationIntent` has no `none`; omitting the intent is the existing way `reportClassifiedError`
    offers no Retry); `PreviewPane.tsx:69` `openResultRefusal` (**delete**) and l.253-272 (`localDocument` now calls an
    `onOpenLink` callback prop; anchors scroll inside the preview container via T008's helper; `external` keeps the
    system-browser call).

    **Create / modify**: `openLink(target, sourceDocumentId)` exactly per the contract: flush → `activation.begin()` →
    `adapter.openPreviewLink(sourceDocumentId, href)` → on `opened`/`focused` acknowledge, reveal the tab, publish the
    tree reveal request when `result.treePath` is set and the fragment request when the link has a fragment (when
    `result.documentId === sourceDocumentId` skip the acknowledgement, publish only the fragment request; a link to the
    current document without a fragment does nothing visible) → on `refused` show `link-unsupported-file` when
    `revealPath` is set, otherwise `reportEntryError(result.error)` with no intent; the source stays active. Fragment
    consumption: once the target is active a visible preview scrolls to the element with that id **inside its
    container**, and a visible editor places the caret on the heading's line (`extractHeadings` on the target's text →
    `setPosition`); no match → top, no error. `AppShell` plumbs both requests down — the plumbing also touches `frontend/src/ui/widgets/EditorView.tsx`, `frontend/src/ui/widgets/EditorStage/EditorStage.tsx` (which renders `PreviewPaneContent` and `CodeEditor`) and the layout that renders `WorkspaceTree` without props today (`WorkspaceLayout.tsx`, find it) so the tree can receive its request; `en.json` for the fragment-related
    strings if any.

    **Tests** (`frontend/tests/integration/previewLinks.test.tsx`, hand-written Monaco runtime + fake adapter): activating
    a local document link makes the target the active tab and shows its content in the editor **and** the preview; an
    unsaved edit in the source tab is kept; an open target focuses its existing tab (no second tab); `b.md#setup` scrolls
    the preview and places the caret on the `## Setup` line; unknown fragment → top, no notice; a self-link with a
    fragment only scrolls and does not reinstall the editor session; a missing or folder target shows the classified
    notice titled with the file name and **no Retry**; 40 open documents shows the capacity notice; an untitled document
    with a relative link shows `preview-link-refused` (US3-10) without calling the adapter; a `revealPath` result shows
    the Reveal action; the tree reveal request is published only when `treePath` is set.

    **Out of scope**: the tree consuming the request (T034), the editor's Cmd/Ctrl-click entry (T036).

    **Definition of done**: the preview reaches the backend only through `openLink`, and US3 scenarios 1-2, 4-5, 7-8, 10
    pass at integration level.

    **Verify**: `scripts/test unit`, `scripts/test integration`, `scripts/verify lint`.

- [ ] T034 [US3] Reveal the linked document in the folder tree in `frontend/src/ui/widgets/WorkspaceTree/WorkspaceTree.tsx`

    **Story / Priority**: US3 (P2). Needs T033.

    **Requirements**: FR-LK-004 (expand every collapsed ancestor, select the row, scroll it into view, leave other
    folders' expansion alone), FR-LK-006 · US3-1, US3-3 (tree selection unchanged), US3-9 · contracts/link-open.md §"Fragment
    and tree reveal" (tree reveal request) · data-model.md §"Ephemeral requests".

    **Read first**: contracts/link-open.md "Tree reveal request `{documentId, path, seq}`, like `tabRevealRequest`:
    `WorkspaceTree` consumes it when the document `documentId` becomes active … sets its selection to `path` explicitly
    …"; the reason: `WorkspaceTree.tsx:108-113` selects the active document's path exactly and **resets its local
    selection whenever the active path changes**, and the active path can differ in spelling from `treePath`, so
    consuming the request before that reset would lose the selection.

    **Existing code to extend** (verified): `WorkspaceTree.tsx:108-113` selection state; the local expansion state and the
    frontend `findNode` in the same file; the request plumbing added in T033; `frontend/tests/support/WorkspaceTreeTestProvider.tsx`.

    **Create / modify**: consume the request once by `seq` when `documentId` is the active document (activation has landed
    and its active path is the target): expand every collapsed ancestor of `path` in local state, set the selection to
    `path` explicitly (after the reset), scroll the row into view (`scrollIntoView` with a jsdom-safe guard); an unknown
    path does nothing; other folders' expansion is untouched; a request for an out-of-folder or rowless document is never
    produced (T030) so the selection does not change (US3-3).

    **Tests** (`frontend/tests/unit/widgets/WorkspaceTree.test.tsx`): request for `sub/b.md` expands `sub`, selects and
    scrolls that row while a second collapsed folder stays collapsed; the selection survives the active-path change
    effect; a request consumed once (re-render with the same `seq` does nothing); an unknown path does nothing; a later
    request replaces an unconsumed one. Real scrolling in T035.

    **Out of scope**: backend `TreePath` (T030), the request producer (T033).

    **Definition of done**: the tree reveals and selects the linked row in component tests.

    **Verify**: `scripts/test unit`, `scripts/test integration`, `scripts/verify lint`.

- [ ] T035 [US3] Add the link-tree fixtures and prove the link journeys end to end in `frontend/tests/fixtures/link-tree/`, `frontend/tests/e2e/preview-links.test.ts`

    **Story / Priority**: US3 (P2). Needs T034.

    **Requirements**: US3-1 to US3-9 and US3-11 (scenario 10 is an integration test in T033) · SC-005, SC-006 · edge cases
    "Link spelling", "Link identity", "Link to itself", "Network paths and other schemes" · quickstart.md Q19-Q21 and
    §Fixtures (`link-tree/`).

    **Read first**: quickstart.md §Fixtures (`link-tree/`: `docs/a.md` linking to every target, `docs/sub/b.md` with
    `## Setup`, `c.md`, `.hidden/d.md`, `report.pdf`; plus `link-outside.md` **next to the folder**) and "a 40-document
    setup: 40 small documents opened before the run plus a link to a 41st"; the existing
    `frontend/tests/e2e/preview-links.test.ts` (around l.121-143 it asserts the outside-folder refusal notice and that the
    source stays active — that assertion is **replaced**: the outside document now opens and becomes the active tab).

    **Create / modify**: `frontend/tests/fixtures/link-tree/…` and `frontend/tests/fixtures/link-outside.md` (L22-clean;
    excluded from Prettier by T001); rewrite `preview-links.test.ts`.

    **Tests**: with `link-tree/` as the folder: following `sub/b.md` (with an unsaved edit in `a.md`) opens a new tab,
    makes it active in editor and preview, keeps the edit in `a.md`, and the tree expands `sub`, selects the row and
    scrolls it into view; a link to an already-open document focuses its tab (no second tab) and reveals the row;
    `sub/b.md#setup` scrolls to the heading; `../c.md` and `../../link-outside.md` open and leave the tree selection
    unchanged when outside; `../.hidden/d.md` opens with no tree message; `report.pdf` opens nothing and shows the notice
    with "Reveal in file manager" (assert the bridge call through `frontend/tests/support/commandRecorder.ts`); a missing
    document names the file; 40 open documents + a link to a 41st shows the capacity notice; `//server/share/notes.md`
    shows the refused-link notice and reads nothing; with no folder open the same links open in tabs; the shared request
    guard reports zero foreign requests. Windows spellings are covered by Go and classifier tests only.

    **Out of scope**: the editor's Cmd/Ctrl-click (T036).

    **Definition of done**: SC-005 holds in the trials above (target is the active tab in editor and preview 100% of the
    time; an in-folder target with a row is visible and selected).

    **Verify**: `scripts/test e2e` (preview-links), `scripts/verify lint`, `scripts/format --check`.

---

## Phase 6: User Story 4 — Follow links from the editor (Priority: P2)

**Goal**: Cmd (macOS) or Ctrl (Windows, Linux) plus click on a Markdown link target in the editor does exactly what
activating it in the preview does; a plain click only moves the caret.

**Independent Test**: In the Editor-only arrangement, Cmd/Ctrl+click a document link, a web link and a `#fragment`
link, and plain-click the same links (quickstart Q22).

- [ ] T036 [US4] Add the Monaco link provider and opener in `frontend/src/ui/components/monacoSetup.ts`, `frontend/src/ui/components/CodeEditor.tsx`, `frontend/src/ui/widgets/EditorStage/EditorStage.tsx`, `frontend/tests/e2e/preview-links.test.ts`

    **Story / Priority**: US4 (P2). Needs T024, T033, T035 (the E2E extends the same file).

    **Requirements**: FR-LK-012, FR-LK-013 (same link text, same outcome in preview and editor), FR-LK-003 (editor caret on
    the heading) · US4-1, US4-2, US4-3, US4-4 · contracts/link-open.md §"Editor entry (Cmd or Ctrl click)" ·
    contracts/editor-highlighting.md §Links · research R13.

    **Read first**: contracts/link-open.md "Editor entry" (a Monaco link provider for `markdown` returns ranges for inline
    links, reference-style links (`[t][ref]`, `[ref]` with a definition) and autolinks from the document parsed with
    `syntaxPlugins('full')`, debounced; `registerLinkOpener` hands the clicked target to the `onLinkActivate(href)` prop of
    `CodeEditor` and the default opener is never reached; `monacoSetup.ts` and `CodeEditor.tsx` are shared components under
    `ui/components` and import nothing from `app/`, the store, the adapter or the action registry — **the widget that
    renders the editor supplies the handler**, which runs `classifyLink` then `openLink` (or the browser call for
    `external`, or the `preview-link-refused` notice for a classifier refusal); an anchor link moves the caret to the
    heading line in the same document; a plain click only moves the caret); contracts/editor-highlighting.md "Links" and
    "Constraints" (+13 KB for `contrib/links/browser/links`).

    **Existing code to extend**: `monacoSetup.ts` (lazy; T024 added the hover import); `CodeEditor.tsx` props;
    `EditorStage.tsx` (or the widget that renders `CodeEditor` — the ESLint boundary `frontend/eslint.config.js:127-148`
    forbids the component from importing store/adapter/actions); `openLink`, `classifyLink`, `extractHeadings`,
    `setPosition`; the existing system-browser call used by the preview for `external` links.

    **Create / modify**: `monacoSetup.ts` imports `monaco-editor/esm/vs/editor/contrib/links/browser/links`, registers
    `registerLinkProvider('markdown', …)` and `registerLinkOpener`; because these registrations are global, route each
    click to the handler of the editor whose model it belongs to (one registry keyed by model, disposed with the
    editor); `CodeEditor` gains the `onLinkActivate(href)` prop; the rendering widget supplies the handler; link ranges
    cover the link text **and** the target so a Cmd/Ctrl-click on either works; the modifier is Cmd on macOS and Ctrl on
    Windows/Linux (Monaco's default link modifier — verify per platform).

    **Tests**: unit/integration with the hand-written Monaco runtime — the provider returns ranges for inline,
    reference-style (with and without a definition) and autolink forms and none inside code spans/fences; the opener calls
    `onLinkActivate` with the decoded destination (angle brackets already removed) and never the default opener; the
    handler classifies and routes (document → `openLink`, `http` → browser call, refused → `preview-link-refused`, anchor →
    caret to heading). **E2E** (extend `preview-links.test.ts`, Editor-only arrangement): Cmd/Ctrl-click `next.md` and
    the link text has the same outcome as the preview (US4-1), a plain click only moves the caret (US4-2), a web link
    opens in the system browser exactly as from the preview (assert the bridge call, US4-3), `[setup](b.md#setup)` makes
    `b.md` active with the caret on `## Setup` scrolled into view (US4-4).

    **Out of scope**: languages and grammars (T040), Monaco link styling beyond the default underline.

    **Definition of done**: the four scenarios pass; the preview and the editor share one open path.

    **Verify**: `scripts/test unit`, `scripts/test integration`, `scripts/test e2e` (preview-links), `scripts/verify lint`.

---

## Phase 7: User Story 5 — Choose the Markdown standard and tidy preferences (Priority: P3)

**Goal**: The Settings view has a Markdown group (standard, bullet, emphasis, heading style, Format on save, Lint on
save); every surface shows the same stored value; the choices persist across a restart and take effect without one;
explicit saves can Format first and Lint afterwards.

**Independent Test**: Change each setting, confirm the preview, status indicators, Format output and Lint findings
follow it, restart and confirm persistence (quickstart Q7, Q23-Q25).

- [ ] T037 [US5] Add the Markdown group to the Settings dialog and make the on-save rows live in `frontend/src/ui/widgets/dialogs/SettingsDialog.tsx`, `frontend/src/ui/widgets/Menubar/SettingsMenu.tsx`, `frontend/src/logic/actions/actionRegistry.ts`

    **Story / Priority**: US5 (P3). Needs T003, T011, T022 (Lint reads the preferences).

    **Requirements**: FR-ST-001 (group contents and keyboard operability), FR-ST-002, FR-ST-003 (persist and apply without
    restart) · US5-3, US5-6 · SC-007 · contracts/settings-markdown.md §"Settings view" and "Existing code that changes" ·
    contracts/ui-surfaces.md (settings rows available once settings have loaded).

    **Read first**: contracts/settings-markdown.md "Settings view" (a Markdown group containing, in order: Markdown
    standard (segmented Minimal, GFM, Full), bullet marker (`-`, `*`, `+`), emphasis marker (`_`, `*`), heading style
    (ATX, Setext), Format on save (switch), Lint on save (switch); each control keyboard operable with a localized
    accessible name and description; uses existing primitives `Segmented` and the existing toggle row; the popup rows call
    the **same** settings command as the dialog group and carry no logic of their own; one `updateMarkdown` call with the
    merged group; a failed write keeps the previous value and shows a notice).

    **Existing code to extend**: `SettingsDialog.tsx` (find the existing groups and the toggle-row pattern);
    `SettingsMenu.tsx` popup rows (fallbacks removed in T003); `actionRegistry.ts:267,270` (`format-on-save`,
    `lint-on-save` still `deferred`); `settingsCommands.ts`; `en.json` `settings.markdown.*` (existing control and value
    keys are reused; add the group title and descriptions only); tests `frontend/tests/integration/menubar.settings.legacy.test.tsx`
    (l.194, 325: the rows were asserted deferred).

    **Create / modify**: the Markdown group; remove `deferred` from the two rows; both surfaces call one command; update
    the two legacy assertions.

    **Tests**: each control issues exactly one `updateMarkdown` with the merged group and the projection acknowledges it;
    popup rows and dialog group call the same command; before hydration the group's controls are unavailable and issue no
    write; a rejected write restores the control and shows a notice; keyboard: arrow keys change segmented values, Space
    toggles switches, accessible names present; first-start defaults shown from the backend (Full, `-`, `_`, ATX, off, on).

    **Out of scope**: on-save behaviour (T038).

    **Definition of done**: the group works and no surface disagrees with the stored value.

    **Verify**: `scripts/test unit`, `scripts/test integration`, `scripts/verify lint`.

- [ ] T038 [US5] Run Format and Lint around explicit saves in `frontend/src/app/useDocumentWrites.ts`, `frontend/src/app/useTidyCommands.ts`, `frontend/src/i18n/locales/en.json`

    **Story / Priority**: US5 (P3). Needs T025, T037.

    **Requirements**: FR-ST-004, FR-ST-005, FR-ST-006 · US5-4, US5-5, US5-7 · contracts/settings-markdown.md §"Save
    behaviour (explicit saves only)" · research R17 · contracts/ui-surfaces.md Notices (`format-on-save-skipped`).

    **Read first**: contracts/settings-markdown.md "Save behaviour" (the skip table in order: not the active document →
    skipped; slot busy → skipped; `edits` → applied as one undo step and the formatted text saves; `refused`, `cancelled`,
    `failed` → skipped with that reason; `stale` → result discarded, skipped: the document changed; "skipped" means the
    current text is saved unchanged and the `format-on-save-skipped` notice names the reason; Lint after a successful save
    of the active document when Lint on save is on, **silently skipped** if the slot is busy; a Lint refusal, failure or
    cancellation never blocks or undoes the save; the close plan validates each target's content revision, so the backend
    never changes text inside `Save`; the formatted text is what gets saved because Format changes the working copy before
    `flushActiveSession` and before the revision is read); research.md R17.

    **Existing code to extend**: `frontend/src/app/useDocumentWrites.ts` (the save path already distinguishes explicit and
    autosave origins via `SaveOrigin`; reads `getState()` after `flushActiveSession`; `save-success` toast at l.124-132);
    `frontend/src/app/useCloseWorkflow.ts` (the Save choice of the close/quit prompt — confirm it goes through the
    explicit path, including saving a **non-active** tab); `useTidyCommands` (`origin: 'on-save'` from T025).

    **Create / modify**: in the explicit save path, before `flushActiveSession`, when Format on save is on run Format via
    `useTidyCommands` with `origin: 'on-save'` for the active document only; map the returned outcome per the table;
    `en.json` `tidy.skipped.*` reasons (not active, busy, refused, cancelled, failed, changed) and the
    `format-on-save-skipped` title/message; after a successful explicit save of the active document run Lint when Lint on
    save is on; autosave path untouched.

    **Tests** (`frontend/tests/integration/saveTidy.test.tsx`): explicit Save with both on → Format runs first as one undo
    step, the saved text equals the formatted text, Lint runs after and sets markers/count; Save As and the close-prompt
    Save choice behave the same for the active document; autosave runs neither; each skip row (not active, slot busy,
    refused, cancelled, failed, stale) saves the current text and shows the notice with its reason; closing a non-active
    edited tab with Save → no Format, text saved as is, notice states formatting was skipped (US5-7); Lint on save with a
    busy slot is skipped with **no** notice and leaves markers/count untouched; a Lint failure does not block the save.

    **Out of scope**: the settings UI (T037), real-app proof (T039).

    **Definition of done**: all skip rows have tests and the save never loses or blocks on tidy failure.

    **Verify**: `scripts/test unit`, `scripts/test integration`, `scripts/verify lint`.

- [ ] T039 [US5] Prove settings, persistence and on-save journeys end to end in `frontend/tests/e2e/settings-markdown.test.ts`

    **Story / Priority**: US5 (P3). Needs T028, T038.

    **Requirements**: FR-ST-001 to FR-ST-006, FR-RN-015 · US5-1 to US5-7 · SC-006, SC-007 · quickstart.md Q7, Q23-Q25.

    **Read first**: quickstart.md Q23-Q25; existing E2E patterns for relaunch (`app.relaunch()` in
    `frontend/tests/support/harness.ts`), `frontend/tests/e2e/settings-rejection.test.ts`, `menus.test.ts`,
    `theme-surfaces.test.ts`.

    **Create / modify**: `settings-markdown.test.ts`; also add to the integration suite (or here) the check that the
    **toolbar bullet and emphasis actions use the stored markers** (`frontend/src/logic/format/formatting.ts:42-52`
    `formatMarkers()` already returns heading style and the `+` bullet; verify the call at
    `frontend/src/logic/actions/editorActionExecutor.ts:199` passes the settings' bullet and emphasis, and that heading
    actions stay ATX — FR-ST-003, spec 002 FR-ED-014); fix anything found in the owning file.

    **Tests**: a fresh profile shows Full, `-`, `_`, ATX, Format on save off, Lint on save on in the Markdown group; changing
    the standard to GFM re-renders every open document, formulas/admonitions turn literal, tables and footnotes still render
    and header and status bar show "GFM" within one second; Minimal keeps diagrams and shows a table literal; bullet `*`
    → Format writes `*` and Lint reports `-` bullets; toolbar list/emphasis actions insert the stored markers; heading style
    Setext → Format/Lint follow it while the toolbar heading action stays ATX; relaunch keeps every choice; with Format on
    save and Lint on save on, an explicit save formats then saves the formatted text then lints (count shown); an
    autosave does neither; closing a non-active edited tab with Save skips Format and shows the notice; six theme
    combinations checked for the Markdown group; the shared request guard reports zero foreign requests.

    **Out of scope**: rendering specifics (T017).

    **Definition of done**: the journeys pass against the real backend.

    **Verify**: `scripts/test e2e` (settings-markdown), `scripts/verify lint`, `scripts/format --check`.

---

## Phase 8: User Story 6 — Highlighted code and Mermaid source in the editor (Priority: P3)

**Goal**: Fenced code (the FR-RN-006 languages) and Mermaid source are coloured in the editor from the same palette the
preview uses, in all six theme/mode combinations.

**Independent Test**: Type a ` ```mermaid ` block and a ` ```python ` block in the editor and check the colouring in
each of the six combinations (quickstart Q26).

- [ ] T040 [US6] Register the fenced-code languages, aliases and small grammars in `frontend/src/ui/components/monacoSetup.ts`, `frontend/src/ui/components/monaco/`

    **Story / Priority**: US6 (P3). Needs T024 (the hover import lives in the same file; order avoids a merge conflict but
    there is no logical dependency).

    **Requirements**: FR-HL-002 (languages part) · US6-2 · contracts/editor-highlighting.md §Languages · research R13.

    **Read first**: contracts/editor-highlighting.md "Languages" (import the individual `basic-languages/<lang>/<lang>.contribution`
    files for JavaScript, TypeScript, Go, Python, Java, C, C++, C#, Rust, Ruby, PHP, Kotlin, Swift, SQL, YAML, XML, HTML,
    CSS, SCSS, PowerShell, Dockerfile, Shell and Markdown, plus the existing `basic-languages/ini/ini.contribution` whose
    tokenizer serves TOML under the `toml` id; **never** import `basic-languages/monaco.contribution`; small in-repo Monarch
    grammars with conventional token names for `json`, `diff` and `makefile` (JSON's real mode needs a worker); aliases
    registered as extra ids `jsx`→javascript, `tsx`→typescript, `bash`, `zsh`, `console`→shell, `md`→markdown,
    `cs`→csharp, `rs`→rust, `kt`→kotlin, `docker`→dockerfile, `patch`→diff, `make`, `mk`→makefile, `toml`→ini; backtick
    fences embed their language through the markdown grammar (`nextEmbedded`); `~~~lang` fences are **not** embedded — a
    Monaco behaviour — and stay uncoloured).

    **Existing code to extend** (verified): `monacoSetup.ts` imports only the markdown contribution and the editor worker
    today; the setup stays lazy; Monaco is pinned at 0.52.2.

    **Create / modify**: language contributions and aliases in `monacoSetup.ts`; `ui/components/monaco/json.ts`, `diff.ts`,
    `makefile.ts` (Monarch definitions); size (~110 KB minified in lazy chunks, a few KB of grammars) is reported at T044,
    not gated.

    **Tests**: unit tests cannot run real Monarch tokenisation (the existing tests use a hand-written Monaco runtime) — assert
    the registrations: every language id and alias is registered exactly once, the three custom grammars export valid
    tokenizers (keys such as `tokenizer.root`), `basic-languages/monaco.contribution` is not imported (a source-free check:
    the set of registered ids equals the expected list), setup remains lazy. Tokens are proven in T042.

    **Out of scope**: the colour rules (T041), the Mermaid grammar (T041).

    **Definition of done**: a fenced block in each listed language is tokenised by Monaco in the running app (checked in T042).

    **Verify**: `scripts/test unit`, `scripts/test integration`, `scripts/build`, `scripts/verify lint`.

- [ ] T041 [US6] Add the Mermaid grammar and the generic token colour rules in `frontend/src/ui/components/monaco/mermaid.ts`, `frontend/src/ui/components/monacoSetup.ts`, `frontend/scripts/generate-editor-themes-core.cjs`, `frontend/src/logic/theme/generatedEditorThemes.ts`

    **Story / Priority**: US6 (P3). Needs T010 (generator preview half), T040.

    **Requirements**: FR-HL-001, FR-HL-002 (colours) · US6-1, US6-2, US6-3 · contracts/editor-highlighting.md §"Mermaid
    grammar" and §Colours (Editor) · research R13.

    **Read first**: contracts/editor-highlighting.md "Mermaid grammar" (separate token classes for diagram-type keywords —
    `flowchart`, `graph`, `sequenceDiagram`, `classDiagram`, `stateDiagram-v2`, `erDiagram`, `gantt`, `pie`, `mindmap`,
    `timeline`, `gitGraph`, `journey`, `quadrantChart`, …; structural keywords — `subgraph`, `end`, `participant`, `actor`,
    `loop`, `alt`, `opt`, `par`, `note`, `section`, `class`, `state`, `direction`, …; arrows and links — `-->`, `---`, `==>`,
    `-.->`, `->>`, `-->>`, `--x` and label forms; quoted labels; `%%` comments including `%%{…}%%` directives — the grammar
    only **colours** a directive, the preview never honours its theme) and "Colours" (a generic rule table maps Monaco token
    prefixes to `--hl-*` families: `keyword`→keyword, `string`→string, `comment`→comment, `number`→number, `type`→type,
    `delimiter` and `operator`→punct, `annotation`, `attribute.name` and `tag`→attr, `predefined`→function; Monaco picks the
    longest matching prefix so the existing markdown and Go rules keep precedence; theme names
    `gme-{glass,material,minimal}-{light,dark}` and the runtime observer `monacoThemes.ts` are unchanged; no new CSS
    variable, no colour literal outside token files).

    **Existing code to extend** (verified): `generate-editor-themes-core.cjs` (today: rules only for markdown and Go, and Go
    is not registered so fenced Go is uncoloured; T010 already made it emit the preview `.hljs-*` mapping);
    `generate-editor-themes.mjs:13` entry; generated `frontend/src/logic/theme/generatedEditorThemes.ts`; the generator
    test `frontend/tests/unit/tooling/generateEditorThemes.test.ts` (synthetic palette).

    **Create / modify**: `monaco/mermaid.ts` Monarch grammar, registered as the `mermaid` language id (the markdown grammar
    already embeds fenced languages, so registering the id is enough); generic rule table in the generator; regenerate and
    commit the generated themes; extend the generator test to assert, **for each of the six themes**, that `themes[name].rules`
    holds one rule per generic prefix whose `foreground` is that theme's resolved `--hl-*` value and that the existing
    markdown and Go rules are still present.

    **Tests**: generator test above; grammar unit test that the Mermaid tokenizer definition declares distinct token classes
    for the five categories (asserting the tokenizer data, since real tokenisation is E2E).

    **Out of scope**: real-browser colours (T042).

    **Definition of done**: the generator emits the rule table for all six themes and the Build stage is clean after
    regeneration.

    **Verify**: `scripts/test unit`, `scripts/verify` through Build (clean tree), `scripts/verify lint`.

- [ ] T042 [US6] Prove editor colouring in all six theme combinations in `frontend/tests/e2e/editor-highlighting.test.ts`

    **Story / Priority**: US6 (P3). Needs T041.

    **Requirements**: FR-HL-001, FR-HL-002 · US6-1, US6-2, US6-3 · SC-006, SC-007 · quickstart.md Q26 · plan.md §"Test placement"
    ("S6's editor colouring journey has its own file").

    **Read first**: quickstart.md Q26; `frontend/tests/e2e/theme-surfaces.test.ts` (the looped six-combination pattern and how
    it switches theme/mode); Monaco renders tokens as `.mtk<N>` spans whose colours come from the active theme — read computed
    colours in the page.

    **Create / modify**: `editor-highlighting.test.ts`.

    **Tests**: for each of the six combinations, type a ` ```mermaid ` block and assert a diagram-type keyword, a structural
    keyword, an arrow, a quoted label and a `%%` comment each have a colour distinct from plain text (and from one another
    where the palette distinguishes them); type a ` ```python ` block and assert keyword, string and comment tokens are
    coloured and that the editor colour of each equals the preview's colour for the same category (both read from the `--hl-*`
    token via computed style); a `~~~python` fence stays uncoloured (documented Monaco behaviour); switching theme and mode
    recolours without reopening; the shared request guard reports zero foreign requests.

    **Out of scope**: preview colouring (T017).

    **Definition of done**: the journey passes in all six combinations.

    **Verify**: `scripts/test e2e` (editor-highlighting), `scripts/verify lint`, `scripts/format --check`.

---

## Phase 9: Polish, Documentation & Closeout

- [ ] T043 Record this feature's architecture and update the deferred lists in `docs/architecture.md`, `docs/index.md`, `README.md`, `AGENTS.md`

    **Story / Priority**: Polish (cross-cutting). Needs every story you are delivering.

    **Requirements**: Constitution I (one authority) · AGENTS.md §"Evidence and handoff" (public-surface changes are
    recorded in the active feature artifacts or `docs/architecture.md`) · plan.md "Repository rules from S0 on".

    **Read first**: plan.md "Existing code replaced or changed" (each row is a fact the map must state after the change) and
    "Project Structure"; contracts (all six) "Existing code that changes"; `docs/architecture.md` §"Backend and bridge
    owners", §"Frontend composition and command owners", §"Shared UI owners and consumer inventory", §Persistence,
    §"Durable decisions", §"Links, files and images" (l.369-383) and decision **D11** (l.544) and §"Verification
    walkthrough"; `docs/index.md:215` ("document-wide Format/Compact/Lint" listed as candidate work) and `README.md:15-16`
    ("document-wide formatting/lint") — the two places that still describe the tidy actions as not built.

    **Create / modify**: `docs/architecture.md` — owner rows for `frontend/src/logic/tidy/`, `frontend/src/logic/operations/`,
    `frontend/src/ui/widgets/ProblemsPanel/`, the pipeline files under `frontend/src/logic/markdown/` and `mermaid/`; the
    consumer-inventory updates (settings defaults are backend-only; `OpenResult` carries `RevealPath` and `TreePath`; the
    action registry has per-action availability; the deferred list now names only the command palette, Assistant, Export
    and image); the "Links, files and images" section rewritten to the new link scope (D11's single classifier and open flow stay true — keep D11, add a clause that the document-folder link limit is gone per ADR-0037); the persistence note (default standard is Full, six keys unchanged); two or three new verification-walkthrough
    steps (tidy, link follow, diagrams); `docs/index.md` (data flows, interfaces, configuration, known scope boundaries;
    same wording rules); `README.md` (remove "not built" wording); `AGENTS.md` (confirm pointers; feature 006 is complete
    only when the owner closes it — do not mark it so before then).

    **Tests**: none. **Both lint rules apply**: L22 (no `T###`, `FR-`, `SC-`, `STORY-`, `Proves:` — describe behaviour and
    owners, never this file's identifiers) and L25 (every backticked repo path must now exist — they all do after the
    stories land).

    **Out of scope**: constitution edits; spec/contract edits (record deviations in the completion note instead and ask).

    **Definition of done**: every public surface this feature added has an owner row; the deferred lists are true.

    **Verify**: `scripts/verify lint` then `scripts/verify --skip e2e`.

- [ ] T044 Check the production bundle policy and record sizes and packaged-build behaviour

    **Story / Priority**: Polish (cross-cutting). Needs T017, T042.

    **Requirements**: FR-RN-017, SC-006 · plan.md §Risks ("Mermaid weight and webview differences", "Bundle growth") ·
    research R21 · quickstart.md "Full verification".

    **Read first**: plan.md Risks; research.md R21 (confirm module workers and Mermaid `getBBox` in the packaged application
    on macOS; E2E runs in Chromium in the macOS release workflow only, so WebView2 and WebKitGTK are unverified and checked
    by hand where a host is available); `tools/lint/bundle-scan.mjs`.

    **Steps of substance**: `scripts/build` (production); `node tools/lint/bundle-scan.mjs frontend/dist` must report ok;
    confirm Mermaid and KaTeX are lazy (non-entry) chunks and KaTeX fonts are woff2 only with no `data:` font; record chunk
    sizes against the baseline build (Mermaid, KaTeX, highlight.js grammars, Monaco hover and language chunks) in the
    completion note — **no size gate is added** (spec Assumptions accept the growth). Run the packaged application and
    verify: a Format on a large document uses a module worker and Cancel terminates it; a Mermaid diagram lays out
    (`getBBox`) and the first pie/mindmap loads its lazy parser chunk; KaTeX fonts load. Use the computer-use tooling if
    available; otherwise ask the owner to perform the walk and record their result. On a Windows or Linux host, if one is
    available, also check Windows link spellings (FR-LK-014) and case-only matching (plan.md Risks); otherwise state that
    they are proven by Go and classifier table tests only.

    **Create / modify**: none in production (fixes belong to the owning task's files); the record goes into
    `specs/006-rich-markdown-authoring/plan.md` under a "Close-out record" heading in T045.

    **Tests**: none written.

    **Definition of done**: bundle scan green, lazy chunks confirmed, sizes and the packaged-build observations recorded,
    and every unverified platform named as unverified — a caveat is never converted into a pass.

    **Verify**: `scripts/build`, `node tools/lint/bundle-scan.mjs frontend/dist`.

- [ ] T045 Run the final verification, walk the quickstart, and leave the worktree handoff-ready

    **Story / Priority**: Polish (cross-cutting). Needs T043, T044.

    **Requirements**: Constitution VII · AGENTS.md §"Development loop" steps 4-5 and §"Evidence and handoff" · SC-001 to
    SC-008 · quickstart.md "Full verification" and "Real-application walk" (Q1-Q29).

    **Read first**: AGENTS.md "Development loop" step 4 (a green stage is necessary but not sufficient: trace each acceptance
    criterion to the code path that implements it, confirm its edge cases have tests and that the real application behaves as
    specified — start it and exercise the feature) and step 5; quickstart.md in full; the traceability table below.

    **Steps of substance**: run the full six-stage `scripts/verify`, then `scripts/baseline --compare` against
    `.local_tmp_files/baseline/006-rich-markdown-authoring.json`. Start the app (`scripts/build dev`) and walk quickstart
    Q1-Q29 — with the computer-use tooling when available (outside a Claude or Codex app session, check availability first;
    if unavailable ask the owner to run the walk and record their result). Explicitly cover SC-007 (every new control
    keyboard-operable, accessibly named, correct in all six theme/mode combinations: tidy actions and Cancel, the problem
    count and panel, the Markdown settings group, the Reveal action, alert boxes, diagram error box, formula marker,
    placeholders) and SC-002 timings (Q27). Append a "Close-out record" to `specs/006-rich-markdown-authoring/plan.md`
    (date, commit, host, outcome, commands and results, remaining limitations). Confirm **no** `specs/*/evidence/` directory
    was created; generated bindings and themes match a clean build; the working tree is clean; review the whole feature
    diff for unrelated changes. Remove the scratch fixtures the walk created. Tick completed tasks in this file, set
    `spec.md` status, and do a final pass on `checklists/requirements.md`.

    **Create / modify**: `specs/006-rich-markdown-authoring/plan.md` (close-out), `spec.md` (status), this file (ticks),
    `checklists/requirements.md`. No production code — fixes found here go to the owning task's files with the reason
    stated.

    **Tests**: none written; this task runs every suite.

    **Definition of done**: six stages green, `--compare` shows no regression, the real-app walk is recorded, the tree is
    clean, and the note states the verified result, pre-existing findings carried over from the baseline recorded by T001 and the next decision
    needed. The completed feature parent is integrated by squash merge into `app_version_1_codebase`; the repository owner
    controls the later merge into `master`.

    **Verify**: `scripts/verify` then `scripts/baseline --compare`.

- [ ] T046 Perform an independent fresh-context review of the finished feature

    **Story / Priority**: Polish (cross-cutting). Needs T045.

    **Requirements**: user global rule "Final Review" · AGENTS.md ("code-review or requesting-code-review before calling work
    done").

    **Read first**: spec.md, plan.md "Existing code replaced or changed", the traceability table below.

    **Steps of substance**: in a **fresh session with no implementation context**, review the whole feature diff against
    `app_version_1_codebase` for: requirement/spec compliance (each FR traced to a code path and a test), correctness and
    regressions (link open path, save path, dirty tracking, undo), ownership and reuse (no parallel implementation; the
    boundaries in Standing rules hold), unnecessary complexity or duplication, test adequacy (no test asserts source text;
    edge cases exercised, not only happy paths), security (the sanitizer and Mermaid scrub against the hostile set; no
    path leaks in logs or errors), unresolved TODOs or placeholders, and the recorded verification results. Use the
    `code-review` skill. Classify findings Blocking / Important / Minor; fix Blocking and Important in the owning files,
    re-run the affected verification, and record Minor items without churn.

    **Create / modify**: fixes only, in the owning files; the review summary goes into the T045 close-out record.

    **Tests**: whatever the fixes require.

    **Definition of done**: no Blocking or Important finding remains; the completion note lists what was found and fixed.

    **Verify**: `scripts/verify`.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (T001)**: the only setup task; it also records the baseline before its first edit.
- **Foundational (T002–T005)**: blocks every user story. Order T002 → T003 → T004; T005 is independent of them.
- **US1 (T006–T017)**: T006 → T007 → (T008, T009, T010 in any order but sequentially, all edit `pipeline.ts`) → T011 → T012;
  T013 and T015 are file-disjoint and may run alongside T006–T012; T014 needs T013; T016 needs T014 and T015; T017 last.
- **US2 (T018–T028)**: T018 may start at any time; T019 needs the Full syntax (T013/T014 for math). Then T020 → T021
  → T022 → T023; T024 may run after T019; T025 needs T018, T022, T024; T026 → T027 → T028.
- **US3 (T029–T035)**: needs T008 and T024. T029 → T030 → T031 → T032 → T033 → T034 → T035.
- **US4 (T036)**: needs T033 and T035.
- **US5 (T037–T039)**: needs T011, T022, T025; T037 → T038 → T039.
- **US6 (T040–T042)**: T040 needs only the setup (it shares `monacoSetup.ts` with T024 — run it after T024 to avoid a merge
  conflict); T041 needs T010 and T040; T042 last. US6 is otherwise independent and may be delivered before US3.
- **Polish (T043–T046)**: after every story being delivered.

### Cross-story reuse (each is a dependency, never a shared task)

| Built by                                                       | Reused by                                                                       |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `syntaxPlugins('full')` and the `$` construct (T006, T014)     | the tidy parser (T019), the editor link provider (T036)                         |
| `extractHeadings` and the anchor scroll helper (T008)          | fragment navigation (T033), the editor anchor link (T036)                       |
| `CodeEditorHandle` `setPosition`, `applyEdits`, markers (T024) | tidy results (T025), problems panel (T027), fragment caret (T033), links (T036) |
| Operation slot (T018) and `useTidyCommands` (T025)             | the tidy surfaces (T026), the on-save hook (T038)                               |
| Shared request guard (T005)                                    | every E2E task (T012, T017, T028, T035, T039, T042)                             |
| Registry availability reasons (T003, T026)                     | settings rows (T011, T037)                                                      |
| Theme generator preview half (T010)                            | the Monaco half (T041)                                                          |
| `openLink()` (T033)                                            | the preview (T033) and the editor (T036) — one open path                        |

### Parallel opportunities

- T013 (math construct), T015 (Mermaid engine modules) and T018 (operation slot) create new files only and may run beside
  any earlier task.
- After T010 (the theme generator's preview half) and T024 (the `monacoSetup.ts` hover import), US6 (T040–T042) can proceed in parallel with US2–US3 apart from the shared files noted above; T036 (links) and T040/T041 all edit `monacoSetup.ts`, so run them in sequence
  (`monacoSetup.ts` with T024; the theme generator with T010).
- Within a story, everything else is sequential by design: most tasks extend `pipeline.ts`, `en.json`, `actionRegistry.ts` or
  `useCommands.ts`, and running them concurrently produces merge conflicts. Go tasks (T029, T030) come before the frontend
  tasks that consume their bindings.

---

## Requirement traceability

Every requirement has one owning task. "Supporting" tasks contribute but are not responsible for it.

| FR                                                                                       | Owner | Supporting       |
| ---------------------------------------------------------------------------------------- | ----- | ---------------- |
| FR-RN-001 Three standards, default Full                                                  | T011  | T002, T006, T007 |
| FR-RN-002 Minimal renders CommonMark, highlighting, Mermaid                              | T006  | T010, T016       |
| FR-RN-003 GFM adds tables, task lists, strikethrough, autolinks, footnotes, front matter | T006  | T012             |
| FR-RN-004 Full adds math, alerts, admonitions                                            | T009  | T014             |
| FR-RN-005 Strict inline math rule                                                        | T013  | T014             |
| FR-RN-006 Highlighted languages, 200,000-char bound                                      | T010  | T041             |
| FR-RN-007 Mermaid diagrams, twelve types, local error box                                | T016  | T015, T017       |
| FR-RN-008 One raw-HTML policy                                                            | T006  | T012             |
| FR-RN-009 Invalid formula fails locally, no commands or resources                        | T014  | T017             |
| FR-RN-010 Hardened Mermaid output                                                        | T015  | T016             |
| FR-RN-011 No keystroke delay, stale diagram discarded                                    | T016  | T017             |
| FR-RN-012 Limits: 50 diagrams, 1,000 formulas, 50,000 / 10,000 characters                | T014  | T016             |
| FR-RN-013 Theme/mode change redraws within one second                                    | T016  | T010, T017       |
| FR-RN-014 Heading anchors                                                                | T008  | T012             |
| FR-RN-015 Standard change re-renders within one second                                   | T007  | T004, T011       |
| FR-RN-016 Keep last good render on failure                                               | T007  | —                |
| FR-RN-017 Offline: no network request                                                    | T017  | T005, T014, T044 |
| FR-TD-001 Format canonical style                                                         | T020  | T021, T025, T026 |
| FR-TD-002 What Format keeps                                                              | T020  | T021, T023       |
| FR-TD-003 Setext preference                                                              | T021  | —                |
| FR-TD-004 Format is idempotent                                                           | T023  | T020, T021       |
| FR-TD-005 Compact                                                                        | T019  | T026             |
| FR-TD-006 Active document, Full syntax, `.txt` as Markdown                               | T019  | T023             |
| FR-TD-007 Render-equivalence refusal                                                     | T019  | T023, T025       |
| FR-TD-008 One undo step, caret, no-op leaves history alone                               | T025  | T024             |
| FR-TD-009 Lint without changing text                                                     | T025  | T022, T026       |
| FR-TD-010 Ten lint rules                                                                 | T022  | T023             |
| FR-TD-011 First 1,000 findings underlined with hover                                     | T025  | T024             |
| FR-TD-012 Exact status-bar count                                                         | T027  | T022             |
| FR-TD-013 Problems list, 10,000 rows, keyboard activation                                | T027  | T024             |
| FR-TD-014 Stale and discard rules for findings                                           | T025  | T027             |
| FR-TD-015 Operation slot, progress, Cancel, stale results                                | T025  | T018, T019       |
| FR-TD-016 Read-only and busy availability                                                | T026  | T018             |
| FR-LK-001 Open a supported document anywhere on disk                                     | T029  | T033             |
| FR-LK-002 Flush outgoing edits; every pane shows the target                              | T033  | —                |
| FR-LK-003 Fragment: preview scroll, editor caret                                         | T033  | T008, T024, T036 |
| FR-LK-004 Expand, select, scroll the tree row                                            | T034  | T030, T033       |
| FR-LK-005 Symlink-resolved, filesystem-case-aware containment                            | T030  | —                |
| FR-LK-006 Outside / no folder / no row → no tree change, no message                      | T030  | T034             |
| FR-LK-007 Unsupported file → notice with Reveal in file manager                          | T029  | T032             |
| FR-LK-008 Missing, folder, unreadable, >50 MiB, 40-document conditions                   | T029  | T033             |
| FR-LK-009 UNC and device paths refused on every platform                                 | T029  | T031             |
| FR-LK-010 Untitled: relative refused, absolute allowed                                   | T029  | T031             |
| FR-LK-011 Anchors, http/https, other schemes refused                                     | T031  | T033             |
| FR-LK-012 Cmd/Ctrl-click in the editor                                                   | T036  | —                |
| FR-LK-013 Same outcome in preview and editor                                             | T036  | T033             |
| FR-LK-014 Windows back-slash and drive-letter spellings                                  | T029  | T031             |
| FR-ST-001 Markdown settings group                                                        | T037  | —                |
| FR-ST-002 Defaults and pre-hydration behaviour                                           | T003  | T002, T004       |
| FR-ST-003 Persist and apply without restart                                              | T037  | T039, T011       |
| FR-ST-004 Format on save, Lint on save (explicit saves)                                  | T038  | T025             |
| FR-ST-005 Skip rules and notice                                                          | T038  | —                |
| FR-ST-006 Autosave runs neither                                                          | T038  | T039             |
| FR-HL-001 Mermaid source colouring                                                       | T041  | T042             |
| FR-HL-002 Fenced-code colouring from the shared palette                                  | T040  | T041, T042       |

| SC                                                                                           | Verified by                              |
| -------------------------------------------------------------------------------------------- | ---------------------------------------- |
| SC-001 Reference document, zero literal constructs at Full; exactly Full-only literal at GFM | T017, T012                               |
| SC-002 300 ms preview, ≤ 2 s for ≤ 10 diagrams (≤ 100 KB)                                    | T017, T045                               |
| SC-003 30-document corpus: Format idempotent, Compact render-preserving, code byte-identical | T023                                     |
| SC-004 Problem count equals the true count for 0, 1, 10, 1,500 findings                      | T028, T022                               |
| SC-005 Link target is the active tab everywhere; in-folder target visible/selected           | T035                                     |
| SC-006 Zero outbound network requests across the session                                     | T005, T017, T028, T035, T039, T042, T044 |
| SC-007 New controls keyboard-operable, named, correct in six theme/mode combinations         | T045 (walk), T027, T028, T037, T039      |
| SC-008 Tidy in one action, undo in one action                                                | T028                                     |

---

## Implementation strategy

### MVP first

1. T001 (dependencies and the baseline record).
2. T002–T005 (Foundational — blocks everything).
3. T006–T017 (User Story 1).
4. **Stop and validate**: User Story 1 is a complete, demoable slice — rich Markdown, math and diagrams render safely and
   offline in the preview.
5. T018–T028 (User Story 2) delivers the second P1 story: working Format, Compact and Lint.

### Incremental delivery

Each later story is additive and leaves the previous ones working: US3/US4 (links), US5 (settings and on-save), US6 (editor colouring, deliverable at any point after T024). Stop at any checkpoint
to validate.

### Notes

- One task per agent session; each session plans from its task's briefing.
- The line numbers in the briefings were verified on 2026-09-29; files move, so re-check before editing.
- A task that discovers work belonging to another story records it rather than absorbing it.
- If an active artifact turns out to be silent or ambiguous on something a task needs, stop and surface the question with a
  recommended default rather than inventing behaviour or editing the specification to make an implementation pass.
- The approved spec keeps a standalone Mermaid editor / document type out of scope (Mermaid = preview diagrams plus editor
  source highlighting); adding one needs a spec change first.
- Commit one task per Conventional Commit message on a task branch
  (`feature/006-rich-markdown-authoring-<task>`), squash-merged into `feature/006-rich-markdown-authoring`. On completion
  the feature parent is squash-merged into `app_version_1_codebase`; the repository owner controls the later merge into
  `master`.
