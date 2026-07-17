---
name: testing-wails-app
description: >-
  Use when writing Go, Jest/RTL, or Playwright tests that prove a story's acceptance criteria, each
  test naming the AC it proves on its first line. Triggers: adding a *_test.go under internal/** run
  with go test -race; a Jest/React Testing Library *.test.tsx under frontend/src/**; a Playwright flow
  behind just verify-ui / just verify-smoke; naming a test `Proves: STORY-NNN-AC-N`; mocking the
  logic/adapter seam; querying by accessible role; covering an EC- edge case; running just trace /
  just trace-check before marking a story done.
allowed-tools: Read, Edit, Write, Bash, Glob, Grep
references:
  - references/tiers-and-naming.md
  - references/go-tests.md
  - references/frontend-and-playwright.md
scripts:
  - scripts/list-proves-tags.sh
related-skills:
  - story-and-traceability-workflow: the story schema and the trace / trace-check gate these tests satisfy
  - go-envelope-and-di: the apperr envelope shape the contract tests assert
  - sqlite-kv-persistence: the temp-SQLite integration target for DB-backed repos
---

# Testing a Wails App

Every acceptance criterion is proven by an automated test that **names the AC on its first
comment/name line**, so `just trace` can wire the spec-clause → story → AC → test → module chain.
This skill is the crisp playbook; the tier matrix, Go/frontend/Playwright shapes, and the
troubleshooting catalog live in the references.

## When to use

- Writing the proving tests for a story's ACs and edge cases at the tier the story's Test plan names.
- Adding Go backend tests, frontend Jest/RTL tests, or Playwright smoke/responsive flows.
- Verifying traceability (`just trace` / `just trace-check`) before a story is marked `done`.

## When NOT to use

- Designing renderer / format / lint behavior → `markdown-rendering-pipeline`.
- Theme tokens / appearance behavior → `theming-tokens`.
- The adapter / Redux wiring itself → `ts-redux-adapter.md` (this skill *mocks* that seam).

## Workflow

1. **Read the story's `acceptance_criteria`, `edge_cases`, and Test plan.** The Test plan names, per
   AC, the tier + file path + function name. Expected: one clear tier and name per AC.
2. **Pick the tier from the story, cross-checked against the module's Test target.** Go unit / Go
   integration / Jest-RTL / Playwright smoke / Playwright responsive — see the matrix and the
   `01_MODULE_INVENTORY.md` `yes` / `integration` / `partial` mapping in `references/tiers-and-naming.md`.
3. **Read the implementation before asserting** — test what the code does, not what you assume.
4. **Write ≥1 test per AC, each naming its AC on the first line**, and cover every `EC-` id. Backend
   shapes (table-driven, `-race`, fakes only, temp SQLite, envelope-contract tests) are in
   `references/go-tests.md`; frontend + Playwright shapes (a11y queries, mock `logic/adapter`,
   `findBy*`/`waitFor`, overflow/console/contrast checks) are in `references/frontend-and-playwright.md`.
5. **Run scoped first, then the suite.** `go test -race ./internal/docs/` or `npx jest
   frontend/src/logic/theme` → green; then `just test` (full Go `-race` + Jest); then `just verify-ui`
   and/or `just verify-smoke` for any Playwright additions.
6. **Gate on traceability.** `just trace` regenerates `docs/traceability.yaml`; `just trace-check` must
   pass with **zero orphans** — every AC has a proving test, every `EC-` is covered, the record is
   fresh. Use `scripts/list-proves-tags.sh` to preview which `Proves:` ids your tests declare before
   running the gate.

## Reference Index

| Reference | Read it for |
|---|---|
| `references/tiers-and-naming.md` | The `Proves:` first-line convention per language, the five-tier matrix, and the module Test-target mapping |
| `references/go-tests.md` | Table-driven `-race` tests, fakes-only rule, temp-SQLite integration, `apperr` envelope-contract tests (P3) |
| `references/frontend-and-playwright.md` | Jest/RTL a11y queries, mocking `logic/adapter` (never `wailsjs/`), async waits, the theme state-transition assertion (P2), Playwright smoke/responsive |
| `scripts/list-proves-tags.sh` | List every `Proves: STORY-NNN-AC-N` id declared across the test tree (a pre-`trace-check` sanity check) |

## Mandatory validation

- [ ] Every AC has ≥1 passing test whose first comment/name line is `Proves: STORY-NNN-AC-N`.
- [ ] Every `edge_cases:` id (`EC-AREA-N`) has a named passing test.
- [ ] Go tests run under `-race` with fakes; integration uses a **temp** SQLite file, no real DB/network in units.
- [ ] Frontend mocks `logic/adapter` (not `wailsjs/`) and queries by accessible role / label / text.
- [ ] `just test` green; `just verify-ui` / `just verify-smoke` clean for any Playwright additions.
- [ ] `just trace` regenerated `docs/traceability.yaml`; `just trace-check` passes with zero orphans.

## Gotchas

- An orphan reported by `just trace-check` means an AC has no test or a `Proves:` id matches no defined
  AC — make the first comment/name line exactly `Proves: STORY-NNN-AC-N`.
- Querying by `.className` / test id breaks on restyle — use `getByRole` / `getByLabelText` /
  `findByText` (behavior, not structure).
- Importing `wailsjs/` from a component test hangs or hits a real binding — mock `logic/adapter`.
- A fixed `setTimeout` for debounced preview / async `MermaidBlock` is flaky — use `findBy*` / `waitFor`.
- The app is **offline** — never make a real network call; fake the package interface or use an
  in-memory stub.
- Never delete or skip a failing test to make the suite green, and never weaken an assertion to match a
  bug — fix the code or file the bug and add a proving test.
