# Spec Delta

## MODIFIED Requirements

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

### Requirement: Reset appearance

WHEN the user chooses "Reset appearance" in the Settings dialog's Appearance section, the system SHALL restore the theme to Material, the mode to Auto, the default open mode to Editor, the reading width to Page and the PDF appearance to Styled, and SHALL apply them immediately.

#### Scenario: Reset

- **WHEN** the theme is Glass Dark and the user chooses Reset appearance
- **THEN** the interface becomes Material and follows the system scheme

#### Scenario: Reset includes the Export choice

- **WHEN** the PDF appearance is Clean and the user chooses Reset appearance in the Appearance section
- **THEN** the Export section shows Styled selected
