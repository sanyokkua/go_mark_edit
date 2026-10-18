# Spec Delta

## MODIFIED Requirements

### Requirement: Window shown only when ready

The system SHALL keep the window hidden at launch until the saved window size has been restored and the interface has reported it is ready. A saved size larger than the usable screen SHALL be reduced to the screen size, and a saved maximized state SHALL be restored. IF the interface has not reported ready 12 seconds after the window size was restored, THEN the system SHALL show the window anyway.

#### Scenario: Restored geometry

- **WHEN** the application starts with a saved size and maximized flag
- **THEN** the window appears once, at that size and in that maximized state, without showing an unstyled frame first

#### Scenario: Saved size exceeds screen

- **WHEN** the saved width or height is larger than the usable screen
- **THEN** the window opens at the screen's width or height instead

#### Scenario: Interface never reports ready

- **WHEN** the settings startup step fails and the interface therefore never reports ready
- **THEN** the window becomes visible no later than 12 seconds after the window size was restored and shows the
  "GoMarkEdit could not start" screen

## ADDED Requirements

### Requirement: Unexpected interface error

IF the interface fails while drawing outside the preview, THEN the system SHALL replace the window content with a
"Something went wrong" screen offering Reload interface and Quit, with keyboard focus on Reload interface. Reload
interface SHALL keep every open document and its unsaved text. (A failure inside the preview is defined in
markdown-preview "Live update and degradation".)

#### Scenario: Reload interface

- **WHEN** the "Something went wrong" screen is shown with two open documents, one modified, and the user chooses
  Reload interface
- **THEN** the interface starts again with both tabs open and the modified one still shows its unsaved text

### Requirement: Quitting from the error screen

WHILE the "Something went wrong" screen is shown, Quit SHALL exit at once when no document has unsaved text; otherwise
it SHALL first ask "Quit and discard unsaved changes in N documents?" with Quit and Cancel, and Cancel SHALL return to
the screen. Closing the window or pressing the quit shortcut on this screen SHALL behave like Quit.

#### Scenario: Quit with unsaved work

- **WHEN** the "Something went wrong" screen is shown with one modified document and the user chooses Quit
- **THEN** the screen asks "Quit and discard unsaved changes in 1 document?", Cancel returns to the screen, and
  confirming quits without writing the file

#### Scenario: Quit with nothing unsaved

- **WHEN** the "Something went wrong" screen is shown, no document is modified, and the user closes the window
- **THEN** the application quits

### Requirement: Quitting is not blocked by layout storage

WHEN the user quits or closes the window, a failure to store the window size, sidebar or other layout state SHALL be
logged and SHALL NOT prevent the window from closing. A failure to write a document SHALL still stop the close.

#### Scenario: Settings store is read-only

- **WHEN** the settings store cannot be written, the user resized the window and then quits with no modified documents
- **THEN** the application quits and the failure is recorded in the log
