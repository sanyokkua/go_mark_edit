# Project Structures — Type Decision Tree and Annotated Layouts

Use this reference to classify a repository and know where each kind of artifact lives. The decision
tree keys off manifest files (the most reliable signal); annotated layouts show the conventional
directory shape per stack. Always verify by reading file contents — names and nesting vary.

---

## Quick decision tree (by manifest at the repository root)

```
Which manifest(s) are present?
├── package.json                 → Node.js / JavaScript / TypeScript project
│     ├── "workspaces" field      → monorepo (npm/yarn/pnpm workspaces)
│     ├── tsconfig.json present    → TypeScript
│     └── framework dep            → React / Next.js / Express / NestJS / etc. (read dependencies)
├── pyproject.toml | setup.py | requirements.txt → Python project
│     └── framework dep            → Django / Flask / FastAPI / etc.
├── pom.xml | build.gradle(.kts)  → Java / Kotlin / JVM project
│     ├── <modules> in pom.xml     → multi-module Maven build
│     ├── settings.gradle          → multi-project Gradle build
│     └── spring-boot dependency   → Spring Boot service
├── go.mod                        → Go project (module path = first line)
│     └── wails.json + frontend/   → Wails v2 desktop app (Go backend + web frontend) — e.g. GoMarkEdit
├── Cargo.toml                    → Rust project ("members" → workspace)
├── *.csproj | *.sln              → .NET project / solution
├── Gemfile                       → Ruby project
├── composer.json                 → PHP project
└── several of the above in subfolders, or multiple .git dirs → multi-repo / polyglot monorepo
```

> Some projects mix infrastructure-as-code (a separate manifest under an `infra/` or `deploy/`
> subfolder) with application code. Classify the application first, then note the infrastructure layer
> separately.

---

## Node.js / TypeScript

```
package.json            → identity (name), dependencies, scripts (build/test/start)
package-lock.json       → npm lockfile (or yarn.lock / pnpm-lock.yaml)
tsconfig.json           → TypeScript config (presence ⇒ TypeScript)
src/                    → application source
  index.ts | main.ts    → common entry point
dist/ | build/          → compiled output (generated — ignore)
test/ | __tests__/      → tests
node_modules/           → installed dependencies (generated — ignore)
```

- Entry point: `package.json` → `main` / `bin` / `scripts.start`; or `src/index.*`.
- Commands: `package.json` → `scripts` (`build`, `test`, `start`, `dev`, `lint`).
- Library vs app: a library has no start/serve script and is published (has `main`/`exports`); an app
  has a start/serve script.

## Python

```
pyproject.toml          → modern build/dependency config (or setup.py / setup.cfg)
requirements.txt        → pinned dependencies (often alongside pyproject)
src/<package>/ | <package>/ → source package
  __main__.py | app.py | main.py → entry point
tests/                  → tests (pytest / unittest)
.venv/ | venv/          → virtual environment (generated — ignore)
```

- Entry point: `pyproject.toml` `[project.scripts]`, a `__main__.py`, or a framework app object
  (`app = FastAPI()` / `application` for WSGI).
- Commands: `pyproject.toml` (`pytest`, `tox.ini`, `Makefile`), or README.

## Java / Kotlin (Maven or Gradle)

```
pom.xml | build.gradle(.kts)   → build config, dependencies, version
settings.gradle | <modules>    → multi-module/multi-project indicator
src/main/java/ | src/main/kotlin/ → application source
  **/*Application.{java,kt}     → Spring Boot entry point (@SpringBootApplication)
src/main/resources/            → config (application.yml/properties), static resources
src/test/                      → tests
target/ | build/               → compiled output (generated — ignore)
```

- Entry point: the class with `public static void main` (Spring Boot: `@SpringBootApplication`).
- Commands: Maven (`mvn clean package`, `mvn test`) or Gradle (`./gradlew build`, `./gradlew test`).
- Multi-module: the root `pom.xml`/`settings.gradle` lists modules; real code is in submodule folders.

## Go

```
go.mod                  → module path + dependencies (Go version on the `go` line)
go.sum                  → dependency checksums
cmd/<binary>/main.go    → entry point(s) — one folder per binary (idiomatic)
internal/               → private packages
pkg/                    → exported packages
*_test.go               → tests (co-located with code)
```

- Entry point: `main.go` under `cmd/` (or repo root for single-binary projects).
- Commands: `go build ./...`, `go test ./...`, `go run ./cmd/<binary>`.

## Wails v2 desktop app — GoMarkEdit (Go backend + React/Vite/TypeScript frontend)

GoMarkEdit is a native, offline-first Markdown editor: a **Wails v2** app pairing a Go backend with a
React 19 / Vite / TypeScript frontend running in the OS webview, using **Monaco** as the editor. It is
CGO-free (`modernc.org/sqlite`), MIT-licensed, no telemetry, with a Stage-3 LLM assistant. Signals:
`go.mod` **and** `wails.json` at the root, a `frontend/` folder with its own `package.json`, and a
generated `frontend/wailsjs/` bindings dir.

```
main.go                 → composition root: embed frontend/dist, wails.Run, Bind/EnumBind,
                          OnStartup→Init, OnShutdown, Mac.OnFileOpen, runtime.OnFileDrop
wails.json              → Wails project config: platform options, info.fileAssociations, build hooks
justfile                → task runner (just check / lint / test / trace / trace-check); primary interface
go.mod / go.sum         → Go module + deps (modernc.org/sqlite, goose, zerolog/lumberjack)
internal/               → Go backend packages (strict Handler → Service → Repository):
  apperr/               → ErrorCode catalog, AppError, WireError, ToWire, *Result envelopes (bottom of graph)
  application/          → DI root: two-phase ApplicationContextHolder, Init(ctx); the ONLY wiring site
  bootstrap/            → pre-DB console logger, build-tag IsDevBuild
  logging/              → zerolog + lumberjack file sink (local only)
  file/                 → OS path resolution (config/logs dirs), isDev isolation
  db/                   → SQLite open (WAL+busy_timeout), goose migrations; db/store/ is sqlc-generated (never hand-edit)
  settings/             → KV settings groups + window.*/ui.* layout state (H/S/R)
  appmodel/             → backend-authoritative application model (DD-62): open docs + canonical content,
                          tabs, workspace ref, UI/layout; GetState query + commands + state:patch events
  recent/ · docs/ · workspace/ · assets/ · export/ · fileassoc/ · gate/  → feature verticals + shared
  llm/                  → Stage-3 assistant: providers/ verify/ tokenizer/ context/ tools/ agent/ actions/
frontend/               → React/Vite/TypeScript app
  package.json          → frontend deps + scripts (Vite build/dev); driven via just, not npm directly
  vite.config.ts        → Vite/bundler config
  wailsjs/              → GENERATED Wails bindings (regenerate via `wails generate module` / `just gen`; never hand-edit)
  src/
    ui/                 → styles/(tokens.css) · primitives/(Radix) · components/ · widgets/(feature views)
    logic/              → store/(Redux slices — a projection of internal/appmodel, DD-63) · adapter/(ONLY layer importing wailsjs/) · theme/ markdown/ format/ lint/ hooks/ utils/
    i18n/               → i18n init + en bundle
    dev/bridge-mock/    → dev-only Wails bridge mock (plain `npm run dev`, no Go backend)
specification/          → FROZEN normative spec (source of truth) — read, never edit
docs/                   → stories/ (docs/stories/story-NNN-*.md), adr/ (0013+), traceability.yaml (generated)
.claude/                → agents/, skills/, rules/ (path-scoped guidance)
build/                  → Wails build assets/output
```

- Entry point: `main.go` (single `wails.Run`); frontend entry is `frontend/src/main.tsx`.
- Commands (all via **`just`**, not raw npm): `just check` (format→lint→vet→test→trace-check),
  `just lint`, `just test`, `just trace`, `just trace-check`; plus `wails dev`, `wails build`,
  `wails generate module`. Go tests co-located as `*_test.go`; frontend tests via Jest + Playwright.
- Key invariants to note when orienting: strict backend layering + `apperr.*Result` envelope (no
  `ctx` param on handlers), `wailsjs/` imported only from `logic/adapter/`, backend-authoritative state
  (`internal/appmodel` is the single source of truth; Redux is a projection reconciled by `state:patch`,
  DD-62/DD-63/DD-64), token-only theming, CGO-free additive-only SQLite, multi-instance (no flock),
  offline (only user-invoked Stage-3 LLM calls).

## Rust

```
Cargo.toml              → package/workspace config, dependencies
Cargo.lock              → locked dependency versions
src/main.rs             → binary entry point
src/lib.rs              → library entry point
tests/                  → integration tests
target/                 → build output (generated — ignore)
```

- Workspace: `[workspace] members = [...]` lists member crates.
- Commands: `cargo build`, `cargo test`, `cargo run`.

## .NET

```
*.sln                   → solution (groups projects)
*.csproj                → project file (target framework, package refs)
Program.cs              → entry point (Main / top-level statements)
appsettings.json        → configuration
bin/ obj/               → build output (generated — ignore)
```

- Commands: `dotnet build`, `dotnet test`, `dotnet run`.

## Container / deployable service (any language)

```
Dockerfile              → image definition (base image, build steps, entrypoint)
docker-compose.yml      → local multi-service orchestration
.dockerignore           → build-context exclusions
entrypoint.sh           → container startup script (may be at root or in a docker/ subfolder)
infra/ | deploy/ | iac/ → infrastructure-as-code (templates, modules, manifests)
```

- The `Dockerfile` `ENTRYPOINT`/`CMD` reveals how the service actually starts in production.
- Infrastructure-as-code lives in a dedicated folder; treat it as a separate layer from app code.

## Monorepo / multi-repo

```
apps/ | services/ | packages/ | libs/ → top-level groupings, each with its own manifest
turbo.json | nx.json | lerna.json | pnpm-workspace.yaml → JS monorepo tooling
```

- Each subfolder with its own manifest is an independent deployable/package — list them, do not blend.
- Multiple `.git` directories ⇒ a folder of separate repositories; navigate each independently.

---

## Supplementary files to check (any project type)

| What | Where |
|---|---|
| Documentation | `README.md`, `docs/`, `mkdocs.yml`, `*.md` at root |
| API definitions | `openapi.yaml`/`swagger.*`, GraphQL `*.graphql`, Postman/Bruno collections |
| Architecture diagrams | `docs/`, `images/`, `*.drawio`, `*.mmd` |
| Code quality / linting | `.eslintrc*`, `eslint.config.*`, `ruff.toml`, `.editorconfig`, static-analysis config |
| Dependency automation | `renovate.json`, `.github/dependabot.yml` |
| Security scanning | IaC scanner config, suppression files |
| Language version pin | `.nvmrc`, `.python-version`, `.tool-versions`, `.java-version` |
