## MODIFIED Requirements

### Requirement: Open mode

The system SHALL open a file in the arrangement last saved for that file, falling back to the window's current
arrangement and then to Split, whatever the default open mode is. WHEN the default open mode is Reading (Viewer), the
system SHALL additionally show the file in Reading mode as the reading-mode capability defines, and leaving Reading
mode SHALL show that arrangement.

#### Scenario: Viewer mode

- **WHEN** the default open mode is Reading (Viewer) and the user opens a Markdown file last closed in the Editor
  arrangement
- **THEN** the file is shown in Reading mode, and leaving Reading mode shows the Editor arrangement

#### Scenario: Editor mode with saved arrangement

- **WHEN** the default open mode is editor and the file was last closed in Editor arrangement
- **THEN** the file reopens in the Editor arrangement

## REMOVED Requirements

### Requirement: Unavailable controls

**Reason**: Distraction-free reading is implemented as Reading mode, so the only unavailable control left is the Image
formatting action, restated as "Image formatting action unavailable". A MODIFIED block cannot drop the old
"Distraction-free reading" scenario.
**Migration**: See "Image formatting action unavailable" below and the reading-mode capability.

## ADDED Requirements

### Requirement: Image formatting action unavailable

The system SHALL show the Image formatting action as a disabled control until that feature exists.

#### Scenario: Image formatting

- **WHEN** the user looks at the Image button of the formatting toolbar
- **THEN** it is shown disabled and activating it or pressing Ctrl+Shift+I (Cmd+Shift+I on macOS) does nothing
