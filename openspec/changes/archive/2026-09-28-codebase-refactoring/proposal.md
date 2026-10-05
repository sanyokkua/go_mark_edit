# Proposal

## Why

A project health audit found real defects (lost writes, races, silent autosave failures, a second tab for hard-linked files), UI behaviours copied instead of shared, "end-to-end" tests that ran against a TypeScript imitation of the backend, a verification process defined in many places, and conflicting project guidance. The goal was to fix this without adding product capability, so later features build on one owner per behaviour and verification that exercises the real application.

## What Changes

- Fix the audited defects: write ordering for Save As versus autosave, locked refusal messages, leaked per-document state, silent autosave errors, hard-link identity on macOS, link handling and focus loss.
- Give the backend one document-lifecycle owner, one shutdown protocol (native close and quit always resolve), request identities on every bridge call with bounded waits and stuck-call notices, and one key-value helper.
- Build one shared UI component library (popup, menu item, bar, island, tab bar, pane, sidebar, modal shell, status bar, notification surface) and decompose the four oversized components.
- Replace the mock and pixel-parity test stacks with end-to-end tests against the real Go backend started through `wails dev`; move tests into separate roots with behaviour-sentence titles.
- Define six verification stages behind five entry scripts, with hooks and CI calling only those scripts; add a baseline record and a release workflow.
- Restore synchronized scrolling between the editor and the preview, and local image rendering in the preview.
- Remove committed evidence trees and stale instructions; make the architecture map and the active specification the single authority.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `app-shell`: shutdown protocol, shared component library, notification surface.
- `file-lifecycle`: single lifecycle owner, write ordering, disposal, autosave errors, file identity.
- `document-tabs`: shared tab bar, hard-link and duplicate-open handling.
- `editor`: synchronized scrolling with the preview.
- `markdown-preview`: scroll sync, local images, link handling.
- `local-links`: refused and external links reported through the notification surface.
- `actions-shortcuts`: bridge request identities and stuck-call notices.
- `appearance-themes`: colour literals confined to the token file.
- `offline-privacy`: bundle contains no remote assets; offline start verified.
- `tidy-format-lint`: lint, format and test tooling rules.

## Impact

Touches the whole repository: `internal/` (appmodel, application, bridge, kv, apperr), `frontend/src/ui` and `frontend/src/logic`, `scripts/`, `tools/`, `.github/workflows/`, `docs/architecture.md`, and project instructions. No user-visible feature is added beyond scroll sync and local images. Verified by a full six-stage run, a baseline comparison and a packaged-app walkthrough.
