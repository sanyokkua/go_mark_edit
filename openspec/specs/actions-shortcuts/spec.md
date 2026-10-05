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

A command SHALL be unavailable, and shown disabled, in these cases: no document is open; Markdown settings are loading; a modal dialog is open; the document is read-only; a Format, Compact or Lint run is in progress; New File or Open File while 40 tabs are open; Open Recent or Reopen Last with nothing to reopen; Close Others with one tab; Close to the Right on the last tab; Move tab at either end. A disabled item SHALL state the reason as a tooltip where one exists.

#### Scenario: Tab limit

- **WHEN** 40 tabs are open
- **THEN** New File and Open File are disabled

#### Scenario: Modal open

- **WHEN** the Settings dialog is open
- **THEN** menu commands and keyboard shortcuts are inactive until it closes

### Requirement: Read-only documents

For a read-only document the system SHALL disable Save, Save As, Format, Compact and every editing command, and SHALL keep Copy, Find and Lint available.

#### Scenario: Large file

- **WHEN** the active document is read-only
- **THEN** Bold is disabled while Copy and Find work

### Requirement: Application and window shortcuts

The system SHALL bind: Mod+N New File; Mod+O Open File; Mod+Shift+Alt+T Reopen Last; Mod+S Save; Mod+Shift+S Save As; Mod+W Close Tab; Mod+Shift+PageUp and PageDown Move tab left and right; Mod+Tab and Mod+Shift+Tab next and previous tab (also Ctrl+PageDown and Ctrl+PageUp); Mod+, Settings; Mod+\ Toggle Sidebar; Mod+? Keyboard shortcuts; F11 Full screen. Mod is Cmd on macOS and Ctrl elsewhere.

#### Scenario: Save shortcut

- **WHEN** a writable document is active and the user presses Ctrl+S (Cmd+S on macOS)
- **THEN** the document is saved

#### Scenario: Next tab alias

- **WHEN** two tabs are open and the user presses Ctrl+PageDown
- **THEN** the next tab becomes active

### Requirement: Editing shortcuts

The system SHALL bind: Mod+F Find; Mod+R Replace; Mod+B Bold; Mod+I Italic; Mod+Shift+X Strikethrough; Mod+E Inline code; Mod+1, 2, 3 Headings; Mod+Shift+8 Bullet list; Mod+Shift+7 Numbered list; Mod+Shift+9 Task list; Mod+Shift+. Quote; Mod+K Link; Mod+Shift+T Table; Alt+Shift+F Format; Alt+Shift+C Compact; Alt+Shift+L Lint. Mod+Shift+I (Image) SHALL be disabled.

#### Scenario: Bold

- **WHEN** text is selected in a writable editor and the user presses Mod+B
- **THEN** the selection is wrapped as bold

### Requirement: Shortcut dispatch

WHEN a pressed key combination matches the shortcut of an available command, the system SHALL run that command and suppress the browser default. IF the command is unavailable, THEN the system SHALL ignore the key combination without running anything. Shortcut hints SHALL use the symbols for Cmd, Option and Shift on macOS and "Ctrl+", "Alt+", "Shift+" elsewhere.

#### Scenario: Unavailable shortcut

- **WHEN** no document is open and the user presses Mod+S
- **THEN** nothing happens

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
