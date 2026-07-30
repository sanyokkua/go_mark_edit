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

The immediate implementation frontier is the first Spec Kit foundation slice plus completion of the
six-palette theme journey already in progress. First preserve the current evidence, remove only the
superseded legacy planning/traceability validators, and keep every product, architecture, quality,
build, baseline-reliability, live, and real-build gate. Then repair and finish the partial theme work:
generate language-qualified Monaco palettes, apply them without disturbing editor state, follow live
system appearance, prevent a first-frame palette flash, and prove the 18 visual combinations.

That frontier is dependency-complete now. The Markdown-versus-Go token conflict is resolved by FR-017:
bundled Monaco postfixes distinguish `keyword.md` from `keyword.go`. Current code and direct gate
output identify concrete repairs rather than speculative interfaces. Work after the theme journey is
kept in ordered capability groups and MUST NOT be decomposed into tasks until the theme outcome has
been implemented and reconciled.

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
| Normative authority        | Authority transfers one requirement at a time only after complete mapping and explicit approval; unmapped `docs/delivery/` clauses remain authoritative.    | PASS   |
| Vertical slices            | Each implementation increment crosses only the layers needed for an observable outcome and owns complete requirements plus proving evidence.                | PASS   |
| Backend authority          | Go remains canonical; Redux is a projection; Monaco is an identity-bound working copy; bridge imports and handlers retain their enforced boundaries.        | PASS   |
| Offline, private, safe     | No network work is planned before explicit provider or remote-asset actions; untrusted content is validated and sanitized at boundaries.                    | PASS   |
| Data and platforms         | File identity, atomic writes, multi-instance SQLite, additive migrations, CGO-free builds, and numeric refusal/degradation limits are design inputs.        | PASS   |
| Accessible coherent UI     | Strings, tokens, focus, keyboard access, lifecycle states, responsive widths, and live checks travel with each visible slice.                               | PASS   |
| Evidence before completion | Baselines must be reliable, architecture tests green, mock evidence supplemented by live/real-build cases, and historical labels are not accepted as proof. | PASS   |

No constitutional exception is required. Spec Kit replaces the legacy planning, story-copy, phase
status, and retired-requirement traceability validators. Their removal is foundation support inside
the first authorized slice, not a documentation product. Runtime tests and architecture, formatting,
typing, lint, build, baseline-reliability, live-interface, and real-build evidence remain mandatory.

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
│   ├── delivery-stages.md
│   └── migration-readiness.md
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
frontend/index.html          # theme-only blocking first-paint bootstrap
frontend/scripts/            # generated-theme producer and retained architecture gate
docs/delivery/plan/testing/  # numbered native/platform/live cases
scripts/                     # retained baseline/verify plus legacy validators removed in first batch
```

**Structure Decision**: Extend the established single Wails application by vertical capability. Do
not create a server, a second frontend state owner, a parallel renderer, or speculative packages for
future Assistant work. Create a new package only when the first production slice gives it a concrete
caller and boundary.

## Delivery Strategy

### Planning unit and readiness rule

A task set is generated for one vertical slice only when all of the following are true:

1. Every owned requirement and applicable initial-spec clause is copied without loss, explicitly
   approved for authority transfer, and has one owner.
2. Dependencies are present in production code, not merely reserved interfaces or passing unit tests.
3. Numeric bounds, error outcomes, state transitions, and user-visible wording are settled.
4. A reliable unchanged baseline can run and the named evidence can observe the real behavior.
5. No governing contradiction, unreliable gate, or impossible integration contract remains. A
   reliable pre-existing finding may enter the baseline and be repaired; an analyzer that examined
   nothing may not.

If any condition fails, record the question or blocker against that stage and stop. Do not create a
ticket whose only output is more tracking, copied identifiers, or code that validates planning prose.

### Stage 0 - First Spec Kit foundation slice

Treat the existing foundation and limited editor as inputs, not work to rebuild. Before a slice touches
one of their seams, inspect production code and direct evidence and classify the behavior as conforming,
partial/defective, missing, or unreliable. Preserve conforming behavior, repair partial behavior, and
implement only what is missing. Historical `built` or phase labels are not evidence.

The first task batch owns only these independently actionable foundation repairs:

1. Capture the current pre-edit baseline with raw output and reliability verdicts. Current evidence is
   concrete: tests and type checking pass; unrestricted CGO-free build passes; formatting reports both
   partial generator files; lint reports the generator's unused `root`; and existing generator tests do
   not detect the unqualified `keyword` collision.
2. Remove the legacy planning/traceability command wiring (`spec-check`, `story-check`, and their
   documentation-copy, story-shape, upgrade, and `Proves:` resolution scripts). Do not remove or weaken
   product tests, `archtest`, format, typecheck, lint, builds, baseline reliability, browser journeys,
   live cases, or real-build walkthroughs. Historical `Proves:` comments may remain as non-authoritative
   comments until their production file changes; do not create cleanup tickets for comments alone.
3. Keep baseline/verification behavior, but remove its dependency on a legacy story document as part of
   the transition to feature-slice evidence. The current baseline format must remain readable until the
   first slice verifies, so the transition cannot erase its own comparison point.

Do not create a generic audit, documentation application, traceability replacement, or known-issues
phase. Consumer-dependent gaps remain mandatory and move to the earliest user-facing slice that can
exercise their real production seam.

### Stage 1 - Viewer

Goal: a distributable, view-only-first journey that launches, opens supported local documents safely,
renders the complete selected Markdown level, supports reading mode and all six palettes, and remains
offline unless the user explicitly allows a remote asset.

Dependency-ordered capability groups:

1. **Finish the current theme frontier (actionable now):** complete the token source and repair the
   partial generator so Markdown rules use `.md`-qualified tokens and embedded Go rules use
   `.go`-qualified tokens, including descendants. Generate and commit six Monaco themes plus the
   inactive preview highlight stylesheet; register and swap themes without recreating Monaco models;
   follow system appearance only while Auto is selected; maintain an acknowledged theme-only startup
   mirror for a blocking first-paint bootstrap while SQLite remains authoritative; and prove the full
   three-width by six-palette matrix. Preview highlighting remains inactive until its renderer slice.
2. **Window and launcher shell:** real shell coverage, launcher, title/menu/resize behavior, layout
   persistence, notifications, settings shell, keyboard/focus and responsive states. Detail only after
   the theme frontier is implemented and reconciled because every new surface consumes it. This is the
   deliberate cutoff for the next `tasks.md`.
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
- The immediate task batch owns the migrated parts of FR-015 through FR-017 plus affected FR-002,
  FR-004, FR-005, FR-006, FR-007, and the appearance subset of FR-078. It MUST copy their complete
  initial-spec clauses into executable task context before authority transfers; later Viewer rules
  remain governed by `docs/delivery/` and stay out of this task batch.

## Complexity Tracking

No constitution violation or additional architectural layer is proposed.
