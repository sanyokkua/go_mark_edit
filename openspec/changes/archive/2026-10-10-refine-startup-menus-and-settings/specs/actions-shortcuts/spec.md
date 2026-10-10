# Spec Delta

## MODIFIED Requirements

### Requirement: Editing shortcuts

The system SHALL bind: Mod+F Find; Mod+R Replace; Mod+B Bold; Mod+I Italic; Mod+Shift+B Bold Italic; Mod+Shift+X Strikethrough; Mod+E Inline code; Mod+1, 2, 3, 4, 5, 6 Headings 1 to 6; Mod+Shift+8 Bullet list; Mod+Shift+7 Numbered list; Mod+Shift+9 Task list; Mod+Shift+. Quote; Mod+K Link; Mod+Shift+T Insert table (opens the Insert table dialog); Alt+Shift+F Format; Alt+Shift+C Compact; Alt+Shift+L Lint. Mod+Shift+I (Image) SHALL be disabled.

#### Scenario: Bold

- **WHEN** text is selected in a writable editor and the user presses Mod+B
- **THEN** the selection is wrapped as bold

#### Scenario: Heading 6

- **WHEN** the caret is on a line in a writable editor and the user presses Mod+6
- **THEN** the line becomes a level 6 heading

#### Scenario: Table shortcut

- **WHEN** a writable editor has focus and the user presses Mod+Shift+T
- **THEN** the Insert table dialog opens

#### Scenario: New shortcuts listed

- **WHEN** the user opens the Keyboard shortcuts dialog
- **THEN** Bold Italic is listed with Ctrl+Shift+B (⌘⇧B on macOS) and Heading 4, Heading 5 and Heading 6 with Ctrl+4,
  Ctrl+5 and Ctrl+6 (⌘4, ⌘5 and ⌘6 on macOS)

### Requirement: Availability and disabled reasons

A command SHALL be unavailable, and shown disabled, in these cases: no document is open; Markdown settings are loading; a modal dialog is open; the document is read-only; a Format, Compact or Lint run is in progress; New File or Open File while 40 tabs are open; Open Recent or Reopen Last with nothing to reopen; Close Others with one tab; Close to the Right on the last tab; Move tab at either end; an editor formatting command (Bold through Table) while the active document's editor is not shown, in the Preview arrangement or in Reading mode. A disabled item SHALL state the reason as a tooltip where one exists. The reason for an editor formatting command whose editor is not shown SHALL be "Show the editor to use formatting.".

#### Scenario: Tab limit

- **WHEN** 40 tabs are open
- **THEN** New File and Open File are disabled

#### Scenario: Modal open

- **WHEN** the Settings dialog is open
- **THEN** menu commands and keyboard shortcuts are inactive until it closes

#### Scenario: Formatting while the editor is not shown

- **WHEN** a writable document is in the Preview arrangement
- **THEN** the toolbar's formatting buttons are disabled with the tooltip "Show the editor to use formatting.", the
  Format button stays enabled, and pressing Ctrl+B (Cmd+B on macOS) changes nothing
