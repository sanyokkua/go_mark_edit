# Stories

One file per story: `story-NNN-short-slug.md`, in the format defined by
`specification/06_Process_and_Traceability/02_STORY_FORMAT.md`. Copy `STORY_TEMPLATE.md` to start.

**One story = one coding session.** A story is `done` only when every acceptance criterion has a
passing test that names the story id and `just trace-check` passes with zero orphans.

**Stories are generated during implementation** — they do not ship with the spec. The `architect`
authors them **per phase** from that phase's suggested-task list
(`specification/07_Phases/PHASE_NN_*.md`), assigning globally-unique, monotonic ids `STORY-NNN`.

## Index (status board)

| Story | Title | Phase | Status | Owner | Est |
|---|---|---|---|---|---|
| STORY-001 | Scaffold the Wails v2 app and embedded React frontend so a blank window boots | 00 | done | coder | M |
| STORY-002 | Implement the apperr envelope and Wails-bindable result contracts | 00 | done | coder | M |
| STORY-003 | Establish bootstrap logging paths and the generic single-flight gate | 00 | done | coder | L |
| STORY-004 | Open the multi-instance-safe SQLite store and generated query layer | 00 | done | coder | M |
| STORY-005 | Expose the typed settings registry and wire the two-phase application root | 00 | done | coder | L |
| STORY-006 | Build the frontend adapter projection-store toast and bridge mock foundations | 00 | done | coder | L |
| STORY-007 | Reserve the three-region app shell and token-only style skeleton | 00 | done | coder | M |
| STORY-008 | Add quality tooling and traceability validation for the initial backlog | 00 | done | coder | M |
| STORY-009 | Complete Stage-1 settings and fail startup safely | 00 | done | coder | M |
| STORY-010 | Restore Phase-00 toolchain integrity | 00 | done | coder | M |
| STORY-011 | Establish the backend-authoritative in-memory application model | 01 | done | coder | L |
| STORY-012 | Project backend application state into the frontend | 01 | done | coder | L |
| STORY-013 | Integrate Monaco as the presentational Markdown editor | 01 | done | coder | M |
| STORY-014 | Build the base GFM Markdown preview | 01 | done | coder | M |
| STORY-015 | Compose the split editor and preview with backend-owned view modes | 01 | done | coder | L |
| STORY-016 | Add the core editor status bar | 01 | done | coder | L |
| STORY-017 | Drive live preview from backend-accepted debounced snapshots | 01 | done | coder | M |
| STORY-018 | Verify the core editor responsively with Playwright | 01 | done | coder | M |
| STORY-019 | Synchronize the active buffer and establish the editable document-command seam | 01 | done | coder | L |
| STORY-020 | Validate story lifecycle and exact edge-case trace evidence | 01 | done | coder | M |
| STORY-021 | Serialize per-document view commands by latest intent | 01 | done | coder | M |
| STORY-022 | Preserve the active Monaco session across view arrangements | 01 | done | coder | M |
| STORY-023 | Expose document commands through a stable editor-session boundary | 01 | done | coder | M |
| STORY-024 | Enforce phase planning completeness | 00 | done | coder | M |
| STORY-025 | Record the Phase 01 checkpoint resolution | 01 | done | coder | M |
| STORY-026 | Strengthen Phase 01 checkpoint and completion validation | 01 | done | coder | M |
| STORY-027 | Make failed frontend bootstrap retryable | 01 | done | coder | M |
| STORY-028 | Preserve the latest editor view intent during arrangement changes | 01 | done | coder | M |
| STORY-029 | Add an atomic backend document snapshot seam | 01 | done | coder | M |
| STORY-030 | Complete the frontend document command seam | 01 | done | coder | M |
| STORY-031 | Render safe offline GFM footnotes | 01 | done | coder | S |
| STORY-032 | Produce Phase 01 completion evidence | 01 | done | coder | M |

Add a row per story as it is authored, and keep this board in sync with `../traceability.yaml`.

## Phase 01 remediation readiness sequence

Promote a draft to `ready` only after every `depends_on` story is `done` and the front matter, clause anchors, module paths, and dependency graph validate.

- STORY-011 through STORY-019 are done and immutable.
- STORY-020 is done after exact edge-case evidence and lifecycle validation passed independent review.
- STORY-021 is done after the per-document latest-intent queue and its deferred-ordering, flush, failure, and projection tests passed independent review.
- STORY-022 is done after the persistent Monaco-session, flush-ordering, responsive round-trip, and independent conformance evidence passed.
- STORY-023 is done after persistent session-boundary command availability, real arrangement/queue proofs, and independent conformance review passed.
- STORY-024 is done after the phase-planning migration, independent conformance review, and native/bridge-mock Phase-00 runtime evidence passed.
- STORY-025 is ready first: it records the accepted checkpoint partition, prerequisite, full-completion
  obligations, and narrow current-host exception from ADR-0016.
- STORY-027 and STORY-031 are immediately ready independent remediation packets because each of their
  declared prerequisites is already done; they may be implemented in any order.
- STORY-029 is done after its atomic canonical snapshot, no-active error, concurrency, content-free
  projection, and downstream-consumer tests passed independent conformance review.
- STORY-028 is done after its latest-local-view merge, flush ordering, retry, patch, and document-switch
  proofs passed independent conformance review.
- STORY-026 is done; it validates the accepted checkpoints and exact row-level completion rules.
- STORY-030 is done after identity-bound working-copy reads and replacements, explicit unavailable and
  stale-session outcomes, normal Monaco undo/buffer synchronization, and import-boundary proofs.
- STORY-032 is ready now that STORY-026 through STORY-031 are all done; it produces the revision-bound
  automated, current-host native, network, and human-approved visual completion evidence last.
