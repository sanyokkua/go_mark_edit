# Event System

## Overview

Events are bidirectional named channels between the Go backend and the TypeScript frontend. Either side can emit or listen. Data payloads are optional and variadic. Event names are arbitrary strings — the convention `"domain:action"` keeps them organized.

```
Go                            Frontend (TS)
runtime.EventsEmit  ────────► EventsOn listener
runtime.EventsOn    ◄──────── EventsEmit
```

**Recommended naming:** `"domain:action"` — e.g. `"file:saved"`, `"data:updated"`, `"user:action"`, `"progress:update"`.

---

## Pattern 1: Frontend Emits → Go Handles

Register the Go listener in `OnStartup` so it's ready before the frontend fires any events.

```go
// Go: register in OnStartup
func (a *App) startup(ctx context.Context) {
    a.ctx = ctx

    runtime.EventsOn(ctx, "user:action", func(data ...interface{}) {
        if len(data) > 0 {
            action, ok := data[0].(string)
            if !ok {
                return
            }
            a.handleUserAction(action)
        }
    })
}
```

```typescript
// TypeScript: emit from frontend
import { EventsEmit } from '@wailsapp/runtime'

EventsEmit("user:action", "save")
```

---

## Pattern 2: Go Emits → Frontend Handles

Go emits from a goroutine; the frontend listens with `EventsOn`.

```go
// Go: emit from a background goroutine
func (a *App) StartProcessing() {
    go func() {
        for i := 0; i <= 100; i += 10 {
            runtime.EventsEmit(a.ctx, "progress:update", i)
            time.Sleep(100 * time.Millisecond)
        }
        runtime.EventsEmit(a.ctx, "progress:complete", "done")
    }()
}
```

```typescript
// TypeScript: listen in a React component
import { EventsOn } from '@wailsapp/runtime'
import { useEffect, useState } from 'react'

function ProgressBar() {
    const [progress, setProgress] = useState(0)

    useEffect(() => {
        const cancelProgress = EventsOn("progress:update", (value: number) => {
            setProgress(value)
        })
        const cancelComplete = EventsOn("progress:complete", () => {
            setProgress(100)
        })
        return () => {
            cancelProgress()
            cancelComplete()
        }
    }, [])

    return <div>{progress}%</div>
}
```

---

## Memory Leak Warning

Always return the cancel function from `useEffect`. Failing to do so leaks listeners that accumulate across component mounts.

```typescript
// Correct — cleanup on unmount
useEffect(() => {
    const cancel = EventsOn("data:updated", handler)
    return cancel
}, [])

// Wrong — leaks on each mount
useEffect(() => {
    EventsOn("data:updated", handler)  // no cleanup!
}, [])
```

---

## Data Typing

Go side: `data ...interface{}` — emit any JSON-serializable value.

TypeScript side: receives `any`. Use type guards or `zod` to validate:

```typescript
EventsOn("file:dropped", (path: unknown) => {
    if (typeof path !== "string") return
    handleFilePath(path)
})
```

For structured payloads, pass a single object:

```go
runtime.EventsEmit(a.ctx, "task:result", map[string]interface{}{
    "id":     taskID,
    "status": "done",
    "output": result,
})
```

```typescript
EventsOn("task:result", (payload: { id: string; status: string; output: string }) => {
    updateTask(payload)
})
```

---

## Goroutine Safety

`runtime.EventsEmit` is safe to call from any goroutine. The Wails event system handles the thread transition internally — no mutex needed around emits.

---

## EventsOnce vs EventsOn

```go
// Fires once, then auto-removes itself
runtime.EventsOnce(ctx, "init:complete", func(data ...interface{}) {
    a.initialized = true
})
```

Useful for one-time handshakes or initialization signals. Equivalent TypeScript: `EventsOnce`.

---

## GoMarkEdit Application-Model Events (`state:patch`)

Before the agent events below: GoMarkEdit's primary Go→frontend event is **`state:patch`**, emitted by
`internal/appmodel` after **every** model mutation (DD-62/DD-63). It carries only the changed sections of
the authoritative application state (docs metadata, tabs, workspace ref, UI/layout); the adapter applies
it to the Redux projection (hydrated once via the bound `GetState` query). The backend **never** emits
buffer text for the currently focused editor (DD-64) — only derived fields (dirty, counts). Contract:
`specification/02_Architecture/02_BACKEND_GO.md#application-model` and `.claude/rules/ts-redux-adapter.md`.

## GoMarkEdit Agent Events

GoMarkEdit has **no chain concept**. Its assistant LLM assistant runs an **agentic tool-call loop**
(`internal/llm/agent/`) whose progress and streamed tokens flow Go→frontend via four events, emitted by
the agent orchestrator via `runtime.EventsEmit`. The bound `RunResult` envelope still returns the final
outcome; events are the incremental channel. Only the frontend `logic/adapter/` subscribes (via
`EventsOn`) and dispatches into the `run` slice (`logic/store/assistant/`) — components never call
`EventsOn` directly. Every payload carries the `runId` from the originating `RunAgentRequest`.

### Event contract

| Event name | Payload shape | When emitted |
|---|---|---|
| `agent:progress` | `{ runId, phase, iteration, tool? }` | Loop advanced; `phase ∈ {infer, tool, final}`; `tool` set when `phase="tool"` |
| `agent:token` | `{ runId, delta }` | Streaming: a chunk of assistant text to append to the transcript |
| `agent:done` | `{ runId, stopReason, transcriptSummary }` | Run finished (incl. a cancelled stop reason) — final event, always emitted |
| `agent:error` | `{ runId, error: WireError }` | Run failed; `error` is the standard sanitized envelope error |

`WireError` shape: `{ code: ErrorCode, message: string, details?: Record<string,string> }`. Because
`agent:error` reuses that exact shape, the adapter's normal `notifyError` toast path handles it with no
special casing.

### Go emission

```go
// internal/llm/agent — emits as the loop advances
type progressPayload struct {
    RunID     string `json:"runId"`
    Phase     string `json:"phase"`     // "infer" | "tool" | "final"
    Iteration int    `json:"iteration"`
    Tool      string `json:"tool,omitempty"`
}

runtime.EventsEmit(ctx, "agent:progress", progressPayload{
    RunID:     runID,
    Phase:     "tool",
    Iteration: i,
    Tool:      call.Name,
})
```

### TypeScript listener (adapter layer)

```typescript
import { EventsOn } from '@wailsapp/runtime'
import { store } from 'logic/store'
import { setProgress, appendToken, setDone, setError } from 'logic/store/assistant/run'

// Subscribed once inside logic/adapter/, tied to the active runId
export function subscribeAgentEvents(runId: string): () => void {
    const cancelProgress = EventsOn('agent:progress', (p) => {
        if (p.runId === runId) store.dispatch(setProgress({ phase: p.phase, iteration: p.iteration, tool: p.tool }))
    })
    const cancelToken = EventsOn('agent:token', (p) => {
        if (p.runId === runId) store.dispatch(appendToken(p.delta))
    })
    const cancelError = EventsOn('agent:error', (p) => {
        if (p.runId === runId) store.dispatch(setError(p.error))
    })
    const cancelDone = EventsOn('agent:done', (p) => {
        if (p.runId !== runId) return
        store.dispatch(setDone({ stopReason: p.stopReason, transcriptSummary: p.transcriptSummary }))
        cancelProgress(); cancelToken(); cancelError(); cancelDone()
    })
    return () => { cancelProgress(); cancelToken(); cancelError(); cancelDone() }
}
```

### Key invariants

- `agent:done` is **always** the last event for a run — a cancelled run also ends with `agent:done`
  (carrying a cancelled `stopReason`), not a bare stop.
- At most **one run is in flight app-wide** (single-flight `internal/gate`); a second `RunAgent` while the
  gate is held returns `apperr.Busy()` synchronously and emits no events.
- Cancellation is via the run's `context.Context` (checked each iteration and before each tool dispatch),
  not a dedicated cancel event; the in-flight run ends with `agent:done`/`agent:error`.
- Event subscriptions live in the adapter, not components. Always return and call the cancel functions so
  listeners don't leak across runs.
