# Architecture Decision Records — initial (frozen)

These are the **initial** architecture decisions (ADR-0001…0012), part of the **frozen specification**.
They record the founding "why" behind the locked design decisions in
`00_Foundation/04_DESIGN_DECISIONS.md` (`DD-NN`). They are read-only.

**New decisions made during implementation** (ADR-0013+) live in the mutable working area at
`../../docs/adr/` — do not add them here. Format: `../../docs/adr/template.md`.
Files `NNNN-slug.md` (4-digit). Only `accepted` ADRs may be cited in a story's `adrs:`.

| ADR | Title | Status | Supersedes | Superseded by |
|---|---|---|---|---|
| [0001](0001-wails-v2-cgo-free.md) | Build on Wails v2 (not v3), CGO-free Go | accepted | — | — |
| [0002](0002-editor-engine-monaco.md) | Editor engine: Monaco for v1 | accepted | — | — |
| [0003](0003-rendering-format-pdf.md) | remark/rehype rendering; Prettier/remark format; webview-print PDF | accepted | — | — |
| [0004](0004-state-file-first-kv.md) | State: file-first + SQLite KV | accepted | — | — |
| [0005](0005-token-theming.md) | Token-driven theming; three built-in themes | accepted | — | — |
| [0006](0006-multi-instance.md) | Multiple instances; shared settings DB via WAL | accepted | — | — |
| [0007](0007-llm-provider-abstraction.md) | LLM provider abstraction (OpenAI-compatible + profiles) | accepted | — | — |
| [0008](0008-agentic-tool-call-loop.md) | Agentic tool-call loop (not a fixed prompt chain) | accepted | — | — |
| [0009](0009-tokenizer-context-budget.md) | Offline tokenizer + explicit context budgeting | accepted | — | — |
| [0010](0010-assistant-sidebar-apply-edit.md) | Assistant sidebar; edits applied via editor command seam | accepted | — | — |
| [0011](0011-network-policy-llm-exception.md) | Network policy: offline except user-invoked provider calls | accepted | — | — |
| [0012](0012-drag-and-drop.md) | Drag-and-drop opens files/folders via native path-based file drop | accepted | — | — |
