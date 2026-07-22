# Story lifecycle and sizing

Authority: `specification/06_Process_and_Traceability/02_STORY_FORMAT.md` (lifecycle, sizing),
`06_DEFINITION_OF_DONE.md` (the DoD gate). Governing rule: `.claude/rules/traceability-and-stories.md`.

## Lifecycle

```
[*] → draft → ready → in-progress → done → superseded
                 ↖___________|  (in-progress → ready: blocked, returned to backlog)
```

- **`draft → ready`** — the front-matter validates, every `phase_requirements` id resolves, each AC has a
  `Satisfies:` mapping with the same union, every `depends_on` is `done`, every clause resolves, and the
  estimate is S/M.
- **`ready → in-progress`** — the coder picks it up.
- **`in-progress → done`** — every AC has a passing test that names the story id, and `just trace-check`
  validates with **no orphans**.
- **`in-progress → ready`** — blocked; returned to the backlog.
- **`done → superseded`** — a later story replaces it; **the file stays and links to its replacement.**

**`done` is immutable.** A change to an accepted clause a `done` story depends on requires a **new
story** (and a new ADR if architecturally significant), never an edit to the old file. A story is
`done` only when it is fully landed — never partially.

## Sizing

| Tier | Bounds |
|---|---|
| **S** | 1 module, 1–3 ACs, no new public API. |
| **M** | ≤3 modules, ≤6 ACs, may add 1 public API symbol. |
| **L** | Non-ready epic only; split into S/M stories before implementation. |

An **L** epic → split into a parent backlog item + S/M `depends_on` children. A UI story `depends_on` the
backend story that supplies its bound methods, so the Go/TS boundary is never crossed
un-verifiably (the frontend story can't be `ready` until the backend one is `done`).
