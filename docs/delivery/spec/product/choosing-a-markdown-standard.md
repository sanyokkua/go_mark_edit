# Choosing a Markdown standard

## What it's for

"Markdown" is not one thing. A file that renders correctly on GitHub may render as literal pipe
characters on a site using strict CommonMark, and a document full of `$…$` mathematics is meaningless
to both. The standard setting lets you preview what a particular target will actually show, so you find
out before you publish rather than afterwards.

## What you can do

Pick a level in the Settings menu or in Settings → Markdown: **Minimal**, **GFM** or **Full**. GFM is
the default. Changing it re-renders every open document immediately, and the preview's badge and the
status bar both show which level is active.

## Rules

### There are exactly three levels {#three-levels}
- **Minimal** is strict CommonMark: headings, paragraphs, emphasis, links, images, blockquotes, lists,
  fenced and indented code, thematic breaks, and inline HTML subject to sanitising. No tables, no task
  lists, no strikethrough, no autolinks, no footnotes, no maths, no directives.
- **GFM** is CommonMark plus GitHub-flavoured Markdown: tables, task-list items, strikethrough, literal
  autolinks and footnotes. This is what most people mean by "Markdown" and it is the default.
- **Full** is GFM plus maths, directives and admonitions, and front matter.

Examples: use Minimal to preview exactly what a CommonMark-only renderer would show · use Full for
technical notes with formulae and callouts.

### The standard is one global setting {#the-standard-is-one-global-setting}
- The level applies to every open document's preview and reading mode. It is not per document.

Examples: two documents open, level switched to Full → both re-render at Full · a per-document level →
a setting the user has to remember to set on each file, and a preview that means something different
per tab.

### A feature above the level renders literally {#higher-features-render-literally}
- **When** a document uses a feature the active level does not include, its syntax renders as plain
  text — not as an error.

Examples: a pipe table at Minimal → the pipe characters, as written · `$x^2$` at GFM → the characters
`$x^2$` · `~~struck~~` at Minimal → the tildes · an error message instead → the user is told the
document is broken when it is the setting that is narrow, which is the whole point of Minimal.

### Changing the level re-renders open documents at once {#level-change-rerenders}
- **When** the level changes, the preview and reader of every open document re-render, and the standard
  badge updates.

Examples: switching from GFM to Full with a footnote-heavy document open → footnotes start rendering
immediately · requiring a reopen → the setting looks broken.

### Front matter is recognised at GFM as well as Full {#frontmatter-at-gfm}
- A YAML block at the top of a document is parsed and hidden from the rendered body at **both** GFM and
  Full.

Examples: a Hugo post opened at the default GFM → the front matter is hidden and the body renders · not
recognising it at GFM → `---` parses as a thematic break plus a setext heading, so the reader sees a
stray horizontal rule and mangled text and concludes the app is broken.

*Why this matters beyond appearance:* Format round-trips the document through the syntax tree, so a
level that cannot parse front matter is a level whose Format destroys it. Almost every real `.md` file
from Hugo, Jekyll, Astro or Obsidian opens with one.

### Highlighting and diagrams are independent of the level {#highlighting-and-mermaid-are-level-independent}
- Fenced-code syntax highlighting runs at every level, because it is a rendering concern.
- Mermaid fences render at every level, because they are handled by a component override rather than a
  Markdown plugin.

Examples: ` ```go ` at Minimal → highlighted · a Mermaid diagram at Minimal → rendered.

### The plugin set per level {#plugin-mapping}

| Capability | Plugin | Minimal | GFM | Full |
|---|---|:--:|:--:|:--:|
| Core CommonMark parse | `react-markdown` core | yes | yes | yes |
| Tables, task lists, strikethrough, autolinks | `remark-gfm` | no | yes | yes |
| Footnotes | `remark-gfm` | no | yes | yes |
| Maths, `$…$` and `$$…$$` | `remark-math` + `rehype-katex` | no | no | yes |
| Directives and admonitions | `remark-directive` | no | no | yes |
| Front matter, YAML | `remark-frontmatter` | no | **yes** | yes |
| Code highlighting | `rehype-highlight` | yes | yes | yes |
| Mermaid fences | component override | yes | yes | yes |
| HTML sanitising | `rehype-sanitize` | yes | yes | yes |

- Footnotes are part of `remark-gfm`, not a Full-only addition.

Examples: a footnote at GFM → rendered with its back-reference · a footnote at Minimal → the literal
`[^1]`.

### Format and lint always parse with the maximal set {#format-parses-maximally}
- Format, Compact and Lint parse with `remark-gfm`, `remark-frontmatter`, `remark-math` **and**
  `remark-directive`, regardless of the selected level.
- **The standard governs what is displayed. It never governs what is parsed for round-trip.**

Examples: formatting a document with front matter at GFM → the front matter survives, because the parser
recognised it · formatting at the display level instead → `---` is re-serialised as neither a thematic
break nor a heading, and the front matter is silently destroyed. The same class of failure applies to a
table formatted at Minimal and to `$$…$$` formatted without the maths plugin.

*This asymmetry is deliberate:* the format pipeline is always more capable than the render pipeline,
because formatting a construct you cannot parse is how data is lost.

### The active level is visible {#level-is-visible}
- The preview pane header shows a badge with the active level, for example `GFM`, and the status bar
  shows `Markdown · GFM`.

Examples: a document rendering unexpectedly → the badge tells you which level is in force without
opening settings.

## What it looks like

- Settings → Markdown — `../surface/mockup.html#material-light/settings-markdown`
- The Settings menu's standard radio — `../surface/mockup.html#material-light/menu-settings`
- The badge in the preview header and the status bar —
  `../surface/mockup.html#material-light/editor-split`

## When things go wrong

| Situation | What the user sees | What they can do |
|---|---|---|
| A stored level is not one of the three | GFM, silently | Nothing |
| A document uses a Full-only feature at GFM | The syntax, literally | Switch to Full |
| A directive plugin fails to parse a malformed directive | The source text of that directive; the rest renders | Fix the directive |

## Edge cases

**The level is switched while a large document's preview is paused**
- *Trigger:* a 3 MB document with the preview paused, level changed from GFM to Full.
- *Expected:* the preview stays paused; the next manual refresh renders at the new level. The badge
  updates immediately.
- *Avoid:* forcing a full re-render of a paused document, which is what pausing exists to prevent.

**Front matter that is not valid YAML**
- *Trigger:* a `---` block containing malformed YAML.
- *Expected:* the block is still recognised as front matter and hidden, and the body renders.
- *Avoid:* falling back to rendering it as body content, which puts unexpected text at the top of the
  document.

**A document beginning with a thematic break**
- *Trigger:* a file whose first line is `---` with ordinary prose after it, no closing `---`.
- *Expected:* it is a thematic break, not front matter, because front matter needs a closing delimiter.
- *Avoid:* swallowing the rest of the document as front matter.

**The level is switched while a document is being formatted**
- *Trigger:* Format is running and the level changes.
- *Expected:* the format completes with the maximal parse set, unaffected — the level was never an input
  to it.
- *Avoid:* re-reading the level mid-format, which would change the serialiser's inputs halfway.

## Not this

- **No per-document standard.** See `#the-standard-is-one-global-setting`.
- **No custom plugin set.** Three named levels a user can reason about beat an arbitrary set of
  checkboxes whose combinations nobody has rendered.
- **No auto-detection of a document's level.** Guessing produces a preview that changes when the
  document does, which is worse than a setting that stays where you put it.
- **No level-specific formatting.** Formatting a construct the parser did not recognise is how data is
  lost, so Format always parses with every plugin whatever the display level says.

## Decisions

- *2026-07-25* — Front matter is recognised at GFM as well as Full. Almost every real-world `.md` file
  opens with a YAML block, and formatting one at a level that cannot parse it destroys it.
- *2026-07-25* — Format and Lint always use the maximal plugin set. Recorded in
  `../../adr/0031-format-via-remark-stringify.md`.

## Open questions

*(none — ready to build)*
