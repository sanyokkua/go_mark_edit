# Tasks

> Reconstructed after the fact from the specification and the delivered code; the original task list was not kept in this form.

## 1. Action registry and shortcuts

- [x] 1.1 Canonical action registry with scope, availability and surface membership
- [x] 1.2 Dispatcher enforcing modal suppression, editor focus and writable-document checks
- [x] 1.3 Editor-stage shortcut bindings and keyboard shortcuts dialog

## 2. Formatting actions

- [x] 2.1 Pure formatting transformations for inline markers, headings, lists, quote, link and table
- [x] 2.2 Editor action executor applying one bounded undoable edit through the document-command seam
- [x] 2.3 Honest unavailable outcomes for Image, Format, Compact, Lint and Toggle Assistant

## 3. Menus, toolbar and context menu

- [x] 3.1 Menu row with Settings, View and About menus built from the registry
- [x] 3.2 Formatting toolbar with overflow at 768 and 375 px and the arrangement control
- [x] 3.3 Editor context menu dispatching the same action identities

## 4. Editor display settings

- [x] 4.1 Line numbers, word wrap and font size (13/14/16) settings, validated and acknowledged in Go
- [x] 4.2 Settings menu and dialog controls applying the values to the editor

## 5. Verification

- [x] 5.1 Unit tests for formatting transformations and registry/dispatch behaviour
- [x] 5.2 End-to-end tests for menus, deferred controls, narrow width and editor round trip
