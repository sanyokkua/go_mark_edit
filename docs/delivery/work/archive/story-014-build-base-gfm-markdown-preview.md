---
id: STORY-014
title: Build the base GFM Markdown preview
status: done
spec_clauses:
  - ../../../_archive-2026-07-28-specification/01_Product/01_FUNCTIONAL_REQUIREMENTS.md#fr-rendering
  - ../../../_archive-2026-07-28-specification/01_Product/05_RENDERING_AND_EXTENSIONS.md#pipeline
  - ../../../_archive-2026-07-28-specification/01_Product/05_RENDERING_AND_EXTENSIONS.md#gfm-features
  - ../../../_archive-2026-07-28-specification/01_Product/05_RENDERING_AND_EXTENSIONS.md#sanitization
  - ../../../_archive-2026-07-28-specification/02_Architecture/03_FRONTEND_REACT.md#markdown-pipeline
  - ../../../_archive-2026-07-28-specification/03_NonFunctional/04_OFFLINE.md#2-bundled-assets
  - 07_Phases/PHASE_01_CORE_EDITOR.md#scope
  - 07_Phases/PHASE_01_CORE_EDITOR.md#out-of-scope
  - 07_Phases/PHASE_04_RENDERING_EXTENSIONS.md#scope
phase_requirements:
  - PH01-R11
modules:
  - logic/markdown/
  - ui/components/
  - ui/styles/
acceptance_criteria:
  - STORY-014-AC-1
  - STORY-014-AC-2
  - STORY-014-AC-3
  - STORY-014-AC-4
  - STORY-014-AC-5
  - STORY-014-AC-6
edge_cases:
  - EC-RENDER-5
  - EC-RENDER-6
  - EC-RENDER-7
depends_on:
  - STORY-010
adrs:
  - ADR-0003
phase: 01
owner: coder
estimate: M
---

> **Historical vocabulary — this story is not maintained.** The `AC-…`, `EC-…` and `DD-…` identifiers are the scheme of the pre-2026-07-28 specification; `spec_clauses` and `phase_requirements` point into `_archive-2026-07-28-specification/`, which is kept so a citation still resolves and is **not normative**. See `README.md`. If anything here disagrees with the code, the code is the truth.
> A link beginning `07_Phases/` names a retired phase document that was deleted rather than archived; that set is in git at `e1bd33f`.

# STORY-014 — Build the base GFM Markdown preview

## Goal
Render safe, accessible GFM from an in-memory Markdown string so users can preview core tables, task lists, strikethrough, and links entirely offline while higher rendering tiers remain deferred.

## In scope
- Add one centralized Phase-01 renderer configuration using `react-markdown`, `remark-gfm`, and a sanitize-last pipeline.
- Add a presentational `MarkdownView` rooted at `.gme-preview` with token-only preview styling.
- Render GFM tables, read-only task lists, strikethrough, and autolinks into accessible DOM.
- Keep math/directive and other higher-tier syntax literal; render a Mermaid fence as an ordinary safe code block because Mermaid rendering is separately deferred to Phase 04.
- Disable raw document HTML and sanitize last, stripping dangerous URLs and executable attributes.
- Add a deny-by-default image/resource override until Phase 09: remote and local Markdown images render non-fetching alt text/placeholder markup with no fetchable `src` and cause no document-supplied request.
- Prove separately that renderer dependencies/build artifacts contain no remote runtime import or fetch path.

## Out of scope
- Minimal/Full standard selection/plugin mapping, footnotes, syntax highlighting, KaTeX, Mermaid, and `MermaidBlock`, owned by Phase 04 under the phase-specific scope even where broader rendering chapters describe the eventual complete pipeline.
- Live-preview debounce and backend-accepted source ownership, owned by STORY-017.
- Remote-document asset policy and guarded local image handling, owned by Phase 09.
- Reading mode and its full-chrome-hidden layout, owned by Phase 04.

## Spec inputs
- `../../../_archive-2026-07-28-specification/01_Product/01_FUNCTIONAL_REQUIREMENTS.md#fr-rendering` — use the specified react-markdown family as the rendering foundation and deliver the GFM subset for this phase.
- `../../../_archive-2026-07-28-specification/01_Product/05_RENDERING_AND_EXTENSIONS.md#pipeline` — centralize the offline webview renderer and mount output below a `.gme-preview` root.
- `../../../_archive-2026-07-28-specification/01_Product/05_RENDERING_AND_EXTENSIONS.md#gfm-features` — render tables, read-only task lists, strikethrough, and literal autolinks at the GFM tier.
- `../../../_archive-2026-07-28-specification/01_Product/05_RENDERING_AND_EXTENSIONS.md#sanitization` — disable/strip executable raw HTML and dangerous URLs, with sanitization as the last processing stage.
- `../../../_archive-2026-07-28-specification/02_Architecture/03_FRONTEND_REACT.md#markdown-pipeline` — keep renderer configuration in `logic/markdown/renderer.ts` and expose it through the presentational view.
- `../../../_archive-2026-07-28-specification/03_NonFunctional/04_OFFLINE.md#2-bundled-assets` — bundle every renderer dependency and asset into the application; fetch nothing at runtime.
- `07_Phases/PHASE_01_CORE_EDITOR.md#scope` — deliver only the base CommonMark/GFM renderer and Phase-01 preview root.
- `07_Phases/PHASE_01_CORE_EDITOR.md#out-of-scope` — defer footnotes/standard mapping, syntax highlighting, KaTeX, Mermaid, and resource-policy implementation to later phases.
- `07_Phases/PHASE_04_RENDERING_EXTENSIONS.md#scope` — assign footnotes, standard/plugin mapping, highlighting, KaTeX, and Mermaid to the Phase-04 renderer expansion.

## Design constraints
- Phase 01 has one fixed base GFM tier. Footnotes and Minimal/Full mapping remain Phase 04 despite broader frozen descriptions of the eventual GFM/full pipeline; math/directive syntax stays literal to satisfy EC-RENDER-6.
- Mermaid is not a Full-only feature: Phase 01 deliberately lacks `MermaidBlock`, so a `mermaid` fence renders as an ordinary sanitized code block and imports no Mermaid renderer.
- The pipeline disables raw document HTML and sanitizes last; it never executes document HTML, event handlers, dangerous URLs, or scripts (EC-RENDER-5).
- Image/resource overrides are deny-by-default until Phase 09: no remote/local Markdown resource receives a fetchable `src`, no document-supplied request occurs, and alt/placeholder output preserves readable fallback (EC-RENDER-7).
- `MarkdownView` is presentational and reads its Markdown through typed props; it neither imports Redux nor reaches through the adapter to the backend.
- All preview styling is scoped below `.gme-preview`, uses CSS Modules and existing tokens, and contains no hardcoded colors or inline static styling (DD-19; ADR-0003).
- Renderer packages and assets are local bundled modules with no runtime import URL, CDN, fetch, telemetry, or background network call.
- Backend Handler → Service → Repository layering, concrete `apperr.*Result` envelopes, backend-authoritative state, and adapter-only Wails imports remain unchanged.

## Acceptance criteria

### STORY-014-AC-1
**Satisfies:** PH01-R11
One renderer module configures `react-markdown`, `remark-gfm`, raw-HTML-disabled processing, and sanitize-last behavior for the fixed Phase-01 base GFM tier.

### STORY-014-AC-2
**Satisfies:** PH01-R11
Tables, task lists, strikethrough, and autolinks render with accessible DOM and read-only task checkboxes.

### STORY-014-AC-3
**Satisfies:** PH01-R11
Math/directive and other higher-tier syntax remain literal, while a Mermaid fence renders as an ordinary safe code block; no deferred extension renderer is loaded. (satisfies EC-RENDER-6)

### STORY-014-AC-4
**Satisfies:** PH01-R11
The preview uses the `.gme-preview` root and token-only styling; raw document HTML is disabled/sanitized last and dangerous URLs are stripped without execution. (satisfies EC-RENDER-5)

### STORY-014-AC-5
**Satisfies:** PH01-R11
Remote or local Markdown image/resource input renders non-fetching alt text/placeholder output with no fetchable `src` and triggers no document-supplied request. (satisfies EC-RENDER-7)

### STORY-014-AC-6
**Satisfies:** PH01-R11
Renderer dependencies and production assets contain no runtime remote import, CDN URL, or fetch path.

## Test plan
Each Jest test name begins with its matching `STORY-014-AC-N` id.

- STORY-014-AC-1 — unit — `frontend/src/logic/markdown/renderer.test.ts` — `it('STORY-014-AC-1 centralizes the base GFM pipeline')`.
- STORY-014-AC-2 — unit — `frontend/src/ui/components/MarkdownView.test.tsx` — `it('STORY-014-AC-2 renders GFM features')`.
- STORY-014-AC-3 — unit — `frontend/src/ui/components/MarkdownView.test.tsx` — `it('STORY-014-AC-3 leaves higher-tier syntax and Mermaid safe')` (EC-RENDER-6).
- STORY-014-AC-4 — unit — `frontend/src/ui/components/MarkdownView.test.tsx` — `it('STORY-014-AC-4 disables raw HTML and dangerous URLs')` (EC-RENDER-5).
- STORY-014-AC-5 — unit — `frontend/src/ui/components/MarkdownView.test.tsx` — `it('STORY-014-AC-5 blocks document-supplied resource requests')` (EC-RENDER-7).
- STORY-014-AC-6 — architecture — `frontend/src/logic/markdown/renderer.test.ts` — `it('STORY-014-AC-6 keeps renderer dependencies and assets offline')`.

## Definition of done
- [ ] Every acceptance criterion has a passing test whose Jest name begins with its `STORY-014-AC-N` id.
- [ ] EC-RENDER-5, EC-RENDER-6, and EC-RENDER-7 each have a passing named test.
- [ ] GFM output is accessible/read-only where required; raw HTML/dangerous URLs cannot execute; image/resource input cannot initiate a request; Mermaid remains an ordinary safe code block.
- [ ] Renderer code and production assets are locally bundled and the static/build scan finds no CDN, remote import, or fetch path.
- [ ] Frontend `prettier --check`, ESLint, `tsc --noEmit`, and Jest pass; backend quality gates pass if backend/generated files are touched.
- [ ] Generated bindings remain current with no unexpected drift.
- [ ] Handler → Service → Repository layering, Result envelopes, backend authority, adapter-only Wails imports, and token-only theming remain intact.
- [ ] `just trace` regenerates the record and `just trace-check` passes with zero orphans and a fresh record.
- [ ] The module inventory is unchanged, or changes are reflected in `01_MODULE_INVENTORY.md` in the same story.
- [ ] The `.gme-preview` root matches the applicable Phase-01 visual structure, and no background/unsolicited network call, telemetry, remote runtime asset, or document-supplied request is introduced.
