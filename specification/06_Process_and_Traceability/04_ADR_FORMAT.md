**Status:** Accepted
**Owner:** architect
**Audience:** architect
**Last Updated:** 2026-07-10

# ADR Format

Architecture Decision Records are named `NNNN-short-slug.md` (zero-padded **4** digits) and are located
in **two** places by lifecycle:

- **Initial decisions** (ADR-0001…0012) are part of the **frozen spec**, in `08_Decisions/`
  (`08_Decisions/README.md` is their index).
- **New decisions made during implementation** (ADR-0013+) are authored in the **mutable working area**
  at `../docs/adr/` (`../docs/adr/README.md` is their index), continuing the numbering.

Only `accepted` ADRs may be cited in a story's `adrs:`. Index columns: ADR | Title | Status | Supersedes
| Superseded by.

## Template (copy `../docs/adr/template.md`)

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

## Supersession rule

A replacing ADR's `Supersedes:` names the old one. The old ADR's `Status:` becomes
`superseded by ADR-NNNN` — that status line is the **only** edit ever made to an accepted ADR body.
The old file is never deleted.

## Initial ADR set (frozen, in `08_Decisions/`)

The founding decisions. The Stage-3 LLM decisions (ADR-0007…0011) and drag-and-drop (ADR-0012) are also
here — see `08_Decisions/README.md` for the complete index.

| ADR | Title | Locks |
|---|---|---|
| ADR-0001 | Build on Wails v2 (not v3), CGO-free Go | DD-01, DD-02, DD-03 |
| ADR-0002 | Editor engine: Monaco for v1 (CodeMirror 6 as future option) | DD-20 |
| ADR-0003 | Rendering via remark/rehype; format via Prettier/remark; PDF via webview print | DD-16, DD-19, DD-23 |
| ADR-0004 | State: file-first + SQLite KV for settings/recent | DD-10, DD-13 |
| ADR-0005 | Token-driven theming; three built-in themes; no custom themes | DD-28, DD-30 |
| ADR-0006 | Multiple instances (no single-instance lock); shared settings DB via WAL | DD-08, DD-13 |
