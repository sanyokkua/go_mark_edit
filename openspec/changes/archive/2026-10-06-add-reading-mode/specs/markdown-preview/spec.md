## ADDED Requirements

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
