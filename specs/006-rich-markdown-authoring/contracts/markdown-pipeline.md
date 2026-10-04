# Contract: Markdown rendering pipeline

**Owner**: `frontend/src/logic/markdown/`. **Consumers**: `MarkdownView` (preview); the heading extractor's users
(preview anchors, fragment navigation in the editor); the tidy engine and the editor link provider (syntax set
only).

## Public surface

```ts
type MarkdownStandard = 'minimal' | 'gfm' | 'full';

// One factory per standard, memoised by standard. Returns the plugin lists react-markdown takes.
function createPipeline(standard: MarkdownStandard): {
    remarkPlugins: PluggableList;
    rehypePlugins: PluggableList;
};

// Syntax-only plugin list. Tidy and the editor link provider use 'full'; the preview gets it through createPipeline.
function syntaxPlugins(standard: MarkdownStandard): PluggableList;

// One heading model for preview ids and editor caret placement.
function extractHeadings(source: string): Heading[]; // Heading = { depth; text; slug; line }
function headingAnchor(headings: Heading[], slug: string): Heading | undefined;
```

`MarkdownView` receives `standard` as a prop (components under `ui/components` do not read the store) and is
memoised on `(source, standard)`. A theme change needs no re-parse: code and formula colours are CSS variables,
and diagrams redraw through the observer described under Mermaid.

## Plugin order (normative)

1. `remark-parse`
2. Syntax plugins by standard: gfm adds `remark-gfm` and `remark-frontmatter(['yaml'])`; full adds strict math,
   the container-only directive plugin (the container construct of `micromark-extension-directive`'s
   `directive().flow` with `mdast-util-directive`'s from-markdown) and the admonition rewriter. The rewriter
   is a remark step: it turns each `:::note`, `:::tip`, `:::important`, `:::warning` and `:::caution`
   container into the mdast shape of a GitHub alert, a `blockquote` whose first child is a paragraph holding
   only `[!KIND]`, followed by the container's children. It emits no element, class or `data` property, so
   sanitize sees an ordinary blockquote and the alert renderer (step 9) handles both spellings.
3. `remark-rehype` with `allowDangerousHtml: true`
4. `rehype-raw`
5. `rehypeSourceLines` (existing; adds `data-source-line` for synchronized scrolling)
6. `rehype-sanitize` with the schema below
7. render limits (in-repo rehype step, below)
8. heading ids (matched to extracted headings by start line)
9. alert renderer (GitHub alerts and rewritten admonitions alike); Full only
10. `rehype-katex`; Full only
11. `rehype-highlight`

The render-limits step walks the sanitized tree once in document order:

- Formulas (the `language-math` code elements of inline and display math): it counts them and replaces the
  1,001st and every later formula, and every formula whose source is longer than 10,000 characters, with a
  placeholder element carrying its reason (`too-many` or `too-large`). The component map renders the
  placeholder with the localized text, and KaTeX never sees the replaced formulas.
- Mermaid blocks (the `language-mermaid` code elements): it gives each one its 1-based document-order number
  as `data-mermaid-index`, so the Mermaid component knows whether the block is within the first 50.

Sanitize precedes steps 7 to 11 because the schema keeps only `language-*` classes on `code`; every step that
adds `hljs-*`, `katex-*` or `md-alert-*` classes or inline styles runs after it. Mermaid fences are rendered by
the component map (the `pre` around a `language-mermaid` code child is replaced, not nested), and
`rehype-highlight` gets `plainText: ['mermaid']`.

## Sanitization schema (one allowlist at every standard)

The schema is the current `baseGfmSanitizeSchema` (in `renderer.ts`, which it replaces): the `hast-util-sanitize`
default schema with `clobberPrefix: ''`, `img` limited to `alt` and `src`, `data-source-line` kept through
`withSourceLineAttributes`, and `file` added to the `href` protocols. Two lists change:

- `strip` (removed with their contents): `script`, `style`, `iframe`, `object`, `embed`, `form`, `noscript`,
  `template`, `textarea`, `select`, `button`, `svg`, `math`, `title`, `head`, `frame`, `applet`, `link`, `meta`,
  `base`, `audio`, `video`, `canvas`, `noembed`, `noframes`, `xmp`, `plaintext`, `dialog`, `portal`.
- `tagNames`: the raw-HTML elements of FR-RN-008 (`details`, `summary`, `kbd`, `sub`, `sup`, `mark`, `ins`, `del`,
  `br`, `abbr`, `img`, `a`) plus the elements Markdown generates before sanitize: `p`, `h1` to `h6`,
  `blockquote`, `ul`, `ol`, `li`, `pre`, `code`, `em`, `strong`, `hr`, `table`, `thead`, `tbody`, `tr`, `th`,
  `td`, `input` (disabled checkbox) and the footnote `section`. Every other element, including `div` and
  `span`, is unwrapped: its text and permitted descendants stay.

Consequences, all accepted by FR-RN-008:

- Raw HTML that spells an element in `tagNames` (such as `<p>`, `<h1>`, `<table>`, `<em>`) renders as that
  element, because the schema cannot tell it from Markdown output.
- Attributes are the default schema's list, which includes `id`. No `style`, no event handler, no author
  `class` other than the default schema's task-list, footnote and `language-*` values.
- `id` is kept without a prefix. Footnotes need this: `remark-rehype` already emits `user-content-` ids and
  matching links, and the default prefix would double them. A raw `id` written by the author (such as
  `<h2 id="setup">`) is therefore kept, and an in-document link can scroll to it.
- `javascript:` and `data:` addresses in any spelling (case, leading space, entity-encoded tab) are dropped.
  `file:` stays only so the link policy can refuse it visibly (`previewUrlTransform`, unchanged).
- A raw `<input>` and a raw `<section>` are in `tagNames` (Markdown generates the disabled task-list checkbox and the footnote section), so the schema cannot tell them from generated ones and they render as such; every other form control is stripped.
- Images keep the existing policy in `components.img` (`imagePolicy.ts`), unchanged by this feature.

## Syntax by standard

| Construct                                                                                  | minimal | gfm | full |
| ------------------------------------------------------------------------------------------ | :-----: | :-: | :--: |
| CommonMark, fenced code highlighting, Mermaid, raw-HTML allowlist                          |    ✓    |  ✓  |  ✓   |
| Tables, task lists (read-only), strikethrough, extended autolinks, footnotes               |         |  ✓  |  ✓   |
| YAML front matter (parsed, not shown)                                                      |         |  ✓  |  ✓   |
| Inline `$…$`, display `$$…$$`, ` ```math `                                                 |         |     |  ✓   |
| GitHub alerts `> [!KIND]`; `:::note`, `:::tip`, `:::important`, `:::warning`, `:::caution` |         |     |  ✓   |

At a lower standard a construct shows its source text, not an error. An unknown `:::name` at Full is literal
text (the container is replaced by a paragraph holding the source slice). Only container directives are
enabled; text and leaf directive syntax (`12:30`, `foo:bar`, `::x`) is never parsed.

## Math

- Stock `remark-math` 6 with `singleDollarTextMath: false` for `$$…$$` and ` ```math `, plus one in-repo
  micromark text construct on `$` that emits the same token names, so `mdast-util-math` is unchanged.
- Rule (FR-RN-005): open at `$` not followed by whitespace; close at the next `$` not preceded by whitespace and
  not followed by a digit; `\$` is a literal dollar; each opener looks ahead at most 10,000 characters. A
  formula longer than 10,000 characters (in practice a display formula) and every formula after the 1,000th
  show a placeholder from the render-limits step.
- Required unit cases: `$E=mc^2$`, `$5 and $10`, `\$5`, `$ x $`, `a$b$c`, `$$\n x \n$$`, a math fence,
  `$20,000 and $30,000`, `$x$5`, `cost $10$`, `$a \$ b$`, a code span with `$x$`, 32,000 unmatched openers
  parsed in linear time.
- KaTeX options: `trust: false`, `strict: 'ignore'`, `maxSize: 20`, `maxExpand: 200`, `output: 'html'`,
  `errorColor: 'var(--err)'` (a token string; KaTeX writes it into the error span's inline `color`); an invalid
  formula becomes `span.katex-error` holding the source. Fonts are woff2 only, bundled, with
  `assetsInlineLimit: 0`; no `data:` and no remote font.

## Mermaid

```ts
interface MermaidQueue {
    render(req: {
        source: string;
        theme: string;
        signal: AbortSignal;
    }): Promise<{ kind: 'svg'; svg: string } | { kind: 'error'; message: string } | { kind: 'aborted' }>;
}
```

- One promise chain; each job calls `initialize` with its own theme, then `render` with a fresh id
  (`gme-mmd-<n>`), and removes `#<id>` and `#d<id>` in `finally`. A job aborted before it starts returns
  `aborted` without work. Jobs with the same `theme + '\0' + source` share one promise; a least-recently-used
  cache of exactly 50 entries, keyed by `theme + '\0' + source`, holds the `svg` results.
- Config: `startOnLoad: false`, `securityLevel: 'strict'`, `htmlLabels: false`, `suppressErrorRendering: true`,
  `theme: 'base'` with `themeVariables` resolved from tokens to concrete colours, `maxTextSize: 50000`,
  `maxEdges: 500`, `logLevel: 'fatal'`, and a `secure` list that also protects `theme`, `themeVariables`,
  `themeCSS`, `look`, `layout`, `fontFamily`, `altFontFamily`, `fontSize`, `htmlLabels`, `flowchart`,
  `sequence`, `logLevel`, `deterministicIds`, `deterministicIDSeed`, `dompurifyConfig`, `handDrawnSeed`, `elk`,
  `darkMode`, `markdownAutoWrap`, `wrap` and the six keys `secure` guards by default.
- Output scrub before insertion: remove `script`, `foreignObject` (not produced with `htmlLabels: false`;
  removed if present), `img`, `image` and `use` elements; remove every attribute whose name starts with `on`;
  remove `href` and `xlink:href` from every `a` element whatever the value, so diagram links show without
  being activatable (a `#…` target included); on every other element remove `href` and `xlink:href` whose
  value does not start with `#`, which drops `javascript:`, `data:` and external addresses; remove `url(`
  values other than `url(#…)`. The diagram's own `style` element and presentation attributes stay.
- The component checks the source length (50,000) and its `data-mermaid-index` (at most 50, from the
  render-limits step) before queueing, and shows the localized placeholder when either bound is exceeded. A parse error shows an error box with the engine's message. The caller's
  abort signal discards stale results (source changed, component unmounted).
- Redraw: a `MutationObserver` on the `<html>` `data-theme` and `data-mode` attributes (the pattern of
  `monacoThemes.ts`) re-renders every mounted diagram within one second.
- The diagram wrapper keeps `data-source-line`, so synchronized scrolling re-measures after the SVG arrives.

## Code highlighting

- `rehype-highlight` 7, `lowlight` 3, highlight.js 11 with explicit languages: javascript, typescript, go,
  python, java, c, cpp, csharp, rust, ruby, php, kotlin, swift, sql, json, yaml, ini, xml, css, scss, bash,
  powershell, dockerfile, makefile, diff, markdown; aliases as in research R11.
- A fence with no language, an unknown language or more than 200,000 characters is plain monospaced text with
  no error.
- Colours: the theme generator (`frontend/scripts/generate-editor-themes-core.cjs`) writes
  `frontend/src/logic/theme/generatedHighlight.css` as unscoped `.hljs-*` rules whose values are the `--hl-*`
  token variables. `MarkdownView` imports it once. The tokens change with `data-theme` and `data-mode`, so
  the rules need no theme selector; the `[data-gme-highlight]` rules and their colour literals are removed.
  The editor uses the same `--hl-*` values through the generated Monaco themes (editor-highlighting contract).

## Heading anchors

- `github-slugger` semantics (FR-RN-014): lowercase; keep letters and combining marks of any script, digits,
  underscore and hyphen; a space becomes a hyphen; repeats get `-1`, `-2` in document order.
- Heading text comes from mdast with image alt and raw HTML excluded, before KaTeX runs. The preview assigns an
  `id` only to rendered headings whose start line matches an extracted heading; raw HTML headings and the
  footnote heading get no slug and keep the `id` they already carry, if any.
- Anchor scrolling searches only inside the preview container, never `document.getElementById`. When several
  elements carry the same id (a heading slug and a raw author id, or two raw ids), the first in document order
  wins.

## Failure behaviour and limits

- A formula or a diagram fails locally with an inline marker or an error box; the rest of the document renders.
- If the whole render throws, the preview keeps the last successful render of that document and shows an
  inline error.
- Parsing runs on the main thread. Measured at Full on synthetic table-rich text: about 1.2 s at 0.5 MiB,
  3 to 5 s at 1 MiB, 12 to 18 s at 2 MiB. The live-preview pause stays at 2 MiB, so below it one preview update
  of a large document can block the interface for seconds (spec edge case "Large documents"); SC-002 applies to
  documents up to 100 KB.
- No component here makes a network request. `tools/lint/bundle-scan.mjs` passes.

## Tests

- Unit (`frontend/tests/unit/markdown/`): the math cases above; the slug cases (`Über uns`, repeated `Notes`, Hindi, underscore); syntax by
  standard for every table row; the hostile raw-HTML set (every `strip` element, event handlers, `style`,
  `javascript:` and `data:` spellings, an unknown element unwrapped with its text); footnote links resolve;
  a raw `<p>` renders as a paragraph; anchor lookup stays inside the preview container; `:::warning` and
  `> [!WARNING]` with the same body render identical alert output; a fenced Go block of exactly 200,000
  characters is highlighted and one of 200,001 characters is plain monospaced text without an error.
- Render limits: with 1,001 formulas the first 1,000 render and the 1,001st shows the `too-many` placeholder;
  a display formula of 10,001 characters shows the `too-large` placeholder; with 51 Mermaid blocks the blocks
  numbered 1 to 50 queue and the 51st shows the too-many-diagrams placeholder, numbered in document order.
- Mermaid: queue abort, coalescing and cleanup; the cache holds at most 50 entries and evicts the least
  recently used; config `secure` blocks `%%{init}%%` theme changes; scrub removes `script`, `on*`
  attributes, `javascript:` and `data:` addresses, external references and activatable links while keeping
  the diagram's own styling; `click A href "https://…"` and `click A href "#x"` each yield an `a` element
  with no `href` or `xlink:href` (no activatable link); length placeholder.
- E2E: the reference document renders with zero literal constructs and zero outbound requests; theme switch
  redraws diagrams and recolours code in the six theme and mode combinations.
