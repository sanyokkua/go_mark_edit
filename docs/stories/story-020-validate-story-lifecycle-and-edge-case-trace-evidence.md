---
id: STORY-020
title: Validate story lifecycle and exact edge-case trace evidence
status: done
spec_clauses:
  - 06_Process_and_Traceability/02_STORY_FORMAT.md#front-matter-schema-copy-exactly
  - 06_Process_and_Traceability/02_STORY_FORMAT.md#lifecycle
  - 06_Process_and_Traceability/03_TRACEABILITY.md#the-chain
  - 06_Process_and_Traceability/03_TRACEABILITY.md#traceabilityyaml-schema
  - 06_Process_and_Traceability/03_TRACEABILITY.md#how-a-test-declares-the-ac-it-proves
  - 06_Process_and_Traceability/03_TRACEABILITY.md#the-two-commands
  - 06_Process_and_Traceability/06_DEFINITION_OF_DONE.md#per-story
  - 07_Phases/PHASE_01_CORE_EDITOR.md#edge-cases
  - 07_Phases/PHASE_01_CORE_EDITOR.md#phase-exit-checklist
phase_requirements:
  - PH01-R14
modules:
  - internal/application/
acceptance_criteria:
  - STORY-020-AC-1
  - STORY-020-AC-2
  - STORY-020-AC-3
  - STORY-020-AC-4
  - STORY-020-AC-5
edge_cases: []
depends_on:
  - STORY-010
  - STORY-018
adrs: []
phase: 01
owner: coder
estimate: M
---

# STORY-020 — Validate story lifecycle and exact edge-case trace evidence

## Goal
Make the traceability gate reject lifecycle drift and ambiguous edge-case coverage so a story can be treated as done only when the status board, story contract, generated record, and exact proving tests agree.

## In scope
- Validate that every indexed story has the same lifecycle status in its front matter, the stories status board, and the generated trace record.
- Discover a physical proving test as one test node when both its leading `Proves: STORY-NNN-AC-N` comment and its AC-first test name declare the same criterion.
- Associate an `EC-*` id only with the concrete test node that explicitly proves it, instead of every proving test belonging to the declaring story.
- Reject a done story that declares an edge case without exact test-node evidence for that edge case.
- Reject a ready story whose dependency is not done, even when the board, front matter, and generated trace otherwise agree on every story status.
- Extend the existing traceability fixture helpers and architecture tests in `internal/application/traceability_test.go` without changing the frozen specification.

## Out of scope
- Per-document view-command ordering, owned by STORY-021.
- Monaco session preservation across arrangements, owned by STORY-022.
- Moving the document-command API to a stable editor-session boundary, owned by STORY-023.
- Regenerating `docs/traceability.yaml` during architecture authoring; the coder/tester regenerates it after the proving tests land.

## Spec inputs
- `06_Process_and_Traceability/02_STORY_FORMAT.md#front-matter-schema-copy-exactly` — treat story front matter as the machine-readable contract, including its lifecycle status and declared edge cases.
- `06_Process_and_Traceability/02_STORY_FORMAT.md#lifecycle` — allow `ready` and `done` only when their specified gates hold and preserve done-story immutability.
- `06_Process_and_Traceability/03_TRACEABILITY.md#the-chain` — preserve the exact clause → story → acceptance criterion → test → module relationship instead of inferring evidence from story proximity.
- `06_Process_and_Traceability/03_TRACEABILITY.md#traceabilityyaml-schema` — generate one indexed story entry, AC-to-test-node lists, and exact edge-case-to-test-node lists.
- `06_Process_and_Traceability/03_TRACEABILITY.md#how-a-test-declares-the-ac-it-proves` — recognize the supported leading-comment and AC-first test-name evidence forms without double-counting one physical test.
- `06_Process_and_Traceability/03_TRACEABILITY.md#the-two-commands` — keep `just trace` generative and make `just trace-check` reject stale, orphaned, lifecycle-inconsistent, or unproven inputs.
- `06_Process_and_Traceability/06_DEFINITION_OF_DONE.md#per-story` — require every AC and every declared edge case to have passing evidence before a story is done.
- `07_Phases/PHASE_01_CORE_EDITOR.md#edge-cases` — retain exact proof for the Phase-01 edge cases, including EC-DOCS-12, instead of inferring coverage from unrelated tests in the same story.
- `07_Phases/PHASE_01_CORE_EDITOR.md#phase-exit-checklist` — keep completed Phase-01 story status and the explicit EC-DOCS-12 phase proof aligned in generated evidence.

## Design constraints
- Story front matter remains the lifecycle contract; `docs/stories/README.md` is the human board and `docs/traceability.yaml` is generated evidence. The validator reports disagreement rather than silently choosing or rewriting a source.
- Test discovery identifies a concrete Go/Jest/Playwright test node first, then attaches AC and explicit `EC-*` evidence to that node. A comment and test name declaring the same AC on the same node produce one location.
- An edge-case proof must be explicit and attached to the exact test node that exercises it; story membership or proof of another AC is not edge-case evidence.
- A story may be `ready` only when every listed dependency resolves to a story whose front-matter status is `done`; agreement among status representations does not waive the lifecycle gate.
- The trace record remains generated and is never hand-edited. Fixture-only files may model stale board or record states; repository validation remains read-only.
- No bound handler or application-state behavior changes: Handler → Service → Repository, concrete `apperr.*Result` envelopes, and `internal/appmodel` backend authority (DD-62/DD-63/DD-64, ADR-0014) remain intact.
- Frontend adapter-only `wailsjs/` access, token-only theming (DD-28 through DD-30), and the offline/no-background-network rule (DD-32, ADR-0011) remain binding and untouched.

## Acceptance criteria

### STORY-020-AC-1
**Satisfies:** PH01-R14
**Given** a story status that differs between front matter, the stories status board, or the generated trace record, **when** the trace validator runs, **then** validation fails and identifies the disagreeing story and sources.

### STORY-020-AC-2
**Satisfies:** PH01-R14
**Given** one physical Jest test whose leading comment and AC-first test name both declare the same acceptance criterion, **when** trace evidence is generated, **then** that criterion contains exactly one test node.

### STORY-020-AC-3
**Satisfies:** PH01-R14
**Given** a story with multiple acceptance-criterion tests and one test node that explicitly proves a declared edge case, **when** trace evidence is generated, **then** the edge case maps only to that exact test node.

### STORY-020-AC-4
**Satisfies:** PH01-R14
**Given** a done story that declares an `EC-*` id but has no test node with exact proof for that id, **when** the trace validator runs, **then** validation fails for missing edge-case evidence.

### STORY-020-AC-5
**Satisfies:** PH01-R14
**Given** a ready story whose declared dependency is not done and whose board, front-matter, and generated-trace statuses otherwise agree, **when** the trace validator runs, **then** validation fails and identifies the ready story and incomplete dependency.

## Test plan
- STORY-020-AC-1 — architecture — `internal/application/traceability_test.go` — `TestTraceCheckerRejectsStoryStatusDisagreement`.
- STORY-020-AC-2 — architecture — `internal/application/traceability_test.go` — `TestTraceGeneratorDeduplicatesCommentAndNameEvidence`.
- STORY-020-AC-3 — architecture — `internal/application/traceability_test.go` — `TestTraceGeneratorMapsOnlyExplicitEdgeCaseEvidence`.
- STORY-020-AC-4 — architecture — `internal/application/traceability_test.go` — `TestTraceCheckerRejectsDoneStoryWithoutExactEdgeCaseEvidence`.
- STORY-020-AC-5 — architecture — `internal/application/traceability_test.go` — `TestTraceCheckerRejectsReadyStoryWithIncompleteDependency`.

## Definition of done
- [ ] Every acceptance criterion has a passing Go test whose leading comment names its `STORY-020-AC-N` id.
- [ ] Fixture coverage proves stale-board rejection, one-node AC discovery, exact edge-case mapping, rejection of missing exact edge-case proof, and rejection of a ready story with an incomplete dependency.
- [ ] The real repository board, story front matter, and regenerated trace statuses agree.
- [ ] Backend `gofmt`, `go vet`, `golangci-lint`, and `go test -race` pass for touched tooling tests; frontend gates pass if scripts are touched.
- [ ] Generated bindings remain current; no bound signature changes are expected.
- [ ] Handler → Service → Repository layering, Result envelopes, backend authority, adapter-only Wails imports, and token-only theming remain intact.
- [ ] `just trace` regenerates the record and `just trace-check` passes with zero orphans, exact edge-case evidence, lifecycle agreement, and a fresh record.
- [ ] The module inventory is unchanged, or changes are reflected in `01_MODULE_INVENTORY.md` in the same story.
- [ ] No background/unsolicited network call, telemetry, or remote runtime asset is introduced.
