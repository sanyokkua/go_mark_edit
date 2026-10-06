## REMOVED Requirements

### Requirement: Multiple windows

**Reason**: Opening a path passed on the command line now covers files as well as folders and joins the paths sent by
the operating system, so the rule moves to the os-integration capability ("Opening from the operating system" and
"Command-line arguments"). The rest is restated as "Independent windows". A MODIFIED block cannot drop the old "Startup
folder" scenario.
**Migration**: See "Independent windows" below and the os-integration capability, whose "Startup folder" scenario keeps
the old behavior.

### Requirement: Present-but-disabled controls

**Reason**: Export to PDF becomes a working command (pdf-export capability). The remaining controls are restated as
"Controls shown disabled". A MODIFIED block cannot drop the old "Disabled export" scenario.
**Migration**: See "Controls shown disabled" below and the pdf-export capability.

## ADDED Requirements

### Requirement: Independent windows

The system SHALL open each new window as an independent application process with its own tabs and workspace. How a path
passed by the operating system or on the command line is opened, and in which window, is defined by the os-integration
capability.

#### Scenario: New Window

- **WHEN** the user chooses New Window
- **THEN** a second application window opens with its own empty session

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
