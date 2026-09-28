---
name: wails-dev
description: >
    Reference for Wails v2 Go desktop application development. Load when working with:
    Wails, wails.json, wails dev, wails build, wails generate module, options.App,
    OnStartup, OnDomReady, OnShutdown, OnBeforeClose, AssetServer, embed.FS,
    Bind, EnumBind, wailsjs/, wailsjs/go/, runtime.EventsEmit, runtime.EventsOn,
    EventsOn, EventsEmit, WindowSetTitle, WindowMaximise, ClipboardGetText,
    BrowserOpenURL, menu.NewMenuFromItems, SingleInstanceLock, DragAndDrop,
    AppModelHandler, state:patch, GetState/UpdateBuffer commands,
    Go desktop app, Go + React desktop, Go frontend binding. Covers lifecycle hooks,
    method binding, Go + TypeScript runtime APIs, event system, menus, platform
    options, asset embedding, testing, and debugging.
---

# Wails v2 Developer Reference

Wails v2 is a framework for building desktop applications using Go for the backend and any web technology (React, Vue, Svelte, etc.) for the frontend. The Go backend is compiled into a native binary; the frontend runs in an embedded WebView. Wails generates a JavaScript/TypeScript binding layer (`wailsjs/`) so the frontend can call Go methods directly as async functions. Communication flows via the Wails runtime — not a WebSocket or HTTP server — making it opaque to the web developer but efficient at runtime.

## Quick-Start Wiring

```go
//go:embed all:frontend/dist
var assets embed.FS

type App struct{ ctx context.Context }

func (a *App) startup(ctx context.Context) { a.ctx = ctx }  // STORE CTX HERE

func main() {
    app := &App{}
    wails.Run(&options.App{
        Title:  "My App",
        Width:  1024,
        Height: 768,
        AssetServer: &assetserver.Options{Assets: assets},
        OnStartup:  app.startup,
        OnDomReady: func(ctx context.Context) { /* DOM ready, safe for UI ops */ },
        OnShutdown: func(ctx context.Context) { /* cleanup */ },
        OnBeforeClose: func(ctx context.Context) bool {
            return false  // return TRUE to CANCEL the close
        },
        Bind: []interface{}{app},
    })
}
```

## The Golden Rule

**`ctx` from `OnStartup` is the only valid context for ALL `runtime.*` calls.**

Store it immediately in the struct. Never call runtime functions before `OnStartup` fires or with a context obtained any other way. Passing `nil` or a plain `context.Background()` will cause a fatal log and crash.

```go
type App struct{ ctx context.Context }
func (a *App) startup(ctx context.Context) { a.ctx = ctx }
```

## Quick-Reference

| Operation              | Go                                                   | TypeScript                       |
| ---------------------- | ---------------------------------------------------- | -------------------------------- |
| Emit event to frontend | `runtime.EventsEmit(a.ctx, "name", data)`            | —                                |
| Listen for event in Go | `runtime.EventsOn(ctx, "name", func(data ...any){})` | —                                |
| Emit event to Go       | —                                                    | `EventsEmit("name", data)`       |
| Listen for event in TS | —                                                    | `EventsOn("name", (data) => {})` |
| Open file dialog       | `runtime.OpenFileDialog(a.ctx, opts)`                | —                                |
| Show message dialog    | `runtime.MessageDialog(a.ctx, opts)`                 | —                                |
| Set window title       | `runtime.WindowSetTitle(a.ctx, "title")`             | `WindowSetTitle("title")`        |
| Maximize window        | `runtime.WindowMaximise(a.ctx)`                      | `WindowMaximise()`               |
| Minimize window        | `runtime.WindowMinimise(a.ctx)`                      | `WindowMinimise()`               |
| Quit app               | `runtime.Quit(a.ctx)`                                | `Quit()`                         |
| Open URL in browser    | `runtime.BrowserOpenURL(a.ctx, url)`                 | `BrowserOpenURL(url)`            |
| Get clipboard          | `runtime.ClipboardGetText(a.ctx)`                    | `ClipboardGetText()`             |
| Set clipboard          | `runtime.ClipboardSetText(a.ctx, text)`              | `ClipboardSetText(text)`         |

## Reference Index

| Topic                                     | Reference File                       |
| ----------------------------------------- | ------------------------------------ |
| App options & lifecycle hooks             | `references/01-app-setup.md`         |
| Go method binding rules                   | `references/02-binding.md`           |
| Go runtime API (complete)                 | `references/03-go-runtime-api.md`    |
| Frontend TypeScript API                   | `references/04-frontend-ts-api.md`   |
| Event system patterns                     | `references/05-event-system.md`      |
| Menu system                               | `references/06-menu-system.md`       |
| Platform options (Mac/Win/Linux)          | `references/07-platform-options.md`  |
| Asset server & embedding                  | `references/08-asset-server.md`      |
| Single instance, drag/drop, context menus | `references/09-advanced-features.md` |
| Testing patterns                          | `references/10-testing.md`           |
| Debugging & tooling                       | `references/11-debugging.md`         |
| Common patterns & best practices          | `references/12-patterns.md`          |

---

## GoMarkEdit Application Notes

These constraints and patterns apply specifically to the **GoMarkEdit** codebase (a native, offline-first
Markdown editor — Go backend + React 19/Vite/TypeScript frontend, Wails v2, CGO-free) on top of the
standard Wails v2 rules above. Backend layering is strict **Handler → Service → Repository**; wiring lives
only in `internal/application` (two-phase `ApplicationContextHolder`, `Init(ctx)`) and `main.go`.

### Backend-authoritative application model (`internal/appmodel`, DD-62/DD-63/DD-64)

The Go backend is the **single source of truth for the live application model** (ADR-0014): open
documents **and their canonical content**, the tab set + active tab, the workspace ref, and all
UI/layout state live in `internal/appmodel`, not in the webview. The bound `AppModelHandler` exposes
exactly three shapes (all standard envelopes):

- **Query** — `GetState()` returns a snapshot the frontend hydrates its Redux **projection** from at
  startup / window-open.
- **Commands** — `OpenDoc`, `CloseTab`, `SetActiveTab`, `ReorderTabs`, `UpdateBuffer` (the debounced
  editor sync), `SetDocView`, `OpenWorkspace`, `SetUILayout`, … mutate `AppState` under its mutex and
  persist the durable subset (window/UI-layout) via `internal/settings`.
- **Events** — after every mutation the service emits **`state:patch`** (`runtime.EventsEmit`) carrying
  only the changed sections; the adapter applies it to the Redux projection.

The visible Monaco buffer is a **working copy**: edits debounce-push to Go via the `UpdateBuffer`
command and are flushed on blur / tab switch / close / save (DD-64). The backend **never echoes buffer
text back into the focused editor** — it emits only derived state (dirty, counts). See
`docs/architecture.md` (Backend truth and frontend working copy).

### No `context.Context` parameter in bound methods

GoMarkEdit handler methods take **no `ctx` parameter**. The `ctx` stored in `OnStartup` is held by the
`ApplicationContextHolder` and passed to inner services internally:

```go
// ✅ GoMarkEdit pattern — no ctx param
func (h *DocsHandler) OpenDocument(req docs.OpenRequest) (res apperr.DocumentResult) {
    doc, err := h.service.Open(h.ctx, req)  // ctx comes from the handler struct
    ...
}

// ❌ Wrong for GoMarkEdit — ctx shows up in the TS binding and confuses the frontend
func (h *DocsHandler) OpenDocument(ctx context.Context, req docs.OpenRequest) (res apperr.DocumentResult) {
```

### Result envelope return pattern

**Never** return `(T, error)` from a bound method. Instead, return a concrete `apperr.*Result`
envelope. The JS Promise always resolves; the frontend checks `res.error` to detect failures. Inner
services keep their `(T, error)` signatures — the envelope is a handler-boundary concern only.

```go
// ✅ GoMarkEdit — envelope; JS always resolves
func (h *DocsHandler) OpenDocument(req docs.OpenRequest) (res apperr.DocumentResult) {
    defer func() {
        if r := recover(); r != nil {
            ae := apperr.Internal(fmt.Errorf("panic: %v", r))
            wire := apperr.ToWire(h.zlog, ae)
            res = apperr.DocumentResult{Error: &wire}
        }
    }()
    doc, err := h.service.Open(h.ctx, req)
    if err != nil {
        wire := apperr.ToWire(h.zlog, err)
        return apperr.DocumentResult{Error: &wire}
    }
    return apperr.DocumentResult{Data: &doc}
}
```

See `references/02-binding.md §GoMarkEdit: Result Envelope Pattern` for full details.

### EnumBind for ErrorCode

GoMarkEdit exposes `apperr.ErrorCode` as a real TypeScript enum in `models.ts` via `EnumBind`:

```go
// main.go
wails.Run(&options.App{
    EnumBind: []interface{}{
        []interface{}{"ErrorCode", apperr.ErrorCode("")},
    },
    ...
})
```

After any change to `apperr.ErrorCode` or **any bound-method signature**, run
`wails generate module` (`just gen`) and commit no drift in `frontend/wailsjs/`. Frontend code
switches on `apperr.ErrorCode.Busy`, `apperr.ErrorCode.Timeout`, `apperr.ErrorCode.Cancelled`, etc. —
never on raw string literals.

### Assistant events and inference

The Assistant is planned but not implemented in the current application. There are no `agent:*`
events, LLM handler, inference gate or provider integration. Do not treat assistant-specific material
in this reference as current GoMarkEdit behavior. The current app-owned event contract is documented
in `references/05-event-system.md`.

### Drag-and-drop via `runtime.OnFileDrop` (native, path-based)

GoMarkEdit uses **Wails' native file-drop**, which delivers **absolute filesystem paths** — not browser
`File` objects. Enable it in `options.App` and register the handler in `OnStartup`; route every dropped
path through the same open-target resolution used for OS opens:

```go
DragAndDrop: &options.DragAndDrop{
    EnableFileDrop:     true,
    DisableWebViewDrop: true,          // suppress the webview's default drop (Linux/WebKitGTK) — DD-59
    CSSDropProperty:    "--wails-drop-target",
    CSSDropValue:       "drop",
},
// ... in OnStartup:
runtime.OnFileDrop(ctx, func(x, y int, paths []string) {
    // Classify paths, then dispatch to the application model; resulting state changes reach
    // the frontend through the state:patch event.
    app.OpenDropped(paths)
})
```

The frontend adapter subscribes to native Wails file-drop events; see
`frontend/src/logic/adapter/events.ts` and `frontend/src/app/useDropHandler.ts`.

### Window / UI-layout persistence (write-through-on-change)

Window geometry (`window.*`) and application UI-layout state (`ui.*` — sidebar visibility/width and
view arrangement; assistant layout fields are reserved for future use) are persisted in the generic
`settings(key,value,type)` KV table and
**written through on each change** (DD-60/DD-61), then restored during the `Init(ctx)`
`restoreWindowState` step (falling back to `options.App` defaults when a value is absent). No migration
is needed to add a layout key.

### No-CGO SQLite constraint

GoMarkEdit uses `modernc.org/sqlite` — a pure-Go, CGO-free SQLite driver — opened with WAL +
`busy_timeout` so **multiple app instances** share the DB safely (**no single-instance flock**, DD-08).
Never substitute `github.com/mattn/go-sqlite3` or any other CGO driver: CGO breaks `wails build`
cross-compilation. Migrations are **additive-only** (goose); the sqlc-generated `internal/db/store/` is
**never hand-edited**.

```go
import _ "modernc.org/sqlite"
db, err := sql.Open("sqlite", dsn) // dsn: file:...?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)
```
