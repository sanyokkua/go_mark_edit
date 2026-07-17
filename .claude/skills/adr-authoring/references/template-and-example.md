# ADR template and a worked example

Authority: `specification/06_Process_and_Traceability/04_ADR_FORMAT.md`. The canonical copy-to-start
file is `docs/adr/template.md`; `assets/adr-template.md` mirrors it.

## Template

```markdown
# ADR-NNNN — <decision title, one imperative phrase>

**Status:** proposed | accepted | superseded by ADR-MMMM | deprecated
**Date:** YYYY-MM-DD
**Deciders:** <roles or names>
**Supersedes:** ADR-MMMM   (omit when none)

## Context and problem statement
## Decision drivers
## Considered options
## Decision outcome
### Consequences
Positive / Negative / Neutral bullets.
## Pros and cons of the options
### Option A — <name>
Good / Bad bullets.
## Links
- Design decisions: [DD-NN ids this implements]
- Spec clauses: [files this decision constrains]
- Stories: [STORY-NNN that apply this decision]
```

## Worked example (a plausible GoMarkEdit decision)

```markdown
# ADR-0015 — Debounce autosave writes with a copy-then-rename atomic swap

**Status:** accepted
**Date:** 2026-07-16
**Deciders:** architect, coder
**Supersedes:** (none)

## Context and problem statement
Autosave (DD-12) writes the active document on a debounce. A naive in-place truncate-and-write can leave
a half-written file if the process is killed mid-write, and multiple instances (ADR-0006) may target the
same path. We need a durable write that never leaves a partial file on disk.

## Decision drivers
- Preserve BOM/CRLF and encoding (DD-15) — no silent rewrite.
- No partial file after a crash; safe under multiple instances sharing the settings DB via WAL.
- Stay within `internal/docs/` (Handler → Service → Repository); no new module.

## Considered options
- A. In-place truncate + write.
- B. Write to `<name>.tmp` in the same dir, fsync, then `os.Rename` over the target (atomic swap).
- C. Journal writes through SQLite.

## Decision outcome
Chosen: **Option B**. Autosave writes a sibling temp file, fsyncs, then renames over the original; the
rename is atomic on all three target platforms and never yields a partial file.

### Consequences
- Positive: crash-safe; the original is preserved until the swap commits.
- Negative: a transient sibling temp file; needs cleanup on a failed write.
- Neutral: no bound-signature change, so no `wails generate module` needed.

## Pros and cons of the options
### Option A — in-place write
- Good: simplest.
- Bad: a killed process leaves a truncated document — unacceptable.
### Option B — temp + atomic rename
- Good: crash-safe, contained in `internal/docs/`.
- Bad: a temp-file cleanup path to handle.

## Links
- Design decisions: DD-12, DD-15
- Spec clauses: 01_Product/…#autosave, 00_Foundation/04_DESIGN_DECISIONS.md
- Stories: STORY-042
```

## Notes on the example

- The id is **ADR-0015** because ADR-0013 and ADR-0014 already exist in `docs/adr/`; take the next
  free number.
- The Links section is what closes the traceability loop: it names the `DD-NN` the decision
  implements, the spec clauses it constrains, and the `STORY-NNN` that applies it (which in turn cites
  `ADR-0015` in its `adrs:` once this ADR is `accepted`).
