Not privileged to set domain environment.

# STORY-063 — Complete and apply unified editor palettes

**STATUS:** planned — ready to build.
**Phase:** 02

## What you'll be able to do

Open a Markdown document containing headings, links and a fenced Go block, then switch among all six palettes and see the app surfaces and Monaco restyle together. The completed palette is an observable editor repair, not a token-only layer. The same syntax source generates the preview highlight stylesheet that Phase 06 will activate; this story does not add preview syntax highlighting.

## Rules this story owns

### Markdown source and code inside fences are two different palettes {#two-syntax-palettes}

_(from `spec/product/themes-and-appearance.md#two-syntax-palettes` — copied verbatim)_

- The `--md-*` family colours the Markdown **source** in the editor: the `#` of a heading, the `**` of
  bold, a link's target, a blockquote's `>`.
- The `--hl-*` family colours **programming-language tokens inside a fenced block**, and it is used
  to generate both the Monaco theme for the embedded language and the highlight stylesheet that Phase
  06 activates in the preview.
- Both families are keyed by appearance only, not by theme. Sixteen values, not forty-eight.

| `--md-*` token  | Colours                                   | Light     | Dark                    |
| --------------- | ----------------------------------------- | --------- | ----------------------- |
| `--md-heading`  | `#`, heading text                         | `#3056d3` | `#8fb4ff`               |
| `--md-strong`   | `**bold**`                                | `#b45309` | `#ffd479`               |
| `--md-emphasis` | `_italic_`, inline maths                  | `#7c3aed` | `#c58bff`               |
| `--md-quote`    | `>` blockquote                            | `#0369a1` | `#7fe3b5`               |
| `--md-link`     | link text, target, image path             | `#be123c` | `#ff9d7a`               |
| `--md-comment`  | HTML comments, fence info strings         | `#9aa1ab` | `#8a93b8`               |
| `--md-marker`   | list bullets, numbers, `---`              | `#9aa1ab` | `#8a93b8`               |
| `--code-fg`     | base foreground for any monospace surface | `#30343b` | `#dfe6ff`               |
| `--gutter`      | line numbers                              | `#c9ccd3` | `rgba(255,255,255,.22)` |

| `--hl-*` token  | Colours                       | Light     | Dark      |
| --------------- | ----------------------------- | --------- | --------- |
| `--hl-keyword`  | `func`, `if`, `return`        | `#7c3aed` | `#c58bff` |
| `--hl-string`   | string and character literals | `#0369a1` | `#7fe3b5` |
| `--hl-comment`  | comments                      | `#9aa1ab` | `#8a93b8` |
| `--hl-number`   | numeric and boolean literals  | `#b45309` | `#ffd479` |
| `--hl-function` | function and method names     | `#3056d3` | `#8fb4ff` |
| `--hl-type`     | types, classes, constants     | `#0f766e` | `#5eead4` |
| `--hl-attr`     | attributes, properties, tags  | `#be123c` | `#ff9d7a` |
| `--hl-punct`    | operators and punctuation     | `#5c5c69` | `#9aa1ab` |

Examples: a Go snippet in Glass light and in Minimal light → identical token colours, different fence
background, border, font and gutter · the generated Monaco rules and preview stylesheet disagreeing on
`--hl-keyword` → a build failure before Phase 06 activates the stylesheet.

_Why one syntax palette across themes:_ syntax colouring is a legibility system. Three variants of it
would be three sets to keep readable, for no benefit anybody asked for. The theme still changes
everything around the code.

### Each theme has one accent, one radius and one font across both appearances {#theme-identity-is-stable}

_(from `spec/product/themes-and-appearance.md#theme-identity-is-stable` — copied verbatim)_

- Within a theme, `--accent`, `--win-radius`, `--font` and the blur and shadow character are the same in
  light and dark. Only surfaces and text invert.

| Token                                    | Liquid Glass                                                                                | Material                         | Minimal                         |
| ---------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------- | ------------------------------- |
| `--accent`                               | `#7aa2ff`                                                                                   | `#4f6bed`                        | `#10b981`                       |
| `--accent2` (gradients only)             | `#c58bff`                                                                                   | `#4f6bed`                        | `#10b981`                       |
| `--accent-ink` (text on `--accent-soft`) | `#cdd8ff`                                                                                   | `#0a1a52`                        | `#047857`                       |
| `--accent-soft`                          | `rgba(122,162,255,.16)`                                                                     | `#dfe4ff`                        | `#ecfdf5`                       |
| `--accent-contrast` (text on `--accent`) | `#0b1024`                                                                                   | `#ffffff`                        | `#ffffff`                       |
| `--canvas` (window backdrop)             | aurora: radials `#3b2f7a` + `#1d4e8f` + `#7a2f6a` over linear `#0d1022 → #0a0d1c → #0b0f1e` | `#d9d7e6`                        | `#e9e9ec`                       |
| `--app-bg`                               | `rgba(255,255,255,.10)`                                                                     | `#faf8ff`                        | `#fbfbfa`                       |
| `--surface`                              | `rgba(28,30,54,.82)`                                                                        | `#ffffff`                        | `#ffffff`                       |
| `--elevated`                             | `rgba(28,30,54,.82)`                                                                        | `#f3f1fb`                        | `#ffffff`                       |
| `--surface-2`                            | `rgba(255,255,255,.07)`                                                                     | `#eceaf6`                        | `#f3f3f2`                       |
| `--surface-3`                            | `rgba(255,255,255,.16)`                                                                     | `#e6e3f2`                        | `#eaeae9`                       |
| `--stroke`                               | `rgba(255,255,255,.18)`                                                                     | `#e3e1ee`                        | `#e4e4e7`                       |
| `--stroke-soft`                          | `rgba(255,255,255,.11)`                                                                     | `#eceaf6`                        | `#ececee`                       |
| `--text`                                 | `#eaf0ff`                                                                                   | `#1b1b22`                        | `#1f2328`                       |
| `--muted`                                | `rgba(234,240,255,.60)`                                                                     | `#5c5c69`                        | `#6b7280`                       |
| `--faint`                                | `rgba(234,240,255,.32)`                                                                     | `#9aa1ab`                        | `#9aa1ab`                       |
| `--hover`                                | `rgba(255,255,255,.16)`                                                                     | `rgba(0,0,0,.05)`                | `rgba(0,0,0,.04)`               |
| `--user-bubble`                          | `rgba(122,162,255,.14)`                                                                     | `#dfe4ff`                        | `#ecfdf5`                       |
| `--win-radius`                           | `16px`                                                                                      | `16px`                           | `12px`                          |
| `--win-shadow`                           | `0 24px 80px rgba(0,0,0,.55)`                                                               | `0 12px 32px rgba(27,27,34,.16)` | `0 8px 24px rgba(31,35,40,.10)` |
| `--blur`                                 | `blur(28px) saturate(160%)`                                                                 | `none`                           | `none`                          |
| `--font`                                 | system stack — `-apple-system, "SF Pro Display", "Segoe UI", Inter, …`                      | `"Roboto", "Segoe UI", Inter, …` | `"Inter", -apple-system, …`     |
| `--mono`                                 | `"SF Mono", "JetBrains Mono", ui-monospace, …`                                              | same                             | same                            |

The values above are each theme's **native** appearance — Glass dark, Material light, Minimal light. The
counterpart appearance inverts surfaces and text and keeps everything else.

Examples: Material dark keeps `--accent: #4f6bed` and `--win-radius: 16px` · Material dark with a
different accent → the theme reads as a fourth theme rather than the same one at night.

### The editor theme is generated from these tokens {#editor-theme-is-generated}

_(from `spec/product/themes-and-appearance.md#editor-theme-is-generated` — copied verbatim)_

- Six Monaco themes — three themes × light and dark — are generated at build time from the tables above.
  No colour appears in a `defineTheme()` call that is not traceable to a token here.
- Each generated theme sets at least: `editor.background` from `--app-bg`, `editor.foreground` from
  `--text`, `editorLineNumber.foreground` from `--gutter`, `editorLineNumber.activeForeground` from
  `--text`, `editorCursor.foreground` from `--accent`, `editor.selectionBackground` and
  `editor.selectionHighlightBackground` from `--selection-bg`, `editor.lineHighlightBackground` from
  `--hover`, `editorGutter.background` from `--app-bg`, `editorWidget.background` and
  `editorWidget.border` from `--surface` and `--stroke`, `editorSuggestWidget.*` from `--surface`,
  `--text` and `--accent-soft`, `minimap.background` from `--app-bg`, `scrollbarSlider.background` and
  `scrollbarSlider.hoverBackground` from `--scrollbar-thumb` and `--scrollbar-thumb-hover`,
  `editorError.foreground` from `--err`, `editorWarning.foreground` from `--warn`, plus token rules for
  the Markdown grammar from `--md-*` and for embedded fenced languages from `--hl-*`.

_Why generated:_ Monaco cannot read a CSS custom property. It takes literal colours through
`monaco.editor.defineTheme()`, so "the editor and the preview share one theme" needs a mechanism, not an
assertion.

Examples: the generated Monaco theme and preview stylesheet map a Go keyword to the same `--hl-keyword`
value · a `defineTheme()` call containing a colour that is in no table above → rejected, because the
generator is the only thing allowed to produce those values.

`editorWidget.background` is on that list deliberately: it is the find widget, which ships white and is
unmissable in a dark Liquid Glass window. Find is built later, but its colours are decided here, because
this is where colours are decided.

## How it works now

- `frontend/src/ui/styles/tokens.css:14-199` is the sole authored palette. It has the STORY-058 values but lacks the ten omitted `theme-identity-is-stable` rows and all `--md-*`/ `--hl-*` values. `tokens.test.ts:8-116` reads computed tokens but tests only the old subset.
- `frontend/src/ui/widgets/AppearanceControls.tsx:31-96` reads the persisted choice, serializes writes, and writes the authoritative `data-theme` plus resolved `data-mode` through `applyThemeToRoot`. A failed read keeps Material/Auto; a failed write leaves the current root palette. It does not expose a second theme state or call Monaco.
- `frontend/src/logic/theme/theme.ts:1-31` owns normalisation and root writes. STORY-064 owns live system-appearance observation, so this story must consume the root attributes rather than add a watcher or persist a resolved mode.
- `frontend/src/ui/components/CodeEditor.tsx:49-58` configures Monaco's local loader before the lazy editor renders; `248-290` mounts a Markdown model. It does not register or choose a theme. Recreating this model on a palette change would reset selection/undo state.
- `frontend/src/ui/components/monacoSetup.ts:1-11` is the one Monaco lifecycle boundary: it imports Monaco, loads Markdown grammar, configures the worker, and lives across tab switches and temporarily hidden panes. It has no generated theme data or root-attribute reader.
- `frontend/src/ui/widgets/EditorView.tsx:56-133` owns session attachment and debounced buffer synchronization. It is a reader of `CodeEditor`, but is deliberately not a writer in this story: palette changes must not seed a buffer, flush it, or alter the document-command seam.
- `frontend/package.json:6-16` has no generator hook. The future highlight stylesheet has no reader until Phase 06. `docs/delivery/plan/testing/live-plan.md:40` currently asks for preview colour equality too early; its P1-2 assertion must be corrected to Monaco-only now, leaving the preview comparison to Phase 06.

## Implementation plan

### Monaco scope-to-token decision for STORY-063

Monaco 0.52's bundled Monarch tokenizers define the following scopes. The generator emits exactly these
rules, including dotted descendants. It does not infer scopes from source text or add a second tokenizer.

| Grammar  | Monaco scope(s)                                                                                                          | Generated token                                                                                  | Deliberate boundary                                                                                                                           |
| -------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Markdown | `keyword`                                                                                                                | `--md-heading`                                                                                   | Monaco uses `keyword` for both ATX headings and list markers; headings take precedence.                                                       |
| Markdown | `meta.separator`, `keyword.table.*`                                                                                      | `--md-marker`                                                                                    | Covers thematic and table separators; list markers share `keyword` above.                                                                     |
| Markdown | `strong`                                                                                                                 | `--md-strong`                                                                                    | Covers `**bold**` and `__bold__`.                                                                                                             |
| Markdown | `emphasis`                                                                                                               | `--md-emphasis`                                                                                  | Covers `_italic_` and `*italic*`.                                                                                                             |
| Markdown | `comment`, `comment.*`                                                                                                   | `--md-quote`                                                                                     | Covers blockquote markers and HTML comments; Monaco does not distinguish them.                                                                |
| Markdown | `string.link`, `string.target`                                                                                           | `--md-link`                                                                                      | Covers link text, targets, and image paths.                                                                                                   |
| Markdown | `string`, `variable.source`                                                                                              | `--md-comment` and `--code-fg` respectively                                                      | Fences use `string`; embedded fenced content uses `variable.source` until its embedded grammar takes over.                                    |
| Go       | `keyword`, `keyword.*`, `string`, `comment`, `comment.*`, `number`, `number.*`, `delimiter`, `delimiter.*`, `annotation` | matching `--hl-keyword`, `--hl-string`, `--hl-comment`, `--hl-number`, `--hl-punct`, `--hl-attr` | These are the distinct bundled Go scopes.                                                                                                     |
| Go       | `identifier`, `keyword.type`, `keyword.const`                                                                            | `--hl-function`, `--hl-type`, `--hl-type`                                                        | Go's bundled Monarch grammar does not classify individual function, type, or constant names; these generic scopes are the available boundary. |

The generator test constructs representative Markdown and Go token values for every row and asserts the
resolved foreground values. It must not inspect the generator's source or claim that Monaco emits a more
specific scope than the bundled grammar provides.

1. Complete `tokens.css` with every row in the copied `theme-identity-is-stable` table and all nine `--md-*` plus eight `--hl-*` values from the copied tables. Syntax values are in appearance-only light/dark selectors, never per-theme selectors. Extend computed-style tests to cover every required token across all six palettes and prove Glass/Material/Minimal share each mode's syntax values.
2. Add `frontend/scripts/generate-editor-themes.mjs`. It deterministically parses only the declared palette selectors, rejects a missing, duplicate, unresolved, or untraceable required token, and writes exactly two committed derived assets: `frontend/src/logic/theme/generatedEditorThemes.ts` and `frontend/src/logic/theme/generatedHighlight.css`. The former contains six `gme-{glass|material|minimal}-{light|dark}` definitions; the latter maps the same `--hl-*` values to `hljs-*` selectors but is not imported here.
3. Map every Monaco colour named in `#editor-theme-is-generated`, including the active line, find/widget, suggest widget, minimap, scrollbar, diagnostics, Markdown grammar, and embedded language rules using the scope-to-token table above. The generator is the only producer of literal Monaco colours; it does not fetch or use runtime `getComputedStyle`.
4. Add a `prebuild` generator hook and run its Node fixture test before Jest. The fixture test proves six complete named themes, same light Go-keyword values for Glass and Minimal, and a hard failure when a required token is absent. It inspects returned/generated values, never source text.
5. Extend `monacoSetup.ts` to import generated data, define all six themes once, select the initial name from `document.documentElement`, then observe only that root's `data-theme` and `data-mode` attributes. A valid mutation calls `monaco.editor.setTheme` with the generated name. The fallback is Material light while attributes are absent/invalid. It never writes attributes, persists settings, observes the OS, recreates a model, or activates preview highlighting.
6. Add a controllable-Monaco setup test that verifies six registrations, initial selection, and one root-attribute name swap without remounting the editor. Keep the existing worker/bundle test. Add mocked-bridge Playwright coverage for all six root attribute/theme names, but use the numbered built-binary live case for real Monaco rendering.
7. Amend P1-2: before Phase 06, test a fenced Go block in Monaco for more than one visible syntax colour in all six palettes; state that the generated preview stylesheet exists but is inactive. Phase 06 owns the later split-pane equality check.

## Where the code goes

- `frontend/src/ui/styles/tokens.css` — the complete surface and appearance-scoped syntax token tables; it remains the only authored UI-token file.
- `frontend/src/ui/styles/tokens.test.ts` — computed-style table and appearance-only invariants.
- `frontend/scripts/generate-editor-themes.mjs` and `frontend/scripts/generate-editor-themes.test.mjs` — deterministic generator plus Node fixture behavior tests.
- `frontend/src/logic/theme/generatedEditorThemes.ts` and `frontend/src/logic/theme/generatedHighlight.css` — committed generated assets; neither is hand-edited, and the highlight CSS is not activated yet.
- `frontend/src/ui/components/monacoSetup.ts` and `frontend/src/ui/components/monacoSetup.test.ts` — generated-theme registration and document-root name swapping while retaining the local worker.
- `frontend/e2e/core-editor.test.ts` — mock-bridge journey over the six generated theme names.
- `frontend/package.json` — generator/test hooks only; no gate config changes.
- `docs/delivery/plan/testing/live-plan.md` — correct P1-2's phase ownership.

Relevant patterns: [adding a theme token](../architecture/patterns/adding-a-theme-token.md) and [writing a test](../architecture/patterns/writing-a-test.md).

## Architecture match table

| Rule anchor                         | Applies to                                                                                         | Matched by                           | Injected |
| ----------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------ | -------- |
| `#handler-returns-a-result`         | `internal/**/handler*.go`, `main.go`                                                               | —                                    | no       |
| `#bound-handlers-take-no-context`   | `internal/**/handler*.go`                                                                          | —                                    | no       |
| `#panic-becomes-internal-error`     | `internal/**/handler*.go`                                                                          | —                                    | no       |
| `#apperr-imports-nothing-internal`  | `internal/apperr/**`                                                                               | —                                    | no       |
| `#cause-stays-local`                | `internal/apperr/**`, `internal/**/handler*.go`                                                    | —                                    | no       |
| `#error-codes-are-enum-bound`       | `internal/apperr/apperr.go`, `main.go`                                                             | —                                    | no       |
| `#one-hop-per-layer`                | `internal/**/*.go`                                                                                 | —                                    | no       |
| `#one-composition-root`             | `internal/**/*.go`, `main.go`                                                                      | —                                    | no       |
| `#interfaces-live-with-their-type`  | `internal/**/*.go`                                                                                 | —                                    | no       |
| `#generated-store-is-not-edited`    | `internal/db/store/**`                                                                             | —                                    | no       |
| `#migrations-only-add`              | `internal/db/migrations/**`                                                                        | —                                    | no       |
| `#preferences-use-the-kv-table`     | `internal/settings/**`, `internal/db/migrations/**`                                                | —                                    | no       |
| `#sqlite-is-multi-process-safe`     | `internal/db/**`                                                                                   | —                                    | no       |
| `#no-single-instance-lock`          | `main.go`, `internal/**/*.go`                                                                      | —                                    | no       |
| `#documents-have-identity`          | `internal/appmodel/**`                                                                             | —                                    | no       |
| `#store-is-a-projection`            | `frontend/src/logic/store/**`, `frontend/src/logic/adapter/**`                                     | —                                    | no       |
| `#no-buffer-echo`                   | `internal/appmodel/**`, `frontend/src/logic/hooks/**`                                              | —                                    | no       |
| `#one-document-seam`                | `frontend/src/logic/hooks/**`, `frontend/src/ui/widgets/**`                                        | —                                    | no       |
| `#only-the-adapter-imports-wailsjs` | `frontend/src/**`                                                                                  | generated theme data, UI setup/tests | yes      |
| `#guard-arity`                      | `frontend/src/logic/adapter/**`                                                                    | —                                    | no       |
| `#unwrap-in-one-place`              | `frontend/src/logic/**`                                                                            | generated theme data                 | yes      |
| `#no-colour-outside-a-token`        | `frontend/src/ui/**`                                                                               | `tokens.css`, Monaco setup/tests     | yes      |
| `#theme-on-the-root-element`        | `frontend/src/logic/theme/**`, `frontend/src/ui/**`                                                | generated data, tokens, Monaco setup | yes      |
| `#strings-go-through-t`             | `frontend/src/**`                                                                                  | generated data, UI setup/tests       | yes      |
| `#components-take-props`            | `frontend/src/ui/components/**`, `frontend/src/ui/primitives/**`                                   | Monaco setup/tests                   | yes      |
| `#shell-reserves-three-regions`     | `frontend/src/ui/widgets/**`, `frontend/src/ui/styles/**`                                          | `tokens.css`                         | yes      |
| `#build-is-cgo-free`                | `go.mod`, `internal/**/*.go`, `main.go`                                                            | —                                    | no       |
| `#no-background-network`            | `**`                                                                                               | every declared path                  | yes      |
| `#rendered-html-is-sanitised`       | `frontend/src/logic/markdown/**`, `frontend/src/ui/components/**`                                  | Monaco setup/tests                   | yes      |
| `#logs-stay-local`                  | `internal/**/*.go`                                                                                 | —                                    | no       |
| `#one-long-operation-at-a-time`     | `internal/gate/**`, `internal/export/**`, `internal/llm/**`                                        | —                                    | no       |
| `#bindings-have-no-drift`           | `frontend/wailsjs/**`, `internal/**/handler*.go`, `main.go`                                        | —                                    | no       |
| `#format-and-lint-are-functions`    | `frontend/src/logic/format/**`, `frontend/src/logic/lint/**`                                       | —                                    | no       |
| `#diff-view-has-two-consumers`      | `frontend/src/ui/components/**`                                                                    | Monaco setup/tests                   | yes      |
| `#tests-prove-behaviour`            | `internal/**/*_test.go`, `main_test.go`, `frontend/src/**/*.test.ts`, `frontend/src/**/*.test.tsx` | token and Monaco setup tests         | yes      |

## Technical constraints

### Only the adapter imports `wailsjs/` {#only-the-adapter-imports-wailsjs}

_(from `architecture/rules.md#only-the-adapter-imports-wailsjs` — copied verbatim)_
**Applies to:** `frontend/src/**`
**Enforced by:** `just archtest` (ESLint `no-restricted-imports`)

- Files under `frontend/src/logic/adapter/` may import from `wailsjs/`. No other file may — not a
  component, a widget, a slice, a thunk, a hook, or a utility.
- Each generated binding is wrapped once, in `guardArity(name, bound)`, and exposed as a method on an
  adapter singleton.

Examples: `import { GetState } from '../../wailsjs/go/appmodel/AppModelHandler'` inside `EditorView.tsx`
→ rejected by lint · the same import inside `logic/adapter/services.ts` → correct.

_Why:_ `wailsjs/` is generated and its shape changes with every backend signature change. One wrapping
layer means a signature change has one place to fix, and it is also the only seam the tests can mock —
a component that imports the binding directly cannot be tested without a running Go process.

_Do instead of:_ importing a binding directly "just for one call" · mocking `wailsjs/` in a test.

---

### The envelope is unwrapped in one place {#unwrap-in-one-place}

_(from `architecture/rules.md#unwrap-in-one-place` — copied verbatim)_
**Applies to:** `frontend/src/logic/**`
**Enforced by:** review

- `unwrap(result)` is the only code that inspects an `apperr.*Result`. It raises the error's toast and
  throws; callers get the payload or an exception.

Examples: `const state = unwrap(await appModel.GetState())` → correct · `if (res.error) { … }` at a call
site → rejected, because the next call site will handle it differently.

_Why:_ the error message a user sees should not depend on which call produced it.

_Do instead of:_ per-call-site error branches · swallowing `res.error` and returning `undefined`.

---

### No colour outside a token {#no-colour-outside-a-token}

_(from `architecture/rules.md#no-colour-outside-a-token` — copied verbatim)_
**Applies to:** `frontend/src/ui/**`
**Enforced by:** `just archtest` (colour-literal scan)

- No hex colour, `rgb()`, `rgba()`, `hsl()` or CSS colour keyword appears anywhere under
  `frontend/src/ui/` except in `frontend/src/ui/styles/tokens.css`.
- A component reads `var(--token-name)`. A new visual value is a new token first.

Examples: `border: 1px solid var(--editor-pane-border-color)` → correct · `color: #16201e` in a module
CSS file → rejected · `background: white` in a `.tsx` inline style → rejected.

_Why:_ there are three themes and each has a light and a dark appearance — six combinations. A literal
colour is correct in at most one of them, and it is invisible in the other five until someone switches.

_Do instead of:_ a literal "just for the disabled state" · a colour in an inline `style` prop.

---

### The theme is set on the document element only {#theme-on-the-root-element}

_(from `architecture/rules.md#theme-on-the-root-element` — copied verbatim)_
**Applies to:** `frontend/src/logic/theme/**`, `frontend/src/ui/**`
**Enforced by:** review

- `data-theme` and `data-mode` are set on `document.documentElement` and nowhere else.
- `data-mode` is always the resolved value `light` or `dark`. The literal `auto` never reaches the DOM.

Examples: a dropdown rendered through a Radix portal inherits the theme because it is inside the same
document element · setting `data-theme` on the app shell instead → every portal renders unthemed.

_Why:_ Radix renders overlays into a portal at the end of `<body>`, outside the React tree. Only an
attribute on the root element covers them.

_Do instead of:_ wrapping the app in a themed div · passing the theme down as a prop to style each
component.

---

### Every user-visible string goes through `t()` {#strings-go-through-t}

_(from `architecture/rules.md#strings-go-through-t` — copied verbatim)_
**Applies to:** `frontend/src/**`
**Enforced by:** `just archtest` (ESLint), review

- Text a user reads is a key in `frontend/src/i18n/locales/en.json`, rendered with `t('key')`.
- This includes button labels, headings, placeholder text, empty-state copy, error messages, tooltips,
  and accessible labels.

Examples: `t('editor.emptyState.title')` → correct · `<button>Save</button>` → rejected ·
`aria-label="Close tab"` → rejected, `aria-label={t('tabs.close')}` → correct.

_Why:_ a hard-coded string is invisible to translation and, more immediately, invisible to review — the
catalogue is where all the product's copy can be read and made consistent in one sitting.

_Do instead of:_ a literal "because it is only a placeholder" · a template literal assembling a sentence
from fragments, which cannot be translated as one.

---

### Presentational components take props, not the store {#components-take-props}

_(from `architecture/rules.md#components-take-props` — copied verbatim)_
**Applies to:** `frontend/src/ui/components/**`, `frontend/src/ui/primitives/**`
**Enforced by:** review

- Nothing under `ui/components/` or `ui/primitives/` imports `logic/store` or `logic/adapter`.
- Data and callbacks arrive as props. Wiring happens in `ui/widgets/`.

Examples: `StatusBar` takes `{ wordCount, lineEnding, encoding }` → correct · `StatusBar` calling
`useSelector` → rejected.

_Why:_ a component that selects from the store needs a real store in every test that renders it, and it
cannot be reused in a second context with a different source of data.

_Do instead of:_ `useSelector` inside a leaf component to avoid prop-drilling through one level.

---

### The shell reserves three regions {#shell-reserves-three-regions}

_(from `architecture/rules.md#shell-reserves-three-regions` — copied verbatim)_
**Applies to:** `frontend/src/ui/widgets/**`, `frontend/src/ui/styles/**`
**Enforced by:** review

- `AppShell` lays out a left region (the file tree), a centre region (the document area) and a right
  region (the assistant), and the right region's grid slot, width token and show/hide plumbing exist
  even while nothing renders into it.
- **While** the assistant does not exist, the right region has width `var(--shell-assistant-collapsed-width)`,
  which is `0`.

Examples: opening the assistant later sets one token and mounts one child → correct · adding a third
column to the grid when the assistant is built → rejected, because every layout test and every width
breakpoint written before then has to be redone.

_Why:_ changing the shell's structure late invalidates the responsive verification of every screen built
on top of it.

_Do instead of:_ a two-column layout with the intention of "adding a column when we get there".

---

### The app makes no background network call {#no-background-network}

_(from `architecture/rules.md#no-background-network` — copied verbatim)_
**Applies to:** `**`
**Enforced by:** `just archtest`, review

- The app makes **no** unsolicited outbound request: no update check, no telemetry, no crash report, no
  font, plugin or theme fetch, no CDN asset.
- Before the assistant phases exist, the app makes no outbound request at all.
- **When** the assistant exists, the only outbound requests are inferences to the provider the user
  configured, and only in direct response to the user invoking an action or sending a message. The
  default provider is a local one, so a default install still talks to nothing off the machine.
- Remote images and stylesheets referenced _inside a user's document_ are a separate matter: the user
  chooses Ask, Always allow or Always block, and this rule does not cover them.

Examples: launching the app with a network monitor open and using it for five minutes → zero requests ·
a `<link>` to Google Fonts in `index.html` → rejected · `fetch('https://api.github.com/…')` to check for
a new version → rejected.

_Why:_ people write private things in a text editor. "It only sends a version number" is a promise the
user cannot verify, so the product's answer is that there is nothing to verify.

_Do instead of:_ an opt-out update check · loading KaTeX or Mermaid from a CDN instead of bundling it ·
a "anonymous usage statistics" toggle.

---

### Rendered HTML is always sanitised {#rendered-html-is-sanitised}

_(from `architecture/rules.md#rendered-html-is-sanitised` — copied verbatim)_
**Applies to:** `frontend/src/logic/markdown/**`, `frontend/src/ui/components/**`
**Enforced by:** review

- `rehype-sanitize` is in the rehype plugin list for every Markdown standard level, and it runs last.
- `dangerouslySetInnerHTML` is used only for SVG that Mermaid produced and that has already passed
  through the sanitiser.

Examples: a document containing `<img src=x onerror="…">` → the attribute is stripped and the image
renders inert · removing the sanitiser to make a plugin's output render → rejected.

_Why:_ the preview renders a file that arrived from somewhere else, inside a webview that can call the
Go backend. Unsanitised HTML in that position is remote code execution against the user's machine.

_Do instead of:_ trusting the plugin set's output · widening the schema until the symptom disappears
instead of allowing the specific element the pipeline emits.

---

### The diff view has two consumers {#diff-view-has-two-consumers}

_(from `architecture/rules.md#diff-view-has-two-consumers` — copied verbatim)_
**Applies to:** `frontend/src/ui/components/**`
**Enforced by:** review

- The diff view is a standalone component taking a before string and an after string. The format preview
  and the assistant's edit proposal both render it.

Examples: `<DiffView before={original} after={formatted} />` used by both → correct · a diff rendered
inside the assistant's proposal card → rejected, because the format preview then needs a second one.

_Why:_ two diff renderers disagree about what a change looks like, and the user notices.

_Do instead of:_ building the diff inline in whichever feature needs it first.

---

### A test proves behaviour, not a document {#tests-prove-behaviour}

_(from `architecture/rules.md#tests-prove-behaviour` — copied verbatim)_
**Applies to:** `internal/**/*_test.go`, `main_test.go`, `frontend/src/**/*.test.ts`, `frontend/src/**/*.test.tsx`
**Enforced by:** review

- A test asserts a user-visible outcome or a returned value. It does not assert on the contents of a
  Markdown file, the `justfile`, a CI workflow, or anything under `.claude/`.
- The only permitted source-scanning tests are the architecture invariants in this file, which cannot be
  checked any other way.
- The component under test is rendered, not mocked. Collaborators are mocked at `logic/adapter`, never at
  `wailsjs/`.
- Frontend queries are by accessible role, label or text — not by class name or test id.
- Go tests run under `-race` and use fakes satisfying the package's own interface, not a real database.

Examples: `expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()` → correct ·
`jest.mock('./AppShell')` inside `AppShell.test.tsx` → rejected, and this mistake is live in the
repository today · a Go test asserting a phase document contains a heading → rejected.

_Why:_ a test that reads a document passes while the software is broken, and roughly 4,200 lines of
exactly that were deleted from this repository on 2026-07-25. A mocked subject asserts that the mock
works.

_Do instead of:_ asserting a function was called · snapshotting a large DOM tree as the primary
assertion · deleting a failing test to make the suite green.

## Definition of done

### Baseline — captured at `cf52e78`, `2026-07-29 08:46 UTC` → `../baselines/story-063.md`

|                 | at baseline                                                           |
| --------------- | --------------------------------------------------------------------- |
| tests           | all pass, 0 fail                                                      |
| static analysis | 0 findings · types clean · format clean · build ok · coverage `69.0%` |

Capture it with `just baseline STORY-063` **before writing any code**, and paste the two rows above from what it printed. If the baseline is red in the same area or an architecture gate does not pass, stop rather than starting.

### Mechanical — identical in every story

| #   | Check                    | Command                                                                                                                                   | Passes when                                                                                                                                                                                                                          |
| --- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M1  | Format                   | `just fmt-check`                                                                                                                          | exit 0                                                                                                                                                                                                                               |
| M2  | Types                    | `just typecheck`                                                                                                                          | exit 0, or exactly the baseline error set                                                                                                                                                                                            |
| M3  | Static analysis          | `just lint`                                                                                                                               | no finding absent from the baseline                                                                                                                                                                                                  |
| M4  | Tests                    | `just test`                                                                                                                               | every baseline-passing test still passes; baseline failures unchanged; all new tests pass                                                                                                                                            |
| M5  | Architecture             | `just archtest`                                                                                                                           | **exit 0.** Never diffed, never weakened, never suppressed                                                                                                                                                                           |
| M6  | Build                    | `just frontend-build` and `just build`                                                                                                    | exit 0                                                                                                                                                                                                                               |
| M7  | New code is tested       | manual, against the diff                                                                                                                  | every added or changed source file is touched by at least one test                                                                                                                                                                   |
| M8  | No placeholders added    | `git diff <sha>..HEAD`                                                                                                                    | the diff introduces no unfinished marker, no `TODO`, no no-op return standing in for logic                                                                                                                                           |
| M9  | Gate configs untouched   | `git diff --name-only <sha>..HEAD`                                                                                                        | no change to `.golangci.yml`, `frontend/eslint.config.js`, `frontend/eslint.architecture.config.js`, `frontend/scripts/archtest-allowlist.json`, `justfile`, `.github/`, `lefthook.yml` — or the change is named and justified below |
| M10 | Normative docs untouched | `git diff --name-only <sha>..HEAD -- docs/delivery/spec/ docs/delivery/architecture/`                                                     | empty. A needed change is a reconcile item, not a commit                                                                                                                                                                             |
| M11 | Descriptive docs current | manual                                                                                                                                    | P1-2 says Monaco-only before Phase 06 and preserves Phase 06 preview ownership                                                                                                                                                       |
| M12 | Generated assets current | `cd frontend && npm run build && git diff --exit-code -- src/logic/theme/generatedEditorThemes.ts src/logic/theme/generatedHighlight.css` | build produces no uncommitted derived asset change                                                                                                                                                                                   |

`just verify STORY-063` runs M1–M6, M9 and M10 and prints them as a pass/fail table against the baseline, naming the specific new finding or newly-failing test. M7, M8 and M11 are yours.

**M5 is not diffed** because architecture tests are the only mechanical thing standing between an implementer and a design decision nobody approved. Adding a file to `frontend/scripts/archtest-allowlist.json` is weakening the gate and is an M9 failure, not a fix.

**M9 exists** because the most convenient response to a failing gate is to loosen the gate.

### This story — generated from the rules above

| Rule                                              | Proven by                                                                               | Path                                               | Kind      | Must not                                                               |
| ------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------- | --------- | ---------------------------------------------------------------------- |
| `themes-and-appearance#theme-identity-is-stable`  | `resolvesAllThemeIdentityTokens`                                                        | `frontend/src/ui/styles/tokens.test.ts`            | unit      | assert CSS text; compute all 24 rows in every palette                  |
| `themes-and-appearance#two-syntax-palettes`       | `resolvesSyntaxTokensByAppearanceOnly`                                                  | `frontend/src/ui/styles/tokens.test.ts`            | unit      | assert CSS text; compute values in every palette                       |
| `themes-and-appearance#two-syntax-palettes`       | `generatesSharedFencedLanguageRules`                                                    | `frontend/scripts/generate-editor-themes.test.mjs` | Node unit | compare generated source text instead of values                        |
| `themes-and-appearance#editor-theme-is-generated` | `generatesSixCompleteTraceableMonacoThemes` and `rejectsIncompleteOrUntraceablePalette` | `frontend/scripts/generate-editor-themes.test.mjs` | Node unit | accept missing mappings or assert only a call occurred                 |
| `themes-and-appearance#editor-theme-is-generated` | `registersAndSwapsTheGeneratedRootTheme`                                                | `frontend/src/ui/components/monacoSetup.test.ts`   | unit      | source-scan or recreate/reseed an editor model                         |
| all, editor journey                               | `usesGeneratedThemesForAllSixPalettes`                                                  | `frontend/e2e/core-editor.test.ts`                 | e2e       | claim real Monaco rendering from the mock bridge; retain the live case |

Each test's first comment line carries `// Proves: <feature>#<anchor>` — for example `// Proves: opening-and-saving-files#crlf-is-preserved`. It is a convention for a human reading a failure. Nothing generates from it and nothing validates it.

### Walkthrough — a person does this on a real build

1. Run `just build`, launch the binary, and open Markdown containing a heading, link, quote, and fenced Go with a keyword, string, number and comment.
2. Choose Liquid Glass Light, Material Light, and Minimal Light. Markdown source and Go tokens use the same light syntax colours in each; background, gutter, cursor, selection, current line, widget, minimap, scrollbar and diagnostics use the selected palette.
3. Switch each to Dark. Syntax changes to dark values and Monaco swaps to `gme-<theme>-dark` with no reload, editor remount, caret jump, buffer flush, or browser-default white surface.
4. Open Find in Liquid Glass Dark. Its widget is dark and stroked; it must not be white. This is the deliberate find-widget boundary in the normative rule.
5. Disconnect the network, relaunch, and repeat Material-to-Minimal. Monaco still loads and restyles from bundled assets. The generated preview stylesheet exists but remains inactive; Phase 06 owns activating it and split-pane equality.

### Unblocks

STORY-064 can swap an already registered Monaco name when Auto changes the root attributes. STORY-065 can prove first paint and the six-palette matrix. Phase 06 receives the generated highlight stylesheet and shared `--hl-*` values, but still owns importing it into the renderer and proving split-pane equality.

### Scope

No Go package, Wails binding, Redux projection, settings persistence, `EditorView` buffer lifecycle, or preview renderer changes. If applying the palette appears to need one, stop: it would duplicate the root owner or pull Phase 06 preview activation into STORY-063.
