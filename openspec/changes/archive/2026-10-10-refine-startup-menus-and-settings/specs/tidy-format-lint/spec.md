# Spec Delta

## MODIFIED Requirements

### Requirement: Format

WHEN the user runs Format from the toolbar, the Markdown menu, the editor context menu or Alt+Shift+F, the system SHALL rewrite the active document in canonical style: preferred bullet, emphasis and heading markers, `**` for strong, aligned tables, one blank line between blocks outside lists and a single final newline, preserving everything else, including code block contents, link destinations, front matter, HTML and math.

#### Scenario: Idempotent

- **WHEN** Format runs on a document it already formatted with the same preferences
- **THEN** the text does not change and the undo history is untouched

#### Scenario: Setext headings

- **WHEN** the heading style is Setext and the document has `# Title` and `### Part`
- **THEN** Format writes the level 1 heading as Setext and keeps the level 3 heading as ATX

#### Scenario: Toolbar holds only Format

- **WHEN** a writable document is active and the user looks at the formatting toolbar
- **THEN** it offers Format and offers neither Compact nor Lint

### Requirement: Compact

WHEN the user runs Compact from the Markdown menu, the editor context menu or Alt+Shift+C, the system SHALL replace each run of two or more blank lines with one and remove trailing spaces and tabs outside code (keeping a hard-break run of two or more spaces), changing nothing else.

#### Scenario: Blank lines

- **WHEN** a document has three consecutive blank lines between paragraphs
- **THEN** Compact leaves exactly one blank line

#### Scenario: From the Markdown menu

- **WHEN** the user chooses Compact in the Markdown menu
- **THEN** Compact runs on the active document

### Requirement: Lint rules and markers

WHEN the user runs Lint (Markdown menu, context menu or Alt+Shift+L), the system SHALL check, without changing text, ten rules: bullet marker, emphasis marker (except intraword), `**` strong marker, heading style (levels 3 to 6 always ATX), consistent list indentation, one top-level heading, no trailing whitespace (error), no consecutive blank lines, fenced code language, and final newline (error); other findings are warnings.

#### Scenario: Findings underlined

- **WHEN** Lint finds problems
- **THEN** the first 1,000 findings are underlined in document order with a hover naming the rule, severity and fix hint

#### Scenario: Clean document

- **WHEN** Lint finds nothing
- **THEN** earlier underlines are cleared and the status bar count is 0

### Requirement: One bounded, cancellable operation

The system SHALL allow one Format, Compact or Lint run at a time, show progress with a Cancel control when the document exceeds 1 MiB or the run exceeds one second, disable the other tidy actions meanwhile, and on cancellation or failure leave the text and previous findings unchanged. The progress and Cancel control SHALL replace the running item in the Markdown menu and SHALL replace the toolbar's Format control whichever of the three is running.

#### Scenario: Cancel

- **WHEN** the user cancels a long Format
- **THEN** the document text is unchanged and a "Tidying cancelled" notice appears

#### Scenario: Cancel a long Compact from the toolbar

- **WHEN** the user presses Alt+Shift+C on a 2 MiB document
- **THEN** the toolbar's Format control shows Compact's progress with a Cancel control, and choosing Cancel leaves the
  text unchanged and shows "Tidying cancelled"

#### Scenario: Document changed during run

- **WHEN** the user edits the document or switches tabs while a run is in progress
- **THEN** the result is discarded and a notice says the document changed
