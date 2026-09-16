<!--
Sync Impact Report
- Version change: 2.0.0 -> 2.1.0 (MINOR: Principle VII materially expanded)
- Modified principles:
  - VII. Evidence Before Completion: (a) a behaviour unreachable through public interfaces may keep
    an in-package `_test.go` test beside the code, listed with its reason in the feature plan and
    enforced by the lint stage, with no export shim or test-only parameter (carries Feature 004
    FR-023, owner decision D3); (b) the feature that creates `scripts/baseline` runs it immediately
    after creating the entry-point scripts, before any other implementation edit (Feature 004
    FR-064) — mirrored in Specification-Driven Delivery Workflow step 3
- Added principles: none
- Added sections: none
- Removed sections: none
- Templates: Spec Kit templates are owned by the Spec Kit CLI and untouched. AGENTS.md and
  CLAUDE.md are rewritten by Feature 004 (FR-077); until then they conflict with I, II and VII.
- Follow-up TODOs: none
- Previous report (1.0.0 -> 2.0.0, 2026-09-08): authority, anchor and baseline governance redefined;
  Principle VIII added; see git history.
-->
# GoMarkEdit Constitution

## Core Principles

### I. One Authority: the Feature Specs and the Architecture Map
The active feature's artifacts under `specs/<feature>/` (`spec.md`, `plan.md`, `tasks.md`) and the
architecture map `docs/architecture.md` together define required product behaviour, technical
boundaries, ownership of shared behaviour and durable decisions. Nothing else is normative.
Implementation, plans, tasks, tests and descriptive documentation MUST conform to them. Earlier
feature specs stay authoritative for the behaviour they accepted until a later spec or a recorded
decision supersedes them. A decision recorded in the architecture map MUST be superseded by a new
entry rather than silently rewritten. A requirement MUST NOT be weakened, deleted or reinterpreted
to make an implementation or a verification stage pass. A discovered contradiction or impossible
rule stops the affected work until the owner resolves it.

Rationale: specification-driven delivery is trustworthy only when one place says what the product
must do and implementation cannot quietly rewrite its own acceptance criteria.

### II. Specify in EARS, Deliver Vertical Slices
Every feature increment MUST be a user-observable vertical slice through the backend, the Wails
bridge, the frontend adapter, the state projection and the interface layers it needs. Every
requirement MUST be one sentence in EARS form (ubiquitous "shall"; "When" for an event; "While" for
a state; "If ... then" for an unwanted condition; "Where" for an option) with concrete values and
numeric bounds, and every acceptance scenario MUST be written as Given / When / Then. A test title
MUST be a sentence describing the behaviour under test, in the same event-condition-response shape,
and MUST NOT contain a task or requirement identifier; where a mapping to requirements is kept, it
lives in a comment or an external table. A buildable specification contains the complete owned
requirements, the applicable boundaries, dependencies and acceptance scenarios; a task that makes
the implementer hunt through other files for missing behaviour is not ready, and stub or unresolved
work MUST NOT enter implementation.

Rationale: complete slices expose integration defects early; EARS sentences and behaviour-sentence
test titles make requirements and their evidence readable without a traceability generator.

### III. Preserve Backend Authority and Explicit Boundaries
The Go backend MUST own canonical application state. Redux MUST remain a projection hydrated once
and updated by backend events; user interactions MUST cross the adapter as commands carrying a
request identity. Monaco MAY hold the focused document's ephemeral working copy, but it MUST
synchronize through the document command seam and MUST NOT become a second canonical store. Only
`frontend/src/logic/adapter/` may import generated `wailsjs/` bindings, and bridge envelopes and
arity checks MUST be centralized there. Files under `ui/primitives` and `ui/components` MUST NOT
import the store, the adapters or the action registry.

Every Wails-bound handler MUST return one typed result envelope, take no `context.Context`, use a
named result and recover panics through the one shared guard helper. Handlers call their service
only; services accept lifecycle context and call repositories, operating-system APIs or other
service interfaces. Concrete wiring MUST remain in the single application composition root; test
needs are met by constructor options or ports wired there, never by test-only setters, constructors
or package-level swap variables in production code. The lint stage enforces these boundaries and
MUST never be suppressed or allowlisted away.

Rationale: one state owner and mechanically enforced seams prevent stale projections, untyped bridge
failures, dependency cycles and process-killing boundary errors.

### IV. Offline, Private, and Safe by Default
The application MUST run without internet: it MUST make no background or unsolicited network
request, ship no telemetry, auto-update check, remote asset or crash upload, and keep logs local
without secrets, full remote URLs or user home paths. Content that a document references from the
web MAY load only under the user's remote-content setting; assistant requests MAY occur only after
an explicit user action and only to the configured provider, and the default provider MUST remain
local. Any other network behaviour requires a decision recorded in the architecture map.

Untrusted Markdown, HTML, paths, provider output and tool arguments MUST be validated at their
boundary. Rendered document HTML MUST be sanitized according to the approved content policy. A
preview link MUST pass through the one shared link handler, which opens only in-document anchors,
local Markdown inside the document's folder and `https`/`http` targets, and visibly refuses every
other target. Internal error causes and unsafe details MUST never cross the Wails bridge. Assets
needed for editing, rendering, themes, fonts and localization MUST be bundled into the application.

Rationale: offline operation and local privacy are product promises, while strict boundary
validation protects files and users from hostile documents and remote content.

### V. Protect Data and Cross-Platform Operation
The shipped application MUST remain one Wails v2 desktop binary whose Go backend and SQLite driver
are CGO-free (the desktop artifact links the platform webview, and the CGO-free check is scoped to
the backend and SQLite). Multiple application instances MUST be allowed; SQLite MUST use WAL mode
and a busy timeout rather than an application-wide instance lock. Database migrations MUST be
additive and forward-only, and generated database code and generated Wails bindings MUST never be
hand-edited.

Documents MUST have stable identity independent of paths. File writes MUST be atomic, preserve
permissions and declared encoding characteristics, detect external modification and flush the
working copy before saving or exporting; results MUST be applied in the order the writes were
committed. Unsaved work MUST be protected during close and shutdown, and a timeout alone MUST never
authorise discarding it. Workspace mutations MUST remain additive-only unless a later recorded
decision and specification define safe reconciliation. Every unbounded input MUST state a numeric
bound and a visible refusal or degradation outcome. An error on a user-visible path MUST be
surfaced to the user or logged with a stated reason, never discarded.

Rationale: a local editor earns trust by preserving bytes and user intent across failures,
concurrent windows, platforms and large inputs.

### VI. Accessible, Tokenized, and Coherent Interfaces
Every visible surface and interaction MUST be usable with the keyboard, expose correct roles and
localized accessible names, show visible focus that composes with elevation, provide specified
empty, loading, error, cancellation and bounded-input states, and remain usable with long
translated text and reduced motion. Every user-visible string MUST come from the catalogue. Every
colour MUST come from the centralized token system and render correctly across all six theme and
appearance combinations; a theme changes appearance, never behaviour, and no widget stylesheet may
select on theme or mode. Actions, shortcuts, menus, tooltips, dialogs and command-palette entries
MUST derive availability, shortcuts and labels from the one action registry rather than duplicate
them.

Visible work MUST be exercised in the running interface at relevant viewports after a material
change and again before completion, using actual controls and inspecting visible state, root
attributes, focus and affected layout. An observed defect MUST be fixed and rechecked.

Rationale: accessibility, localization, theming and lifecycle states are part of feature
correctness, not optional polish.

### VII. Evidence Before Completion
Verification is six stages (Lint, Format check, Build, Unit, Integration, End-to-end) run through
the shared entry-point scripts; hooks, CI and local runs MUST call the same scripts. Before the
first implementation edit of a feature, `scripts/baseline` MUST be run once to record the commit,
tool versions and every stage's exit code (the feature that creates `scripts/baseline` runs it
immediately after creating the entry-point scripts, before any other implementation edit); before
the feature closes, a fresh run MUST be compared
against that baseline, and a stage that exited non-zero having analysed nothing is unreliable and
MUST be fixed before anything builds on it. Failing tests MUST NOT be deleted, skipped, narrowed,
ignored or commented out, and quality configurations, hooks or lint rules MUST NOT be weakened to
manufacture a pass.

Tests MUST live in the test roots apart from production code and prove observable behaviour
through public interfaces, including default wiring, failure, recovery and lifecycle paths, except
that a behaviour unreachable through public interfaces MAY keep an in-package `_test.go` test
beside the code, each exception listed with its reason in the feature plan and enforced by the lint
stage; no export shim or test-only parameter may be added for it. A test
MUST NOT assert source text, CSS text, DTO field order, struct shape or the content of a
specification or documentation file; production code MUST carry no test-only branch, hook, port or
build flavour. The end-to-end stage MUST drive the real application process; a defect fix MUST
come with a regression test that fails on the previous code and passes on the fix. Completion of a
feature requires the six stages green against the baseline, every acceptance scenario proven by a
named test or a recorded walkthrough of the packaged build, and no per-rule, per-file or per-task
test quota stands in for that judgment. A green aggregate label alone is never evidence.

Rationale: independent, reproducible evidence distinguishes working software from a workflow that
only reports success.

### VIII. One Implementation per Behaviour (DRY, KISS, SOLID)
A common behaviour or style MUST have exactly one implementation that every consumer uses, so that
changing it is a one-place change. Before adding code, the implementer MUST find the existing owner
of the behaviour and its consumers and improve that owner; a second copy of a popup, bar, button,
dialog, guard, error wrapper or repository access path MUST NOT be created. Every part MUST have one
responsibility with an identifiable owner, depend on interfaces at its boundaries and stay open to
extension without modification of its consumers. The simplest design that meets the requirement
MUST be preferred; speculative abstraction and dead code MUST be removed. A change to appearance
(tokens, radii, shadows, icons) MUST never change behaviour, and a behaviour change approved for one
consumer MUST be recorded as a decision, never made silently in a shared component. Comments MUST
state the current contract and non-obvious rules, never task numbers or history. Mechanical
conventions (formatting, syntax, import boundaries, colour tokens) MUST have one executable owner in
the format, lint or build stage instead of a prose rule.

Rationale: every visible drift in the first three features came from a copy that diverged; one
owner per behaviour keeps the product coherent and makes the next feature cheaper.

## Product and Technical Constraints

- GoMarkEdit is a native, offline, cross-platform Markdown editor delivered as one Go process with a
  Wails v2 webview and an embedded React/TypeScript frontend. A server, daemon, mandatory account or
  background companion process is outside the product boundary.
- Go, Wails, React, TypeScript, Monaco, SQLite, Markdown processing, sanitization and test-tool
  versions MUST remain pinned in their authoritative manifests, and the Node, Go and Wails CLI
  versions MUST be declared in the one place shared by local runs, hooks and CI. An upgrade is
  planned and verified work, not a descriptive edit.
- Application state, settings, documents, errors, rendering, files and long-running operations MUST
  follow the owners and decisions recorded in the architecture map.
- A long operation MUST expose progress and cancellation and report only work that actually
  completed. Cancellation is a normal outcome. A backend call with no native dialog MUST be reported
  as stuck after its declared bound, with Retry replaying the same request identity.
- Security, privacy, accessibility, localization, theme, performance-bound and offline constraints
  apply in every feature increment rather than being deferred to a cleanup phase.
- Production paths MUST contain no placeholder, stub or no-op. A new outbound request, a new state
  owner, a changed persistence model or a new cross-layer bypass requires a decision recorded in the
  architecture map before implementation.

## Specification-Driven Delivery Workflow

1. Specify user outcomes, edge cases, measurable limits and acceptance scenarios in EARS form before
   planning implementation. Unanswered questions remain explicit and block only the affected work;
   routine, reversible choices are made by the implementer and need no permission.
2. Plan one dependency-ordered feature at a time. The plan MUST give every in-scope requirement an
   owning task, identify the applicable boundaries and name the evidence for each acceptance
   scenario. No rule-count, branch-per-file or per-rule-test quota applies.
3. Run `scripts/baseline` once before the first implementation edit (the feature that creates
   `scripts/baseline` runs it immediately after creating the entry-point scripts, before any other
   implementation edit). Implement the approved scope;
   report any necessary scope expansion or requirement decision instead of resolving it in code.
4. Verify through the six stages with `scripts/verify`, then perform the live interaction checks
   required for visible or platform-dependent work. Record commands, results and remaining
   limitations without converting a caveat into a pass.
5. Close a feature only when the stages are green against the baseline, every acceptance scenario
   has named evidence, the packaged build has been walked for the feature outcome, and the
   architecture map records the feature's durable decisions. A feature is either finished or not.
6. Reconcile shipped behaviour against the specification before starting the next feature. Resolve
   each difference as a code defect, an approved specification amendment or an open question. Never
   rewrite historical work to make it appear complete.

## Governance

This constitution governs all Spec Kit specifications, plans, tasks, implementation, reviews and
delivery evidence for GoMarkEdit. The normative material is `specs/<feature>/` and
`docs/architecture.md`; archived trees under `docs/_archive-*` are reference only. If a workflow
document, task, implementation shortcut or descriptive document conflicts with this constitution,
this constitution wins; a more specific normative product or architecture rule wins where it adds
constraints without contradicting a constitutional principle.

Amendments require a written proposal that identifies the affected principles, the reason,
migration impact and evidence that no normative requirement was silently dropped. Approval MUST
precede the edit. Each amendment MUST update the Sync Impact Report, version and amendment date.
Semantic versioning applies: MAJOR for incompatible removal or redefinition of governance, MINOR for
a new principle or material expansion, and PATCH for non-semantic clarification. The ratification
date never changes.

Every specification and plan review MUST include a constitution check. Every implementation review
MUST verify applicable principles using current command output and direct inspection, with
deviations rejected or documented in an approved amendment before merge. `AGENTS.md` defines
repository working instructions, and the active Spec Kit commands define artifact mechanics;
neither may override this constitution. The constitution itself is updated only through the
constitution workflow.

**Version**: 2.1.0 | **Ratified**: 2026-07-30 | **Last Amended**: 2026-09-09
