---
id: STORY-007
title: Reserve the three-region app shell and token-only style skeleton
status: done
spec_clauses:
  - 00_Foundation/06_IMPLEMENTATION_STAGES.md#3-forward-compatibility-constraints-per-stage
  - 02_Architecture/03_FRONTEND_REACT.md#structure
  - 00_Foundation/04_DESIGN_DECISIONS.md#9-theming--ux
phase_requirements:
  - PH00-R07
modules:
  - ui/widgets/
  - ui/styles/
acceptance_criteria:
  - STORY-007-AC-1
  - STORY-007-AC-2
  - STORY-007-AC-3
edge_cases: []
depends_on:
  - STORY-006
adrs:
  - ADR-0005
phase: 00
owner: coder
estimate: M
---

# STORY-007 — Reserve the three-region app shell and token-only style skeleton

## Goal
Establish the stable Stage 1 layout and style seam so the future assistant sidebar can be added without restructuring the app.

## In scope
- Left/center/right shell, collapsed empty assistant slot, token skeleton, and token-only shell styling.

## Out of scope
- Assistant UI, provider configuration, LLM code, and theme values, owned by Stage 3 and Phase 08.

## Spec inputs
- `00_Foundation/06_IMPLEMENTATION_STAGES.md#3-forward-compatibility-constraints-per-stage` — reserve F1.
- `00_Foundation/04_DESIGN_DECISIONS.md#9-theming--ux` — use tokens rather than hardcoded appearance values.

## Design constraints
- Keep the right region empty and collapsed, but provide show/hide plumbing without a layout rewrite.
- Components consume CSS custom properties only; no runtime assets, fonts, or theme resources load remotely.

## Acceptance criteria
### STORY-007-AC-1
**Satisfies:** PH00-R07
The app shell has left, center, and right layout regions; the empty right region is collapsed but can be shown without restructuring the shell.

### STORY-007-AC-2
**Satisfies:** PH00-R07
The shell reads only reserved CSS custom properties from `tokens.css`, with no component-local color literal.

### STORY-007-AC-3
**Satisfies:** PH00-R07
The reserved assistant region contains no assistant, provider, or network behaviour.

## Test plan
Each named test begins with its matching `Proves: STORY-007-AC-N` tag.

- STORY-007-AC-1 — unit — `frontend/src/App.test.tsx` — `it('STORY-007-AC-1 preserves the collapsed three-region shell')`.
- STORY-007-AC-2 — architecture — `frontend/src/ui/styles/tokens.test.ts` — `it('STORY-007-AC-2 supplies the shell through tokens only')`.
- STORY-007-AC-3 — unit — `frontend/src/App.test.tsx` — `it('STORY-007-AC-3 keeps the reserved region empty')`.

## Definition of done
- [ ] Tests prove every AC, including the empty reserved region.
- [ ] Token-only and offline rules pass their architecture checks.
- [ ] Traceability is regenerated and validated before `done`.
