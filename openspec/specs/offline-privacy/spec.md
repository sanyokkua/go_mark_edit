# offline-privacy Specification

## Purpose

Defines the product's offline and privacy guarantees: no unsolicited network use, no remote assets, local-only diagnostics free of private data, and errors that never expose internal causes.

## Requirements

### Requirement: No background network activity

The system SHALL make no background or unsolicited network request, send no telemetry or crash report, and perform no update check; the only outbound action is opening a link in the system browser after the user activates it.

#### Scenario: Idle use

- **WHEN** the application is running, editing and previewing documents
- **THEN** it initiates no network connection

#### Scenario: User activates a web link

- **WHEN** the user clicks an `https` link
- **THEN** the system browser opens that address and the application itself requests nothing

### Requirement: No remote assets

The system SHALL ship every font, script, stylesheet, highlighting grammar, math and diagram engine with the application and SHALL load none from the network, running the Mermaid engine in an isolated frame whose content policy permits no network source.

#### Scenario: Offline rendering

- **WHEN** the computer has no network and a document contains code, a formula and a diagram
- **THEN** all three render fully

### Requirement: Remote document content

The system SHALL NOT load content that a document references from the web, such as remote images, and SHALL show a placeholder instead, whatever the stored remote-content setting (ask, allow or block; default ask) says, because that setting is persisted but not yet applied to rendering.

#### Scenario: Remote image

- **WHEN** a document embeds `https://example.com/x.png`
- **THEN** no request is made and the alt text placeholder is shown

### Requirement: Local diagnostic logs

The system SHALL write diagnostic logs only to a rotating local file beside the application database (10 MB per file, three backups, 30 days, compressed), recording warnings and errors in release builds, and SHALL log failure categories and file base names rather than document content.

#### Scenario: Failed operation

- **WHEN** an operation on `/Users/jo/notes/a.md` fails
- **THEN** the log entry names `a.md` and the failure category, not the full path

### Requirement: Errors without internal causes

The system SHALL show users only a classified category, a fixed message, the file's base name and a recovery action from a fixed set, SHALL NOT expose raw error text, stack traces or full paths from internal failures, and SHALL convert an unexpected internal fault into a generic "operation could not be completed" message.

#### Scenario: Unexpected fault

- **WHEN** an internal operation panics
- **THEN** the user sees a generic failure message with no technical detail and the application keeps running

#### Scenario: Read failure

- **WHEN** a file cannot be read
- **THEN** the notice shows the file name and a retry option but not the system error string
