# Phase 1 Quickstart: Validate the Progressive Product Plan

This guide validates planning readiness and stage outcomes. It does not substitute documentation
checks for working software and does not claim that later stages are implemented.

## Prerequisites

- Go 1.25.7, Node 22, Wails v2.12.0, `just`, and repository dependencies installed with `just setup`
- A clean understanding of the current working tree; do not overwrite unrelated local changes
- The feature contract in [spec.md](spec.md), logical model in [data-model.md](data-model.md), and
  boundary contracts in [contracts/](contracts/)

## 1. Review the planning boundary

Run:

```bash
rg "NEEDS CLARIFICATION|TBD|TODO" specs/001-gomarkedit-product/spec.md \
  specs/001-gomarkedit-product/plan.md specs/001-gomarkedit-product/research.md \
  specs/001-gomarkedit-product/data-model.md specs/001-gomarkedit-product/contracts
git diff --check
```

Expected: no unresolved planning marker and no malformed patch. This is an artifact review, not a
product completion gate.

Review manually:

1. Every FR-001 through FR-080 remains present in `spec.md`.
2. The five 2026-07-30 clarifications appear once and agree with the plan and contracts.
3. `plan.md` authorizes detailed work only for migration-foundation support plus appearance completion.
4. Later stages have entry/exit contracts but no invented API, schema, or component tickets.
5. Every known gap is either attached to its first consuming slice or identified as a hard evidence
   blocker; none is hidden by a delivered label.

## 2. Establish readiness for the next slice

The next batch is migration-foundation support plus appearance completion. Before any implementation
edit, capture the current retained baseline using the existing compatible entry point:

```bash
just baseline STORY-063
```

Expected: every gate records an exit code and reliable analysis. The current generator formatting and
lint findings are legitimate baseline findings; a gate that reports no analyzed target is not. The
first batch may migrate baseline storage to a Spec Kit slice label only if later verification can still
read this comparison point.

The language-token decision is no longer open: generated rules use `.md` and `.go` postfixes, including
qualified descendants. Do not generate or implement shell, file lifecycle, renderer activation,
packaging, Editor expansion, or Assistant tasks merely because their stage appears in the plan.

## 3. Verify an implemented slice

For the active batch, use the retained verification entry point or its Spec Kit-compatible replacement:

```bash
just verify STORY-063
just archtest
```

Expected: no new finding relative to a trustworthy baseline, all named behavior tests pass, and
architecture tests are fully green. The implementation removes legacy planning/traceability validators
but does not weaken any command listed here.

For visible work, also run the appropriate development server, open its local URL in the in-app
browser, use the actual controls at the relevant widths and palettes, inspect visible/root state and
layout, fix any finding, reload, and repeat. Mock-bridge checks complement this step but do not prove
native files, platform APIs, settings durability, or the real backend.

## 4. Validate a stage outcome

At a stage boundary:

```bash
just check
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
2. Map its complete initial-spec behavior, values, edge cases, and evidence into Spec Kit.
3. Obtain explicit approval for requirement-level authority transfer.
4. Resolve numeric, lifecycle, error, and wording questions.
5. Assign every in-scope requirement to one owner and named evidence.
6. Generate tasks for that slice only.

If the next group still depends on an unimplemented seam, leave it at plan level. That is deliberate
progressive planning, not missing work.
