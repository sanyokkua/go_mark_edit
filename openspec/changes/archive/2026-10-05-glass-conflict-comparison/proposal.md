# Proposal

## Why

Floating surfaces did not hide the text behind them, which hurt readability in the Liquid Glass appearance. The external-change comparison showed only the first change with truncated previews and inexact size figures, so users could not judge a conflict.

## What Changes

- Strong frosted blur (starting at 48px) on Liquid Glass menus, context menus, disclosures and dialogs; Material and Minimal are unchanged.
- The conflict dialog compares the complete On disk and Yours text in a read-only side-by-side diff with previous and next change controls.
- Statistics are exact: On disk shows the physical bytes read, Yours shows the encoded size it would be saved with, and line counts are one plus the number of line feeds.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `external-change-conflict`: full comparison and accurate statistics.
- `appearance-themes`: frosted floating surfaces in Liquid Glass.

## Impact

Backend conflict payload and encoded-size calculation; bridge projection; conflict dialog (bundled Monaco diff editor); shared popup and modal surfaces. No new dependency, setting or network request. Current `openspec/specs` are authoritative.
