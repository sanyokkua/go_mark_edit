# markdown-preview Specification

## Purpose

Defines how the live preview renders Markdown at the Minimal, GFM and Full standards, including code, math, diagrams, images and sanitization, and how it degrades on large or hostile input.

## Requirements

### Requirement: Markdown standards

The system SHALL render every open document's preview at the Markdown standard chosen in Settings (Minimal, GFM or Full; default Full), re-render all previews when it changes without reopening documents, and show a loading state instead of the document until settings have loaded.

#### Scenario: Change standard

- **WHEN** the user switches the standard from Full to Minimal
- **THEN** every open preview and the status bar reflect Minimal

### Requirement: Minimal standard

WHILE the standard is Minimal, the system SHALL render CommonMark, highlighted fenced code and Mermaid diagrams, and SHALL show all other constructs as literal text.

#### Scenario: Table under Minimal

- **WHEN** a document contains a pipe table
- **THEN** the preview shows the table source as plain text

### Requirement: GFM standard

WHILE the standard is GFM or Full, the system SHALL additionally render tables with column alignment, task lists as read-only checkboxes, strikethrough, extended autolinks and footnotes, and SHALL hide top-of-document YAML front matter.

#### Scenario: Task list

- **WHEN** a document contains `- [x] done`
- **THEN** the preview shows a checked checkbox that the user cannot toggle

### Requirement: Full standard

WHILE the standard is Full, the system SHALL additionally render inline math (`$…$`), display math (`$$…$$` or a `math` fence), GitHub alerts (NOTE, TIP, IMPORTANT, WARNING, CAUTION) and the container directives `:::note`, `:::tip`, `:::important`, `:::warning` and `:::caution`, showing a directive with any other name as literal text.

#### Scenario: Alert

- **WHEN** a quote begins with `[!WARNING]`
- **THEN** the preview shows a Warning admonition with a title and icon

#### Scenario: Escaped dollar

- **WHEN** a Full document contains `\$5` or a lone `$` with no closing `$` within 10,000 characters
- **THEN** the dollar sign is shown literally

### Requirement: Math failure and limits

The system SHALL show an invalid formula as its source text in the error color without affecting the rest of the document, SHALL render only the first 1,000 formulas, and SHALL replace each excess formula and each formula over 10,000 characters with a placeholder stating the reason.

#### Scenario: Invalid formula

- **WHEN** a formula cannot be parsed
- **THEN** its source appears as error-colored text and the remaining content renders normally

### Requirement: Code highlighting

The system SHALL colour fenced code in JavaScript, TypeScript, JSX/TSX, Go, Python, Java, C, C++, C#, Rust, Ruby, PHP, Kotlin, Swift, SQL, JSON, YAML, TOML, XML/HTML, CSS, SCSS, Bash/shell, PowerShell, Dockerfile, Makefile, diff and Markdown using the active theme's code palette, and SHALL show other languages, unlabelled blocks and blocks over 200,000 characters as plain monospaced text.

#### Scenario: Unknown language

- **WHEN** a fence names a language outside the list
- **THEN** its content is shown uncolored

### Requirement: Mermaid diagrams

The system SHALL render each `mermaid` fence as a diagram in an isolated context that runs no document script, follows no link, loads no resource and ignores theme settings in the diagram source, SHALL show an error box with the parser message in place of an unparsable block only, and SHALL render the first 50 diagrams of at most 50,000 characters each, replacing others with a placeholder.

#### Scenario: Invalid diagram

- **WHEN** a mermaid block has a syntax error
- **THEN** that block shows an error box with the parser message and other blocks render

#### Scenario: Theme change

- **WHEN** the user changes theme or appearance mode
- **THEN** visible diagrams are redrawn in the new palette

### Requirement: HTML sanitization

The system SHALL apply one raw-HTML allowlist at every standard: it renders `details`, `summary`, `kbd`, `sub`, `sup`, `mark`, `ins`, `del`, `br`, `abbr`, `img` and `a` plus ordinary Markdown element kinds; removes with their contents script, style, iframe, object, embed, form, svg, math, audio, video, canvas and similar executing or foreign-content elements; unwraps other elements; and drops event-handler attributes, style attributes and `javascript:` or `data:` addresses.

#### Scenario: Script and handler

- **WHEN** a document contains `<script>alert(1)</script>` and `<a href="#" onclick="x()">link</a>`
- **THEN** the script and its text are absent and the link has no click handler attribute

### Requirement: Heading anchors

The system SHALL give each heading a GitHub-style anchor (lowercased, punctuation removed, spaces replaced by hyphens) and add `-1`, `-2` and so on to the second and later headings with the same anchor.

#### Scenario: Duplicate headings

- **WHEN** a document has two headings titled "Setup"
- **THEN** their anchors are `setup` and `setup-1`

### Requirement: Table word wrapping

The system SHALL wrap preview table headers and cells at word boundaries, including inline code, while keeping automatic column sizing and scrolling a table horizontally when a single unbroken value exceeds the pane width.

#### Scenario: Long cell

- **WHEN** a cell contains a sentence wider than its column
- **THEN** it wraps between words and does not break inside a word

### Requirement: Images

The system SHALL display an image in the preview only when it is a relative path resolving inside the saved document's folder (including subfolders) and at most 20 MiB, and SHALL show every other image (remote, absolute path, outside the folder, or in an untitled document) as a placeholder carrying its alt text without any network request.

#### Scenario: Local image

- **WHEN** a saved document references `img/a.png` next to it
- **THEN** the preview shows that image

#### Scenario: Remote image

- **WHEN** a document references `https://example.com/a.png`
- **THEN** the preview shows the alt text placeholder and no request is made

### Requirement: Live update and degradation

The system SHALL update the preview as the user types without delaying keystrokes, keep the last successful rendering with an inline error when a document cannot be rendered, and pause the preview for a document over 2 MiB (2,097,152 bytes), showing a Refresh action that renders the current text once.

#### Scenario: Large document

- **WHEN** a document grows beyond 2 MiB
- **THEN** the preview shows a paused notice with Refresh, and Refresh renders the current content

#### Scenario: Refresh failure

- **WHEN** a manual refresh fails
- **THEN** the paused notice shows an error and a Retry action

### Requirement: Synchronized scrolling

WHILE scroll sync is on (default on) and both panes are visible, the system SHALL keep the editor and preview scrolled to the same document position by block, without oscillation, and SHALL let the user turn it off from the View menu.

#### Scenario: Scroll editor

- **WHEN** the user scrolls the editor in Split arrangement
- **THEN** the preview scrolls to the matching block

### Requirement: Selecting and copying rendered text

The system SHALL let the user select rendered text in the preview pane and in Reading mode with the mouse or with
Select all, and SHALL copy the visible text of the selection with Ctrl+C (Cmd+C on macOS) or with Copy in the preview
context menu.

#### Scenario: Copy from the preview

- **WHEN** the user selects the heading "Getting Started" in the preview and presses Ctrl+C
- **THEN** the clipboard contains "Getting Started"

#### Scenario: Copy in Reading mode

- **WHEN** the user selects the heading "Getting Started" in Reading mode and chooses Copy in the preview context menu
- **THEN** the clipboard contains "Getting Started"
