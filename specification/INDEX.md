# GoMarkEdit — Specification (Index)

GoMarkEdit is a native, **offline-first** desktop **Markdown editor & viewer** for Windows, macOS, and
Linux, built with **Wails v2** (Go backend + React/TypeScript frontend). This `specification/` folder is
the **binding, read-only source of truth** from which the application is implemented.

> **Status:** Specification v1 (implementation not started)
> **Target stack:** Wails v2 · Go 1.25+ · React 19 · Vite · TypeScript · SQLite (modernc, pure-Go)
> **Product license:** MIT · Open source · No telemetry · No auto-update

---

## What this folder is (and what it is not)

`specification/` is **frozen**. Every implementation decision must trace to a specific clause here. If
the spec is silent or ambiguous, an agent must **stop and ask** rather than invent behaviour. A change
to an accepted clause requires a **new decision recorded in the mutable working area** (`../docs/`),
never a silent edit to the spec.

Everything that **evolves during implementation** lives **outside** this folder, in the repository's
mutable **`../docs/`** working area:

| Frozen (here, `specification/`) | Mutable (repo `docs/`) |
|---|---|
| Requirements, architecture, non-functional, build, dependencies | — |
| **Initial** architecture decisions (`08_Decisions/`, ADR-0001…0012) | **New** decisions made while implementing (`../docs/adr/`, ADR-0013+) |
| Process **formats** — phase/story formats, traceability schema, ADR format, DoD, AC patterns, module inventory (`06_Process_and_Traceability/`) | The **instances** — generated stories (`../docs/stories/`), phase evidence (`../docs/phase-evidence/`), the progress record (`../docs/traceability.yaml`) |
| Phases + suggested tasks (`07_Phases/`) | The actual stories generated per phase (`../docs/stories/`) |
| UI mockups (`mockups/`) | — |

## Reference convention

- Cross-references **inside `specification/`** are written **relative to this `specification/` root**
  (e.g. `02_Architecture/01_SYSTEM_ARCHITECTURE.md`, `mockups/gomarkedit-mockup.html`,
  `08_Decisions/0001-wails-v2-cgo-free.md`).
- References to the **mutable working area** use `../docs/...` (e.g. `../docs/stories/`,
  `../docs/traceability.yaml`, `../docs/adr/`).
- ADRs are also citable by **id** (`ADR-0007`) regardless of location.

## Sections

```
specification/
  INDEX.md                     ← you are here
  00_Foundation/               vision & scope, glossary, personas, LOCKED design decisions (DD-NN),
                               spec-anchor index, implementation stages (Viewer → Editor → Assistant)
  01_Product/                  functional requirements per feature area (editor, viewer, files,
                               standards, rendering, format/lint, pdf, associations, assets/security,
                               theming, settings, shortcuts, i18n, + LLM assistant 14–18)
  02_Architecture/             system, backend (Go), frontend (React), Wails, state/persistence,
                               error handling, large-files/concurrency, LLM integration
  03_NonFunctional/            quality attributes, performance, security/privacy, offline, accessibility
  04_Build_and_Release/        build matrix, packaging + file associations, CI + git hooks,
                               versioning + icon + release pipeline (DD-65..67)
  05_Dependencies/             Go deps, frontend deps, dependency policy
  06_Process_and_Traceability/ module inventory + the process FORMATS (phase, story, traceability, ADR, AC, DoD)
  07_Phases/                   roadmap + one file per phase (requirements, transitions, contracts, work packages, evidence)
  08_Decisions/                the initial architecture decision records (ADR-0001…0012) + index
  assets/icon/                 canonical app-icon source + deterministic processing pipeline (DD-66)
  mockups/                     the single UI reference — gomarkedit-mockup.html (all themes/states)
```

## How work is delivered (the workflow)

Implementation proceeds in **three stages** — **Viewer → Editor → LLM Assistant**
(`00_Foundation/06_IMPLEMENTATION_STAGES.md`), each a working, shippable app that leaves the seams
open for the next (constraints **F1–F9**). Stages group **phases** (`07_Phases/`); each phase lists its
**suggested tasks/stories** (a backlog), not finished stories.

Each phase first defines permanent requirements and evidence in the fixed phase format
(`06_Process_and_Traceability/07_PHASE_FORMAT.md`). Actual work units — **stories** — are then generated
into `../docs/stories/`, one per session, in the story format (`02_STORY_FORMAT.md`):

1. **Investigate** the phase (read spec vs. current code).
2. **Author** the phase's stories into `../docs/stories/` from its suggested-task list.
3. **Implement exactly one story per session** (the `coder` agent) — read every cited clause first.
4. **Test** each acceptance criterion; a proving test names the story id in its first docstring/comment line.
5. **Regenerate + validate traceability** (`06_Process_and_Traceability/03_TRACEABILITY.md` →
   `../docs/traceability.yaml`).
6. A story is **done** only when every AC has a passing test and traceability validates with zero orphans.
7. A phase is complete only when `just phase-complete-check NN` resolves every phase requirement and exit item.

## Reading order for a new agent

1. Repo `CLAUDE.md` (non-negotiable constraints + how work is tracked).
2. `00_Foundation/01_VISION_AND_SCOPE.md`, `04_DESIGN_DECISIONS.md`, `06_IMPLEMENTATION_STAGES.md`.
3. `02_Architecture/01_SYSTEM_ARCHITECTURE.md` (+ `08_LLM_INTEGRATION.md` for Stage 3).
4. `06_Process_and_Traceability/01_MODULE_INVENTORY.md` and `02_STORY_FORMAT.md`.
5. The current phase file in `07_Phases/`.
6. The specific `01_Product/` clause(s) the story cites, and the relevant `08_Decisions/ADR-*`.

## UI mockup (single source of truth)

`mockups/gomarkedit-mockup.html` is the **one** canonical visual reference — a single self-contained,
offline HTML file covering the entire UI: all three themes (Liquid Glass / Material / Minimal) ×
Auto/Light/Dark, and **every** state (editor split / editor-only / preview-only, reading/Viewer mode,
File/Settings/View/About menus, context menu, the AI assistant sidebar with agentic chat + apply-diff,
Settings dialog with all tabs incl. AI·Providers / AI·Context, Shortcuts & About dialogs, toasts, the
external-content banner, the drag-and-drop overlay + folder-conflict prompt, and a Design-tokens view).
A top Screen selector switches states; the **URL hash deep-links** a state as
`#<theme>-<mode>/<screen>` (e.g. `#material-light/settings-ai-providers`). **UI clauses cite this file
(optionally with a state hash) as the visual acceptance reference.** Normative token values are pinned in
`01_Product/10_THEMING.md#canonical-theme-tokens`. There are no other mockup files — this one supersedes
them to prevent drift.

## Definition of a successful implementation

When every phase's stories are `done` and traceability validates, the result is a fully working,
cross-platform Markdown editor that: opens/edits/saves `.md`/`.markdown`/`.mdown`/`.txt`; opens a folder
as a filtered workspace; renders GFM + extensions with Mermaid, KaTeX and code highlighting; formats and
lints; exports to PDF; registers as a Markdown file handler on all three OSes; ships three themes with
light/dark/auto; adds a Stage-3 agentic AI assistant with configurable local-or-remote providers; and
makes no background network calls — its only outbound requests are user-invoked LLM inferences to the
configured provider (local by default), with Stages 1–2 fully offline.
