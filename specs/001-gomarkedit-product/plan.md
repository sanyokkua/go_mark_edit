# Implementation Plan: GoMarkEdit Product

**Branch**: `001-gomarkedit-product` | **Date**: 2026-07-30 | **Spec**: [spec.md](spec.md)

**Input**: Consolidated product requirements from `specs/001-gomarkedit-product/spec.md`, with
`docs/delivery/spec/` and `docs/delivery/architecture/` remaining authoritative until migration is
approved requirement by requirement. `docs/delivery/plan/` is sequencing evidence and a source of
known risks, not the new plan's authority.

## Summary

Deliver GoMarkEdit as four cumulative product stages: Viewer, Editor, Assistant actions, then Assistant
chat. Preserve the existing Wails/Go/React foundation and advance through dependency-ordered,
user-observable vertical slices. The plan deliberately does not create a complete ticket backlog now.
Only the next slice whose dependencies, contracts, and acceptance evidence exist may be decomposed into
tasks. Later work remains at stage and capability-group granularity until the preceding stage exposes
the real integration seams.

The immediate implementation frontier is completion of the six-palette theme system already in
progress: resolve the governing Markdown-versus-embedded-code token contract, capture a trustworthy
baseline, generate and apply Monaco palettes, follow system appearance, prevent first-paint flash, and
prove the 18 visual combinations. Work beyond that frontier is ordered below but is not task-ready.

## Technical Context

**Language/Version**: Go 1.25.7; TypeScript 5.8.3; React 19.1.1

**Primary Dependencies**: Wails v2.12.0, React, Redux Toolkit, Monaco Editor, React Markdown,
remark-gfm, rehype-sanitize, modernc.org/sqlite, Goose, zerolog

**Storage**: Local files plus a CGO-free SQLite key/value settings store using WAL mode, busy timeout,
and additive forward-only migrations

**Testing**: Go tests and race tests; Jest and Testing Library; Playwright against the development
bridge mock; architecture tests; generated-artifact checks; story baseline/verification gates; live
checks in the running interface and real-build phase walkthroughs

**Target Platform**: Native macOS, Windows, and Linux desktop applications; one Wails process per
window; minimum usable window 375 x 480 px

**Project Type**: Single-process desktop application with a Go backend and embedded React webview

**Performance Goals**: Visible typing/caret response within about 16 ms; live preview 150-300 ms after
typing pauses at or below 2 MB; bounded operations expose progress and cancellation after about 500 ms

**Constraints**: Offline and private by default; no telemetry or background networking; CGO-free;
backend-authoritative state; typed Wails results; only the adapter imports generated bindings; atomic
file writes; six tokenized palettes; complete keyboard, localization, accessibility, and reduced-motion
behavior; numeric bounds from FR-010

**Scale/Scope**: Up to 40 open documents, 50 MB per opened file, 20,000 workspace entries, 12 folder
levels, 1,000 displayed search/palette results, and 1,000 decorated lint findings; four cumulative
product stages and 80 functional requirements

## Constitution Check

_GATE: Passed before Phase 0 research; passed again after Phase 1 design._

| Principle                  | Planning gate                                                                                                                                               | Result |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Normative authority        | No migrated artifact weakens `docs/delivery/spec/` or architecture rules; contradictions stop the affected slice.                                           | PASS   |
| Vertical slices            | Each implementation increment crosses only the layers needed for an observable outcome and owns complete requirements plus proving evidence.                | PASS   |
| Backend authority          | Go remains canonical; Redux is a projection; Monaco is an identity-bound working copy; bridge imports and handlers retain their enforced boundaries.        | PASS   |
| Offline, private, safe     | No network work is planned before explicit provider or remote-asset actions; untrusted content is validated and sanitized at boundaries.                    | PASS   |
| Data and platforms         | File identity, atomic writes, multi-instance SQLite, additive migrations, CGO-free builds, and numeric refusal/degradation limits are design inputs.        | PASS   |
| Accessible coherent UI     | Strings, tokens, focus, keyboard access, lifecycle states, responsive widths, and live checks travel with each visible slice.                               | PASS   |
| Evidence before completion | Baselines must be reliable, architecture tests green, mock evidence supplemented by live/real-build cases, and historical labels are not accepted as proof. | PASS   |

No constitutional exception is required. Documentation validators are quality gates, not product
increments and must not become standalone implementation tickets. A documentation defect is repaired
only when it blocks trustworthy delivery or when the governing migration explicitly owns it.

## Project Structure

### Documentation (this feature)

```text
specs/001-gomarkedit-product/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── application-state.md
│   ├── command-boundaries.md
│   └── delivery-stages.md
└── tasks.md                 # created later by /speckit-tasks; not created by this plan
```

### Source Code (repository root)

```text
main.go                      # Wails composition root
internal/
├── appmodel/                # canonical documents, tabs, workspace, layout
├── application/             # lifecycle context
├── apperr/                  # typed boundary errors and result envelopes
├── bootstrap/               # startup sequencing
├── db/                      # SQLite and generated query code
├── file/                    # platform paths; later safe document I/O
├── gate/                    # shared long-operation exclusion
├── logging/                 # local redacted logs
└── settings/                # typed settings service and persistence

frontend/src/
├── logic/
│   ├── adapter/             # only generated-Wails import boundary
│   ├── hooks/               # editor synchronization and commands
│   ├── markdown/            # one rendering interpretation
│   ├── store/               # backend state projection only
│   └── theme/               # preference resolution and root application
├── ui/
│   ├── components/
│   ├── primitives/
│   ├── styles/              # sole authored color-token source
│   └── widgets/
├── dev/bridge-mock/         # Playwright/dev parity implementation
└── i18n/                    # stable namespaced catalogue

frontend/e2e/                # mock-bridge browser journeys
docs/delivery/plan/testing/  # numbered native/platform/live cases
```

**Structure Decision**: Extend the established single Wails application by vertical capability. Do
not create a server, a second frontend state owner, a parallel renderer, or speculative packages for
future Assistant work. Create a new package only when the first production slice gives it a concrete
caller and boundary.

## Delivery Strategy

### Planning unit and readiness rule

A task set is generated for one vertical slice only when all of the following are true:

1. Every owned requirement and applicable legacy clause is copied without loss and has one owner.
2. Dependencies are present in production code, not merely reserved interfaces or passing unit tests.
3. Numeric bounds, error outcomes, state transitions, and user-visible wording are settled.
4. A reliable unchanged baseline can run and the named evidence can observe the real behavior.
5. No governing contradiction, unreliable gate, or impossible integration contract remains.

If any condition fails, record the question or blocker against that stage and stop. Do not create a
ticket whose only output is more tracking, copied identifiers, or code that validates planning prose.

### Stage 0 - Preserve and independently classify the shipped foundation

Treat the existing foundation and limited editor as inputs, not work to rebuild. Before a slice touches
one of their seams, inspect its code and direct tests and classify the affected behavior as delivered,
partial, missing, or blocked. Fold a discovered repair into the first product slice that needs it. Do
not create a generic migration, audit, traceability cleanup, or known-issues phase.

### Stage 1 - Viewer

Goal: a distributable, view-only-first journey that launches, opens supported local documents safely,
renders the complete selected Markdown level, supports reading mode and all six palettes, and remains
offline unless the user explicitly allows a remote asset.

Dependency-ordered capability groups:

1. **Finish the current theme frontier (actionable now):** complete the token source and generated
   editor outputs, settle the Markdown/embedded-language scope conflict in the governing requirement,
   apply live Auto appearance, prevent first-frame flash, and prove the visual matrix. Existing
   STORY-063 cannot enter implementation while its baseline or token ownership is unreliable.
2. **Window and launcher shell:** real shell coverage, launcher, title/menu/resize behavior, layout
   persistence, notifications, settings shell, keyboard/focus and responsive states. Detail only after
   the theme frontier is complete because every new surface consumes it.
3. **Safe file-open and tab lifecycle:** identity, empty tab set, open limits, picker/drop flows,
   decoding and read-only thresholds, canonical flush ordering, multi-subscriber patches, mock parity,
   recent items, and modified-close protection. This establishes the real document lifecycle before
   rich assets or OS-open wiring.
4. **Complete Viewer rendering:** three Markdown levels, one sanitized pipeline, local/remote asset
   policy, asynchronous highlighting/diagram/math generations, reading mode, and large-preview
   degradation. Reuse the file access boundaries established in the previous group.
5. **Distribution and OS-open:** real packages, four extension associations, queued startup opens,
   multi-window behavior, icon/version provenance, and three-platform install/launch evidence. Plan
   this only when the actual file-open journey exists.

The Viewer stage is complete only when its independent test and FR-001 through FR-028 are proven on
the real build. Packaging is part of the stage outcome but not a dependency for earlier coding.

### Stage 2 - Editor

Entry gate: Viewer document identity, tabs, file access, rendering, settings, action registry, and
distribution journeys are real and verified.

Capability groups, to be decomposed only after that gate:

1. Editing arrangements, per-document Monaco models, flush/acknowledgement lifecycle, status and large
   preview controls.
2. Canonical action/shortcut registry, formatting, paste/drop transformations, and one-step undo.
3. Atomic save/autosave, external-change resolution, close/quit decisions, and byte/permission
   preservation.
4. Additive-only workspace browsing and mutations, followed by shared navigation surfaces.
5. Shared gated Format/Compact/Lint operations, then PDF export consuming the proven renderer.

FR-029 through FR-052 and their cross-cutting FR-004 through FR-010 obligations are assigned when each
group becomes task-ready. Do not preselect parser libraries, persistence schemas, or component shapes
before the preceding seams exist.

### Stage 3 - Assistant actions

Entry gate: Editor can flush, snapshot, apply one undoable scoped edit, detect staleness, and protect
disk state; the shared operation gate has a real non-Assistant consumer and proven release behavior.

First establish provider profiles, draft-only tests, credential references, model discovery and
classified failures. Then build offline prompt/context inspection and the data-driven action catalogue.
Finally add one proposal lifecycle shared by tool-capable and single-step models. FR-053 through FR-067
own this stage; no provider request occurs outside explicit user actions.

### Stage 4 - Assistant chat

Entry gate: provider, context budget, proposal, cancellation, timeout, and stale-apply behavior are
already proven by Assistant actions; workspace access boundaries are real.

Add per-document session transcripts and custom prompts to the existing bounded run engine. Introduce
the five allowlisted capabilities one at a time with validation and recovery evidence, then add loop
termination and context trimming. FR-068 through FR-077 own this sub-stage. Streaming remains optional
and must not become a correctness dependency.

### Cross-stage catalogues

FR-078 settings, FR-079 shortcuts, and FR-080 packaging are not standalone cleanup projects. Each
setting and shortcut ships with its first consumer; each binding is registered once. Packaging ships
when the Viewer file-open journey is complete. Cross-cutting accessibility, localization, privacy,
limits, notifications, and failure states are acceptance criteria of every affected slice.

## Requirement and Evidence Ownership

- The eventual `tasks.md` must map every requirement in its currently authorized slice to exactly one
  owning task and at least one named automated test or numbered live case.
- A requirement may be consumed by later stages without being re-owned. Later tasks name the contract
  they consume and test only the new integration.
- SC-012 is satisfied by the union of slice-level mappings, not by a documentation-only application
  feature or a test that merely scans identifiers.
- Delivered labels from the legacy roadmap are hypotheses. Direct code, test, live, and real-build
  evidence decides whether behavior is preserved or needs repair.
- Known gaps are fixed in the first user-facing slice that exercises the broken seam. Only an urgent
  gate defect that makes all implementation evidence unreliable may be planned independently.

## Complexity Tracking

No constitution violation or additional architectural layer is proposed.
