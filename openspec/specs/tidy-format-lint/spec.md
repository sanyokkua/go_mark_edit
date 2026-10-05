# tidy-format-lint Specification

## Purpose

Defines the document-wide Format, Compact and Lint actions, their preferences, the problems list, save-time behavior and the safeguards that keep them cancellable and bounded.

## Requirements

### Requirement: Tidy preferences

The system SHALL offer persisted Markdown preferences for bullet marker (`-` default, `*`, `+`), emphasis marker (`_` default, `*`), heading style (ATX default, Setext), Format on save (off by default) and Lint on save (on by default), and SHALL keep Format, Compact and Lint unavailable until those preferences have loaded.

#### Scenario: Change bullet marker

- **WHEN** the user selects `*` as the bullet marker
- **THEN** the next Format and Lint use `*` and the choice survives a restart

#### Scenario: Toolbar headings

- **WHEN** the heading style is Setext and the user applies a toolbar heading action
- **THEN** the heading is still written as ATX

### Requirement: Format

WHEN the user runs Format from the toolbar, the Format menu, the editor context menu or Alt+Shift+F, the system SHALL rewrite the active document in canonical style: preferred bullet, emphasis and heading markers, `**` for strong, aligned tables, one blank line between blocks outside lists and a single final newline, preserving everything else, including code block contents, link destinations, front matter, HTML and math.

#### Scenario: Idempotent

- **WHEN** Format runs on a document it already formatted with the same preferences
- **THEN** the text does not change and the undo history is untouched

#### Scenario: Setext headings

- **WHEN** the heading style is Setext and the document has `# Title` and `### Part`
- **THEN** Format writes the level 1 heading as Setext and keeps the level 3 heading as ATX

### Requirement: Compact

WHEN the user runs Compact from the toolbar, the Format menu, the editor context menu or Alt+Shift+C, the system SHALL replace each run of two or more blank lines with one and remove trailing spaces and tabs outside code (keeping a hard-break run of two or more spaces), changing nothing else.

#### Scenario: Blank lines

- **WHEN** a document has three consecutive blank lines between paragraphs
- **THEN** Compact leaves exactly one blank line

### Requirement: Safe and undoable edits

The system SHALL apply a Format or Compact result as one undo step that marks the document unsaved and keeps the caret on its logical line, and SHALL instead leave the document unchanged and show a notice when the result would render differently at the Full standard.

#### Scenario: Unsafe result

- **WHEN** the tidy result would change how the document renders
- **THEN** the text is unchanged and a "Could not tidy safely" notice appears

### Requirement: Scope of tidy actions

The system SHALL run Format, Compact and Lint on the active document only, parse it with Full syntax whatever standard the preview uses, treat `.txt` files as Markdown, and disable Format and Compact (with a read-only tooltip) for read-only documents while keeping Lint available.

#### Scenario: Read-only document

- **WHEN** the active document is read-only
- **THEN** Format and Compact are disabled and Lint runs

### Requirement: Lint rules and markers

WHEN the user runs Lint (toolbar, Format menu, context menu or Alt+Shift+L), the system SHALL check, without changing text, ten rules: bullet marker, emphasis marker (except intraword), `**` strong marker, heading style (levels 3 to 6 always ATX), consistent list indentation, one top-level heading, no trailing whitespace (error), no consecutive blank lines, fenced code language, and final newline (error); other findings are warnings.

#### Scenario: Findings underlined

- **WHEN** Lint finds problems
- **THEN** the first 1,000 findings are underlined in document order with a hover naming the rule, severity and fix hint

#### Scenario: Clean document

- **WHEN** Lint finds nothing
- **THEN** earlier underlines are cleared and the status bar count is 0

### Requirement: Problems list

The system SHALL show the exact number of findings for the active document in the status bar, open a Problems list from that count or the View menu listing the first 10,000 findings in document order with severity, line, column and message followed by "N more not shown", and move the caret to a finding and focus the editor when the user activates it by mouse or keyboard.

#### Scenario: Activate a finding

- **WHEN** the user presses Enter on a finding row
- **THEN** the editor takes focus with the caret at that finding

### Requirement: Stale and discarded findings

WHILE a document has been edited since its last Lint run, the system SHALL keep its findings visible and mark the count and list as out of date, and SHALL discard its findings, underlines and count when another document becomes active or the document closes.

#### Scenario: Edit after Lint

- **WHEN** the user types after a Lint run
- **THEN** underlines remain and the count is marked "out of date"

### Requirement: One bounded, cancellable operation

The system SHALL allow one Format, Compact or Lint run at a time, show progress with a Cancel control in place of the running action when the document exceeds 1 MiB or the run exceeds one second, disable the other tidy actions meanwhile, and on cancellation or failure leave the text and previous findings unchanged.

#### Scenario: Cancel

- **WHEN** the user cancels a long Format
- **THEN** the document text is unchanged and a "Tidying cancelled" notice appears

#### Scenario: Document changed during run

- **WHEN** the user edits the document or switches tabs while a run is in progress
- **THEN** the result is discarded and a notice says the document changed

### Requirement: Format and Lint on save

WHEN the user saves explicitly with Format on save enabled, the system SHALL format the active document first as one undo step and save the formatted text, and with Lint on save enabled SHALL lint it after the save, skipping Lint silently if another operation is running; autosave SHALL run neither.

#### Scenario: Format skipped

- **WHEN** Format on save cannot run (document not active, refused, cancelled, failed, changed or busy)
- **THEN** the unformatted current text is saved and a "Formatting skipped" notice states the reason

### Requirement: Line-ending normalization prompt

WHEN the user saves a document whose line endings are mixed, the system SHALL ask whether to normalize every line ending to the document's majority ending (the first ending on a tie) and SHALL save only after the user confirms; cancelling saves nothing, and autosave SHALL not write such a document.

#### Scenario: Confirm

- **WHEN** the user chooses "Normalize and save"
- **THEN** the file is written with one consistent line ending

#### Scenario: Cancel

- **WHEN** the user cancels the prompt
- **THEN** the file on disk and the document's unsaved state are unchanged
