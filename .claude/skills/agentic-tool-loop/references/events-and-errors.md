# Events and Error Mapping

The four `agent:*` events, the adapter wiring that turns them into Redux state, and the fixed mapping
from every loop stop outcome to its `ErrorCode`.

## Events (DD-49, DD-55, `08_LLM_INTEGRATION.md#events`)

Emit via Wails `EventsEmit`; the adapter subscribes with `EventsOn` and dispatches into
`logic/store/assistant` (the `run` slice). **All payloads carry `runId`** — this is how the frontend
correlates events to the run it's currently displaying, and how it discards stale events from a run the
user already cancelled or navigated away from.

| Event | Payload | Meaning |
|---|---|---|
| `agent:progress` | `{ runId, phase, iteration, tool? }` | `phase ∈ {infer, tool, final}` |
| `agent:token` | `{ runId, delta }` | streaming assistant-text chunk |
| `agent:done` | `{ runId, stopReason, transcriptSummary }` | run finished |
| `agent:error` | `{ runId, error: WireError }` | failed; reuses the standard `WireError` shape |

Streaming (DD-49) is a UX enhancement with a non-streaming fallback — correctness (final text,
proposals, apply) is identical either way. Never make `agent:token` load-bearing for anything other than
incremental UI rendering; a client that ignores it entirely must still end up with the same final result
via `agent:done`.

## Adapter wiring

```ts
// frontend/src/logic/adapter — the ONLY layer importing wailsjs/. Dispatches into logic/store/assistant.
EventsOn("agent:progress", (p) => store.dispatch(runSlice.actions.progress(p)));
EventsOn("agent:token",    (p) => store.dispatch(runSlice.actions.appendToken(p)));
EventsOn("agent:done",     (p) => store.dispatch(runSlice.actions.done(p)));
EventsOn("agent:error",    (p) => notifyError(p.error)); // standard WireError toast path
```

`logic/adapter/` is the only layer permitted to import `wailsjs/` bindings directly (see the frontend
architecture convention in the top-level `CLAUDE.md`/architecture docs) — UI widgets and the `run` slice
itself never subscribe to Wails events directly, they only read Redux state that the adapter populated.
`agent:error` intentionally reuses the standard `WireError` shape and toast path rather than a
bespoke agent-error UI, so a failed run surfaces the same way any other envelope error would.

## Fixed outcome → ErrorCode mapping

| Outcome | ErrorCode |
|---|---|
| Gate held (another run / TestInference active) | `busy` |
| Configured env-var name unset | `missing_credential` |
| Prompt overflowed the context window | `context_window` |
| Iteration or wall-clock ceiling hit without converging | `agent_limit` |
| User or shutdown cancelled | `cancelled` |
| Tool args invalid / tool failed | `tool_failed` |

This table is the complete, fixed outcome set for a `RunAgent` invocation — every exit path from the loop
(see `references/handler-and-loop.md`) must land on exactly one of these six codes, surfaced through the
standard `apperr.*Result` → `WireError` envelope (`.claude/rules/go-error-envelope.md`), never a bare
`error` or an ad hoc string.

## Citations

DD-49 (streaming + non-streaming fallback), DD-55 (event payload shape), `.claude/rules/
llm-integration.md` (Retries + timeouts owned by the service — DD-48 — feeds `context_window`/
`missing_credential` classification upstream of this table), `.claude/rules/go-error-envelope.md`
(the `WireError`/`apperr.*Result` shape every mapped code flows through).
