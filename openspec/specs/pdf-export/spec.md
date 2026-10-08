# pdf-export Specification

## Purpose

Defines how the user exports the active document to PDF through the operating system's print dialog, how faithfully the
export follows the preview, and how the PDF appearance setting styles it.

## Requirements

### Requirement: Export to PDF

WHEN a document is active and the user chooses File, Export to PDF… or presses Ctrl+P (Cmd+P on macOS), the system
SHALL open the operating system's print dialog for it, to save a PDF or print. Cancelling SHALL write nothing.
Exporting SHALL NOT change the document, its modified state, its arrangement or Reading mode. While no document or a
modal dialog is open, the command SHALL be unavailable and Ctrl+P SHALL open no print dialog of any kind.

#### Scenario: Save as PDF

- **WHEN** `guide.md` is active, the user presses Ctrl+P (Cmd+P on macOS) and saves `guide.pdf` from the print dialog
- **THEN** `guide.pdf` contains the rendered document
- **AND** it contains no menu bar, toolbar, tab bar, sidebar, editor, problems panel or status bar

#### Scenario: Suggested file name

- **WHEN** the saved document `guide.md` is exported
- **THEN** the print dialog suggests the file name `guide`
- **AND** an Untitled document keeps the default suggestion

#### Scenario: Cancel the dialog

- **WHEN** the user chooses File, Export to PDF… and cancels the print dialog
- **THEN** no file is written and the document, its modified state and its arrangement are unchanged

#### Scenario: Unsaved text

- **WHEN** the active Untitled document contains the unsaved text `# Draft` and the user exports it
- **THEN** the PDF shows the heading "Draft" and the document stays modified

#### Scenario: No document

- **WHEN** the launcher is shown because no document is open
- **THEN** Export to PDF… in the File menu is disabled and Ctrl+P opens no print dialog

#### Scenario: Reading mode stays active

- **WHEN** Reading mode is active and the user presses Ctrl+P and then closes the print dialog
- **THEN** Reading mode is still active and shows the same document

### Requirement: Exported content matches the preview

The export SHALL contain the whole active document rendered as the preview renders it at the current Markdown standard:
highlighted code, Mermaid diagrams drawn as in the preview, math and alerts only where that standard renders them, and
the preview's placeholders for remote images and render limits. It SHALL use the current unsaved text, SHALL NOT depend
on the arrangement, the scroll position or a paused preview, and SHALL continue over as many pages as needed.

#### Scenario: Mermaid diagram

- **WHEN** the document contains a valid `mermaid` flowchart and the user exports it
- **THEN** the PDF shows the drawn diagram and not its source text

#### Scenario: Math under GFM

- **WHEN** the Markdown standard is GFM and the document contains `$x^2$`
- **THEN** the PDF shows the text `$x^2$` literally

#### Scenario: Math under Full

- **WHEN** the Markdown standard is Full and the document contains `$x^2$`
- **THEN** the PDF shows the rendered formula, as the preview does

#### Scenario: Preview hidden

- **WHEN** the document is shown in the Editor arrangement with no preview and the user exports it
- **THEN** the PDF contains the rendered document

#### Scenario: Long document

- **WHEN** the document holds 400 paragraphs numbered 1 to 400 and the user exports it
- **THEN** the PDF contains paragraphs 1 to 400 in order, spread over several pages

#### Scenario: Paused preview

- **WHEN** the document is 3 MiB, so the preview shows the paused notice, and the user exports it
- **THEN** the PDF contains the rendered document and not the paused notice

#### Scenario: Remote image

- **WHEN** the document references the image `https://example.com/a.png` and the user exports it
- **THEN** the PDF shows the same placeholder as the preview and no network request is made

### Requirement: Waiting for diagrams and images before export

WHEN the user exports, the system SHALL open the print dialog once no Mermaid diagram of the export is still rendering
and every image of the export has loaded or failed, or once 10 seconds have passed since the export started, whichever
comes first. A diagram that failed or shows a limit placeholder SHALL count as finished. Content still loading at that
point SHALL be exported as it is shown then. A second export request made while the system is waiting SHALL be ignored.

#### Scenario: Diagrams finish in time

- **WHEN** the document contains three diagrams that finish rendering 2 seconds after the export starts
- **THEN** the print dialog opens after all three are drawn and the PDF shows all three diagrams

#### Scenario: Local image

- **WHEN** `guide.md` shows the image `figure.png` stored next to it and the user exports it
- **THEN** the PDF shows `figure.png`

#### Scenario: Diagram still rendering

- **WHEN** one diagram is still rendering 10 seconds after the export started
- **THEN** the print dialog opens and that diagram appears with "Rendering diagram…"

#### Scenario: Second request while waiting

- **WHEN** an export is waiting for a diagram and the user presses Ctrl+P again
- **THEN** only one print dialog opens

### Requirement: Export appearance

The export SHALL follow the PDF appearance setting. Styled, the default, SHALL use the colors and fonts of the current
theme and appearance mode as the preview shows them, including the page background. Clean SHALL use dark text on a white
page with neutral code and diagram colors, whatever the theme and mode. The setting SHALL NOT change the preview or
Reading mode on screen.

#### Scenario: Styled in Dark mode

- **WHEN** the theme is Material, the mode is Dark, PDF appearance is Styled and the user exports a document
- **THEN** the PDF pages show the dark preview background and the preview's text colors

#### Scenario: Clean in Dark mode

- **WHEN** the mode is Dark, PDF appearance is Clean and the user exports a document with a Mermaid diagram
- **THEN** the PDF pages are white with dark text and the diagram is drawn in light-background colors

#### Scenario: Screen unchanged

- **WHEN** the user switches PDF appearance from Styled to Clean in Dark mode
- **THEN** the preview on screen keeps its dark theme colors
