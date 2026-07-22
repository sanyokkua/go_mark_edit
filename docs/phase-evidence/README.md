# Phase evidence

This mutable directory stores real-runtime and human evidence required by
`specification/06_Process_and_Traceability/07_PHASE_FORMAT.md`. Phase documents define the expected
proof; these records capture a particular verification run or approval.

Each evidence file must state:

- phase evidence id (`PHNN-ENN`), status (`verified` or `approved`), date, repository revision, platform
  or completion scope, and named owner;
- the exact command or manual procedure and its result;
- artifact paths such as logs, screenshots, or network traces;
- any limitation that prevents the evidence from satisfying its blocking row.

A pending or failed record is useful audit history but does not satisfy `phase-complete-check`.
