# Proposal

## Why

Preview table cells broke words in the middle, which made narrow tables hard to read, and the editor caret showed a decorative shadow and outline that distracted from writing.

## What Changes

- Table headers and cells wrap at normal word boundaries, including inline code; long unbroken values scroll horizontally.
- The editor's focused input loses its extra shadow and outline; the editor boundary focus indicator and caret color remain in all appearances.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `markdown-preview`: table word wrapping.
- `editor`: simplified caret and focus styling.

## Impact

Preview and editor stylesheets only. No settings, API, dependency or persistence change. Current `openspec/specs` are authoritative.
