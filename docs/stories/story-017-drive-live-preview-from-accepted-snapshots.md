---
id: STORY-017
title: Drive live preview from backend-accepted debounced snapshots
status: draft
spec_clauses:
  - 01_Product/05_RENDERING_AND_EXTENSIONS.md#preview-debounce
  - 02_Architecture/07_LARGE_FILES_AND_CONCURRENCY.md#preview-debounce
  - 03_NonFunctional/02_PERFORMANCE.md#3-preview-debounce-targets
  - 00_Foundation/04_DESIGN_DECISIONS.md#6-rendering--assets
  - 00_Foundation/04_DESIGN_DECISIONS.md#14-application-state-ownership
modules:
  - logic/adapter/
  - logic/hooks/
  - ui/widgets/
acceptance_criteria:
  - STORY-017-AC-1
  - STORY-017-AC-2
  - STORY-017-AC-3
  - STORY-017-AC-4
  - STORY-017-AC-5
  - STORY-017-AC-6
edge_cases:
  - EC-RENDER-4
depends_on:
  - STORY-014
  - STORY-015
  - STORY-019
adrs:
  - ADR-0002
  - ADR-0003
  - ADR-0014
phase: 01
owner: coder
estimate: M
---

# STORY-017 — Drive live preview from backend-accepted debounced snapshots

## Goal
Update the rendered preview from the exact buffer snapshot the backend successfully accepts, keeping typing responsive and the last good preview stable when synchronization fails.

## In scope
- Consume STORY-019's adapter-owned `onAccepted`/accepted-generation callback; the preview hook owns no timer and publishes only the identical snapshot acknowledged by `UpdateBuffer`.
- Seed the initial preview once from the bootstrap `ActiveBuffer` before the first edit acknowledgement.
- Add a live-preview hook/state seam that retains the last accepted snapshot across buffer-sync failures and stale completions while the normal envelope/toast path reports failures.
- Feed accepted ephemeral text into `MarkdownView` inside `EditorView` without Redux storage, a backend readback, or a second debounce.
- Bound preview rendering for large in-memory input to one render after an editing burst settles.
- Track accepted generations so the latest generation wins and an out-of-order older completion cannot roll the preview backward.

## Out of scope
- Configurable large-document auto-pause thresholds and manual refresh controls, owned by Phase 04.
- Rendering directly from raw keystrokes, owning another timer, a second preview debounce, or reading content back from the backend after `UpdateBuffer`.
- Storing preview source in Redux, `localStorage`, a `state:patch`, or Monaco replacement state.
- Full rendering tiers, syntax highlighting, KaTeX, Mermaid, and reading mode, owned by Phase 04.

## Spec inputs
- `01_Product/05_RENDERING_AND_EXTENSIONS.md#preview-debounce` — coalesce preview updates and preserve editor responsiveness for large documents.
- `02_Architecture/07_LARGE_FILES_AND_CONCURRENCY.md#preview-debounce` — drive preview and backend synchronization from the same debounced snapshot rather than raw `onChange` text.
- `03_NonFunctional/02_PERFORMANCE.md#3-preview-debounce-targets` — render approximately 150–300 ms after typing stops and avoid preview work on every keystroke.
- `00_Foundation/04_DESIGN_DECISIONS.md#6-rendering--assets` — apply DD-19/DD-20 with a bundled renderer and a debounced Monaco preview path.
- `00_Foundation/04_DESIGN_DECISIONS.md#14-application-state-ownership` — make the successful backend-accepted buffer the source for other consumers while retaining preview text only as ephemeral view scaffolding.

## Design constraints
- STORY-019's adapter synchronization owner is the only owner of the 200 ms timer. The preview hook consumes accepted snapshot/generation callbacks and owns no timer.
- A timed push or explicit `flushBuffer` acknowledgement publishes the identical sent snapshot. A rejected Result or stale/out-of-order completion leaves the prior/latest accepted preview unchanged; raw keystrokes never render.
- The hydration `ActiveBuffer` seeds preview state exactly once before accepted generations begin.
- Preview text is ephemeral widget/hook state only and may not appear in Redux, `localStorage`, or a backend `state:patch` (DD-62, DD-63, DD-64; ADR-0014).
- Keep `MarkdownView` routed through the centralized offline `logic/markdown` renderer (DD-19/DD-20; ADR-0002, ADR-0003).
- Only `logic/adapter/` imports `wailsjs/`; bound commands retain concrete `apperr.*Result` envelopes and Handler → Service → Repository layering.
- Styling remains token-only and all renderer/editor assets are bundled; no network call, CDN path, telemetry, or background fetch is introduced.
- EC-RENDER-4 is covered here by bounded debounce work; configurable pause/manual refresh remains explicitly deferred to Phase 04.
- The normal 150–300 ms target measures typing-settle through successful acknowledgement/publication. Exceptional backend failure is excluded from a successful render-time claim, but publication always waits for success.

## Acceptance criteria

### STORY-017-AC-1
A controlled-clock adapter test proves the shared 200 ms synchronization sends one `UpdateBuffer` for a typing burst and invokes `onAccepted` only after success with the identical sent snapshot and generation.

### STORY-017-AC-2
If `UpdateBuffer` fails, the preview hook keeps the previous accepted preview visible while the normal envelope/toast path reports the failure.

### STORY-017-AC-3
A very large in-memory document does not render on each keystroke and produces at most one render after editing settles.

### STORY-017-AC-4
The bootstrap `ActiveBuffer` seeds the initial preview once, after which preview text remains ephemeral widget state outside the documents slice and every `state:patch`.

### STORY-017-AC-5
With a normal successful acknowledgement, accepted GFM input renders through `MarkdownView` within the 150–300 ms typing-settle target; publication never precedes success.

### STORY-017-AC-6
If accepted generations complete out of order, the latest generation wins and an older stale completion cannot roll the visible preview backward.

## Test plan
Each Jest test name begins with its matching `STORY-017-AC-N` id.

- STORY-017-AC-1 — unit — `frontend/src/logic/adapter/useSyncedBuffer.test.ts` — `it('STORY-017-AC-1 publishes the identical accepted buffer generation')`.
- STORY-017-AC-2 — unit — `frontend/src/logic/hooks/useLivePreview.test.ts` — `it('STORY-017-AC-2 keeps the last accepted preview on sync failure')`.
- STORY-017-AC-3 — unit — `frontend/src/logic/hooks/useLivePreview.test.ts` — `it('STORY-017-AC-3 bounds large-document preview work')` (EC-RENDER-4).
- STORY-017-AC-4 — integration — `frontend/src/ui/widgets/EditorView.integration.test.tsx` — `it('STORY-017-AC-4 keeps preview text outside Redux')`.
- STORY-017-AC-5 — integration — `frontend/src/ui/widgets/EditorView.integration.test.tsx` — `it('STORY-017-AC-5 renders accepted GFM within the debounce target')`.
- STORY-017-AC-6 — unit — `frontend/src/logic/hooks/useLivePreview.test.ts` — `it('STORY-017-AC-6 ignores stale accepted generations')`.

## Definition of done
- [ ] Every acceptance criterion has a passing test whose Jest name begins with its `STORY-017-AC-N` id.
- [ ] EC-RENDER-4 has a passing large-input test showing no raw-keystroke renders and at most one accepted settled render.
- [ ] Controlled-clock adapter proof covers the single STORY-019 timer and accepted callback; hook tests cover failure retention and stale-generation ordering; integration proves bootstrap seed and no Redux/patch content.
- [ ] Successful timed pushes and explicit flushes publish only their identical sent snapshots after acknowledgement, with latest-generation-wins semantics and no backend readback/second timer.
- [ ] Frontend `prettier --check`, ESLint, `tsc --noEmit`, and Jest pass; backend quality gates pass if backend/generated files are touched.
- [ ] Generated bindings remain current with no unexpected drift.
- [ ] Handler → Service → Repository layering, Result envelopes, backend authority, adapter-only Wails imports, and token-only theming remain intact.
- [ ] `just trace` regenerates the record and `just trace-check` passes with zero orphans and a fresh record.
- [ ] The module inventory is unchanged, or changes are reflected in `01_MODULE_INVENTORY.md` in the same story.
- [ ] Accepted preview output matches the applicable Phase-01 visual structure, and no background/unsolicited network call, telemetry, remote runtime asset, or document-supplied request is introduced.
