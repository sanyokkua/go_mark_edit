---
id: STORY-026
title: Strengthen Phase 01 checkpoint and completion validation
status: ready
spec_clauses:
  - 06_Process_and_Traceability/03_TRACEABILITY.md#phase-commands
  - 06_Process_and_Traceability/06_DEFINITION_OF_DONE.md#phase-level-exit-criteria
  - 07_Phases/PHASE_01_CORE_EDITOR.md#state-and-transition-model
  - 07_Phases/PHASE_01_CORE_EDITOR.md#cross-phase-contracts
  - 07_Phases/PHASE_01_CORE_EDITOR.md#edge-and-failure-cases
  - 07_Phases/PHASE_01_CORE_EDITOR.md#phase-exit-evidence
phase_requirements:
  - PH01-R14
  - PH01-R15
modules:
  - internal/application/
acceptance_criteria:
  - STORY-026-AC-1
  - STORY-026-AC-2
  - STORY-026-AC-3
  - STORY-026-AC-4
  - STORY-026-AC-5
  - STORY-026-AC-6
edge_cases: []
depends_on:
  - STORY-025
adrs:
  - ADR-0016
phase: 01
owner: coder
estimate: M
---

# STORY-026 — Strengthen Phase 01 checkpoint and completion validation

## Goal

Let reviewers validate either Phase 01 implementation checkpoint without weakening the existing full-phase
gate or letting evidence for one behavior stand in for a different lifecycle or contract obligation.

## In scope

- Add preview/editing checkpoint modes to the Phase 01 completion validator.
- Preserve the full `phase-complete-check 01` semantics.
- Complete and consume the `coverage` section of `docs/phase-resolutions/PH01.yaml` as the authoritative
  row-to-proof representation.
- Require exact AC-level mappings for every required transition, contract, edge case, and evidence row.
- Validate the ADR-0016 current-host PH01-E06 exception and adversarial fixtures.

## Out of scope

- Defining checkpoint membership or exception policy, owned by STORY-025 and ADR-0016.
- Producing Phase 01 runtime evidence, owned by STORY-032.
- Changing product behavior or generated traceability data.

## Spec inputs

- `06_Process_and_Traceability/03_TRACEABILITY.md#phase-commands` — extend phase checking without weakening
  structural or full-completion commands.
- `06_Process_and_Traceability/06_DEFINITION_OF_DONE.md#phase-level-exit-criteria` — require integrated
  transition, cross-phase, runtime, and human proof.
- `07_Phases/PHASE_01_CORE_EDITOR.md#state-and-transition-model` — map PH01-T01 through PH01-T07 to exact ACs.
- `07_Phases/PHASE_01_CORE_EDITOR.md#cross-phase-contracts` — map PH01-C01 through PH01-C06 to exact ACs.
- `07_Phases/PHASE_01_CORE_EDITOR.md#edge-and-failure-cases` — require exact named edge evidence.
- `07_Phases/PHASE_01_CORE_EDITOR.md#phase-exit-evidence` — gate each PH01-E01 through PH01-E11 row at its
  declared tier and freshness.

## Design constraints

- Checkpoint mode reads `docs/phase-resolutions/PH01.yaml`; it never infers membership or row coverage from
  story titles, broad requirement coverage, private fixtures, or stage labels (ADR-0016).
- A transition, contract, edge, or evidence row passes only through an AC explicitly mapped to that row and
  its owning requirement; requirement-level coverage alone cannot be borrowed.
- Preview checkpoint success does not imply editing, full Phase 01, Stage 1, or release completion. Editing
  cannot pass until preview passes. Full completion remains a distinct stronger gate.
- The only platform exception is the exact fresh PH01-E06 record accepted by ADR-0016; all other missing or
  stale blocking evidence fails.
- Preserve permanent ids and generated `docs/traceability.yaml`; validators remain read-only with respect to
  evidence and trace records.
- Preserve Handler → Service → Repository layering, `apperr.*Result`, DD-62–64/ADR-0014 backend authority,
  adapter-only `wailsjs/`, token-only theming, and offline operation.

The version-1 `coverage` syntax is exact:

```yaml
coverage:
  version: 1
  transitions:
    PH01-T01:
      requirements: [PH01-R01, PH01-R02]
      acceptance_criteria: [STORY-011-AC-1, STORY-012-AC-2, STORY-012-AC-5, STORY-027-AC-1, STORY-027-AC-2, STORY-027-AC-3]
  contracts:
    PH01-C01:
      requirements: [PH01-R01, PH01-R05]
      acceptance_criteria: [STORY-011-AC-1, STORY-011-AC-3, STORY-029-AC-1, STORY-029-AC-4]
  edge_cases:
    EC-DOCS-12:
      requirements: [PH01-R03, PH01-R05, PH01-R06]
      acceptance_criteria: [STORY-019-AC-3, STORY-019-AC-6, STORY-022-AC-4, STORY-028-AC-4]
      evidence_tests:
        - "frontend/e2e/core-editor.test.ts::STORY-022-AC-4 (EC-DOCS-12) keeps a focused Monaco source, caret, and selection across a metadata patch"
        - "frontend/src/ui/widgets/EditorView.integration.test.tsx::STORY-022-AC-4 (EC-DOCS-12) keeps focused hidden-editor patches content-free"
        - "frontend/src/ui/widgets/EditorView.integration.test.tsx::STORY-028-AC-4 preserves newer editor intent during patch and flush (EC-DOCS-12)"
    EC-RENDER-4:
      requirements: [PH01-R12]
      acceptance_criteria: [STORY-017-AC-3]
      evidence_tests:
        - "frontend/src/logic/hooks/useLivePreview.test.ts::STORY-017-AC-3 (EC-RENDER-4) bounds large-document preview work"
    EC-RENDER-5:
      requirements: [PH01-R11]
      acceptance_criteria: [STORY-014-AC-4, STORY-031-AC-2]
      evidence_tests:
        - "frontend/src/ui/components/MarkdownView.test.tsx::STORY-014-AC-4 (EC-RENDER-5) disables raw HTML and dangerous URLs"
        - "frontend/src/logic/markdown/renderer.test.ts::STORY-031-AC-2 sanitizes malicious footnotes and stable ids (EC-RENDER-5)"
    EC-RENDER-6:
      requirements: [PH01-R11]
      acceptance_criteria: [STORY-014-AC-3, STORY-031-AC-3]
      evidence_tests:
        - "frontend/src/ui/components/MarkdownView.test.tsx::STORY-014-AC-3 (EC-RENDER-6) leaves higher-tier syntax and Mermaid safe"
        - "frontend/src/logic/markdown/renderer.test.ts::STORY-031-AC-3 attempts zero runtime requests and keeps higher tiers literal (EC-RENDER-6)"
    EC-RENDER-7:
      requirements: [PH01-R11]
      acceptance_criteria: [STORY-014-AC-5]
      evidence_tests:
        - "frontend/src/ui/components/MarkdownView.test.tsx::STORY-014-AC-5 (EC-RENDER-7) blocks document-supplied resource requests"
    EC-I18N-1:
      requirements: [PH01-R16]
      acceptance_criteria: [STORY-016-AC-6]
      evidence_tests:
        - "frontend/src/i18n/catalog.test.ts::EC-I18N-1 falls back to English and then the key without a blank label"
    EC-I18N-2:
      requirements: [PH01-R16]
      acceptance_criteria: [STORY-016-AC-6]
      evidence_tests:
        - "frontend/src/i18n/catalog.test.ts::EC-I18N-2 discovers a dropped-in locale resource without component changes"
  evidence:
    PH01-E06:
      requirements: [PH01-R01, PH01-R03, PH01-R04, PH01-R06, PH01-R07, PH01-R08, PH01-R11, PH01-R13]
      acceptance_criteria: [STORY-032-AC-1]
      procedures: [packaged-native-current-host-run]
      artifacts: [docs/phase-evidence/PH01-wails-runtime.md]
      owner: tester
      scope: current-host-native-wails-runtime
      freshness: exact-revision
```

Every transition/contract entry requires exactly `requirements` and nonempty `acceptance_criteria`. Every
edge entry additionally requires nonempty `evidence_tests`, where each value is an exact collected node
identity formatted `path::full test name`—never a bare path, line number, glob, or descriptive placeholder.
The validator resolves every identity against collected edge evidence, not filesystem existence. Every evidence entry requires `requirements`,
nonempty `acceptance_criteria`, `procedures`, `artifacts`, `owner`, `scope`, and `freshness`, with at least one
procedure or artifact. `Owner`, `scope`, and `freshness` are scalar strings; procedures/artifacts/tests stay
in their separate fields and cannot appear in `acceptance_criteria`. Key sets must exactly match STORY-025's
`full_completion.required_ids`; unknown, missing, or duplicate row/AC/artifact ids fail. Every referenced AC
must exist, the explicit mapped AC set's `Satisfies:` union must cover the row's complete requirement set,
and every individually mapped AC must satisfy at least one requirement owned by that row. A requirement-level
story mapping is never sufficient, and an unlisted AC cannot be borrowed merely because it satisfies the same
requirement.

The checked-in row map is decision-complete as follows (ranges mean every AC in the inclusive range):

| Row | Required explicit AC/test/artifact mapping |
|---|---|
| PH01-T01 | STORY-011-AC-1; STORY-012-AC-2, -3, -5, -7, -8; STORY-027-AC-1–3 |
| PH01-T02 | STORY-011-AC-3; STORY-013-AC-3; STORY-017-AC-1; STORY-019-AC-1, -3, -6 |
| PH01-T03 | STORY-021-AC-4–5; STORY-022-AC-1–3; STORY-028-AC-2, -4–5 |
| PH01-T04 | STORY-015-AC-2–5; STORY-021-AC-1–6; STORY-028-AC-1, -3, -5 |
| PH01-T05 | STORY-014-AC-1, -4–6; STORY-017-AC-1–6; STORY-031-AC-1–3 |
| PH01-T06 | STORY-023-AC-1–4; STORY-030-AC-1–5 |
| PH01-T07 | STORY-022-AC-2–3, -5; STORY-028-AC-2, -6 |
| PH01-C01 | STORY-011-AC-1–4; STORY-029-AC-1–4 |
| PH01-C02 | STORY-017-AC-1; STORY-019-AC-1–2, -6; STORY-021-AC-1–5; STORY-028-AC-1–2, -5–6 |
| PH01-C03 | STORY-023-AC-1–5; STORY-030-AC-1–6 |
| PH01-C04 | STORY-014-AC-1, -4–6; STORY-017-AC-1–6; STORY-031-AC-1–3 |
| PH01-C05 | STORY-012-AC-1–5, -7–8; STORY-027-AC-1–3 |
| PH01-C06 | STORY-015-AC-1–5; STORY-022-AC-2–5; STORY-028-AC-2–4, -6 |
| EC-DOCS-12 | STORY-019-AC-3, -6; STORY-022-AC-4; STORY-028-AC-4; `frontend/e2e/core-editor.test.ts::STORY-022-AC-4 (EC-DOCS-12) keeps a focused Monaco source, caret, and selection across a metadata patch`; `frontend/src/ui/widgets/EditorView.integration.test.tsx::STORY-022-AC-4 (EC-DOCS-12) keeps focused hidden-editor patches content-free`; planned `frontend/src/ui/widgets/EditorView.integration.test.tsx::STORY-028-AC-4 preserves newer editor intent during patch and flush (EC-DOCS-12)` |
| EC-RENDER-4 | STORY-017-AC-3; `frontend/src/logic/hooks/useLivePreview.test.ts::STORY-017-AC-3 (EC-RENDER-4) bounds large-document preview work` |
| EC-RENDER-5 | STORY-014-AC-4; STORY-031-AC-2; `frontend/src/ui/components/MarkdownView.test.tsx::STORY-014-AC-4 (EC-RENDER-5) disables raw HTML and dangerous URLs`; planned `frontend/src/logic/markdown/renderer.test.ts::STORY-031-AC-2 sanitizes malicious footnotes and stable ids (EC-RENDER-5)` |
| EC-RENDER-6 | STORY-014-AC-3; STORY-031-AC-3; `frontend/src/ui/components/MarkdownView.test.tsx::STORY-014-AC-3 (EC-RENDER-6) leaves higher-tier syntax and Mermaid safe`; planned `frontend/src/logic/markdown/renderer.test.ts::STORY-031-AC-3 attempts zero runtime requests and keeps higher tiers literal (EC-RENDER-6)` |
| EC-RENDER-7 | STORY-014-AC-5; `frontend/src/ui/components/MarkdownView.test.tsx::STORY-014-AC-5 (EC-RENDER-7) blocks document-supplied resource requests` |
| EC-I18N-1 | STORY-016-AC-6; `frontend/src/i18n/catalog.test.ts::EC-I18N-1 falls back to English and then the key without a blank label` |
| EC-I18N-2 | STORY-016-AC-6; `frontend/src/i18n/catalog.test.ts::EC-I18N-2 discovers a dropped-in locale resource without component changes` |
| PH01-E01 | STORY-011-AC-1–7; STORY-012-AC-1–8; exact appmodel race/projection commands; owner tester; scope all; freshness current HEAD |
| PH01-E02 | STORY-019-AC-1–2, -6; STORY-021-AC-1–5; STORY-022-AC-1–5; STORY-028-AC-1–6; `just verify-ui`; owner tester; scope 375/768/1280 px; freshness current HEAD |
| PH01-E03 | STORY-015-AC-1–5; STORY-016-AC-1–5; STORY-018-AC-1, -4; STORY-028-AC-3; `just verify-ui`; owner tester; scope 375/768/1280 px; freshness current HEAD |
| PH01-E04 | STORY-023-AC-1–5; STORY-029-AC-1, -3, -5; STORY-030-AC-1–6; `just check`; owner tester; scope all arrangements/import boundaries; freshness current HEAD |
| PH01-E05 | STORY-014-AC-1–6; STORY-017-AC-1–6; STORY-031-AC-1–3; named renderer/preview commands; owner tester; scope all; freshness current HEAD |
| PH01-E06 | STORY-032-AC-1; `docs/phase-evidence/PH01-wails-runtime.md`; owner tester; scope current-host native Wails runtime with deferred Windows/Linux; freshness exact revision under ADR-0016 |
| PH01-E07 | STORY-032-AC-3; `docs/phase-evidence/PH01-visual-approval.md`; owner product owner; scope frozen 1280 px mockup and responsive widths; freshness current release candidate |
| PH01-E08 | STORY-032-AC-2; `docs/phase-evidence/PH01-network-trace.md`; owner security reviewer; scope Stage 1 and Stage 2 runtime; freshness current release candidate |
| PH01-E09 | STORY-020-AC-1–5; STORY-026-AC-3–4, -6; STORY-032-AC-4; `just trace-check`; owner tester; scope all; freshness current HEAD |
| PH01-E10 | STORY-025-AC-1–6; STORY-026-AC-1–2, -5–6; STORY-032-AC-5–6; checkpoint/full commands; owner reviewer; scope phase/checkpoint claims; freshness resolution revision |
| PH01-E11 | STORY-016-AC-6; STORY-027-AC-4; STORY-032-AC-4; exact EC-I18N-1/2 catalog tests; owner tester; scope bundled locale resources and exact edge tests; freshness current HEAD |

## Acceptance criteria

### STORY-026-AC-1
**Satisfies:** PH01-R15

The Phase 01 validator loads the checked-in version-1 `docs/phase-resolutions/PH01.yaml`, exposes preview and
editing implementation-checkpoint checks using its exact accepted partition, and fails editing until preview
succeeds.

### STORY-026-AC-2
**Satisfies:** PH01-R14, PH01-R15

`just phase-complete-check 01` remains a distinct full gate and fails unless both checkpoints, PH01-R15, and
all PH01 transition, contract, edge, and exit-evidence obligations pass.

### STORY-026-AC-3
**Satisfies:** PH01-R14

The repository record maps every PH01-T01–T07 and PH01-C01–C06 row to the exact AC set in this story's table;
validation requires each referenced AC to exist, the mapped set's `Satisfies:` union to cover the row's
complete requirements, and every individually mapped AC to satisfy at least one row-owned requirement, so
requirement-only coverage or an unrelated passing AC cannot substitute.

### STORY-026-AC-4
**Satisfies:** PH01-R14

The repository record maps every declared PH01 edge case and PH01-E01–E11 row to the exact AC/test/artifact
set in this story's table, including exact owner, scope, and freshness fields; procedures, artifacts, and
tests remain supplemental fields and cannot satisfy the AC-mapping requirement, and every `evidence_tests`
`path::full test name` identity resolves against a collected edge-evidence node.

### STORY-026-AC-5
**Satisfies:** PH01-R15

A current-host PH01-E06 record is accepted only under ADR-0016's exact fields, revision, limitations,
deferred platforms, and expiry; an invalid, stale, generic, or differently scoped exception fails.

### STORY-026-AC-6
**Satisfies:** PH01-R14, PH01-R15

Negative fixtures fail for borrowed coverage, a missing transition, an incomplete checkpoint partition, an
invalid current-host exception, stale revision evidence, and an unresolved PH01-X01 conflict.

## Test plan

- STORY-026-AC-1 — architecture — `internal/application/phase_validation_test.go` —
  `TestRepositoryPhase01ResolutionDrivesCheckpointValidation`.
- STORY-026-AC-2 — architecture — `internal/application/phase_validation_test.go` —
  `TestPhase01FullCompletionRemainsStrongerThanCheckpoints`.
- STORY-026-AC-3 — architecture — `internal/application/phase_validation_test.go` —
  `TestRepositoryPhase01ResolutionHasExactTransitionAndContractACCoverage`.
- STORY-026-AC-4 — architecture — `internal/application/phase_validation_test.go` —
  `TestRepositoryPhase01ResolutionResolvesExactEdgeNodesAndEvidenceScope`.
- STORY-026-AC-5 — architecture — `internal/application/phase_validation_test.go` —
  `TestPhase01CompletionValidatesNarrowE06CurrentHostException`.
- STORY-026-AC-6 — architecture — `internal/application/phase_validation_test.go` —
  `TestPhase01CompletionRejectsAdversarialCoverageFixtures`.

## Definition of done

- [ ] Every AC has a passing test naming its `STORY-026-AC-N` id.
- [ ] Positive tests validate the real `docs/phase-resolutions/PH01.yaml`; derived fixtures cover borrowed
  requirement-only coverage, individually unrelated mapped ACs, supplemental evidence placed in AC mappings,
  bare-path or unresolved edge nodes, missing transition, missing/invalid scope, incomplete partition,
  invalid exception, stale revision, and unresolved conflict independently.
- [ ] Preview, editing, and full completion produce distinct, plain-language results.
- [ ] Backend formatting, lint, and race-enabled tests pass for touched validation code.
- [ ] No specification, done story, generated traceability record, or evidence artifact is mutated by checks.
- [ ] Architecture, envelope, state-ownership, adapter, theming, and offline invariants remain intact.
- [ ] `just trace` and `just trace-check` are run during implementation; the module inventory is unchanged.
