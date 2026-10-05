# Feature Specification: Rich Markdown Authoring

**Feature Branch**: `feature/006-rich-markdown-authoring`

**Created**: 2026-09-29

**Status**: Complete

**Input**: User description: "Full support of all Markdown syntaxes, plus math, plus Mermaid (rendering of
Mermaid; the dev.tools project is a reference for examples). Format / Compact / Lint should become
really working functions, not only stubbed buttons. Opening in the editor files from links inside
Markdown to other local files, with switching to that file and opening it in a tab. If the file is in
the same opened folder, also show (select) it in the folder tree; if it is from an external directory
or no folder is open, just open it in a tab and switch to that tab."

**Terminology**: "Tidy actions" means Format, Compact and Lint together. "Markdown standard" means the
Minimal, GFM or Full rendering level. "Folder" means the folder opened with Open Folder (feature 005).
"Supported document" means a file with one of the suffixes the Open dialog accepts: `.md`, `.markdown`,
`.mdown`, `.txt`, compared without regard to capitalisation. "Notice" means a message the application shows
the user. "Caret" means the editor's insertion point. "Operation slot" is defined under Key Entities.

## Scope

Product-owner decisions: links open supported documents anywhere on the local disk, and network and
device paths stay refused; a link to a local file that is not a supported document is refused with a
notice offering "Reveal in file manager", and the application never launches another program for it;
Mermaid support means diagrams in the preview and Mermaid source highlighting in the editor, with the
`dev.tools` project as a behaviour reference only; the Minimal / GFM / Full selector is implemented
with Full as the default.

Out of scope: a standalone Mermaid document type, a full-window diagram viewer with zoom and pan (the
zoom and pan clause of spec 001 FR-022 stays deferred) and diagram export; reading mode, PDF export and
print; the command palette (tidy actions are reached from the toolbar, the Format menu group, the
editor context menu and shortcuts); the remote-content policy, so remote images keep their placeholder
and the image policy is unchanged; Lint quick fixes and per-rule switches; rendering large documents
without blocking the interface (edge case "Large documents").

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Read rich Markdown in the preview (Priority: P1)

A user writes or opens a document that uses tables, footnotes, task lists, math formulas, Mermaid
diagrams, fenced code in several languages, alerts and small inline HTML such as `<kbd>`. The preview
shows each construct in its rendered form instead of the literal source, in the current theme, without
slowing typing.

**Why this priority**: A Markdown editor whose preview leaves common syntax literal fails its core
reading promise. Every other story in this feature builds on documents that render correctly.

**Independent Test**: Open a reference document containing every construct listed in FR-RN-003 and
FR-RN-004 at the Full standard and confirm each one renders, that broken formulas and diagrams fail
locally, and that no network request is made.

**Acceptance Scenarios**:

1. **Given** the Markdown standard is Full, **When** the user opens a document containing a GFM table,
   a task list, strikethrough, a bare web address, a footnote, YAML front matter, an inline formula
   `$E = mc^2$`, a display formula `$$ … $$`, a ` ```math ` block, a ` ```mermaid ` flowchart, a
   ` ```go ` code block, a `> [!WARNING]` alert, a `:::note` admonition and a `<kbd>Ctrl</kbd>` element,
   **Then** the preview shows every construct in its rendered form, the front matter is not shown as
   text, and no construct appears as its literal source.
2. **Given** a document contains a formula with invalid syntax, **When** the preview renders, **Then**
   that formula alone shows an inline error marker containing the original source, and the rest of the
   document renders normally.
3. **Given** a document contains a Mermaid block with invalid syntax, **When** the preview renders,
   **Then** that block alone shows an error box with the diagram parser's message, and every other
   block, including other diagrams, renders normally.
4. **Given** a fenced code block names an unknown language or no language, **When** the preview
   renders, **Then** the block is shown as plain monospaced text without colouring and without an error.
5. **Given** a document shows diagrams, formulas and highlighted code, **When** the user switches theme
   or appearance mode, **Then** diagrams are redrawn and code colours change to match the new theme
   without reopening the document.
6. **Given** the user is typing in a document that contains diagrams, **When** they keep typing,
   **Then** keystrokes are never delayed by diagram or formula rendering, and a diagram result that
   belongs to older text is discarded rather than shown.
7. **Given** a document contains `<script>`, `<style>`, `<iframe>`, `<form>`, `<svg>` or another element
   FR-RN-008 removes, an `onclick` attribute or a `javascript:` link, **When** the preview renders,
   **Then** none of them runs, loads or changes the page, the removed elements' contents are not shown,
   and the elements FR-RN-008 permits still render.
8. **Given** a heading `## Getting Started` and a link `[see](#getting-started)` in the same document,
   **When** the user activates the link, **Then** the preview scrolls to that heading.
9. **Given** a document has two headings `## Notes` and a heading `## Über uns`, **When** the preview
   renders, **Then** their anchors are `notes`, `notes-1` and `über-uns`, and links to each anchor
   scroll to the matching heading.
10. **Given** the standard is Full and a paragraph reads "It costs $5 and $10 per month", **When** the
    preview renders, **Then** the sentence is shown as plain text with both dollar amounts and no
    formula.
11. **Given** the standard is Full and a document contains 51 Mermaid blocks and one formula longer than
    10,000 characters, **When** the preview renders, **Then** the first 50 diagrams render, the 51st
    block shows a placeholder stating there are too many diagrams, and the long formula shows a
    placeholder stating it is too large to render.
12. **Given** the preview shows a successful rendering of a document, **When** a later version of the
    text cannot be rendered at all, **Then** the preview keeps the last successful rendering and shows
    an inline error.

---

### User Story 2 - Format, Compact and Lint a document (Priority: P1)

A user tidies a messy document with one action: Format rewrites it into the canonical style, Compact
only removes redundant blank lines and trailing spaces, and Lint lists style problems without changing
anything. Each change is undoable in one step.

**Why this priority**: The three controls are visible today but do nothing, which reads as broken.
Making them work removes that defect and delivers the house-style promise of the product.

**Independent Test**: Open a document with inconsistent bullets, emphasis markers, unpadded tables,
extra blank lines and trailing spaces; run Format, Compact and Lint in turn and confirm the source, undo
history, problem count and problems list described below.

**Acceptance Scenarios**:

1. **Given** a document uses `*` and `+` bullets, `*` emphasis, Setext headings and an unpadded table,
   and the preferences are the defaults, **When** the user runs Format, **Then** bullets become `-`,
   emphasis becomes `_`, headings become ATX `#` headings, table columns are padded to equal width,
   paragraphs keep their original line breaks, and the document is marked as having unsaved changes.
2. **Given** Format has just run, **When** the user runs Format again, **Then** the document text does
   not change.
3. **Given** Format or Compact has changed a document, **When** the user presses Undo once, **Then** the
   document returns exactly to its text before the action.
4. **Given** a document contains fenced code and indented code with trailing spaces and blank-line runs
   inside them, **When** the user runs Format or Compact, **Then** the contents of every code block are
   byte-for-byte unchanged.
5. **Given** a document has runs of three or more blank lines and lines ending in spaces or tabs outside
   code, **When** the user runs Compact, **Then** each run becomes one blank line, trailing spaces and
   tabs are removed, nothing else changes, and the rendered preview is identical before and after.
6. **Given** a document with an ordered list numbered `1. 1. 1.` and another numbered `1. 2. 3.`,
   **When** the user runs Format, **Then** each list keeps its own numbering style.
7. **Given** a document violates three lint rules, **When** the user runs Lint, **Then** the document
   text is unchanged, each finding is underlined in the editor with a message naming the rule, the
   status bar shows a problem count of 3, and the problems list shows the three findings with their line
   numbers.
8. **Given** the problems list is showing findings, **When** the user activates one finding with the
   mouse or the keyboard, **Then** the editor moves the caret to that finding's position and takes
   focus.
9. **Given** a document produces 1,500 lint findings, **When** Lint finishes, **Then** the status bar
   shows 1,500, the problems list contains all 1,500, and the editor underlines at most 1,000 of them.
10. **Given** a document has no lint findings, **When** the user runs Lint, **Then** the status bar
    shows 0 problems and no underlines appear.
11. **Given** a document whose tidied text would render differently from the original, **When** the
    user runs Format or Compact, **Then** the document is unchanged and a notice explains that the
    document could not be tidied safely.
12. **Given** the active document is open read-only, **When** the user looks at Format and Compact,
    **Then** they are disabled with a tooltip stating the document is read-only, and Lint remains
    available.
13. **Given** a 3 MiB editable document, **When** the user runs Format, **Then** progress is shown, the
    Format control is replaced by Cancel until the run ends, and cancelling leaves the document
    unchanged.
14. **Given** a paragraph line ends with two spaces (a hard line break) and another line ends with one
    space, **When** the user runs Compact or Format, **Then** the hard line break is kept, the single
    trailing space is removed, and Lint reports only the single trailing space.
15. **Given** a tight bullet list, a word with intraword emphasis `foo*bar*baz`, and a list of `-` items
    directly followed by a list of `*` items, **When** the user runs Format, **Then** the list stays
    tight, the intraword emphasis keeps `*`, the two lists still render as two separate lists, and Lint
    reports none of these.
16. **Given** Lint has reported findings, **When** the user edits the document, **Then** the underlines
    stay visible, and the problem count and the problems list are marked as out of date until Lint runs
    again.
17. **Given** Format is running on a 3 MiB document, **When** the user looks at Compact and Lint and then
    types in the document before the run ends, **Then** Compact and Lint are disabled with a tooltip
    stating that another operation is in progress, the Format result is discarded, the typed text is
    kept, and a notice states that the document changed during the run.
18. **Given** a document produces 12,000 lint findings, **When** Lint finishes, **Then** the status bar
    shows 12,000 and the problems list shows the first 10,000 findings followed by "2,000 more not
    shown".
19. **Given** a document smaller than 1 MiB whose Format run lasts longer than one second, **When** the
    user runs Format, **Then** progress is shown and the Format control is replaced by Cancel once the run
    has lasted one second, and cancelling leaves the document unchanged.

---

### User Story 3 - Follow a link to another local file (Priority: P2)

A user reading a document clicks a link to another Markdown file. That file opens in a tab and becomes
the active document in both the editor and the preview. If the file belongs to the open folder, the
folder tree reveals and selects it, so the user can see where they are.

**Why this priority**: Linked notes and documentation sets are a primary reason to open a folder.
Following links is the fastest way to move through them, and today it fails for anything outside the
current document's folder and leaves the editor showing the old document.

**Independent Test**: Open a folder containing `docs/a.md` linking to `docs/sub/b.md`, `../c.md` and a
file outside the folder; activate each link and check the active tab, the editor content, the preview
and the tree selection.

**Acceptance Scenarios**:

1. **Given** a folder is open and `a.md` links to `sub/b.md` inside it, **When** the user activates the
   link in the preview, **Then** `b.md` opens in a new tab, becomes the active tab, the editor and the
   preview show `b.md`, and the tree expands `sub`, selects the `b.md` row and scrolls it into view.
2. **Given** `b.md` is already open in a tab, **When** the user activates a link to it, **Then** no
   second tab opens; the existing tab becomes active, and the tree reveals it as in scenario 1.
3. **Given** a link points to a supported document outside the open folder, or no folder is open,
   **When** the user activates it, **Then** the document opens (or its tab is focused) and becomes
   active, and the tree selection does not change.
4. **Given** the user has typed unsaved edits in `a.md`, **When** they activate a link to `b.md`,
   **Then** the edits in `a.md` are kept in its tab before `b.md` becomes active.
5. **Given** a link `b.md#setup` where `b.md` has a heading `## Setup`, **When** the user activates it,
   **Then** `b.md` becomes active and its preview is scrolled to that heading.
6. **Given** a link points to `report.pdf` that exists on disk, **When** the user activates it, **Then**
   nothing opens, and a notice names `report.pdf`, states that it is not a document the editor can open,
   and offers "Reveal in file manager", which shows the file in the system file manager when chosen.
7. **Given** a link points to a supported document that does not exist, **When** the user activates it,
   **Then** no tab opens and a notice names the missing file.
8. **Given** 40 documents are already open, **When** the user activates a link to a document that is not
   open, **Then** no tab opens and the existing capacity notice is shown.
9. **Given** the target is inside the open folder but has no tree row (it or a parent folder begins with
   a dot and hidden folders are not shown, or the tree was truncated at its entry limit), **When** the
   user activates the link, **Then** the document opens and becomes active, and no error about the tree
   is shown.
10. **Given** an untitled document contains a relative link, **When** the user activates it, **Then** the
    link is refused with a notice explaining that relative links need a saved document.
11. **Given** a link target is a network share path such as `//server/share/notes.md`, **When** the user
    activates it, **Then** nothing is read or opened and the existing refused-link notice is shown.

---

### User Story 4 - Follow links from the editor (Priority: P2)

A user working in the editor holds Cmd (macOS) or Ctrl (Windows, Linux) and clicks the target of a
Markdown link. The same thing happens as when the link is activated in the preview.

**Why this priority**: Users in the Editor-only arrangement have no preview to click. The behaviour
reuses User Story 3, so it adds little risk.

**Independent Test**: In the Editor-only arrangement, Cmd/Ctrl+click a link to another document and a
web link, and plain-click the same links.

**Acceptance Scenarios**:

1. **Given** the editor shows `[next](next.md)`, **When** the user Cmd/Ctrl+clicks inside `next.md` or
   the link text, **Then** the outcome is identical to activating the same link in the preview.
2. **Given** the same line, **When** the user clicks without the modifier, **Then** only the caret
   moves.
3. **Given** the editor shows `[site](https://example.org)`, **When** the user Cmd/Ctrl+clicks it,
   **Then** the address opens in the system browser, exactly as from the preview.
4. **Given** the Editor-only arrangement and a link `[setup](b.md#setup)` where `b.md` has `## Setup`,
   **When** the user Cmd/Ctrl+clicks it, **Then** `b.md` becomes active and the caret is placed on the
   `## Setup` line with that line scrolled into view.

---

### User Story 5 - Choose the Markdown standard and tidy preferences (Priority: P3)

A user chooses how strictly documents are interpreted (Minimal, GFM or Full), which markers Format and
Lint prefer, and whether saving formats and lints automatically.

**Why this priority**: The defaults serve most users; the choices matter for users who share documents
with tools that use a narrower dialect or a different house style.

**Independent Test**: Change each setting in the Markdown settings group, confirm the preview, the
status indicators, Format output and Lint findings follow it, restart the application and confirm the
choices persist.

**Acceptance Scenarios**:

1. **Given** the standard is Full, **When** the user chooses GFM, **Then** every open document's preview
   re-renders, formulas and admonitions appear as literal text, tables and footnotes still render, and
   the preview header and status bar show "GFM".
2. **Given** the standard is Minimal, **When** a document contains a table and a Mermaid block, **Then**
   the table appears as literal text and the diagram still renders.
3. **Given** the bullet preference is `*`, **When** the user runs Format, **Then** bullets become `*`,
   and Lint reports `-` bullets as findings.
4. **Given** Format on save and Lint on save are both on, **When** the user saves the active document
   explicitly, **Then** Format runs first, the formatted text is what gets saved, and Lint runs after the
   save.
5. **Given** Format on save and Lint on save are on, **When** an autosave happens, **Then** neither
   Format nor Lint runs.
6. **Given** the application starts for the first time, **When** the user opens the Markdown settings
   group, **Then** it shows Full, `-` bullets, `_` emphasis, ATX headings, Format on save off and Lint on
   save on.
7. **Given** Format on save is on, **When** the user closes a tab that is not active and chooses Save in
   the prompt, **Then** Format does not run, the text is saved as it is, and a notice states that
   formatting was skipped.

---

### User Story 6 - Highlighted code and Mermaid source in the editor (Priority: P3)

A user writing a Mermaid diagram or a code sample inside a fenced block sees that source coloured in the
editor according to its language, in the current theme.

**Why this priority**: It improves writing comfort but no workflow depends on it.

**Independent Test**: Type a ` ```mermaid ` block and a ` ```python ` block in the editor and check the
colouring in each of the six theme combinations.

**Acceptance Scenarios**:

1. **Given** the editor shows a ` ```mermaid ` block, **When** the user looks at it, **Then** diagram
   keywords (such as `flowchart`, `sequenceDiagram`, `subgraph`, `end`), arrows, quoted labels and `%%`
   comments are each coloured distinctly from plain text.
2. **Given** the editor shows a fenced block in any language listed in FR-RN-006, **When** the user looks
   at it, **Then** keywords, strings and comments are coloured with the same palette the preview uses
   for that language.
3. **Given** the user switches theme or appearance mode, **When** they look at the editor, **Then** the
   code colours follow the new theme.

---

### Edge Cases

- **Large documents**: live preview keeps its existing pause above 2 MiB with manual refresh. Below that
  bound, re-rendering a large document at the Full standard can block the interface for several seconds
  on each preview update; FR-RN-011 covers diagram and formula rendering, not document parsing, and
  SC-002 applies to documents up to 100 KB. Documents opened read-only because they exceed 10 MiB cannot
  be formatted or compacted.
- **Raw HTML identifiers**: an `id` written in raw HTML is kept, so an in-document link can scroll to
  it; anchor scrolling affects only the preview.
- **Link spelling**: percent-encoded names (`My%20Notes.md`), paths with spaces in angle brackets
  (`<My Notes.md>`), `./` and `../` segments, absolute paths and Windows back-slash paths on Windows all
  resolve to the same target as their plain relative form.
- **Link identity**: a symbolic link or a hard link to an already-open document focuses the existing
  tab; on a case-insensitive filesystem a path that differs only in capitalisation from an open
  document focuses that tab.
- **Link to itself**: a link to the current document with a heading fragment only scrolls; without a
  fragment it does nothing visible.
- **Network paths and other schemes**: `\\server\share\x.md`, `//server/share/x.md`, `\\?\` and `\\.\`
  paths are refused on every operating system (FR-LK-009); `mailto:`, `data:`, `javascript:`, `ftp:`
  and `file:` addresses are refused like every other non-web scheme (FR-LK-011).
- **Offline**: rendering, formatting, linting and link handling never make a network request, and all
  fonts and styles they need ship with the application.

## Requirements _(mandatory)_

### Functional Requirements

#### Rendering (FR-RN)

- **FR-RN-001**: The application shall offer three Markdown standards, Minimal, GFM and Full, apply the
  selected standard to every open document's preview, and default to Full.
- **FR-RN-002**: While the standard is Minimal, the preview shall render CommonMark, fenced-code
  highlighting and Mermaid diagrams, and shall show every other construct as literal text.
- **FR-RN-003**: While the standard is GFM, the preview shall additionally render tables (with column
  alignment), task lists as read-only checkboxes, strikethrough, extended autolinks and footnotes, and
  shall parse and not display top-of-document YAML front matter; front matter is grouped with GFM as a
  product choice, not as GFM syntax.
- **FR-RN-004**: While the standard is Full, the preview shall additionally render inline math written
  as `$…$`, display math written as `$$…$$` or as a ` ```math ` fenced block, GitHub alerts
  (`> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`) with a localized title and icon,
  and container directives `:::note`, `:::tip`, `:::important`, `:::warning` and `:::caution` rendered
  as the matching admonition; a container directive with any other name shall render as literal text.
- **FR-RN-005**: While the standard is Full, an inline formula shall open at a `$` that is not followed
  by a space and close at the next `$` that is not preceded by a space and not followed by a digit; an
  opening `$` with no such closing `$` within the next 10,000 characters shall be literal text, and an
  escaped `\$` shall always be a literal dollar sign.
- **FR-RN-006**: The preview shall colour fenced code in at least these languages: JavaScript,
  TypeScript, JSX/TSX, Go, Python, Java, C, C++, C#, Rust, Ruby, PHP, Kotlin, Swift, SQL, JSON, YAML,
  TOML, XML/HTML, CSS, SCSS, Bash/shell, PowerShell, Dockerfile, Makefile, diff and Markdown, using the
  theme's code palette; and if a block names another or no language, or is longer than 200,000
  characters, then it shall show the block as plain monospaced text.
- **FR-RN-007**: When a document contains a ` ```mermaid ` block, the preview shall render it as a
  diagram in its place, supporting at least flowchart, sequence, class, state, entity-relationship,
  Gantt, pie, mindmap, timeline, git graph, journey and quadrant diagrams; and if the block cannot be
  parsed, then it shall show an error box containing the parser's message in place of that block only.
- **FR-RN-008**: At every standard the preview shall apply one raw-HTML policy: it shall render the
  elements `details`, `summary`, `kbd`, `sub`, `sup`, `mark`, `ins`, `del`, `br` and `abbr`, and `img`
  and `a` subject to the existing image and link policies; render raw HTML for ordinary Markdown element
  kinds (such as paragraphs, headings, lists, tables, emphasis, code and quotations) as their Markdown
  equivalents; remove together with their contents the elements that execute, embed, load foreign content
  or act as form controls: `script`, `style`, `iframe`, `object`, `embed`, `form`, `noscript`, `template`,
  `textarea`, `select`, `button`, `svg`, `math`, `title`, `head`, `frame`, `applet`, `link`, `meta`, `base`,
  `audio`, `video`, `canvas`, `noembed`, `noframes`, `xmp`, `plaintext`, `dialog` and `portal`; unwrap every
  other element while keeping its text and permitted descendants; and drop every
  event-handler attribute, style attribute and `javascript:` or `data:` address.
- **FR-RN-009**: Where a formula is invalid, the preview shall show an inline error marker containing
  the formula's source and render the rest of the document; formula rendering shall never execute
  document-supplied commands or load resources.
- **FR-RN-010**: The preview shall render Mermaid diagrams without running any script or click action
  supplied by the document and without loading any resource, shall show link directives inside a
  diagram without making them activatable, and shall ignore theme and look settings supplied inside a
  diagram; the shown diagram shall contain no script, no event-handler attribute, no `javascript:` or
  `data:` address, no external reference and no activatable link, while keeping its own styling.
- **FR-RN-011**: While the user is typing, diagram and formula rendering shall not delay keystroke
  handling, and when a newer version of the text exists, the preview shall discard any diagram result
  produced for older text.
- **FR-RN-012**: If a document contains more than 50 Mermaid blocks or more than 1,000 formulas, or a
  Mermaid source longer than 50,000 characters or a formula longer than 10,000 characters, then the
  preview shall render the first 50 diagrams and the first 1,000 formulas and replace each excess or
  oversized item with a localized placeholder stating the reason.
- **FR-RN-013**: When the theme or appearance mode changes, the preview shall redraw every visible
  diagram and recolour code and formulas from the active theme within one second, in all six theme and
  mode combinations.
- **FR-RN-014**: The preview shall give each heading an anchor formed by lowercasing its text, removing
  every character other than letters and combining marks of any script, digits, spaces, hyphens and
  underscores, and replacing each space with a hyphen; the second and later headings with the same
  anchor shall receive `-1`, `-2` and so on in document order.
- **FR-RN-015**: When the user changes the Markdown standard, the application shall re-render every open
  document's preview and update the standard shown in the preview header and the status bar within one
  second, without reopening any document.
- **FR-RN-016**: If the preview cannot render a document at all, then it shall keep the last successful
  rendering of that document and show an inline error.
- **FR-RN-017**: Rendering, code highlighting, diagrams and formulas shall use only assets shipped inside
  the application and shall make no network request.

#### Tidy actions (FR-TD)

- **FR-TD-001**: When the user triggers Format from the toolbar, the Format menu group, the editor
  context menu or Alt+Shift+F, the application shall rewrite the active document in the canonical style:
  bullet, emphasis and heading markers from the tidy preferences, `**` strong markers, padded and aligned
  tables, one blank line between blocks outside lists, and a single final newline.
- **FR-TD-002**: Format shall keep paragraph line breaks, hard line breaks, each list's tight or loose
  spacing, ordered-list numbering style, the separation of adjacent lists, `*` for intraword emphasis,
  indented code, link and image destinations, front matter, HTML, math and the contents of every fenced
  or indented code block, and shall produce text that renders the same as the original at the Full
  standard.
- **FR-TD-003**: Where the heading preference is Setext, Format shall write level 1 and 2 headings as
  Setext and keep levels 3 to 6 as ATX.
- **FR-TD-004**: When Format runs on a document it has already formatted with the same preferences, the
  document text shall not change.
- **FR-TD-005**: When the user triggers Compact from the toolbar, the Format menu group, the editor
  context menu or Alt+Shift+C, the application shall replace every run of two or more blank lines with
  one blank line and remove trailing spaces and tabs outside fenced and indented code, except a run of
  two or more spaces that forms a hard line break, and shall change nothing else.
- **FR-TD-006**: Format, Compact and Lint shall act on the active document only, shall parse it with the
  Full standard's syntax regardless of the standard selected for the preview, and shall treat `.txt`
  documents like Markdown documents.
- **FR-TD-007**: If the result of Format or Compact would render differently from the current text at
  the Full standard, then the application shall leave the document unchanged and show a notice that the
  document could not be tidied safely.
- **FR-TD-008**: When Format or Compact changes the text, the application shall apply the result as one
  undo step, mark the document as having unsaved changes, and keep the caret on the same logical line
  where that line still exists; when the result equals the current text, the application shall leave
  the document and its undo history unchanged.
- **FR-TD-009**: When the user triggers Lint from the toolbar, the Format menu group, the editor context
  menu or Alt+Shift+L, the application shall check the active document against the rule set of FR-TD-010,
  without changing its text, and replace any earlier findings for that document.
- **FR-TD-010**: The lint rule set shall contain exactly these ten rules: unordered-list marker matches
  the bullet preference (warning); emphasis marker matches the emphasis preference, except intraword
  emphasis (warning); strong marker is `**` (warning); heading style matches the heading preference,
  with levels 3 to 6 always accepted as ATX (warning); list-item indentation is consistent (warning); at
  most one top-level heading (warning); no trailing whitespace other than a hard-line-break run of two
  or more spaces (error); no consecutive blank lines (warning); fenced code declares a language
  (warning); file ends with a newline (error).
- **FR-TD-011**: When Lint finishes, the application shall underline the first 1,000 findings in document
  order in the editor, each with a hover message naming the rule, severity and fix hint.
- **FR-TD-012**: When Lint finishes, the status bar shall show the exact number of findings for the
  active document, including counts above 1,000, and 0 for a clean document.
- **FR-TD-013**: The application shall provide a problems list, opened from the status-bar count or the
  View menu, that lists the first 10,000 findings of the active document in document order with
  severity, line, column and message, followed by "N more not shown" when there are more; when the user
  activates a finding by mouse or keyboard, the editor shall move the caret to that finding and take
  focus.
- **FR-TD-014**: While a document has been edited since its last Lint run, the application shall keep
  its findings visible and mark the count and the problems list as out of date. When another document
  becomes active or the document closes, the application shall discard its findings, underlines, count
  and problems list, and returning to the document shall show none until Lint runs again.
- **FR-TD-015**: Every Format, Compact or Lint run shall hold the window's operation slot from its start
  until exactly one outcome occurs. When the document is larger than 1 MiB, or once the run has lasted
  longer than one second, the application shall show progress and replace the triggering control with
  Cancel until that outcome. Cancellation or failure
  shall leave the document text and the previous findings unchanged. If the document changes, or
  another document becomes active, while a run is in progress, the application shall discard the run's
  result, keep the user's text and, while the document stays active, its previous findings, and show a
  notice that the document changed during the run.
- **FR-TD-016**: While the active document is read-only, the application shall disable Format and
  Compact with a tooltip stating that the document is read-only and keep Lint available, as Lint needs
  an open document but not a writable one; while a run holds the operation slot, it shall disable
  Format, Compact and Lint, other than the running action's Cancel, with a tooltip stating that another
  operation is in progress.

#### Links (FR-LK)

- **FR-LK-001**: When the user activates a link whose target resolves, after percent-decoding, `./`/`../`
  resolution and symbolic-link resolution, to an existing supported document anywhere on the local disk,
  the application shall open it through the normal open flow, focusing its existing tab if it is already
  open, and make it the active document.
- **FR-LK-002**: Before a link opens or focuses another document, the application shall keep the
  outgoing document's latest edits exactly as every other open route does, and every visible editor or
  preview pane shall show the target document once it is active.
- **FR-LK-003**: When the activated link carries a `#fragment` matching a heading anchor (FR-RN-014) in
  the target document, the application shall scroll the preview to that heading if the preview is
  visible and place the caret on that heading's line, scrolled into view, if the editor is visible; and
  if no heading matches, then it shall show the document from its top without an error.
- **FR-LK-004**: While a folder is open, when a link opens or focuses a document that is inside that
  folder and has a row in the tree, the tree shall expand every collapsed ancestor folder of that row,
  select the row and scroll it into view, without changing the expansion of other folders.
- **FR-LK-005**: The application shall decide whether a target is inside the open folder by comparing
  the target's symbolic-link-resolved path with the folder's symbolic-link-resolved root, using the
  filesystem's own capitalisation rules.
- **FR-LK-006**: If the link target is outside the open folder, no folder is open, or the target has no
  tree row, then the application shall open the document without changing the tree and without showing
  a tree-related message.
- **FR-LK-007**: If a local link resolves to an existing file that is not a supported document, then the
  application shall not open it and shall show a notice naming the file and offering "Reveal in file
  manager", which shows that file in the operating system's file manager when chosen, wherever the file
  is on the local disk; the application shall never launch another program for the file.
- **FR-LK-008**: If a local link target does not exist, cannot be read, is a folder, is larger than
  50 MiB or would exceed the 40-document limit, then the application shall open no tab and show the same
  notice the Open command shows for that condition, naming the target file.
- **FR-LK-009**: If a local link target is a UNC path (with forward or back slashes), a device-namespace
  path or any other network path, then on every operating system the application shall read nothing
  from it and show the existing refused-link notice.
- **FR-LK-010**: While the linking document is untitled, the application shall refuse relative link
  targets with a notice stating that relative links need a saved document, and shall still handle
  absolute local targets and `http`/`https` targets.
- **FR-LK-011**: The application shall continue to scroll to in-document anchors, open `http` and
  `https` links in the system browser, and refuse every other scheme, including `file:`, with the
  existing notice naming the target and the reason.
- **FR-LK-012**: When the user Cmd-clicks (macOS) or Ctrl-clicks (Windows, Linux) the text or target of
  an inline, reference-style or autolink in the editor, the application shall handle it exactly as
  FR-LK-001 to FR-LK-011 describe for the preview; a click without the modifier shall only move the
  caret.
- **FR-LK-013**: The same link text shall produce the same outcome whether it is activated in the
  preview or in the editor.
- **FR-LK-014**: On Windows the application shall accept back-slash separators and drive-letter paths in
  local link targets and resolve them to the same target as the equivalent forward-slash form.

#### Settings and save (FR-ST)

- **FR-ST-001**: The Settings view shall show a Markdown group containing: Markdown standard (Minimal,
  GFM, Full), bullet marker (`-`, `*`, `+`), emphasis marker (`_`, `*`), heading style (ATX, Setext),
  Format on save and Lint on save, each operable by keyboard.
- **FR-ST-002**: The defaults shall be Full, `-`, `_`, ATX, Format on save off and Lint on save on, and
  every surface that shows a Markdown setting shall show the same stored value; until the stored
  settings have loaded, the preview header and the status bar shall show no Markdown standard, the
  Markdown settings controls, Format, Compact, Lint and the toolbar actions that insert a bullet or
  emphasis marker shall be unavailable, and the preview shall show a loading state instead of the
  document.
- **FR-ST-003**: When the user changes a Markdown setting, the application shall persist it so it
  survives a restart and apply it without restarting: the standard to the preview, the bullet and
  emphasis markers to the toolbar formatting actions, Format and Lint, and the heading style to Format
  and Lint only, the toolbar heading actions staying ATX as spec 002 FR-ED-014 requires.
- **FR-ST-004**: When the user saves the active document explicitly (Save, Save As, or the Save choice of
  a close or quit prompt) while Format on save is on, the application shall run Format first, as one
  undo step, and save the formatted text; and while Lint on save is on, it shall run Lint on the active
  document after the save completes, or skip it without a notice while the operation slot is busy. An
  explicit save of any other document shall run neither.
- **FR-ST-005**: If Format on save cannot run because the saved document is not the active document,
  or because Format is refused under FR-TD-007, is cancelled, fails, is discarded under FR-TD-015 or
  finds the operation slot busy, then the application shall save the document's current unformatted
  text and show a notice that formatting was skipped, with the reason.
- **FR-ST-006**: When an autosave writes a document, the application shall run neither Format nor Lint.

#### Editor highlighting (FR-HL)

- **FR-HL-001**: The editor shall colour the contents of ` ```mermaid ` blocks, distinguishing
  diagram-type keywords, structural keywords, arrows and links, quoted labels and `%%` comments.
- **FR-HL-002**: The editor shall colour fenced code blocks in every language listed in FR-RN-006 with
  the same code palette the preview uses, in all six theme and mode combinations.

### Key Entities

- **Markdown standard**: the global rendering level (Minimal, GFM, Full). It determines which constructs
  render and which stay literal, and it is shown in the preview header and status bar.
- **Tidy preferences**: bullet marker, emphasis marker, heading style, Format on save and Lint on save.
  They are shared by the toolbar formatting actions, Format and Lint, and persisted with the other
  settings.
- **Operation slot**: the window's single allowance for one Format, Compact or Lint run; a run holds it
  from its start until its outcome.
- **Lint finding**: one rule violation in one document, with rule name, severity (error or warning),
  start and end line and column, and a message. It belongs to exactly one document and one Lint run.
- **Problems summary**: the findings of the active document's latest Lint run, their exact count, and
  whether the document changed since that run. It is discarded when another document becomes active or
  its document closes; findings and underlines are not restored on return, and Lint must run again.
- **Link target**: the outcome of an activated link: in-document anchor, supported local document (with
  optional heading fragment), unsupported local file, web address, or refused target with a reason.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A reference document containing every construct of FR-RN-003 and FR-RN-004 renders at the
  Full standard with zero constructs shown as literal source, and at GFM with exactly the Full-only
  constructs literal.
- **SC-002**: For documents up to 100 KB, the preview reflects typed text within 300 ms after typing
  stops, and each of up to 10 diagrams appears within 2 seconds of the document opening.
- **SC-003**: Across a corpus of at least 30 varied documents, running Format twice yields identical
  text on 100% of them, Compact never changes the result rendered at the Full standard, and every code
  block is byte-identical after Format and Compact.
- **SC-004**: The problem count equals the true number of findings for documents with 0, 1, 10 and
  1,500 findings.
- **SC-005**: From one link activation, the target document is the active tab, the editor content and
  the preview in 100% of trials for in-folder, out-of-folder and no-folder cases, and an in-folder target
  with a tree row is visible and selected in the tree in 100% of those trials.
- **SC-006**: During a session that opens the reference document, formats, compacts, lints and follows
  every link type, the application makes zero outbound network requests.
- **SC-007**: Every new control (tidy actions, problems list, Markdown settings group, reveal action in
  notices) is fully operable by keyboard, has an accessible name, and renders correctly in all six theme
  and mode combinations.
- **SC-008**: A user can tidy a messy document into house style in one action and undo it in one
  action.

## Assumptions

- The code-highlighting language list in FR-RN-006 is a minimum; supporting more languages is allowed
  if it adds no network access.
- Existing bounds stay unchanged: 2 MiB live-preview pause, 10 MiB editable limit, 50 MiB open limit,
  40 open documents and the 20,000-entry folder tree limit.
- Growth in application size from bundled fonts, diagram and formula renderers is accepted for offline
  operation.

## Dependencies

**Status (2026-09-29)**: all five items below were completed during planning: the Principle IV amendment is in the constitution (version 2.2.0) and ADR-0036 to ADR-0039 are recorded in `docs/architecture.md`. The text below is kept as the statement of what each decision must contain.

- **Constitution amendment (blocking FR-LK-001, FR-LK-007, FR-LK-010, FR-LK-014)**: Principle IV allows a
  preview link to open only local Markdown inside the document's folder. Before these requirements are
  implemented, the repository's constitution must be amended through its amendment procedure (written
  proposal, approval before the edit, Sync Impact Report, MINOR version 2.2.0) so that links open
  "in-document anchors, supported local Markdown documents anywhere on the local disk (never network or
  device paths; unsupported files are refused with an offer to reveal them in the file manager), and
  `https`/`http` targets".
- **Architecture decision ADR-0036 (blocking FR-RN-008)**: the repository's architecture decisions must
  record the single raw-HTML policy of FR-RN-008, replacing ADR-0030's per-standard sanitization.
- **Architecture decision ADR-0037 (blocking FR-LK-001, FR-LK-007)**: the repository's architecture
  decisions must record the link scope of FR-LK-001 and the unsupported-file outcome of FR-LK-007,
  replacing the folder limit of decision D11.
- **Architecture decision ADR-0038 (blocking FR-TD-001, FR-TD-002, FR-TD-005, FR-TD-007)**: the repository's
  architecture decisions must record that Format and Compact change only the text the preferences require
  and are refused when the result would render differently, replacing ADR-0031's whole-document rewrite.
- **Architecture decision ADR-0039 (blocking FR-TD-015, FR-TD-016)**: the repository's architecture
  decisions must record the window's operation slot for Format, Compact and Lint, refining ADR-0032.

## Changes to earlier specs

- **Spec 001 FR-018 and its settings table**: the default Markdown standard is Full (FR-RN-001,
  FR-ST-002).
- **Spec 001 FR-048, FR-049, FR-050**: Format, Compact and Lint behave as FR-TD-001 to FR-TD-016 state,
  including the ten lint rules (FR-TD-010) and the 10,000-row problems list (FR-TD-013); an explicit save
  runs Format and Lint as the settings select (FR-ST-004 to FR-ST-006).
- **Spec 001 FR-051 and the long-operation scenario naming Format, Compact and Lint**: for tidy actions,
  "one long operation at a time" means the window's operation slot (FR-TD-015, FR-TD-016).
- **Spec 002 FR-ED-010, FR-ED-017 (second sentence), FR-ED-018**: Format, Compact and Lint are working
  actions (FR-TD-001, FR-TD-005, FR-TD-009).
- **Spec 002 FR-ED-021**: Lint needs an open document; Format and Compact need a writable one
  (FR-TD-016).
- **Spec 003 FR-FT-056 and its toolbar clarification**: the Format, Compact and Lint toolbar controls
  are available; the image control stays deferred.
- **Spec 004 FR-014, decision D11 and the architecture section "Links, files and images"**: links open
  supported documents anywhere on the local disk, and other local files are refused with "Reveal in file
  manager" (FR-LK-001, FR-LK-007); ADR-0037 records this.
- **ADR-0030**: one raw-HTML policy applies at every standard (FR-RN-008); ADR-0036 records it.
- **ADR-0031**: Format keeps the original text wherever the preferences need no change and is refused
  when its result would render differently (FR-TD-002, FR-TD-007); ADR-0038 records it.
- **ADR-0032**: tidy actions use a per-window operation slot, and no application-wide operation registry
  is built (FR-TD-015); ADR-0039 records it.
- **Constitution Principle IV**: amended as stated under Dependencies.
- **Unchanged**: spec 002 FR-ED-014 (toolbar heading actions stay ATX) and the zoom and pan clause of
  spec 001 FR-022 (deferred).
