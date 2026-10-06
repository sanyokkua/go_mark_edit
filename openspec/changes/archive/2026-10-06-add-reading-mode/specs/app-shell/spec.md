## MODIFIED Requirements

### Requirement: Present-but-disabled controls

The system SHALL display the Assistant toggle (View menu and, at normal width, a toolbar icon), Export to PDF (File menu), Command palette (editor context menu and shortcuts dialog), Open logs folder and View on GitHub (About menu) as disabled controls. They SHALL perform no action, and the system SHALL NOT render an Assistant panel.

#### Scenario: Disabled Assistant

- **WHEN** the user looks at the toolbar icon or the View menu entry for Assistant
- **THEN** it is shown disabled and activating it does nothing

#### Scenario: Disabled export

- **WHEN** the user opens the File menu
- **THEN** "Export to PDF" is listed and disabled
