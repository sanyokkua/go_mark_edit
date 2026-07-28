---
id: STORY-031
title: Render safe offline GFM footnotes
status: done
spec_clauses:
  - ../../../_archive-2026-07-28-specification/01_Product/05_RENDERING_AND_EXTENSIONS.md#gfm-features
  - ../../../_archive-2026-07-28-specification/01_Product/05_RENDERING_AND_EXTENSIONS.md#sanitization
  - ../../../_archive-2026-07-28-specification/01_Product/05_RENDERING_AND_EXTENSIONS.md#edge-cases
  - ../../../_archive-2026-07-28-specification/02_Architecture/03_FRONTEND_REACT.md#markdown-pipeline
  - ../../../_archive-2026-07-28-specification/03_NonFunctional/04_OFFLINE.md#2-bundled-assets
  - 07_Phases/PHASE_01_CORE_EDITOR.md#requirement-ledger
phase_requirements:
  - PH01-R11
modules:
  - logic/markdown/
acceptance_criteria:
  - STORY-031-AC-1
  - STORY-031-AC-2
  - STORY-031-AC-3
edge_cases:
  - EC-RENDER-5
  - EC-RENDER-6
depends_on:
  - STORY-014
adrs:
  - ADR-0003
phase: 01
owner: coder
estimate: S
---

> **Historical vocabulary — this story is not maintained.** The `AC-…`, `EC-…` and `DD-…` identifiers are the scheme of the pre-2026-07-28 specification; `spec_clauses` and `phase_requirements` point into `_archive-2026-07-28-specification/`, which is kept so a citation still resolves and is **not normative**. See `README.md`. If anything here disagrees with the code, the code is the truth.
> A link beginning `07_Phases/` names a retired phase document that was deleted rather than archived; that set is in git at `e1bd33f`.

# STORY-031 — Render safe offline GFM footnotes

## Goal

Render GFM footnotes as accessible references and back-references in the base preview while preserving the
existing sanitizer, higher-tier literal behavior, and zero-network guarantee.

## In scope

- Remove the Phase 01 footnote-suppression transform.
- Render references, definitions, repeated references, and multiple back-references with stable safe ids.
- Preserve sanitizer, higher-tier literal, and bundled offline behavior.

## Out of scope

- Minimal/Full standard switching, math, Mermaid, or syntax highlighting, owned by Phase 04.
- Remote/local asset authorization, owned by Phase 09.
- Preview debounce or snapshot ownership changes.

## Spec inputs

- `../../../_archive-2026-07-28-specification/01_Product/05_RENDERING_AND_EXTENSIONS.md#gfm-features` — GFM and Full include footnotes with
  back-references.
- `../../../_archive-2026-07-28-specification/01_Product/05_RENDERING_AND_EXTENSIONS.md#sanitization` — keep generated ids/links safe and reject
  executable document content.
- `../../../_archive-2026-07-28-specification/01_Product/05_RENDERING_AND_EXTENSIONS.md#edge-cases` — preserve EC-RENDER-5 sanitization and
  EC-RENDER-6 literal higher-tier syntax.
- `../../../_archive-2026-07-28-specification/02_Architecture/03_FRONTEND_REACT.md#markdown-pipeline` — keep the centralized remark/rehype pipeline.
- `../../../_archive-2026-07-28-specification/03_NonFunctional/04_OFFLINE.md#2-bundled-assets` — use bundled dependencies and initiate no runtime
  resource request.
- `07_Phases/PHASE_01_CORE_EDITOR.md#requirement-ledger` — complete PH01-R11's product-defined base GFM set.

## Design constraints

- Use the existing bundled `remark-gfm`/sanitize-last pipeline; remove only the contradictory suppression
  layer and do not add a second renderer (DD-19, ADR-0003).
- Footnote ids and links are deterministic, unique for repeated references, sanitizer-compatible, and
  keyboard/screen-reader navigable.
- Raw HTML, dangerous URLs, and malicious labels cannot create executable attributes or unsafe destinations
  (EC-RENDER-5). Math/directive and other higher-tier syntax remains literal (EC-RENDER-6).
- No runtime import, CDN, fetch, document-supplied request, telemetry, or background network is introduced.
- The offline proof executes a real render while instrumenting `fetch`, `XMLHttpRequest`, `WebSocket`, and
  the test environment's request-capable/resource-bearing DOM path; it also inspects rendered output for
  fetchable resource attributes. A static dependency scan alone is insufficient.
- Handler layering, Result envelopes, DD-62–64/ADR-0014 backend authority, adapter-only `wailsjs/`, and
  token-only theming remain unchanged.

## Acceptance criteria

### STORY-031-AC-1
**Satisfies:** PH01-R11

A GFM document with one definition and repeated references renders one accessible footnote definition plus
stable unique reference ids and a back-reference for each occurrence.

### STORY-031-AC-2
**Satisfies:** PH01-R11

Malicious footnote labels/content cannot emit script, event handler, dangerous URL, or duplicate unsafe id;
the remaining document renders safely. (satisfies EC-RENDER-5)

### STORY-031-AC-3
**Satisfies:** PH01-R11

**Given** instrumented `fetch`, `XMLHttpRequest`, `WebSocket`, and supported resource-bearing DOM request
paths, **when** footnotes plus malicious resource-looking content and higher-tier syntax are really rendered,
**then** no request mechanism is attempted, output contains no fetchable resource attribute, and
math/directive and other higher-tier syntax remains literal. (satisfies EC-RENDER-6)

## Test plan

- STORY-031-AC-1 — unit — `frontend/src/logic/markdown/renderer.test.ts` —
  `it('STORY-031-AC-1 renders accessible repeated GFM footnotes and backlinks')`.
- STORY-031-AC-2 — unit — `frontend/src/logic/markdown/renderer.test.ts` —
  `it('STORY-031-AC-2 sanitizes malicious footnotes and stable ids (EC-RENDER-5)')`.
- STORY-031-AC-3 — integration — `frontend/src/logic/markdown/renderer.test.ts` —
  `it('STORY-031-AC-3 attempts zero runtime requests and keeps higher tiers literal (EC-RENDER-6)')`.

## Definition of done

- [ ] Every AC has a passing Jest test whose name begins with its `STORY-031-AC-N` id.
- [ ] EC-RENDER-5 and EC-RENDER-6 have exact named evidence.
- [ ] References, repeated references, definitions, backlinks, stable ids, and keyboard/a11y labels are proved.
- [ ] Existing raw-HTML/dangerous-URL/resource-request protections remain green.
- [ ] The real-render offline test instruments fetch, XHR, WebSocket, supported DOM resource requests, and
  rendered resource attributes and observes zero attempted requests.
- [ ] Frontend formatting, lint, typecheck, and Jest gates pass.
- [ ] Backend authority, adapter-only Wails access, token-only styling, and offline behavior remain intact.
- [ ] `just trace` and `just trace-check` are run during implementation; the module inventory is unchanged.
