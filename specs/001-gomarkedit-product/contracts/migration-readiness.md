# Contract: Migration Authority and Slice Readiness

## Authority transfer

`docs/delivery/` is the initial requirements source. A requirement transfers to Spec Kit only after
its complete behavior, exact values, edge cases, and proving evidence are mapped without loss and the
mapping is explicitly approved. Approval is per requirement; unmapped clauses in the same source file
remain authoritative.

## Current-code classification

Before a task changes a production seam, direct code and tests classify it as conforming,
partial/defective, missing, or unreliable. Conforming behavior is preserved, partial behavior is
repaired, and missing behavior is implemented. A historical story or phase status is not evidence.

## Validation boundary

Spec Kit owns planning and task artifacts. Legacy validators for documentation shape, copied story
rules, phase status, upgrade markers, and historical traceability references are removed from command
wiring. Product tests, architecture tests, formatting, type checking, linting, builds, baseline
reliability, browser journeys, live checks, and real-build walkthroughs remain mandatory.

Removing a validator must not remove a product assertion or make a failing analyzer appear green.
Historical traceability comments may remain inert until their production file changes; comment-only
cleanup is not an implementation task.

## Evidence lifecycle

The first implementation edit follows a baseline whose raw output, exit codes, findings, and
reliability verdicts are retained. A non-zero result with concrete findings is reliable evidence. A
non-zero result that analyzed nothing is unreliable and blocks implementation. Baseline tooling may
be migrated from legacy story labels to Spec Kit slice labels only while preserving readability of the
comparison point used by the active slice.

## Current boundary

The migration-foundation and appearance batch is delivered. The approved native window shell transfer
contains exactly `FR-WS-001` through `FR-WS-020`, copied into `window-launcher-shell.md`. Each key has
one `OWS-*` plan owner in `plan.md` and exactly one matching primary implementation owner in the
regenerated 36-task `tasks.md`. Tests, documentation, and evidence tasks support an owner without
duplicating it. Every implementation task must still classify each touched seam from current code and
direct tests.

The product-wide launcher requirement is not transferred by the shell-only batch. Its complete behavior
moves only with real New/Open/Open-folder/recent commands in the safe file lifecycle. Rendering a
disabled/no-op facsimile does not make that requirement ready; `FR-WS-020` instead requires those
surfaces to remain absent.

This planning boundary ends after the framed native shell, acknowledged layout, Settings/notification
shell, keyboard/focus, automated responsive evidence, and one current-host real-build walkthrough.
Launcher activation, File commands, real tabs, file lifecycle, rendering expansion, packaging, Editor
expansion, and Assistant behavior remain downstream. The regenerated 36-task file dated 2026-08-01 is
the current implementation candidate for this slice. Implementation may begin only after cross-artifact
analysis reports no unresolved CRITICAL or HIGH issue and T001 captures a trustworthy baseline.

The current task file satisfies, and before implementation must continue to satisfy, all of these checks:

- every `FR-WS-001` through `FR-WS-020` appears in exactly one `Owns:` field;
- every test or evidence task uses `Supports:` and names its primary implementation owner;
- tasks that edit the same production file are ordered, not marked parallel;
- atomic Settings reset names repository, service, handler, projection, UI, and second-window evidence;
- offline evidence names static source/bundle safeguards and one short executable request-instrumented
  browser journey with no duration requirement;
- response evidence retains at least 20 resize and 20 divider samples and names the 95% within 100 ms,
  no-freeze-over-250 ms, and final-ack-within-500 ms thresholds;
- evidence retains the automated 18-case matrix and one current-host real-build walkthrough covering
  every operation in SC-018;
- no task adds a replacement window control, drag region, custom resize zone/private invocation, or
  activates launcher, File, real tabs, Assistant, future Settings, or other facsimile surfaces.
