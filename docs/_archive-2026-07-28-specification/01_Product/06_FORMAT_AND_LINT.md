**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester
**Last Updated:** 2026-07-10
**Cross-references:** `00_Foundation/04_DESIGN_DECISIONS.md`, `01_Product/01_FUNCTIONAL_REQUIREMENTS.md`, `01_Product/03_FILES_TABS_WORKSPACE.md`, `01_Product/11_SETTINGS.md`, `01_Product/12_KEYBOARD_SHORTCUTS.md`, `mockups/gomarkedit-mockup.html`

# Format & Lint

Document tidying (Format, Compact) and consistency checking (Lint). Both are frontend operations
(Prettier / remark-stringify / remark-lint, DD-16, DD-17). Refines
`01_FUNCTIONAL_REQUIREMENTS.md#fr-format-lint`.

## Table of Contents

1. [The parse pipeline](#the-parse-pipeline)
2. [Format](#format)
3. [How an edit is applied](#how-an-edit-is-applied)
4. [Compact](#compact)
5. [Lint](#lint)
6. [Lint rules](#lint-rules)
7. [On-save](#on-save)
8. [Canonical style](#canonical-style)
9. [Problems surface](#problems-surface)
10. [Edge cases](#edge-cases)

## The parse pipeline

**Format and Lint always parse with the maximal plugin set** — `remark-gfm`, `remark-frontmatter`,
`remark-math` and `remark-directive` — regardless of which Markdown standard the user has selected.

**The standard governs what is displayed. It never governs what is parsed for round-trip.**

This is not a refinement, it is a data-loss fix. Format round-trips the document through an AST, so a
construct the parser does not recognise comes back out as something else. Formatting a document with
YAML frontmatter at the default GFM standard, without `remark-frontmatter` in the pipeline, does not
preserve it: `---` parses as a thematic break plus a setext heading and is re-serialised as neither.
Every Hugo, Jekyll, Astro and Obsidian document opens that way. The same class of failure applies to a
GFM table formatted at Minimal, and to `$$…$$` maths formatted without `remark-math`.

The format pipeline is therefore always _more_ capable than the render pipeline. That asymmetry is
deliberate.

## Format

**Format** pretty-prints the current document: pads table columns, normalizes list markers and
emphasis to the canonical style, applies consistent heading style, and normalizes wrapping (DD-16). It
runs via **`remark-stringify`** in `logic/format` (`format.ts`) — one serializer for both Format and
Compact, so the two cannot disagree and idempotence is provable. Prettier is not used at runtime: it has
no option for the bullet, emphasis or heading style this document promises the user (ADR-0031).
Triggered by the toolbar "Format" button or `Alt+Shift+F`. Format mutates the buffer as a single
undo step and marks the document dirty. If the content cannot be parsed, Format is a no-op with a
notice (EC-FMT-1). A very large document formats as a gated long op with a busy indicator (EC-FMT-4).

When the gate is already held, Format reports that the app is busy and **changes nothing** — it does
not queue silently. Cancelling a running Format, or a Format that fails, releases the gate and leaves
the buffer as it was: either the original content, or the latest content the backend had accepted.
There is no partly-formatted result.

**Format is idempotent and meaning-preserving.** `format(format(x))` equals `format(x)`, and
`render(format(x))` equals `render(x)`. Both are table tests over the renderer's fixture corpus, not
aspirations — they are the two properties that catch the class of Format bug otherwise only visible by
eye.

Three serialization choices follow, each stated because a library default would otherwise decide it:

- **Prose line breaks are preserved, never reflowed.** "Normalizes wrapping" above means normalising
  _trailing_ whitespace and blank-line runs, not re-wrapping paragraphs. Reflowing rewrites every
  paragraph on every Format, which makes an unreadable diff of any version-controlled document and is
  not idempotent between two people with different widths.
- **Ordered lists keep their existing numbering style.** A list written `1. 1. 1.` stays that way; a
  list written `1. 2. 3.` stays that way. Silently renumbering a deliberate all-`1.` list is a change
  users notice and complain about.
- **Indented code blocks stay indented.** The serializer's default converts them to fenced blocks, which
  is a byte change to a document that asked for neither.

**Table padding uses display width, not string length.** A row containing CJK characters or emoji pads
correctly rather than raggedly, which means measuring rendered width rather than counting JavaScript
string units.

## How an edit is applied

Format, Compact, an accepted diff and an applied assistant proposal all reach the buffer the same way,
and it is the only way:

1. Capture the current selection.
2. Push an undo stop.
3. Replace the model's **full range** with the new text, as **one** edit.
4. Push another undo stop.
5. Restore the selection, clamped to the new document length.

**Never `setValue`.** It clears the undo stack, resets the cursor to line 1 column 1, and resets the
scroll position. `EC-FMT-2` requires a single undo step with the cursor preserved, and `setValue`
delivers neither — a shipped reference implementation formats exactly this way, and you cannot undo a
Format in it.

**Cursor preservation is line-anchored.** After a full-range replacement the old column is meaningless,
so the caret returns to the same line number, clamped to the new line count, at the first non-whitespace
character of that line. Preserving the exact column through a reformat would need a position map through
the serializer; the honest guarantee is "you are still where you were reading", and that is what this
document promises.

## Compact

**Compact** is a **conservative** whitespace tightening — not aggressive minification — because
Markdown whitespace can be semantically meaningful (DD-16). It collapses redundant blank lines and
trailing whitespace but must **never** alter significant whitespace inside fenced or indented code
blocks, nor change the document's rendered meaning (EC-FMT-3). Like Format, it applies as a single undo
step through the sequence above, and sets dirty.

Compact is reachable exactly as Format and Lint are: a **toolbar button**, the **`Alt+Shift+C`
binding**, and an **Edit-menu item**. Until 2026-07-25 three documents required Compact and none of them
gave it a way to be invoked.

## Lint

**Lint** runs `remark-lint` (in `logic/lint`, `lint.ts`) to check **consistency** — list-marker
style, emphasis style, heading style, and related rules (DD-17). It runs on demand (toolbar "✓ Lint"
or `Alt+Shift+L`) and, optionally, on save. Findings are mapped to editor markers (squiggles) and a
status-bar count. Lint never modifies the document; it only reports.

## Lint rules

The canonical rule set enforces GoMarkEdit's house style. Defaults align with the canonical style below.

| Rule (remark-lint)              | Enforces                       | Default               |
| ------------------------------- | ------------------------------ | --------------------- |
| `unordered-list-marker-style`   | Consistent bullet marker       | `-`                   |
| `emphasis-marker`               | Consistent emphasis marker     | `_`                   |
| `strong-marker`                 | Consistent strong marker       | `*` (i.e. `**bold**`) |
| `heading-style`                 | ATX vs Setext                  | `atx` (`#`)           |
| `list-item-indent`              | Consistent list indentation    | consistent            |
| `no-multiple-toplevel-headings` | Single H1 per document         | warn                  |
| `no-trailing-spaces`            | No trailing whitespace         | error                 |
| `no-consecutive-blank-lines`    | Collapse blank runs            | warn                  |
| `fenced-code-flag`              | Code fences declare a language | warn                  |
| `final-newline`                 | File ends with a newline       | error                 |

Rules are configuration, not code; adjusting the set is a settings/config change, not a rendering
change. Findings above/below thresholds still surface as markers.

## On-save

Format and Lint can run automatically on save via two independent settings — **Format on save** and
**Lint on save** (DD-18). When both are enabled, **Format runs before Lint** so linting sees the
formatted text (EC-LINT-3). On-save formatting is a single undo step and preserves cursor/selection
where possible (EC-FMT-2). Both settings are exposed in the Settings menu (quick toggles) and the
Settings dialog Markdown group; defaults: Format on save **off**, Lint on save **on**
(`11_SETTINGS.md#defaults`).

**Autosave never formats** (DD-71). On-save actions run on an **explicit** save only — `Ctrl/Cmd+S`,
Save As, or a save chosen from a close prompt. Autosave writes the buffer and nothing else.

The reason is arithmetic. Autosave is on by default and debounced at a few seconds; running a formatter
on it would reflow the document under the cursor while the user is still typing in it, several times a
minute — with lint-on-save also on by default and compounding it.

The consequence has to be said plainly rather than implied: for an autosaved file, what lands on disk is
the text you were shown, but **not** necessarily in canonical format. Formatting happens the next time
you save explicitly. Anyone who wants every write formatted turns autosave off.

## Canonical style

Enforced canonical defaults (DD-18), used by both Format and Lint:

- **Bullet marker:** `-`
- **Emphasis:** `_` (underscore for italics)
- **Headings:** ATX (`#`)

These are user-overridable in the Settings dialog Markdown group (bullet `-`/`*`/`+`, emphasis
`_ _`/`* *`, heading ATX/Setext per the mockup) but ship at the canonical values.

## Problems surface

Lint findings appear in two coordinated places: **inline squiggles** on the offending ranges in the
editor (with a hover message, e.g. `lint: use "-" for bullets` as in the mockup), and a **status-bar
count** with a warning glyph (`⚠ 1`). A clean document shows zero count and no squiggles (EC-LINT-2).
Many findings produce an accurate count with capped/virtualised markers to protect performance
(EC-LINT-1). When Lint is disabled, no squiggles show and the status indicator is hidden (EC-LINT-4).

**The count is clickable, and it opens a list.** Clicking `⚠ 1` opens a problems list — every finding
with its rule, message, line and column — and clicking a row moves the caret to it. Without the list,
"clicking a finding jumps to it" has nothing to click: a squiggle you must already have found is not a
way to find anything.

**Marker mapping is exact, and it is where a day gets lost.** Lint messages carry 1-based line and
column positions and **frequently have no end position**. A point message mapped naively produces a
zero-width squiggle that is invisible and cannot be hovered. A point is therefore widened to the
enclosing word, or to the end of the line when there is no word. Markers are written under a stable
owner name so a re-lint replaces the previous set rather than appending to it, and they are cleared when
the document's editor model is disposed.

**`EC-LINT-1`'s cap is 1,000 markers.** Above that the count stays accurate and only the first thousand
are decorated; the list shows all of them. Monaco's decoration rendering degrades in the low thousands,
so "capped" needed a number.

## Edge cases

- **EC-FMT-1** — Unparseable content → Format is a no-op with a notice.
- **EC-FMT-2** — Format-on-save is one undo step, preserves cursor.
- **EC-FMT-3** — Compact never alters significant whitespace (code blocks).
- **EC-FMT-4** — Large-file format runs as a gated long op with busy indicator.
- **EC-LINT-1** — Many findings → accurate count, capped markers.
- **EC-LINT-2** — Clean document → zero count, no squiggles.
- **EC-LINT-3** — Format-on-save runs before Lint-on-save.
- **EC-LINT-4** — Lint disabled → no squiggles, indicator hidden.
