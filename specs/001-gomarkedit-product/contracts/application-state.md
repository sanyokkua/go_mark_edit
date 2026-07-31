# Contract: Application State Ownership

## Canonical state

The Go backend is the sole owner of documents, tab order, active identity, workspace, settings, layout,
long-operation state, proposals, and Assistant runs. A successful command commits one coherent state
transition and emits the resulting projection patch. A failed command emits no success-shaped patch.

Redux hydrates once from the backend snapshot and then applies `state:patch` events. It may hold only
projection metadata needed to render the interface. UI components do not directly invent canonical
document, tab, settings, or operation outcomes.

The theme-only startup mirror is a pre-paint cache, not canonical settings state. It changes only after
an acknowledged appearance write, is read only before normal startup hydration, and is reconciled
against SQLite after the bridge becomes available. It contains no unrelated setting and causes no
write-back by itself.

Native window state is applied through Wails, but its durable size/maximized value and shell layout are
acknowledged by appmodel. The process starts hidden, appmodel loads valid durable fields, the native
adapter applies them, Redux hydrates the shell projection, and only then may the window be shown. A
browser cache or component-local layout state must not become an alternative restore source.

Each durable layout field carries its original change identity. Discrete changes persist immediately;
continuous changes persist after 250 ms; close flushes only locally pending fields without assigning a
new close-time identity. The repository conditionally accepts only a newer change, so close order never
overrides change order.

## Working-copy exception

The focused Monaco model may hold immediate text, caret, selection, scroll, and undo history. It is an
ephemeral identity-bound working copy. Before any consumer changes identity or reads canonical content,
the frontend flushes through the document command seam and waits for the newest acknowledgement.

The backend never projects full content back into the focused editor. Switching documents resolves a
different `{documentId, token, handle}` session rather than reusing stale editor identity.

## Projection delivery

Every subscriber receives state patches independently and owns its own disposal. Adding a consumer may
not silently replace or discard another subscriber. Event payloads carry enough revision/identity data
to reject stale application without making Redux authoritative.

## Failure invariants

- A failed settings write leaves the last acknowledged preference active.
- A failed editor flush leaves active identity and canonical content unchanged.
- A stale tab reorder, close, proposal, or asynchronous render changes nothing.
- Cancellation and timeout are normal terminal outcomes and release owned gates.
- Internal errors, secrets, full remote URLs, and private paths never cross the bridge.
- A failed layout write leaves the last acknowledged layout projected and notifies once per classified
  code and subject.
- A stale cross-process layout write projects the newer stored value and is not presented as an error.

## Empty-document state

Zero documents is a valid future appmodel state and is the launcher condition. When the safe file
lifecycle activates it, active identity and active buffer are optional together. Until real New/Open
commands exist, the shell task batch must not manufacture a launcher with enabled no-op actions.

## Proof obligations

Each slice touching this contract needs direct backend transition tests, adapter envelope/arity tests,
projection tests, failure and stale-command tests, and a live check of the authoritative visible or
root state. A mock-only browser result cannot prove backend authority or file durability.
