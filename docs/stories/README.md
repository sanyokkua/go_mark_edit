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
| STORY-033 | Record and validate Phase 02 lifecycle resolutions | 00 | ready | coder | M |
| STORY-034 | Build safe document byte I/O and native dialog seams | 02 | draft | coder | M |
| STORY-035 | Create and open backend documents with authoritative tab order | 02 | draft | coder | M |
| STORY-036 | Activate reorder and close clean tabs through revisioned commands | 02 | draft | coder | M |
| STORY-037 | Save canonical documents with atomic commit semantics | 02 | draft | coder | M |
| STORY-038 | Guard external file changes with revision-bound decisions | 02 | draft | coder | M |
| STORY-039 | Project file and tab commands into the active editor session | 02 | draft | coder | M |
| STORY-040 | Enforce read-only and newline-normalization document safety | 02 | draft | coder | M |
| STORY-041 | Build the accessible tab bar and zero-document state | 02 | draft | coder | M |
| STORY-042 | Detect external changes at focus and save checkpoints | 02 | draft | coder | M |
| STORY-043 | Resolve external changes through Reload or Keep mine | 02 | draft | coder | M |
| STORY-044 | Plan and execute authoritative dirty-document closes | 02 | draft | coder | M |
| STORY-045 | Present dirty-close decisions without partial mutation | 02 | draft | coder | M |
| STORY-046 | Intercept window close and quit through the dirty lifecycle | 02 | draft | coder | M |
| STORY-047 | Persist and project the autosave preference | 02 | draft | coder | M |
| STORY-048 | Autosave eligible documents through the serialized save path | 02 | draft | coder | M |
| STORY-049 | Show autosave and document safety status | 02 | draft | coder | M |
| STORY-050 | Synchronize the native window title from projected state | 02 | draft | coder | M |
| STORY-051 | Produce Phase 02 completion evidence | 02 | draft | coder | M |

Add a row per story as it is authored, and keep this board in sync with `../traceability.yaml`.

## Phase 01 completion

- STORY-011 through STORY-032 are done and immutable.
- Their accepted checkpoints, remediation, evidence, and completion state are historical; no Phase 01 story
  remains ready or awaiting implementation.

## Phase 02 readiness sequence

- STORY-033 is Phase 00 tooling work and is ready first because STORY-024 and STORY-026 are done and
  ADR-0023/ADR-0024 are accepted. Its ACs do not prove Phase 02 product outcomes.
- STORY-034 remains draft until STORY-033 records and validates the Phase 02 conflict policy.
- Backend file/tab work then proceeds through STORY-035, STORY-036, STORY-037, and STORY-038.
- STORY-039 consumes the complete backend file/tab surface before any projected UI story becomes ready.
- Read-only safety, tabs, external prompts, dirty close, window lifecycle, autosave, status, and title work
  follow their declared dependencies; no frontend story crosses an unfinished Go/TypeScript contract.
- STORY-051 remains last and cannot complete without exact-revision macOS, Windows, Linux, and product-owner
  evidence.
