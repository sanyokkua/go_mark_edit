# actions-shortcuts Specification

## Purpose

Defines the single catalogue of user commands that supplies the menus, toolbar, context menus, keyboard shortcuts and the shortcuts dialog, together with the rules that make a command available or disabled.

## Requirements

### Requirement: One command catalogue

The system SHALL define every command once, with its label, scope (editor, document, window or application), keyboard shortcut and the surfaces where it appears. Every menu, toolbar button, context menu and the shortcuts dialog SHALL derive its entries, order, labels and shortcut hints from that catalogue.

#### Scenario: Consistent hint

- **WHEN** Save appears in the File menu
- **THEN** it shows the same shortcut that the keyboard handler accepts for Save

### Requirement: Availability and disabled reasons

A command SHALL be unavailable, and shown disabled, when no document is open, Markdown settings are loading, a modal dialog is open, the document is read-only, or a Format, Compact or Lint run is in progress. A disabled item SHALL state the reason as a tooltip where one exists.

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

### Requirement: Availability of tab and file commands

A command SHALL be unavailable, and shown disabled, in these cases: New File or Open File while 40 tabs are open; Open Recent or Reopen Last with nothing to reopen; Close Others with one tab; Close to the Right on the last tab; Move tab at either end.

#### Scenario: Close to the Right on the last tab

- **WHEN** the active tab is the last tab
- **THEN** Close to the Right is disabled

### Requirement: Availability of formatting commands without an editor

An editor formatting command (Bold through Table) SHALL be unavailable, and shown disabled, while the active document's editor is not shown, in the Preview arrangement or in Reading mode. The reason for such a command SHALL be "Show the editor to use formatting.".

#### Scenario: Formatting in Reading mode

- **WHEN** Reading mode is active
- **THEN** editor formatting commands are disabled with the reason "Show the editor to use formatting."

### Requirement: Read-only documents

For a read-only document the system SHALL disable Save, Save As, Format, Compact and every editing command, and SHALL keep Copy, Find and Lint available.

#### Scenario: Large file

- **WHEN** the active document is read-only
- **THEN** Bold is disabled while Copy and Find work

### Requirement: Application and window shortcuts

The system SHALL bind: Mod+N New File; Mod+O Open File; Mod+Shift+Alt+T Reopen Last; Mod+S Save; Mod+Shift+S Save As; Mod+P Export to PDF; Mod+W Close Tab; Mod+Shift+PageUp and PageDown Move tab left and right; Mod+Tab and Mod+Shift+Tab next and previous tab (also Ctrl+PageDown and Ctrl+PageUp); Mod+, Settings; Mod+\ Toggle Sidebar; Mod+Enter Distraction-free reading; Mod+? Keyboard shortcuts; F11 Full screen. Mod is Cmd on macOS and Ctrl elsewhere.

#### Scenario: Save shortcut

- **WHEN** a writable document is active and the user presses Ctrl+S (Cmd+S on macOS)
- **THEN** the document is saved

#### Scenario: Next tab alias

- **WHEN** two tabs are open and the user presses Ctrl+PageDown
- **THEN** the next tab becomes active

#### Scenario: Reading shortcut listed

- **WHEN** the user opens the Keyboard shortcuts dialog
- **THEN** Distraction-free reading is listed with scope Window and the key Ctrl+Enter (⌘↩ on macOS)

#### Scenario: Export shortcut

- **WHEN** a document is active, the editor has focus and the user presses Ctrl+P (Cmd+P on macOS)
- **THEN** the print dialog for Export to PDF opens
- **AND** the File menu and the Keyboard shortcuts dialog show Export to PDF with Ctrl+P (⌘P on macOS)

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

### Requirement: Shortcut dispatch

WHEN a pressed key combination matches the shortcut of an available command, the system SHALL run that command and suppress the browser default. IF the command is unavailable, THEN the system SHALL ignore the key combination without running anything. IF the focused control has already handled the key combination, THEN the system SHALL NOT run a command for it. Shortcut hints SHALL use the symbols for Cmd, Option and Shift on macOS and "Ctrl+", "Alt+", "Shift+" elsewhere.

#### Scenario: Unavailable shortcut

- **WHEN** no document is open and the user presses Mod+S
- **THEN** nothing happens

#### Scenario: Key handled by the Find input

- **WHEN** the editor's Find input has focus and the user presses the physical Ctrl key with Enter (Ctrl+Enter on every platform, including macOS)
- **THEN** the Find input handles the key and Reading mode is not entered

### Requirement: Editor context menu

WHEN the user right-clicks in the editor, or presses the Menu key or Shift+F10, the system SHALL open a context menu in this order: Cut, Copy, Paste, Paste as plain text, Bold, Italic, Link, Format document, Compact, Lint, Command palette. Unavailable entries SHALL be disabled, and Escape SHALL close the menu and return focus to the editor.

#### Scenario: Open by keyboard

- **WHEN** the editor has focus and the user presses Shift+F10
- **THEN** the context menu opens with Cut as the first item focused

### Requirement: Tab context menu

WHEN the user opens a tab's context menu, the system SHALL list Close Tab, Close Others, Close to the Right, Move tab left, Move tab right, Copy path and Reveal in file manager, acting on the tab that was clicked. Copy path and Reveal SHALL be disabled for an unsaved document, and Reveal SHALL also be disabled for a detached one.

#### Scenario: Close others

- **WHEN** three tabs are open and the user chooses Close Others on the second
- **THEN** only the second tab remains

### Requirement: Workspace tree context menu

WHEN the user opens the context menu on a workspace tree item, the system SHALL list New File, New Folder, Reveal in file manager and Copy path. New File and New Folder SHALL be enabled only for a readable folder.

#### Scenario: File node

- **WHEN** the user opens the context menu on a file in the tree
- **THEN** New File and New Folder are disabled and Reveal and Copy path are enabled

### Requirement: Keyboard shortcuts dialog

WHEN the user chooses About, Keyboard shortcuts or presses Mod+?, the system SHALL show a dialog listing the catalogued commands that declare a shortcuts entry, each with its name, scope, availability status and key combination, or "—" when it has none. The dialog SHALL close with its Close button or by clicking the backdrop.

#### Scenario: Row content

- **WHEN** the dialog is open
- **THEN** the Format row shows scope Document and the key Alt+Shift+F (⌥⇧F on macOS)

### Requirement: Preview context menu

WHEN the user right-clicks the rendered document in the preview pane or in Reading mode, or presses the Menu key or
Shift+F10 while it has focus, the system SHALL open a context menu with Copy and Select all. Copy SHALL be disabled
while no rendered text is selected, Select all SHALL select only the rendered document, Escape SHALL close the menu and
return focus to the rendered document, and the menu SHALL offer no editing command.

#### Scenario: No selection

- **WHEN** the user right-clicks the preview with no text selected
- **THEN** Copy is disabled and Select all is enabled

#### Scenario: Open by keyboard

- **WHEN** the rendered document has focus in Reading mode and the user presses Shift+F10
- **THEN** the context menu opens with its first enabled item focused

#### Scenario: Select all scope

- **WHEN** the user chooses Select all in Reading mode with the tab bar overlay open
- **THEN** all text of the rendered document is selected and no tab label or reading control text is selected
