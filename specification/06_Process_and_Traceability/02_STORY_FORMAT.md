**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester
**Last Updated:** 2026-07-10
**Cross-references:** `01_MODULE_INVENTORY.md`, `03_TRACEABILITY.md`, `04_ADR_FORMAT.md`, `05_ACCEPTANCE_CRITERIA_PATTERNS.md`, `06_DEFINITION_OF_DONE.md`

# Story Format

A story is **one Markdown file** in `../docs/stories/`, named `story-NNN-short-slug.md`. It has a YAML
front-matter block (the machine-readable contract) and a fixed-order Markdown body. **One story = one
coding session.** A story is complete only when every acceptance criterion has a passing test that
names the story id, and traceability validates with no orphans — never partially landed.

## Identifiers

- Story id: `STORY-NNN` — zero-padded 3 digits, assigned in creation order, **permanent** (never
  reused, renumbered, or deleted, even when superseded).
- Acceptance criterion id: `STORY-NNN-AC-N` — 1-indexed within the story, permanent.
- Edge-case id: `EC-AREA-N` (e.g. `EC-DOCS-3`), defined in the owning product/spec clause.

## Front-matter schema (copy exactly)

```yaml
---
id: STORY-014                          # string, pattern STORY-\d{3}, unique
title: Resolve relative image paths against the current document folder
status: draft                          # draft | ready | in-progress | done | superseded
spec_clauses:                          # >=1 entry; each resolves to a real spec heading anchor
  - 01_Product/09_ASSETS_AND_SECURITY.md#relative-path-resolution
  - 00_Foundation/04_DESIGN_DECISIONS.md#6-rendering--assets
phase_requirements:                    # >=1; permanent requirements from the owning phase ledger
  - PH09-R01
  - PH09-R03
modules:                               # >=1 entry; each a path from 01_MODULE_INVENTORY.md
  - internal/assets/
  - logic/markdown/
acceptance_criteria:                   # >=1 entry; ids defined in the body
  - STORY-014-AC-1
  - STORY-014-AC-2
edge_cases:                            # optional; EC ids this story must satisfy
  - EC-ASSET-1
  - EC-ASSET-2
depends_on:                            # >=0 entries; story ids that must be done first (acyclic)
  - STORY-002
adrs:                                  # optional; accepted ADR ids this story applies
  - ADR-0001
phase: 09                              # the phase number this story belongs to
owner: coder                           # arch | coder | tester
estimate: M                            # S | M | L
---
```

Field rules (all required unless marked optional):

- `id` matches `STORY-\d{3}`, unique across the repo.
- `title` — one imperative sentence, no trailing period.
- `status` — one of the five enum values (see lifecycle).
- `spec_clauses` — ≥1; each `<spec-file>#<anchor>` must resolve to a real heading in
  `specification/`. The `coder` reads **every** cited clause before writing code.
- `phase_requirements` — ≥1; each `PHNN-RNN` exists in the owning phase's requirement ledger.
- `modules` — ≥1; each must exist in `01_MODULE_INVENTORY.md`.
- `acceptance_criteria` — ≥1; each `STORY-NNN-AC-N`, each written out in the body.
- `edge_cases` — optional; each `EC-[A-Z]+-\d+` cited from a spec clause.
- `depends_on` — ≥0; each a real story id; the dependency graph is acyclic.
- `adrs` — optional; only `accepted` ADRs may be cited.
- `phase` — the two-digit phase number (`00`–`15`).
- `owner` — `arch` | `coder` | `tester`.
- `estimate` — `S` | `M` | `L` (see Sizing).

## Body template (fixed section order — copy exactly)

```markdown
# STORY-NNN — <title>

## Goal
[One paragraph: the user-visible / behavioural capability this story delivers. No implementation detail.]

## In scope
- [Exactly what this story creates or changes.]

## Out of scope
- [Adjacent work this story deliberately does not do; name the story id that owns it where one exists.]

## Spec inputs
[Each clause from `spec_clauses:` with one line stating what the agent must take from it.]

## Design constraints
- [Binding rules that apply: the layering rule (Handler→Service→Repository), the Result-envelope
  contract, the adapter-only-imports-wailsjs rule, the token-only theming rule, the offline rule,
  the relevant DD-NN ids, and any ADR-NNNN.]

## Acceptance criteria
[Each criterion written out in full using a pattern from 05_ACCEPTANCE_CRITERIA_PATTERNS.md. Each is
independently verifiable and identified STORY-NNN-AC-N.]

### STORY-NNN-AC-1
[**Satisfies:** PHNN-RNN[, PHNN-RNN]]

[criterion text]

### STORY-NNN-AC-2
[criterion text]

## Test plan
[For each AC: the test tier (unit / integration / e2e-smoke / architecture), the test file path, and
the test function name. Each edge case in `edge_cases:` maps to a named test here.]

## Definition of done
- [ ] Every acceptance criterion has a passing test that names this story id (see 03_TRACEABILITY.md).
- [ ] Every edge case in `edge_cases:` has a passing test.
- [ ] Edge proof is explicit on its test node (`// Evidence: EC-AREA-N` in Go or EC id in the JS test name).
- [ ] Backend: `gofmt`/`go vet`/`golangci-lint`/`go test -race` pass for touched packages.
- [ ] Frontend: `prettier --check`/`eslint`/`tsc --noEmit`/`jest` pass for touched files.
- [ ] Bindings regenerated if a bound signature changed (`wails generate module`, no drift).
- [ ] Traceability validates with no orphan clause and no orphan test.
- [ ] The module inventory is unchanged, or the change is reflected in 01_MODULE_INVENTORY.md.
- [ ] Applicable UI acceptance references (mockups) visually match (see the story's spec inputs).
```

## Sizing

- **S** — 1 module, 1–3 ACs, no new public API.
- **M** — ≤3 modules, ≤6 ACs, may add 1 public API symbol.
- **L** — a non-ready epic only; split it before implementation.
- Every implementation-ready story is S/M. Split an L epic into `depends_on` children. A UI story `depends_on` the
  backend story that supplies its bound methods (never crosses the Go/TS boundary un-verifiably).

## Lifecycle

```
[*] --> draft
draft --> ready:        front-matter validates; phase requirements resolve; every depends_on is done; every clause resolves; estimate is S or M
ready --> in-progress:  the coder picks up the story
in-progress --> done:   every AC test passes; traceability validates with no orphans
in-progress --> ready:  blocked; returned to the backlog
done --> superseded:    a later story replaces it; this file stays and links to the replacement
```

`done` is immutable. A change to an accepted clause a `done` story depends on requires a **new story**
(and a new ADR if architecturally significant), never an edit to the old story.
