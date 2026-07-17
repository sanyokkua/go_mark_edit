**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester
**Last Updated:** 2026-07-10
**Cross-references:** `00_Foundation/04_DESIGN_DECISIONS.md`, `02_Architecture/03_FRONTEND_REACT.md`, `01_Product/12_KEYBOARD_SHORTCUTS.md`, `01_Product/10_THEMING.md`

# Accessibility

Basic accessibility is in scope for v1: the app must be operable by keyboard for core actions. Full
screen-reader certification and a complete WCAG contrast audit are explicitly **out of v1 scope** and
are a documented decision, not a regression target (DD-36).

## Table of Contents

1. v1 scope
2. Keyboard operability
3. Focus management
4. Radix a11y baseline
5. Out of scope for v1

## 1. v1 scope

The v1 accessibility commitment is **keyboard operability for core actions** plus the a11y baseline that
the Radix primitives provide for free. The intent is a genuinely usable keyboard experience for the
common editing/reading flows, without claiming certified assistive-technology support (DD-36).

## 2. Keyboard operability

Every core action has a keyboard shortcut, shown in menus and tooltips and collected in a Shortcuts
dialog (DD-31; `01_Product/12_KEYBOARD_SHORTCUTS.md`):

- **Formatting** — bold, italic, headings, lists, link/image (act on selection or current line).
- **Files** — new, open, save, save-as.
- **View** — toggle sidebar, toggle reading mode, switch editor/preview.
- **Tools** — format, lint, settings.

Shortcuts are registered centrally (`logic/hooks/useShortcuts`) with platform-correct modifiers
(Cmd on macOS, Ctrl elsewhere). Monaco supplies full in-editor keyboard editing; app-level shortcuts
layer on top without stealing editor keys.

## 3. Focus management

- Dialogs (Settings, Shortcuts, About) trap focus while open and restore focus to the invoking control
  on close.
- Menus, the file tree, and tabs are keyboard-navigable (arrow keys, Enter, Escape).
- A visible focus indicator is preserved for keyboard users and must not be removed by theme tokens.
- Opening a file into the editor moves focus to the editor; entering reading mode moves focus to the
  document region.

## 4. Radix a11y baseline

`ui/primitives/` wraps Radix Primitives, which provide correct ARIA roles/states, focus management, and
keyboard interaction for Dialog, DropdownMenu, ContextMenu, Tabs, Switch, Select, Popover, Toast, and
Tooltip (`02_Architecture/03_FRONTEND_REACT.md` `#components`). Because visuals are token-only and
behavior/a11y come from Radix, the baseline is consistent across all three themes and both modes without
per-component a11y wiring.

## 5. Out of scope for v1

The following are acknowledged and deferred (DD-36) — recorded so their absence is a known decision, not
an untracked gap:

- Certified **screen-reader** support (VoiceOver/NVDA/Orca) with a full label/landmark audit.
- Full **WCAG 2.x contrast certification** across every theme/mode combination (themes aim for good
  contrast but are not formally audited in v1).
- High-contrast/forced-colors modes and reduced-motion tuning beyond what Radix/tokens provide by
  default.

These may be scoped into a later phase; v1 acceptance is limited to the keyboard operability and focus
guarantees above.
