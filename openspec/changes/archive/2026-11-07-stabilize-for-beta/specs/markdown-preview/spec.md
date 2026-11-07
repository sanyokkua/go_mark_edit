# Spec Delta

## MODIFIED Requirements

### Requirement: Live update and degradation

The system SHALL update the preview as the user types without delaying keystrokes, keep the last successful rendering with an inline error when a document cannot be rendered, and pause the preview for a document over 2 MiB (2,097,152 bytes), showing a Refresh action that renders the current text once. An error while drawing the rendered preview SHALL show the same inline error inside the preview pane and SHALL NOT affect the rest of the window.

#### Scenario: Large document

- **WHEN** a document grows beyond 2 MiB
- **THEN** the preview shows a paused notice with Refresh, and Refresh renders the current content

#### Scenario: Refresh failure

- **WHEN** a manual refresh fails
- **THEN** the paused notice shows an error and a Retry action

#### Scenario: Drawing failure

- **WHEN** a document contains content that makes the preview fail while drawing
- **THEN** the preview shows the inline error, and the editor, tabs and menus keep working

#### Scenario: Recovery after a drawing failure

- **WHEN** the preview shows the inline error after a drawing failure and the user removes the failing content
- **THEN** the preview renders the current text again without the error
