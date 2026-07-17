# ADR-0014 — Make the Go backend the single source of truth for application state

**Status:** accepted
**Date:** 2026-07-16
**Deciders:** project owner, architect
**Supersedes:** (none)

## Context and problem statement

The original architecture split state conventionally: Go owned file I/O, persistence, and OS
integration, while the React/Redux store held the **live working state** — including open-document
**content** (the `documents` slice held the buffer), the tab set, workspace, UI toggles, and lint
markers. Because GoMarkEdit runs the UI in an embedded webview, holding document content and app state
in the webview means (a) two potential sources of truth (Go + Redux) that can drift, and (b) all open
documents' text sitting in webview/JS memory, which is harder to bound and reclaim than Go memory. The
owner asked for an **MVC model where the Go backend is the Model** and the frontend is a lightweight
View/Controller, so the app gets Go's performance and memory management and there is exactly one source
of truth. This introduces **DD-62 / DD-63 / DD-64**.

## Decision drivers

- One source of truth — eliminate Go↔Redux drift for documents, tabs, workspace, and UI state.
- Memory: keep only the visible document in the webview; hold everything else in Go.
- Keep the editor responsive (Monaco must physically hold the visible text).
- Preserve existing invariants: file-first (DD-11), the Result-envelope handler boundary, adapter-only
  `wailsjs/` access, offline, and multi-instance safety.
- Stay implementable in Wails v2 (IPC command/query + events; no shared memory).

## Considered options

- **A — Backend-authoritative model + thin projection frontend + debounced buffer sync (chosen).** A
  new `internal/appmodel` owns the live model; the frontend hydrates via a query and syncs via `state:*`
  events; UI actions are commands; Monaco edits debounce-push to Go.
- **B — Keep the frontend-authoritative Redux store.** Status quo; Go owns only I/O and persistence.
- **C — Command-per-edit (no webview buffer of truth).** Every keystroke batch is a command to Go which
  holds and echoes the buffer.

## Decision outcome

Chosen: **Option A**. The Go backend is the single source of truth for the whole live model
(`internal/appmodel`); the frontend is a derived, disposable projection that renders backend snapshots
and dispatches commands. The one unavoidable piece of frontend state — Monaco's buffer for the
*visible* document — is treated as a working copy that debounce-syncs to Go (DD-64), with a flush on
blur/switch/close/save. Inactive documents' content is never held in the webview. Option C was rejected
as too chatty/latency-prone in a webview; Option B was rejected because it is precisely the dual-source
design the owner wants to remove.

### Consequences

- Positive: one source of truth; Go owns memory/lifecycle of the model; bounded webview memory; the
  Stage-3 assistant, export, and preview all read one authoritative buffer.
- Positive: file-first (DD-11) and the envelope/adapter/offline invariants are unchanged.
- Negative: more IPC (commands + `state:*` events + `GetState` hydration) and a projection-sync layer to
  build and test; a new `internal/appmodel` module and handler.
- Negative: careful reconciliation needed so a `state:*` event never clobbers the focused editor's
  cursor (backend never echoes buffer text into the active editor).
- Neutral: Redux stays, but as a **view-model cache** (projection), not the source of truth.

## Pros and cons of the options

### Option A — Backend-authoritative + projection + debounced buffer
- Good: single truth; bounded webview memory; clean MVC; testable command/query/event contract.
- Bad: new module + sync plumbing; more IPC than status quo.

### Option B — Frontend-authoritative Redux
- Good: simplest; least IPC.
- Bad: two sources of truth; all open-doc content in webview memory — the problem being solved.

### Option C — Command-per-edit
- Good: purest single-source, even for the active buffer.
- Bad: IPC chatter/latency in a webview; risk to editing responsiveness.

## Links

- Design decisions: DD-04, DD-09, DD-10, DD-11, DD-60, DD-62, DD-63, DD-64
- Spec clauses: `specification/02_Architecture/01_SYSTEM_ARCHITECTURE.md#data-flow`,
  `specification/02_Architecture/02_BACKEND_GO.md#application-model`,
  `specification/02_Architecture/03_FRONTEND_REACT.md#state-ownership`,
  `specification/02_Architecture/05_STATE_AND_PERSISTENCE.md#in-memory-application-model`,
  `specification/00_Foundation/04_DESIGN_DECISIONS.md#14-application-state-ownership`
- Stories: STORY-099 (and the Phase 01/02 stories that consume `internal/appmodel`)
