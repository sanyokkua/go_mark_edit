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

IF drawing fails outside the preview, the system SHALL show "Something went wrong" with Reload interface and Quit,
initially focusing Reload interface. Reload SHALL preserve every tab and unsaved text, including undelivered edits.
A failed or one-second delivery attempt SHALL retain the screen/text for explicit retry; late delivery SHALL NOT
reload automatically. Preview failures follow markdown-preview "Live update and degradation".

#### Scenario: Reload interface

- **WHEN** the "Something went wrong" screen is shown with two open documents, one modified, and the user chooses
  Reload interface
- **THEN** the interface starts again with both tabs open and the modified one still shows its unsaved text

#### Scenario: Latest edit survives the drawing failure

- **WHEN** the user types an edit less than 50 milliseconds before the interface fails, including while an earlier
  edit is still being delivered, then chooses Reload interface
- **THEN** the latest complete text is retained and is delivered before the interface restarts

#### Scenario: Delivery unavailable during reload

- **WHEN** the user chooses Reload interface and text delivery fails or has not completed after one second
- **THEN** the recovery screen and all text remain, a retry message appears, and a later delivery completion does not
  restart the interface without another Reload interface choice

#### Scenario: Reload retry succeeds

- **WHEN** an earlier reload attempt did not finish delivery and the user chooses Reload interface again after
  delivery becomes available
- **THEN** all open tabs return with their latest text after delivery succeeds

#### Scenario: Reload while native confirmation is active

- **WHEN** two documents are open, one modified, a native quit confirmation is active, and the user chooses Reload
  interface before cancelling the native confirmation
- **THEN** Reload does not destroy the page or start another close workflow, and Cancel preserves both documents and
  their text; a later Reload interface choice can restart them safely

#### Scenario: Native ownership changes during reload

- **WHEN** native confirmation takes ownership of a pending quit while Reload interface is finishing or starting
  again, and the user chooses Cancel in the native confirmation
- **THEN** neither the restarted interface nor an earlier close decision removes a tab, and every document and its
  unsaved text remain open

### Requirement: Quitting from the error screen

WHILE the error screen is shown, Quit, window close and native quit shortcut SHALL share one decision: exit if no
unsaved text exists; otherwise ask "Quit and discard unsaved changes in N documents?" with Quit and Cancel. Cancel
SHALL preserve text and pending save intent. Confirming SHALL start no document write or scheduled autosave and SHALL
await writes already admitted before the decision.

#### Scenario: Quit with unsaved work

- **WHEN** the "Something went wrong" screen is shown with one modified document and the user chooses Quit
- **THEN** the screen asks "Quit and discard unsaved changes in 1 document?" with initial focus on Cancel, Cancel
  returns focus to Reload interface, and confirming quits without initiating a write of the file

#### Scenario: Undelivered edit needs confirmation

- **WHEN** an edit has not yet reached the application when the interface fails and the user chooses Quit
- **THEN** that document is included in the discard count even if the application's last accepted text was saved,
  each document is counted only once, and Cancel preserves the undelivered edit

#### Scenario: Scheduled autosave is discarded

- **WHEN** a modified file has an autosave scheduled but not admitted when the user confirms Quit on the error screen
- **THEN** the application exits without starting that autosave or another document write

#### Scenario: Already admitted writes finish

- **WHEN** two document writes were admitted before the user confirms discard, including one not yet handed to the
  filesystem writer
- **THEN** the application waits for both to finish before exiting, and refuses a new document write after confirmation

#### Scenario: Quit with nothing unsaved

- **WHEN** the "Something went wrong" screen is shown, no document has unsaved or undelivered text, and the user closes
  the window
- **THEN** the application quits

### Requirement: Unacknowledged ready-interface close

WHEN a ready interface has not acknowledged close within ten seconds, the system SHALL require native confirmation
of possible undelivered text, even with saved metadata. It SHALL pause autosaves, block new writes and await admitted
writes. Cancel/failure SHALL preserve tabs/text and resume the latest eligible save intent. Timeout alone SHALL NOT
start a document write; stale or competing decisions SHALL NOT remove tabs or authorize exit.

#### Scenario: Saved metadata does not prove no unsent text

- **WHEN** the application holds saved text, the ready interface has an undelivered edit and does not acknowledge
  close for ten seconds
- **THEN** a native confirmation explains that interface changes may not have reached the application, and the app
  does not exit without explicit confirmation

#### Scenario: Native Cancel resumes pending autosave

- **WHEN** an autosave is scheduled, native confirmation takes over after ten seconds, newer text is delivered while
  that decision is active, and the user chooses Cancel
- **THEN** no autosave starts during the decision, all tabs and text remain, and normal autosave resumes for the
  newest eligible text rather than an older paused revision

#### Scenario: Recovery prompt keeps its decision

- **WHEN** the error screen has acknowledged its close request and its discard prompt remains open for more than
  ten seconds
- **THEN** no native fallback replaces it or exits, and Cancel preserves the documents and text

#### Scenario: Native confirmation wins the race

- **WHEN** native confirmation takes ownership before a delayed error-screen acknowledgment arrives
- **THEN** the delayed acknowledgment cannot authorize or remove anything, and native Cancel preserves every tab and
  buffer; the next Quit is a fresh decision

### Requirement: Quitting is not blocked by layout storage

WHEN the user quits or closes the window, a failure to store the window size, sidebar or other layout state SHALL be
logged and SHALL NOT prevent the window from closing. A failure to write a document SHALL still stop the close.

#### Scenario: Settings store is read-only

- **WHEN** the settings store cannot be written, the user resized the window and then quits with no modified documents
- **THEN** the application quits and the failure is recorded in the log
