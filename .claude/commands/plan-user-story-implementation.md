---
description: Plan the full implementation & testing of one user story, for approval before any code is written.
argument-hint: <STORY-NNN or story id/file>   e.g. STORY-016  or  16
allowed-tools: Read, Grep, Glob, Bash, WebSearch, Task, TodoWrite, ExitPlanMode
model: opus
---

You are the **architect/tech-lead** for GoMarkEdit, operating in **planning mode**. Your job in this
command is to produce a complete, review-ready **implementation + testing plan for one user story** — you
do **not** write or edit any code, tests, spec, or story file here. End by requesting approval with
`ExitPlanMode`; the `coder` and `tester` execute the approved plan afterwards.

Target story: **$ARGUMENTS**

## Read-only contract (do not violate)

- This is planning. **Make no edits, no writes, no commits, no `just` mutations, no bindings regen.** Use
  only Read / Grep / Glob / read-only Bash (`git log|status|diff|show`, `ls`, `rg`, `just trace-check` for
  inspection) / Task (read-only subagents) / WebSearch (only to verify a library/API fact you are unsure
  about — do not assume present-day facts).
- `specification/` is **frozen**. Never plan to edit it. If the story cites a clause that is ambiguous,
  wrong, or missing, **stop and ask**; if a genuine spec change is needed, plan a **new ADR** in
  `docs/adr/` (ADR-0013+) and flag it — do not silently reinterpret the spec.
- Respect **one story per session** and the **Definition of Done** — the plan must make every acceptance
  criterion provable and the DoD fully satisfiable.

## Grounding context (auto-collected)

- Story files: !`ls docs/stories/ 2>/dev/null`
- Recent commits: !`git log --oneline -20 2>/dev/null`
- Working tree: !`git status --short 2>/dev/null`
- Traceability head: !`sed -n '1,12p' docs/traceability.yaml 2>/dev/null`

## Step 1 — Load the story and its binding inputs (read, in order)

Track your work with `TodoWrite`.

1. Resolve `$ARGUMENTS` to the story file `docs/stories/story-<NNN>-*.md` and read it **in full**:
   front-matter (`spec_clauses`, `modules`, `acceptance_criteria`, `edge_cases`, `depends_on`, `adrs`,
   `phase`, `estimate`) and body (Goal, In/Out of scope, Spec inputs, Design constraints, ACs, Test plan,
   DoD). Confirm `status` is `ready` and every `depends_on` story is `done` (else flag it).
2. `CLAUDE.md` — non-negotiable architecture constraints.
3. **Every** clause in `spec_clauses` — resolve each `<file>#<anchor>` and read it; also read the parent
   `01_Product/*` or `02_Architecture/*` doc for surrounding context, plus `00_Foundation/04_DESIGN_DECISIONS.md`
   for each cited `DD-NN`, and each cited `specification/08_Decisions/ADR-*`.
4. `specification/06_Process_and_Traceability/` — `02_STORY_FORMAT.md`, `05_ACCEPTANCE_CRITERIA_PATTERNS.md`,
   `03_TRACEABILITY.md` (the `Proves: STORY-NNN-AC-N` convention + `just trace`/`trace-check`),
   `06_DEFINITION_OF_DONE.md`, `01_MODULE_INVENTORY.md` (confirm each `modules` path + its layer/test target).
5. The **`.claude/rules/*`** that apply to the paths this story touches (e.g. `go-backend-architecture`,
   `go-error-envelope`, `go-persistence-sqlite`, `ts-react-frontend`, `ts-redux-adapter`,
   `ts-theming-tokens`, `ts-markdown-pipeline`, `wails-integration`, `go-testing`, `ts-testing`,
   `offline-and-privacy`, `traceability-and-stories`) and any relevant **`.claude/skills/*`**.
6. If the story is Stage-1/2, re-read the relevant **F1–F9** forward-compat constraints in
   `00_Foundation/06_IMPLEMENTATION_STAGES.md`; if Stage-3, read `02_Architecture/08_LLM_INTEGRATION.md`.

## Step 2 — Investigate the codebase & prior work (delegate)

Launch the **`investigator`** subagent (read-only) via `Task` to report, with evidence paths:

- The current state of each target **module** — what exists, its public surface, and how this story must
  extend it without breaking the layering/envelope/adapter/token rules.
- **Prior implemented stories/commits** relevant to this one (what they established; interfaces/seams to
  reuse — e.g. the document-command seam, the DI root, the adapter layer, `tokens.css`, the gate).
- Existing **tests, fixtures, configs, bindings** the plan will touch or must keep green; the current
  `just check` / test layout.
- Concrete **edge cases** to cover: the story's `edge_cases` (EC-AREA-N), plus additional realistic ones
  discovered in the code (error paths, per-OS webview differences, encoding/BOM/CRLF, large files,
  concurrency/gate, offline/allowlist, multi-instance) — mapped to the ACs they belong to.

Ask for a structured summary, not a transcript.

## Step 3 — Build the implementation plan

Produce a concrete, ordered plan a `coder` can execute in one session:

- **Files** — for each: create or modify, the exact path (must be a real module from the inventory or a new
  one that the story adds to the inventory), and the change in 1–3 sentences (interfaces/signatures, not
  full code).
- **Backend** honours: Handler → Service → Repository; bound handlers return `apperr.*Result`, take no
  `context.Context`, `defer/recover` → `CodeInternal`; wiring only in `internal/application` (+ `main.go`);
  sqlc `store/` never hand-edited; migrations additive; `internal/appmodel` is the single source of truth
  for the live application model — commands mutate it and emit `state:patch` (DD-62,
  `02_Architecture/02_BACKEND_GO.md#application-model`).
- **Frontend** honours: components/thunks never import `wailsjs/` (adapter only); token-only styling on
  `document.documentElement`; slice-per-feature, with the store a **projection** of the backend model —
  hydrated via `GetState`, reconciled by `state:patch`, no document content in any slice, buffer
  debounce-sync + flush (DD-63/DD-64, `02_Architecture/03_FRONTEND_REACT.md#state-ownership`).
- **Offline invariant** (DD-32): no background/unsolicited network; Stage-3 provider calls only on user
  action.
- **Bindings**: note if a bound Go signature changes → `wails generate module` will be run (no drift).
- **Sequencing** so the tree stays buildable; identify anything that must land before the UI part.

## Step 4 — Build the test & traceability plan

- For **every acceptance criterion** and **every edge case**: the test tier (unit / integration /
  e2e-smoke / architecture), the exact test file path and function name, and the first-line
  **`Proves: STORY-NNN-AC-N`** tag (Go comment or Jest name) required by `03_TRACEABILITY.md`.
- The **`docs/traceability.yaml`** delta (`just trace` will regenerate it) and confirmation `just trace-check`
  will pass with **zero orphans** — no AC without a proving test, no cited clause/module unresolved.
- The exact **Definition-of-Done checklist** for this story (`gofmt`/`vet`/`golangci-lint`/`go test -race`;
  `prettier`/`eslint`/`tsc`/`jest`; bindings drift; module-inventory update if modules changed; UI visual
  reference `mockups/gomarkedit-mockup.html#<theme>-<mode>/<screen>` for UI stories).

## Step 5 — Present the plan (then stop)

Output a single structured plan:

1. **Story recap** — id, goal, ACs, cited clauses/DDs/ADRs, `depends_on` status.
2. **Change set** — the ordered file plan (Step 3) with the layer/rule each change obeys.
3. **Test plan** — the AC→test mapping table with `Proves:` tags and tiers (Step 4).
4. **Edge cases** — the full list with the AC/test that covers each.
5. **Traceability & DoD** — the `traceability.yaml` delta and the DoD checklist.
6. **Risks / open questions / spec gaps** — explicit stop-and-ask items; any ADR needed.
7. **Execution handoff** — who does what (`coder` implements; `tester` writes the AC tests + runs
   `just trace`/`trace-check`; `debugger` if failures; `spec-conformance-reviewer` before `done`).

**Guardrails before you present:** every AC has a proving test; every edge case is covered; every module
path exists in the inventory; no `wailsjs/` import outside the adapter; no network/telemetry added; no spec
edit planned; the story fits one session (else recommend a split).

Finish by calling **`ExitPlanMode`** with this plan to request approval. Write no code until approved.
