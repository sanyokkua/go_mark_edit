# Tidying Markdown

## What it's for

Markdown written by several people, or by one person over a year, drifts: `*` bullets in one section and
`-` in the next, tables whose pipes no longer line up, three blank lines where one was meant. Format
fixes it in one keystroke. Lint tells you where the drift is without changing anything. Both matter most
in a repository, where an inconsistent document produces a diff nobody can read.

## What you can do

**Format** (`Alt/Option+Shift+F`, or the toolbar button) pretty-prints the current document: table
columns padded, markers normalised, heading style made consistent.

**Compact** (`Alt/Option+Shift+C`) does the conservative half: it collapses runs of blank lines and
strips trailing whitespace, and touches nothing else.

**Lint** (`Alt/Option+Shift+L`) checks consistency and reports. It never changes the document. Findings
appear as squiggles in the editor and as a count in the status bar — click the count for a list, and
click a row to jump to it.

Both can run automatically on save. Format-on-save is off by default; lint-on-save is on.

## Rules

### Format and Lint parse with the maximal plugin set {#format-parses-maximally}
- Format, Compact and Lint always parse with `remark-gfm`, `remark-frontmatter`, `remark-math` and
  `remark-directive`, whatever the display standard is set to.
- The standard governs what is **displayed**. It never governs what is parsed for round-trip.

Examples: formatting a Hugo post at the default GFM level → the front matter survives · parsing at the
display level → `---` becomes a thematic break plus a setext heading and is re-serialised as neither, so
the front matter is destroyed. The same happens to a GFM table formatted at Minimal and to `$$…$$`
formatted without the maths plugin.

### Format is idempotent and meaning-preserving {#format-is-idempotent}
- `format(format(x))` produces exactly `format(x)`.
- `render(format(x))` produces exactly `render(x)`.
- Both are table tests over the renderer's fixture corpus, not aspirations.

Examples: format twice → the second run changes nothing · format a document and its rendering changes →
the formatter altered meaning, which is the bug class that is otherwise only visible by eye.

### Prose line breaks are preserved, never reflowed {#no-reflowing}
- Format normalises **trailing** whitespace and runs of blank lines. It does not re-wrap paragraphs.

Examples: a paragraph written as one long line → still one long line · a paragraph split across four
lines → still four · reflowing to 80 columns → every paragraph is rewritten on every format, which makes
an unreadable diff of any version-controlled document and is not idempotent between two people with
different width preferences.

### Ordered lists keep their numbering style {#ordered-list-numbering-is-kept}
- A list written `1.` `1.` `1.` stays that way. A list written `1.` `2.` `3.` stays that way.

Examples: an all-`1.` list, which is a deliberate style that survives insertions → unchanged ·
renumbering it → a change the user notices and did not ask for.

### Indented code blocks stay indented {#indented-code-stays-indented}
- Format does not convert an indented code block into a fenced one.

Examples: a four-space code block → still four-space · converted to ` ``` ` → a byte change to a document
that asked for neither, and the serialiser's default does exactly this.

### Table padding uses display width {#table-padding-uses-display-width}
- Column padding measures rendered width, not the number of string units.

Examples: a table with CJK characters or emoji → columns line up · counting JavaScript string units →
the padding is ragged for exactly the rows that needed it.

### Compact is conservative {#compact-is-conservative}
- Compact collapses runs of blank lines and strips trailing whitespace.
- It **never** alters whitespace inside a fenced or indented code block, and never changes what the
  document renders as.

Examples: three blank lines between paragraphs → one · a blank line inside a fenced block → untouched ·
a "minify" that strips it → the code sample is now wrong, and Markdown whitespace can be meaningful.

- Compact is reachable exactly as Format and Lint are: a toolbar button, `Alt/Option+Shift+C`, and a
  menu item.

### An edit is applied as one undo step {#edits-are-one-undo-step}
- Format, Compact, an accepted diff and an applied assistant proposal all reach the buffer the same way,
  and it is the only way:
  1. Capture the current selection.
  2. Push an undo stop.
  3. Replace the model's **full range** with the new text, as **one** edit.
  4. Push another undo stop.
  5. Restore the selection, clamped to the new document length.
- **Never use `setValue`.**

Examples: format, then one `Ctrl/Cmd+Z` → back to exactly the original text · `setValue` → the undo
stack is cleared, the caret goes to line 1 column 1, and the scroll position resets, so a format cannot
be undone at all. A shipped reference application formats exactly this way.

### The caret returns to the same line, not the same column {#caret-is-line-anchored}
- After a full-range replacement, the caret returns to the same **line number**, clamped to the new line
  count, at the first non-whitespace character of that line.

Examples: caret on line 40 of 200, format → caret on line 40 · preserving the exact column → it needs a
position map through the serialiser, and the honest guarantee is "you are still where you were reading".

### Format holds the gate and changes nothing when it cannot run {#format-is-gated}
- Format acquires the single long-operation gate.
- **If** the gate is already held, **then** Format reports that the app is busy and **changes nothing**.
  It does not queue silently.
- **If** a running Format is cancelled or fails, **then** the gate is released and the buffer is left as
  it was — either the original content or the latest content the backend had accepted.
- There is no partly-formatted result.
- A very large document formats with a busy indicator and an in-place Cancel.

Examples: an export running, Format pressed → "Something else is running", document unchanged · a
cancelled format → the document is exactly as it was, and the report names what completed, not the loop
index.

### An unparseable document is a no-op with a notice {#unparseable-is-a-noop}
- **If** the content cannot be parsed, **then** Format does nothing and says so.

Examples: a file that is not really Markdown → a notice, the document untouched · a partial format → a
document damaged by the tool meant to tidy it.

### Lint reports and never changes anything {#lint-never-modifies}
- Lint reports findings. It does not modify the document, and there is no fix-all action.

Examples: 40 findings → 40 squiggles and a count of 40; the text is byte-identical afterwards.

### The lint rule set {#lint-rules}

| Rule | Enforces | Default |
|---|---|---|
| `unordered-list-marker-style` | Consistent bullet marker | `-` |
| `emphasis-marker` | Consistent emphasis marker | `_` |
| `strong-marker` | Consistent strong marker | `*`, that is `**bold**` |
| `heading-style` | ATX rather than Setext | `atx` |
| `list-item-indent` | Consistent list indentation | consistent |
| `no-multiple-toplevel-headings` | One top-level heading per document | warning |
| `no-trailing-spaces` | No trailing whitespace | error |
| `no-consecutive-blank-lines` | Collapse runs of blank lines | warning |
| `fenced-code-flag` | Code fences declare a language | warning |
| `final-newline` | The file ends with a newline | error |

- The bullet, emphasis and heading defaults follow the same three settings the toolbar and Format use,
  so they cannot disagree.
- Rules are configuration, not code.

Examples: bullet marker changed to `*` in settings → the linter stops flagging `*` and Format starts
producing it.

### A lint finding with no end position is widened {#lint-markers-are-widened}
- Lint messages carry one-based line and column positions and frequently have **no end position**.
- **When** a finding has no end, the marker is widened to the enclosing word, or to the end of the line
  when there is no word.
- Markers are written under a stable owner name, so a re-lint replaces the previous set rather than
  appending to it, and they are cleared when the document's editor model is disposed.

Examples: a point finding at line 3 column 12 → a squiggle over the word there · a zero-width squiggle →
invisible, and it cannot be hovered, so the message never reaches the user · re-linting without a stable
owner → markers accumulate and the same finding appears four times.

### At most 1,000 markers are drawn, and the count stays true {#lint-marker-cap}
- **If** a document has more than **1,000** findings, **then** only the first thousand get squiggles.
- The status-bar count stays accurate, and the problems list shows all of them.

Examples: 1,200 findings → `⚠ 1200`, 1,000 squiggles, 1,200 rows in the list · 999 → all decorated · a
cap that also caps the count → the user is told there are fewer problems than there are.

*Why a cap:* the editor's decoration rendering degrades in the low thousands.

### The problems count opens a list {#problems-list}
- The status bar shows a warning glyph and a count, for example `⚠ 1`.
- **When** the count is clicked, a problems list opens showing every finding with its rule, message,
  line and column. Clicking a row moves the caret to it.
- **While** lint is disabled, no squiggles are shown and the status indicator is hidden.
- **If** there are no findings, the list reads `No problems found.`

Examples: 12 findings → a list of 12, click the seventh, land on it · squiggles with no list → "clicking
a finding jumps to it" has nothing to click, because a squiggle you must already have found is not a way
to find anything.

### On-save runs on an explicit save only {#on-save-is-explicit-only}
- Format-on-save and lint-on-save run on `Ctrl/Cmd+S`, on Save As, and on a save chosen from a close
  prompt.
- **Autosave never formats and never lints.**
- **When** both are enabled, Format runs **before** Lint, so linting sees the formatted text.
- Defaults: format-on-save **off**, lint-on-save **on**.

Examples: autosave on, format-on-save on, typing → the file is written unformatted every few seconds and
the caret never moves · running the formatter on each autosave → the document reflows under the user
several times a minute, with lint-on-save compounding it.

*The consequence stated plainly:* for an autosaved file, what lands on disk is the text you were shown
but not necessarily in canonical format. Formatting happens the next time you save explicitly. Anyone
who wants every write formatted turns autosave off.

## What it looks like

- The problems list — `../surface/mockup.html#material-light/problems`
- The diff view — `../surface/mockup.html#material-light/diff-view`
- A gated operation with progress and Cancel — `../surface/mockup.html#material-light/busy`
- Format, Compact and Lint in the toolbar and the context menu —
  `../surface/mockup.html#material-light/editor-menu`

## When things go wrong

| Situation | What the user sees | What they can do |
|---|---|---|
| Format pressed while something else is running | `Something else is running` · `Wait for the current operation to finish, or cancel it.` The document is unchanged | Wait, or cancel the other operation |
| The document cannot be parsed | A notice saying so; the document is unchanged | Fix the syntax |
| Format is cancelled mid-run | An informational message naming what completed; the document is unchanged | Run it again |
| More than 1,000 lint findings | An accurate count, 1,000 squiggles, and every finding in the list | Fix them, or narrow the rule set |

## Edge cases

**Format is pressed while the buffer has unflushed edits**
- *Trigger:* typing, then `Alt/Option+Shift+F` immediately.
- *Expected:* the buffer is flushed first, so the format operates on the text the user can see.
- *Avoid:* formatting the last-synced content, which silently reverts the characters typed since.

**Format on a document with a selection**
- *Trigger:* text selected, Format pressed.
- *Expected:* the whole document is formatted; the caret returns to the same line. Format is a
  document-scoped action.
- *Avoid:* formatting only the selection, which produces a document whose halves are formatted
  differently.

**Lint runs while the document is being formatted**
- *Trigger:* lint-on-save with format-on-save, on one explicit save.
- *Expected:* Format completes, then Lint runs on the result.
- *Avoid:* running both against the pre-format text, so every finding the formatter just fixed is still
  reported.

**A finding on the very last line of a file with no trailing newline**
- *Trigger:* the `final-newline` rule on a one-line file.
- *Expected:* a marker widened to the end of that line, hoverable.
- *Avoid:* a marker positioned past the end of the document, which the editor discards silently.

**Format is run on an empty document**
- *Trigger:* Format on a new, empty buffer.
- *Expected:* nothing changes and the document does not become modified.
- *Avoid:* writing a trailing newline into an empty document, which marks it modified for no reason and
  makes an untitled document eligible for a save prompt.

## Not this

- **No paragraph reflowing.** Re-wrapping rewrites every paragraph on every format, which makes an
  unreadable diff of any version-controlled document and is not idempotent between two people with
  different width preferences.
- **No fix-all for lint.** See `#lint-never-modifies`. A fixer for a consistency rule is Format, and it
  already exists.
- **No aggressive minification in Compact.** See `#compact-is-conservative`.
- **No Prettier at runtime.** It has no option for the bullet, emphasis or heading style this product
  promises the user. Prettier remains the formatter for the project's own source files.
- **No format-on-autosave.** Autosave is debounced at a few seconds, so formatting on it would reflow the
  document under the user's caret several times a minute while they are still typing in it.
- **No per-document lint configuration.** The rule set is application-wide, so two documents in one
  repository cannot disagree about house style.

## Decisions

- *2026-07-25* — Format uses `remark-stringify` rather than Prettier, so one serialiser drives both
  Format and Compact and idempotence is provable. Recorded in
  `../../adr/0031-format-via-remark-stringify.md`.
- *2026-07-25* — Autosave never formats, and the consequence for autosaved files is stated rather than
  implied.
- *2026-07-25* — Compact gained a toolbar button, a binding and a menu item. Three documents required it
  and none of them gave it a way to be invoked.

## Open questions

*(none — ready to build)*
