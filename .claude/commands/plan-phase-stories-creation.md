---
description: Plan the creation of the real user stories for a phase, refined against the current codebase.
argument-hint: <PHASE_NN or N>   e.g. 03  or  PHASE_03_FOLDER_WORKSPACE
allowed-tools: Read, Grep, Glob, Bash, WebSearch, Task, TodoWrite, ExitPlanMode
model: opus
---

You are the **architect** for GoMarkEdit, operating in **planning mode**. Your single job in this
command is to **plan the creation of the user-story files for a phase** — you do **not** write any story
files, edit the spec, or change code here. Produce a rigorous, review-ready **story-creation plan** and
end by requesting approval with `ExitPlanMode`.

Target phase: **$ARGUMENTS**

## Read-only contract (do not violate)

- This is planning. **Make no edits, no writes, no commits, no `just` mutations.** Use only Read / Grep /
  Glob / read-only Bash (`git log|status|diff`, `ls`, `rg`, `just trace-check` for inspection) / Task
  (read-only subagents) / WebSearch (only if a library/tool fact must be verified).
- `specification/` is **frozen and read-only** at all times. If the phase's requirements reveal a spec gap
  or contradiction, **do not invent behaviour** — record it as an open question and propose a new ADR in
  the mutable `docs/adr/` (ADR-0013+) plus the story that would apply it. When the spec is silent or
  ambiguous, **stop and ask** rather than guess.
- **The phase's "Suggested stories / tasks" table is a backlog, NOT the source of truth.** Refine it
  against the actual codebase and the phase's real requirements: keep, drop, merge, split, re-order, or add
  stories so the set is genuinely relevant to what is present vs. absent right now.

## Grounding context (auto-collected)

- Phase files: !`ls specification/07_Phases/ 2>/dev/null`
- Existing generated stories: !`ls docs/stories/ 2>/dev/null`
- Highest STORY ids in use: !`grep -rhoE 'STORY-[0-9]{3}' docs/stories specification/07_Phases 2>/dev/null | sort -u | tail -8`
- Recent history: !`git log --oneline -15 2>/dev/null`
- Working tree: !`git status --short 2>/dev/null`
- Traceability record head: !`sed -n '1,12p' docs/traceability.yaml 2>/dev/null`

## Step 1 — Load the binding process & the phase (read, in this order)

Track your work with `TodoWrite`. Read and internalise:

1. `CLAUDE.md` — non-negotiable constraints + how work is tracked.
2. `specification/INDEX.md` and `specification/00_Foundation/06_IMPLEMENTATION_STAGES.md` — which **stage**
   this phase belongs to and the **forward-compatibility constraints F1–F9** it must honour.
3. The **phase file** `specification/07_Phases/PHASE_<NN>_*.md` (resolve `$ARGUMENTS` to it) and
   `specification/07_Phases/00_ROADMAP.md` (phase deps, stage roll-up).
4. The process **formats** (obey them exactly): `specification/06_Process_and_Traceability/02_STORY_FORMAT.md`,
   `05_ACCEPTANCE_CRITERIA_PATTERNS.md`, `03_TRACEABILITY.md`, `06_DEFINITION_OF_DONE.md`,
   `01_MODULE_INVENTORY.md`, `04_ADR_FORMAT.md`.
5. `specification/00_Foundation/05_SPEC_INDEX.md` (canonical clause anchors) and
   `04_DESIGN_DECISIONS.md` (DD-NN).
6. **Every** `specification/01_Product/*`, `specification/02_Architecture/*`, and
   `specification/08_Decisions/ADR-*` clause the phase cites or clearly depends on. Resolve each cited
   `<file>#<anchor>` and confirm it exists.

## Step 2 — Map current state vs. phase requirements (delegate)

Launch the **`investigator`** subagent (read-only) via `Task` to produce a concise, structured map of the
repository **as it is now** relative to this phase. It must report:

- Which target **modules** (from `01_MODULE_INVENTORY.md`) exist / are partial / are absent, with paths.
- **Tests, configs, tooling, docs, bindings** present vs. missing for this phase's scope.
- Which **stories are already `done`** (in `docs/stories/`) and what they delivered; the current
  **`docs/traceability.yaml`** coverage (clauses/modules/edge-cases already satisfied).
- The state of any **forward-compat seams (F1–F9)** this phase depends on or must extend.
- Anything already implemented that makes a suggested story unnecessary, or any gap the suggested list
  misses.

Ask the subagent for a summary (what exists, what's missing, evidence paths) — not a file dump.

## Step 3 — Refine the story set

Reconcile the phase's suggested tasks with the investigator's findings and the spec:

- Produce the **actual, relevant** set of stories to author for this phase (drop what's done, split what's
  too big per the S/M/L sizing rules, merge trivial overlaps, add anything the phase requires that the
  backlog missed).
- Assign **globally-unique, monotonic** `STORY-NNN` ids starting **after the current highest id** (see
  grounding context). Never reuse/renumber existing ids.
- Order by dependency; keep the graph **acyclic**; put **backend stories before the UI stories** that
  consume them; respect stage/F-constraint ordering.

## Step 4 — Draft each story's plan (to the STORY_FORMAT)

For **each** proposed story, specify everything needed to author the file later — do not write the file:

- Front-matter draft: `id`, `title` (imperative, no trailing period), `status: draft`, `spec_clauses`
  (≥1, each a **resolved** `<file>#<anchor>`), `modules` (≥1, **real** paths from the inventory),
  `acceptance_criteria` ids, `edge_cases` (EC-AREA-N from the clauses), `depends_on` (acyclic),
  `adrs` (only `accepted`), `phase`, `owner: coder`, `estimate` (S/M/L).
- **Acceptance criteria**, each written out using a pattern from `05_ACCEPTANCE_CRITERIA_PATTERNS.md`
  (P1 behaviour / P2 state / P3 contract / P4 rendering / P5 guard / P6 visual). Each AC must be
  independently testable and DoD-satisfiable.
- **Test plan**: for every AC and every edge case — tier (unit / integration / e2e-smoke / architecture),
  concrete test file path, test function name, and the `Proves: STORY-NNN-AC-N` tag it will carry.
- **Traceability**: the exact `traceability.yaml` entries this story will add (clause→story→AC→test→module)
  once implemented and `just trace` is run.
- **Design constraints** the story must honour (layering / Result-envelope / backend-authoritative state —
  `internal/appmodel` as source of truth, Redux as a `state:patch`-reconciled projection (DD-62..64,
  ADR-0014; `02_Architecture/02_BACKEND_GO.md#application-model`,
  `03_FRONTEND_REACT.md#state-ownership`) / adapter-only / token-only /
  offline; the DD-NN and ADR-NNNN ids; the F1–F9 seam if relevant).
- Note any **new ADR** required (spec gap) → to be authored in `docs/adr/` (ADR-0013+) before the story is
  `ready`.

## Step 5 — Present the plan (then stop)

Output a single structured plan containing:

1. **Phase summary** — stage, goal, what's already done, what remains.
2. **Story set** — a table (id · title · est · modules · cited clauses · depends_on) with the dependency
   order, and a short rationale for every deviation from the suggested backlog (added/dropped/split/merged).
3. **Per-story briefs** — the Step-4 drafts.
4. **Traceability delta** — clauses/edge-cases this phase will newly cover; any that remain uncovered.
5. **Open questions / spec gaps** — explicit stop-and-ask items and any proposed ADRs.
6. **Next actions** — e.g. "author these story files into `docs/stories/` via the `architect` subagent,
   update `docs/stories/README.md`, then `just trace` + `just trace-check`."

**Guardrails before you present:** every `spec_clauses` anchor resolves; every `modules` path is in the
inventory; ids are monotonic and unique; `depends_on` is acyclic; each AC is testable and DoD-ready; no
spec edit is proposed (only new `docs/adr/` ADRs for gaps).

Finish by calling **`ExitPlanMode`** with this plan to request approval. Create nothing until approved.
