# ADR-0031 — Format Markdown with remark-stringify over the maximal plugin set; keep Prettier as a dev-time tool only

**Status:** accepted
**Date:** 2026-07-25
**Deciders:** project owner, architect

## Context and problem statement

`01_Product/06_FORMAT_AND_LINT.md` says Format runs via "Prettier / remark-stringify", and
`05_Dependencies/02_FRONTEND_DEPENDENCIES.md` lists **both** as runtime dependencies. They are two
different serializers with different opinions, and running Format through one while Compact uses the
other means the two commands fight: a document oscillates between two stable forms and Format is not
idempotent.

Worse, the same document promises the user control over three things Prettier does not expose:

> the bullet character (`-`/`*`/`+`), the emphasis character (`_`/`*`), and heading style (ATX/Setext)
> are user-overridable.

Prettier's Markdown printer has no options for any of the three. It hard-codes `-` bullets, `_`
emphasis, `**` strong and ATX headings. **If the settings are honoured, Format cannot be Prettier.**
The specification currently promises both and can deliver only one.

A second, larger problem sits underneath and is a data-loss bug rather than an inconsistency. Format
round-trips the document through an AST, so anything the parser does not understand is re-serialized as
something else. `04_MARKDOWN_STANDARDS.md` gates `remark-frontmatter` to the **Full** standard while
the default standard is **GFM**. Therefore, at the default setting, formatting a document that opens
with a YAML frontmatter block does not preserve it: `---` parses as a thematic break followed by a
setext heading and comes back out as neither. Every Hugo, Jekyll, Astro and Obsidian document in the
world starts that way. The same class of bug applies to a GFM table formatted at Minimal, and to `$$`
maths formatted without `remark-math`.

## Decision drivers

- The specification's own promise of user-overridable canonical style.
- Format must be idempotent: `format(format(x)) == format(x)`.
- Format must be meaning-preserving: `render(format(x)) == render(x)`.
- Format must never destroy content the renderer merely chose not to display.
- One serializer, so Format and Compact cannot disagree.

## Considered options

- **A.** Prettier for Format, and drop the user-overridable style settings.
- **B.** `remark-stringify` for Format, and drop Prettier from the runtime.
- **C.** Keep both, using Prettier when the settings are at their defaults.

## Decision outcome

Chosen: **B**.

- **Format and Compact both use `remark-stringify`.** Its options map one-to-one onto the settings the
  specification already promised: `bullet`, `bulletOrdered`, `emphasis`, `strong`, `rule`, `setext`,
  `listItemIndent`, `fence`, `fences`, `incrementListMarker`.
- **Prettier leaves the runtime dependency list.** It stays as a development tool for formatting this
  repository's own source, which is what it was already doing.
- **The format and lint pipeline always parses with the maximal plugin set** — `remark-gfm` +
  `remark-frontmatter` + `remark-math` + `remark-directive` — regardless of the Markdown standard the
  user has selected. This is the important half of this decision. **The standard governs what is
  displayed; it never governs what is parsed for round-trip.** A construct the renderer declines to
  render must still survive being formatted.
- **Prose line breaks are preserved**, not reflowed. Reflowing rewrites every paragraph on every
  Format, which produces unreadable diffs in any version-controlled document and is not idempotent
  across two people with different widths.
- **Format applies as one editor edit, in one undo step**, and never through `setValue`: push an undo
  stop, replace the full model range with a single edit, push another undo stop, restore the selection.
  `setValue` clears Monaco's undo stack, resets the cursor to 1:1 and resets scroll — which is exactly
  the behaviour `EC-FMT-2` forbids, and exactly what the reference implementation we studied does.

### Consequences

- Positive: the promised style settings become implementable, because they map onto real options.
- Positive: frontmatter, tables and maths survive Format at every standard.
- Positive: one serializer means Format and Compact converge instead of oscillating, and idempotence
  becomes a testable property rather than a hope.
- Positive: one fewer runtime dependency and a smaller bundle.
- Negative: `remark-stringify`'s defaults are not Prettier's, so its output will not match what
  `prettier --write` produces on the same file. Someone running both against one document sees churn.
  We accept this: the app is the editor, and the app's output is the canonical one.
- Negative: several serialization details now need explicit decisions that Prettier would have made for
  us — list renumbering, whether indented code blocks are converted to fenced, and how table columns are
  padded when the content is CJK or emoji (string length is not display width). These are written into
  `06_FORMAT_AND_LINT.md` rather than left to the serializer's defaults.
- Neutral: the maximal-plugin-set rule means the format pipeline is always more capable than the render
  pipeline. That asymmetry is deliberate and should be stated wherever it could surprise someone.

## Pros and cons of the options

### Option A — Prettier, drop the style settings
- Good: one well-known formatter; no serialization decisions to make.
- Bad: breaks a stated user-facing promise, and does nothing about the frontmatter problem, which is
  the more serious of the two.

### Option B — remark-stringify, drop Prettier *(chosen)*
- Good: honours the settings, one serializer, fixes the round-trip hazard, smaller bundle.
- Bad: output differs from Prettier's; more decisions to write down.

### Option C — both, switching on whether settings are default
- Good: familiar output for the common case.
- Bad: two formatters means two behaviours for one button, and the switch is invisible to the user. A
  document formatted on a machine with default settings and again on one without would churn.

## Links

- Design decisions: DD-16, DD-17 (canonical style), DD-71 (autosave never formats)
- Spec clauses: `specification/01_Product/06_FORMAT_AND_LINT.md`,
  `specification/01_Product/04_MARKDOWN_STANDARDS.md`,
  `specification/05_Dependencies/02_FRONTEND_DEPENDENCIES.md` §3
- Phase: `specification/07_Phases/PHASE_10_TIDY_AND_SHARE.md`
- Stories: the Phase 10 stories, not yet written.
