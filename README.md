# GoMarkEdit

A native, offline-first desktop **Markdown editor & viewer** (Windows, macOS, Linux), built with
Wails v2 (Go + React/TypeScript). This repository is seeded from a binding specification.

- **Start here:** [`specification/INDEX.md`](specification/INDEX.md) — the read-only source of truth
  (requirements, architecture, phases, initial decisions, UI mockups).
- **Agent operating instructions:** [`AGENTS.md`](AGENTS.md) for Codex; [`CLAUDE.md`](CLAUDE.md) for Claude.
- **Working area (mutable):** [`docs/`](docs/) — generated stories (`docs/stories/`), decisions made
  during implementation (`docs/adr/`), and the progress record (`docs/traceability.yaml`).

The `specification/` folder is **frozen**: implementation traces to it; new decisions are recorded in
`docs/`, never by editing the spec.
