# GoMarkEdit

GoMarkEdit is a native, offline-first Markdown editor and viewer. It is one Wails v2 binary: a Go
backend owns application state, local files, persistence and native integration, while a React
frontend renders the editor, preview and workspace controls.

The product works without an internet connection. It makes no background network request, has no
telemetry and has no automatic update path. A future provider may use the network only after an
explicit user action and under that feature's policy.

## Run it

```bash
just setup
just dev
just verify
```

`just --list` shows the aliases. The underlying entry points are `scripts/build`, `scripts/test`,
`scripts/verify`, `scripts/format` and `scripts/baseline`.

## Read first

The active feature is selected by `.specify/feature.json`. Its current artifacts are in
[`specs/004-codebase-refactoring/`](specs/004-codebase-refactoring/): read `spec.md`, `plan.md`,
`tasks.md` and the relevant files under `contracts/` before changing behaviour.

The repository-wide architecture authority is [`docs/architecture.md`](docs/architecture.md). It
records owners, shared-component consumers, document lifecycle, persistence, shutdown, verification
walkthrough steps and durable decisions.

The former delivery tree is preserved as historical evidence in
[`docs/_archive-2026-09-delivery/`](docs/_archive-2026-09-delivery/). It is not a competing
specification; new work follows the active feature artifacts and the architecture map.

## Contributing

[`AGENTS.md`](AGENTS.md) contains the working instructions for contributors and coding agents.
`CLAUDE.md` and `.github/copilot-instructions.md` are compatibility pointers to those instructions.

Start each task by finding the existing owner and its consumers, then run the relevant verification
stage. Before the first implementation edit, capture the baseline with `scripts/baseline`; at close,
run the six-stage `scripts/verify` flow and `scripts/baseline --compare`.

MIT licensed.
