# GoMarkEdit

GoMarkEdit is a native, offline-first Markdown editor and viewer for Windows, macOS and Linux. One
Wails v2 application contains a Go backend and React/TypeScript frontend. The backend owns document
state, file I/O, persistence and native integration; Markdown files remain the user's source of truth.

At runtime the app makes no background network requests, telemetry calls or automatic-update
requests. User-selected web links can open in the system browser. GitHub is used only by CI and the
release workflow.

## Current scope

The application includes rich Markdown rendering with local code highlighting, math and Mermaid; document-wide Format, Compact and Lint; and links to supported local Markdown files through the normal open flow. The command palette, Assistant, export, image authoring, file associations and broader asset support remain candidate work. Remote images retain their placeholder while a user-consent policy remains undefined. Start new product work with an approved numbered feature specification.

## Run it

Prerequisites: Go as pinned in `go.mod`, Node as pinned in `.nvmrc`, npm, and the Wails platform
build prerequisites.

```bash
scripts/build setup
scripts/build dev
scripts/verify
```

Optional aliases are available through `just`: `just setup`, `just dev`, `just verify`, and
`just --list`. Use `scripts/build setup --with-browser` to install Chromium for E2E verification.
On Linux, desktop builds need GTK 3 and WebKit2GTK 4.1 development headers.

## Documentation

- [Project guide](docs/index.md) — architecture, inputs/outputs, data flows, contracts, configuration,
  operations, current scope and future work.
- [Architecture map](docs/architecture.md) — code ownership, shared UI consumers, document lifecycle,
  persistence, shutdown and durable decisions.
- [Current specifications](openspec/specs/) — observable behaviour of the application;
  [OpenSpec configuration](openspec/config.yaml) holds the project's engineering rules.
- [E2E performance notes](docs/e2e-performance.md) — real-backend test harness and verification findings.
- [Working instructions](AGENTS.md) — repository conventions for contributors and agents.

`app_version_1_codebase` is the integration branch for completed feature work. The repository owner
controls the later integration into `master`. New work starts as an OpenSpec change under
`openspec/changes/` and uses its own `feature/<short-description>` branch.

## Build and release

CI tests Go packages on macOS and Windows and runs full verification on Linux. The current release
workflow packages macOS arm64. Versioned builds accept `X.Y.Z`, `X.Y.Z-alpha.N`, and
`X.Y.Z-beta.N`; alpha and beta tags create GitHub prereleases. Manual release dispatch builds an
artifact without publishing a release. See [the project guide](docs/index.md#103-ci-and-release).

## Contributing

`AGENTS.md` is the single source of truth for development workflow and repository boundaries.
`CLAUDE.md` and `.github/copilot-instructions.md` point to it. The canonical local commands are
`scripts/build`, `scripts/test`, `scripts/verify`, `scripts/format` and `scripts/baseline`.

MIT licensed. See [LICENSE](LICENSE).
