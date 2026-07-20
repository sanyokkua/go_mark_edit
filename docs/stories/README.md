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
| STORY-004 | Open the multi-instance-safe SQLite store and generated query layer | 00 | draft | coder | M |
| STORY-005 | Expose the typed settings registry and wire the two-phase application root | 00 | draft | coder | L |
| STORY-006 | Build the frontend adapter projection-store toast and bridge mock foundations | 00 | draft | coder | L |
| STORY-007 | Reserve the three-region app shell and token-only style skeleton | 00 | draft | coder | M |
| STORY-008 | Add quality tooling and traceability validation for the initial backlog | 00 | draft | coder | M |

Add a row per story as it is authored, and keep this board in sync with `../traceability.yaml`.
