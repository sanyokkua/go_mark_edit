# appearance-themes Specification

## Purpose

Defines the three visual themes, their light and dark modes, how the choice is applied and kept, how floating surfaces and motion adapt, and how interface text is supplied from the localization catalogue.

## Requirements

### Requirement: Themes and modes

The system SHALL offer three themes (Liquid Glass, Material, Minimal) and three appearance modes (Auto, Light, Dark). The defaults SHALL be Material and Auto. Each of the six theme-and-mode combinations SHALL have its own complete color palette for surfaces, text, borders and accent.

#### Scenario: Defaults

- **WHEN** the application starts with no saved appearance
- **THEN** the Material theme is shown, following the system light or dark setting

#### Scenario: Every combination

- **WHEN** the user selects any theme with Light and then Dark
- **THEN** the whole interface, including the code editor and syntax highlighting, uses that combination's palette

### Requirement: Auto mode follows the system

WHILE the mode is Auto, the system SHALL show the light or dark palette matching the operating system's color scheme and SHALL switch live when that scheme changes. An explicit Light or Dark mode SHALL ignore the system scheme.

#### Scenario: System switches to dark

- **WHEN** the mode is Auto and the operating system changes to dark
- **THEN** the interface switches to the dark palette without restarting

#### Scenario: Explicit mode

- **WHEN** the mode is Light and the operating system is dark
- **THEN** the interface stays light

### Requirement: Choosing and saving appearance

WHEN the user picks a theme or mode in the Settings menu or the Settings dialog, the system SHALL save it and apply it once the save is acknowledged. The saved choice SHALL be used at the next start.

#### Scenario: Persisted choice

- **WHEN** the user selects Minimal and Dark and restarts the application
- **THEN** it starts in Minimal Dark

#### Scenario: Both entry points

- **WHEN** the user changes the theme in the Settings menu
- **THEN** the Settings dialog shows the same selection, and vice versa

### Requirement: Reset appearance

WHEN the user chooses "Reset appearance" in the Settings dialog's Appearance section, the system SHALL restore the theme to Material, the mode to Auto, the default open mode to Editor, the reading width to Page and the PDF appearance to Styled, and SHALL apply them immediately.

#### Scenario: Reset

- **WHEN** the theme is Glass Dark and the user chooses Reset appearance
- **THEN** the interface becomes Material and follows the system scheme

#### Scenario: Reset includes the Export choice

- **WHEN** the PDF appearance is Clean and the user chooses Reset appearance in the Appearance section
- **THEN** the Export section shows Styled selected

### Requirement: No flash at startup

The system SHALL apply the last known theme and mode before the first paint from a local copy, and SHALL fall back to Material and Auto when that copy is missing or invalid. The saved setting SHALL replace the copy once loaded.

#### Scenario: Corrupted copy

- **WHEN** the local copy of the appearance is unreadable
- **THEN** the first paint uses Material with Auto and the saved setting is applied after loading

### Requirement: Floating surface material

The Liquid Glass theme SHALL render menus, popups and dialogs as translucent surfaces: in Light a background of white at 50% opacity with a 28-pixel backdrop blur and 150% saturation, and in Dark a background of `rgb(28, 30, 54)` at 50% opacity with a 28-pixel blur and 160% saturation. The Material and Minimal themes SHALL render them as opaque surfaces with no blur. Behind a dialog, every theme SHALL show a backdrop of `rgb(6, 8, 16)` at 42% opacity with a 3-pixel blur.

#### Scenario: Glass popup

- **WHEN** a menu is open in Liquid Glass Light
- **THEN** its background is `rgba(255, 255, 255, 0.5)` and content behind the menu is blurred by 28 pixels and
  visible through it

#### Scenario: Glass dialog in Dark

- **WHEN** the Settings dialog is open in Liquid Glass Dark
- **THEN** its background is `rgba(28, 30, 54, 0.5)` with a 28-pixel backdrop blur and 160% saturation

#### Scenario: Material popup

- **WHEN** a menu is open in Material or Minimal
- **THEN** the menu background is opaque and nothing behind it shows through

#### Scenario: Dialog backdrop

- **WHEN** any dialog is open in any theme
- **THEN** the window content behind it is dimmed by `rgba(6, 8, 16, 0.42)` and blurred by 3 pixels

### Requirement: Reduced motion

WHILE the operating system requests reduced motion, the system SHALL set animation and transition durations to zero.

#### Scenario: Reduced motion on

- **WHEN** the user has enabled reduced motion in the operating system and opens a menu
- **THEN** the menu appears without animation

### Requirement: Localization catalogue

The system SHALL take all interface text from a single English catalogue and SHALL replace {name} placeholders with supplied values. IF a key is missing or its text is blank, THEN the system SHALL show the English text, and if that is missing, the key itself. The system SHALL NOT offer a language selector.

#### Scenario: Placeholder

- **WHEN** a message has a {version} placeholder and a version is supplied
- **THEN** the displayed text contains the version

#### Scenario: Missing key

- **WHEN** no text exists for a key
- **THEN** the key itself is displayed
