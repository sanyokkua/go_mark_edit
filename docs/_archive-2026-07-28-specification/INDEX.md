# GoMarkEdit — Specification (Index)

> **Archived 2026-07-28 — historical, not normative.** The live specification is `../delivery/`.
> This folder is kept only so that a citation in an accepted decision record or an archived story
> still resolves to the text it was written against. Nothing here is maintained; where it disagrees
> with `../delivery/spec/` or `../delivery/architecture/`, those win. Do not write new work against
> it.

GoMarkEdit is a native, **offline-first** desktop **Markdown editor & viewer** for Windows, macOS and
Linux, built with **Wails v2** (Go backend + React/TypeScript frontend). This folder describes what the
app should be.

> **Target stack:** Wails v2 · Go 1.25+ · React 19 · Vite · TypeScript · SQLite (modernc, pure-Go)
> **Product:** MIT · Open source · No telemetry · No auto-update

---

## Where to start

**If you want to know what the app does**, read `01_Product/`. It is prose, it names user-visible
behaviour, and it is the real specification. Everything else supports it.

**If you want to know what it looks like**, open `mockups/gomarkedit-mockup.html` in a browser. One
self-contained offline file, 23 screens, all three themes in light and dark. It answers more questions
in two minutes than any amount of reading.

**If you want to know what to build next**, this is no longer the place. Read
`../delivery/plan/roadmap.md` and then the phase it points at. The `07_Phases/` documents this file
used to point at were deleted rather than archived; that set is in git at `e1bd33f`.

## Sections

```
specification/
  INDEX.md              ← you are here
  00_Foundation/        vision & scope, glossary, personas, the locked design decisions (DD-NN),
                        and the F1–F10 forward-compatibility constraints
  01_Product/           what the app does, per feature area. 01–13 are the app; 14–18 are the AI
                        assistant; 19 onward continue the app-level series (sanitization & CSP,
                        notifications & empty states). Numbering is append-only — a document is never
                        renumbered, because clauses are cited by path.
  02_Architecture/      module inventory, system, backend (Go), frontend (React), Wails, state and
                        persistence, error handling, large files & concurrency, LLM integration
  03_NonFunctional/     quality attributes, performance, security & privacy, offline, accessibility
  04_Build_and_Release/ build matrix, packaging & file associations, CI & git hooks, versioning,
                        icons and the release pipeline
  05_Dependencies/      Go deps, frontend deps, and the policy for adding one
  08_Decisions/         the initial architecture decision records, ADR-0001…0012
  assets/icon/          the canonical app-icon source and its processing pipeline
  mockups/              gomarkedit-mockup.html — the visual reference
```

Decisions made _during_ implementation live outside this folder, in `../docs/adr/` (ADR-0013 onward).
Stories live in `../docs/stories/`.

## Reference convention

- Cross-references inside `specification/` are relative to this root — e.g.
  `02_Architecture/01_SYSTEM_ARCHITECTURE.md`, `mockups/gomarkedit-mockup.html`.
- References to the working area use `../docs/...`.
- ADRs are citable by id (`ADR-0007`) wherever they live.

## How work gets done

1. Read the next phase in `../delivery/plan/`. It says, in plain language, what the user gets and
   what to build in what order.
2. Answer the phase's **Questions to settle first**. Each answer edits the relevant `01_Product/` file,
   or becomes an ADR in `../docs/adr/` when it constrains the architecture.
3. Write one story per step, in the format in `../docs/stories/README.md`. A story is **fully worded** —
   someone who has never opened this folder can read it and know what the app will do.
4. Build one story per session. Every acceptance criterion gets its own test.
5. The phase is finished when a person uses the app and its **Done when** paragraph is true.

There is no completion validator, no evidence file, and no generated traceability record. That
machinery existed until 2026-07-25; it validated the shape of documents rather than the behaviour of
the application, and it grew larger than the code it governed.

## A note on this folder's status

It used to be frozen and read-only, with changes recorded only as new documents elsewhere. That rule
produced contradictions nobody could fix: two documents giving opposite answers under the same id, a
delivery model whose first stage could never complete, and 30 recorded conflicts left standing because
resolving one would have meant editing the spec.

**This folder is now editable.** When you find a contradiction, fix it here, and record the reasoning
in an ADR if the decision is architecturally significant. Keep it true rather than keeping it frozen.

## What a finished product looks like

A cross-platform Markdown editor that opens, edits and saves `.md`, `.markdown`, `.mdown` and `.txt`;
opens a folder as a filtered workspace; renders GFM plus maths, diagrams and code highlighting; formats
and lints; exports to PDF; registers as the system Markdown handler; ships three themes in light and
dark; and includes an AI assistant you point at a local or remote provider.

It makes **no background network calls**. Its only outbound request is one you triggered, to the
provider you configured — and the default provider is local, so a default install never leaves the
machine.
