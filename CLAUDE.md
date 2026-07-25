# CLAUDE.md

Guidance for AI agents implementing **GoMarkEdit** — a native, offline, cross-platform Markdown editor
& viewer built with Wails v2 (Go + React/TypeScript). This repo is a **binding specification**; the
app is implemented from it, one story at a time.

## What this project is

GoMarkEdit edits and renders Markdown, integrates with the OS as a file handler, ships three themes with
light/dark/auto, and runs fully offline. See `specification/00_Foundation/01_VISION_AND_SCOPE.md`
and the locked decisions in `00_Foundation/04_DESIGN_DECISIONS.md` (`DD-NN`).

**Spec authority:** `specification/` is the single source of truth. Never invent behaviour. Every
non-trivial decision must trace to a spec clause. If the spec is silent or ambiguous, **stop and ask**.

## AI config locations

- `CLAUDE.md` — this file.
- `.claude/rules/*.md` — path-scoped coding rules (loaded when matching files are touched).
- `.claude/skills/*/SKILL.md` — task playbooks (invoke by trigger).
- `.claude/agents/*.md` — the agent pipeline (investigator → architect → coder → tester → reviewer → docs-writer → debugger).
- **`specification/`** — what the app should be: product behaviour (`01_Product/`), architecture,
  non-functional requirements, dependencies, the initial ADRs (`08_Decisions/`), the delivery phases
  (`07_Phases/`), and the UI mockup (`mockups/gomarkedit-mockup.html` — open it, it shows every
  screen). Start at `specification/INDEX.md`.
- **`docs/`** — the working area: `docs/stories/` (current work, format in its README; `archive/` is
  history), `docs/adr/` (architecture decisions, ADR-0013+), `docs/KNOWN_ISSUES.md`, `docs/audits/`.

## Non-negotiable architecture constraints

Hold on every turn, not just when a rule file happens to be loaded:

- **Wails v2, CGO-free Go.** SQLite via `modernc.org/sqlite`. (DD-01..03, ADR-0001)
- **Backend layering Handler → Service → Repository.** Bound handlers return a concrete
  `apperr.*Result` (never `(T, error)`), take **no `context.Context`**, and convert panics via
  `defer/recover` → `CodeInternal`. Inner services keep `(T, error)`. `internal/apperr` imports no
  other internal package.
- **One composition root.** All concrete wiring lives in `internal/application` (+ `main.go`), two-phase
  (nil repos in the constructor, real repos injected in `Init(ctx)` after the DB opens). Services depend
  on interfaces owned by the package that defines the type.
- **sqlc-generated `internal/db/store/` is never hand-edited.** Migrations are additive only.
- **Frontend never imports `wailsjs/` directly** — only `logic/adapter/`. `unwrap()` handles the
  envelope; components/thunks call adapter singletons.
- **The Go backend is the single source of truth for the live application model.** `internal/appmodel`
  owns open documents + canonical content, the tab set, the workspace ref, and UI/layout state; the
  Redux store is a **derived projection** (hydrated via `GetState`, reconciled by `state:*` events),
  and every UI interaction is a **command** to the backend. The visible Monaco buffer is a
  debounce-synced working copy (`UpdateBuffer`, flushed on blur/switch/close/save); the backend never
  echoes buffer text into the focused editor. (DD-62..64, ADR-0014)
- **Token-only theming.** One layout; themes swap CSS custom properties via `data-theme` × `data-mode`
  on `document.documentElement`. No hardcoded colors. The Viewer hides all chrome. (DD-28..30, ADR-0005)
- **Offline-first, no background network.** No background/unsolicited network calls; bundle all rendering
  assets (KaTeX/Mermaid/fonts). Remote *document* assets load only per the content policy. The **only**
  outbound calls are user-invoked LLM inferences to the configured provider (local by default); Stages 1–2
  make none. (DD-32 revised, DD-54, F6, ADR-0011)
- **No telemetry, no auto-update.** Logs are local files only. (DD-33, DD-34)
- **Multiple instances** (no single-instance lock); settings DB shared via WAL + busy_timeout. (DD-08, ADR-0006)
- **LLM assistant is Stage-3-only.** It must not exist in Stages 1–2 (which only leave the F1–F9 seams open).
  It is a **bounded agentic tool-call loop** (iteration + wall-clock limits, per-iteration cancellation) with
  a **single in-flight inference** enforced by the process-wide gate (`busy` on contention); tools are
  least-privilege, read-mostly, allowlisted. **Edits are user-applied proposals** (a diff applied via the
  editor command seam — never a direct file write). **API keys are env-var-name only** — never persisted or
  logged. Network policy: **no background network; only user-invoked calls to the configured provider (local
  by default)**. (DD-32 revised, DD-38..DD-55; ADR-0007..0011)

## Commands (target `justfile` — see `04_Build_and_Release/03_CI_AND_HOOKS.md`)

```bash
just setup        # install Go + frontend deps; install git hooks
just dev          # wails dev (hot reload, real bridge)
just dev-ui       # frontend-only with bridge mock (no Go backend)
just build        # wails build → build/bin
just gen          # wails generate module (regenerate TS bindings)
just fmt          # gofmt + prettier
just lint         # golangci-lint + eslint
just typecheck    # tsc --noEmit
just test         # go test -race ./...  +  jest
just verify-ui    # Playwright responsive + smoke tests
just check        # fmt-check + lint + typecheck + test + arch checks
```

## The three commands

Everything below runs through three slash commands. Each is read-only until you approve its plan.

| Command | When | What it does |
|---|---|---|
| `/plan-phase <NN>` | Starting a phase | Reads the phase and the product prose behind it, stops on unanswered questions, slices vertical stories, checks coverage three ways, then `architect` writes the files |
| `/plan-story <NNN>` | Building one story | Investigates readers, writers, lifecycle boundaries and async races; plans the change, one test per criterion, the in-app verification and the close-out; then `coder` + `tester` build it |
| `/finish-phase <NN>` | Every story built | Runs the real gates, checks each criterion has a test that actually proves something, walks the phase's "Done when" paragraph in a real build, and reports honestly |

The instructions live in `.claude/commands/`. Codex reaches the same three files through
`.agents/skills/plan-phase|plan-story|finish-phase` — those are pointers, not copies, so there is one
source of truth.

## How work is tracked

`specification/07_Phases/` says, in plain language, what to build next and why. Each phase document
lists the steps in order, points at the `01_Product/` prose and the mockup screens for the detail, and
names the questions that must be answered before the phase starts.

Stories live in `docs/stories/` — one per usable slice of a phase, one coding session each. A story is
**fully worded**: it explains the behaviour in prose rather than citing a clause and expecting the
reader to go and read it. If you cannot tell what the app will do from the story alone, the story is
wrong. Format and rules: `docs/stories/README.md`.

Every acceptance criterion gets its own test, tagged `// Proves: STORY-NNN-AC-N` so a failure names the
requirement that broke. That tag is a convention for humans — nothing validates it, nothing is
generated from it.

A phase is finished when a person uses the app and confirms its "Done when" paragraph. There is no
completion validator, no evidence file, and no traceability record; that machinery existed, cost more
than the application code it governed, and was removed on 2026-07-25.

## Implementation stages

Work ships in three coarse stages (`specification/00_Foundation/06_IMPLEMENTATION_STAGES.md`):
**Stage 1 — Viewer** → **Stage 2 — Editor** → **Stage 3 — LLM Assistant**. Each stage must ship a working
app and **leave the seams open for the next without building a wall**. Stage 1/2 stories must honour the
binding forward-compatibility constraints **F1–F10** (three-region layout slot, document identity + content
accessor, document-command seam, growable settings registry, reserved backend seams incl. the generic gate,
scoped-not-absolute offline invariant, editable buffer selection/apply, programmatic Format/Lint, reusable
DiffView, token-only visual layer). The assistant is built entirely by **consuming** F1–F10 — never by restructuring an
earlier contract. Packaging, file associations and the release pipeline are
**Phase 07** (`specification/07_Phases/PHASE_07_INSTALL_IT.md`): version injection via
`internal/settings.AppVersion` + ldflags, the icon pipeline, and the tag-triggered release workflow
(DD-65..67, `specification/04_Build_and_Release/04_VERSIONING_ICON_AND_CICD.md`). v1 releases ship
via that pipeline; local/dev builds always report version `dev`.

## Orchestration discipline

The top-level session orchestrates; delegate a story's implementation, an investigation, or a review to
one agent (see `.claude/agents/`). Don't loop dozens of edits in the main session when one `coder`
delegation is cleaner. Keep parallel subagents to ≤8. Ask each for a concise structured summary.

## Quality gates — do not bypass

- Fix every `gofmt`/`go vet`/`golangci-lint`/`mypy`-equivalent (`tsc`)/`eslint` finding in files you
  touch before `done`. "Pre-existing" is not an excuse in this greenfield repo.
- Never `git commit --no-verify`. Never delete/comment a failing test to make a suite pass. Never weaken
  a lint rule to silence a finding without an ADR.
- Regenerate bindings after any bound-signature change; commit no drift.

## Never do this

- CGO or a non-pure-Go SQLite driver. A single-instance flock lock (multi-instance is required).
- `(T, error)` from a bound handler; a `context.Context` param on a bound handler.
- Importing `wailsjs/` outside `logic/adapter/`. Hardcoded colors / styling outside the token system.
- Any background/unsolicited network call from the app; a network call in Stage 1/2; loading a CDN asset at
  runtime. Telemetry. Auto-update. (Stage 3's only outbound call is a user-invoked inference to the
  configured provider.)
- Editing `internal/db/store/` by hand; a non-additive migration. Editing the spec to fit the code.

## Self-discovery

Before assuming a convention does not exist: check `.claude/skills/`, the relevant `.claude/rules/*.md`
(by glob), and `specification/02_Architecture/01_MODULE_INVENTORY.md` for the module you are in.
`specification/01_Product/` is the authority on behaviour, `specification/02_Architecture/` on
structure, and `specification/mockups/gomarkedit-mockup.html` on how it should look.

## Rules Reference

| Rule | Globs | Description |
|---|---|---|
| go-backend-architecture | `internal/**/*.go`, `main.go` | Layering, envelope, DI, no-ctx handlers; `internal/appmodel` = single source of truth (DD-62) |
| go-error-envelope | `internal/apperr/**`, `internal/**/handler*.go` | `AppError`/`WireError`/`ToWire`/`*Result` |
| go-persistence-sqlite | `internal/db/**`, `internal/settings/**`, `internal/recent/**` | modernc, WAL, goose, sqlc, KV |
| go-logging | `internal/**/*.go` | zerolog, no PII/secrets, local-only |
| go-testing | `internal/**/*_test.go`, `main_test.go` | table-driven, `-race`, fakes-only |
| ts-react-frontend | `frontend/src/**/*.ts(x)` | strict TS, `React.FC`, no `any`, CSS modules |
| ts-redux-adapter | `frontend/src/logic/**` | store = projection of appmodel (commands + `state:patch`, DD-63/64), slice-per-feature, adapter-only-imports-wailsjs |
| ts-theming-tokens | `frontend/src/ui/styles/**`, `frontend/src/ui/**` | token-only, `data-theme`×`data-mode` |
| ts-markdown-pipeline | `frontend/src/logic/markdown/**`, `frontend/src/logic/{format,lint}/**` | remark/rehype, standard mapping |
| ts-testing | `frontend/src/**/*.test.ts(x)` | RTL/behavioural, a11y queries, mock adapter |
| wails-integration | `main.go`, `wails.json`, `build/**` | embed, Bind/EnumBind, lifecycle, associations |
| offline-and-privacy | `**/*` | no background network, no telemetry, bundled assets, user-invoked provider calls only |
| llm-integration | `internal/llm/**`, `frontend/src/logic/store/assistant/**`, `frontend/src/logic/llm/**`, `frontend/src/ui/widgets/assistant/**` | Stage-3 assistant: provider abstraction, agent loop, tools, gate, budget, env-var secrets |

## Skills Reference

| Skill | Use when |
|---|---|
| adr-authoring | A decision is architecturally significant |
| wails-dev | Anything Wails v2: wails.json, Bind/EnumBind, lifecycle hooks, runtime API, events, menus, platform options, asset server, drag-and-drop, window/UI-layout persistence (12 topic references) |
| go-envelope-and-di | Adding a handler/service/repository vertical or the DI wiring |
| sqlite-kv-persistence | Touching settings/recent persistence or a migration |
| markdown-rendering-pipeline | Changing the renderer, standard mapping, Mermaid, math, highlighting |
| theming-tokens | Adding/adjusting a theme or token; light/dark/auto |
| testing-wails-app | Writing Go/Jest/Playwright tests for a story |
| create-mermaid-diagrams | Authoring an architecture/flow diagram in the spec |
| llm-provider-integration | Adding/adjusting a provider kind, model discovery, verification, or AI/Providers settings (Stage 3) |
| agentic-tool-loop | Building/adjusting the agent loop, tools, cancellation, gate, or edit-proposal apply (Stage 3) |
| context-and-tokenizer | Token estimation, context budgeting, fit meter, or over-context handling (Stage 3) |
| code-review | Reviewing a diff/PR/branch against GoMarkEdit's layering, envelope, adapter/token, migration, and offline invariants (read-only) |
| project-navigator | Orienting in the repository — stack, structure, entry points, run/build/test commands (read-only) |
| project-documentation | Generating architecture/overview docs into `docs/` (or scratch `.agent-docs/`) from the code; never edits the frozen spec |

## Agents Reference

| Agent | Model | Use after |
|---|---|---|
| investigator | Haiku | Any time you need a read-only map of spec vs. code |
| architect | Opus | A phase is ready to slice — write fully-worded stories + architecture ADRs |
| coder | Sonnet | A story is planned — implement exactly one story |
| tester | Sonnet | Coder finished — write the acceptance-criteria tests |
| debugger | Sonnet (→Opus after 2 fails) | A non-trivial test/CI failure |
| docs-writer | Haiku | Public surface changed / an ADR is needed |
| spec-conformance-reviewer | Opus | Story implemented — re-derive its criteria from the spec independently |

## Context management

When compacting, preserve: the current phase/story, modified file paths, outstanding lint/type failures
by file, current test failure names, and any ADR decisions made and why.

## Communication

Communicate for the reader, not for the specification.

When asking questions, explaining decisions, reporting progress, or describing issues:

* Use plain, concrete language instead of internal terminology or abstractions.
* Describe the actual behavior, scenario, or problem, not the document structure that defines it.
* Never assume the reader will look up requirement IDs, acceptance criteria, phases, tickets, or other references.
* If you refer to a requirement, restate its relevant meaning in the current message. References are for traceability only, never as the primary explanation.
* Provide enough context for the reader to understand and answer without opening other documents.
* Prefer concrete examples over abstract descriptions whenever they improve clarity.
* Explain *what* is happening, *why* it matters, and *what decision or action* is needed.
* Recommend a reasonable default when appropriate instead of delegating every decision to the reader.

**Rule of thumb:** Every message should be understandable on its own. If the reader must navigate project documentation to understand your question, explanation, or recommendation, rewrite it.

Use simple and concrete wording
Use direct, plain language.
Prefer short sentences.
Avoid unnecessary technical abstractions.
Explain technical terms when they are required.
Describe the actual behavior, screen, file, operation, or decision involved.
Do not assume the user remembers the internal structure of the specification.

**Bad:**

> How should AC-TR-14 interact with the fallback behavior defined in REQ-LLM-08?

**Good:**

> When the selected local LLM stops responding during book translation, should the app:
> 
> 1) retry the same request,
> 2) switch automatically to another configured provider, or
> 3) stop the translation and ask the user what to do?
> 
> The current specification says failed requests should be retried, but it does not define whether automatic provider switching is allowed.
