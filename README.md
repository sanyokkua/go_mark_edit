# GoMarkEdit

A native, offline, cross-platform Markdown editor and viewer. One binary: a Go backend (Wails v2)
serving a React application in the operating system's own webview.

It works with the network off, it sends nothing anywhere, and it has no telemetry and no auto-update.
The one exception, once the AI assistant exists, is a request you explicitly ask for, to the provider
you configured — and the default provider is a local one.

MIT licensed.

## Running it

```bash
just setup   # install Go and frontend dependencies, and the git hooks
just dev     # run it, with hot reload and the real Go backend
just check   # everything CI runs
```

`just --list` shows the rest.

## The specification

Everything about what this software does, how it is built, and what to build next is in
**[`docs/delivery/`](docs/delivery/)**. Start with
[`docs/delivery/README.md`](docs/delivery/README.md).

- **What it does** — [`spec/product/`](docs/delivery/spec/product/), one file per capability, in plain
  prose. Each is complete on its own.
- **What it looks like** — [`spec/surface/mockup.html`](docs/delivery/spec/surface/mockup.html), one
  self-contained file showing all 44 screens in three themes across light and dark. Open it in a
  browser.
- **How it is built** — [`architecture/README.md`](docs/delivery/architecture/README.md), one page.
- **What is next** — [`plan/roadmap.md`](docs/delivery/plan/roadmap.md).

`docs/reference/` is descriptive background, not a specification.

## Working on it

[`AGENTS.md`](AGENTS.md) is the instruction file for anyone — or anything — writing code here.
