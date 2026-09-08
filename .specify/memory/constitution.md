<!--
Sync Impact Report
- Version change: template (unratified) -> 1.0.0
- Modified principles: none; this is the initial project constitution
- Added principles:
  - I. Normative Specification Is the Authority
  - II. Deliver Self-Contained Vertical Slices
  - III. Preserve Backend Authority and Explicit Boundaries
  - IV. Offline, Private, and Safe by Default
  - V. Protect Data and Cross-Platform Operation
  - VI. Accessible, Tokenized, and Coherent Interfaces
  - VII. Evidence Before Completion
- Added sections:
  - Product and Technical Constraints
  - Specification-Driven Delivery Workflow
- Removed sections: none
- Follow-up TODOs: none
-->
# GoMarkEdit Constitution

## Core Principles

### I. Normative Specification Is the Authority
`docs/delivery/spec/` and `docs/delivery/architecture/` define required product behaviour,
surface shape, technical boundaries, and quality constraints until their content is migrated into an
approved Spec Kit artifact. Implementation, plans, tasks, tests, and descriptive documentation MUST
conform to that authority. When a surface artifact and a feature rule disagree, the surface governs
shape and presentation while the feature rule governs behaviour. An accepted architecture decision
record MUST be superseded rather than silently rewritten. A requirement MUST NOT be weakened,
deleted, or reinterpreted to make implementation or a gate pass. A discovered contradiction or
impossible rule stops delivery until it is explicitly resolved and approved.

Rationale: specification-driven delivery is trustworthy only when implementation cannot quietly
rewrite its own acceptance criteria.

### II. Deliver Self-Contained Vertical Slices
Every feature increment MUST be a user-observable vertical slice through the necessary backend,
Wails bridge, frontend adapter, state projection, and interface layers. A buildable specification
MUST contain the complete owned requirements with their real values, applicable architecture rules,
exact code locations, dependencies, acceptance scenarios, and a named proving test for every rule.
Requirements MUST retain stable, human-readable anchors, and proving tests MUST identify the rule
they exercise. A task that requires the implementer to hunt through other normative files for missing
behaviour is not ready. Stub or unresolved work MUST NOT enter implementation.

Rationale: complete slices expose integration defects early and prevent truncated or context-dependent
requirements from producing convincingly incomplete software.

### III. Preserve Backend Authority and Explicit Boundaries
The Go backend MUST own canonical application state. Redux MUST remain a projection hydrated once and
updated by backend events; user interactions MUST cross the adapter as commands. Monaco MAY hold the
focused document's ephemeral working copy, but it MUST synchronize through the document command seam
and MUST NOT become a second canonical store. Only `frontend/src/logic/adapter/` may import generated
`wailsjs/` bindings, and bridge envelopes and arity checks MUST be centralized there.

Every Wails-bound handler MUST return one typed `apperr.*Result`, take no `context.Context`, use a
named result, and recover panics in its first statement. Handlers call their service only; services
accept lifecycle context and call repositories, operating-system APIs, or other service interfaces.
Concrete wiring MUST remain in the single application composition root. Architecture tests enforce
these boundaries and MUST never be suppressed or allowlisted away.

Rationale: one state owner and mechanically enforced seams prevent stale projections, untyped bridge
failures, dependency cycles, and process-killing boundary errors.

### IV. Offline, Private, and Safe by Default
The application MUST make no background or unsolicited network request, ship no telemetry,
auto-update check, remote asset, or crash upload, and keep logs local without secrets, full remote
URLs, or user home paths. Before assistant features exist, no outbound request is allowed. Assistant
requests MAY occur only after an explicit user action and only to the configured provider; the default
provider MUST remain local. Any other network behaviour requires an approved architecture decision.

Untrusted Markdown, HTML, paths, provider output, and tool arguments MUST be validated at their
boundary. Rendered document HTML MUST be sanitized according to the approved content policy. Internal
error causes and unsafe details MUST never cross the Wails bridge. Assets needed for editing,
rendering, themes, fonts, and localization MUST be bundled into the application.

Rationale: offline operation and local privacy are product promises, while strict boundary validation
protects files and users from hostile documents and remote content.

### V. Protect Data and Cross-Platform Operation
The shipped application MUST remain one CGO-free Wails v2 desktop binary using pure-Go SQLite.
Multiple application instances MUST be allowed; SQLite MUST use WAL mode and a busy timeout rather
than an application-wide instance lock. Database migrations MUST be additive and forward-only, and
generated database code and generated Wails bindings MUST never be hand-edited.

Documents MUST have stable identity independent of paths. File writes MUST be atomic, preserve
permissions and declared encoding characteristics, detect external modification, and flush the
working copy before saving or exporting. Unsaved work MUST be protected during close and shutdown.
Workspace mutations MUST remain additive-only unless a later approved decision and specification
define safe reconciliation. Every unbounded input MUST state a numeric bound and a visible refusal or
degradation outcome.

Rationale: a local editor earns trust by preserving bytes and user intent across failures, concurrent
windows, platforms, and large inputs.

### VI. Accessible, Tokenized, and Coherent Interfaces
Every visible surface and interaction MUST be usable with the keyboard, expose correct roles and
localized accessible names, show visible focus, provide specified empty, loading, error, cancellation,
and bounded-input states, and remain usable with long translated text and reduced motion. Every
user-visible string MUST come from the catalogue. Every colour MUST come from the centralized token
system and render correctly across all six theme and appearance combinations. Actions, shortcuts,
menus, tooltips, dialogs, and command-palette entries MUST derive from their single canonical
registries rather than duplicate labels or bindings.

Visible work MUST be exercised in the running interface at relevant viewports after a material change
and again before completion. The check MUST use actual controls and inspect visible state, authoritative
root attributes, focus, and affected layout. An observed defect MUST be fixed and rechecked.

Rationale: accessibility, localization, theming, and lifecycle states are part of feature correctness,
not optional polish.

### VII. Evidence Before Completion
No work may build on a gate that did not actually analyze its target. Before implementation, the
current state MUST be captured with every gate's exit code, raw output, and reliability verdict. A
non-zero gate that parsed no findings is unreliable and is a hard stop. Completion MUST compare fresh
results with that trustworthy baseline, while architecture tests MUST be fully green and never
baseline-diffed. Failing tests MUST NOT be deleted, skipped, narrowed, ignored, or commented out, and
quality configurations or hooks MUST NOT be weakened to manufacture a pass.

Automated tests MUST prove observable behaviour, including default wiring, failure, recovery, and
lifecycle paths, rather than symbol presence or copied requirement text. Mock-bridge browser tests
MUST be complemented by numbered live cases for real files, processes, platforms, providers, and the
built binary. Phase completion requires current code gates, traceability and specification checks,
individual inspection of named tests, and a walkthrough of the phase outcome on the real packaged
build. A green aggregate label alone is never evidence of completion.

Rationale: independent, reproducible evidence distinguishes working software from a workflow that
only reports success.

## Product and Technical Constraints

- GoMarkEdit is a native, offline, cross-platform Markdown editor delivered as one Go process with a
  Wails v2 webview and an embedded React/TypeScript frontend. A server, daemon, mandatory account, or
  background companion process is outside the product boundary.
- Go, Wails, React, TypeScript, Monaco, SQLite, Markdown processing, sanitization, and test-tool
  versions MUST remain pinned in their existing authoritative manifests. An upgrade is planned and
  verified work, not a descriptive edit.
- Application state, settings, documents, errors, rendering, files, and long-running operations MUST
  follow the accepted architecture decisions and matching rules applicable to their paths.
- A long operation MUST expose progress and cancellation, use the shared gate or run registry required
  by its contract, and report only work that actually completed. Cancellation is a normal outcome.
- Security, privacy, accessibility, localization, theme, performance-bound, and offline constraints
  apply in every feature increment rather than being deferred to a cleanup phase.
- Production paths MUST contain no placeholder, stub, or no-op. Complexity, a new outbound request, a
  new state owner, a changed persistence model, or a new cross-layer bypass requires an explicit
  architecture decision before implementation.

## Specification-Driven Delivery Workflow

1. Specify user outcomes, edge cases, measurable limits, acceptance scenarios, and authority
   boundaries before planning implementation. Unanswered questions remain explicit and block the
   affected work.
2. Plan one dependency-ordered vertical slice at a time. The plan MUST map every in-scope requirement
   to exactly one owning task and MUST identify applicable architecture constraints and test evidence.
3. Capture a trustworthy baseline before the first implementation edit. Implement only the approved
   scope and declared paths; any necessary path expansion or requirement decision MUST be reported.
4. Verify every acceptance scenario and rule with named automated evidence, then perform required live
   interaction checks for visible or platform-dependent work. Record commands, results, and remaining
   limitations without converting caveats into a pass.
5. At a phase gate, inspect named tests, run all current quality and specification checks, and walk the
   phase outcome on the real build. A phase is either finished or not finished.
6. Reconcile shipped behaviour against the governing specification before starting the next phase.
   Resolve each difference as a code defect, an explicitly approved specification amendment, or an
   unanswered question. Never rewrite historical work to make it appear complete.

## Governance

This constitution governs all Spec Kit specifications, plans, tasks, implementation, reviews, and
delivery evidence for GoMarkEdit. During migration, the existing normative material under
`docs/delivery/spec/` and `docs/delivery/architecture/` remains authoritative unless an approved
Spec Kit artifact explicitly replaces it without losing requirements or traceability. If a workflow
document, task, implementation shortcut, or descriptive document conflicts with this constitution,
this constitution wins; a more specific normative product or architecture rule wins where it adds
constraints without contradicting a constitutional principle.

Amendments require a written proposal that identifies the affected principles, the reason, migration
impact, and evidence that no normative requirement was silently dropped. Approval MUST precede the
edit. Each amendment MUST update the Sync Impact Report, version, and amendment date. Semantic
versioning applies: MAJOR for incompatible removal or redefinition of governance, MINOR for a new
principle or material expansion, and PATCH for non-semantic clarification. The ratification date never
changes.

Every specification and plan review MUST include a constitution check. Every implementation review
MUST verify applicable principles using current command output and direct inspection, with deviations
rejected or documented in an approved amendment before merge. `AGENTS.md` defines repository working
instructions, and the active Spec Kit commands define artifact mechanics; neither may override this
constitution. The constitution itself is updated only through the constitution workflow.

**Version**: 1.0.0 | **Ratified**: 2026-07-30 | **Last Amended**: 2026-07-30
