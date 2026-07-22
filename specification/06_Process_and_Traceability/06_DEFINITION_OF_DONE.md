**Status:** Accepted
**Owner:** architect
**Audience:** coder, tester, reviewer
**Last Updated:** 2026-07-10

# Definition of Done

A story is `done` only when **all** of the following hold. This is the review checklist and the gate
`just check` + `just trace-check` enforce.

## Per-story

1. Every acceptance criterion has a passing automated test whose first docstring/comment line names the
   AC (`Proves: STORY-NNN-AC-N`).
2. Every `edge_cases:` id has a passing test that explicitly declares the id on its test node; incidental
   body/fixture text is not evidence.
3. **Backend (if touched):** `gofmt -l` clean, `go vet ./...` clean, `golangci-lint run` clean for
   touched packages, `go test -race ./...` green.
4. **Frontend (if touched):** `prettier --check` clean, `eslint` clean, `tsc --noEmit` clean,
   `jest` green for touched files.
5. **Bindings:** if any bound Go signature changed, `wails generate module` was run and
   `frontend/wailsjs/` shows no unexpected drift.
6. **Architecture invariants** hold (see below) — verified by review and, where automated, by the
   architecture tests / lint hooks.
7. Traceability: `just trace` regenerated `traceability.yaml`; `just trace-check` passes with zero
   orphans and a fresh record.
8. Every AC has a `Satisfies:` mapping whose union equals the story's resolved `phase_requirements`.
9. `01_MODULE_INVENTORY.md` is unchanged, or the change is reflected there in the same story.
10. UI stories: the visual acceptance reference (a mockup file) matches; a `verify:ui` screenshot check
   exists where practical.
11. No new background/unsolicited network calls introduced (offline invariant, DD-32 as revised — the
    only permitted outbound call is a Stage-3 user-invoked LLM inference to the configured provider) —
    verified by review + the no-network architecture check.

## Architecture invariants (always true, not just when a rule file is loaded)

- Backend layering **Handler → Service → Repository**; handlers return `apperr.*Result`, take no
  `context.Context`, and convert panics via `defer/recover` → `CodeInternal`.
- `internal/apperr` imports no other internal package.
- All concrete wiring lives only in `internal/application` (+ `main.go`); services depend on
  **interfaces** defined in the package that owns the type.
- `internal/db/store/` is sqlc-generated and never hand-edited; migrations are additive only.
- Frontend components/thunks **never import `wailsjs/` directly** — only `logic/adapter/` does.
- **Backend-authoritative state:** `internal/appmodel` is the single source of truth for the live
  application model (documents/content, tabs, workspace ref, UI/layout); the Redux store is a derived
  projection (`GetState` + `state:*` events), UI interactions are commands, and the visible Monaco
  buffer is a debounce-synced working copy flushed before save/switch (DD-62/DD-63/DD-64, ADR-0014).
- Styling is **token-only**; no hardcoded colors; theme selection is `data-theme` × `data-mode` on
  `document.documentElement`. One layout, themes are a token layer (DD-30).
- The app makes **no background/unsolicited network calls** and all rendering assets are bundled;
  the only outbound call ever is a Stage-3 user-invoked LLM inference to the configured provider
  (DD-32 as revised, ADR-0011).
- Settings/recent persistence goes through the KV store; no ad-hoc files.

## Phase-level exit criteria

Each phase follows `07_PHASE_FORMAT.md`: permanent requirements, state transitions, cross-phase contracts,
edge/failure ownership, non-normative work packages, and blocking exit evidence. `just phase-check` is part
of `just check` and validates structure for all phases. A phase is complete only when
`just phase-complete-check NN` confirms every requirement and lifecycle row resolves through done stories,
ACs, proving tests, and any required real-runtime or human evidence. Passing isolated story gates is not a
phase-completion substitute. An unresolved specification conflict blocks completion.
