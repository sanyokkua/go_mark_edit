**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester, reviewer
**Last Updated:** 2026-07-21
**Cross-references:** `02_STORY_FORMAT.md`, `03_TRACEABILITY.md`, `05_ACCEPTANCE_CRITERIA_PATTERNS.md`, `06_DEFINITION_OF_DONE.md`

# Phase Format

A phase document is the durable planning authority between product clauses and implementation stories.
It defines complete outcomes and evidence, not a pre-assigned story list. Story architects may refine its
non-normative work packages against the current repository, but they may not omit a normative requirement,
transition, contract, edge case, or exit item.

## Identifiers

- Phase: `PHNN`, matching `PHASE_NN_*.md`.
- Requirement: `PHNN-RNN`.
- Transition: `PHNN-TNN`.
- Cross-phase contract: `PHNN-CNN`.
- Work package: `PHNN-WNN`.
- Exit evidence: `PHNN-ENN`.
- Unresolved specification conflict: `PHNN-XNN`.

Every id is zero-padded, permanent, unique within its kind, and never reused. Product edge-case ids retain
their canonical `EC-AREA-N` form.

## Required document order

Every `PHASE_NN_*.md` contains these sections in order after its title:

1. Goal.
2. Phase metadata.
3. Scope.
4. Out of scope.
5. Requirement ledger.
6. State and transition model.
7. Cross-phase contracts.
8. Edge and failure cases.
9. Non-normative work packages.
10. Phase exit evidence.
11. Open specification conflicts (only when conflicts exist).
12. Clarification revision.

## Phase metadata

| Phase | Kind | Stage / milestone | Depends on | Completion scope |
|---|---|---|---|---|
| PH01 | sequential | Stage 1 / M1; Stage 2 / M2 | PH00 | once per implemented revision |

- `Kind` is `sequential` or `cross-cutting`.
- Dependencies are existing phase ids or `none`, never story ids; the phase dependency graph must be acyclic.
- Cross-cutting phases state every milestone/release scope at which their evidence must be refreshed.

## Requirement ledger

| ID | Required outcome | Source clauses | Constraints | Work package |
|---|---|---|---|---|
| PH01-R01 | The active buffer remains responsive while synchronizing canonical content. | `01_Product/example.md#clause` | DD-62; F2 | PH01-W01 |

Each row is normative. `Source clauses` contains one or more resolved specification anchors. `Constraints`
names applicable DD, ADR, F-seam, platform, accessibility, offline, or performance rules. Every requirement
owns at least one work package and blocking exit-evidence row.

## State and transition model

| ID | Trigger | Preconditions | Ordered behavior | Result | Failure / preservation | Requirements |
|---|---|---|---|---|---|---|
| PH01-T01 | Hide editor pane | Active document exists | Flush buffer; flush view; hide pane | Canonical state acknowledged before hide | Keep pane/session active and report failure | PH01-R01 |

Stateful behavior is specified as before-state, trigger, ordered operations, postcondition, and failure
result. Rows explicitly cover resource lifetime, pending work, cancellation, retry, rollback, and stale or
out-of-order completion where applicable.

## Cross-phase contracts

| ID | Producer | Consumer | Interface / invariant | Availability / lifetime | Ordering / concurrency | Source | Requirements |
|---|---|---|---|---|---|---|---|
| PH01-C01 | PH01 | PH05 | Active-document command seam | Available for the active session in every view arrangement | Commands enter the document queue in user-intent order | `00_Foundation/example.md#seam` | PH01-R01 |

A seam is covered only when an intended consumer can use it through the public boundary. Producer and
consumer identify phase ids or inventory modules; interface, ownership, lifetime, and ordering are exact.

## Edge and failure cases

| Edge case | Role | Source clause | Requirements | Expected behavior | Evidence |
|---|---|---|---|---|---|
| EC-DOCS-1 | primary | `01_Product/example.md#edge-cases` | PH01-R01 | Preserve the accepted buffer. | `path/to/test::TestName (EC-DOCS-1)` |

`Role` is `primary`, `precursor`, or `regression`. Across the complete phase set, every canonical edge case
that appears in a ledger has exactly one primary phase;
later phases may add regression evidence. Evidence names the edge id exactly, never all tests for a story.

## Non-normative work packages

| ID | Capability | Size | Modules | Artifacts | Requirements | Depends on |
|---|---|---|---|---|---|---|
| PH01-W01 | Synchronize the active buffer. | M | `logic/adapter/` | none | PH01-R01 | PH00-W01 contract |

Work packages are planning hints, not reserved stories. Architects assign the current next global
`STORY-NNN` only after investigating the repository. `Modules` use inventory paths; `Artifacts` identifies
non-module outputs such as `main.go`, `wails.json`, `build/`, `.github/`, `scripts/`, screenshots, or release
assets. Dependencies name capabilities, work packages, or phase contracts rather than future story ids.

An implementation-ready story is S or M. An L work package is a non-ready epic and must be split into
independently reviewable S/M stories before implementation.

## Phase exit evidence

| ID | Requirements | Tier | Proof / artifact | Platform / scope | Owner | Freshness | Blocking |
|---|---|---|---|---|---|---|---|
| PH01-E01 | PH01-R01 | automated | `just check` | all | tester | current HEAD | yes |

`Tier` is `automated`, `real-runtime`, or `human`. The phase document defines the required proof; mutable
results live under `../docs/phase-evidence/`. Real-runtime and human rows require an existing artifact,
date/revision, and named approval owner. Missing blocking evidence prevents phase completion.

## Open specification conflicts

When accepted sources conflict or omit behavior required to write a deterministic AC, add this table and
stop planning the affected requirement:

| ID | Conflicting or missing sources | Required decision | Blocked requirements |
|---|---|---|---|
| PH01-X01 | `path/a.md#clause`; `path/b.md#clause` | Choose the authoritative precedence rule. | PH01-R01 |

`phase-check` accepts a well-formed conflict record so the repository can describe the truth.
`phase-complete-check` fails while any conflict remains. The user supplies direction; an architecturally
significant resolution is recorded in a mutable ADR before implementation planning resumes.

## Clarification revision

End with a concise dated note describing context added by the latest clarification. A clarification may
make an existing product obligation explicit but must not choose new behavior. Normal frozen-spec rules
resume after the authorized clarification migration.

## Completion semantics

- `just phase-check` validates every phase structurally without requiring unfinished work to be done.
- `just phase-complete-check NN` additionally requires every requirement, transition, contract, primary
  edge case, and blocking exit item to resolve through done stories, AC mappings, proving tests, and required
  runtime/human evidence.
- Passing story tests is necessary but not sufficient for phase completion.
