<!--
  Story skeleton — mirrors docs/stories/STORY_TEMPLATE.md and
  specification/06_Process_and_Traceability/02_STORY_FORMAT.md.

  Copy to docs/stories/story-NNN-short-slug.md, replace NNN with the next free number, and fill in.
  Ids are permanent: never reuse STORY-NNN / STORY-NNN-AC-N / EC-AREA-N.
  Delete this comment before committing.
-->
---
id: STORY-NNN
title: <imperative sentence, no trailing period>
status: draft            # draft | ready | in-progress | done | superseded
spec_clauses:
  - <spec-file>#<anchor>
modules:
  - <module path from 06_Process_and_Traceability/01_MODULE_INVENTORY.md>
acceptance_criteria:
  - STORY-NNN-AC-1
edge_cases: []           # optional; EC-AREA-N cited from a spec clause
depends_on: []           # story ids; graph must be acyclic and all done before `ready`
adrs: []                 # accepted ADR ids only
phase: NN                # two-digit phase 00-10
owner: coder             # arch | coder | tester
estimate: S              # S | M | L
---

# STORY-NNN — <title>

## Goal
<One paragraph, user-visible/behavioural. No implementation detail.>

## In scope
- <what this story creates/changes>

## Out of scope
- <adjacent work; name the owning story id where one exists>

## Spec inputs
- <clause> — <what to take from it>

## Design constraints
- <Handler→Service→Repository layering; apperr.*Result envelope; adapter-only imports of wailsjs/;
  token-only theming; offline invariant; relevant DD-NN / ADR-NNNN>

## Acceptance criteria
### STORY-NNN-AC-1
<criterion, verifiable; phrase per 05_ACCEPTANCE_CRITERIA_PATTERNS.md>

## Test plan
- STORY-NNN-AC-1 — <tier> — <test file path> — <test function name>

## Definition of done
- [ ] Every AC has a passing test naming this story id on its first line.
- [ ] Every edge case has a passing test.
- [ ] Lint/type/tests green for touched code; bindings regenerated if signatures changed.
- [ ] `just trace` regenerated; `just trace-check` passes; module inventory updated if modules changed.
