# Proposal

## Why

In split view the editor and preview always shared the width evenly, and the editor had no search. Users need to give more room to the pane they are working in and to find and replace text without leaving the application.

## What Changes

- A draggable, keyboard-accessible divider between editor and preview, bounded to 20-80 percent of the width and defaulting to 50.
- The ratio is kept per document, saved with the file's existing per-path metadata, and restored on reopen.
- Cmd/Ctrl+F opens Monaco's Find widget and Cmd/Ctrl+R opens Replace, with read-only and modal guards.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `editor`: split divider, per-document ratio, Find and Replace.
- `actions-shortcuts`: Find and Replace actions and shortcuts from the action registry.

## Impact

Backend document view state and file metadata persistence; frontend editor stage, a reusable divider component, Monaco actions. No new dependency or network behaviour. Current `openspec/specs` are authoritative.
