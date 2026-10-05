# Tasks

> Reconstructed after the fact from the specification and the delivered code; the original task list was not kept in this form.

## 1. Backend foundation

- [x] 1.1 Go application model, typed result envelopes with first-statement panic recovery, and composition root
- [x] 1.2 SQLite-backed key-value store and settings service with validation and acknowledgement
- [x] 1.3 Logging and classified error mapping that never leaks raw errors or private paths

## 2. Appearance system

- [x] 2.1 Three themes producing six palettes, expressed as root-level tokens
- [x] 2.2 Bundled Roboto and Inter fonts; generated editor themes and syntax highlight styles
- [x] 2.3 Startup theme mirror so the first paint has no flash

## 3. Native window shell

- [x] 3.1 Operating-system-managed frame with 375x480 minimum, 1024x768 default, F11 full screen
- [x] 3.2 Three-region responsive layout (46 px rail at 768, off-canvas overlay at 375)
- [x] 3.3 Durable layout persistence with debounce, flush on close, and latest-change-wins
- [x] 3.4 Recoverable startup failure screen with Retry

## 4. Settings, actions and notifications

- [x] 4.1 Settings dialog and quick appearance controls with atomic reset
- [x] 4.2 Canonical action catalogue and shortcut registry feeding the menu row
- [x] 4.3 Toast and banner notification queue with de-duplication and severity timing
- [x] 4.4 About dialog with injected build version

## 5. Verification

- [x] 5.1 Unit and integration tests for layout, settings and notifications
- [x] 5.2 End-to-end tests for shell, narrow widths, theme surfaces and offline behaviour
