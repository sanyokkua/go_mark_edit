# Phase 1 Quickstart: Validate the Progressive Product Plan

This guide validates planning readiness and stage outcomes. It does not substitute documentation
checks for working software and does not claim that later stages are implemented.

## Prerequisites

- Go 1.25.7, Node 22, Wails v2.12.0, `just`, and repository dependencies installed with `just setup`
- A clean understanding of the current working tree; do not overwrite unrelated local changes
- The feature contract in [spec.md](spec.md), logical model in [data-model.md](data-model.md), and
  boundary contracts in [contracts/](contracts/)

## 1. Validate the planning artifacts

Run:

```bash
just spec-check
rg "placeholder|unresolved clarification" specs/001-gomarkedit-product
```

Expected: specification checks analyze the tree; manual review confirms no unresolved placeholder in the generated
plan or Phase 0/1 artifacts. A non-zero command with no analyzed findings is not a pass.

Review manually:

1. Every FR-001 through FR-080 remains present in `spec.md`.
2. `plan.md` authorizes detailed work only for the next dependency-complete slice.
3. Later stages have entry/exit contracts but no invented API, schema, or component tickets.
4. Every known gap is either attached to its first consuming slice or identified as a hard evidence
   blocker; none is hidden by a delivered label.

## 2. Establish readiness for the next slice

The next slice is theme completion. Before any code edit, run the repository's story integrity and
baseline workflow for the selected replacement/current story:

```bash
just story-check 063
just baseline STORY-063
```

Expected: copied requirements and ownership are complete; every gate records an exit code and reliable
analysis. Stop if the Markdown-source versus embedded-language token ownership remains contradictory,
if any gate is `UNRELIABLE`, or if the story requires paths outside its declared scope.

Do not generate or implement shell, files, rendering, packaging, Editor, or Assistant tasks merely
because their stage appears in the plan.

## 3. Verify an implemented slice

For any later authorized story, use its ID:

```bash
just verify STORY-NNN
just archtest
```

Expected: no new finding relative to a trustworthy baseline, all named story tests pass, architecture
tests are fully green, and requirement mappings resolve to behavior rather than copied identifiers.

For visible work, also run the appropriate development server, open its local URL in the in-app
browser, use the actual controls at the relevant widths and palettes, inspect visible/root state and
layout, fix any finding, reload, and repeat. Mock-bridge checks complement this step but do not prove
native files, platform APIs, settings durability, or the real backend.

## 4. Validate a stage outcome

At a stage boundary:

```bash
just check
just spec-check
just build
```

Then inspect every named proving test and walk the stage's independent test on the real build. Viewer
includes offline file opening/rendering and packaging; Editor includes safe write/recovery and export;
Assistant actions include explicit provider traffic and proposal review; Assistant chat includes
bounded allowlisted capabilities and session-only transcripts.

Expected: the complete stage exit contract in `contracts/delivery-stages.md` is observable. A green
aggregate command, legacy phase status, or mock-only Playwright journey is insufficient.

## 5. Authorize the following slice

Only after reconciliation confirms the current slice matches its governing requirements:

1. Select the first unmet capability group whose entry dependencies now exist in production.
2. Copy its complete requirements and applicable architecture rules.
3. Resolve numeric, lifecycle, error, and wording questions.
4. Assign every in-scope requirement to one owner and named evidence.
5. Generate tasks for that slice only.

If the next group still depends on an unimplemented seam, leave it at plan level. That is deliberate
progressive planning, not missing work.
