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
edge_cases: []           # optional; EC-AREA-N
depends_on: []           # story ids
adrs: []                 # accepted ADR ids
phase: NN
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
- <layering / envelope / adapter-only / token-only / offline; DD-NN; ADR-NNNN>

## Acceptance criteria
### STORY-NNN-AC-1
<criterion, verifiable>

## Test plan
- STORY-NNN-AC-1 → <tier> · <test file path> · <test function name>

## Definition of done
- [ ] Every AC has a passing test naming this story id.
- [ ] Every edge case has a passing test.
- [ ] Lint/type/tests green for touched code; bindings regenerated if signatures changed.
- [ ] `just trace-check` passes; module inventory updated if modules changed.
