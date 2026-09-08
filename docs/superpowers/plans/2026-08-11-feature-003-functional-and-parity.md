# Feature 003 Functional and Parity Implementation Plan

> **For agentic workers:** Process this plan with the active Feature 003 SpecKit artifacts and preserve the immutable mockup, selector mapping, masks, tolerance, and comparator authority.

**Goal:** Bring `003-real-files-and-tabs` from checked-label/partial evidence to trustworthy functional behavior, minimal shell convergence, complete state-aware parity preparation, and fresh release evidence.

**Architecture:** Go `internal/appmodel` remains authoritative for document, tab, write, conflict, autosave, close, and recent-file state. Redux remains a content-free projection, Monaco remains activation-scoped, and Wails imports remain adapter-only. The mockup is a read-only visual authority; production behavior and layout are corrected without weakening parity measurement.

**Tech Stack:** Go 1.25.7, Wails v2, React 19, TypeScript, Redux Toolkit, Monaco, Jest, Playwright, SQLite KV persistence, and the repository `just` gates.

## Global Constraints

- Resolve the active feature with `.specify/scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks` before each implementation pass.
- Preserve the empty workspace boundary, zero-width Assistant, unchanged ordinary startup, deferred folder/provider behavior, and adapter-only Wails bindings.
- Preserve exact binary size limits, bounded stable reads, classified errors, lifecycle barriers, backend-authoritative projections, and real-bridge behavior.
- Do not alter the immutable mockup, selector mapping, coordinate handling, masks, pixel tolerance, comparator, or reference source to hide production drift.
- Keep T035/T036/T037/T038/T039 evidence separate from focused tests and do not mark a task complete without its named evidence.

## Execution

1. Capture a reliable current baseline and inspect every named focused test for T004–T032, T047–T049; run real-bridge/current-host journeys for New/Open, edit, Save/Save As, tabs, conflicts, autosave, close/quit, recents, launcher, preview, and actions. Add a failing regression test before any production correction.
2. Implement T040–T042 as the minimal functional shell structure: overlay divider, top-row identity, and bottom status surface. Verify with component tests, geometry assertions, and the real app.
3. Isolate and complete T051–T054 with explicit state-to-fixture transitions, real-control transitions, readiness assertions on both reference and actual pages, and separate accounting for planned/attempted/ready/completed/passed/failed comparisons.
4. Run the full 546-key, three-repetition matrix unchanged, then the regression/offline/real-control gates and fresh current-host build walkthrough. Mark only evidence-backed tasks in `tasks.md`; retain failures and report blockers rather than weakening gates.

## Verification Checkpoints

- `just baseline 003-real-files-and-tabs` is reliable and its exit/findings/logs are inspected.
- Focused Go/frontend tests and `just check` are green with no new findings against baseline.
- Real bridge and current-host evidence demonstrates every user-facing functional flow.
- T035 reports exactly 1,638 comparisons with planned, attempted, ready, completed, passed, and failed counts separated.
- T036–T039 evidence is fresh, source-controlled where required, and matches the approved specification and plan.
