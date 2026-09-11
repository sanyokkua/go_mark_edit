---
id: STORY-027
title: Make failed frontend bootstrap retryable
status: done
spec_clauses:
  - ../../../_archive-2026-07-28-specification/02_Architecture/03_FRONTEND_REACT.md#state-ownership
  - ../../../_archive-2026-07-28-specification/02_Architecture/03_FRONTEND_REACT.md#store
  - ../../../_archive-2026-07-28-specification/01_Product/13_I18N.md#i18n-layer
  - 07_Phases/PHASE_01_CORE_EDITOR.md#state-and-transition-model
phase_requirements:
  - PH01-R02
  - PH01-R16
modules:
  - logic/store/
  - ui/widgets/
  - i18n/
acceptance_criteria:
  - STORY-027-AC-1
  - STORY-027-AC-2
  - STORY-027-AC-3
  - STORY-027-AC-4
edge_cases: []
depends_on:
  - STORY-012
  - STORY-016
adrs:
  - ADR-0014
phase: 01
owner: coder
estimate: M
---

> **Historical vocabulary — this story is not maintained.** The `AC-…`, `EC-…` and `DD-…` identifiers are the scheme of the pre-2026-07-28 specification; `spec_clauses` and `phase_requirements` point into `_archive-2026-07-28-specification/`, which is kept so a citation still resolves and is **not normative**. See `README.md`. If anything here disagrees with the code, the code is the truth.
> A link beginning `07_Phases/` names a retired phase document that was deleted rather than archived; that set is in git at `e1bd33f`.

# STORY-027 — Make failed frontend bootstrap retryable

## Goal

Let a user recover from a failed startup query in place, without reloading the app or allowing stale
listeners and queued patches from the failed attempt to corrupt the successful retry.

## In scope

- Reset all failed bootstrap attempt state, including the cached promise, subscription, queued patches, and
  partial projection.
- Create a production startup-failure widget, compose it from `App`, and expose an accessible Retry action.
- Add the startup failure and Retry strings to the bundled i18n catalog and style the widget only with tokens.
- Keep retries single-flight and React StrictMode safe.
- Return the successful retry's active buffer to the normal ephemeral editor-session handoff.

## Out of scope

- Backend startup/database retry or application reinitialization.
- Changing the app-model query, envelope, or event payload.
- Adding a generic Retry action to `NotificationToast`; startup recovery is owned by the dedicated production
  failure widget.
- Optimistic projection updates or storing active-buffer content in Redux.

## Spec inputs

- `../../../_archive-2026-07-28-specification/02_Architecture/03_FRONTEND_REACT.md#state-ownership` — subscribe before snapshot, reconcile by revision,
  and keep the active buffer ephemeral.
- `../../../_archive-2026-07-28-specification/02_Architecture/03_FRONTEND_REACT.md#store` — keep Redux a content-free disposable projection.
- `../../../_archive-2026-07-28-specification/01_Product/13_I18N.md#i18n-layer` — resolve startup error and Retry text through the bundled catalog.
- `07_Phases/PHASE_01_CORE_EDITOR.md#state-and-transition-model` — implement PH01-T01's clean retry and stale
  patch isolation semantics.

## Design constraints

- A failed attempt atomically clears its cached Promise, listener/disposer, patch queue, and partial
  projection before retry is enabled; its later events cannot reach a subsequent attempt.
- Concurrent Retry calls and StrictMode consumers share one new attempt. After another failure, a later Retry
  still starts a fresh attempt.
- Retry installs a fresh listener before requesting a fresh snapshot, then hands the returned active buffer
  to the existing ephemeral session path.
- `App` composes a dedicated `ui/widgets/` startup-failure surface when bootstrap returns `failed`; the surface
  uses accessible status/button semantics, bundled `i18n/` keys, and token-only CSS. It is not a toast and it
  disappears only after a successful retry supplies the active buffer.
- `internal/appmodel` remains authoritative; Redux stays content-free and reconciles only `state:patch`
  (DD-62–64, ADR-0014). Only `logic/adapter/` imports `wailsjs/` and unwraps Result envelopes.
- No hardcoded user-facing string or color is introduced. No background network, telemetry, or remote asset
  is introduced.

## Acceptance criteria

### STORY-027-AC-1

**Satisfies:** PH01-R02

**Given** the first production bootstrap snapshot fails, **when** `App` renders the localized startup failure
and the user invokes Retry, **then** a fresh listener and snapshot request start, the successful result
hydrates the projection, the failure surface clears, and the returned active buffer reaches the editor
session.

### STORY-027-AC-2

**Satisfies:** PH01-R02

Patches and listener callbacks retained by a failed attempt cannot mutate or queue into the retried
projection, and the failed attempt leaves no partial document/UI state.

### STORY-027-AC-3

**Satisfies:** PH01-R02

**Given** the production `App` path is rendered inside `React.StrictMode`, **when** mount/effect cleanup and
remount overlap concurrent Retry actions and a repeated failed attempt, **then** each attempt is single-flight,
the next retry starts fresh, and one successful active buffer is handed to the persistent editor session
exactly once.

### STORY-027-AC-4

**Satisfies:** PH01-R02, PH01-R16

The production startup-failure surface exposes an accessible status and Retry button whose text resolves
through bundled i18n keys and whose styling uses theme tokens only; it does not depend on a retry-capable
notification toast.

## Test plan

- STORY-027-AC-1 — integration/RTL — `frontend/src/App.test.tsx` —
  `it('STORY-027-AC-1 retries the production failure UI and hands off the active buffer')`.
- STORY-027-AC-2 — unit — `frontend/src/logic/store/appModelProjection.test.ts` —
  `it('STORY-027-AC-2 isolates stale listeners queued patches and partial projection')`.
- STORY-027-AC-3 — integration/RTL — `frontend/src/App.test.tsx` —
  `it('STORY-027-AC-3 keeps StrictMode retries single-flight repeatable and active-buffer exact')`;
  supporting unit — `frontend/src/logic/store/appModelProjection.test.ts` —
  `it('supports STORY-027-AC-3 by clearing repeated failed attempts for a fresh retry')`.
- STORY-027-AC-4 — integration/architecture — `frontend/src/App.test.tsx` —
  `it('STORY-027-AC-4 renders an accessible localized token-only startup failure surface')`.

## Definition of done

- [ ] Every AC has a passing Jest test whose name begins with its `STORY-027-AC-N` id.
- [ ] Controlled attempts prove failed-first/successful-second, stale listener/queue isolation, repeated retry,
      StrictMode single-flight behavior, and exact active-buffer handoff.
- [ ] App/RTL proves the actual production failure UI invokes a fresh retry, clears only on success, and hands
      the successful active buffer to the editor session.
- [ ] Startup error and Retry labels use bundled i18n keys; the dedicated widget is accessible and token-only.
- [ ] Redux/local storage contain no document content and no command mutates projection optimistically.
- [ ] Frontend formatting, lint, typecheck, and Jest gates pass.
- [ ] Adapter-only Wails access, Result envelopes, backend authority, token-only styling, and offline behavior
      remain intact.
- [ ] `just trace` and `just trace-check` are run during implementation; the module inventory is unchanged.
