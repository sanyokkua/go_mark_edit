# app-shell Specification

## Purpose

Defines the native desktop window, the in-app menu bar, the launcher, startup and startup-failure behavior, multiple windows, and the controls that are visible but intentionally disabled.

## Requirements

### Requirement: Native operating-system window

The system SHALL present one resizable window with the operating system's own title bar and window controls, a default size of 1024 by 768 pixels and a minimum size of 375 by 480 pixels. The system SHALL NOT draw a custom title bar or window buttons.

#### Scenario: Window limits

- **WHEN** the user resizes the window
- **THEN** the window cannot become smaller than 375 by 480 pixels

#### Scenario: Native chrome only

- **WHEN** the application is running
- **THEN** no application-drawn title bar, traffic-light or window-control element is present

### Requirement: Window shown only when ready

The system SHALL keep the window hidden at launch until the saved window size has been restored and the interface has reported it is ready. A saved size larger than the usable screen SHALL be reduced to the screen size, and a saved maximized state SHALL be restored.

#### Scenario: Restored geometry

- **WHEN** the application starts with a saved size and maximized flag
- **THEN** the window appears once, at that size and in that maximized state, without showing an unstyled frame first

#### Scenario: Saved size exceeds screen

- **WHEN** the saved width or height is larger than the usable screen
- **THEN** the window opens at the screen's width or height instead

### Requirement: Menus and macOS native menu

The system SHALL show an in-app menu bar with File, Markdown, Settings, View and About menus on every platform. On macOS the system SHALL additionally provide only the operating-system application menu and Edit menu; on Windows and Linux it SHALL provide no native menu.

#### Scenario: In-app menus

- **WHEN** the application is ready
- **THEN** the menu bar offers File, Markdown, Settings, View and About, and each opens a menu of its actions

#### Scenario: macOS native menu

- **WHEN** the application runs on macOS
- **THEN** the system menu bar shows the application and Edit menus, and About GoMarkEdit appears only inside the in-app About menu

### Requirement: Narrow-window presentation

WHILE the window is 376 CSS pixels wide or narrower, the system SHALL collapse the menu bar into a single "More actions" overflow menu and SHALL NOT show the workspace sidebar. The system SHALL restore the full presentation when the window is widened, without any user action.

#### Scenario: Minimum width

- **WHEN** the window is resized to its 375-pixel minimum
- **THEN** File, Markdown, Settings, View and About are reachable only through the "More actions" menu and the sidebar is hidden

#### Scenario: Widening

- **WHEN** the window is widened beyond 376 pixels while a folder is open and the user has not hidden the sidebar
- **THEN** the separate menus and the sidebar return

### Requirement: Launcher

WHILE no document is open, the system SHALL show a launcher titled "Start a document" with New File, Open File and Open Folder buttons and a Recent list of at most 10 entries, each showing the file name and its full path as a tooltip. The launcher SHALL show "No recent items yet." when there are none. A window that starts without a document to open SHALL show the launcher and no tab.

#### Scenario: First run

- **WHEN** the application starts with no open documents and no recent items
- **THEN** the launcher shows the three buttons, a first-run message and "No recent items yet."

#### Scenario: Started from the icon

- **WHEN** the user starts the application from its icon and Recent Items holds 2 entries
- **THEN** the window shows the launcher with those 2 entries, no tab and no sidebar

#### Scenario: Started with a folder

- **WHEN** the application is started with the folder `~/notes` as its argument
- **THEN** the sidebar shows the tree rooted at "notes", no tab is open and the launcher fills the document area

#### Scenario: Everything closed

- **WHEN** a window without a folder and with the sidebar hidden has one tab and the user closes it
- **THEN** the window shows the launcher and no sidebar

#### Scenario: New File from the launcher

- **WHEN** the launcher is shown and the user chooses New File
- **THEN** an empty Untitled document opens as the only tab

#### Scenario: Recent entry

- **WHEN** the user clicks a recent entry in the launcher
- **THEN** that file or folder is opened

### Requirement: Startup sequence and failure screen

The system SHALL start in four steps: native bridge, application model, settings, window ready, each limited to 10 seconds. IF a step fails or times out, THEN the system SHALL show a "GoMarkEdit could not start" screen naming the step and failure category, with Retry and Quit buttons.

#### Scenario: Timeout

- **WHEN** a startup step does not answer within 10 seconds
- **THEN** the failure screen reports that the named step did not answer within 10 seconds

#### Scenario: Retry resumes

- **WHEN** the user presses Retry after the settings step failed
- **THEN** startup resumes at the settings step and the normal interface appears if it succeeds

#### Scenario: Bridge failure

- **WHEN** the native bridge step fails
- **THEN** only Quit is offered, and the window is still shown so the screen is visible

### Requirement: Full screen and About

WHEN the user chooses Full screen, the system SHALL toggle the native window between full screen and normal. WHEN the user chooses About GoMarkEdit, the system SHALL show a dialog with the application version and a Close button.

#### Scenario: Toggle full screen

- **WHEN** the user presses F11 or chooses View, Full screen
- **THEN** the window enters full screen, and the same command leaves it

### Requirement: Independent windows

The system SHALL open each new window as an independent application process with its own tabs and workspace. How a path
passed by the operating system or on the command line is opened, and in which window, is defined by the os-integration
capability.

#### Scenario: New Window

- **WHEN** the user chooses New Window
- **THEN** a second application window opens with its own empty session: the launcher, no tab and no sidebar

#### Scenario: Launch failure

- **WHEN** the new process cannot be started
- **THEN** the system reports "A new window could not be opened." and keeps the current window unchanged

### Requirement: Controls shown disabled

The system SHALL display the Assistant toggle (View menu and, at normal width, a toolbar icon), Command palette (editor
context menu and shortcuts dialog), Open logs folder and View on GitHub (About menu) as disabled controls. They SHALL
perform no action, and the system SHALL NOT render an Assistant panel.

#### Scenario: Disabled Assistant

- **WHEN** the user looks at the toolbar icon or the View menu entry for Assistant
- **THEN** it is shown disabled and activating it does nothing

#### Scenario: Disabled About entries

- **WHEN** the user opens the About menu
- **THEN** Open logs folder and View on GitHub are listed and disabled

### Requirement: Markdown menu groups

The Markdown menu SHALL list every formatting and tidy command in five groups, in this order, each with a visible localized heading announced to assistive technology and separated by dividers: Text (Bold, Italic, Bold Italic, Strikethrough, Inline code); Headings (Heading 1 to Heading 6); Lists & quotes (Bullet list, Numbered list, Task list, Quote); Links, images & tables (Link, Image, Table…); Formatting & verification (Format, Compact, Lint).

#### Scenario: Groups and items

- **WHEN** a writable document is active in the Split arrangement and the user opens the Markdown menu
- **THEN** it shows the headings Text, Headings, Lists & quotes, Links, images & tables and Formatting & verification
  with 21 items in the order listed above
- **AND** Image is shown disabled and every other item is enabled
- **AND** each item shows the same shortcut hint as the Keyboard shortcuts dialog

#### Scenario: Run from the menu

- **WHEN** the user selects "word" in the editor, opens the Markdown menu and chooses Bold Italic
- **THEN** the menu closes, the text becomes bold and italic as the editor's formatting actions define, and the editor
  has focus

#### Scenario: Keyboard use

- **WHEN** the Markdown menu is open and the user presses Down repeatedly
- **THEN** focus moves through the items in order, skipping group headings, dividers and the disabled Image item, and
  Escape closes the menu and returns focus to the Markdown menu button

#### Scenario: No document

- **WHEN** no document is open and the user opens the Markdown menu
- **THEN** all 21 items are shown disabled

#### Scenario: Preview arrangement

- **WHEN** a writable document is active in the Preview arrangement and the user opens the Markdown menu
- **THEN** the Text, Headings, Lists & quotes and Links, images & tables items are disabled because no editor is
  shown, and Format, Compact and Lint are enabled

### Requirement: Menu width limit

Every dropdown menu and popup SHALL be at most 360 pixels wide, and never wider than the window minus its side gaps. A row whose text does not fit SHALL be truncated with an ellipsis and keep the full text available as its tooltip; a long file name SHALL NOT widen a menu.

#### Scenario: Long recent file name

- **WHEN** a recent file has a name of more than 200 characters and the user opens the File menu in a wide window
- **THEN** the File menu is at most 360 pixels wide, the file's row ends with an ellipsis inside the menu, and its tooltip shows the full path

#### Scenario: Narrow window

- **WHEN** the window is narrower than 360 pixels plus its side gaps and the user opens a menu
- **THEN** the menu is no wider than the window minus its side gaps
