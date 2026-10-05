# Proposal

## Why

GoMarkEdit needed a foundation before any file or editing feature could be built: a native desktop shell, a Go backend that owns application state, a consistent appearance system, and persisted settings. Without these, later features would each invent their own window handling, theming and settings storage, and the offline-only promise would have no enforcement point.

## What Changes

- Native window shell using the operating system's own frame, title bar and controls; default 1024x768, minimum 375x480, F11 full screen.
- Three-region layout (workspace, document, reserved assistant region) with responsive forms at 768 px (icon rail) and 375 px (off-canvas overlay).
- Durable layout (window size, maximized state, sidebar visibility and width, last-used view arrangement) restored before the window is shown; latest change wins across windows.
- Three themes (Glass, Material, Minimal) and Auto, Light and Dark modes producing six palettes, bundled Roboto and Inter fonts, token-based styling, generated editor themes, no flash on launch.
- Settings dialog and quick appearance controls with atomic reset; recoverable startup failure screen with Retry.
- One action catalogue feeding the menu row, shortcuts and settings; a notification system (toasts, banners, de-duplication with counts).
- About dialog with injected build version (`dev` when absent); no network requests of any kind.

## Capabilities

### New Capabilities

- `app-shell`: native frame, three-region responsive layout, durable layout, startup recovery
- `appearance-themes`: themes, palettes, tokens, fonts
- `settings`: persisted, acknowledged settings and atomic reset
- `actions-shortcuts`: canonical action catalogue and shortcut registry
- `offline-privacy`: no telemetry, update checks or background requests

### Modified Capabilities

- (none)

## Impact

New Go packages for application model, settings, key-value and database persistence, bridge and logging; new React shell, store projection and adapter layer. Establishes the rule that the Go backend is authoritative and the Redux store is a disposable projection.
