# T018 review — real tabs and navigation surface

## Scope

T018 replaces the Phase 002 visual tab fixtures with projected tabs backed by the
T016 Activate/Close/Reorder/CopyPath/RevealInFileManager commands. It adds the
registry-derived tab context menu, exact next/previous bindings, backend-confirmed
reorder announcement, hostile-safe disambiguated labels, and the polite live region.

The task's requested UI files are implemented. `App.tsx`, `AppShell.tsx`, and
`EditorView.tsx` are also changed because the active buffer is intentionally held
at the composition root rather than in Redux; those small seams install the
backend's active-buffer acknowledgement after a successful tab activation or
close and pass the existing app-model adapter through to the real tab surface.

## Named evidence

- `npm --prefix frontend test -- --runInBand` — 62 suites, 316 tests passed.
- `npm --prefix frontend run lint` — passed.
- `npm --prefix frontend run typecheck` — passed.
- `npm --prefix frontend run format:check` — passed.
- `GOCACHE=/private/tmp/gomarkedit-gocache just archtest` — passed.
- `npm run verify:ui -- e2e/real-files-and-tabs.test.ts --grep 'FT-VS-03'` — Chromium passed 1/1.
- `GOCACHE=/private/tmp/gomarkedit-gocache just verify 003-real-files-and-tabs` — M1–M6 passed against the existing baseline.

## Contract review

- `DocumentTabs` renders the Redux-projected order, active identity, dirty state,
  detached/read-only metadata, full canonical-path tooltip, close controls, and New.
- Context actions are obtained from `actionsForSurface('tab-context')`; their
  registry order is Close, Close others, Close to the right, Move left, Move right,
  Copy path, Reveal. Move edge states are disabled without a command.
- Reorder invokes T016 with the current tab-set revision and does not change local
  order. The mock and real bridge publish the authoritative patch only after the
  backend result. Successful moves announce the one-based position and total.
- `Mod+Tab`/`Mod+Shift+Tab` and `Ctrl+PageDown`/`Ctrl+PageUp` navigate through the
  active projected tab without jump-by-number bindings.
- `tabLabel.ts` extends identical parent suffixes until unique, escapes C0/DEL/bidi
  controls visibly, isolates remaining user text, preserves a distinguishing suffix
  through visual ellipsis, and keeps the complete label as the accessible name.
- Copy path and Reveal call the T016 adapter commands. Copy success announces a
  transient polite status; Reveal success is silent; classified failures use the
  existing deduplicating notification store. Closing a menu restores the originating
  tab when it remains, otherwise the current tab or strip New.

## Remaining boundary

Keyboard Move tab left/right bindings remain owned by T030 as declared in the task
matrix; T018 owns their context-menu placement, edge availability, target reorder,
and announcement contract.
