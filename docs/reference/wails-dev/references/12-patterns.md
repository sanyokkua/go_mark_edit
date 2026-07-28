# Common Patterns & Best Practices

---

## 1. Context Storage

Always store the Wails context in `OnStartup`. Never call `runtime.*` before this hook fires.

```go
type App struct {
    ctx context.Context
}

func (a *App) startup(ctx context.Context) {
    a.ctx = ctx
}
```

Wire it:
```go
app := &App{}
wails.Run(&options.App{
    OnStartup: app.startup,
    Bind:      []interface{}{app},
})
```

---

## 2. Layered Architecture & DI

Separate concerns into layers and use a manual DI root to wire them. Bind only the outermost handler/facade layer to Wails — not services, repositories, or internal implementations.

```
Frontend (wailsjs/ bindings)
    ↓
Handler  (ActionHandler, SettingsHandler) ← bind this layer
    ↓
Service  (ActionService, LLMService)
    ↓
Repository / External (SettingsRepository, HTTP client)
```

```go
// In application.go (DI root):
type AppContextHolder struct {
    ctx             context.Context
    ActionHandler   actions.ActionHandlerAPI   // bound
    SettingsHandler settings.SettingsHandlerAPI // bound
    // services and repos are internal — not bound
}

// In main.go:
Bind: []interface{}{app, app.ActionHandler, app.SettingsHandler}
```

This keeps the Wails surface small and makes everything below the handler layer testable without Wails.

---

## 3. Error Handling in Bound Methods

Always return `(T, error)`. Wrap errors with context. Never panic in bound methods — unhandled panics crash the runtime goroutine.

```go
func (h *ActionHandler) ProcessPrompt(ctx context.Context, req Request) (Result, error) {
    result, err := h.service.Process(ctx, req)
    if err != nil {
        return Result{}, fmt.Errorf("ProcessPrompt: %w", err)
    }
    return result, nil
}
```

On the frontend, a returned error becomes a rejected Promise:

```typescript
try {
    const result = await ProcessPrompt(req)
    dispatch(setResult(result))
} catch (err) {
    dispatch(setError(String(err)))
}
```

---

## 4. Goroutines + Events

`runtime.EventsEmit` is safe to call from any goroutine. Use it to push progress or results back to the frontend from background work.

```go
func (a *App) StartLongTask(input string) {
    go func() {
        runtime.EventsEmit(a.ctx, "task:started")
        result, err := a.doHeavyWork(input)
        if err != nil {
            runtime.EventsEmit(a.ctx, "task:error", err.Error())
            return
        }
        runtime.EventsEmit(a.ctx, "task:complete", result)
    }()
}
```

```typescript
useEffect(() => {
    const cancels = [
        EventsOn("task:started",  () => setStatus("running")),
        EventsOn("task:complete", (r) => { setResult(r); setStatus("done") }),
        EventsOn("task:error",    (e) => { setError(e);  setStatus("error") }),
    ]
    return () => cancels.forEach(c => c())
}, [])
```

---

## 5. Generated Model `.createFrom()`

When constructing model instances to pass back to bound Go methods, use the generated `.createFrom()` factory instead of raw object literals. This ensures the correct prototype and any validation Wails adds.

```typescript
import { mypackage } from '../../../wailsjs/go/models'

// Don't do this:
const cfg = { host: "localhost", port: 8080 }

// Do this:
const cfg = mypackage.Config.createFrom({ host: "localhost", port: 8080 })
await SaveConfig(cfg)
```

---

## 6. EnumBind TypeScript Usage

After registering enums with `EnumBind` and running `wails generate module`, import from `models.ts`:

```typescript
import { mypackage } from '../../../wailsjs/go/models'

// Use as a type-safe enum
const priority: mypackage.Priority = mypackage.Priority.High
await SetTaskPriority(priority)

// Compare
if (task.priority === mypackage.Priority.Low) {
    // ...
}
```

---

## 7. Frontend Adapter Layer

Never call `wailsjs/go/` bindings directly from React components or Redux slices. Wrap them in a thin adapter layer. Benefits: mockable in tests, decoupled from Wails internals, one place to add logging/error transforms.

```typescript
// logic/adapter/services.ts
import { ProcessPrompt as _ProcessPrompt } from '../../../wailsjs/go/actions/ActionHandler'
import { IActionHandler } from './interfaces'

export class ActionHandlerAdapter implements IActionHandler {
    async processPrompt(req: PromptRequest): Promise<string> {
        return _ProcessPrompt(req)
    }
}

// In tests, inject a mock:
const mockAdapter: IActionHandler = {
    processPrompt: jest.fn().mockResolvedValue("test result"),
}
```

Redux thunks use the adapter via `thunkAPI.extra`:
```typescript
export const runPrompt = createAsyncThunk(
    'actions/runPrompt',
    async (req, thunkAPI) => {
        const { adapter } = thunkAPI.extra as { adapter: IActionHandler }
        return adapter.processPrompt(req)
    }
)
```

---

## 8. Logging from Frontend

`LogDebug`, `LogInfo`, etc. from `@wailsapp/runtime` route through the Go logger. They appear in the terminal running `wails dev`, alongside backend logs. Use them for unified logging across both sides.

```typescript
import { LogDebug, LogError } from '@wailsapp/runtime'

async function loadSettings() {
    LogDebug("Loading settings")
    try {
        const settings = await GetSettings()
        LogDebug(`Settings loaded: ${settings.provider}`)
        return settings
    } catch (err) {
        LogError(`Failed to load settings: ${err}`)
        throw err
    }
}
```

In production builds, the log level is `WARNING` by default — `LogDebug` calls are no-ops unless `LogLevelProduction` is lowered in `options.App`.
