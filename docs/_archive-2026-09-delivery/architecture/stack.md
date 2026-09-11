# Stack

Every version below is the one the repository actually resolves, read out of the file named in the
`Pinned in` column on 2026-07-28. Where a search showed a newer release exists, that is recorded rather
than acted on — upgrading is a story, not a documentation edit.

## Go side

| Concern | Choice | Version | Pinned in | Notes |
|---|---|---|---|---|
| Language | Go | 1.25.7 | `go.mod` line 3 | Released 2026-02-04. CI resolves it with `go-version-file: go.mod`, so there is one number, not two. |
| Desktop shell | Wails | v2.12.0 | `go.mod`, and again in `.github/workflows/main.yml` (`wails@v2.12.0`) | v2.13.0 shipped 2026-07-06. Not v3: see `adr/0001-wails-v2-cgo-free.md`. |
| SQLite driver | `modernc.org/sqlite` | v1.54.0 | `go.mod` | Pure Go, no CGO. pkg.go.dev's "latest" display for this module is unreliable (golang/go#77282), so whether a newer release exists was not established on 2026-07-28. |
| Migrations | `github.com/pressly/goose/v3` | v3.27.2 | `go.mod` | v3.27.3 shipped 2026-07-22. Migrations are embedded from `internal/db/migrations/` and run on `db.Open`. |
| Query codegen | sqlc | not pinned in-repo | invoked by `just sqlc-check` | Reads `sqlc.yaml`; writes `internal/db/store/`. Installed on the developer's machine, which is a gap — see `../plan/KNOWN_ISSUES.md`. |
| Logging | `github.com/rs/zerolog` | v1.34.0 | `go.mod` | Structured fields only. |
| Log rotation | `gopkg.in/natefinch/lumberjack.v2` | v2.2.1 | `go.mod` | Local file sink under the app logs directory. |
| Go linter | golangci-lint | v2.12.2 | `.github/workflows/main.yml` | Enabled linters are listed in `.golangci.yml`: `errcheck`, `govet`, `ineffassign`, `misspell`, `staticcheck`, `unconvert`, `unused`. `internal/db/store` is excluded because it is generated. |
| Go formatter | gofmt | ships with Go 1.25.7 | `.golangci.yml` `formatters:` | `just go-format-check` runs it over `git ls-files '*.go'` only, because `frontend/node_modules` contains a real Go package (`flatted`) that must not be formatted. |

## Frontend side

Versions are the resolved ones in `frontend/package-lock.json`; the caret range that allows them is in
`frontend/package.json`.

| Concern | Choice | Version | Notes |
|---|---|---|---|
| UI library | React + React DOM | 19.2.7 | 19.2.8 shipped 2026-07-21. |
| Build tool | Vite | 7.3.6 | Vite 8.0.9 has been stable since 2026-04-20; this project is a major version behind. |
| Language | TypeScript | 5.9.3 | `strict` is on; `just typecheck` is `tsc --noEmit`. TypeScript 6 and 7 exist. |
| Editor | `monaco-editor` + `@monaco-editor/react` | 0.52.2 + 4.7.0 | Monaco 0.56 development builds exist. Monaco is bundled, never loaded from a CDN. |
| Markdown rendering | `react-markdown` | 10.1.0 | |
| Markdown extensions | `remark-gfm` | 4.0.1 | Confirmed latest on 2026-07-28. |
| HTML sanitising | `rehype-sanitize` | 6.0.0 | Always in the pipeline; see `rules.md#rendered-html-is-sanitised`. |
| State | `@reduxjs/toolkit` + `react-redux` | 2.12.0 + 9.3.0 | The store is a projection; see `rules.md#store-is-a-projection`. |
| Accessible primitives | `@radix-ui/react-dropdown-menu`, `@radix-ui/react-toast` | 2.1.21, 1.2.20 | Behaviour and keyboard handling from Radix; every visual value from tokens. |
| Unit tests | Jest + `ts-jest` + `@testing-library/react` | 30.4.2, 29.4.11, 16.3.2 | `jest.config.mjs`, jsdom environment. `package.json` carries `^29.4.0` and `^16.3.0`; those are the **floors the range allows**, not what resolves. |
| Browser tests | `@playwright/test` | 1.61.1 | `playwright.config.ts`; run by `just verify-ui` and `just e2e-test`. |
| Linter | ESLint + `typescript-eslint` | 10.7.0 + 8.64.0 | `frontend/eslint.config.js`. `dist/` and `wailsjs/` are ignored. |
| Formatter | Prettier | 3.9.5 | The single formatter for `.ts`, `.tsx` and `.css`. |
| Localisation | hand-written, `frontend/src/i18n/` | — | There is no i18n library. `t()` reads `frontend/src/i18n/locales/en.json` through `catalog.ts`. Adding a language means adding a JSON file. |

### Bundled fonts

Not npm dependencies — vendored binary files, committed to the repository and referenced by
`@font-face` at the top of `frontend/src/ui/styles/tokens.css` with a relative path and no URL.
Nothing about them is fetched at runtime; see `../spec/constraints.md#every-asset-is-bundled`.

| Face | File | Size | Used by |
|---|---|---|---|
| Roboto (Latin subset) | `frontend/src/ui/fonts/Roboto-Latin.woff2` | 36.6 KB | `--font` in the Material palette, as `GME Roboto`, weight range 400–700 |
| Inter (Latin subset) | `frontend/src/ui/fonts/Inter-Latin.woff2` | 47.3 KB | `--font` in the Minimal palette, as `GME Inter`, weight range 400–700 |

Liquid Glass uses the system stack and bundles nothing. Both files landed in STORY-058 (`c8d88fe`).
There is no build step that produces them: replacing one means replacing the committed file.

### The frontend gate's own tooling

These do not ship in the binary. They are what `just lint`, `just typecheck`, `just test` and
`just frontend-build` actually run, and a version drift here changes what the gates catch.

| Concern | Package | Version | Notes |
|---|---|---|---|
| ESLint flat config | `@eslint/js` | 10.0.1 | The recommended rule set `frontend/eslint.config.js` extends. |
| React lint rules | `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh` | 7.1.1, 0.5.3 | Hooks correctness and fast-refresh safety. |
| Global declarations | `globals` | 17.7.0 | Supplies the browser and Node global sets to the flat config. |
| Test environment | `jest-environment-jsdom` | 30.4.1 | The DOM `tokens.test.ts` reads computed custom properties from. |
| DOM matchers | `@testing-library/jest-dom` | 6.9.1 | `toBeEnabled`, `toHaveAccessibleName` and the rest. |
| Vite React plugin | `@vitejs/plugin-react` | 5.2.0 | JSX transform and fast refresh for `just dev-ui`. |
| Type stubs | `@types/react`, `@types/react-dom`, `@types/jest` | 19.2.17, 19.2.3, 30.0.0 | |

## Build, hooks and CI

| Concern | Choice | Where |
|---|---|---|
| Task runner | `just` | `justfile` — every verb in this specification maps to a recipe there |
| Git hooks | lefthook | `lefthook.yml`: pre-commit formats staged files; pre-push runs `scripts/hooks/pre-push-{bindings,frontend,go}.sh` in that order |
| CI | GitHub Actions, `ubuntu-24.04`, Node 22 | `.github/workflows/main.yml` |
| CI trigger | `push` on tags matching `v*.*.*`, plus `workflow_dispatch` | **There is no pull-request or branch trigger.** `just check` is currently a local-only gate — see `../plan/KNOWN_ISSUES.md`. |

## Adding a dependency

- **When** a Go dependency is added, it is added with `go get` so `go.mod` and `go.sum` move together,
  and the same version string is used in `.github/workflows/main.yml` if CI installs it as a tool.
- **When** a frontend dependency is added, it is added with `npm --prefix frontend install`, and
  `package-lock.json` is committed in the same change. CI runs `npm ci`, which fails on a lock that
  disagrees with `package.json`.
- **If** a dependency would be imported by `internal/apperr`, **then** it needs an ADR. That package is
  the bottom of the graph and everything else depends on it, so a dependency there is a dependency
  everywhere.

## Not permitted

- **A SQLite driver that needs CGO** — `mattn/go-sqlite3` and anything else linking the C library. It
  breaks `wails build` for any target that is not the host, which is the whole point of choosing Go.
- **A second Markdown pipeline.** One remark/rehype pipeline renders the preview and produces the
  formatted output. A second parser gives two answers to "what does this document mean" and they drift.
- **Any dependency that fetches at runtime** — a CDN stylesheet, a web font, a lazily-downloaded plugin,
  a language pack. Everything is bundled, because the app must work with the network off.
- **A telemetry or crash-reporting SDK**, and **an auto-update client**. Both send data the user did not
  ask to send; see `../spec/constraints.md#nothing-leaves-the-device`.
- **A single-instance or file-lock library.** Several windows of GoMarkEdit run at once by design;
  see `adr/0006-multi-instance.md`.
