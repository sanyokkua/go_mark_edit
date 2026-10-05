# Proposal

## Why

With the native shell in place, the application still had no editing surface that looked or behaved like an editor. Users needed the full menu bar, a formatting toolbar and keyboard shortcuts, while file opening, saving and tabs were still unbuilt. Showing the whole planned interface early, with honest unavailable states, let formatting be built and tested on its own.

## What Changes

- Menu row with File, Settings, View and About menus in the intended order and grouping.
- Formatting toolbar: bold, italic, strikethrough, inline code, headings 1-3, bullet/numbered/task lists, quote, link, table, with overflow at 768 and 375 px and an Editor/Split/Preview control.
- Formatting actions edit only the selected range or current line, as a single undoable edit.
- Editor shortcuts, an editor context menu and a keyboard shortcuts dialog, all driven by the action registry.
- Editor display settings: line numbers (on), word wrap (off), font size 13/14/16 (default 14).
- Not-yet-built controls (file commands, tabs, Format/Compact/Lint, Image, Toggle Assistant) are shown as visibly unavailable and never fake success.

## Capabilities

### New Capabilities

- `editor`: formatting actions, editor display settings, editor context menu

### Modified Capabilities

- `actions-shortcuts`: editor-stage bindings and registry-driven menus, toolbar and context menu
- `settings`: editor display settings group
- `app-shell`: menu row and toolbar responsive behaviour

## Impact

Adds the formatting module, editor action executor and dispatcher on the frontend, and editor display settings in the Go settings service. File and tab behaviour is untouched.
