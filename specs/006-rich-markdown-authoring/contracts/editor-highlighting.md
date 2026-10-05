# Contract: Editor highlighting, markers and links (Monaco)

**Owners**: `frontend/src/ui/components/monacoSetup.ts` (language registration and contributions),
`frontend/scripts/generate-editor-themes-core.cjs` (run by `generate-editor-themes.mjs`; theme rules and the
preview highlight stylesheet), and `CodeEditor.tsx` with `CodeEditorHandle` and `DocumentCommandAPI` (markers,
edits and navigation). Monaco is 0.52.2 (pinned); the setup stays lazy.

## Shared editor additions

Added once by the tidy slice and reused by the link and highlighting work:

- `CodeEditorHandle` and `DocumentCommandAPI` gain `setPosition` with `revealLineInCenter` (and focus) and
  `applyEdits(edits)` (one undo step, sharing the existing `applyEdit` with `replaceAll`). Each is guarded by
  the document id and session token like the existing commands. The problems list and the fragment request use
  `setPosition`; Format and Compact use `applyEdits`.
- `monacoSetup.ts` imports `contrib/hover/browser/hoverContribution` (marker hover) and
  `contrib/links/browser/links` (Cmd/Ctrl-click links).

## Languages

`monacoSetup.ts` imports the individual `basic-languages/<lang>/<lang>.contribution` files for JavaScript,
TypeScript, Go, Python, Java, C, C++, C#, Rust, Ruby, PHP, Kotlin, Swift, SQL, YAML, XML, HTML, CSS, SCSS,
PowerShell, Dockerfile, Shell and Markdown, and the existing `basic-languages/ini/ini.contribution`, whose
tokenizer serves TOML under the `toml` id. It never imports `basic-languages/monaco.contribution`.

Small in-repo Monarch grammars with conventional token names cover `mermaid`, `json`, `diff` and `makefile`. Aliases are registered as extra ids: `jsx`→javascript, `tsx`→typescript, `bash`, `zsh`,
`console`→shell, `md`→markdown, `cs`→csharp, `rs`→rust, `kt`→kotlin, `docker`→dockerfile, `patch`→diff, `make`,
`mk`→makefile, `toml`→ini. Backtick fences embed their language through the markdown grammar (`nextEmbedded`); `~~~lang`
fences are not embedded (Monaco behaviour) and stay uncoloured.

## Mermaid grammar

Separate token classes for: diagram-type keywords (`flowchart`, `graph`, `sequenceDiagram`, `classDiagram`,
`stateDiagram-v2`, `erDiagram`, `gantt`, `pie`, `mindmap`, `timeline`, `gitGraph`, `journey`, `quadrantChart`,
…); structural keywords (`subgraph`, `end`, `participant`, `actor`, `loop`, `alt`, `opt`, `par`, `note`,
`section`, `class`, `state`, `direction`, …); arrows and links (`-->`, `---`, `==>`, `-.->`, `->>`, `-->>`,
`--x` and label forms); quoted labels; `%%` comments including `%%{…}%%` directives. The grammar only colours a
directive; the preview never honours its theme.

## Colours

One palette, the `--hl-*` token variables in `ui/styles/tokens.css`, feeds both outputs of the generator:

- **Editor**: a generic rule table maps Monaco token prefixes to `--hl-*` families: `keyword`→keyword,
  `string`→string, `comment`→comment, `number`→number, `type`→type, `delimiter` and `operator`→punct,
  `annotation`, `attribute.name` and `tag`→attr, `predefined`→function. Monaco picks the longest matching
  prefix, so the existing markdown and Go rules keep precedence. Theme names
  (`gme-{glass,material,minimal}-{light,dark}`) and the runtime observer (`monacoThemes.ts`) are unchanged.
- **Preview**: `frontend/src/logic/theme/generatedHighlight.css` becomes unscoped `.hljs-*` rules whose values
  are `var(--hl-*)`, imported once by `MarkdownView` (markdown-pipeline contract). The `[data-gme-highlight]`
  selectors and their colour literals are removed.

Both change with the theme in all six theme and mode combinations. No colour literal is added outside the token
files, and no widget stylesheet selects on theme or mode.

## Markers and hover

- `setModelMarkers(model, 'gme-lint', markers)` for the first 1,000 findings in document order; severity from
  the finding; the message names the rule, severity and fix hint. Markers are cleared (`[]`) when another
  document becomes active or the document closes, together with the problems summary; returning to the
  document shows no markers until Lint runs again.
- Marker messages appear on hover through the hover contribution. The status-bar count stays exact beyond the
  cap.

## Links

A `registerLinkProvider('markdown', …)` supplies link ranges (inline, reference-style, autolink) from the parsed
model text (debounced). `registerLinkOpener` handles the click by calling the `onLinkActivate(href)` prop that
`CodeEditor` receives. `monacoSetup.ts` and `CodeEditor.tsx` import nothing from `app/`, the store, the adapter
or the action registry; the widget that renders the editor injects the handler, which runs `classifyLink` and
`openLink` (link-open contract). The modifier is Cmd on macOS and Ctrl on Windows and Linux.

## Constraints and tests

- Size: about 110 KB minified of language contributions in lazy chunks, a few KB of custom grammars, +264 KB for
  hover and +13 KB for links. Recorded at close against the baseline; no gate.
- Unit tests cannot run real Monarch tokenisation (the existing tests use a hand-written Monaco runtime);
  coloured tokens, markers, hover and Cmd/Ctrl-click are proven by real-app E2E in the six theme combinations.
- The generator test (`frontend/tests/unit/tooling/generateEditorThemes.test.ts`, synthetic palette as today)
  asserts the data the generator returns, not CSS text: for each of the six themes, `themes[name].rules` holds
  one rule per generic token prefix whose `foreground` is that theme's resolved `--hl-*` value, and the existing
  markdown and Go rules are still present; the preview highlight mapping it returns pairs each `.hljs-*` class
  with a `--hl-*` variable and holds no colour literal.
