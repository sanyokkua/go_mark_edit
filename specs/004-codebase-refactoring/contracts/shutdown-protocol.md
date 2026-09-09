# Contract: shutdown protocol (native close and quit)

Requirements: FR-015 (interaction with the failure screen), FR-016, FR-017, FR-018, FR-057.
Owner: `internal/application/shutdown.go` (backend) with its frontend half in
`frontend/src/app/useShutdown.ts`. The old `CloseCoordinator` (emit once, veto forever) is replaced.

## Inputs

| Input | Source |
|---|---|
| native close or quit request | Wails `OnBeforeClose` (window close button, ⌘Q, the macOS application menu) and `runtime.Quit()` from the page |
| `WindowReady(request)` | the frontend, once its projection is hydrated and the shell mounted |
| `AuthorizeQuit(request, closeID)` / `CancelQuit(request, closeID)` | the frontend, in answer to a close request |
| `Quit` button on the startup-failure screen | the frontend, before ready |
| write completion | the lifecycle owner's write queue |
| native confirmation answer | the confirmation port (`runtime.MessageDialog`, wired at the composition root) |

## States

```
Idle ──native request──▶ Requested(id)
Requested(id):
   frontend never ready  ∧ nothing unsaved ∧ no write pending ──▶ Exiting
   frontend never ready  ∧ (unsaved ∨ write pending)          ──▶ Draining → Confirming
   frontend ready        ──emit application:close-requested{id}; GetState.pendingClose = id──▶ Awaiting(id, deadline 10 s)
Awaiting(id):
   AuthorizeQuit(id) after the frontend flushed and found nothing unsaved ──▶ Exiting
   AuthorizeQuit(id) with unsaved documents the user chose to discard   ──▶ Draining → Exiting
   CancelQuit(id)                                                        ──▶ Idle   (acknowledged to the caller)
   deadline reached ∧ nothing unsaved ∧ no write pending                 ──▶ Exiting
   deadline reached ∧ (unsaved ∨ write pending)                          ──▶ Draining → Confirming
   a second native request while Awaiting                                 ──▶ stays Awaiting; re-emits the same id (no new id, no veto without an event)
   AuthorizeQuit/CancelQuit with a stale or unknown id                     ──▶ refused (validation); state unchanged
Draining: every write that already started finishes (no new write starts)  ──▶ next state
Confirming: native dialog names the documents with unsaved changes, "Quit and discard" / "Cancel"
   confirm ──▶ Exiting
   cancel ∧ frontend ready       ──▶ Idle (a working application; the frontend is told the request was cancelled)
   cancel ∧ frontend never ready ──▶ Idle with the startup-failure screen still shown; the next native request or
                                      Quit re-enters Requested → Draining → Confirming (the confirmation is offered again)
Exiting: OnShutdown runs (close the model, the database, the logger) ──▶ process exit
```

A timeout alone never discards data: the only paths to `Exiting` with unsaved changes go through
the user's explicit confirmation. No session restore is introduced. A native request that arrives
while a user-paced command has a native dialog open (Open, Save As, overwrite) is handled after
that dialog returns; the dialog itself is never interrupted.

## Discovery after a late load

When the frontend becomes ready while a request is `Awaiting`, `GetState().pendingClose` carries the
id; the frontend treats it exactly like a freshly received event (flush, prompt, answer). The 10-second
deadline still runs from the original request.

## Frontend obligations

- Subscribe to `application:close-requested` at mount, before the projection is hydrated; buffer an
  event that arrives before ready and handle it when ready.
- Keep `pendingClose = id` until `CancelQuit(id)` **returns** (acknowledged); until then the request
  is reported as pending; if the acknowledgement never arrives the bounded-command rule shows a notice.
- The startup-failure screen offers **Quit** (always) → `runtime.Quit()`; this becomes a native request
  before ready and follows the "frontend never ready" branches (immediate exit when clean; drain and
  native confirmation when dirty).
- The recovery quit (editor-state recovery failed) uses the same `AuthorizeQuit(id)` with the
  discard decision; it is not a second protocol.

## Identity and staleness

`id` is minted per native request (monotonic counter plus process nonce). Every answer carries it; an
answer for another id is refused and logged. The frontend's own bridge `Request.ID` is separate: it
identifies the *call*, the close `id` identifies the *request being answered*.

## Observability

Every transition is logged locally with the id and the reason (never a document body). The
startup-failure screen never shows a path or raw error text.

## Tests

- Go integration (`tests/go/integration/application`): every transition above with a fake window
  port and confirmation port, including "request before ready then `WindowReady`", "deadline with a
  pending write", "stale id refused", "second request re-emits the same id".
- Frontend integration: event before ready is buffered; `pendingClose` in the hydrated state is
  handled; pending stays true until `CancelQuit` resolves (command recorder).
- E2E cases 2, 3 and 5 in [e2e-harness.md](e2e-harness.md); native dialogs in walkthrough steps 13–14.
