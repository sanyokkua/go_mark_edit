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
import { EventsEmit } from '@wailsapp/runtime';

EventsEmit('user:action', 'save');
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
    const cancel = EventsOn('data:updated', handler);
    return cancel;
}, []);

// Wrong — leaks on each mount
useEffect(() => {
    EventsOn('data:updated', handler); // no cleanup!
}, []);
```

---

## Data Typing

Go side: `data ...interface{}` — emit any JSON-serializable value.

TypeScript side: receives `any`. Use type guards or `zod` to validate:

```typescript
EventsOn('file:dropped', (path: unknown) => {
    if (typeof path !== 'string') return;
    handleFilePath(path);
});
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
EventsOn('task:result', (payload: { id: string; status: string; output: string }) => {
    updateTask(payload);
});
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

GoMarkEdit's primary Go→frontend event is **`state:patch`**, emitted by
`internal/appmodel` after **every** model mutation (DD-62/DD-63). It carries only the changed sections of
the authoritative application state (docs metadata, tabs, workspace ref, UI/layout); the adapter applies
it to the Redux projection (hydrated once via the bound `GetState` query). The backend **never** emits
buffer text for the currently focused editor (DD-64) — only derived fields (dirty, counts). Contract:
`docs/architecture.md` (Backend truth and frontend working copy).

## Assistant events

The Assistant is planned but is not implemented in the current application. GoMarkEdit has no `agent:*`
events or LLM event stream. Assistant-specific examples have been removed so this document describes
only shipped event contracts.
