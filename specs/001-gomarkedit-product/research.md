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

## Decision 2: Preserve the legacy specification as authority during migration

**Decision**: Treat `specs/001-gomarkedit-product/spec.md` as the consolidated index and product-stage
contract while the detailed clauses and surface shape in `docs/delivery/spec/` remain authoritative
until each group is copied and approved without loss.

**Rationale**: The constitution explicitly defines this migration boundary. The consolidated feature
maps all legacy sources but intentionally compresses details; assuming it silently supersedes them
would lose exact values and edge behavior.

**Alternatives considered**: Declare the Spec Kit feature immediately authoritative (rejected because
copy fidelity is not yet independently proven); keep two indefinitely equal authorities (rejected
because contradictions would be irresolvable).

## Decision 3: Fold engineering debt into the product slice that exposes it

**Decision**: Repair patch fan-out, empty-tab assumptions, mock parity, shell coverage, untranslated
labels, gate release paths, and other known gaps in the first user-observable slice that depends on the
seam. Create no generic debt, documentation, or traceability phase.

**Rationale**: This keeps work vertically testable and prevents bureaucracy from being mistaken for
product progress. It also provides a real integration caller for currently reserved infrastructure.

**Alternatives considered**: A cleanup phase before features (rejected because most repairs lack a
production consumer); ignore gaps until a failure occurs (rejected because the known failure modes
would invalidate later evidence).

## Decision 4: The current actionable frontier is theme completion

**Decision**: Finish the existing Phase 02 theme journey before opening new Viewer surfaces. The first
task-ready slice must resolve the Markdown-source versus embedded-code token ownership conflict and
obtain a reliable baseline before implementation.

**Rationale**: The repository already contains the palette foundation, generated-theme work, and
planned stories. Every later surface consumes those tokens. Current evidence records a governing
conflict and a previously unreliable baseline, both of which are hard stops rather than caveats.

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

## Resolved unknowns

There are no unresolved clarification markers in the technical context. Product-level values are
specified. Stage-local questions that depend on future implementation remain explicit entry-gate
blockers and are intentionally not converted into premature tasks.
