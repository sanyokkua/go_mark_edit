---
id: STORY-022
title: Preserve the active Monaco session across view arrangements
status: done
spec_clauses:
  - ../../../_archive-2026-07-28-specification/01_Product/02_EDITOR_AND_VIEWER_MODES.md#editor-mode
  - ../../../_archive-2026-07-28-specification/01_Product/02_EDITOR_AND_VIEWER_MODES.md#split-view
  - ../../../_archive-2026-07-28-specification/01_Product/02_EDITOR_AND_VIEWER_MODES.md#view-mode-toggle
  - ../../../_archive-2026-07-28-specification/01_Product/02_EDITOR_AND_VIEWER_MODES.md#per-document-view-state
  - ../../../_archive-2026-07-28-specification/01_Product/02_EDITOR_AND_VIEWER_MODES.md#edge-cases
  - ../../../_archive-2026-07-28-specification/02_Architecture/03_FRONTEND_REACT.md#state-ownership
  - ../../../_archive-2026-07-28-specification/02_Architecture/03_FRONTEND_REACT.md#components
  - ../../../_archive-2026-07-28-specification/00_Foundation/04_DESIGN_DECISIONS.md#14-application-state-ownership
  - 07_Phases/PHASE_01_CORE_EDITOR.md#phase-exit-checklist
phase_requirements:
  - PH01-R04
  - PH01-R06
modules:
  - logic/store/
  - ui/components/
  - ui/widgets/
acceptance_criteria:
  - STORY-022-AC-1
  - STORY-022-AC-2
  - STORY-022-AC-3
  - STORY-022-AC-4
  - STORY-022-AC-5
edge_cases:
  - EC-DOCS-12
depends_on:
  - STORY-021
adrs:
  - ADR-0002
  - ADR-0014
phase: 01
owner: coder
estimate: M
---

> **Historical vocabulary — this story is not maintained.** The `AC-…`, `EC-…` and `DD-…` identifiers are the scheme of the pre-2026-07-28 specification; `spec_clauses` and `phase_requirements` point into `_archive-2026-07-28-specification/`, which is kept so a citation still resolves and is **not normative**. See `README.md`. If anything here disagrees with the code, the code is the truth.
> A link beginning `07_Phases/` names a retired phase document that was deleted rather than archived; that set is in git at `e1bd33f`.

# STORY-022 — Preserve the active Monaco session across view arrangements

## Goal
Let users move through Editor, Split, and Preview arrangements without losing or recreating the active editing session, including its unsent text, cursor, selection, undo history, and layout.

## In scope
- Keep the active `CodeEditor` and its Monaco model/session mounted while Preview-only hides the editor pane.
- Flush pending buffer and per-document view synchronization before the explicit command that hides the editor crosses the adapter boundary.
- Re-show the same editor/model when returning to Editor or Split, preserving text, cursor, selection, undo history, scroll, and editor geometry.
- Prevent arrangement transitions from reseeding the session from bootstrap `ActiveBuffer` or applying backend content to the focused editor.
- Add a store-connected `EditorView` regression suite and a responsive Playwright edit → Preview → Editor/Split round trip.

## Out of scope
- Exposing the document-command API to a non-editor sibling, owned by STORY-023.
- File-backed tabs, switching documents, close/save/autosave, and durable per-document state, owned by Phase 02 and Phase 08.
- Chrome-hidden reading mode and its entry/exit scroll restoration, owned by Phase 04.
- Replacing Monaco or creating a second editor/model for Preview-only.

## Spec inputs
- `../../../_archive-2026-07-28-specification/01_Product/02_EDITOR_AND_VIEWER_MODES.md#editor-mode` — retain Monaco's responsive working buffer and source-editing behavior while other views consume backend-accepted state.
- `../../../_archive-2026-07-28-specification/01_Product/02_EDITOR_AND_VIEWER_MODES.md#split-view` — implement Editor-only, Split, and Preview-only as pane visibility arrangements without invalidating the editor session.
- `../../../_archive-2026-07-28-specification/01_Product/02_EDITOR_AND_VIEWER_MODES.md#view-mode-toggle` — keep exactly one backend-owned arrangement active and synchronize the primary and secondary controls.
- `../../../_archive-2026-07-28-specification/01_Product/02_EDITOR_AND_VIEWER_MODES.md#per-document-view-state` — preserve cursor, selection, scroll, and arrangement for the active document while explicit arrangement intent takes precedence.
- `../../../_archive-2026-07-28-specification/01_Product/02_EDITOR_AND_VIEWER_MODES.md#edge-cases` — satisfy EC-DOCS-12 by keeping content-free patches from echoing text or disturbing the focused editor.
- `../../../_archive-2026-07-28-specification/02_Architecture/03_FRONTEND_REACT.md#state-ownership` — keep the visible Monaco buffer as ephemeral scaffolding, flush it at boundaries, and reconcile only derived metadata through `state:patch`.
- `../../../_archive-2026-07-28-specification/02_Architecture/03_FRONTEND_REACT.md#components` — retain `CodeEditor` as the thin Monaco boundary and keep other components independent of Monaco internals.
- `../../../_archive-2026-07-28-specification/00_Foundation/04_DESIGN_DECISIONS.md#14-application-state-ownership` — apply DD-62/DD-63/DD-64 without creating a second content authority or focused-editor echo.
- `07_Phases/PHASE_01_CORE_EDITOR.md#phase-exit-checklist` — preserve cursor/selection, view-mode behavior, responsive Monaco geometry, and the content-free patch invariant.

## Design constraints
- Preview-only changes visibility; it does not unmount or dispose the active `CodeEditor`, Monaco editor instance, model, undo stack, or ephemeral session refs.
- A transition that will hide the editor first awaits `flushBuffer(documentId)` and `flushDocView(documentId)`, then submits its explicit arrangement intent through STORY-021's per-document queue.
- Returning to Editor or Split reveals the same session. Bootstrap `ActiveBuffer` seeds a document identity only once and is never reapplied as an arrangement side effect.
- Redux remains a metadata-only projection; no document content enters a slice or `state:patch`, and no patch calls Monaco `setValue` for the focused editor (EC-DOCS-12).
- The Go backend remains authoritative for canonical content and per-document view state; Monaco is the one visible debounce-synced working copy (DD-62/DD-63/DD-64; ADR-0014).
- `CodeEditor` remains the sole Monaco wrapper selected by ADR-0002. Other components consume props/session contracts and do not import Monaco internals.
- Only `logic/adapter/` imports `wailsjs/`; bound handlers retain Handler → Service → Repository layering, concrete `apperr.*Result` envelopes, and panic recovery.
- Styling and hidden-state layout use existing CSS modules and tokens only; all editor assets remain bundled with no background/unsolicited network call (DD-28 through DD-32, ADR-0011).

## Acceptance criteria

### STORY-022-AC-1
**Satisfies:** PH01-R04
**Given** pending buffer or view synchronization, **when** the user selects Preview-only, **then** both pending states are flushed before the explicit hide arrangement is sent.

### STORY-022-AC-2
**Satisfies:** PH01-R06
**When** Preview-only becomes the accepted backend arrangement, the active Monaco editor and model remain mounted but hidden, with no editor/model disposal or replacement.

### STORY-022-AC-3
**Satisfies:** PH01-R06
**Given** an edit, cursor, selection, scroll position, undo history, and editor geometry before Preview-only, **when** the user returns to Editor or Split, **then** the same session restores those exact values and bootstrap content is not reseeded.

### STORY-022-AC-4
**Satisfies:** PH01-R06
**Given** a focused editor with a local working edit, **when** a backend metadata patch is reconciled, **then** the patch contains no document text and does not call Monaco `setValue` or move the cursor/selection. (satisfies EC-DOCS-12)

### STORY-022-AC-5
**Satisfies:** PH01-R06
At 375, 768, and 1280 px, a Playwright edit → Preview → Editor round trip preserves the edited source and usable Monaco geometry without horizontal overflow or console errors.

## Test plan
- STORY-022-AC-1 — integration — `frontend/src/ui/widgets/EditorView.integration.test.tsx` — `it('STORY-022-AC-1 flushes session state before hiding the editor')`.
- STORY-022-AC-2 — integration — `frontend/src/ui/widgets/EditorView.integration.test.tsx` — `it('STORY-022-AC-2 keeps Monaco mounted while preview-only is visible')`.
- STORY-022-AC-3 — integration — `frontend/src/ui/widgets/EditorView.integration.test.tsx` — `it('STORY-022-AC-3 restores the exact Monaco session without bootstrap reseeding')`.
- STORY-022-AC-4 — integration — `frontend/src/ui/widgets/EditorView.integration.test.tsx` — `it('STORY-022-AC-4 keeps focused-editor patches content-free')` (EC-DOCS-12).
- STORY-022-AC-5 — e2e-smoke — `frontend/e2e/core-editor.test.ts` — `test('STORY-022-AC-5 round trips an edit through Preview responsively')`.

## Definition of done
- [ ] Every acceptance criterion has a passing Jest or Playwright test whose name begins with its `STORY-022-AC-N` id.
- [ ] EC-DOCS-12 has exact proof in the store-connected focused-editor patch test.
- [ ] Integration tests prove flush-before-hide, no unmount/disposal, exact session/undo restoration, and no bootstrap reseed or `setValue` echo.
- [ ] Playwright proves the edit → Preview → Editor round trip at 375/768/1280 px with usable editor geometry, no overflow, and no console error.
- [ ] Frontend `prettier --check`, ESLint, `tsc --noEmit`, Jest, and Playwright pass; backend gates pass if backend/generated files are touched.
- [ ] Generated bindings remain current with no unexpected drift.
- [ ] Handler → Service → Repository layering, Result envelopes, backend authority, adapter-only Wails imports, and token-only theming remain intact.
- [ ] `just trace` regenerates the record and `just trace-check` passes with zero orphans, exact EC-DOCS-12 evidence, and a fresh record.
- [ ] The module inventory is unchanged, or changes are reflected in `01_MODULE_INVENTORY.md` in the same story.
- [ ] No background/unsolicited network call, telemetry, or remote runtime asset is introduced.
