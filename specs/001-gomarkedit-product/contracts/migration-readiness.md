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

## First-batch boundary

The authorized batch contains the migration-foundation support above and the complete appearance
journey. It ends after generated themes, coordinated Auto behavior, first-paint palette application,
and the three-width by six-palette evidence are implemented and reconciled. Launcher/window-shell,
file lifecycle, rendering, packaging, Editor expansion, and Assistant work remain plan-level only.
