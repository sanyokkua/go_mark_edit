# ADR lifecycle, placement, and the frozen set

Authority: `docs/adr/README.md` — normative on the id scheme, supersession, and what does and does
not warrant an ADR. `docs/adr/template.md` is the file to copy. `specification/08_Decisions/README.md`
indexes the initial ADR-0001…0012.

## Where ADRs live, and identifiers

ADRs are `NNNN-short-slug.md` files (zero-padded **four** digits) and live in **two** places by
lifecycle:

- **Initial decisions ADR-0001…0012** are part of the **frozen spec**, under
  `specification/08_Decisions/` (index: `08_Decisions/README.md`). They are read-only; **never add to
  this folder**.
- **New decisions made during implementation (ADR-0013+)** are authored in the **mutable working area**
  under `docs/adr/`, continuing the numbering (index: `docs/adr/README.md`). ADR-0013 (window &
  UI-layout state, write-through, last-writer-wins) and ADR-0014 (backend-authoritative application
  state, `internal/appmodel`, DD-62/DD-63/DD-64) already exist, so the next free id is ADR-0015.

Index columns for both: `ADR | Title | Status | Supersedes | Superseded by`. The `ADR-NNNN` id is
**permanent** — never reused, renumbered, or deleted. **Only `accepted` ADRs may be cited in a story's
`adrs:`** — never a `proposed`, `superseded`, or `deprecated` one.

## Status lifecycle

```
proposed → accepted → superseded by ADR-MMMM
                    ↘ deprecated
```

- `proposed` — under discussion; not citable by a story.
- `accepted` — in force; the only status a story may cite in `adrs:`.
- `superseded by ADR-MMMM` — replaced; the file stays, and the Status line is the only edit ever made.
- `deprecated` — withdrawn without a direct replacement.

## Supersession rule

A replacing ADR's `Supersedes:` names the old one. The old ADR's `Status:` becomes
`superseded by ADR-NNNN` — **that status line is the only edit ever made to an accepted ADR body.** The
old file is never deleted. Update the relevant `README.md` index (`Superseded by` on the old row, a new
row for the replacement).

## The frozen initial ADR set (do not re-decide without a superseding ADR)

| ADR | Title | Locks |
|---|---|---|
| ADR-0001 | Build on Wails v2 (not v3), CGO-free Go | DD-01, DD-02, DD-03 |
| ADR-0002 | Editor engine: Monaco for v1 (CodeMirror 6 future option) | DD-20 |
| ADR-0003 | remark/rehype rendering; Prettier/remark format; webview-print PDF | DD-16, DD-19, DD-23 |
| ADR-0004 | State: file-first + SQLite KV for settings/recent | DD-10, DD-13 |
| ADR-0005 | Token-driven theming; three built-in themes; no custom themes | DD-28, DD-30 |
| ADR-0006 | Multiple instances (no single-instance lock); shared settings DB via WAL | DD-08, DD-13 |
| ADR-0007 | LLM provider abstraction (OpenAI-compatible + profiles) | assistant |
| ADR-0008 | Agentic tool-call loop (not a fixed prompt chain) | assistant |
| ADR-0009 | Offline tokenizer + explicit context budgeting | assistant |
| ADR-0010 | Assistant sidebar; edits applied via editor command seam | assistant |
| ADR-0011 | Network policy: offline except user-invoked provider calls | assistant |
| ADR-0012 | Drag-and-drop opens files/folders via native path-based file drop | assistant |

Implementation ADRs continue in `docs/adr/`: **ADR-0013** and **ADR-0014** are already authored →
**ADR-0015** next.
