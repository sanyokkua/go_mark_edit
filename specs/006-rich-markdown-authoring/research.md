# Research: Rich Markdown Authoring

**Feature**: `specs/006-rich-markdown-authoring` | **Date**: 2026-09-29

Evidence comes from reading the backend and frontend, the reference project `dev.tools`, and throwaway
prototypes run outside the repository (Node 24, Vite 7, Chromium). Prototype results are stated with the input
that produced them. Each entry is Decision, Rationale, Alternatives. No `NEEDS CLARIFICATION` remains; items
still to confirm during implementation are listed in R21.

## R1 — Where Format, Compact and Lint run

**Decision**: In the frontend, in a module Web Worker, on the same unified/remark parser and syntax set the
preview uses. Callers use one plain client function, `runTidy()`, that posts text and preferences to the worker
and returns edits or findings, with an abort signal and a progress callback. It acts on the active document only.

**Rationale**: One parser for preview and tidy; two parsers that disagree are worse than one slower engine. The
render-equivalence guard (R3) is only meaningful when it uses the parser that draws the preview. Only the active
document has a Monaco model (R17), which fits the active-only rule.

**Alternatives**:

- Go engine (goldmark): fast and cancellable, but a second parser whose edge cases differ from the preview's,
  and goldmark does not record emphasis-delimiter positions, which minimal-edit Format needs.
- Main thread: blocks the UI above about 1 MiB.

## R2 — Format by minimal source edits

**Decision**: Parse to mdast with offsets and emit non-overlapping `{from, to, text}` edits. Most rules change
one or two characters in place; table rows change only the whitespace around each cell.

**Rationale**: Measured on 1,113 real Markdown files (11.5 MiB) and 14 hand-written messy documents:

| Approach                      | Tree-equal after | Idempotent | Notes                           |
| ----------------------------- | ---------------- | ---------- | ------------------------------- |
| `remark-stringify` whole tree | 1,080 / 1,113    | not tested | rewrote breaks, code, numbering |
| Minimal edits from mdast      | 1,112 / 1,113    | 1,113      | code never touched              |

`remark-stringify` cannot keep line breaks, hard breaks, numbering style, destinations and code without custom
handlers for most node types, and raw-slice handlers break inside blockquotes and lists. ADR-0038 records this
and supersedes ADR-0031 (R20).

Rules the prototype settled:

- Bullet: replace the character at the item's start offset; adjacent lists alternate the marker so they stay
  two lists.
- Emphasis and strong: replace delimiters at the node's start and end. `_` only when the characters outside
  both delimiters are whitespace, punctuation or the edge (as `micromark-util-classify-character`); otherwise
  `*` stays. Nested delimiters must not merge (`_*x*_` becomes `*_x_*`). `__` becomes `**`.
- ATX to Setext for levels 1 and 2 only, when re-parsing content plus underline gives one heading of that
  depth; underline `max(3, width)`. Setext to ATX for single-line content only.
- Tables: split rows on unescaped `|`, check cell count against mdast, pad by East Asian display width, never
  pad rows to the header width (that changes the parse).
- Blank lines, trailing whitespace, final newline: one line pass with protected ranges from `code`, `html`,
  `math`, `yaml` and multi-line `inlineCode`; hard breaks from `break` nodes.
- Format does not re-indent nested lists; Lint may report indentation Format leaves.

**Alternatives**: whole-tree stringify (above); stringify for tables only (unneeded); Prettier at runtime (a
development tool; its Markdown options do not match the house style).

## R3 — Render-equivalence guard

**Decision**: Apply the edits to a copy, parse it with the same plugins, and compare both mdast trees with
positions removed and adjacent text nodes merged. Any difference returns `refused` and changes nothing
(FR-TD-007). Chunks without edits are not re-parsed.

**Rationale**: Equal mdast means equal rendering unless a plugin reads positions. The comparison costs about
11 ms per MiB; the second parse costs about 0.9 s per MiB. One real file of 1,113 failed the guard (a blank
line before `> 4. Run` changes an ordered list that interrupts a paragraph); refusal is the specified outcome.

**Alternatives**: comparing hast (about 50 ms per MiB more, no extra safety); no guard (FR-TD-007 requires
it); repairing only diverging blocks (FR-TD-007 refuses the whole document).

## R4 — Parse cost, chunking, cancellation

**Decision**: Parse a document of up to 256 KiB as one chunk. Split a larger document at column-0 ATX headings
that follow a blank line and lie outside front matter, HTML blocks, HTML comments, `$$` blocks and backtick or
tilde fences, so no chunk boundary falls inside one of those constructs. Parse and edit chunk by chunk, post
progress per chunk, and cancel by terminating the worker; the next run starts a fresh worker. A chunk that
fails the render-equivalence guard (R3) refuses the whole run.

**Rationale**: The parser is superlinear on lists and tables: 1 MiB of real text parses in 1.0 s, 3 MiB in
5.3 s, 10 MiB in 32 s (peak 2.1 GB). Chunking cut 10 MiB to 6.5 s and 608 MB. Synthetic worst cases stay slow
(512 KiB of nested lists 22 s; one 8k-row table 23 s), so progress and Cancel are required, also for a
document below 1 MiB whose run lasts longer than one second (R6). At the measured 1.0 s per MiB of real text,
256 KiB parses in about a quarter of a second, so smaller documents gain little from splitting. Parsing is
synchronous, so `worker.terminate()` is the only cancellation. Vite already emits a module worker for Monaco
(`worker.format: 'es'`); the known Wails issue concerns Service Workers, not dedicated workers.

**Alternatives**: whole-document parse (memory and time above); a backend engine (R1).

## R5 — Lint is in-house and shares predicates with Format

**Decision**: Implement the ten rules of FR-TD-010 over the same mdast and the same predicates Format uses
(marker classification, intraword and adjacency exemptions, protected ranges). `markdownlint` 0.41 stays a
test-time oracle only.

**Rationale**: Format followed by Lint must be consistent; the prototype still reported 13 emphasis, 37 heading
and 1 strong findings after Format because Lint lacked Format's exemptions. `markdownlint` has its own parser,
reports MD049/MD050 twice per node and flags every extra blank line where the spec wants one finding per run.

**Alternatives**: `markdownlint` at runtime (drift, double counting).

## R6 — Operation slot

**Decision**: One frontend store per window outside Redux (subscribe/getSnapshot, read with
`useSyncExternalStore`). Every Format, Compact and Lint run acquires it; `acquire(kind)` is refused while a run
holds it and returns a handle with an abort signal, a progress setter and an idempotent `release()`. While it is
held, all three actions are disabled apart from the running action's Cancel; progress and Cancel show when the
document is larger than 1 MiB, or once the run has lasted longer than one second. A run ends with exactly one
outcome: `done`, `cancelled`, `refused`, `failed` or `stale`. The run records the document id and the text version it started from; a result that arrives after that text
changed or after another document became active is `stale`, is discarded, and shows the `tidy-stale` notice
(FR-TD-015). ADR-0039 records this and refines ADR-0032.

**Rationale**: No slot exists: `internal/gate` was an unused single-flight flag deleted in feature 004 (commit
`c91685f`); ADR-0032's run registry and the bridge's progress and cancel events were never built, and the bridge
emits only `state:patch`, `state:error` and `application:close-requested`. The engine runs in the frontend, so
the slot is there; its state is ephemeral UI state, not application state.

**Alternatives**: backend run registry with progress and cancel commands (large scope, mirrors frontend state
only); holding the slot only above 1 MiB (two exclusion rules, and short runs could overlap long ones); showing
Cancel by size alone (512 KiB of nested lists runs for about 22 s with no way to stop it, R4).

## R7 — Preview pipeline, standards and the raw-HTML policy

**Decision**: `createPipeline(standard)` builds the preview pipeline.

| Standard | Adds to CommonMark                                                                                     |
| -------- | ------------------------------------------------------------------------------------------------------ |
| Minimal  | nothing (fence highlighting, Mermaid and the raw-HTML policy apply at every standard)                  |
| GFM      | `remark-gfm` (tables, task lists, strikethrough, autolinks, footnotes) and `remark-frontmatter` (yaml) |
| Full     | strict math, container directives limited to the five admonition names, GitHub alerts                  |

Order: remark-parse, syntax plugins, `remark-rehype({allowDangerousHtml: true})`, `rehype-raw`,
`rehypeSourceLines`, `rehype-sanitize(schema)`, render limits, heading ids, alerts (Full only), KaTeX (Full only),
highlight. The render-limits step
replaces the 1,001st and later formulas and formulas over 10,000 characters with a placeholder before KaTeX
runs, and numbers Mermaid blocks in document order so the component can stop at 50 (FR-RN-012). Mermaid is
handled by the component map.

The schema extends the current `baseGfmSanitizeSchema` and keeps its behaviour: `clobberPrefix: ''`, `id`
allowed, the source-line attributes, and `file:` kept on `href` so the link policy can refuse it visibly.
Added: `strip` = the removed-with-contents set of FR-RN-008 (script, style, iframe, object, embed, form,
noscript, template, textarea, select, button, svg, math, title, head, frame, applet, link, meta, base, audio,
video, canvas, noembed, noframes, xmp, plaintext, dialog, portal); `tagNames` = the FR-RN-008 raw allowlist plus the element kinds Markdown itself generates.
`div` and `span` are not listed: the wrappers the preview adds (alerts, KaTeX, highlight spans) are added after
sanitize.

Because generated and raw elements share one schema after `rehype-raw`, raw HTML for an ordinary Markdown
element kind (`<p>`, `<table>`, `<h1>`, `<em>` and so on) renders as its Markdown equivalent, which is what
FR-RN-008 states. A raw `id` is kept as written (for example `<h2 id="app-root">`); the preview never assigns a
slug to such a heading (R10), and anchor scrolling looks up ids inside the preview container only, so a raw id
cannot move the application's own elements.

**Rationale**: Sanitize must run before anything that adds classes or inline styles, because the schema
restricts `code` classes to `language-*` and would strip `hljs-*` and `katex-*`. Verified hostile cases
(script, style, iframe, object, embed, form, svg, math, base, link, meta, a noscript mXSS payload, `javascript:`
in three spellings, `data:` images, event handlers) all vanish; unknown elements unwrap and keep their text.
`rehype-sanitize` 6 (`hast-util-sanitize` 5.0.2) removes `strip` elements with their contents and unwraps every
other element outside `tagNames`. Footnotes prototype: remark-rehype already emits `user-content-` ids and
hrefs; with `clobberPrefix: ''` the ids are kept and footnote links resolve, the default prefix doubles the ids
(links break), and removing `id` breaks footnotes. An `<img>` with an http(s) `src` passes the sanitizer and is
neutralised by the existing image policy, which this feature does not change.

**Alternatives**: react-markdown without `rehype-raw` (raw HTML shows as escaped text); `skipHtml` (drops only
the html node and leaves visible `alert(1)` for `<script>alert(1)</script>`); DOMPurify on a string (a second
sanitizer); a separate schema for raw HTML (not separable after `rehype-raw`).

## R8 — Math

**Decision**: `remark-math` 6 with `singleDollarTextMath: false` (keeps `$$…$$` and ` ```math `) plus one
in-repo micromark text construct on `$` that emits the same token names (`mathText`, `mathTextSequence`,
`mathTextData`, `lineEnding`), so `mdast-util-math` and `rehype-katex` are unchanged. Each opener looks ahead at
most 10,000 characters for its closer (FR-RN-005), verified by a unit test with 32k openers.

**Rationale**: With the default, `It costs $5 and $10 per month` becomes math and `$ x $` becomes math; with
`singleDollarTextMath: false`, `$E=mc^2$` is lost. `micromark-extension-math` hides its constructs behind its
exports map. Prototype results match FR-RN-005: `$E=mc^2$` math; `$5 and $10` literal; `\$5` literal `$5`;
`$ x $` literal; `a$b$c` math `b`; `$$\n x \n$$` display; ` ```math ` display; `$20,000 and $30,000` literal;
`$x$5` literal; `cost $10$` math `10`; `$a \$ b$` math `a \$ b`; `` `$x$` `` code; `$a\n+b$` multi-line math.
The unbounded prototype was quadratic (32k `$x ` took 35 s; 32k `costs $5 and ` 156 s); the bound makes it
linear.

KaTeX 0.16: `trust: false`, `strict: 'ignore'` (the default `warn` prints to the console), `maxSize: 20`,
`maxExpand: 200`, `output: 'html'`, `errorColor: 'var(--err)'` (KaTeX writes it into an inline `color` style, so the token
variable resolves with the theme). Parse errors become `span.katex-error` with the
source inside (display-mode errors need CSS); macro bombs fail with "Too many expansions"; `\href` and
`\includegraphics` render as red command text. KaTeX output carries inline `style` and runs after sanitize.

Assets: a Vite `transform` on `katex.min.css` removes the woff and ttf fallbacks, leaving 20 woff2 files
(259,792 B) and 21,781 B of CSS; `assetsInlineLimit: 0` keeps fonts out of `data:` URIs. KaTeX JavaScript is
261 KB (78 KB gzip).

**Alternatives**: aborting an opener at a whitespace-preceded `$` (changes the FR-RN-005 result for
`$5.00 and $x$`); stock `remark-math` alone (fails FR-RN-005).

## R9 — Alerts, container directives, front matter

**Decision**: GitHub alerts through one in-repo rehype step after sanitize (`> [!NOTE|TIP|IMPORTANT|WARNING|
CAUTION]`, marker alone on its line, case-insensitive) producing
`div.md-alert.md-alert-<kind>[role=note] > p.md-alert-title`. Container directives use only the container construct of
`micromark-extension-directive` 4 (the `concrete: true` entry of `directive().flow[58]`, the list registered on
`:`; the package exports only `directive` and `directiveHtml`) with `mdast-util-directive`'s from-markdown. A
remark step rewrites each of the five names into the GitHub-alert mdast shape (a `blockquote` whose first child
is a paragraph holding only `[!KIND]`, followed by the container's children), so the one alert step renders
both; any other name becomes a paragraph holding the source slice.
Front matter: `remark-frontmatter(['yaml'])`; only `---` on line 1 counts, and it renders nothing.

**Rationale**: the complete `directive()` extension cannot be limited by options, and its text and leaf directives corrupt prose
(`12:30`, `foo:bar`, `Note:this` became empty `textDirective` nodes). Known limits: `:::tip[Title]` drops the
label; an unclosed `:::note` runs to the end of its container.

**Alternatives**: `remark-github-blockquote-alert` (emits SVG the sanitizer strips); `rehype-github-alerts`
(pulls in `@primer/octicons`).

## R10 — Heading anchors

**Decision**: `github-slugger` 2.0.0 inside one remark step that records `{depth, text, slug, line}` from mdast,
and a rehype step that assigns `id` only to `h1`–`h6` whose line matches a recorded heading. The editor uses the
same extractor for caret placement.

**Rationale**: `Über uns` gives `über-uns`; `Notes` three times gives `notes`, `notes-1`, `notes-2`;
`Hello_World` keeps the underscore; CJK and Cyrillic survive; Hindi and Thai vowel signs (combining marks) are
kept, as FR-RN-014 requires. Precautions found by testing: convert heading text with
`includeImageAlt: false, includeHtml: false`; slug before KaTeX; never slug hast headings without an mdast
counterpart (raw `<h2>` and the footnote `<h2 class="sr-only">` would shift the duplicate counter).

**Alternatives**: `rehype-slug` (works on hast, so it sees raw and footnote headings); a literal `\p{L}\p{N}`
filter (turns `हिंदी शीर्षक` into `हद-शरषक`).

## R11 — Code highlighting in the preview

**Decision**: `rehype-highlight` 7 with `lowlight` 3 and highlight.js 11 with an explicit set of 26 grammars:
javascript, typescript, go, python, java, c, cpp, csharp, rust, ruby, php, kotlin, swift, sql, json, yaml, ini
(TOML), xml (HTML), css, scss, bash, powershell, dockerfile, makefile, diff, markdown. Aliases: `jsx`/`tsx` to
JS/TS, `sh`/`shell`/`zsh`/`console` to bash, `toml` to ini, `html` to xml, plus `md`, `cs`, `rs`, `kt`,
`docker`, `patch`, `make`, `jsonc`, `sass`. `plainText: ['mermaid']`. Colours come from the shared palette
(R13).

**Rationale**: `common` (37 languages) lacks powershell and dockerfile, and its `shell` is "Shell Session"
transcripts. Sizes (minified, gzip): base 12 KB; the 26-grammar set 55.8 KB; `common` 76.8 KB; `all` 359.5 KB.
An unknown or absent language gets plain text and a `file.message`, no exception.

**Alternatives**: Shiki (339 KB gzip for the same set, needs a WASM or weaker regex engine, inline `style`
output).

## R12 — Mermaid

**Decision**: Mermaid 11 (tested 11.17.2), lazily imported, rendered through one serial application queue.
Config: `startOnLoad: false`, `securityLevel: 'strict'`, `htmlLabels: false`, `suppressErrorRendering: true`,
`theme: 'base'` with `themeVariables` resolved to concrete colours, `maxTextSize: 50000`, `maxEdges: 500`,
`logLevel: 'fatal'`, and `secure` extended with `theme`, `themeVariables`, `themeCSS`, `look`, `layout`,
`fontFamily`, `altFontFamily`, `fontSize`, `htmlLabels`, `flowchart`, `sequence`, `logLevel`,
`deterministicIds`, `deterministicIDSeed`, `dompurifyConfig`, `handDrawnSeed`, `elk`, `darkMode`,
`markdownAutoWrap`, `wrap` plus the six keys `secure` protects by default (passing `secure` replaces the
list). A post-scrub removes `script`, `foreignObject`, `img`, `image` and `use` elements, every `on*`
attribute, every `href` and `xlink:href` on an `a` element whatever its value (so no diagram link is
activatable, including `#…` targets), every `href` and `xlink:href` on other elements other than `#…` (which
drops `javascript:`, `data:` and external addresses) and every `url(` other than `url(#…)`, and keeps the
diagram's own styling (FR-RN-010).

**Rationale** (each verified in Chromium):

- The default config lets a diagram change the theme via `%%{init}%%` or front matter, and lets `themeCSS`
  inject `url(https://…)` that the webview requests; the extended `secure` list blocks it.
- `strict` fired 0 of 2 click callbacks, but `click A href "https://…"` still yields an `<a>`, hence the
  post-scrub (FR-RN-010). `htmlLabels: true` let a label `<img src="https://…">` through and Chromium fetched it.
- `themeVariables` throw for `var(--x)`, `oklch()` and `color-mix()`; colours are resolved from the design
  tokens through a probe element and converted to rgb.
- Configuration is global and a queued render picks up a later `initialize()`, so each job runs `initialize`
  and `render` together inside the application's queue. Abort skips queued jobs and discards late results;
  results are cached by `theme + '\0' + source` in a least-recently-used cache of exactly 50 entries; one retry after a failed dynamic import. A
  running render cannot be cancelled.
- Failed renders leave `div#d<id>` in `document.body`; a `finally` removes `#id` and `#d<id>`. `maxTextSize`
  renders a placeholder diagram instead of throwing, so length is checked first.
- All 12 required diagram types render. Lazy `import('mermaid')` loads `mermaid.core` (683 KB raw, 169 KB gz)
  first; the full set is 61 chunks, 3.4 MB raw, 974 KB gz. A 300-edge flowchart rendered in 1.5 s. Fonts use a
  system stack; no request is made.
- The webview sets no Content-Security-Policy, so sanitization and the post-scrub are the defence; adding a CSP
  is out of scope.

`dev.tools` is a behaviour reference only: it shows the lazy import, `parse` then `render`, a stale-result
flag and a 400 ms debounce; its lack of theme redraw, fixed ids, missing cleanup, `<pre>` nesting, missing
`secure` config and CDN-loaded Monaco are not copied.

**Alternatives**: `securityLevel: 'loose'` (fired click callbacks); `htmlLabels: true` (let a remote image
through).

## R13 — Monaco highlighting, markers, hover, links

**Decision** (Monaco 0.52.2, ESM, lazy `monacoSetup.ts`):

- Register a `mermaid` language with a Monarch grammar; the markdown grammar already embeds ` ```lang ` fences,
  so registering the id is enough. `~~~lang` fences do not embed.
- Import individual basic-language `*.contribution` files (JavaScript, TypeScript, Go, Python, Java, C, C++,
  C#, Rust, Ruby, PHP, Kotlin, Swift, SQL, YAML, XML, HTML, CSS, SCSS, PowerShell, Dockerfile, Markdown, Shell),
  never `basic-languages/monaco.contribution`. TOML uses the existing `ini` contribution
  (`basic-languages/ini`), registered for the `toml` id. JSON, diff and Makefile get small custom Monarch grammars
  (JSON's real mode needs a worker). Aliases re-register ids (`jsx`, `tsx`, `bash`, `zsh`, `console`, `md`,
  `cs`, `rs`, `kt`, `docker`, `patch`, `make`, `mk`, `toml`).
- One palette for editor and preview. The generator `frontend/scripts/generate-editor-themes-core.cjs` (run by
  `frontend/scripts/generate-editor-themes.mjs`) gains a generic table mapping token prefixes (`keyword`,
  `string`, `comment`, `number`, `type`, `delimiter`/`operator`, `annotation`, `attribute.name`/`tag`,
  `predefined`) to the existing `--hl-*` tokens; Monaco picks the longest prefix, so the existing markdown and Go
  rules keep winning. For the preview, the generator emits unscoped `.hljs-*` rules coloured by the same `--hl-*`
  tokens into `generatedHighlight.css`, which the preview imports once. No new CSS variables; the generator's
  test is extended.
- Markers: `setModelMarkers(model, 'gme-lint', markers)`; hover needs `contrib/hover/browser/hoverContribution`
  (+264 KB minified). Squiggles use the existing `editorError`/`editorWarning` colours.
- Editor links: `contrib/links/browser/links` (+13 KB) with `registerLinkProvider('markdown', …)` supplying
  ranges from the parsed document and `registerLinkOpener` routing the click, so the default opener is never
  reached.
- Navigation: `setPosition`, `revealLineInCenter` and `focus` are core; `CodeEditorHandle` and
  `DocumentCommandAPI` expose none of them today.

**Rationale**: Today the generator has rules only for markdown and Go, and Go is not registered, so fenced Go is
uncoloured. `generatedHighlight.css` exists with `[data-gme-highlight='…'] .hljs-*` selectors, but nothing
imports it and nothing sets `data-gme-highlight`; `MarkdownView.module.css` sets only `--code-fg`. Unscoped
rules over the themed `--hl-*` tokens follow theme and mode changes with no attribute to maintain.

**Alternatives**: setting `data-gme-highlight` from the theme observer (a second theme signal to keep in step);
all basic languages (size); Monaco's JSON language service (worker).

## R14 — Link resolution and the folder tree

**Decision**: The backend stays the resolver. `OpenPreviewLink` (`internal/appmodel/preview_link.go`) drops the
folder containment check (the D11 limit) and gains a pure path helper in `internal/file/paths.go` that decodes
POSIX spellings and, on Windows, back-slash and drive-letter spellings (on POSIX a `\` or a drive prefix is
ordinary file-name text, so such a target usually ends as `not-found`), and refuses UNC paths with either slash
(`//host/x`, `\\host\x`) and device-namespace paths (`\\?\`, `\\.\`) on every platform before any read. A
supported target goes to the existing `OpenPath`; an existing regular file with another suffix is refused with
`RevealPath` set; every other condition (missing, folder, unreadable, over 50 MiB, 40 documents) gets the
classification Open gives for it. An untitled source refuses only relative targets (today it refuses every
target). `OpenResult` gains `RevealPath` and `TreePath`; the existing `Path` field keeps
its current meaning.

On `opened` and `focused`, `TreePath` comes from a small lookup function over the in-memory workspace snapshot
(`service.state.workspace`), next to the existing workspace code: when a folder is open and `filepath.Rel` from
the resolved root to the resolved target stays inside the root, the function walks the snapshot along that
relative path and returns the matching node's path, or empty. A segment that differs only in capitalisation
matches when both files have the same `file.Identity`, the identity Open already uses to focus an existing tab; on
a case-sensitive filesystem the identities differ, so no row matches (FR-LK-005). `file.Identity`
(`internal/file/paths.go`) is the device and inode pair where the platform's file information exposes one and
otherwise the `path:` string of the canonical path; that fallback never matches a case-only difference, so a
case-only segment matches only through the device-and-inode identity of the two files. Targets the tree does not list
(dot-files, hidden folders not shown, symbolic links, unsupported suffixes, truncation at 20,000 entries) yield
empty, and the document still opens (FR-LK-006).

**Rationale**: The tree snapshot is built eagerly, whole, with absolute paths from the resolved root, so the
backend can answer "inside the folder and has a row" without an event; no backend path-to-node lookup exists
today (only the frontend `findNode` in `WorkspaceTree.tsx`), and `createWorkspaceEntry` already checks
containment with `CanonicalizeDirectoryPath` plus `filepath.Rel`. Symbolic-link and case rules cannot be
evaluated in the frontend. Today a backslash UNC path is not refused on POSIX (only `//` and a colon before the
first slash are), so one rule on every platform removes that gap. `RevealWorkspacePath` (handler.go) is not
workspace-restricted and only stats the path, so it serves the reveal action; the notification intent
`reveal-workspace-path` is a no-op today and is wired. The fragment stays in the frontend. An absolute path never
appears in a classified error (`SafeSubject` is a basename; for a refused link the resolver sets it to the
target's basename, so the notice names the file); `RevealPath` and `TreePath` are result fields shown
only to the user who followed the link and are never logged.

**Alternatives**: frontend containment check (cannot see symbolic links or case rules); a backend tree-reveal
event (nothing else needs it); a classified remediation `reveal` on `unsupported-input` (extends the finite
remediation vocabulary for one message); refusing backslash UNC only on Windows (two rules for one input).

## R15 — Activating the target document

**Decision**: One `openLink()` in `useCommands` that follows Open and Reopen: `flushActiveDocument()`,
`activation.begin()`, `openPreviewLink`, `activation.acknowledge(activeBuffer)`, tab reveal, tree reveal,
pending fragment. The preview and the editor both call it. Tree reveal is a `{documentId, path, seq}` request
like `tabRevealRequest`, consumed when that document becomes active; `WorkspaceTree` expands the ancestors in its local state, selects the row and scrolls it
into view.

**Rationale**: `PreviewPane.tsx:253-272` calls `adapter.openPreviewLink` directly, never flushes, never
acknowledges the activation and handles only `focused`; the store's `activeDocumentId` moves but the editor keeps
the old buffer. `OpenResult.ActiveBuffer` is already filled. The tree has no scroll or reveal code today.

**Alternatives**: lifting tree expansion state into the store (wider change for one request).

## R16 — Settings defaults and wiring

**Decision**: The backend `DefaultSettings()` is the one definition of the defaults: Full, `-`, `_`, ATX, Format
on save off, Lint on save on. Changes:

- `internal/settings/model.go:53`: `Standard` default `MarkdownGFM` becomes Full.
- `frontend/src/logic/store/settingsSlice.ts:12-19`: the markdown defaults (`gfm`, emphasis `*`, Lint on save
  off) are removed; the slice holds no markdown value until `hydrated` is true.
- Fallbacks in `ui/widgets/Menubar/SettingsMenu.tsx:227` (`?? 'gfm'`), `:241` (`?? false`), `:248` (`?? true`)
  and `ui/components/StatusBar/StatusBar.tsx:61` (`?? 'gfm'`) are removed.
- The preview header's fixed `editor.preview.flavour` "GFM" (`EditorStage.tsx:292`, `en.json:57`) shows the
  stored standard.
- `status.markdownStandard.minimal` and `.full` keys are added and the unused `.commonmark` key is removed
  (only `gfm` and `commonmark` exist, and `t()` returns the raw key when one is missing).
- Before hydration the preview header and the status bar show no standard; the Markdown settings rows (popup
  and dialog group), Format, Compact, Lint and the toolbar actions that use the bullet or emphasis marker are
  unavailable; the preview body renders nothing (loading state); and no `updateMarkdown` write is issued, so a
  write never merges into an unloaded group (FR-ST-002).
- `formatMarkers()` (maps every value other than `_` to `*`) carries the heading style and the `+` bullet.
- The compact settings popup rows and the new Settings group call the same settings command.

**Rationale**: `settings` is a typed KV group; a missing or invalid key reads as the default, so the new default
needs no migration. No current UI writes the markdown keys (the rows are deferred), so no user has stored `gfm`
by choice. Frontend defaults that differ from the backend's (today emphasis `*` and Lint off) would show wrong
values before hydration; hiding the standard until hydration avoids a flash of a wrong value.

**Alternatives**: keeping frontend defaults in step with the backend (two definitions); a data migration
(nothing to migrate).

## R17 — On-save behaviour

**Decision**: In `useDocumentWrites.ts`, before `flushActiveSession`, for explicit saves only (Save, Save As, the
Save choice of a close or quit prompt): when Format on save is on, the target is the active document and the
operation slot is free, run Format and apply it as one undo step, then flush and save; otherwise save the
current text and show the formatting-skipped notice with the reason (FR-ST-005). After an explicit save of the
active document succeeds, run Lint when Lint on save is on. Autosave is backend-driven and triggers neither.

**Rationale**: The save path already distinguishes explicit and autosave origins (`SaveOrigin`), and the close
plan validates each target's content revision (`close_plan.go`), so text must not change inside a backend
`Save`; formatting before the flush keeps Monaco and backend in step.

**Alternatives**: formatting in the backend during save (second engine, R1); formatting non-active documents
(they have no Monaco model and no undo history to receive one undo step).

## R18 — Availability and surfaces of the three actions

**Decision**: Format and Compact are disabled while the document is read-only (tooltip says so) or the slot is
held; Lint is available for any open document when the slot is free. Each action appears on the toolbar, in the
editor context menu, in a new Format menu group and on its shortcut; the command palette is out of scope. The
registry entries lose `deferred` and gain per-action gating.

**Rationale**: `actionDispatcher.ts:193-201` blocks every `document`-scope action unless the projected capability
is writable, and `deferred` actions are unavailable, so Lint needs its own gate. The deferral is also hard-coded
outside the registry: `FormattingToolbar.tsx` (`deferredActions`), `EditorContextMenu.tsx`
(`kind === 'deferred'`) and `useEditorActionExecutor.ts` (`deferredEditorShortcutIds`, `formatActionIds`). The
menu bar has only File, Settings, View and About, so the Format group is new; Lint has no context-menu entry
today.

**Alternatives**: keeping the dispatcher's writable gate for Lint (contradicts FR-TD-016).

## R19 — Offline evidence and existing tests

**Decision**: Add a Playwright request guard (`page.on('request')`, allow only the app origin) to the
reference-document journey, as a helper under `frontend/tests/support/`. Keep `tools/lint/bundle-scan.mjs` and
the jsdom test that spies on `fetch`, `XMLHttpRequest`, `WebSocket` and element `src` setters, extended to the new
renderers. Rewrite the existing tests the design invalidates in the change that invalidates them:

- `frontend/tests/unit/markdown/renderer.test.ts`: the source-text checks (absence of `rehypeRaw` and
  `remarkMath`, presence of `skipHtml`) become behaviour assertions; EC-RENDER-6 expects `$x^2$` literal at the
  default standard, which becomes Full; the 2 MiB timing test (8 s limit) imports the `baseGfm*` exports that
  move into `createPipeline` and meets the higher Full cost (R22); the production-build test allows one `fetch(`
  per emitted `.js`, while KaTeX has a method named `fetch` and Mermaid adds chunks.
- `tests/go/integration/application/preview_link_test.go`: asserts the folder-limit refusals (outside folder,
  symbolic-link escape).
- `frontend/tests/unit/markdown/linkPolicy.test.ts`: asserts the `outside-document-folder` and
  `unsupported-extension` refusals.
- `frontend/tests/e2e/preview-links.test.ts`: asserts the refusal and that the source document stays active.
- `tests/go/integration/settings/repository_sqlite_test.go` (empty registry): expects `MarkdownGFM` as the
  default.
- Frontend settings tests (`settingsSlice`, `settingsProjection`, `statusBar`): assert the slice defaults or the
  `gfm` fallback.
- Deferral tests (`actionRegistry`, `formattingToolbar.legacy`, `menubar.settings.legacy`, E2E
  `deferred-controls.test.ts`): assert that Format, Compact, Lint or the on-save rows are deferred.

**Rationale**: No E2E test observes requests today; the only request listener is ad hoc in
`preview-images.test.ts` and records one host. E2E runs real-backend Chromium journeys. The Linux push workflow (`.github/workflows/push.yml`) runs
`scripts/verify --skip e2e`; the macOS release workflow (`.github/workflows/release.yml`) runs the full
`scripts/verify` after `scripts/build setup --with-browser`, E2E included. E2E performance was measured only on
macOS arm64, and E2E on Linux is unverified, so packaged-webview behaviour is checked in the real application
(quickstart). Constitution VII forbids tests that assert source text.

**Alternatives**: a network-level block in the harness (hides requests instead of reporting them).

## R20 — Governance

1. **Constitution amendment proposal (Principle IV), version 2.1.2 to 2.2.0 (MINOR: material expansion).**
    - Affected principle: IV, Offline, Private, and Safe by Default; sentence on preview links.
    - Current text: a preview link "opens only in-document anchors, local Markdown inside the document's folder
      and `https`/`http` targets, and visibly refuses every other target".
    - Proposed text: a preview link "opens only in-document anchors, supported local Markdown documents
      anywhere on the local disk (never network or device paths; unsupported files are refused with an offer to
      reveal them in the file manager), and `https`/`http` targets, and visibly refuses every other target".
    - Reason: US3 and US4 (FR-LK-001, FR-LK-007, FR-LK-010, FR-LK-014); the owner decided links open supported
      documents anywhere on the local disk.
    - Migration impact: `preview_link.go` loses the folder containment check; the link classifier loses the
      folder and suffix refusals; tests in R19 are rewritten; ADR-0037 records the change to D11. Stored data is
      unaffected.
    - Nothing dropped: the one shared link handler, the `https`/`http` rule, visible refusal of every other
      target, and offline operation stay; network and device paths remain refused on every platform; no other
      program is launched for a file.
    - Procedure: approval precedes the edit; the edit updates the Sync Impact Report, version and amendment date.
2. **Architecture decisions** (next free ids ADR-0036 onward; no new D-numbers):
    - ADR-0036: one raw-HTML policy at every standard (supersedes ADR-0030).
    - ADR-0037: links open supported documents anywhere on the local disk; unsupported files are refused with
      "Reveal in file manager" (records the change to D11, the architecture section "Links, files and images",
      and spec 004 FR-014).
    - ADR-0038: minimal-edit Format with a render-equivalence guard (supersedes ADR-0031).
    - ADR-0039: per-window frontend operation slot; the backend run registry stays unbuilt (refines ADR-0032).
3. **Repository documentation rules**: the ADR rows added to `docs/architecture.md` during planning and the close-out
   updates to `docs/architecture.md`, `docs/index.md` and `README.md` (which list the tidy stubs and deferred
   items) follow two rules of `tools/lint/repo-rules.mjs`. L22 rejects any line matching
   `/\bT\d{3}\b|FR-|SC-|STORY-|Proves:/`: `FR-`, `SC-`, `STORY-` and `Proves:` match as bare substrings
   anywhere in a line (so `SC-` inside a longer word also fails), and a task id is `T` plus three digits as a
   whole word. It scans `README.md`, `AGENTS.md`, `CLAUDE.md`, `docs/architecture.md`, production sources and
   every text file under `frontend/tests/` and `tests/`, fixtures included. L25 requires every backticked path
   in those four documents that starts with a repository root (`frontend/`, `internal/`, `scripts/`, `docs/`,
   `specs/`, `tests/`, `tools/` and others) to exist when the check runs, so an S0 ADR row names no file that
   a later slice creates. `docs/index.md` is outside both scans and follows the same wording.
4. **Bundle growth** (Mermaid about 3.4 MB lazy, KaTeX fonts 260 KB, highlight 56 KB gzip, Monaco hover
   264 KB) is accepted by the spec's Assumptions. No size budget exists; sizes are reported at close-out and no
   gate is added.

## R21 — Open items carried into tasks

- Confirm module workers and Mermaid `getBBox` in the packaged application on macOS (quickstart). E2E runs in
  Chromium, in the macOS release workflow only (the Linux push workflow skips it), so WebView2 and WebKitGTK are
  unverified and are checked by hand where a host is available.

## R22 — Preview parse cost at the Full standard

**Decision**: Keep the existing 2 MiB live-preview pause unchanged. Below it, a preview update of a large
document at the Full standard can block the interface for seconds; the spec records this as the "Large
documents" edge case. FR-RN-011 covers diagram and formula rendering, not document parsing, and SC-002 covers
documents up to 100 KB. Moving preview parsing into a worker is out of scope.

**Rationale**: Measured on synthetic table-rich text (Node 24): the Full pipeline takes about 1.2 s at 0.5 MiB,
3 to 5 s at 1 MiB and 12 to 18 s at 2 MiB; the current pipeline takes about 8 s at 2 MiB. Real text parses faster
(R4: 1 MiB in 1.0 s). The owner accepted the cost at this bound.

**Alternatives**: a lower pause threshold (hides the live preview for mid-size documents); preview parsing in a
worker (a second pipeline host and new result plumbing, deferred beyond this feature).
