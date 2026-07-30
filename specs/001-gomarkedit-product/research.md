# Phase 0 Research: GoMarkEdit Product Planning

## Decision 1: Plan progressively, not as an 80-requirement ticket dump

**Decision**: Keep the whole product in one architectural plan, but generate detailed implementation
tasks for only the next dependency-complete vertical slice. Represent later work as stage-level
capability groups and explicit entry gates.

**Rationale**: The product is one dependency chain, yet the current code exposes only a limited editor
and theme frontier. Detailed tickets for file lifecycle, packaging, providers, and chat would freeze
interfaces before their real consumers exist and would conceal unresolved contracts behind apparent
precision.

**Alternatives considered**: Generate all tasks now (rejected as overplanning); split into four
unrelated specifications (rejected because document identity, rendering, settings, proposals, and
evidence are shared); continue the legacy phase plan unchanged (rejected because it predates the
consolidated requirement and current blocked-state evidence).

## Decision 2: Transfer initial-spec authority requirement by requirement

**Decision**: Treat `specs/001-gomarkedit-product/spec.md` as the consolidated index and product-stage
contract. A clause in `docs/delivery/` remains authoritative until its complete behavior, values, edge
cases, and evidence are mapped without loss and explicitly approved in Spec Kit. Approval transfers
only that requirement, not its whole source file.

**Rationale**: The constitution explicitly defines this migration boundary. The consolidated feature
maps all legacy sources but intentionally compresses details; assuming it silently supersedes them
would lose exact values and edge behavior.

**Alternatives considered**: Declare the Spec Kit feature immediately authoritative (rejected because
copy fidelity is not yet independently proven); keep two indefinitely equal authorities (rejected
because contradictions would be irresolvable).

## Decision 3: Repair actionable foundation defects, then fold consumer debt into its first slice

**Decision**: The first Spec Kit implementation phase repairs specification contradictions, unreliable
gates, superseded workflow validators, and independently verifiable foundation defects. Patch fan-out,
empty-tab assumptions, mock parity, shell coverage, untranslated labels, gate release paths, and other
consumer-dependent gaps belong to the earliest user-observable slice that exercises the seam. Create
no generic debt, documentation application, or replacement traceability system.

**Rationale**: This keeps work vertically testable and prevents bureaucracy from being mistaken for
product progress. It also provides a real integration caller for currently reserved infrastructure.

**Alternatives considered**: A cleanup phase before features (rejected because most repairs lack a
production consumer); ignore gaps until a failure occurs (rejected because the known failure modes
would invalidate later evidence).

## Decision 4: The current actionable frontier is theme completion

**Decision**: Finish the existing appearance journey before opening new Viewer surfaces. The conflict
is resolved by generating language-qualified Monaco rules: Markdown tokens use the bundled `.md`
postfix and embedded Go tokens use `.go`, including qualified descendants. Capture a reliable current
baseline before implementation.

**Rationale**: The repository already contains the palette foundation and a partial generator. Every
later surface consumes those tokens. The installed Monaco grammars already emit the required postfixes,
so qualification preserves both initial-spec palettes without another tokenizer or arbitrary colour
precedence. Current formatting and lint findings are reliable baseline inputs, not reasons to pretend
the partial work is complete.

**Alternatives considered**: Start the launcher/window shell in parallel (rejected because it would
build new surfaces on incomplete visual contracts); skip generated Monaco themes (rejected because
Monaco cannot consume CSS variables and split-view coherence is required).

## Decision 5: Viewer completes the read journey before Editor expands mutation

**Decision**: Within the new product stages, establish safe real-file identity/open/tab behavior before
complete rendering and OS integration; complete the Viewer journey before planning broad Editor
mutation features.

**Rationale**: Rendering assets, reading mode, OS opens, Assistant reads, save, and workspaces all need
stable document identity and bounded file access. The present in-memory single-document assumption
cannot safely support them.

**Alternatives considered**: Port the legacy phase numbers literally (rejected because the new Viewer
stage cuts across them); build rich rendering before real file boundaries (rejected because local
assets and size policies would be mocked or redesigned).

## Decision 6: Contracts describe behavior and authority, not speculative APIs

**Decision**: Phase 1 contracts define application-state ownership, command/acknowledgement invariants,
and stage entry/exit gates. They do not invent future Wails method names, DTO fields, SQL tables,
provider interfaces, or React component trees.

**Rationale**: Those concrete interfaces should be chosen by the first implementing slice, with its
actual dependencies and tests visible. Behavioral contracts are stable enough to constrain every
implementation without overplanning it.

**Alternatives considered**: Full future API schemas now (rejected as premature); no contracts for a
desktop application (rejected because the Go/Wails/frontend and product-stage boundaries are external
interfaces from each layer's perspective).

## Decision 7: Evidence follows behavior; it is not a separate product feature

**Decision**: Each slice carries named automated evidence plus live/native cases that mocks cannot
prove. Requirement mapping is maintained as planning metadata and review evidence, not implemented as
runtime code or a standalone documentation-validation ticket.

**Rationale**: The constitution requires evidence and traceability but warns that green labels and
symbol checks do not prove behavior. Existing unreliable and retired tags demonstrate the danger of
measuring documentation rather than outcomes.

**Alternatives considered**: Build a new traceability application/gate first (rejected as bureaucracy);
omit mappings (rejected because missing ownership is how requirements disappear).

## Decision 8: Reuse pinned dependencies until a slice proves a gap

**Decision**: Retain the versions in `go.mod` and `frontend/package-lock.json`. Research and approve a
new library only when the first slice needing it can demonstrate that existing facilities cannot meet
the governing contract.

**Rationale**: The constitution requires planned, verified upgrades and the user explicitly asked to
avoid decisions for implementation that does not exist.

**Alternatives considered**: Preselect full Markdown, formatter, PDF, tokenizer, and provider stacks
now (rejected because it creates lock-in without integration evidence).

## Decision 9: Replace legacy planning validation, retain correctness evidence

**Decision**: Remove `spec-check`, `story-check`, and the scripts that validate legacy documentation
shape, copied story rules, upgrade markers, and historical `Proves:` references. Keep product tests,
architecture enforcement, formatting, type checking, linting, builds, baseline reliability,
mock-browser journeys, live checks, and real-build walkthroughs.

**Rationale**: Spec Kit now owns planning artifacts and task structure. Running two planning systems
creates false blockers and encourages tickets whose output is documentation validation. Correctness
gates analyze production behavior and architectural safety, so they remain essential even though
standard Spec Kit does not prescribe them.

**Alternatives considered**: Remove every non-Spec-Kit check (rejected because it would discard product
and architecture evidence); keep all legacy checks (rejected because obsolete story-copy and retired
traceability rules would continue controlling the new workflow).

## Decision 10: Preserve verified code, do not rebuild from status labels

**Decision**: For each authorized slice, inspect its current production path and direct tests. Preserve
conforming behavior, repair partial or defective behavior, implement missing behavior, and treat an
unreliable gate as unknown. Historical completion labels are never proof.

**Rationale**: The repository contains substantial working foundations and also partial implementations
whose green labels overstate their journeys. Evidence-based classification avoids both destructive
rewrites and optimistic gap hiding.

**Alternatives considered**: Rebuild everything (rejected as wasteful and risky); accept all existing
code as delivered (rejected because known gaps and mock-only evidence would survive).

## Decision 11: Use an acknowledged theme-only startup mirror

**Decision**: After the backend acknowledges a theme or appearance write, update a theme-only browser
mirror. A blocking script in `frontend/index.html` reads only that mirror before CSS paints, resolves
Auto using the current system preference, and applies `data-theme` plus resolved `data-mode`. SQLite
remains authoritative and normal startup reconciliation corrects a missing or stale mirror.

**Rationale**: The initial specification explicitly permits this mechanism. It is implementable with
the current settings seam, avoids inventing a Wails asset-injection service, and supplies the only
frontend-readable value early enough to prevent a default-palette frame.

**Alternatives considered**: Inject values through a new asset server (rejected for this slice because
no such boundary exists); wait for `GetSettings` after React mounts (rejected because it guarantees a
flash); make the mirror authoritative (rejected because SQLite owns durable settings).

## Decision 12: Stop detailed planning after the complete appearance journey

**Decision**: The next `tasks.md` may cover migration-foundation support and the complete appearance
journey only. Launcher/window-shell work remains the next capability group but is not decomposed until
appearance is implemented, live-verified, and reconciled.

**Rationale**: Theme generation, current settings commands, root attributes, Monaco setup, and startup
HTML are present seams with measurable outcomes. The next shell surfaces consume the finished token
contract; detailing them now would mix two dependency layers and hide what the first batch must prove.

**Alternatives considered**: Task the whole Viewer stage (rejected as premature); task only the
generator repair (rejected because it would not deliver the user-observable Auto/first-paint journey).

## Resolved unknowns

There are no unresolved clarification markers in the technical context. The five clarification
decisions from 2026-07-30 are incorporated above. Stage-local questions that depend on future
implementation remain explicit entry-gate blockers and are intentionally not converted into tasks.
