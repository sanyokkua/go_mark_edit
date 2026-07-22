---
id: STORY-023
title: Expose document commands through a stable editor-session boundary
status: done
spec_clauses:
  - 01_Product/02_EDITOR_AND_VIEWER_MODES.md#editor-mode
  - 02_Architecture/03_FRONTEND_REACT.md#state-ownership
  - 02_Architecture/03_FRONTEND_REACT.md#components
  - 02_Architecture/08_LLM_INTEGRATION.md#forward-compat-seams
  - 00_Foundation/06_IMPLEMENTATION_STAGES.md#3-forward-compatibility-constraints-per-stage
  - 00_Foundation/04_DESIGN_DECISIONS.md#14-application-state-ownership
  - 07_Phases/PHASE_01_CORE_EDITOR.md#scope
phase_requirements:
  - PH01-R09
  - PH01-R10
modules:
  - logic/hooks/
  - ui/components/
  - ui/widgets/
acceptance_criteria:
  - STORY-023-AC-1
  - STORY-023-AC-2
  - STORY-023-AC-3
  - STORY-023-AC-4
  - STORY-023-AC-5
edge_cases: []
depends_on:
  - STORY-022
adrs:
  - ADR-0002
  - ADR-0010
  - ADR-0014
phase: 01
owner: coder
estimate: M
---

# STORY-023 — Expose document commands through a stable editor-session boundary

## Goal
Make the existing document selection and replacement commands available through a stable editor-session boundary so a non-editor sibling can consume them in Editor, Split, or Preview without reaching into Monaco.

## In scope
- Move ownership of the existing `DocumentCommandAPI` provider out of the editor-pane-only subtree and into the persistent editor-session/application boundary.
- Keep the command provider and its active editor handle available while the same document is in Editor, Split, or Preview-only.
- Preserve the exact `getSelection`, `replaceRange`, and `replaceAll` public surface and its null-safe behavior.
- Preserve one Monaco undo edit per replacement and route resulting content through the normal `UpdateBuffer` queue.
- Add a non-editor sibling integration harness and a static direct-Monaco boundary test.

## Out of scope
- Monaco mount/session preservation and flush-before-hide, owned by STORY-022.
- Adding command methods beyond `getSelection`, `replaceRange`, and `replaceAll`.
- Building an assistant sidebar, diff proposal UI, provider, inference, or other Stage-3 feature; those later consumers use this seam.
- Direct file writes, save/autosave behavior, or a second content synchronization path.

## Spec inputs
- `01_Product/02_EDITOR_AND_VIEWER_MODES.md#editor-mode` — preserve selection-targeted editor behavior and the responsive Monaco working copy.
- `02_Architecture/03_FRONTEND_REACT.md#state-ownership` — keep replacements in the active working copy, then synchronize through the adapter to the backend-authoritative model.
- `02_Architecture/03_FRONTEND_REACT.md#components` — retain `CodeEditor` as the thin Monaco wrapper and expose behavior through a component/session contract.
- `02_Architecture/08_LLM_INTEGRATION.md#forward-compat-seams` — supply the F3/F7 selection and apply-edit surface that a later sibling assistant consumes without touching Monaco.
- `00_Foundation/06_IMPLEMENTATION_STAGES.md#3-forward-compatibility-constraints-per-stage` — keep F3/F7 stable with `getSelection`, `replaceRange`, and `replaceAll` as the single document-command seam.
- `00_Foundation/04_DESIGN_DECISIONS.md#14-application-state-ownership` — route edits through the visible working copy and normal `UpdateBuffer` path while the Go model remains canonical.
- `07_Phases/PHASE_01_CORE_EDITOR.md#scope` — remediate the Phase-01 editor session without implementing file I/O or Stage-3 consumers.

## Design constraints
- One persistent editor-session provider owns the `CodeEditorHandle` and exposes `DocumentCommandAPI` above editor/preview pane branching. The API is available to non-editor siblings for the active document in every arrangement.
- `DocumentCommandAPI` remains exactly `getSelection`, `replaceRange`, and `replaceAll`; moving ownership does not add an alternate Monaco or content-access surface.
- `replaceRange` and `replaceAll` execute through `CodeEditor` as one Monaco undo edit and let Monaco's normal change callback enter the existing adapter-owned `UpdateBuffer` queue.
- `CodeEditor` is the sole direct Monaco boundary selected by ADR-0002. Consumers, including future Stage-3 UI, use the session command API and never import Monaco or hold an editor instance (F3/F7, DD-42; ADR-0010).
- The Go backend remains authoritative; Redux and context contain no canonical document text beyond the one ephemeral active editor session (DD-62/DD-63/DD-64; ADR-0014).
- Only `logic/adapter/` imports `wailsjs/`; bound handlers retain Handler → Service → Repository layering, concrete `apperr.*Result` envelopes, and panic recovery.
- Styling remains token-only and all editor assets stay bundled; no background/unsolicited network call, telemetry, provider, or remote asset is introduced (DD-28 through DD-32, ADR-0011).

## Acceptance criteria

### STORY-023-AC-1
**Satisfies:** PH01-R09, PH01-R10
**Given** a non-editor sibling inside the active editor session, **when** the document is in Editor or Split, **then** the sibling can call the same `DocumentCommandAPI` supplied to the editor surface.

### STORY-023-AC-2
**Satisfies:** PH01-R09, PH01-R10
**Given** the active document is Preview-only, **when** a non-editor sibling reads the editor-session command boundary, **then** `getSelection`, `replaceRange`, and `replaceAll` remain available against the preserved active session.

### STORY-023-AC-3
**Satisfies:** PH01-R09
`getSelection` returns the active Monaco selection through `DocumentCommandAPI`, or `null` when no active editor handle exists.

### STORY-023-AC-4
**Satisfies:** PH01-R09
Each `replaceRange` or `replaceAll` call creates one Monaco undo edit and routes the resulting complete text through the existing `UpdateBuffer` queue.

### STORY-023-AC-5
**Satisfies:** PH01-R09
A static architecture test rejects direct Monaco imports, editor-instance access, or `CodeEditorHandle` ownership outside the `CodeEditor`/editor-session boundary and approved command hook.

## Test plan
- STORY-023-AC-1 — integration — `frontend/src/ui/widgets/editorSession.integration.test.tsx` — `it('STORY-023-AC-1 exposes commands to a non-editor sibling in Editor and Split')`.
- STORY-023-AC-2 — integration — `frontend/src/ui/widgets/editorSession.integration.test.tsx` — `it('STORY-023-AC-2 keeps sibling commands available in Preview-only')`.
- STORY-023-AC-3 — unit — `frontend/src/logic/hooks/useDocumentCommands.test.ts` — `it('STORY-023-AC-3 returns the current selection or null')`.
- STORY-023-AC-4 — integration — `frontend/src/ui/components/CodeEditor.test.tsx` — `it('STORY-023-AC-4 preserves replacement undo and UpdateBuffer routing')`.
- STORY-023-AC-5 — architecture — `frontend/src/logic/hooks/useDocumentCommands.test.ts` — `it('STORY-023-AC-5 enforces the direct-Monaco ownership boundary')`.

## Definition of done
- [ ] Every acceptance criterion has a passing Jest test whose name begins with its `STORY-023-AC-N` id.
- [ ] Sibling integration proves command availability in Editor, Split, and Preview-only against one persistent active session.
- [ ] Component integration proves current/null selection, range/all replacement semantics, one undo edit, and normal `UpdateBuffer` queue routing.
- [ ] Static architecture proof prevents any consumer from reaching into Monaco or owning the editor handle outside the approved boundary.
- [ ] Frontend `prettier --check`, ESLint, `tsc --noEmit`, and Jest pass; backend gates pass if backend/generated files are touched.
- [ ] Generated bindings remain current with no unexpected drift.
- [ ] Handler → Service → Repository layering, Result envelopes, backend authority, adapter-only Wails imports, and token-only theming remain intact.
- [ ] `just trace` regenerates the record and `just trace-check` passes with zero orphans and a fresh record.
- [ ] The module inventory is unchanged, or changes are reflected in `01_MODULE_INVENTORY.md` in the same story.
- [ ] No assistant UI, provider/network behavior, background/unsolicited network call, telemetry, or remote runtime asset is introduced.
